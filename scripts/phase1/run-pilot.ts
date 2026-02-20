#!/usr/bin/env npx tsx
/**
 * Phase 1 Option A — Hardened pilot runner (infrastructure v3).
 * Deterministic, bounded, resumable. Raw certification only; no engine tuning.
 *
 * Usage: npx tsx scripts/phase1/run-pilot.ts --repos owner/name [--seed 42] [--max-prs 20] [--since-months 12] [--dry-run] [--debug]
 */

import { execSync, spawnSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getComplexityBucket, TMP_BASE } from "./config.js";
import type { PilotRecord, PilotStatus } from "./pilot-types.js";
import { validatePilotRecord } from "./pilot-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

function loadEnvFrom(dir: string): void {
  const envPath = join(dir, ".env");
  try {
    if (!existsSync(envPath)) return;
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && process.env[m[1]!] === undefined) {
        const val = m[2]!.replace(/\s*#.*$/, "").replace(/^["']|["']$/g, "").trim();
        process.env[m[1]!] = val;
      }
    }
  } catch {
    // ignore
  }
}
loadEnvFrom(process.cwd());
loadEnvFrom(ROOT);

const PILOT_ARTIFACTS = join(ROOT, "artifacts", "phase1", "pilot");
const CERTIFY_TIMEOUT_MS = 2 * 60 * 1000;
const RATE_LIMIT_PAUSE_MS = 60 * 1000;
const RATE_LIMIT_WARN = 100;
const RATE_LIMIT_ABORT = 10;
const MAX_PAGE_GUARD = 20;
const BUCKET_TARGETS = { SMALL: 5, MEDIUM: 10, LARGE: 5 } as const;
const LOW_SIGNAL_TITLE = /bump|chore|deps|dependency|version|release/i;
const DINARuns = 6;

interface CliArgs {
  repos: string[];
  seed: number;
  maxPrs: number;
  sinceMonths: number;
  dryRun: boolean;
  debug: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const repos: string[] = [];
  let seed = 42;
  let maxPrs = 20;
  let sinceMonths = 12;
  let dryRun = false;
  let debug = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repos") {
      while (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) repos.push(argv[++i]!);
    } else if (argv[i] === "--seed" && argv[i + 1]) {
      seed = parseInt(argv[i + 1]!, 10) || 42;
      i++;
    } else if (argv[i] === "--max-prs" && argv[i + 1]) {
      maxPrs = Math.max(1, parseInt(argv[i + 1]!, 10) || 20);
      i++;
    } else if (argv[i] === "--since-months" && argv[i + 1]) {
      sinceMonths = Math.max(1, parseInt(argv[i + 1]!, 10) || 12);
      i++;
    } else if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--debug") debug = true;
  }
  return { repos, seed, maxPrs, sinceMonths, dryRun, debug };
}

function slug(repo: string): string {
  return repo.replace(/\//g, "_");
}

/** Deterministic PRNG (no Math.random). LCG; seed affects all sampling. */
function nextSeed(s: number): number {
  return (s * 1103515245 + 12345) & 0x7fffffff;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = nextSeed(s);
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface GHPRMeta {
  number: number;
  base_sha: string;
  head_sha: string;
  lines_changed: number;
  files_changed: number;
  complexity_bucket: "SMALL" | "MEDIUM" | "LARGE";
  updated_at: string;
}

function getRemaining(res: Response): number {
  const v = res.headers.get("x-ratelimit-remaining");
  if (v == null) return 9999;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 9999 : n;
}

/** Fetch with rate-limit handling: if remaining < 100 sleep 60s and retry; if < 10 throw to abort repo. */
async function fetchWithRateLimit(
  url: string,
  token: string,
  repoLabel: string
): Promise<{ res: Response; remaining: number }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${token}` },
    });
    const remaining = getRemaining(res);
    if (remaining < RATE_LIMIT_ABORT) {
      throw new Error(`[${repoLabel}] rate limit critical (remaining ${remaining}), aborting repo`);
    }
    if (remaining < RATE_LIMIT_WARN) {
      console.error(`[${repoLabel}] rate remaining ${remaining}, pausing 60s`);
      await sleep(RATE_LIMIT_PAUSE_MS);
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      await sleep(RATE_LIMIT_PAUSE_MS);
      continue;
    }
    return { res, remaining };
  }
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${token}` },
  });
  return { res, remaining: getRemaining(res) };
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    if (raw.length > 5 * 1024 * 1024) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Low-signal filter: skip bump/chore/deps/version/release, single-file tiny PRs. */
function isLowSignal(
  merged: boolean,
  draft: boolean,
  authorType: string | undefined,
  title: string,
  changedFiles: number,
  linesChanged: number
): boolean {
  if (merged !== true || draft === true) return true;
  if (authorType !== "User") return true;
  if (LOW_SIGNAL_TITLE.test(title)) return true;
  if (changedFiles === 1 && linesChanged <= 10) return true;
  return false;
}

