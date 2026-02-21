/**
 * Local ArcSight explain <file> — CI-accurate preview.
 * Change-aware by default; confidence + deduplicated violations.
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";
import { execSync } from "child_process";

import { buildSemanticSurface } from "./semantic-public-resolver.js";
import { summarizeIntent } from "./intent-summary.js";

export type Level = "allow" | "warn" | "block";
export type Confidence = "exact" | "likely" | "heuristic" | "uncertain";

export type Result = { level: Level; confidence: Confidence };

function safeExec(cmd: string): string | null {
  try {
    return execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      maxBuffer: 1024 * 1024,
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function changedLines(file: string): Set<number> {
  try {
    const base = safeExec("git merge-base HEAD origin/main");
    if (!base) return new Set();
    const diff = safeExec(`git diff -U0 ${base} -- "${file}"`);
    if (!diff) return new Set();
    const lines = new Set<number>();
    diff.split("\n").forEach((l) => {
      const m = l.match(/^@@ .* \+(\d+)(?:,(\d+))? @@/);
      if (m) {
        const start = Number(m[1]);
        const count = Number(m[2] ?? 1);
        for (let i = 0; i < count; i++) lines.add(start + i);
      }
    });
    return lines;
  } catch {
    return new Set();
  }
}

function pkgOf(file: string): string | null {
  const parts = file.split(path.sep);
  const i = parts.indexOf("packages");
  return i >= 0 ? parts[i + 1] ?? null : null;
}

function targetPkg(spec: string): string | null {
  const m = spec.match(/^@market-os\/([^/]+)/);
  return m ? m[1] : null;
}

function resolveImportToPath(importerPath: string, spec: string): string | null {
  if (spec.startsWith(".")) {
    const base = path.resolve(path.dirname(importerPath), spec);
    const candidates = [
      base + ".ts",
      base + ".tsx",
      base + path.sep + "index.ts",
      base + path.sep + "index.tsx",
    ];
    const found = candidates.find((f) => fs.existsSync(f));
    return found ? path.normalize(path.resolve(found)) : null;
  }
  const m = spec.match(/^@market-os\/([^/]+)\/(.*)$/);
  if (m) {
    const sub = (m[2] ?? "").replace(/\.(ts|tsx)$/, "");
    const base = path.join("packages", m[1], sub);
    const candidates = [
      base + ".ts",
      base + ".tsx",
      base + path.sep + "index.ts",
      base + path.sep + "index.tsx",
    ];
    const found = candidates.find((f) => fs.existsSync(f));
    return found ? path.normalize(path.resolve(found)) : null;
  }
  return null;
}

type ViolationEntry = {
  level: Level;
  lines: number[];
  msg: string;
  fix?: string;
  cause: string;
};

export async function explainFile(
  file: string,
  opts: { full?: boolean },
): Promise<Result> {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) {
    console.error("anchr explain: file not found:", file);
    return { level: "allow", confidence: "heuristic" };
  }

  const src = fs.readFileSync(resolved, "utf8");
  const sf = ts.createSourceFile(resolved, src, ts.ScriptTarget.Latest, true);
  const fromPkg = pkgOf(resolved);

  if (!fromPkg) {
    console.log("Outside package scope — ANCHR not applicable");
    return { level: "allow", confidence: "heuristic" };
  }

  const changed = opts.full ? null : changedLines(resolved);
  const violations = new Map<string, ViolationEntry>();
  let confidence: Confidence = changed != null ? "exact" : "likely";

  function record(
    key: string,
    level: Level,
    line: number,
    msg: string,
    fix: string | undefined,
    cause: string,
  ): void {
    let v = violations.get(key);
    if (!v) {
      v = { level, lines: [], msg, fix, cause };
      violations.set(key, v);
    }
    v.lines.push(line);
  }

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const spec = node.moduleSpecifier.text;
      const line =
        sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

      if (changed != null && !changed.has(line)) return;

      const isType = node.importClause?.isTypeOnly ?? false;
      const tgt = targetPkg(spec);

      if (spec.match(/\/(src|internal|private)\//)) {
        let fix: string | undefined;
        const resolvedPath = resolveImportToPath(resolved, spec);
        if (tgt && node.importClause) {
          const surface = buildSemanticSurface(tgt);
          const imported =
            node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
              ? node.importClause.namedBindings.elements.map((e: ts.ImportSpecifier) => e.name.text)
              : node.importClause.name
                ? [node.importClause.name.text]
                : [];
          const matches =
            resolvedPath != null
              ? imported.filter((sym) => {
                  const info = surface.get(sym);
                  return info != null && path.normalize(info.sourceFile) === resolvedPath;
                })
              : [];
          if (matches.length === imported.length && matches.length > 0) {
            const first = surface.get(matches[0]!);
            fix = first
              ? `Replace with: import { ${matches.join(", ")} } from '${first.publicPath}'`
              : undefined;
          } else {
            confidence = "uncertain";
          }
        }
        if (!fix) {
          const entry = tgt ? `@market-os/${tgt}` : null;
          fix = entry ? `Import from ${entry}` : "Expose symbol via package index.ts";
        }
        record(
          spec,
          "block",
          line,
          "Private package boundary crossed",
          fix,
          "boundary_violation",
        );
      }

      if (isType && spec.match(/\/(internal|private)\//)) {
        record(
          spec + ":type",
          "warn",
          line,
          "Type crosses private boundary",
          undefined,
          "type_import_private_target",
        );
      }

      if (spec.startsWith("../") && !spec.includes(fromPkg)) {
        record(
          spec + ":rel",
          "block",
          line,
          "Relative import escapes package",
          undefined,
          "relative_escape",
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);

  let level: Level = "allow";
  for (const v of violations.values()) {
    if (v.level === "block") level = "block";
    else if (v.level === "warn" && level !== "block") level = "warn";
  }

  if (confidence === "uncertain" && level === "block") {
    level = "warn";
  }

  console.log("\nANCHR Architectural Prediction\n");
  console.log("Decision: " + level.toUpperCase());
  console.log("Confidence: " + confidence + "\n");

  if (violations.size > 0) {
    const intent = summarizeIntent([...violations.values()]);
    console.log("Why this failed:");
    console.log(intent + "\n");
  }

  for (const v of violations.values()) {
    console.log("Issue: " + v.msg);
    console.log("Lines: " + v.lines.join(", "));
    console.log("Suggested fix: " + (v.fix ?? "(no safe automatic repair)"));
    console.log("");
  }

  return { level, confidence };
}
