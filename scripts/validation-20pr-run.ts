#!/usr/bin/env npx tsx
/**
 * 20 PR validation — Run ANCHR for each PR in validation-20pr-manifest.json.
 * Frozen engine only. No fixes mid-run: if something breaks, log and continue.
 *
 * Usage: npx tsx scripts/validation-20pr-run.ts
 *        RUN_MISSING_ONLY=1 npx tsx scripts/validation-20pr-run.ts  # run only PRs with no result JSON yet
 *
 * Writes: docs/validation-20pr/results/<PR_ID>.json (raw ANCHR report per PR).
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST_PATH = join(ROOT, "docs", "validation-20pr", "validation-20pr-manifest.json");
const RESULTS_DIR = join(ROOT, "docs", "validation-20pr", "results");
const CLI_PATH = join(ROOT, "scripts", "cli.ts");
const TMP_BASE = join(tmpdir(), "anchr-validation-20pr");
const TIMEOUT_MS = 2 * 60 * 1000;

interface ManifestEntry {
  pr_id: string;
  repo: string;
  pr: number;
  base_sha: string;
  head_sha: string;
}

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
  execSync(`git fetch --depth=1 origin ${baseSha}`, {
    encoding: "utf8",
    cwd: workDir,
    timeout: 90000,
    stdio: "pipe",
  });
  execSync(`git fetch --depth=1 origin ${headSha}`, {
    encoding: "utf8",
    cwd: workDir,
    timeout: 90000,
    stdio: "pipe",
  });
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

function runOne(entry: ManifestEntry, index: number, total: number): void {
  const [owner, name] = entry.repo.split("/");
  const cloneUrl = `https://github.com/${owner}/${name}.git`;
  const workDir = join(TMP_BASE, slug(entry.repo), String(entry.pr));
  const reportPath = join(RESULTS_DIR, `${entry.pr_id}.json`);

  if (!existsSync(workDir)) {
    try {
      shallowCloneAndCheckout(workDir, cloneUrl, entry.base_sha, entry.head_sha);
    } catch (e) {
      process.stderr.write(
        `[${index + 1}/${total}] ${entry.pr_id} clone/checkout failed — log it, do not fix. ${String(e)}\n`,
      );
      return;
    }
  } else {
    ensureCleanHead(workDir, entry.head_sha);
  }

  const start = Date.now();
  const result = spawnSync(
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
  const elapsed = Date.now() - start;

  if (result.status !== 0 && result.stderr) {
    process.stderr.write(
      `[${index + 1}/${total}] ${entry.pr_id} exit ${result.status} — log it, do not fix. ${result.stderr.slice(0, 500)}\n`,
    );
  }
  if (!existsSync(reportPath)) {
    process.stderr.write(
      `[${index + 1}/${total}] ${entry.pr_id} no report written after run — log it, do not fix.\n`,
    );
  } else {
    process.stderr.write(`[${index + 1}/${total}] ${entry.pr_id} ok ${elapsed}ms\n`);
  }
}

function main(): void {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  let entries = JSON.parse(raw) as ManifestEntry[];
  if (!Array.isArray(entries) || entries.length !== 20) {
    process.stderr.write("Expected 20 entries in validation-20pr-manifest.json\n");
    process.exit(1);
  }

  const runMissingOnly = process.env.RUN_MISSING_ONLY === "1";
  if (runMissingOnly) {
    entries = entries.filter((e) => !existsSync(join(RESULTS_DIR, `${e.pr_id}.json`)));
    process.stderr.write(`RUN_MISSING_ONLY=1: running ${entries.length} PRs with no result yet.\n`);
  }

  mkdirSync(RESULTS_DIR, { recursive: true });

  for (let i = 0; i < entries.length; i++) {
    runOne(entries[i]!, i, entries.length);
  }

  process.stderr.write("Validation run complete. Do not inspect until all 20 done; then fill evaluation-table and metrics.\n");
}

main();
