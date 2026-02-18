import type { DecisionOutput } from "../decision/types.js";

/** Decision object as produced by the decision engine. */
export type DecisionObject = DecisionOutput;

export interface ChangeSummary {
  filesChanged: number;
  primaryFile: string;
  changeType: string;
}

export type RunMode = "FAST_PATH" | "FULL_ANALYSIS";

export interface RunInfo {
  confidence: number;
  mode: RunMode;
}

/** Context for technical details collapsible, perceived change size, and advisor. */
export interface TechnicalContext {
  status: string;
  scopeMode: string;
  violations: string[];
  /** For convergence advisor (Prompt 11). */
  primaryCause?: string | null;
  decisionLevel?: string;
}

import type { PolicyOutput as PolicyResult } from "../policy/types.js";

/** Re-export for callers that build comment input with policy. */
export type PolicyOutput = PolicyResult;

/** Input to the PR comment renderer. Only these fields may be used in output. */
export interface CommentRenderInput {
  decision: DecisionObject;
  changeSummary: ChangeSummary;
  runInfo: RunInfo;
  technicalContext?: TechnicalContext;
  /** Policy engine result (merge/block/review/retry) for final decision line. */
  policy?: PolicyResult;
}
