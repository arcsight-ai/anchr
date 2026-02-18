/**
 * anchr CLI (Prompt 7 — Production Safe). Never crashes; degrades gracefully.
 * Answers: "What should I fix before committing?"
 */

import { execSync } from "child_process";
import * as fs from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const REPORT_PATH = process.env.ANCHR_REPORT_PATH ?? "artifacts/anchr-report.json";
const TIMEOUT_MS = 8000;
const LARGE_CHANGE_THRESHOLD = 120;
const MAX_FILES = 400;

function safeExec(cmd: string): string | null {
  try {
    const out = execSync(cmd, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
      maxBuffer: 1024 * 1024,
    });
    return typeof out === "string" ? out.trim() : null;
  } catch {
    return null;
  }
}

function ensureRepo(): void {
  if (!safeExec("git rev-parse --is-inside-work-tree")) {
    console.log("anchr: not inside a git repository");
    process.exit(0);
  }
  if (!safeExec("git rev-parse HEAD")) {
    console.log("anchr: repository has no commits yet");
    process.exit(0);
  }
}

function getDefaultBranch(): string {
  const ref = safeExec("git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null");
  if (ref) {
    const parts = ref.split("/");
    if (parts.length > 0) return parts[parts.length - 1]!;
  }
  const show = safeExec("git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d' ' -f5");
  if (show) return show;
  return "main";
}

function getArgs(): string[] {
  return process.argv.slice(2);
}

function getMode(args: string[]): "staged" | "branch" {
  return args.includes("--all") ? "branch" : "staged";
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function getFlagValue(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && i < args.length - 1 ? args[i + 1]! : null;
}

function getRefs(args: string[], mode: "staged" | "branch"): { base: string; head: string } | null {
  const explicitBase = getFlagValue(args, "--base");
  const explicitHead = getFlagValue(args, "--head");
  if (explicitBase && explicitHead) {
    const b = safeExec(`git rev-parse ${explicitBase}`);
    const h = safeExec(`git rev-parse ${explicitHead}`);
    if (b && h) return { base: b, head: h };
  }

  const ciBase = process.env.GITHUB_BASE_SHA ?? process.env.BASE_SHA;
  const ciHead = process.env.HEAD_SHA ?? process.env.GITHUB_HEAD_SHA ?? process.env.GITHUB_SHA;
  if (ciBase && ciHead) return { base: ciBase, head: ciHead };

  const headRev = safeExec("git rev-parse HEAD");
  if (!headRev) return null;

  if (mode === "staged") {
    return { base: headRev, head: headRev };
  }

  const defaultBranch = getDefaultBranch();
  const baseRev = safeExec(`git merge-base ${defaultBranch} HEAD`);
  if (baseRev) return { base: baseRev, head: headRev };

  const headMinus = safeExec("git rev-parse HEAD~1");
  if (headMinus) return { base: headMinus, head: headRev };

  return { base: headRev, head: headRev };
}

function normalize(p: string): string {
  return p.replace(/\\/g, "/");
}

interface DiffEntry {
  status: string;
  path: string;
}

function collectFilesStaged(): DiffEntry[] {
  const out = safeExec("git diff --cached --name-status");
  if (!out) return [];
  const entries: DiffEntry[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^([ADMR])\s+(.+?)(?:\s+(.+))?$/);
    if (!m) continue;
    const status = m[1]!;
    const path = normalize((status === "R" && m[3] ? m[3] : m[2]) ?? m[2]!);
    if (!path.endsWith(".ts") && !path.endsWith(".tsx")) continue;
    entries.push({ status: status === "R" ? "M" : status, path });
  }
  return entries;
}

function collectFilesBranch(base: string, head: string): DiffEntry[] {
  const out = safeExec(`git diff --name-status ${base} ${head}`);
  if (!out) return [];
  const entries: DiffEntry[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^([ADMR])\s+(.+?)(?:\s+(.+))?$/);
    if (!m) continue;
    const status = m[1]!;
    const path = normalize((status === "R" && m[3] ? m[3] : m[2]) ?? m[2]!);
    if (!path.endsWith(".ts") && !path.endsWith(".tsx")) continue;
    entries.push({ status: status === "R" ? "M" : status, path });
  }
  return entries;
}

