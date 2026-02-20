#!/usr/bin/env npx tsx
/**
 * Phase 1 — Run distribution + weak recall + blind sample from artifacts/phase1/results.
 * Usage: npx tsx scripts/phase1/run-analysis.ts [resultsDir] [outDir]
 */

import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { loadRecords, computeDistribution } from "./distribution.js";
import { computeWeakRecall } from "./weak-recall.js";
import { writeBlindSample } from "./blind-sample.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const DEFAULT_RESULTS = join(ROOT, "artifacts", "phase1", "results");
const DEFAULT_OUT = join(ROOT, "artifacts", "phase1", "analysis");

function main(): void {
  const resultsDir = process.argv[2] ?? DEFAULT_RESULTS;
  const outDir = process.argv[3] ?? DEFAULT_OUT;
  mkdirSync(outDir, { recursive: true });

  const records = loadRecords(resultsDir);
  if (records.length === 0) {
    console.log("No Phase1Record files found in", resultsDir);
    process.exit(0);
  }

  const dist = computeDistribution(records);
  writeFileSync(join(outDir, "distribution.json"), JSON.stringify(dist, null, 2), "utf8");
  console.log("Distribution:", dist.total_prs, "PRs", "Block%", dist.block_pct.toFixed(1), "Warn%", dist.warn_pct.toFixed(1), "Allow%", dist.allow_pct.toFixed(1));

  const recall = computeWeakRecall(records);
  writeFileSync(join(outDir, "weak-recall.json"), JSON.stringify(recall, null, 2), "utf8");
  console.log("Weak recall:", recall.subset_count, "in subset,", recall.flagged_pct.toFixed(1), "% flagged →", recall.interpretation);

  writeBlindSample(resultsDir, join(outDir, "blind-sample.json"));
  console.log("Blind sample written to", join(outDir, "blind-sample.json"));
}

main();
