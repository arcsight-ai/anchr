/**
 * ANCHR Decision Engine (Prompt 9). Human-trust judgement from architectural report.
 * Returns decision, explanation, reasoning, guidance. No severity/message/developerAction.
 */

import type { DecisionOutput, AnchRReport } from "./types.js";

function needsUncertaintyLanguage(report: AnchRReport): boolean {
  return report.coverageRatio < 1 || report.confidence < 1;
}

function applyUncertainty(reasoning: string, apply: boolean): string {
  if (!apply) return reasoning;
  if (/\.\s*$/.test(reasoning)) {
    return reasoning.replace(/\.\s*$/, " — analysis coverage may be partial.");
  }
  return reasoning;
}

export function buildDecisionFromAnchRReport(report: AnchRReport): DecisionOutput {
  const { status, primaryCause, coverageRatio, confidence } = report;
  const uncertain = needsUncertaintyLanguage(report);

  // INCOMPLETE
  if (status === "INCOMPLETE") {
    return {
      decision: "INVESTIGATE",
      explanation: "Analysis could not complete.",
      reasoning: "The tool could not reliably evaluate the architectural effect of this change.",
      guidance: "Re-run analysis or inspect manually.",
    };
  }

  // INDETERMINATE
  if (status === "INDETERMINATE") {
    return {
      decision: "REVIEW",
      explanation: "Impact depends on developer intent.",
      reasoning: applyUncertainty(
        "The change is structurally valid but ambiguous without human context.",
        uncertain,
      ),
      guidance: "Author should clarify intent in the PR description.",
    };
  }

  // UNSAFE
  if (status === "UNSAFE") {
    if (primaryCause === "boundary_violation") {
      return {
        decision: "REWORK",
        explanation: "Change depends on internal module structure.",
        reasoning: "This introduces tight coupling between packages and makes future refactors risky.",
        guidance: "Use the package's public interface instead of internal files.",
      };
    }
    if (primaryCause === "deleted_public_api") {
      return {
        decision: "REWORK",
        explanation: "Public API removal detected.",
        reasoning: "Other parts of the system may rely on this contract and could break.",
        guidance: "Confirm this is an intentional breaking change.",
      };
    }
    return {
      decision: "REWORK",
      explanation: "Architectural contract broken.",
      reasoning: "The change alters declared system structure in a way the architecture does not permit.",
      guidance: "Adjust the change to respect module boundaries.",
    };
  }

  // VERIFIED
  if (status === "VERIFIED") {
    if (coverageRatio >= 0.95) {
      return {
        decision: "APPROVE",
        explanation: "No architectural impact detected.",
        reasoning: "The change stays within existing module boundaries and preserves public contracts.",
        guidance: "Safe to merge.",
      };
    }
    return {
      decision: "REVIEW",
      explanation: "Likely safe but analysis coverage is partial.",
      reasoning: applyUncertainty(
        "No boundary changes detected, but some behavior could not be fully evaluated.",
        true,
      ),
      guidance: "Quick human confirmation recommended.",
    };
  }

  // Fallback (e.g. unknown status)
  return {
    decision: "REVIEW",
    explanation: "Impact could not be fully determined.",
    reasoning: "The analysis did not produce a conclusive result.",
    guidance: "Author should clarify intent in the PR description.",
  };
}
