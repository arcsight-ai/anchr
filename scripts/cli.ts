/**
 * anchr CLI (Prompt 7 — Production Safe). Never crashes; degrades gracefully.
 * Answers: "What should I fix before committing?"
 */

import { execSync } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
import type { Proof, ViolationKind } from "../src/structural/types.js";

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

export interface RunAnalysisOpts {
  refs: { base: string; head: string };
  mode: "staged" | "branch";
  isStrict: boolean;
}

export interface RunAnalysisResult {
  reportPath: string;
  exitCode: number;
  report: Record<string, unknown> | null;
  filesCount: number;
  refs: { base: string; head: string };
  noReportReason?: "no_files" | "too_large";
}

/**
 * Shared execution pipeline: run analysis once, write report (via spawned script).
 * Used by both audit and foresee. Foresee must only read this report; no recompute.
 */
export function runAnalysisAndWriteReport(
  cwd: string,
  opts: RunAnalysisOpts
): RunAnalysisResult {
  const { refs, mode, isStrict } = opts;
  const reportPath = join(cwd, REPORT_PATH);

  let files: DiffEntry[];
  if (mode === "staged") {
    files = collectFilesStaged();
  } else {
    files = collectFilesBranch(refs.base, refs.head);
  }

  const minimalReport = (reason: "no_files" | "too_large"): Record<string, unknown> => ({
    status: reason === "no_files" ? "VERIFIED" : "INCOMPLETE",
    decision: { level: reason === "no_files" ? "allow" : "warn", reason: reason },
    classification: { primaryCause: null },
    minimalCut: [],
    scope: { mode: mode === "staged" ? "structural-audit" : "structural-fast-path" },
    confidence: { coverageRatio: reason === "no_files" ? 1 : 0 },
    run: { id: "minimal" },
    baseSha: refs.base,
    headSha: refs.head,
  });

  if (files.length > MAX_FILES) {
    try {
      const dir = join(reportPath, "..");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(minimalReport("too_large")) + "\n", "utf8");
    } catch {
      // ignore
    }
    return {
      reportPath,
      exitCode: 0,
      report: minimalReport("too_large"),
      filesCount: files.length,
      refs,
      noReportReason: "too_large",
    };
  }
  if (files.length > LARGE_CHANGE_THRESHOLD && mode === "staged") {
    files = collectFilesBranch(refs.base, refs.head);
    if (files.length > MAX_FILES) {
      try {
        const dir = join(reportPath, "..");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(minimalReport("too_large")) + "\n", "utf8");
      } catch {
        // ignore
      }
      return {
        reportPath,
        exitCode: 0,
        report: minimalReport("too_large"),
        filesCount: files.length,
        refs,
        noReportReason: "too_large",
      };
    }
  }
  if (files.length === 0) {
    try {
      const dir = join(reportPath, "..");
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(reportPath, JSON.stringify(minimalReport("no_files")) + "\n", "utf8");
    } catch {
      // ignore
    }
    return {
      reportPath,
      exitCode: 0,
      report: minimalReport("no_files"),
      filesCount: 0,
      refs,
      noReportReason: "no_files",
    };
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
    report = runCertifierSync(fast);
  }

  const decisionLevel = (report.decision as { level?: string })?.level ?? "warn";
  const exitCode =
    decisionLevel === "block" ? 1 : decisionLevel === "warn" && isStrict ? 2 : 0;

  return {
    reportPath,
    exitCode,
    report,
    filesCount: files.length,
    refs,
  };
}

function runCertifierSync(fast: Record<string, unknown>): Record<string, unknown> {
  return fast;
}

async function runCertifier(_fast: Record<string, unknown>): Promise<Record<string, unknown>> {
  return _fast;
}