/** Fetch merged PRs with date cutoff, page guard, and low-signal filter. Stops when enough valid or cutoff or page > 20. */
async function fetchMergedPRs(
  token: string,
  owner: string,
  name: string,
  repoLabel: string,
  sinceMonths: number,
  maxPrs: number,
  debug: boolean
): Promise<{ prs: GHPRMeta[]; lastRemaining: number }> {
  const cutoffDate = new Date(Date.now() - sinceMonths * 30 * 24 * 60 * 60 * 1000);
  const minValid = maxPrs * 3;
  const valid: GHPRMeta[] = [];
  let page = 1;
  let lastRemaining = 9999;

  while (page <= MAX_PAGE_GUARD) {
    const url = `https://api.github.com/repos/${owner}/${name}/pulls?state=closed&per_page=100&page=${page}&sort=updated&direction=desc`;
    const { res, remaining } = await fetchWithRateLimit(url, token, repoLabel);
    lastRemaining = remaining;
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);

    const list = safeJsonParse<Array<{
      number: number;
      draft?: boolean;
      merged_at: string | null;
      updated_at?: string | null;
      title?: string | null;
      user?: { type?: string };
      base?: { sha?: string };
      head?: { sha?: string };
    }>>(await res.text());
    if (!list || !Array.isArray(list) || list.length === 0) break;

    let hitCutoff = false;
    for (const pr of list) {
      const updatedAt = pr.updated_at ? new Date(pr.updated_at) : null;
      if (updatedAt && updatedAt < cutoffDate) {
        if (debug) console.error(`[${repoLabel}] page ${page} reached cutoff, stopping`);
        hitCutoff = true;
        break;
      }
      if (!pr.base?.sha || !pr.head?.sha) continue;
      const detailUrl = `https://api.github.com/repos/${owner}/${name}/pulls/${pr.number}`;
      const { res: detailRes, remaining: dr } = await fetchWithRateLimit(detailUrl, token, repoLabel);
      lastRemaining = dr;
      if (!detailRes.ok) continue;
      const detail = safeJsonParse<{
        merged?: boolean;
        additions?: number | null;
        deletions?: number | null;
        changed_files?: number | null;
        user?: { type?: string };
      }>(await detailRes.text());
      if (!detail) continue;
      const merged = detail.merged === true;
      const draft = pr.draft === true;
      const authorType = detail.user?.type ?? pr.user?.type;
      const title = (pr.title ?? "").trim();
      const changedFiles = detail.changed_files ?? 0;
      const additions = detail.additions ?? 0;
      const deletions = detail.deletions ?? 0;
      const linesChanged = additions + deletions;
      if (isLowSignal(merged, draft, authorType, title, changedFiles, linesChanged)) continue;

      valid.push({
        number: pr.number,
        base_sha: pr.base.sha,
        head_sha: pr.head.sha,
        lines_changed: linesChanged,
        files_changed: changedFiles,
        complexity_bucket: getComplexityBucket(linesChanged),
        updated_at: pr.updated_at ?? "",
      });
    }

    console.error(`[${repoLabel}] page ${page} collected ${valid.length}`);
    if (valid.length >= minValid || hitCutoff) break;
    if (list.length < 100) break;
    page++;
  }

  if (debug) console.error(`[${repoLabel}] raw valid PR count ${valid.length}`);
  return { prs: valid, lastRemaining };
}

