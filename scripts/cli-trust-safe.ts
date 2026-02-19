/**
 * Trust-safe CLI entrypoint (Prompt 1).
 * ArcSight must NEVER block work because of its own failure.
 * Internal errors, timeout, invalid report → Inconclusive (exit 2). Only architecture violations block (exit 1).
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ANCHR_DIR = ".anchr";
const REPORT_FILE = "report.json";
const AUDIT_TIMEOUT_MS = 20_000;
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

function findRepoRoot(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const gitDir = path.join(dir, ".git");
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function safeExec(cmd: string, cwd: string): string | null {
  try {
    const out = execSync(cmd, {
      encoding: "utf8",
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 2 * 1024 * 1024,
    });
    return typeof out === "string" ? out.trim() : null;
  } catch {
    return null;
  }
}

function getBaseHead(repoRoot: string): { base: string; head: string } | null {
  const ciBase = process.env.GITHUB_BASE_SHA ?? process.env.BASE_SHA;
  const ciHead = process.env.GITHUB_SHA ?? process.env.HEAD_SHA ?? process.env.GITHUB_HEAD_SHA;
  if (ciBase && ciHead) return { base: ciBase, head: ciHead };

  const head = safeExec("git rev-parse HEAD", repoRoot);
  if (!head) return null;

  const base =
    safeExec("git merge-base HEAD @{upstream} 2>/dev/null", repoRoot) ??
    safeExec("git merge-base HEAD origin/main 2>/dev/null", repoRoot) ??
    safeExec("git merge-base HEAD origin/master 2>/dev/null", repoRoot) ??
    safeExec("git rev-list --max-parents=0 HEAD 2>/dev/null", repoRoot);

  if (base) return { base, head };
  return { base: head, head };
}

function hasRelevantChanges(repoRoot: string, base: string, head: string): boolean {
  const out = safeExec(`git diff --name-only ${base} ${head}`, repoRoot);
  if (!out) return true;
  for (const line of out.split("\n")) {
    const ext = path.extname(line.trim());
    if (EXTENSIONS.has(ext)) return true;
  }
  return false;
}

function readReport(reportPath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(reportPath)) return null;
    const raw = fs.readFileSync(reportPath, "utf8");
    const data = JSON.parse(raw);
    if (data === null || typeof data !== "object") return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inconclusive(message: string): never {
  console.log("ArcSight — Inconclusive");
  console.log(message);
  console.log("Confidence: low");
  process.exit(2);
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) {
    console.log("ArcSight — Not a repository");
    process.exit(3);
  }

  const anchrPath = path.join(repoRoot, ANCHR_DIR);
  try {
    if (!fs.existsSync(anchrPath)) fs.mkdirSync(anchrPath, { recursive: true });
    const reportPath = path.join(anchrPath, REPORT_FILE);
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
  } catch {
    inconclusive("Could not prepare runtime directory.");
  }

  const refs = getBaseHead(repoRoot);
  if (!refs) inconclusive("Could not determine base or head commit.");

  if (!hasRelevantChanges(repoRoot, refs!.base, refs!.head)) {
    console.log("ArcSight — OK");
    console.log("No relevant code changes detected.");
    console.log("Confidence: high");
    process.exit(0);
  }

  const reportPath = path.join(repoRoot, ANCHR_DIR, REPORT_FILE);
  const pkgRoot = path.resolve(__dirname, "..");
  const cliPath = path.join(pkgRoot, "scripts", "cli.ts");
  const tsxPath = path.join(pkgRoot, "node_modules", ".bin", "tsx");
  const useNpx = !fs.existsSync(tsxPath);
  const exec = useNpx ? "npx" : process.execPath;
  const execArgs = useNpx
    ? ["tsx", cliPath, "audit", "--all", "--base", refs!.base, "--head", refs!.head]
    : [tsxPath, cliPath, "audit", "--all", "--base", refs!.base, "--head", refs!.head];

  const reportPathRelative = path.join(ANCHR_DIR, REPORT_FILE);
  const result = spawnSync(exec, execArgs, {
    cwd: repoRoot,
    env: { ...process.env, ANCHR_REPORT_PATH: reportPathRelative },
    encoding: "utf8",
    timeout: AUDIT_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    stdio: "pipe",
  });

  if (result.error || result.signal || (result.status !== null && result.status !== 0 && result.status !== 1 && result.status !== 2)) {
    inconclusive("Analyzer could not complete safely.");
  }

  const report = readReport(reportPath);
  if (!report) {
    inconclusive("Analyzer produced invalid output.");
  }

  const { formatLaw } = await import("../src/formatters/law.js");
  const law = formatLaw(report);
  console.log(law);
  console.log("");

  const level = (report!.decision as { level?: string } | undefined)?.level ?? "warn";
  const primaryCause = (report!.classification as { primaryCause?: string | null } | undefined)?.primaryCause ?? null;
  const minimalCut = (report!.minimalCut as string[] | undefined) ?? [];
  const coverage = (report!.confidence as { coverageRatio?: number } | undefined)?.coverageRatio;
  const confidenceLabel = coverage != null && coverage >= 0.95 ? "high" : coverage != null && coverage >= 0.8 ? "medium" : "low";

  if (level === "allow" || (level !== "block" && level !== "warn")) {
    console.log("ArcSight — OK");
    console.log("No architectural impact detected.");
    console.log("Confidence: high");
    process.exit(0);
  }

  if (level === "block") {
    console.log("ArcSight — BLOCKED");
    console.log("");
    const reason = primaryCause === "deleted_public_api"
      ? "A shared contract was removed; dependent code may break on upgrade."
      : "A module depends on another module's internal implementation.";
    console.log("Reason:");
    console.log(reason);
    console.log("");
    console.log("Violations:");
    for (const entry of minimalCut.slice(0, 12)) {
      const parts = entry.split(":");
      const from = parts[0] ?? entry;
      const to = parts.slice(1).join(":");
      console.log(` ${from} → ${to || "(internal)"}`);
    }
    console.log("");
    console.log("Suggested fix:");
    console.log("Import from the package public API instead of internal files.");
    console.log("");
    console.log("Confidence: high");
    process.exit(1);
  }

  console.log("ArcSight — Inconclusive");
  console.log("");
  console.log("Reason:");
  console.log("Architectural impact could not be proven safe.");
  console.log("");
  console.log("Try:");
  console.log("  • run tests");
  console.log("  • open PR for full verification");
  console.log("");
  console.log("Confidence: medium");
  process.exit(2);
}

void main().catch(() => {
  process.exit(2);
});
