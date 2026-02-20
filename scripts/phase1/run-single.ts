#!/usr/bin/env npx tsx
/**
 * Phase 1A — Run certification for a single PR (baseline or post-violation).
 * Uses pilot artifact for base_sha/head_sha; optional --use-current-head for violation run.
 *
 * Usage:
 *   Baseline:  npx tsx scripts/phase1/run-single.ts --repo owner/repo --pr PR_NUMBER
 *   Violation: npx tsx scripts/phase1/run-single.ts --repo owner/repo --pr PR_NUMBER --use-current-head
 *
 * Output: JSON to stdout (decision_level, coverage_ratio, minimal_cut_size, primary_cause, execution_ms).
 */

import { execSync, spawnSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PilotRecord } from "./pilot-types.js";
import { TMP_BASE } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const PILOT_ARTIFACTS = join(ROOT, "artifacts", "phase1", "pilot");
const CERTIFY_TIMEOUT_MS = 2 * 60 * 1000;
const DINARuns = 6;

function parseArgs(): { repo: string; pr: number; useCurrentHead: boolean; lock: boolean; structural: boolean } {
  const argv = process.argv.slice(2);
  let repo = "";
  let pr = 0;
  let useCurrentHead = false;
  let lock = false;
  let structural = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo" && argv[i + 1]) {
      repo = argv[i + 1]!;
      i++;
    } else if (argv[i] === "--pr" && argv[i + 1]) {
      pr = parseInt(argv[i + 1]!, 10) || 0;
      i++;
    } else if (argv[i] === "--use-current-head") useCurrentHead = true;
    else if (argv[i] === "--lock") lock = true;
    else if (argv[i] === "--structural") structural = true;
  }
  return { repo, pr, useCurrentHead, lock, structural };
}

function emitLock(): void {
  let engine_version = "0.1.0";
  try {
    const p = join(ROOT, "package.json");
    const j = JSON.parse(readFileSync(p, "utf8")) as { version?: string };
    if (j.version) engine_version = j.version;
  } catch {
    // ignore
  }
  let config_hash = "";
  let rules_hash = "";
  try {
    const configPath = join(ROOT, "scripts", "phase1", "config.ts");
    if (existsSync(configPath)) {
      config_hash = createHash("sha256").update(readFileSync(configPath, "utf8")).digest("hex").slice(0, 16);
    }
    const dinaPath = join(ROOT, "scripts", "dina.ts");
    if (existsSync(dinaPath)) {
      rules_hash = createHash("sha256").update(readFileSync(dinaPath, "utf8")).digest("hex").slice(0, 16);
    }
  } catch {
    // ignore
  }
  const seed = process.env.PHASE1_SEED != null ? String(process.env.PHASE1_SEED) : "42";
  console.log(JSON.stringify({ engine_version, rules_hash, config_hash, seed }, null, 2));
}

function slug(repo: string): string {
  return repo.replace(/\//g, "_");
}

function loadPilotRecord(repo: string, prNumber: number): PilotRecord | null {
  const path = join(PILOT_ARTIFACTS, slug(repo), `${prNumber}.json`);
  try {
    const raw = readFileSync(path, "utf8");
    const r = JSON.parse(raw) as PilotRecord;
    return r.repo && r.pr_number != null ? r : null;
  } catch {
    return null;
  }
}

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
  execSync(`git checkout ${headSha}`, { encoding: "utf8", cwd: workDir, stdio: "pipe" });
}

function runCertification(
  cwd: string,
  baseSha: string,
  headRef: string
): {
  decision_level: string;
  coverage_ratio: number;
  minimal_cut_size: number;
  primary_cause: string | null;
  execution_ms: number;
  rule_evaluation_trace: string[];
} {
  const reportPath = join(cwd, "artifacts", "run-single-report.json");
  mkdirSync(join(cwd, "artifacts"), { recursive: true });
  const env = {
    ...process.env,
    REPORT_PATH: reportPath,
    BASE_SHA: baseSha,
    HEAD_SHA: headRef,
  };
  const start = Date.now();
  spawnSync(
    "npx",
    ["tsx", join(ROOT, "scripts", "dina.ts"), "certify", "--base", baseSha, "--head", headRef, "--runs", String(DINARuns)],
    {
      encoding: "utf8",
      cwd,
      env,
      timeout: CERTIFY_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
    }
  );
  const execution_ms = Date.now() - start;
  let raw = "";
  try {
    raw = readFileSync(reportPath, "utf8");
  } catch {
    // ignore
  }
  let report: {
    certification_status?: string;
    confidence_score?: number;
    violation_classification?: string | null;
    attack_vectors_triggered?: string[];
  } | null = null;
  try {
    if (raw) report = JSON.parse(raw) as typeof report;
  } catch {
    // ignore
  }
  const certification_status = report?.certification_status;
  const decision_level = certification_status === "PASS" ? "allow" : "block";
  const coverage_ratio = typeof report?.confidence_score === "number" ? report.confidence_score : 0;
  const primary_cause = report?.violation_classification ?? null;
  const rule_evaluation_trace = Array.isArray(report?.attack_vectors_triggered) ? report.attack_vectors_triggered : [];
  return {
    decision_level,
    coverage_ratio,
    minimal_cut_size: 0,
    primary_cause,
    execution_ms,
    rule_evaluation_trace,
  };
}

