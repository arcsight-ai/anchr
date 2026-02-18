/**
 * Remediation Planner types (Prompt 2 — Stable Messaging).
 * Byte-identical output for same decision; no timestamps, counts, or soft language.
 */

import type { Action } from "../decision/actionLayer.js";

export interface RemediationDecisionInput {
  action: Action;
  reasonCode: string;
  severity: string;
  explanation: string;
  semanticCauses: string[];
}

export interface RemediationPlanMetadata {
  version: "1";
  action: string;
  primaryCause: string;
  messageId: string;
}

export interface RemediationPlan {
  summary: string;
  steps: string[];
  commitGuidance: string[];
  verification: string[];
  education: string;
  metadata: RemediationPlanMetadata;
}