/** Deterministic sample: 5 S, 10 M, 5 L; borrow from nearest if underfilled. */
function deterministicSample(candidates: GHPRMeta[], seed: number, maxPrs: number): GHPRMeta[] {
  const byBucket = {
    SMALL: candidates.filter((c) => c.complexity_bucket === "SMALL"),
    MEDIUM: candidates.filter((c) => c.complexity_bucket === "MEDIUM"),
    LARGE: candidates.filter((c) => c.complexity_bucket === "LARGE"),
  };
  const order: ("SMALL" | "MEDIUM" | "LARGE")[] = ["SMALL", "MEDIUM", "LARGE"];
  const selected: GHPRMeta[] = [];
  const taken = new Set<number>();

  for (let i = 0; i < order.length; i++) {
    const bucket = order[i]!;
    const pool = shuffle(byBucket[bucket], seed + i);
    const target = BUCKET_TARGETS[bucket];
    let n = 0;
    for (const c of pool) {
      if (n >= target) break;
      if (taken.has(c.number)) continue;
      taken.add(c.number);
      selected.push(c);
      n++;
    }
  }
  const need = Math.min(maxPrs - selected.length, candidates.length - selected.length);
  if (need > 0) {
    const rest = candidates.filter((c) => !taken.has(c.number));
    const extra = shuffle(rest, seed + 99).slice(0, need);
    for (const c of extra) selected.push(c);
  }
  return selected.slice(0, maxPrs);
}

/** Shallow fetch: init, remote, fetch depth=1 base and head, checkout base. */
function shallowCloneAndCheckout(
  workDir: string,
  cloneUrl: string,
  baseSha: string,
  headSha: string
): void {
  mkdirSync(workDir, { recursive: true });
  execSync("git init", { encoding: "utf8", cwd: workDir, stdio: "pipe" });
  execSync(`git remote add origin ${cloneUrl}`, { encoding: "utf8", cwd: workDir, stdio: "pipe" });
  execSync(`git fetch --depth=1 origin ${baseSha}`, { encoding: "utf8", cwd: workDir, timeout: 90000, stdio: "pipe" });
  execSync(`git fetch --depth=1 origin ${headSha}`, { encoding: "utf8", cwd: workDir, timeout: 90000, stdio: "pipe" });
  execSync(`git checkout ${baseSha}`, { encoding: "utf8", cwd: workDir, stdio: "pipe" });
}

