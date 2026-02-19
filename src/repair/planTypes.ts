/**
 * ArcSight deterministic repair plan (version 1).
 * File-level safety binding; compile-sound; convergence guard.
 */

export type PlanActionType = "rewrite_import" | "add_reexport" | "manual_migration_required";

export interface PlanAction {
  type: PlanActionType;
  file: string;
  fileHash: string;
  from?: string;
  to?: string;
  /** for add_reexport */
  symbol?: string;
}

export type PlanRisk = "safe" | "risky" | "risky-large-impact" | "manual";

export interface PlanOutput {
  version: 1;
  planHash: string;
  risk: PlanRisk;
  repoHash: string;
  diagnostics: {
    violationsBefore: number;
    violationsAfter: number;
    fixes: number;
  };
  actions: PlanAction[];
}

export interface PlanErrorOutput {
  version: 1;
  error: "stale_report" | "compile_regression" | "non_converging_plan";
  message?: string;
  details?: unknown[];
}
