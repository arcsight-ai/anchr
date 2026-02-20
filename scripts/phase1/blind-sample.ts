/**
 * Phase 1 — Blind precision sample (Step 6). Output 20 BLOCK, 20 WARN, 20 ALLOW for review.
 * Output strips coverage, minimalCut count, primaryCause so reviewer sees only PR + decision level.
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { loadRecords } from "./distribution.js";
import type { Phase1Record } from "./types.js";

export interface BlindReviewEntry {
  repo: string;
  pr_number: number;
  base_sha: string;
  head_sha: string;
  decision_level: string;
  /** No coverage, minimalCut count, or primaryCause in output for blind review. */
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

export function selectBlindSample(
  records: Phase1Record[],
  perDecision: number = 20,
  seed: number = 42
): { block: BlindReviewEntry[]; warn: BlindReviewEntry[]; allow: BlindReviewEntry[] } {
  const block = records.filter((r) => r.decision_level === "block");
  const warn = records.filter((r) => r.decision_level === "warn");
  const allow = records.filter((r) => r.decision_level !== "block" && r.decision_level !== "warn");

  const toEntry = (r: Phase1Record): BlindReviewEntry => ({
    repo: r.repo,
    pr_number: r.pr_number,
    base_sha: r.base_sha,
    head_sha: r.head_sha,
    decision_level: r.decision_level,
  });

  return {
    block: shuffle(block, seed).slice(0, perDecision).map(toEntry),
    warn: shuffle(warn, seed + 1).slice(0, perDecision).map(toEntry),
    allow: shuffle(allow, seed + 2).slice(0, perDecision).map(toEntry),
  };
}

export function writeBlindSample(
  resultsDir: string,
  outPath: string
): void {
  const records = loadRecords(resultsDir);
  const sample = selectBlindSample(records);
  const outDir = dirname(outPath);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(sample, null, 2), "utf8");
}
