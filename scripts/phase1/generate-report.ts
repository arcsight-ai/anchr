#!/usr/bin/env npx tsx
/**
 * Phase 1 — Produce internal report (Step 11) from distribution + weak-recall + optional precision.
 * Usage: npx tsx scripts/phase1/generate-report.ts [analysisDir] [precision] [truePositives] [falsePositives]
 *   precision args: if provided, report includes Precision (with CI). Example: 0.75 30 10
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { precisionCI } from "./statistical-ci.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const DEFAULT_ANALYSIS = join(ROOT, "artifacts", "phase1", "analysis");
const DEFAULT_OUT = join(ROOT, "artifacts", "phase1");

interface DistributionSummary {
  total_prs: number;
  block_pct: number;
  warn_pct: number;
  allow_pct: number;
  high_confidence_pct: number;
  medium_confidence_pct: number;
  low_confidence_pct: number;
  avg_coverage_by_bucket: Record<string, number>;
}

interface WeakRecallResult {
  subset_count: number;
  flagged_count: number;
  flagged_pct: number;
  interpretation: string;
}

function main(): void {
  const analysisDir = process.argv[2] ?? DEFAULT_ANALYSIS;
  const outDir = DEFAULT_OUT;
  mkdirSync(outDir, { recursive: true });

  let dist: DistributionSummary | null = null;
  let recall: WeakRecallResult | null = null;
  try {
    dist = JSON.parse(readFileSync(join(analysisDir, "distribution.json"), "utf8")) as DistributionSummary;
  } catch {
    // optional
  }
  try {
    recall = JSON.parse(readFileSync(join(analysisDir, "weak-recall.json"), "utf8")) as WeakRecallResult;
  } catch {
    // optional
  }

  const truePositives = process.argv[4] ? parseInt(process.argv[4], 10) : null;
  const falsePositives = process.argv[5] ? parseInt(process.argv[5], 10) : null;
  const precisionStr = truePositives != null && falsePositives != null ? precisionCI(truePositives, falsePositives) : null;

  const reposTested = dist ? "(from records)" : "";
  const totalPrs = dist?.total_prs ?? "";
  const blockPct = dist != null ? dist.block_pct.toFixed(1) + "%" : "";
  const warnPct = dist != null ? dist.warn_pct.toFixed(1) + "%" : "";
  const allowPct = dist != null ? dist.allow_pct.toFixed(1) + "%" : "";
  const highPct = dist != null ? dist.high_confidence_pct.toFixed(1) + "%" : "";
  const medPct = dist != null ? dist.medium_confidence_pct.toFixed(1) + "%" : "";
  const lowPct = dist != null ? dist.low_confidence_pct.toFixed(1) + "%" : "";
  const precisionWithCI = precisionStr
    ? `${(precisionStr.precision * 100).toFixed(1)}% (CI ±${(precisionStr.ciHalfWidth * 100).toFixed(1)}%, [${(precisionStr.ciLower * 100).toFixed(1)}%, ${(precisionStr.ciUpper * 100).toFixed(1)}%])`
    : "(fill after blind review)";
  const weakRecallStr = recall
    ? `${recall.flagged_pct.toFixed(1)}% (${recall.flagged_count}/${recall.subset_count}) — ${recall.interpretation}`
    : "";

  const bucketRows =
    dist?.avg_coverage_by_bucket &&
    Object.entries(dist.avg_coverage_by_bucket)
      .map(([k, v]) => `| ${k} | ${(v * 100).toFixed(1)}% |`)
      .join("\n");

  const md = `# Phase 1 — Internal Report (Step 11)

Do not adjust engine until this report is complete.

---

## Summary

| Field | Value |
|-------|--------|
| Repos tested | ${reposTested} |
| Total PRs | ${totalPrs} |
| Block % | ${blockPct} |
| Warn % | ${warnPct} |
| Allow % | ${allowPct} |
| High confidence % | ${highPct} |
| Medium confidence % | ${medPct} |
| Low confidence % | ${lowPct} |
| Precision (with CI) | ${precisionWithCI} |
| Weak recall proxy | ${weakRecallStr} |

---

## Distribution by complexity

| Bucket | Avg coverageRatio |
|--------|-------------------|
${bucketRows ?? "| (run distribution first) | |"}

---

## Weak recall

- Subset (lines>300 / cross-dir / public API): ${recall?.subset_count ?? "—"}
- Flagged (warn/block): ${recall?.flagged_count ?? "—"}
- %: ${recall != null ? recall.flagged_pct.toFixed(1) : "—"}
- Interpretation: ${recall?.interpretation ?? "—"}

---

## Observed patterns

(Describe: Does signal scale with diff size? Does coverage increase with complexity? Mostly silent on small PRs?)

---

## Failure patterns

(Describe: False positives, missed risks, calibration issues.)

---

## Interpretation (Step 12)

- [ ] Signal correlates with diff complexity
- [ ] Precision ≥ 70%
- [ ] Silence mostly on trivial PRs  
→ **The brain works.**

- [ ] No correlation with complexity
- [ ] Random decision distribution
- [ ] Precision < 60%  
→ **Core wedge logic review required.**
`;

  const outPath = join(outDir, "phase1-internal-report.md");
  writeFileSync(outPath, md, "utf8");
  console.log("Report written to", outPath);
}

main();
