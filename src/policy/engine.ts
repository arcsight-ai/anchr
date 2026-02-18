/**
 * Decision Policy Engine (Prompt 12). Deterministic; guards against
 * nondeterminism by downgrading to review when the same run.id produces a different decision.
 */

import type { PolicyInput, PolicyOutput, PolicyReport } from "./types.js";

function hasRequiredFields(report: PolicyReport): boolean {
  return (
    typeof report.status === "string" &&
    typeof report.run === "object" &&
    report.run != null &&
    typeof (report.run as { id?: string }).id === "string"
  );
}

function isIncomplete(report: PolicyReport): boolean {
  if (report.status === "INCOMPLETE") return true;
  const reasons = report.downgradeReasons;
  if (Array.isArray(reasons) && reasons.includes("certifier_script_missing")) return true;
  return false;
}

function computeRawDecision(report: PolicyReport): PolicyOutput {
  const coverageRatio = report.confidence?.coverageRatio ?? 0;

  if (!hasRequiredFields(report)) {
    return {
      action: "retry",
      message: "Analysis incomplete — re-run the check.",
      confidence: "low",
    };
  }

  if (isIncomplete(report)) {
    return {
      action: "retry",
      message: "Analysis incomplete — re-run the check.",
      confidence: "low",
    };
  }

  if (report.status === "UNSAFE") {
    return {
      action: "block",
      message: "Merge blocked — change violates architectural boundaries.",
      confidence: "high",
    };
  }

  if (
    report.status === "VERIFIED" &&
    coverageRatio >= 0.95 &&
    (!report.downgradeReasons || report.downgradeReasons.length === 0)
  ) {
    return {
      action: "merge",
      message: "Safe to merge — no architectural impact detected.",
      confidence: "high",
    };
  }

  const confidence: PolicyOutput["confidence"] =
    coverageRatio >= 0.8 ? "high" : coverageRatio >= 0.5 ? "medium" : "low";
  return {
    action: "review",
    message: "Architecture uncertain — requires architectural review.",
    confidence,
  };
}

/**
 * Returns the policy decision. If previousDecision is provided for the same run.id
 * and the new computed action differs, returns review/low (nondeterminism guard).
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
      confidence: "low",
    };
  }

  return raw;
}