function safeRmDir(dir: string): void {
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/** Run dina certify; return decision_level, coverage_ratio, primary_cause, minimal_cut_size, status, execution_ms. */
function runCertification(
  cwd: string,
  baseSha: string,
  headSha: string
): {
  decision_level: string;
  coverage_ratio: number;
  primary_cause: string | null;
  minimal_cut_size: number;
  status: PilotStatus;
  execution_ms: number;
} {
  const reportPath = join(cwd, "artifacts", "pilot-dina-report.json");
  mkdirSync(join(cwd, "artifacts"), { recursive: true });
  const env = {
    ...process.env,
    REPORT_PATH: reportPath,
    BASE_SHA: baseSha,
    HEAD_SHA: headSha,
  };
  const start = Date.now();
  const r = spawnSync(
    "npx",
    ["tsx", join(ROOT, "scripts", "dina.ts"), "certify", "--base", baseSha, "--head", headSha, "--runs", String(DINARuns)],
    {
      encoding: "utf8",
      cwd,
      env,
      timeout: CERTIFY_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    }
  );
  const execution_ms = Date.now() - start;

  if (r.signal === "SIGTERM" || (r.status === null && r.signal)) {
    return {
      decision_level: "allow",
      coverage_ratio: 0,
      primary_cause: null,
      minimal_cut_size: 0,
      status: "timeout",
      execution_ms,
    };
  }

  let raw = "";
  try {
    raw = readFileSync(reportPath, "utf8");
  } catch {
    if (r.stdout) raw = r.stdout;
  }
  const report = safeJsonParse<{
    certification_status?: string;
    confidence_score?: number;
    violation_classification?: string | null;
  }>(raw);
  const status: PilotStatus = r.status === 0 ? "ok" : "error";
  const certification_status = report?.certification_status;
  const decision_level = certification_status === "PASS" ? "allow" : "block";
  const coverage_ratio = typeof report?.confidence_score === "number" ? report.confidence_score : 0;
  const primary_cause = report?.violation_classification ?? null;
  return {
    decision_level,
    coverage_ratio,
    primary_cause,
    minimal_cut_size: 0,
    status,
    execution_ms,
  };
}

function processOnePR(
  repo: string,
  meta: GHPRMeta,
  token: string,
  rateLimitRemaining: number,
  debug: boolean
): PilotRecord {
  const [owner, name] = repo.split("/");
  const workDir = join(TMP_BASE, slug(repo), String(meta.number));
  const cloneUrl = `https://github.com/${owner}/${name}.git`;

  const emptyRecord = (
    status: PilotStatus,
    execution_ms: number
  ): PilotRecord => ({
    repo,
    pr_number: meta.number,
    base_sha: meta.base_sha,
    head_sha: meta.head_sha,
    lines_changed: meta.lines_changed,
    files_changed: meta.files_changed,
    complexity_bucket: meta.complexity_bucket,
    decision_level: "allow",
    coverage_ratio: 0,
    primary_cause: null,
    minimal_cut_size: 0,
    status,
    execution_ms,
    rate_limit_remaining: rateLimitRemaining,
    run_timestamp: new Date().toISOString(),
  });

  if (!owner || !name) {
    safeRmDir(workDir);
    return emptyRecord("error", 0);
  }

  try {
    shallowCloneAndCheckout(workDir, cloneUrl, meta.base_sha, meta.head_sha);
    const cert = runCertification(workDir, meta.base_sha, meta.head_sha);
    if (debug) console.error(`[${repo}] execution ${cert.execution_ms}ms`);
    const record: PilotRecord = {
      repo,
      pr_number: meta.number,
      base_sha: meta.base_sha,
      head_sha: meta.head_sha,
      lines_changed: meta.lines_changed,
      files_changed: meta.files_changed,
      complexity_bucket: meta.complexity_bucket,
      decision_level: cert.decision_level,
      coverage_ratio: cert.coverage_ratio,
      primary_cause: cert.primary_cause,
      minimal_cut_size: cert.minimal_cut_size,
      status: cert.status,
      execution_ms: cert.execution_ms,
      rate_limit_remaining: rateLimitRemaining,
      run_timestamp: new Date().toISOString(),
    };
    safeRmDir(workDir);
    return record;
  } catch (e) {
    if (debug && e instanceof Error) console.error(`[${repo}] error:`, e.message);
    safeRmDir(workDir);
    return emptyRecord("error", 0);
  }
}

function writeArtifact(record: PilotRecord, artifactPath: string): void {
  if (!validatePilotRecord(record)) {
    throw new Error("Invalid PilotRecord: missing or invalid fields");
  }
  const out = {
    repo: record.repo,
    pr_number: record.pr_number,
    base_sha: record.base_sha,
    head_sha: record.head_sha,
    lines_changed: record.lines_changed,
    files_changed: record.files_changed,
    complexity_bucket: record.complexity_bucket,
    decision_level: record.decision_level,
    coverage_ratio: record.coverage_ratio,
    primary_cause: record.primary_cause,
    minimal_cut_size: record.minimal_cut_size,
    status: record.status,
    execution_ms: record.execution_ms,
    rate_limit_remaining: record.rate_limit_remaining,
    run_timestamp: record.run_timestamp,
  };
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, JSON.stringify(out, null, 2), "utf8");
}

