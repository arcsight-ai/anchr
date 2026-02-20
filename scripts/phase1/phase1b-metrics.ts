#!/usr/bin/env npx tsx
/**
 * Phase 1B — Dataset metrics and sensitivity classification.
 * Reads artifacts/phase1b/pilot-structural-results.json.
 * No engine changes. Pure measurement.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const RESULTS_PATH = join(ROOT, "artifacts", "phase1b", "pilot-structural-results.json");

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

function decisionToNum(level: string): number {
  const l = level.toLowerCase();
  if (l === "allow") return 0;
  if (l === "warn") return 1;
  if (l === "block") return 2;
  return 0;
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
    console.log("DECISION_DISTRIBUTION: {}");
    console.log("MINIMALCUT_STATS: {}");
    console.log("CORRELATION_DIFFSIZE_MINCUT: 0");
    console.log("BUCKET_BREAKDOWN: {}");
    console.log("FINAL_CLASSIFICATION: NO_REAL_WORLD_SIGNAL");
    return;
  }

  const withViolations = rows.filter((r) => r.minimalCut > 0);
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
  const decisionNums = rows.map((r) => decisionToNum(r.decision_level));
  const corrDiffMinCut = pearson(diffSizes, minCuts);
  const corrDiffDecision = pearson(diffSizes, decisionNums);

  const buckets = ["SMALL", "MEDIUM", "LARGE"] as const;
  const bucketBreakdown: Record<string, unknown> = {};
  for (const b of buckets) {
    const inBucket = rows.filter((r) => r.bucket === b);
    const m = inBucket.length;
    const withV = inBucket.filter((r) => r.minimalCut > 0).length;
    const avgMin = m > 0 ? inBucket.reduce((a, r) => a + r.minimalCut, 0) / m : 0;
    const allowB = inBucket.filter((r) => r.decision_level === "allow").length;
    const warnB = inBucket.filter((r) => r.decision_level === "warn").length;
    const blockB = inBucket.filter((r) => r.decision_level === "block").length;
    bucketBreakdown[b] = {
      count: m,
      pct_minimalCut_gt_0: m > 0 ? (withV / m) * 100 : 0,
      avg_minimalCut: Math.round(avgMin * 100) / 100,
      allow: allowB,
      warn: warnB,
      block: blockB,
    };
  }

  const pctWithViolations = (withViolations.length / n) * 100;
  let classification: string;
  if (withViolations.length === 0) {
    classification = "NO_REAL_WORLD_SIGNAL";
  } else if (pctWithViolations >= 10) {
    classification = "SENSITIVITY_STRONG";
  } else if (pctWithViolations >= 3) {
    classification = "SENSITIVITY_MODERATE";
  } else {
    classification = "SENSITIVITY_WEAK";
  }

  console.log("TOTAL_PRS: " + n);
  console.log("PRS_WITH_VIOLATIONS: " + withViolations.length);
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
  console.log("FINAL_CLASSIFICATION: " + classification);
}

main();