async function main(): Promise<void> {
  const args = getArgs();
  if (args[0] === "--help" || args[0] === "-h") {
    console.log("anchr audit   — machine-readable certification result");
    console.log("anchr foresee — human-readable predicted impact (Aftermath narrated by Dina)");
    process.exit(0);
  }
  if (args[0] === "share") {
    const { runShare } = await import("../src/cli/share.js");
    runShare(process.cwd());
    process.exit(0);
  }
  if (args[0] === "install") {
    const scriptPath = join(__dirname, "anchr-install.ts");
    const r = spawnSync(process.execPath, ["npx", "tsx", scriptPath], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    process.exit(r.status ?? 0);
  }
  if (args[0] === "uninstall") {
    const scriptPath = join(__dirname, "anchr-uninstall.ts");
    const r = spawnSync(process.execPath, ["npx", "tsx", scriptPath], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    process.exit(r.status ?? 0);
  }
  ensureRepo();

  if (args[0] === "foresee") {
    const mode = getMode(args);
    const refs = getRefs(args, mode);
    if (!refs) {
      console.log("anchr: could not resolve base/head");
      process.exit(0);
    }
    const cwd = process.cwd();
    const result = runAnalysisAndWriteReport(cwd, {
      refs,
      mode,
      isStrict: hasFlag(args, "--strict"),
    });
    if (result.report == null) {
      console.log("Aftermath unavailable: certification report missing.");
      process.exit(result.exitCode);
    }
    const content1 = fs.readFileSync(result.reportPath, "utf8");
    const hash1 = createHash("sha256").update(content1).digest("hex");
    const { renderAftermath } = await import("../src/cli/foresee.js");
    const output = renderAftermath(result.report);
    const content2 = fs.readFileSync(result.reportPath, "utf8");
    const hash2 = createHash("sha256").update(content2).digest("hex");
    if (hash1 !== hash2) {
      console.error("anchr foresee: report changed during render; aborting.");
      process.exit(1);
    }
    console.log(output);
    process.exit(result.exitCode);
  }

  if (args[0] === "check") {
    const checkArgs = args.slice(1);
    const hasDeep = checkArgs.includes("--deep");
    const hasVerbose = checkArgs.includes("--verbose");
    const refs = getRefs(args, "branch");
    if (!refs) {
      console.error("anchr check: could not resolve base/head");
      process.exit(1);
    }
    const cwd = process.cwd();
    const files = collectFilesBranch(refs.base, refs.head);
    if (files.length > MAX_FILES) {
      console.error("anchr check: change too large to analyze safely");
      process.exit(1);
    }
    if (files.length === 0) {
      console.log("RESULT: ALLOW");
      console.log("Confidence: PROVEN_SAFE");
      console.log("");
      console.log("No architectural impact detected.");
      process.exit(0);
    }
    runStructuralAuditWithTimeout(cwd, refs.base, refs.head, false);
    const raw = readJson(join(cwd, REPORT_PATH));
    const report =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {
            status: "INCOMPLETE",
            decision: { level: "warn", reason: "no_report" },
            proofs: [],
            minimalCut: [],
          };
    if (hasDeep) {
      const status = (report.status as string) ?? "INCOMPLETE";
      if (status === "INDETERMINATE" || status === "INCOMPLETE") {
        await runCertifier(report as Record<string, unknown>);
        const raw2 = readJson(join(cwd, REPORT_PATH));
        if (raw2 && typeof raw2 === "object") {
          Object.assign(report, raw2);
        }
      }
    }
    const { getRepoRoot } = await import("../src/structural/git.js");
    const { formatCheckOutput, resultAndConfidence } = await import("../src/check/index.js");
    const repoRoot = getRepoRoot();
    const repoRootOrCwd = repoRoot ?? cwd;
    const input = {
      status: (report.status as string) ?? "INCOMPLETE",
      decision: (report.decision as { level: string; reason: string }) ?? {
        level: "warn",
        reason: "",
      },
      proofs: (report.proofs as Proof[] | undefined) ?? undefined,
      minimalCut: (report.minimalCut as string[]) ?? [],
    };
    const { result } = resultAndConfidence(input);
    const lines = formatCheckOutput(input, repoRootOrCwd, hasVerbose);
    for (const line of lines) console.log(line);
    if (result === "ALLOW") process.exit(0);
    if (result === "BLOCK") process.exit(2);
    if (result === "UNCERTAIN") process.exit(3);
    process.exit(1);
  }

  if (args[0] === "fix") {
    const cwd = process.cwd();
    const reportPath = join(cwd, REPORT_PATH);
    let raw: unknown = null;
    try {
      if (!fs.existsSync(reportPath)) {
        console.error("No ArcSight report found. Run anchr check first.");
        process.exit(2);
      }
      raw = readJson(reportPath);
    } catch {
      raw = null;
    }
    if (!raw || typeof raw !== "object") {
      console.error("No ArcSight report found. Run anchr check first.");
      process.exit(2);
    }
    const report = raw as Record<string, unknown>;
    const { getRepoRoot } = await import("../src/structural/git.js");
    const { buildFixPlan, formatFixOutput } = await import("../src/fix/index.js");
    const repoRoot = getRepoRoot();
    const repoRootOrCwd = repoRoot ?? cwd;
    const input = {
      status: (report.status as string) ?? "INCOMPLETE",
      proofs: (report.proofs as Proof[] | undefined) ?? undefined,
      minimalCut: (report.minimalCut as string[]) ?? [],
      baseSha: (report.baseSha as string) ?? "",
      headSha: (report.headSha as string) ?? "",
      classification: (report.classification as { primaryCause: ViolationKind | null } | undefined) ?? {
        primaryCause: null,
      },
    };
    const result = buildFixPlan(input, repoRootOrCwd);
    const lines = formatFixOutput(result);
    for (const line of lines) console.log(line);
    if (result.status === "stale_analysis") process.exit(3);
    process.exit(0);
  }

  if (args[0] === "repair") {
    const cwd = process.cwd();
    const reportPath = join(cwd, REPORT_PATH);
    let raw: unknown = null;
    try {
      raw = readJson(reportPath);
    } catch {
      raw = null;
    }
    if (!raw || typeof raw !== "object") {
      console.error("anchr repair: no report. Run anchr check first.");
      process.exit(2);
    }
    const report = raw as Record<string, unknown>;
    const { getRepoRoot } = await import("../src/structural/git.js");
    const { runRepairSimulation } = await import("../src/repair/runRepairSimulation.js");
    const repoRoot = getRepoRoot();
    const repoRootOrCwd = repoRoot ?? cwd;
    const result = runRepairSimulation({
      report: {
        status: (report.status as string) ?? "INCOMPLETE",
        proofs: report.proofs as undefined | Array<{ source: string; target: string; rule: string }>,
        minimalCut: (report.minimalCut as string[]) ?? [],
        baseSha: (report.baseSha as string) ?? "",
        headSha: (report.headSha as string) ?? "",
      },
      repoRoot: repoRootOrCwd,
    });
    const isJson = args.includes("--json");
    const isExplain = args.includes("--explain");
    if (isJson) {
      console.log(JSON.stringify({
        decision: result.decision,
        minimal: result.minimal,
        filesChanged: result.filesChanged,
        semanticEqual: result.semanticEqual,
        runtimeEqual: result.runtimeEqual,
        evaluationOrderEqual: result.evaluationOrderEqual,
        baselineDiagnosticHash: result.baselineDiagnosticHash,
        fixedDiagnosticHash: result.fixedDiagnosticHash,
        semanticHashBaseline: result.semanticHashBaseline,
        semanticHashFixed: result.semanticHashFixed,
        runtimeHashBaseline: result.runtimeHashBaseline,
        runtimeHashFixed: result.runtimeHashFixed,
        evaluationHashBaseline: result.evaluationHashBaseline,
        evaluationHashFixed: result.evaluationHashFixed,
        overlayFileCount: result.overlayFileCount,
      }, null, 2));
    } else if (isExplain) {
      console.log("ArcSight Repair Simulation");
      console.log("──────────────────────────");
      if (result.violationSummary) console.log("Violation:", result.violationSummary);
      console.log("Proposed repair: Rewrite import to public API");
      console.log("");
      console.log("Architecture:", result.decision === "fix_proven_safe" || result.decision === "fix_insufficient" ? "✔ Fixed" : "✗");
      console.log("Types:", result.semanticEqual ? "✔ Preserved" : "✗");
      console.log("Runtime resolution:", result.runtimeEqual ? "✔ Preserved" : "✗");
      console.log("Execution order:", result.evaluationOrderEqual ? "✔ Preserved" : "✗");
      console.log("Minimal change:", result.minimal ? "yes" : "no");
      console.log("Files touched:", result.filesChanged);
    } else {
      console.log("ArcSight Repair Simulation");
      console.log("──────────────────────────");
      if (result.violationSummary) console.log("Violation:", result.violationSummary);
      console.log("Proposed repair: Rewrite import to public API");
      console.log("");
      console.log("Architecture:", result.decision === "fix_proven_safe" || result.decision === "fix_insufficient" ? "✔ Fixed" : "✗");
      console.log("Types:", result.semanticEqual ? "✔ Preserved" : "✗");
      console.log("Runtime resolution:", result.runtimeEqual ? "✔ Preserved" : "✗");
      console.log("Execution order:", result.evaluationOrderEqual ? "✔ Preserved" : "✗");
      console.log("Minimal change:", result.minimal ? "yes" : "no");
      console.log("Files touched:", result.filesChanged);
    }
    if (result.decision === "fix_proven_safe") process.exit(0);
    if (result.decision === "repair_impossible") process.exit(2);
    if (result.decision === "fix_behavior_changed") process.exit(3);
    if (result.decision === "fix_runtime_changed") process.exit(4);
    if (result.decision === "fix_evaluation_order_changed") process.exit(5);
    process.exit(1);
  }

  if (args[0] === "explain") {
    const cwd = process.cwd();
    const reportPath = join(cwd, REPORT_PATH);
    let raw: unknown = null;
    try {
      raw = readJson(reportPath);
    } catch {
      raw = null;
    }
    const report =
      raw && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {
            status: "INDETERMINATE",
            decision: { level: "warn", reason: "no_report" },
            classification: { primaryCause: null },
            proofs: [],
            minimalCut: [],
          };
    const { getRepoRoot } = await import("../src/structural/git.js");
    const { formatExplainOutput } = await import("../src/explain/index.js");
    const repoRoot = getRepoRoot();
    const repoRootOrCwd = repoRoot ?? cwd;
    const input = {
      status: (report.status as string) ?? "INDETERMINATE",
      decision: (report.decision as { level: string; reason: string }) ?? {
        level: "warn",
        reason: "",
      },
      classification: (report.classification as { primaryCause: ViolationKind | null } | undefined) ?? {
        primaryCause: null,
      },
      proofs: (report.proofs as Proof[] | undefined) ?? undefined,
      minimalCut: (report.minimalCut as string[]) ?? [],
    };
    const { lines, structured } = formatExplainOutput(input, repoRootOrCwd);
    for (const line of lines) console.log(line);
    const result = structured.result;
    if (result === "UNCERTAIN") process.exit(3);
    if (result === "ALLOW" || result === "BLOCK") process.exit(0);
    process.exit(1);
  }

  const mode = getMode(args);
  const refs = getRefs(args, mode);
  if (!refs) {
    console.log("anchr: could not resolve base/head");
    process.exit(0);
  }

  const cwd = process.cwd();
  const result = runAnalysisAndWriteReport(cwd, {
    refs,
    mode,
    isStrict: hasFlag(args, "--strict"),
  });

  if (result.noReportReason === "no_files") {
    console.log("anchr: no relevant TypeScript changes");
    process.exit(0);
  }
  if (result.noReportReason === "too_large") {
    console.log("anchr: change too large to analyze safely");
    process.exit(0);
  }

  const report = result.report as Record<string, unknown>;
  const filesCount = result.filesCount;
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

  const { formatLaw } = await import("../src/formatters/law.js");
  const law = formatLaw(report as import("../src/formatters/law.js").ArcSightReportLike);
  console.log(law);
  console.log("");

  const coverage = (report.confidence as { coverageRatio?: number } | undefined)?.coverageRatio;
  const confidenceLine =
    coverage != null && coverage >= 0.95 ? "high" : coverage != null && coverage >= 0.8 ? "medium" : "low";

  if (decisionLevel === "allow" || (decisionLevel !== "block" && decisionLevel !== "warn")) {
    console.log("Safe change");
    console.log("");
    console.log(`anchr analyzed ${filesCount} files against ${refs.base.slice(0, 7)}`);
    console.log("");
    console.log("No architectural boundaries affected.");
    console.log("");
    console.log("You can commit.");
    console.log("");
    console.log("Next: git commit");
    console.log("");
    console.log("Confidence: high");
    process.exitCode = 0;
  } else if (decisionLevel === "block") {
    console.log("Architectural violation detected");
    console.log("");
    console.log(`anchr analyzed ${filesCount} files against ${refs.base.slice(0, 7)}`);
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
    console.log("");
    console.log("Confidence: high");
    process.exitCode = 1;
  } else {
    console.log("Cannot prove safety");
    console.log("");
    console.log(`anchr analyzed ${filesCount} files against ${refs.base.slice(0, 7)}`);
    console.log("");
    console.log("The change may affect architecture but certainty is insufficient.");
    console.log("");
    console.log("Run:");
    console.log("  anchr --strict");
    console.log("");
    console.log(`Confidence: ${confidenceLine}`);
    process.exitCode = isStrict ? 2 : 0;
  }

  console.log("");
  const { formatShareBlock } = await import("../src/formatters/share.js");
  const shareContext = { base: refs.base, head: refs.head, repoRoot: cwd };
  console.log(formatShareBlock(report as import("../src/formatters/share.js").ArcSightReport, shareContext));
  console.log("");
  const { formatExplanation } = await import("../src/formatters/explain.js");
  console.log(formatExplanation(report as import("../src/formatters/explain.js").ArcSightReport));
}

void main().catch((_err: unknown) => {
  console.log("ArcSight — Inconclusive");
  console.log("Analyzer could not complete safely.");
  console.log("Confidence: low");
  process.exit(2);
});
