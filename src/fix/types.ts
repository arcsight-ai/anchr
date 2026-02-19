/**
 * Deterministic fix plan types. Post-condition verifiable; no timestamps.
 */

import type { ViolationKind } from "../structural/types.js";

export type FixEditKind = "import-rewrite" | "manual";

export interface FixEdit {
  file: string;
  kind: FixEditKind;
  originalSpecifier: string;
  newSpecifier?: string;
  importKind: "value" | "type";
  symbol?: string;
  rule: ViolationKind;
}

export type FixPlanRisk = "low" | "medium" | "high";

export interface FixPlan {
  version: 3;
  baseCommit: string;
  postCondition: "structural_verified";
  edits: FixEdit[];
  risk: FixPlanRisk;
}

export type FixPlanStatus = "ok" | "stale_analysis" | "no_report" | "no_violations";

export interface FixPlanResult {
  status: FixPlanStatus;
  plan?: FixPlan;
  violationCount: number;
  filesAffected: string[];
  primaryCause: ViolationKind | null;
  risk: FixPlanRisk;
  repairStrategy: string;
}
