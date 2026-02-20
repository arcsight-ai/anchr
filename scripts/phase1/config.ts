/**
 * Phase 1 — Locked configuration. Do not change during the phase.
 * Merge-stage, suppression, and PR timing logic are disabled for raw signal evaluation.
 */

export const PHASE1_LOCK = {
  certify_runs: 8,
  coverage_thresholds_locked: true,
  merge_stage_logic_enabled: false,
  suppression_logic_enabled: false,
  pr_timing_logic_enabled: false,
} as const;

export const COMPLEXITY_BUCKETS = {
  SMALL: { maxLines: 50 },
  MEDIUM: { minLines: 51, maxLines: 300 },
  LARGE: { minLines: 301 },
} as const;

export function getComplexityBucket(linesChanged: number): "SMALL" | "MEDIUM" | "LARGE" {
  if (linesChanged <= 50) return "SMALL";
  if (linesChanged <= 300) return "MEDIUM";
  return "LARGE";
}
