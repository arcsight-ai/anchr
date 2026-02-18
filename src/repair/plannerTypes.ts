/** Violation as consumed by the repair planner. */
export interface PlannerViolation {
  kind: string;
  fromPackage: string;
  toPackage?: string;
  targetPath?: string;
}

export interface FixSuggestion {
  title: string;
  strategy: string;
  priority: number;
  explanation: string;
  confidenceReason: string;
  steps: string[];
  safeExample: string;
  unsafeExample: string;
  affects: string[];
}

export interface PlannerInput {
  decisionAction: string;
  decisionReason: string;
  violations: PlannerViolation[];
}

export interface PlannerOutput {
  primarySuggestion: string;
  suggestions: FixSuggestion[];
}