function readFile(path: string, cwd: string): string | null {
  const gitShow = safeExec(`git show ":${path}"`);
  if (gitShow !== null) return gitShow;
  try {
    const full = resolve(cwd, path);
    return fs.readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

function runStructuralAuditWithTimeout(
  cwd: string,
  base: string,
  head: string,
  staged: boolean,
): Record<string, unknown> {
  const scriptPath = resolve(cwd, "scripts/anchr-structural-audit.ts");
  const env = {
    ...process.env,
    GITHUB_BASE_SHA: base,
    HEAD_SHA: head,
    ANCHR_STAGED: staged ? "1" : "",
  };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = spawnSync("npx", ["tsx", scriptPath], {
      cwd,
      stdio: "pipe",
      env,
      encoding: "utf8",
      timeout: TIMEOUT_MS + 500,
    });
    clearTimeout(t);
    const raw = readJson(join(cwd, REPORT_PATH));
    return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  } catch {
    clearTimeout(t);
    return {
      status: "INCOMPLETE",
      decision: { level: "warn", reason: "analysis_timeout" },
      minimalCut: [],
    };
  }
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function runCertifier(_fast: Record<string, unknown>): Promise<Record<string, unknown>> {
  return _fast;
}

async function main(): Promise<void> {
  ensureRepo();
  const args = getArgs();
  const mode = getMode(args);
  const refs = getRefs(args, mode);
  if (!refs) {
    console.log("anchr: could not resolve base/head");
    process.exit(0);
  }

  const cwd = process.cwd();

  let files: DiffEntry[];
  if (mode === "staged") {
    files = collectFilesStaged();
  } else {
    files = collectFilesBranch(refs.base, refs.head);
  }

  if (files.length > MAX_FILES) {
    console.log("anchr: change too large to analyze safely");
    process.exit(0);
  }
  if (files.length > LARGE_CHANGE_THRESHOLD && mode === "staged") {
    console.log("anchr: large change — switching to full branch analysis");
    files = collectFilesBranch(refs.base, refs.head);
    if (files.length > MAX_FILES) {
      console.log("anchr: change too large to analyze safely");
      process.exit(0);
    }
  }
  if (files.length === 0) {
    console.log("anchr: no relevant TypeScript changes");
    process.exit(0);
  }

  const fast = runStructuralAuditWithTimeout(cwd, refs.base, refs.head, mode === "staged");
  const fastStatus = (fast.status as string) ?? "INCOMPLETE";
  const fastLevel = (fast.decision as { level?: string })?.level ?? "warn";

  let report: Record<string, unknown>;
  if (fastStatus === "UNSAFE" && fastLevel === "block") {
    report = fast;
  } else if (fastStatus === "VERIFIED") {
    report = fast;
  } else {
    report = (await runCertifier(fast)) as Record<string, unknown>;
  }

  const isJson = hasFlag(args, "--json");
  const isStrict = hasFlag(args, "--strict");
  const isTTY = process.stdout.isTTY;

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.decision && (report.decision as { level?: string }).level === "block" ? 1 : 0;
    return;
  }

  const decisionLevel = (report.decision as { level?: string })?.level ?? "warn";
  const minimalCut = (report.minimalCut as string[]) ?? [];

  if (!isTTY) {
    if (decisionLevel === "block") console.log("BLOCK");
    else if (decisionLevel === "warn") console.log("WARN");
    else console.log("VERIFIED");
    process.exitCode = decisionLevel === "block" ? 1 : decisionLevel === "warn" && isStrict ? 2 : 0;
    return;
  }

  console.log(`anchr analyzed ${files.length} files against ${refs.base.slice(0, 7)}`);
  console.log("");

  if (decisionLevel === "allow" || (decisionLevel !== "block" && decisionLevel !== "warn")) {
    console.log("Safe change");
    console.log("No architectural boundaries affected.");
    console.log("");
    console.log("You can commit.");
    console.log("");
    console.log("Next: git commit");
    process.exitCode = 0;
    return;
  }

  if (decisionLevel === "block") {
    console.log("Architectural violation detected");
    console.log("");
    const lines: string[] = [];
    for (const cut of minimalCut.slice(0, 12)) {
      const parts = cut.split(":");
      const file = parts[0] ?? cut;
      const rest = parts.slice(1).join(":");
      lines.push(`File: ${file}`);
      if (rest) lines.push(`Imports: ${rest}`);
      lines.push("Why: crosses module boundary");
      lines.push("");
    }
    if (lines.length > 0) console.log(lines.join("\n"));
    console.log("Fix:");
    console.log("Expose via public API");
    console.log("OR move logic");
    process.exitCode = 1;
    return;
  }

  console.log("Cannot prove safety");
  console.log("");
  console.log("The change may affect architecture but certainty is insufficient.");
  console.log("");
  console.log("Run:");
  console.log("  anchr --strict");
  process.exitCode = isStrict ? 2 : 0;
}

void main().catch((err: unknown) => {
  console.error("anchr: internal error");
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 0;
});
