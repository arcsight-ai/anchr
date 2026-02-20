#!/usr/bin/env npx tsx
/**
 * Phase 1 pilot — summary + blind-review from pilot artifacts.
 * Usage: npx tsx scripts/phase1/generate-pilot-summary.ts [artifacts/phase1/pilot]
 * Writes: artifacts/phase1/pilot-summary.md, artifacts/phase1/blind-review.json
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PilotRecord } from "./pilot-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const DEFAULT_PILOT = join(ROOT, "artifacts", "phase1", "pilot");
const PILOT_SEED = 42;

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

function shuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function main(): void {
  const pilotDir = process.argv[2] ?? DEFAULT_PILOT;
  const records = loadPilotRecords(pilotDir);
  const outDir = join(ROOT, "artifacts", "phase1");
  mkdirSync(outDir, { recursive: true });

  const total = records.length;
  const ok = records.filter((r) => r.status === "ok");
  const errors = records.filter((r) => r.status === "error").length;
  const timeouts = records.filter((r) => r.status === "timeout").length;
  const block = ok.filter((r) => r.decision_level === "block");
  const warn = ok.filter((r) => r.decision_level === "warn");
  const allow = ok.filter((r) => r.decision_level !== "block" && r.decision_level !== "warn");

  const byRepo: Record<string, PilotRecord[]> = {};
  for (const r of records) {
    if (!byRepo[r.repo]) byRepo[r.repo] = [];
    byRepo[r.repo].push(r);
  }

  const band05 = ok.filter((r) => r.coverage_ratio >= 0 && r.coverage_ratio < 0.5).length;
  const band058 = ok.filter((r) => r.coverage_ratio >= 0.5 && r.coverage_ratio < 0.8).length;
  const band081 = ok.filter((r) => r.coverage_ratio >= 0.8 && r.coverage_ratio <= 1).length;

  const byBucket: Record<string, PilotRecord[]> = { SMALL: [], MEDIUM: [], LARGE: [] };
  for (const r of ok) {
    const b = r.complexity_bucket;
    if (b in byBucket) byBucket[b].push(r);
  }
  const avgCoverageByBucket: Record<string, number> = {};
  for (const [b, arr] of Object.entries(byBucket)) {
    avgCoverageByBucket[b] = arr.length ? arr.reduce((s, r) => s + r.coverage_ratio, 0) / arr.length : 0;
  }
  const decisionByBucket: Record<string, { block: number; warn: number; allow: number }> = {};
  for (const [b, arr] of Object.entries(byBucket)) {
    decisionByBucket[b] = {
      block: arr.filter((r) => r.decision_level === "block").length,
      warn: arr.filter((r) => r.decision_level === "warn").length,
      allow: arr.filter((r) => r.decision_level !== "block" && r.decision_level !== "warn").length,
    };
  }

  const correlationHint =
    avgCoverageByBucket.LARGE >= avgCoverageByBucket.MEDIUM && avgCoverageByBucket.MEDIUM >= avgCoverageByBucket.SMALL
      ? "Average coverage increases with complexity bucket (SMALL → MEDIUM → LARGE)."
      : "No clear increase of average coverage with complexity; inspect further.";

  const summaryMd = `# Phase 1 Pilot — Summary

## Total PRs

${total} (${errors} errors${timeouts > 0 ? `, ${timeouts} timeouts` : ""})

## Per-repo breakdown

| Repo | PRs | Block | Warn | Allow | Errors |
|------|-----|-------|------|-------|--------|
${Object.entries(byRepo)
  .map(([repo, arr]) => {
    const b = arr.filter((r) => r.decision_level === "block").length;
    const w = arr.filter((r) => r.decision_level === "warn").length;
    const a = arr.filter((r) => r.decision_level !== "block" && r.decision_level !== "warn").length;
    const err = arr.filter((r) => r.status === "error").length;
    return `| ${repo} | ${arr.length} | ${b} | ${w} | ${a} | ${err} |`;
  })
  .join("\n")}

## Decision distribution (ok only)

| Level | Count | % |
|-------|-------|---|
| block | ${block.length} | ${ok.length ? ((block.length / ok.length) * 100).toFixed(1) : 0}% |
| warn | ${warn.length} | ${ok.length ? ((warn.length / ok.length) * 100).toFixed(1) : 0}% |
| allow | ${allow.length} | ${ok.length ? ((allow.length / ok.length) * 100).toFixed(1) : 0}% |

## Coverage ratio bands (ok only)

| Band | Count |
|------|-------|
| 0–0.5 | ${band05} |
| 0.5–0.8 | ${band058} |
| 0.8–1 | ${band081} |

## Average coverage by bucket (ok only)

| Bucket | Avg coverage |
|--------|-------------|
| SMALL | ${(avgCoverageByBucket.SMALL * 100).toFixed(1)}% |
| MEDIUM | ${(avgCoverageByBucket.MEDIUM * 100).toFixed(1)}% |
| LARGE | ${(avgCoverageByBucket.LARGE * 100).toFixed(1)}% |

## Decision distribution by bucket (ok only)

| Bucket | Block | Warn | Allow |
|--------|-------|------|-------|
| SMALL | ${decisionByBucket.SMALL?.block ?? 0} | ${decisionByBucket.SMALL?.warn ?? 0} | ${decisionByBucket.SMALL?.allow ?? 0} |
| MEDIUM | ${decisionByBucket.MEDIUM?.block ?? 0} | ${decisionByBucket.MEDIUM?.warn ?? 0} | ${decisionByBucket.MEDIUM?.allow ?? 0} |
| LARGE | ${decisionByBucket.LARGE?.block ?? 0} | ${decisionByBucket.LARGE?.warn ?? 0} | ${decisionByBucket.LARGE?.allow ?? 0} |

## Correlation hint

${correlationHint}

## Interpretation rules (do not skip)

- BLOCK > 40% → oversensitive
- ALLOW > 90% → undersensitive
- Coverage not correlated with diff size → weak wedge
- Precision sample < 60% → calibration needed

Do not tune until pilot is complete.
`;

  const summaryPath = join(outDir, "pilot-summary.md");
  writeFileSync(summaryPath, summaryMd, "utf8");

  const blockSample = shuffle(block, PILOT_SEED).slice(0, 5);
  const warnSample = shuffle(warn, PILOT_SEED + 1).slice(0, 5);
  const allowSample = shuffle(allow, PILOT_SEED + 2).slice(0, 5);
  const blindReview = {
    block: blockSample.map((r) => ({ repo: r.repo, pr_number: r.pr_number, complexity_bucket: r.complexity_bucket })),
    warn: warnSample.map((r) => ({ repo: r.repo, pr_number: r.pr_number, complexity_bucket: r.complexity_bucket })),
    allow: allowSample.map((r) => ({ repo: r.repo, pr_number: r.pr_number, complexity_bucket: r.complexity_bucket })),
  };
  const blindPath = join(outDir, "blind-review.json");
  writeFileSync(blindPath, JSON.stringify(blindReview, null, 2), "utf8");

  if (process.stdout.isTTY) {
    console.log("Wrote", summaryPath);
    console.log("Wrote", blindPath);
  }
}

main();
