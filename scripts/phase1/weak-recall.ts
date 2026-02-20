/**
 * Phase 1 — Weak recall proxy (Step 7). From PRs with >300 lines, cross-directory, or public API touched:
 * what % were flagged as warn/block?
 */

import type { Phase1Record } from "./types.js";
import { loadRecords } from "./distribution.js";

export interface WeakRecallResult {
  subset_count: number;
  flagged_count: number;
  flagged_pct: number;
  interpretation: "under-sensitive" | "reasonable" | "over-sensitive";
}

export function computeWeakRecall(records: Phase1Record[]): WeakRecallResult {
  const subset = records.filter(
    (r) =>
      r.lines_changed > 300 ||
      r.cross_directory ||
      r.public_api_touched
  );
  const flagged = subset.filter((r) => r.decision_level === "warn" || r.decision_level === "block");
  const pct = subset.length ? (flagged.length / subset.length) * 100 : 0;
  let interpretation: WeakRecallResult["interpretation"] = "reasonable";
  if (pct < 20) interpretation = "under-sensitive";
  else if (pct > 60) interpretation = "over-sensitive";
  return {
    subset_count: subset.length,
    flagged_count: flagged.length,
    flagged_pct: pct,
    interpretation,
  };
}
