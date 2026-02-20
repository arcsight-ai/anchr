#!/usr/bin/env npx tsx
/**
 * Phase 1 — Health checks (Section 4) and correlation test (Section 5).
 * Loads pilot artifacts, computes correlation(diff_size, coverage_ratio), variance, healthy/unhealthy flags.
 * Usage: npx tsx scripts/phase1/health-and-correlation.ts [artifacts/phase1/pilot]
 * Writes: artifacts/phase1/phase1-health-report.md
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PilotRecord } from "./pilot-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const DEFAULT_PILOT = join(ROOT, "artifacts", "phase1", "pilot");

function loadPilotRecords(pilotDir: string): PilotRecord[] {
  const records: PilotRecord[] = [];
  try {
    const repoDirs = readdirSync(pilotDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const rd of repoDirs) {
      const dirPath = join(pilotDir, rd.name);
      const files = readdirSync(dirPath, { withFileTypes: true }).filter(
        (e) => e.isFile() && e.name.endsWith(".json")
      );
      for (const f of files) {
        try {
          const raw = readFileSync(join(dirPath, f.name), "utf8");
          const r = JSON.parse(raw) as PilotRecord;
          if (r.repo && r.pr_number != null) records.push(r);
        } catch {
          // skip
        }
      }
    }
  } catch {
    // ignore
  }
  return records;
}

/** Pearson correlation between two arrays (same length). Returns NaN if insufficient or zero variance. */
function correlation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return NaN;
  const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
  const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - meanX;
    const dy = y[i]! - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (den === 0) return NaN;
  return num / den;
}

/** Sample variance of array. */
function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (arr.length - 1);
}

