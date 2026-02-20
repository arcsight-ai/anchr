/**
 * Phase 1 — Structured record per PR (Step 3 + 4).
 */

export interface Phase1Record {
  repo: string;
  pr_number: number;
  base_sha: string;
  head_sha: string;
  lines_changed: number;
  files_changed: number;
  decision_level: string;
  confidence_coverage_ratio: number;
  classification_primary_cause: string | null;
  minimal_cut_length: number;
  timestamp: string;

  complexity_bucket: "SMALL" | "MEDIUM" | "LARGE";
  single_file: boolean;
  multi_file: boolean;
  cross_directory: boolean;
  public_api_touched: boolean;
}

export interface Phase1ManifestEntry {
  repo: string;
  pr_number: number;
  base_sha?: string;
  head_sha?: string;
}
