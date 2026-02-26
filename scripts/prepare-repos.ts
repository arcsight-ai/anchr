/**
 * Prepare deterministic real-world repositories for ANCHR historical validation.
 * Then execute run-validation-v11.ts.
 */

import { spawn } from "child_process";
import { createHash } from "crypto";
import { readFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

function loadEnv(): void {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "").trim();
  }
}
loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANCHR_ROOT = join(__dirname, "..");
const PROTOCOL_VERSION = "v12";
const REPO_NAME_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const MIN_COMMITS = 100;
const MIN_SOURCE_FILES = 10;
const SOURCE_EXTS = [".ts", ".js", ".py", ".go", ".rs", ".java"];
const FETCH_DEPTH = 200;
const API_THROTTLE_MS = 1000;
const MAX_RETRIES = 3;

const DEFAULT_TRAIN = ["supabase/supabase", "calcom/cal.com", "immich-app/immich"];
const DEFAULT_HOLDOUT = ["directus/directus", "appwrite/appwrite"];
const DEFAULT_REPOS = [...DEFAULT_TRAIN, ...DEFAULT_HOLDOUT];

function parseEnv(): {
  trainRepos: string[];
  holdoutRepos: string[];
  validationRepos: string[];
  seed: number;
  token: string;
  forceRefresh: boolean;
} {
  const train = (process.env.TRAIN_REPOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const holdout = (process.env.HOLDOUT_REPOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const validation = (process.env.VALIDATION_REPOS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const seed = parseInt(process.env.RANDOM_SEED ?? "42", 10);
  const token = process.env.GITHUB_TOKEN ?? "";
  const forceRefresh = process.env.FORCE_REFRESH === "true" || process.env.FORCE_REFRESH === "1";
  const fallbackTrain = train.length > 0 ? train : (validation.length > 0 ? validation.slice(0, 3) : DEFAULT_TRAIN);
  const fallbackHoldout = holdout.length > 0 ? holdout : (validation.length > 0 ? validation.slice(3, 5) : DEFAULT_HOLDOUT);
  const trainRepos = train.length > 0 ? train : fallbackTrain;
  const holdoutRepos = holdout.length > 0 ? holdout : fallbackHoldout;
  return { trainRepos, holdoutRepos, validationRepos: DEFAULT_REPOS, seed, token, forceRefresh };
}

function sanitizeRepoDir(repo: string): string {
  return repo.replace(/\//g, "__");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function ghApi<T>(token: string, path: string): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await sleep(API_THROTTLE_MS);
    try {
      const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } : { Accept: "application/vnd.github.v3+json" },
      });
      if (res.status === 403 || res.status === 429) {
        lastErr = new Error(`GitHub API ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
      return (await res.json()) as T;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("GitHub API failed");
}

async function getDefaultBranch(token: string, owner: string, repo: string): Promise<string> {
  const data = await ghApi<{ default_branch?: string }>(token, `/repos/${owner}/${repo}`);
  if (data?.default_branch) return data.default_branch;
  throw new Error(`No default_branch for ${owner}/${repo}`);
}

function run(cmd: string, args: string[], cwd: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const c = spawn(cmd, args, { cwd, shell: false, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    c.stdout?.setEncoding("utf8");
    c.stderr?.setEncoding("utf8");
    c.stdout?.on("data", (d: string | Buffer) => { out += typeof d === "string" ? d : d.toString(); });
    c.stderr?.on("data", (d: string | Buffer) => { err += typeof d === "string" ? d : d.toString(); });
    c.on("close", (code: number | null) => resolve({ ok: code === 0, stdout: out.trim(), stderr: err.trim() }));
  });
}

function countSourceFiles(dir: string, depth = 0): number {
  if (depth > 10) return 0;
  let n = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules" && e.name !== ".git" && !e.name.startsWith(".")) n += countSourceFiles(full, depth + 1);
      } else if (SOURCE_EXTS.some((ext) => e.name.endsWith(ext))) n++;
    }
  } catch {
    // ignore
  }
  return n;
}

async function prepareRepo(
  repo: string,
  validationDir: string,
  token: string,
  forceRefresh: boolean,
): Promise<{
  ok: boolean;
  defaultBranch: string;
  headSha: string;
  commitCount: number;
  skippedReason?: string;
}> {
  if (!REPO_NAME_RE.test(repo)) {
    return { ok: false, defaultBranch: "", headSha: "", commitCount: 0, skippedReason: "invalid_name" };
  }
  const [owner, name] = repo.split("/");
  const dirName = sanitizeRepoDir(repo);
  const cloneDir = join(validationDir, dirName);

  let defaultBranch: string;
  try {
    defaultBranch = await getDefaultBranch(token, owner!, name!);
  } catch (e) {
    if (existsSync(cloneDir)) {
      const r = await run("git", ["remote", "show", "origin"], cloneDir);
      const m = r.stdout.match(/HEAD branch:\s*(\S+)/);
      defaultBranch = m ? m[1]! : "main";
    } else {
      return { ok: false, defaultBranch: "", headSha: "", commitCount: 0, skippedReason: "default_branch_unknown" };
    }
  }

  if (existsSync(cloneDir) && !forceRefresh) {
    const origin = (await run("git", ["remote", "get-url", "origin"], cloneDir)).stdout;
    if (!origin.includes(repo)) {
      rmSync(cloneDir, { recursive: true, force: true });
    } else {
      const head = await run("git", ["rev-parse", "HEAD"], cloneDir);
      const status = await run("git", ["status", "--porcelain"], cloneDir);
      if (head.ok && head.stdout && !status.stdout) {
        const count = (await run("git", ["rev-list", "--count", "HEAD"], cloneDir)).stdout;
        const commits = parseInt(count, 10) || 0;
        const files = countSourceFiles(cloneDir);
        const archived = await ghApi<{ archived?: boolean }>(token, `/repos/${owner}/${name}`).then((d) => d.archived ?? false).catch(() => false);
        if (commits >= MIN_COMMITS && files >= MIN_SOURCE_FILES && !archived) {
          return { ok: true, defaultBranch, headSha: head.stdout, commitCount: commits };
        }
        return { ok: false, defaultBranch, headSha: head.stdout, commitCount: commits, skippedReason: commits < MIN_COMMITS ? "too_few_commits" : files < MIN_SOURCE_FILES ? "too_few_source_files" : "archived" };
      }
      rmSync(cloneDir, { recursive: true, force: true });
    }
  } else if (existsSync(cloneDir) && forceRefresh) {
    rmSync(cloneDir, { recursive: true, force: true });
  }

  mkdirSync(validationDir, { recursive: true });
  const cloneUrl = `https://github.com/${repo}.git`;
  const cloneResult = await run("git", ["clone", "--filter=blob:none", "--no-checkout", cloneUrl, cloneDir], validationDir);
  if (!cloneResult.ok) {
    return { ok: false, defaultBranch: "", headSha: "", commitCount: 0, skippedReason: "clone_failed" };
  }

  await run("git", ["fetch", "origin", `--depth=${FETCH_DEPTH}`], cloneDir);
  await run("git", ["checkout", "FETCH_HEAD"], cloneDir);
  const countOut = (await run("git", ["rev-list", "--count", "HEAD"], cloneDir)).stdout;
  let commits = parseInt(countOut, 10) || 0;
  if (commits < MIN_COMMITS) {
    await run("git", ["fetch", "origin", "--unshallow"], cloneDir).catch(() => {});
    const c2 = (await run("git", ["rev-list", "--count", "HEAD"], cloneDir)).stdout;
    commits = parseInt(c2, 10) || commits;
  }

  const head = (await run("git", ["rev-parse", "HEAD"], cloneDir)).stdout;
  const files = countSourceFiles(cloneDir);
  let archived = false;
  try {
    const d = await ghApi<{ archived?: boolean }>(token, `/repos/${owner}/${name}`);
    archived = d.archived ?? false;
  } catch {
    // ignore
  }

  if (commits < MIN_COMMITS) return { ok: false, defaultBranch, headSha: head, commitCount: commits, skippedReason: "too_few_commits" };
  if (files < MIN_SOURCE_FILES) return { ok: false, defaultBranch, headSha: head, commitCount: commits, skippedReason: "too_few_source_files" };
  if (archived) return { ok: false, defaultBranch, headSha: head, commitCount: commits, skippedReason: "archived" };

  await run("git", ["checkout", defaultBranch], cloneDir).catch(() => {});
  const headFinal = (await run("git", ["rev-parse", "HEAD"], cloneDir)).stdout;
  return { ok: true, defaultBranch, headSha: headFinal || head, commitCount: commits };
}

async function main(): Promise<number> {
  const { trainRepos, holdoutRepos, seed, token, forceRefresh } = parseEnv();

  console.log("PROTOCOL_VERSION: " + PROTOCOL_VERSION);
  console.log("NODE_VERSION " + process.version);
  console.log("OS " + process.platform + " " + process.arch);
  console.log("RANDOM_SEED " + seed);
  console.log("");

  const validationDir = join(ANCHR_ROOT, "artifacts", "validation");
  mkdirSync(validationDir, { recursive: true });

  const validTrain: string[] = [];
  const validHoldout: string[] = [];
  const skipped: Array<{ repo: string; reason: string }> = [];
  const repoInfo: Array<{ repo: string; defaultBranch: string; headSha: string; commitCount: number }> = [];

  const allRepos = [...trainRepos, ...holdoutRepos];
  const trainSet = new Set(trainRepos);
  const holdoutSet = new Set(holdoutRepos);

  for (const repo of allRepos) {
    let result;
    try {
      result = await prepareRepo(repo, validationDir, token, forceRefresh);
    } catch (e) {
      console.error("NETWORK_FAIL " + repo);
      process.exit(3);
    }
    console.log("REPO: " + repo);
    console.log("DEFAULT_BRANCH " + result.defaultBranch || "unknown");
    console.log("HEAD_SHA " + result.headSha);
    console.log("COMMIT_COUNT " + result.commitCount);
    console.log("");

    repoInfo.push({ repo, defaultBranch: result.defaultBranch, headSha: result.headSha, commitCount: result.commitCount });
    if (!result.ok) {
      skipped.push({ repo, reason: result.skippedReason ?? "invalid" });
      continue;
    }
    if (trainSet.has(repo)) validTrain.push(repo);
    if (holdoutSet.has(repo)) validHoldout.push(repo);
  }

  if (validTrain.length < 2 || validHoldout.length < 1) {
    console.error("INSUFFICIENT_REPOS");
    process.exit(2);
  }

  const sortedTrain = [...validTrain].sort();
  const sortedHoldout = [...validHoldout].sort();
  const hashInput =
    sortedTrain.join(",") +
    "|" +
    sortedHoldout.join(",") +
    "|" +
    repoInfo.map((r) => r.headSha).join(",") +
    "|" +
    repoInfo.map((r) => r.defaultBranch).join(",") +
    "|" +
    seed +
    "|" +
    PROTOCOL_VERSION;
  const datasetHash = createHash("sha256").update(hashInput).digest("hex").slice(0, 32);

  console.log("REPO_PREP_SUMMARY");
  for (const r of repoInfo) {
    console.log(r.repo + " default_branch=" + r.defaultBranch + " head=" + r.headSha + " commits=" + r.commitCount);
  }
  console.log("VALID_TRAIN_REPOS");
  for (const r of sortedTrain) console.log(r);
  console.log("VALID_HOLDOUT_REPOS");
  for (const r of sortedHoldout) console.log(r);
  console.log("SKIPPED_REPOS");
  for (const s of skipped) console.log(s.repo + " reason=" + s.reason);
  console.log("DATASET_HASH " + datasetHash);

  const child = spawn(
    "npx",
    ["tsx", join(ANCHR_ROOT, "scripts", "run-validation-v11.ts")],
    {
      cwd: ANCHR_ROOT,
      stdio: "inherit",
      env: { ...process.env, TRAIN_REPOS: sortedTrain.join(","), HOLDOUT_REPOS: sortedHoldout.join(","), RANDOM_SEED: String(seed) },
    },
  );
  const code = await new Promise<number>((resolve) => {
    child.on("close", (c) => resolve(c ?? 0));
  });
  return code;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(4);
  });
