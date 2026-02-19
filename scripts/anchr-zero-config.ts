/**
 * Zero-config runner for npx anchr.
 * Always exit 0. Never modify files. Output order STRICT. Memory anchor for risky results.
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ANCHR_DIR = ".anchr";
const REPORT_FILE = "report.json";
const AUDIT_TIMEOUT_MS = 10_000;
const LARGE_ANALYSIS_MS = 5_000;
function findRepoRoot(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const gitDir = path.join(dir, ".git");
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function repoName(repoRoot: string): string {
  return path.basename(repoRoot) || "repository";
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

function hasChanges(repoRoot: string): boolean {
  const uncommitted = safeExec("git status --porcelain", repoRoot);
  if (uncommitted && uncommitted.length > 0) return true;
  const head = safeExec("git rev-parse HEAD", repoRoot);
  const main = safeExec("git rev-parse main 2>/dev/null", repoRoot)
    || safeExec("git rev-parse origin/main 2>/dev/null", repoRoot)
    || safeExec("git rev-parse master 2>/dev/null", repoRoot)
    || safeExec("git rev-parse origin/master 2>/dev/null", repoRoot);
  if (head && main && head !== main) return true;
  return false;
}

function getBaseHead(repoRoot: string): { base: string; head: string } | null {
  const ciBase = process.env.GITHUB_BASE_SHA ?? process.env.BASE_SHA;
  const ciHead = process.env.GITHUB_SHA ?? process.env.HEAD_SHA ?? process.env.GITHUB_HEAD_SHA;
  if (ciBase && ciHead) return { base: ciBase, head: ciHead };

  const head = safeExec("git rev-parse HEAD", repoRoot);
  if (!head) return null;

  const base =
    safeExec("git merge-base HEAD @{upstream} 2>/dev/null", repoRoot)
    ?? safeExec("git merge-base HEAD origin/main 2>/dev/null", repoRoot)
    ?? safeExec("git merge-base HEAD origin/master 2>/dev/null", repoRoot)
    ?? safeExec("git rev-list --max-parents=0 HEAD 2>/dev/null", repoRoot);

  if (base) return { base, head };
  return { base: head, head };
}

function detectTypeScriptProject(repoRoot: string): boolean {
  if (fs.existsSync(path.join(repoRoot, "tsconfig.json"))) return true;
  const dir = fs.readdirSync(repoRoot, { withFileTypes: true });
  for (const e of dir) {
    if (e.isFile() && e.name.startsWith("tsconfig.") && e.name.endsWith(".json")) return true;
  }
  try {
    const pkgPath = path.join(repoRoot, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
      const deps = { ...(pkg.dependencies as Record<string, string>), ...(pkg.devDependencies as Record<string, string>) };
      if (deps && typeof deps === "object" && (deps.typescript || deps["typescript"])) return true;
    }
  } catch {
    // ignore
  }
  function hasTs(dirPath: string, depth: number): boolean {
    if (depth > 3) return false;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const e of entries) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        const full = path.join(dirPath, e.name);
        if (e.isFile() && (e.name.endsWith(".ts") || e.name.endsWith(".tsx"))) return true;
        if (e.isDirectory() && hasTs(full, depth + 1)) return true;
      }
    } catch {
      // ignore
    }
    return false;
  }
  return hasTs(repoRoot, 0);
}

async function main(): Promise<void> {
  // Instant feedback within 300ms
  console.log("ANCHR  scanning repository…");

  const cwd = process.cwd();
  const repoRoot = findRepoRoot(cwd);

  if (!repoRoot) {
    console.log("ANCHR");
    console.log("");
    console.log("Not a git repository.");
    console.log("Run from a project root to verify architecture.");
    process.exit(0);
  }

  if (!detectTypeScriptProject(repoRoot)) {
    console.log("ANCHR");
    console.log("");
    console.log("No TypeScript project detected.");
    console.log("anchr verifies architecture, not syntax.");
    console.log("Add a tsconfig.json to enable verification.");
    process.exit(0);
  }

  const name = repoName(repoRoot);
  const changeMode = hasChanges(repoRoot);
  const headerLine2 = changeMode ? "Analyzing current changes…" : "Analyzing full repository…";

  console.log(`ANCHR  ${name}`);
  console.log(headerLine2);
  console.log("");

  let longAnalysisShown = false;
  const longTimer = setTimeout(() => {
    longAnalysisShown = true;
    console.log("ANCHR  analyzing large repository…");
  }, LARGE_ANALYSIS_MS);

  const refs = getBaseHead(repoRoot);
  if (!refs) {
    clearTimeout(longTimer);
    const { formatCausalReport } = await import("../src/formatters/causalReport.js");
    const syntheticReport = {
      status: "INCOMPLETE",
      decision: { level: "warn" },
      classification: { primaryCause: null as string | null },
      minimalCut: [] as string[],
    };
    console.log(formatCausalReport(syntheticReport as import("../src/formatters/causalReport.js").ArcSightReport));
    process.exit(0);
  }

  const reportPath = path.join(repoRoot, ANCHR_DIR, REPORT_FILE);
  try {
    if (!fs.existsSync(path.join(repoRoot, ANCHR_DIR))) {
      fs.mkdirSync(path.join(repoRoot, ANCHR_DIR), { recursive: true });
    }
    if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
  } catch {
    // ignore
  }

  const pkgRoot = path.resolve(__dirname, "..");
  const cliPath = path.join(pkgRoot, "scripts", "cli.ts");
  const tsxPath = path.join(pkgRoot, "node_modules", ".bin", "tsx");
  const useNpx = !fs.existsSync(tsxPath);
  const exec = useNpx ? "npx" : process.execPath;
  const execArgs = useNpx
    ? ["tsx", cliPath, "audit", "--all", "--base", refs.base, "--head", refs.head]
    : [tsxPath, cliPath, "audit", "--all", "--base", refs.base, "--head", refs.head];

  const result = spawnSync(exec, execArgs, {
    cwd: repoRoot,
    env: { ...process.env, ANCHR_REPORT_PATH: path.join(ANCHR_DIR, REPORT_FILE) },
    encoding: "utf8",
    timeout: AUDIT_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    stdio: "pipe",
  });

  clearTimeout(longTimer);

  let report: Record<string, unknown> | null = null;
  try {
    if (fs.existsSync(reportPath)) {
      const raw = JSON.parse(fs.readFileSync(reportPath, "utf8")) as Record<string, unknown>;
      report = raw;
    }
  } catch {
    // leave report null
  }

  const reportForCausal: Record<string, unknown> = report ?? {
    status: "INCOMPLETE",
    decision: { level: "warn" },
    classification: { primaryCause: null },
    minimalCut: [],
  };

  const { formatCausalReport } = await import("../src/formatters/causalReport.js");
  const causalReport = formatCausalReport(reportForCausal as import("../src/formatters/causalReport.js").ArcSightReport);
  console.log(causalReport);
  process.exit(0);
}

void main().catch(() => {
  process.exit(0);
});
