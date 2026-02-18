export type StructuralResult = "VERIFIED" | "UNSAFE" | "INDETERMINATE";

export type ConvergenceResult = "IMPROVED" | "REGRESSED" | "SHIFTED" | "UNCHANGED";

export type ChangeType =
  | "added_dependency"
  | "removed_dependency"
  | "dependency_direction_changed"
  | "internal_api_used"
  | "public_api_removed"
  | "coupling_increase"
  | "coupling_decrease"
  | "unknown_change";

export type DecisionKind = "APPROVE" | "REVIEW" | "REWORK" | "INVESTIGATE";

export type SeverityKind = "LOW" | "MEDIUM" | "HIGH";

export type ReportStatus = "VERIFIED" | "UNSAFE" | "INDETERMINATE" | "INCOMPLETE";

/** Human-trust judgement output (Prompt 9). */
export interface DecisionOutput {
  decision: DecisionKind;
  explanation: string;
  reasoning: string;
  guidance: string;
}

/** Engine input: architectural report summary. */
export interface AnchRReport {
  status: ReportStatus;
  primaryCause: string | null;
  violations: string[];
  coverageRatio: number;
  scopeMode: "structural-fast-path" | "structural" | "causal";
  confidence: number;
}

/** Internal input used when building from report + convergence (legacy path). */
export interface DecisionInput {
  structuralResult: StructuralResult;
  convergenceResult: ConvergenceResult | null;
  confidence: number;
  primaryCause: string | null;
  changeType: ChangeType;
  changeSummary: string;
}