function main(): void {
  const pilotDir = process.argv[2] ?? DEFAULT_PILOT;
  const records = loadPilotRecords(pilotDir);
  const ok = records.filter((r) => r.status === "ok");
  const outDir = join(ROOT, "artifacts", "phase1");
  mkdirSync(outDir, { recursive: true });

  const total = records.length;
  const block = ok.filter((r) => r.decision_level === "block");
  const warn = ok.filter((r) => r.decision_level === "warn");
  const allow = ok.filter((r) => r.decision_level !== "block" && r.decision_level !== "warn");
  const blockPct = ok.length ? (block.length / ok.length) * 100 : 0;
  const warnPct = ok.length ? (warn.length / ok.length) * 100 : 0;
  const allowPct = ok.length ? (allow.length / ok.length) * 100 : 0;

  const byBucket: Record<string, PilotRecord[]> = { SMALL: [], MEDIUM: [], LARGE: [] };
  for (const r of ok) {
    const b = r.complexity_bucket;
    if (b in byBucket) byBucket[b].push(r);
  }
  const avgCoverageByBucket: Record<string, number> = {};
  const allowPctByBucket: Record<string, number> = {};
  const blockPctByBucket: Record<string, number> = {};
  for (const [b, arr] of Object.entries(byBucket)) {
    avgCoverageByBucket[b] = arr.length ? arr.reduce((s, r) => s + r.coverage_ratio, 0) / arr.length : 0;
    allowPctByBucket[b] = arr.length ? (arr.filter((r) => r.decision_level !== "block" && r.decision_level !== "warn").length / arr.length) * 100 : 0;
    blockPctByBucket[b] = arr.length ? (arr.filter((r) => r.decision_level === "block").length / arr.length) * 100 : 0;
  }

  const coverageVariance = variance(ok.map((r) => r.coverage_ratio));
  const diffSizes = ok.map((r) => r.lines_changed);
  const coverageRatios = ok.map((r) => r.coverage_ratio);
  const corr = correlation(diffSizes, coverageRatios);
  const corrPositive = !Number.isNaN(corr) && corr > 0;
  const monotonic =
    (avgCoverageByBucket.SMALL ?? 0) <= (avgCoverageByBucket.MEDIUM ?? 0) &&
    (avgCoverageByBucket.MEDIUM ?? 0) <= (avgCoverageByBucket.LARGE ?? 0);

  const smallAllowOk = (allowPctByBucket.SMALL ?? 0) >= 60;
  const blockInRange = blockPct >= 10 && blockPct <= 40;
  const largeBlock2xSmall =
    (blockPctByBucket.LARGE ?? 0) >= 2 * (blockPctByBucket.SMALL ?? 0) || (blockPctByBucket.SMALL ?? 0) === 0;
  const coverageVariancePositive = coverageVariance > 0;
  const unhealthyAllow = allowPct > 90;
  const unhealthyBlock = blockPct > 60;
  const unhealthyFlat = !monotonic && coverageVariance < 0.01;

  const healthyCount =
    (smallAllowOk ? 1 : 0) +
    (blockInRange ? 1 : 0) +
    (largeBlock2xSmall ? 1 : 0) +
    (monotonic ? 1 : 0) +
    (coverageVariancePositive ? 1 : 0);
  const unhealthyCount = (unhealthyAllow ? 1 : 0) + (unhealthyBlock ? 1 : 0) + (unhealthyFlat ? 1 : 0);

  const stopLoss =
    !corrPositive ||
    unhealthyAllow ||
    unhealthyBlock ||
    (blockPct < 5 && allowPct > 85) ||
    (coverageVariance <= 0 && ok.length > 5);

  const md = `# Phase 1 — Health & Correlation Report

## Sample

- Total PRs: ${total}
- OK (status=ok): ${ok.length}
- Errors/timeouts: ${total - ok.length}

## Decision distribution (ok only)

| Level | Count | % |
|-------|-------|---|
| BLOCK | ${block.length} | ${blockPct.toFixed(1)}% |
| WARN | ${warn.length} | ${warnPct.toFixed(1)}% |
| ALLOW | ${allow.length} | ${allowPct.toFixed(1)}% |

## Coverage by bucket (ok only)

| Bucket | Avg coverage | ALLOW % | BLOCK % |
|--------|-------------|---------|---------|
| SMALL | ${((avgCoverageByBucket.SMALL ?? 0) * 100).toFixed(1)}% | ${(allowPctByBucket.SMALL ?? 0).toFixed(1)}% | ${(blockPctByBucket.SMALL ?? 0).toFixed(1)}% |
| MEDIUM | ${((avgCoverageByBucket.MEDIUM ?? 0) * 100).toFixed(1)}% | ${(allowPctByBucket.MEDIUM ?? 0).toFixed(1)}% | ${(blockPctByBucket.MEDIUM ?? 0).toFixed(1)}% |
| LARGE | ${((avgCoverageByBucket.LARGE ?? 0) * 100).toFixed(1)}% | ${(allowPctByBucket.LARGE ?? 0).toFixed(1)}% | ${(blockPctByBucket.LARGE ?? 0).toFixed(1)}% |

## Correlation (Section 5)

- **correlation(lines_changed, coverage_ratio):** ${Number.isNaN(corr) ? "N/A (insufficient data)" : corr.toFixed(4)}
- **Positive correlation:** ${corrPositive ? "YES" : "NO"}
- **Monotonic (avg SMALL ≤ MEDIUM ≤ LARGE):** ${monotonic ? "YES" : "NO"}
- **Coverage variance:** ${coverageVariance.toFixed(6)}

## Health checks (Section 4)

**Healthy:**

- SMALL ≥ 60% ALLOW: ${smallAllowOk ? "YES" : "NO"}
- BLOCK in 10–40%: ${blockInRange ? "YES" : "NO"}
- LARGE BLOCK ≥ 2× SMALL BLOCK: ${largeBlock2xSmall ? "YES" : "NO"}
- Coverage monotonic with bucket: ${monotonic ? "YES" : "NO"}
- Coverage variance > 0: ${coverageVariancePositive ? "YES" : "NO"}

**Unhealthy:**

- ALLOW > 90%: ${unhealthyAllow ? "YES" : "NO"}
- BLOCK > 60%: ${unhealthyBlock ? "YES" : "NO"}
- Flat coverage / near-zero variance: ${unhealthyFlat ? "YES" : "NO"}

## Stop-loss (Section 8)

- **Trigger stop-loss:** ${stopLoss ? "YES — do not scale; fix core logic." : "NO"}
- Reasons: ${!corrPositive ? "No positive diff-size correlation. " : ""}${unhealthyAllow ? "ALLOW > 90%. " : ""}${unhealthyBlock ? "BLOCK > 60%. " : ""}${coverageVariance <= 0 && ok.length > 5 ? "Zero coverage variance. " : ""}${!stopLoss ? "None." : ""}

## Success criteria (Section 9) — checklist

- [ ] Precision ≥ 70% (from blind review)
- [ ] Positive diff-size correlation: ${corrPositive ? "YES" : "NO"}
- [ ] SMALL mostly ALLOW: ${smallAllowOk ? "YES" : "NO"}
- [ ] LARGE materially higher WARN/BLOCK: ${largeBlock2xSmall ? "YES" : "NO"}
- [ ] BLOCK between 10–40%: ${blockInRange ? "YES" : "NO"}
- [ ] Infrastructure stable (manual)
- [ ] Reproducibility confirmed (manual)
`;

  const outPath = join(outDir, "phase1-health-report.md");
  writeFileSync(outPath, md, "utf8");
  console.log("Wrote", outPath);
  if (stopLoss) {
    process.exitCode = 1;
  }
}

main();
