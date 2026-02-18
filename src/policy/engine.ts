/**
 * Decision Policy Engine (Prompt 12). Uses deterministic action layer (decide());
 * guards against nondeterminism by downgrading to review when the same run.id
 * produces a different decision.
 */

import { decide } from "../decision/actionLayer.js";
import type { PolicyInput, PolicyOutput, PolicyReport } from "./types.js";
import type { Action } from "../decision/actionLayer.js";

function actionToPolicy(action: Action): PolicyOutput["action"] {
  switch (action) {
    case "proceed":
      return "merge";
    case "require-review":
    case "require-adapter":
      return "review";
    case "require-migration":
    case "fix-architecture":
      return "block";
    case "rerun-analysis":
      return "retry";
    default:
      return "review";
  }
}

function severityToConfidence(
  severity: "info" | "caution" | "risk" | "critical",
): PolicyOutput["confidence"] {
  switch (severity) {
    case "info":
      return "high";
    case "caution":
      return "medium";
    case "risk":
      return "medium";
    case "critical":
      return "high";
    default:
      return "medium";
  }
}

function computeRawDecision(report: PolicyReport): PolicyOutput {
  const decision = decide(report);
  return {
    action: actionToPolicy(decision.action),
    message: decision.explanation,
    confidence: severityToConfidence(decision.severity),
  };
}

/**
 * Returns the policy decision from the deterministic action layer. If previousDecision
 * is provided for the same run.id and the new computed action differs, returns
 * review/medium (nondeterminism guard).
 */
export function evaluatePolicy(input: PolicyInput): PolicyOutput {
  const { currentReport, previousDecision } = input;
  const runId = (currentReport.run as { id?: string } | undefined)?.id;

  const raw = computeRawDecision(currentReport);

  if (
    runId != null &&
    runId !== "" &&
    previousDecision != null &&
    previousDecision.action !== raw.action
  ) {
    return {
      action: "review",
      message: "Analysis inconsistent across runs — manual review required.",
      confidence: "medium",
    };
  }

  return raw;
}
