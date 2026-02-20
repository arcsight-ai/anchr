/**
 * Phase 1 — Distribution analysis (Step 5). Read Phase1Record[] and compute Block/Warn/Allow %, confidence %, averages.
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { Phase1Record } from "./types.js";

export function loadRecords(resultsDir: string): Phase1Record[] {
  const records: Phase1Record[] = [];
  try {
    const files = readdirSync(resultsDir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".json"));
    for (const f of files) {
      try {
        const raw = readFileSync(join(resultsDir, f.name), "utf8");
        const r = JSON.parse(raw) as Phase1Record;
        if (r.repo && r.pr_number != null) records.push(r);
      } catch {
        // skip
      }
    }
  } catch {
    // ignore
  }
  return records;
}

export interface DistributionSummary {
  total_prs: number;
  block_pct: number;
  warn_pct: number;
  allow_pct: number;
  high_confidence_pct: number;
  medium_confidence_pct: number;
  low_confidence_pct: number;
  avg_coverage_by_bucket: Record<string, number>;
  avg_coverage_by_repo: Record<string, number>;
  avg_coverage_by_file_count: Record<string, number>;
}

export function computeDistribution(records: Phase1Record[]): DistributionSummary {
  const total = records.length;
  const block = records.filter((r) => r.decision_level === "block").length;
  const warn = records.filter((r) => r.decision_level === "warn").length;
  const allow = records.filter((r) => r.decision_level === "allow" || !["block", "warn"].includes(r.decision_level)).length;
  const high = records.filter((r) => r.confidence_coverage_ratio >= 0.95).length;
  const medium = records.filter((r) => r.confidence_coverage_ratio >= 0.8 && r.confidence_coverage_ratio < 0.95).length;
  const low = records.filter((r) => r.confidence_coverage_ratio < 0.8).length;

  const byBucket: Record<string, number[]> = {};
  const byRepo: Record<string, number[]> = {};
  const byFileCount: Record<string, number[]> = {};
  for (const r of records) {
    const b = r.complexity_bucket;
    if (!byBucket[b]) byBucket[b] = [];
    byBucket[b].push(r.confidence_coverage_ratio);
    if (!byRepo[r.repo]) byRepo[r.repo] = [];
    byRepo[r.repo].push(r.confidence_coverage_ratio);
    const fc = r.files_changed <= 1 ? "1" : r.files_changed <= 5 ? "2-5" : "6+";
    if (!byFileCount[fc]) byFileCount[fc] = [];
    byFileCount[fc].push(r.confidence_coverage_ratio);
  }

  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  return {
    total_prs: total,
    block_pct: total ? (block / total) * 100 : 0,
    warn_pct: total ? (warn / total) * 100 : 0,
    allow_pct: total ? (allow / total) * 100 : 0,
    high_confidence_pct: total ? (high / total) * 100 : 0,
    medium_confidence_pct: total ? (medium / total) * 100 : 0,
    low_confidence_pct: total ? (low / total) * 100 : 0,
    avg_coverage_by_bucket: Object.fromEntries(Object.entries(byBucket).map(([k, v]) => [k, avg(v)])),
    avg_coverage_by_repo: Object.fromEntries(Object.entries(byRepo).map(([k, v]) => [k, avg(v)])),
    avg_coverage_by_file_count: Object.fromEntries(Object.entries(byFileCount).map(([k, v]) => [k, avg(v)])),
  };
}
