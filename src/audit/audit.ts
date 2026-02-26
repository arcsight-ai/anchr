/**
 * Audit pipeline: dependency detection + runtime structural signals,
 * merged into a single violations list before classification.
 * Does not change CLI, schema, or rendering.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { canonicalPath } from "../structural/canonicalPath.js";
import { detectViolations } from "../structural/violations.js";
import type { Proof, Violation, ViolationKind } from "../structural/types.js";
import type { IFileSystem } from "../virtual/virtualFs.js";
import { runRuntimeSignals, type RuntimeSignalKind } from "../detection/runtime-signals.js";

function runtimeSignalKindToViolationKind(k: RuntimeSignalKind): ViolationKind {
  return "boundary_violation";
}

const PKG_SRC_RE = /^packages\/([^/]+)\/src\//;

function getPackageFromPath(repoRoot: string, absPath: string): string {
  const norm = absPath.replace(/\\/g, "/");
  const rootNorm = repoRoot.replace(/\\/g, "/");
  const rel = norm.startsWith(rootNorm) ? norm.slice(rootNorm.length).replace(/^\//, "") : norm;
  const m = rel.match(PKG_SRC_RE);
  return m ? m[1]! : "root";
}

function runtimeSignalToViolation(
  repoRoot: string,
  signal: { kind: ViolationKind; evidence: string[]; filePath: string },
): Violation {
  const absRoot = resolve(repoRoot);
  const canPath = canonicalPath(signal.filePath, absRoot);
  const pkg = getPackageFromPath(repoRoot, signal.filePath);
  const proof: Proof = {
    type: "runtime_signal",
    source: signal.filePath,
    target: signal.evidence.join("; "),
    rule: signal.kind,
  };
  return {
    package: pkg,
    path: canPath,
    cause: signal.kind,
    proof,
  };
}

export interface AuditInput {
  repoRoot: string;
  diffEntries: { status: string; path: string }[];
  pkgDirByName: Map<string, string>;
  publicFiles: Map<string, Set<string>>;
  baseSha: string;
  fileSystem?: IFileSystem;
}

/**
 * Run dependency detection, then runtime signals; merge into one violations list.
 */
export function runAudit(input: AuditInput): Violation[] {
  const { repoRoot, diffEntries, pkgDirByName, publicFiles, baseSha, fileSystem } = input;
  const absRoot = resolve(repoRoot);

  const dependencyViolations = detectViolations(
    repoRoot,
    diffEntries,
    pkgDirByName,
    publicFiles,
    baseSha,
    fileSystem,
  );

  const readFile = (path: string): string | null => {
    try {
      if (fileSystem) return fileSystem.readFile(path) ?? null;
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  };

  const diffPaths = diffEntries
    .filter((e) => e.status !== "D" && (e.path.endsWith(".ts") || e.path.endsWith(".tsx")))
    .map((e) => ({ path: e.path }));

  const signals = runRuntimeSignals({
    repoRoot: absRoot,
    diffEntries: diffPaths,
    readFile,
  });

  const runtimeViolations: Violation[] = signals.map((s) =>
    runtimeSignalToViolation(repoRoot, {
      kind: runtimeSignalKindToViolationKind(s.kind),
      evidence: s.evidence,
      filePath: s.filePath,
    }),
  );

  const merged = [...dependencyViolations, ...runtimeViolations].sort((a, b) => {
    const ka = `${a.package}\t${a.path}\t${a.cause}`;
    const kb = `${b.package}\t${b.path}\t${b.cause}`;
    return ka.localeCompare(kb, "en");
  });

  return merged;
}