function runStructuralAudit(
  cwd: string,
  baseSha: string,
  headRef: string
): {
  decision_level: string;
  coverage_ratio: number;
  minimal_cut_size: number;
  primary_cause: string | null;
  execution_ms: number;
  rule_evaluation_trace: string[];
} {
  const reportPath = join(cwd, "artifacts", "run-single-structural.json");
  mkdirSync(join(cwd, "artifacts"), { recursive: true });
  const env = {
    ...process.env,
    ANCHR_REPORT_PATH: reportPath,
    GITHUB_BASE_SHA: baseSha,
    GITHUB_HEAD_SHA: headRef,
    BASE_SHA: baseSha,
    HEAD_SHA: headRef,
  };
  const start = Date.now();
  spawnSync(
    "npx",
    ["tsx", join(ROOT, "scripts", "cli.ts"), "audit", "--all", "--base", baseSha, "--head", headRef, "--json"],
    {
      encoding: "utf8",
      cwd,
      env,
      timeout: CERTIFY_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    }
  );
  const execution_ms = Date.now() - start;
  let raw = "";
  try {
    raw = readFileSync(reportPath, "utf8");
  } catch {
    // ignore
  }
  let report: {
    decision?: { level?: string };
    confidence?: { coverageRatio?: number };
    classification?: { primaryCause?: string | null };
    minimalCut?: string[];
  } | null = null;
  try {
    if (raw) report = JSON.parse(raw) as typeof report;
  } catch {
    // ignore
  }
  const decision_level = report?.decision?.level ?? "allow";
  const coverage_ratio = typeof report?.confidence?.coverageRatio === "number" ? report.confidence.coverageRatio : 0;
  const primary_cause = report?.classification?.primaryCause ?? null;
  const minimal_cut_size = Array.isArray(report?.minimalCut) ? report.minimalCut.length : 0;
  const rule_evaluation_trace = primary_cause ? [primary_cause] : [];
  return {
    decision_level,
    coverage_ratio,
    minimal_cut_size,
    primary_cause,
    execution_ms,
    rule_evaluation_trace,
  };
}

function main(): void {
  const { repo, pr, useCurrentHead, lock, structural } = parseArgs();
  if (lock) {
    emitLock();
    process.exit(0);
  }
  if (!repo || pr <= 0) {
    console.error("Usage: npx tsx scripts/phase1/run-single.ts --repo owner/repo --pr PR_NUMBER [--use-current-head] [--structural] | --lock");
    process.exit(1);
  }
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    console.error("Invalid --repo. Use owner/name.");
    process.exit(1);
  }
  const record = loadPilotRecord(repo, pr);
  if (!record) {
    console.error("Pilot artifact not found for", repo, "PR", pr, ". Run pilot first.");
    process.exit(1);
  }
  const workDir = join(TMP_BASE, slug(repo), String(pr));
  const cloneUrl = `https://github.com/${parts[0]}/${parts[1]}.git`;
  if (!existsSync(workDir)) {
    shallowCloneAndCheckout(workDir, cloneUrl, record.base_sha, record.head_sha);
  }
  let headRef: string;
  if (useCurrentHead) {
    headRef = execSync("git rev-parse HEAD", { encoding: "utf8", cwd: workDir }).trim();
  } else {
    headRef = record.head_sha;
  }
  const result = structural
    ? runStructuralAudit(workDir, record.base_sha, headRef)
    : runCertification(workDir, record.base_sha, headRef);
  const out: Record<string, unknown> = {
    decision_level: result.decision_level,
    coverage_ratio: result.coverage_ratio,
    minimal_cut_size: result.minimal_cut_size,
    primary_cause: result.primary_cause,
    execution_ms: result.execution_ms,
    rule_evaluation_trace: result.rule_evaluation_trace,
  };
  console.log(JSON.stringify(out, null, 2));
}

main();
