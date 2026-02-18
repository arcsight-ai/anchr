/** Input to the convergence advisor. Only these fields may be used. */
export interface AdvisorInput {
  primaryCause: string | null;
  decisionLevel: string;
  explanation: string;
  reasoning: string;
  violations: string[];
}
