#!/usr/bin/env npx tsx
/**
 * Phase 1B-Extended — Run structural certification on pr-list.json.
 * Reads artifacts/phase1b_extended/pr-list.json (repo, pr, bucket, diff_size, base_sha, head_sha).
 * Writes artifacts/phase1b_extended/results.json. No engine changes.
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PrListEntry } from "./phase1b-extended-build-pr-list.js";
import { TMP_BASE } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const PR_LIST_PATH = join(ROOT, "artifacts", "phase1b_extended", "pr-list.json");
const RESULTS_PATH = join(ROOT, "artifacts", "phase1b_extended", "results.json");
const CLI_PATH = join(ROOT, "scripts", "cli.ts");
const TIMEOUT_MS = 2 * 60 * 1000;

function slug(repo: string): string {
  return repo.replace(/\//g, "_");
}

function shallowCloneAndCheckout(
  workDir: string,
  cloneUrl: string,
  baseSha: string,
  headSha: string,
): void {
  mkdirSync(workDir, { recursive: true });
  execSync("git init", { encoding: "utf8", cwd: workDir, stdio: "pipe" });
  execSync(`git remote add origin ${cloneUrl}`, { encoding: "utf8", cwd: workDir, stdio: "pipe" });
  execSync(`git fetch --depth=1 origin ${baseSha}`, { encoding: "utf8", cwd: workDir, timeout: 90000, stdio: "pipe" });
  execSync(`git fetch --depth=1 origin ${headSha}`, { encoding: "utf8", cwd: workDir, timeout: 90000, stdio: "pipe" });
  execSync(`git checkout ${headSha}`, { encoding: "utf8", cwd: workDir, stdio: "pipe" });
}

function ensureCleanHead(workDir: string, headSha: string): void {
  if (!existsSync(workDir)) return;
  try {
    execSync(`git checkout ${headSha} -- .`, { encoding: "utf8", cwd: workDir, stdio: "pipe" });
    execSync("git clean -fd", { encoding: "utf8", cwd: workDir, stdio: "pipe" });
  } catch {
    // ignore
  }
}

interface ResultRow {
  repo: string;
  pr: number;
  bucket: string;
  diff_size: number;
  decision_level: string;
  minimalCut: number;
  coverage_ratio: number;
  violation_count: number;
  violation_kinds: string[];
  execution_ms: number;
}

function runStructuralForEntry(entry: PrListEntry): ResultRow {
  const [owner, name] = entry.repo.split("/");
  const cloneUrl = `https://github.com/${owner}/${name}.git`;
  const workDir = join(TMP_BASE, slug(entry.repo), String(entry.pr));

  if (!existsSync(workDir)) {
    shallowCloneAndCheckout(workDir, cloneUrl, entry.base_sha, entry.head_sha);
  } else {
    ensureCleanHead(workDir, entry.head_sha);
  }

  const reportPath = join(workDir, "artifacts", "run-single-structural.json");
  mkdirSync(join(workDir, "artifacts"), { recursive: true });

  const start = Date.now();
  spawnSync(
    "npx",
    ["tsx", CLI_PATH, "audit", "--all", "--base", entry.base_sha, "--head", entry.head_sha, "--json"],
    {
      encoding: "utf8",
      cwd: workDir,
      env: {
        ...process.env,
        ANCHR_REPORT_PATH: reportPath,
        GITHUB_BASE_SHA: entry.base_sha,
        GITHUB_HEAD_SHA: entry.head_sha,
        BASE_SHA: entry.base_sha,
        HEAD_SHA: entry.head_sha,
      },
      timeout: TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const execution_ms = Date.now() - start;

  let raw = "";
  try {
    raw = readFileSync(reportPath, "utf8");
  } catch {
    // ignore
  }
  type ReportShape = {
    decision?: { level?: string };
    confidence?: { coverageRatio?: number };
    classification?: { primaryCause?: string | null };
    minimalCut?: string[];
  };
  let report: ReportShape | null = null;
  try {
    if (raw) report = JSON.parse(raw) as ReportShape;
  } catch {
    // ignore
  }

  const decision_level = (report?.decision?.level ?? "allow").toLowerCase();
  const minimal_cut_size = Array.isArray(report?.minimalCut) ? report.minimalCut.length : 0;
  const primary_cause = report?.classification?.primaryCause ?? null;
  const violation_kinds = primary_cause ? [primary_cause] : [];

  return {
    repo: entry.repo,
    pr: entry.pr,
    bucket: entry.bucket,
    diff_size: entry.diff_size,
    decision_level,
    minimalCut: minimal_cut_size,
    coverage_ratio: typeof report?.confidence?.coverageRatio === "number" ? report.confidence.coverageRatio : 0,
    violation_count: minimal_cut_size,
    violation_kinds,
    execution_ms,
  };
}

function main(): void {
  const raw = readFileSync(PR_LIST_PATH, "utf8");
  const entries = JSON.parse(raw) as PrListEntry[];
  if (!Array.isArray(entries) || entries.length === 0) {
    console.error("No entries in pr-list.json");
    process.exit(1);
  }

  mkdirSync(join(ROOT, "artifacts", "phase1b_extended"), { recursive: true });

  const results: ResultRow[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    process.stderr.write(`[${i + 1}/${entries.length}] ${entry.repo}#${entry.pr} ... `);
    try {
      const row = runStructuralForEntry(entry);
      results.push(row);
      process.stderr.write(`${row.decision_level} minCut=${row.minimalCut}\n`);
    } catch (e) {
      process.stderr.write(`error: ${e}\n`);
      results.push({
        repo: entry.repo,
        pr: entry.pr,
        bucket: entry.bucket,
        diff_size: entry.diff_size,
        decision_level: "allow",
        minimalCut: 0,
        coverage_ratio: 0,
        violation_count: 0,
        violation_kinds: [],
        execution_ms: 0,
      });
    }
  }

  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + "\n", "utf8");
  console.error(`Wrote ${results.length} results to ${RESULTS_PATH}`);
}

main();
