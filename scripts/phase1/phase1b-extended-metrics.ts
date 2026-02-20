#!/usr/bin/env npx tsx
/**
 * Phase 1B-Extended — Metrics and sensitivity classification.
 * Reads artifacts/phase1b_extended/results.json.
 * Output: TOTAL_PRS, PRS_WITH_VIOLATIONS, VIOLATION_PCT, DECISION_DISTRIBUTION,
 * MINIMALCUT_STATS, CORRELATION_DIFFSIZE_MINCUT, BUCKET_BREAKDOWN, REPO_BREAKDOWN, FINAL_CLASSIFICATION.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const RESULTS_PATH = join(ROOT, "artifacts", "phase1b_extended", "results.json");

interface Row {
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

function loadResults(): Row[] {
  const raw = readFileSync(RESULTS_PATH, "utf8");
  const data = JSON.parse(raw);
  return Array.isArray(data) ? (data as Row[]) : [];
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n !== y.length || n < 2) return 0;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * (y[i] ?? 0), 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (den === 0) return 0;
  return num / den;
}

function main(): void {
  const rows = loadResults();
  const n = rows.length;
  if (n === 0) {
    console.log("TOTAL_PRS: 0");
    console.log("PRS_WITH_VIOLATIONS: 0");
    console.log("VIOLATION_PCT: 0");
    console.log("DECISION_DISTRIBUTION: {}");
    console.log("MINIMALCUT_STATS: {}");
    console.log("CORRELATION_DIFFSIZE_MINCUT: 0");
    console.log("BUCKET_BREAKDOWN: {}");
    console.log("REPO_BREAKDOWN: {}");
    console.log("FINAL_CLASSIFICATION: NO_SIGNAL");
    return;
  }

  const withViolations = rows.filter((r) => r.minimalCut > 0);
  const violationPct = (withViolations.length / n) * 100;

  const allow = rows.filter((r) => r.decision_level === "allow").length;
  const warn = rows.filter((r) => r.decision_level === "warn").length;
  const block = rows.filter((r) => r.decision_level === "block").length;

  const minCuts = rows.map((r) => r.minimalCut);
  const minMin = Math.min(...minCuts);
  const maxMin = Math.max(...minCuts);
  const sumMin = minCuts.reduce((a, b) => a + b, 0);
  const meanMin = sumMin / n;
  const sorted = [...minCuts].sort((a, b) => a - b);
  const medianMin = n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;

  const diffSizes = rows.map((r) => r.diff_size);
  const corrDiffMinCut = pearson(diffSizes, minCuts);

  const buckets = ["SMALL", "MEDIUM", "LARGE"] as const;
  const bucketBreakdown: Record<string, unknown> = {};
  for (const b of buckets) {
    const inBucket = rows.filter((r) => r.bucket === b);
    const m = inBucket.length;
    const withV = inBucket.filter((r) => r.minimalCut > 0).length;
    const avgMin = m > 0 ? inBucket.reduce((a, r) => a + r.minimalCut, 0) / m : 0;
    bucketBreakdown[b] = {
      count: m,
      pct_minimalCut_gt_0: m > 0 ? Math.round((withV / m) * 1000) / 10 : 0,
      avg_minimalCut: Math.round(avgMin * 100) / 100,
      allow: inBucket.filter((r) => r.decision_level === "allow").length,
      warn: inBucket.filter((r) => r.decision_level === "warn").length,
      block: inBucket.filter((r) => r.decision_level === "block").length,
    };
  }

  const repos = [...new Set(rows.map((r) => r.repo))].sort();
  const repoBreakdown: Record<string, unknown> = {};
  for (const repo of repos) {
    const inRepo = rows.filter((r) => r.repo === repo);
    const m = inRepo.length;
    const withV = inRepo.filter((r) => r.minimalCut > 0).length;
    repoBreakdown[repo] = {
      count: m,
      pct_violations: m > 0 ? Math.round((withV / m) * 1000) / 10 : 0,
      with_violations: withV,
    };
  }

  let classification: string;
  if (withViolations.length === 0) {
    classification = "NO_SIGNAL";
  } else if (violationPct >= 8) {
    classification = "STRONG_SIGNAL";
  } else if (violationPct >= 3) {
    classification = "MODERATE_SIGNAL";
  } else if (violationPct >= 1) {
    classification = "WEAK_SIGNAL";
  } else {
    classification = "RARE_EVENT_SIGNAL";
  }

  console.log("TOTAL_PRS: " + n);
  console.log("PRS_WITH_VIOLATIONS: " + withViolations.length);
  console.log("VIOLATION_PCT: " + Math.round(violationPct * 100) / 100);
  console.log(
    "DECISION_DISTRIBUTION: " +
      JSON.stringify({
        ALLOW: allow,
        WARN: warn,
        BLOCK: block,
        ALLOW_pct: Math.round((allow / n) * 1000) / 10,
        WARN_pct: Math.round((warn / n) * 1000) / 10,
        BLOCK_pct: Math.round((block / n) * 1000) / 10,
      }),
  );
  console.log(
    "MINIMALCUT_STATS: " +
      JSON.stringify({
        min: minMin,
        max: maxMin,
        mean: Math.round(meanMin * 100) / 100,
        median: medianMin,
      }),
  );
  console.log("CORRELATION_DIFFSIZE_MINCUT: " + Math.round(corrDiffMinCut * 10000) / 10000);
  console.log("BUCKET_BREAKDOWN: " + JSON.stringify(bucketBreakdown));
  console.log("REPO_BREAKDOWN: " + JSON.stringify(repoBreakdown));
  console.log("FINAL_CLASSIFICATION: " + classification);
}

main();
