/**
 * Phase 1 — Historical replay: run certification base→head, capture report + diff stats, write Phase1Record.
 * Run from repo root; expects repo already cloned and base/head available.
 */

import { execSync, spawnSync } from "child_process";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getComplexityBucket } from "./config.js";
import type { Phase1Record } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CLI_SCRIPT = join(ROOT, "scripts", "cli.ts");

function runAudit(cwd: string, baseSha: string, headSha: string): string {
  const reportPath = join(cwd, "artifacts", "phase1-report.json");
  const reportDir = join(cwd, "artifacts");
  try {
    mkdirSync(reportDir, { recursive: true });
  } catch {
    // ignore
  }
  const env = {
    ...process.env,
    GITHUB_BASE_SHA: baseSha,
    GITHUB_HEAD_SHA: headSha,
    HEAD_SHA: headSha,
    BASE_SHA: baseSha,
    ANCHR_REPORT_PATH: reportPath,
  };
  spawnSync("npx", ["tsx", CLI_SCRIPT, "audit", "--all", "--base", baseSha, "--head", headSha, "--json"], {
    encoding: "utf8",
    cwd,
    env,
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  try {
    return readFileSync(reportPath, "utf8");
  } catch {
    return "";
  }
}

function getDiffStats(cwd: string, baseSha: string, headSha: string): { linesChanged: number; filesChanged: number; paths: string[] } {
  let out = "";
  try {
    out = execSync(`git diff --shortstat ${baseSha} ${headSha}`, { encoding: "utf8", cwd });
  } catch {
    return { linesChanged: 0, filesChanged: 0, paths: [] };
  }
  const match = out.match(/(\d+)\s+files? changed(?:,\s*(\d+)\s+insertions?\(\+\\))?(?:,\s*(\d+)\s+deletions?\(-\))?/);
  const filesChanged = match ? parseInt(match[1]!, 10) : 0;
  const insertions = match && match[2] ? parseInt(match[2], 10) : 0;
  const deletions = match && match[3] ? parseInt(match[3], 10) : 0;
  const linesChanged = insertions + deletions;
  let paths: string[] = [];
  try {
    const nameOut = execSync(`git diff --name-only ${baseSha} ${headSha}`, { encoding: "utf8", cwd });
    paths = nameOut.split("\n").map((p) => p.trim()).filter(Boolean);
  } catch {
    // ignore
  }
  return { linesChanged, filesChanged, paths };
}

function isCrossDirectory(paths: string[]): boolean {
  const dirs = new Set(paths.map((p) => p.split("/")[0]).filter(Boolean));
  return dirs.size > 1;
}

function isPublicApiTouched(paths: string[], cwd: string, baseSha: string, headSha: string): boolean {
  try {
    const diff = execSync(`git diff ${baseSha} ${headSha} -- "*.ts" "*.tsx"`, { encoding: "utf8", cwd, maxBuffer: 2 * 1024 * 1024 });
    const lower = diff.toLowerCase();
    return /\bexport\b/.test(lower) || /\bpublic\b/.test(lower);
  } catch {
    return false;
  }
}

export function captureOne(
  cwd: string,
  repo: string,
  prNumber: number,
  baseSha: string,
  headSha: string
): Phase1Record | null {
  const raw = runAudit(cwd, baseSha, headSha);
  let report: { decision?: { level?: string }; confidence?: { coverageRatio?: number }; classification?: { primaryCause?: string | null }; minimalCut?: string[] } | null = null;
  try {
    if (raw) report = JSON.parse(raw) as typeof report;
  } catch {
    // ignore
  }

  const { linesChanged, filesChanged, paths } = getDiffStats(cwd, baseSha, headSha);
  const complexity_bucket = getComplexityBucket(linesChanged);
  const single_file = filesChanged <= 1;
  const multi_file = filesChanged > 1;
  const cross_directory = isCrossDirectory(paths);
  const public_api_touched = isPublicApiTouched(paths, cwd, baseSha, headSha);

  const record: Phase1Record = {
    repo,
    pr_number: prNumber,
    base_sha: baseSha,
    head_sha: headSha,
    lines_changed: linesChanged,
    files_changed: filesChanged,
    decision_level: report?.decision?.level ?? "allow",
    confidence_coverage_ratio: typeof report?.confidence?.coverageRatio === "number" ? report.confidence.coverageRatio : 0,
    classification_primary_cause: report?.classification?.primaryCause ?? null,
    minimal_cut_length: Array.isArray(report?.minimalCut) ? report.minimalCut.length : 0,
    timestamp: new Date().toISOString(),
    complexity_bucket,
    single_file,
    multi_file,
    cross_directory,
    public_api_touched,
  };
  return record;
}

export function writeRecord(record: Phase1Record, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  const name = `${record.repo.replace(/\//g, "_")}-${record.pr_number}.json`;
  writeFileSync(join(outDir, name), JSON.stringify(record, null, 2), "utf8");
}