async function main(): Promise<void> {
  const args = parseArgs();
  const token = process.env.GITHUB_TOKEN?.trim() ?? "";
  if (!token) {
    console.error("GITHUB_TOKEN is not set. Set it in .env (repo root or cwd) or export it.");
    process.exit(1);
  }
  if (args.repos.length === 0) {
    console.error("Usage: npx tsx scripts/phase1/run-pilot.ts --repos owner/name [--seed 42] [--max-prs 20] [--since-months 12] [--dry-run] [--debug]");
    process.exit(1);
  }

  for (const repo of args.repos) {
    const parts = repo.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      console.error("Invalid repo:", repo);
      process.exit(1);
    }
  }

  const allSelected: { repo: string; meta: GHPRMeta }[] = [];
  let lastRateRemaining = 9999;

  for (const repo of args.repos) {
    const [owner, name] = repo.split("/") as [string, string];
    try {
      const { prs, lastRemaining } = await fetchMergedPRs(
        token,
        owner,
        name,
        repo,
        args.sinceMonths,
        args.maxPrs,
        args.debug
      );
      lastRateRemaining = lastRemaining;
      const bucketSizes = {
        SMALL: prs.filter((p) => p.complexity_bucket === "SMALL").length,
        MEDIUM: prs.filter((p) => p.complexity_bucket === "MEDIUM").length,
        LARGE: prs.filter((p) => p.complexity_bucket === "LARGE").length,
      };
      if (args.debug) {
        console.error(`[${repo}] bucket sizes before sampling S:${bucketSizes.SMALL} M:${bucketSizes.MEDIUM} L:${bucketSizes.LARGE}`);
      }
      const selected = deterministicSample(prs, args.seed, args.maxPrs);
      const dist: Record<string, number> = {};
      for (const s of selected) dist[s.complexity_bucket] = (dist[s.complexity_bucket] ?? 0) + 1;
      const S = dist.SMALL ?? 0;
      const M = dist.MEDIUM ?? 0;
      const L = dist.LARGE ?? 0;
      console.error(`[${repo}] sampled ${selected.length} PRs (S:${S} M:${M} L:${L})`);
      for (const meta of selected) allSelected.push({ repo, meta });
    } catch (e) {
      console.error(e);
      continue;
    }
  }

  if (args.dryRun) {
    console.error("Dry run complete. No clone or certification.");
    process.exit(0);
  }

  mkdirSync(PILOT_ARTIFACTS, { recursive: true });
  let totalProcessed = 0;
  let totalErrors = 0;
  let totalTimeouts = 0;
  let currentRateRemaining = lastRateRemaining;
  const repoStats = new Map<string, { processed: number; errors: number; timeouts: number }>();
  const abortedRepos = new Set<string>();

  for (const { repo, meta } of allSelected) {
    if (abortedRepos.has(repo)) continue;

    const artifactDir = join(PILOT_ARTIFACTS, slug(repo));
    const artifactPath = join(artifactDir, `${meta.number}.json`);
    if (existsSync(artifactPath)) {
      totalProcessed++;
      continue;
    }

    let stats = repoStats.get(repo);
    if (!stats) {
      stats = { processed: 0, errors: 0, timeouts: 0 };
      repoStats.set(repo, stats);
    }
    if (stats.processed >= 2) {
      const failRate = (stats.errors + stats.timeouts) / stats.processed;
      if (failRate >= 0.5) {
        console.error(`[${repo}] excessive failure rate, aborting.`);
        abortedRepos.add(repo);
        continue;
      }
    }

    console.error(`[${repo}] processing PR #${meta.number} (${meta.complexity_bucket})`);
    const record = processOnePR(repo, meta, token, currentRateRemaining, args.debug);
    stats.processed++;
    if (record.status === "error") {
      stats.errors++;
      totalErrors++;
    }
    if (record.status === "timeout") {
      stats.timeouts++;
      totalTimeouts++;
    }
    totalProcessed++;
    currentRateRemaining = record.rate_limit_remaining;
    console.error(`[${repo}] execution ${record.execution_ms}ms`);
    console.error(`[${repo}] rate remaining ${currentRateRemaining}`);
    try {
      writeArtifact(record, artifactPath);
    } catch (e) {
      console.error(`[${repo}] failed to write artifact:`, e);
    }

    if (stats.processed >= 2) {
      const failRate = (stats.errors + stats.timeouts) / stats.processed;
      if (failRate >= 0.5) {
        console.error(`[${repo}] excessive failure rate, aborting.`);
        abortedRepos.add(repo);
      }
    }
  }

  console.error("\nPilot complete.");
  console.error(`Total processed: ${totalProcessed}`);
  console.error(`Errors: ${totalErrors}`);
  console.error(`Timeouts: ${totalTimeouts}`);

  const summaryScript = join(__dirname, "generate-pilot-summary.ts");
  const summaryOut = spawnSync("npx", ["tsx", summaryScript, PILOT_ARTIFACTS], {
    encoding: "utf8",
    cwd: ROOT,
  });
  if (summaryOut.status !== 0 && summaryOut.stderr) process.stderr.write(summaryOut.stderr);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
