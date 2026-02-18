/** Final merge decision for the PR (Prompt 12). */
export type PolicyAction = "merge" | "block" | "review" | "retry";

export type PolicyConfidence = "high" | "medium" | "low";

export interface PolicyOutput {
  action: PolicyAction;
  message: string;
  confidence: PolicyConfidence;
}

/** Report shape required by the policy engine. */
export interface PolicyReport {
  status?: string;
  run?: { id?: string };
  confidence?: { coverageRatio?: number };
  downgradeReasons?: string[];
}

export interface PolicyInput {
  currentReport: PolicyReport;
  previousDecision?: PolicyOutput | null;
}
