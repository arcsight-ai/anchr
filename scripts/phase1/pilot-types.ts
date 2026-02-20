/**
 * Phase 1 pilot — artifact shape (strict schema). Summary metrics only; no diff/content.
 */

export type ComplexityBucket = "SMALL" | "MEDIUM" | "LARGE";

export type PilotStatus = "ok" | "error" | "timeout";

export interface PilotRecord {
  repo: string;
  pr_number: number;
  base_sha: string;
  head_sha: string;
  lines_changed: number;
  files_changed: number;
  complexity_bucket: ComplexityBucket;
  decision_level: string;
  coverage_ratio: number;
  primary_cause: string | null;
  minimal_cut_size: number;
  status: PilotStatus;
  execution_ms: number;
  rate_limit_remaining: number;
  run_timestamp: string;
}

const REQUIRED_KEYS: (keyof PilotRecord)[] = [
  "repo", "pr_number", "base_sha", "head_sha", "lines_changed", "files_changed",
  "complexity_bucket", "decision_level", "coverage_ratio", "primary_cause", "minimal_cut_size",
  "status", "execution_ms", "rate_limit_remaining", "run_timestamp",
];

export function validatePilotRecord(r: unknown): r is PilotRecord {
  if (r == null || typeof r !== "object") return false;
  const o = r as Record<string, unknown>;
  for (const k of REQUIRED_KEYS) {
    if (!(k in o)) return false;
  }
  if (o.status !== "ok" && o.status !== "error" && o.status !== "timeout") return false;
  if (typeof o.execution_ms !== "number" || typeof o.rate_limit_remaining !== "number") return false;
  return true;
}
