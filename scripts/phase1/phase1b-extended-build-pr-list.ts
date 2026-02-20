#!/usr/bin/env npx tsx
/**
 * Phase 1B-Extended — Build PR list (~300 PRs, 10 repos).
 * Fetches merged PRs via GitHub API. No engine changes. Measurement only.
 *
 * Usage: npx tsx scripts/phase1/phase1b-extended-build-pr-list.ts [--debug]
 * Requires GITHUB_TOKEN. Writes artifacts/phase1b_extended/pr-list.json
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getComplexityBucket } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const OUT_DIR = join(ROOT, "artifacts", "phase1b_extended");
const PR_LIST_PATH = join(OUT_DIR, "pr-list.json");

const REPOS_STABLE = ["sindresorhus/ky", "vercel/swr", "axios/axios", "pinojs/pino", "lodash/lodash"];
const REPOS_HIGH_CHURN = ["fastify/fastify", "trpc/trpc", "unjs/ofetch", "vitest-dev/vitest", "radix-ui/primitives"];
const REPOS = [...REPOS_STABLE, ...REPOS_HIGH_CHURN];

const PER_REPO_CAP = 35;
const SINCE_MONTHS = 18;
const MAX_PAGES = 25;
const LOW_SIGNAL_TITLE = /bump|chore|deps|dependency|version|release/i;

interface GHPRMeta {
  number: number;
  base_sha: string;
  head_sha: string;
  lines_changed: number;
  files_changed: number;
  complexity_bucket: "SMALL" | "MEDIUM" | "LARGE";
}

export interface PrListEntry {
  repo: string;
  pr: number;
  bucket: string;
  diff_size: number;
  base_sha: string;
  head_sha: string;
}

function loadEnv(dir: string): void {
  const p = join(dir, ".env");
  try {
    if (!existsSync(p)) return;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && process.env[m[1]!] === undefined) {
        const v = m[2]!.replace(/\s*#.*$/, "").replace(/^["']|["']$/g, "").trim();
        process.env[m[1]!] = v;
      }
    }
  } catch {
    // ignore
  }
}
loadEnv(process.cwd());
loadEnv(ROOT);

function getRemaining(res: Response): number {
  const v = res.headers.get("x-ratelimit-remaining");
  if (v == null) return 9999;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 9999 : n;
}

async function fetchWithRateLimit(
  url: string,
  token: string,
): Promise<{ res: Response; remaining: number }> {
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${token}` },
  });
  return { res, remaining: getRemaining(res) };
}

function isLowSignal(
  merged: boolean,
  draft: boolean,
  authorType: string | undefined,
  title: string,
  changedFiles: number,
  linesChanged: number,
): boolean {
  if (merged !== true || draft === true) return true;
  if (authorType !== "User") return true;
  if (LOW_SIGNAL_TITLE.test(title)) return true;
  if (changedFiles === 1 && linesChanged <= 10) return true;
  return false;
}

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

/** Sample up to cap PRs, balanced across buckets when possible. */
function sampleBalanced(candidates: GHPRMeta[], seed: number, cap: number): GHPRMeta[] {
  const byBucket = {
    SMALL: candidates.filter((c) => c.complexity_bucket === "SMALL"),
    MEDIUM: candidates.filter((c) => c.complexity_bucket === "MEDIUM"),
    LARGE: candidates.filter((c) => c.complexity_bucket === "LARGE"),
  };
  const order: ("SMALL" | "MEDIUM" | "LARGE")[] = ["SMALL", "MEDIUM", "LARGE"];
  const targetPer = Math.max(1, Math.floor(cap / 3));
  const selected: GHPRMeta[] = [];
  const taken = new Set<number>();

  for (let i = 0; i < order.length; i++) {
    const bucket = order[i]!;
    const pool = shuffle(byBucket[bucket], seed + i);
    let n = 0;
    for (const c of pool) {
      if (n >= targetPer || selected.length >= cap) break;
      if (taken.has(c.number)) continue;
      taken.add(c.number);
      selected.push(c);
      n++;
    }
  }
  const rest = candidates.filter((c) => !taken.has(c.number));
  const extra = shuffle(rest, seed + 99).slice(0, Math.max(0, cap - selected.length));
  for (const c of extra) selected.push(c);
  return selected.slice(0, cap);
}

async function fetchMergedPRs(
  token: string,
  owner: string,
  name: string,
  repoLabel: string,
  cap: number,
  debug: boolean,
): Promise<GHPRMeta[]> {
  const cutoffDate = new Date(Date.now() - SINCE_MONTHS * 30 * 24 * 60 * 60 * 1000);
  const valid: GHPRMeta[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const url = `https://api.github.com/repos/${owner}/${name}/pulls?state=closed&per_page=100&page=${page}&sort=updated&direction=desc`;
    const { res } = await fetchWithRateLimit(url, token);
    if (!res.ok) {
      if (debug) console.error(`[${repoLabel}] list ${res.status}`);
      break;
    }
    const list = (await res.json()) as Array<{
      number: number;
      draft?: boolean;
      merged_at: string | null;
      updated_at?: string | null;
      title?: string | null;
      user?: { type?: string };
      base?: { sha?: string };
      head?: { sha?: string };
    }>;
    if (!Array.isArray(list) || list.length === 0) break;

    let hitCutoff = false;
    for (const pr of list) {
      const updatedAt = pr.updated_at ? new Date(pr.updated_at) : null;
      if (updatedAt && updatedAt < cutoffDate) {
        hitCutoff = true;
        break;
      }
      if (!pr.base?.sha || !pr.head?.sha) continue;

      const detailUrl = `https://api.github.com/repos/${owner}/${name}/pulls/${pr.number}`;
      const { res: dr } = await fetchWithRateLimit(detailUrl, token);
      if (!dr.ok) continue;
      const detail = (await dr.json()) as {
        merged?: boolean;
        additions?: number | null;
        deletions?: number | null;
        changed_files?: number | null;
        user?: { type?: string };
      };
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
      });
    }

    if (debug) console.error(`[${repoLabel}] page ${page} valid ${valid.length}`);
    if (valid.length >= cap * 2 || hitCutoff) break;
    if (list.length < 100) break;
    page++;
  }

  return sampleBalanced(valid, 42, cap);
}

async function main(): Promise<void> {
  const debug = process.argv.includes("--debug");
  const token = process.env.GITHUB_TOKEN?.trim() ?? "";
  if (!token) {
    console.error("GITHUB_TOKEN required.");
    process.exit(1);
  }

  const allEntries: PrListEntry[] = [];

  for (const repo of REPOS) {
    const [owner, name] = repo.split("/");
    if (!owner || !name) continue;
    try {
      const prs = await fetchMergedPRs(token, owner, name, repo, PER_REPO_CAP, debug);
      for (const p of prs) {
        allEntries.push({
          repo,
          pr: p.number,
          bucket: p.complexity_bucket,
          diff_size: p.lines_changed,
          base_sha: p.base_sha,
          head_sha: p.head_sha,
        });
      }
      if (debug) console.error(`[${repo}] selected ${prs.length}`);
    } catch (e) {
      console.error(`[${repo}] error:`, e);
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(PR_LIST_PATH, JSON.stringify(allEntries, null, 2), "utf8");
  console.error(`Wrote ${allEntries.length} entries to ${PR_LIST_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
