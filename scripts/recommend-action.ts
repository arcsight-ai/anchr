/**
 * Reviewer Action Recommender (Prompt 10 — Final Hardened).
 * Converts ArcSight audit result into a deterministic reviewer directive.
 * Translation boundary: certification → decision. No other code may infer behavior from human text.
 * Guarantees: never throws, always returns a valid action.
 */

export type AuditDecision =
  | "allow"
  | "block"
  | "warn"
  | "indeterminate";

export type Report = {
  decision?: { level?: AuditDecision | string | null } | null;
  structuralFastPath?: boolean | null;
  downgradeReasons?: string[] | null;
  violations?: { cause?: string | null }[] | null;
};

export type ReviewerActionCode =
  | "MERGE"
  | "REVIEW"
  | "BLOCK"
  | "ESCALATE";

export type ReasonCategory =
  | "SAFE_TRIVIAL"
  | "SAFE_COMPLEX"
  | "RISKY_CHANGE"
  | "ARCHITECTURE_VIOLATION"
  | "UNCERTAIN_ANALYSIS"
  | "SYSTEM_FALLBACK";

export interface ReviewerAction {
  code: ReviewerActionCode;
  category: ReasonCategory;
  message: string;
}

function safe<T>(v: T): T | undefined {
  return v ?? undefined;
}

/**
 * Normalization and decision table. Must never throw.
 */
export function recommendAction(r: Report | unknown): ReviewerAction {
  const anyR = r as { decision?: { level?: unknown } | null; structuralFastPath?: unknown; downgradeReasons?: unknown; violations?: unknown } | null | undefined;
  const levelRaw = safe(anyR?.decision?.level);
  const level: AuditDecision =
    levelRaw === "allow" ||
    levelRaw === "block" ||
    levelRaw === "warn" ||
    levelRaw === "indeterminate"
      ? levelRaw
      : "indeterminate";

  const structuralFastPath = anyR?.structuralFastPath === true;

  const downgradeReasons = Array.isArray(anyR?.downgradeReasons)
    ? (anyR.downgradeReasons as unknown[]).filter(Boolean)
    : [];

  const violations = Array.isArray(anyR?.violations)
    ? (anyR.violations as unknown[]).filter(Boolean)
    : [];

  const uncertain =
    level === "indeterminate" || downgradeReasons.length > 0;

  const hasViolations = violations.length > 0;

  // 1 — Non-deterministic or uncertain result
  if (uncertain) {
    return {
      code: "ESCALATE",
      category: "UNCERTAIN_ANALYSIS",
      message: "Request manual architectural review",
    };
  }

  // 2 — Explicit architecture violation
  if (level === "block") {
    return {
      code: "BLOCK",
      category: "ARCHITECTURE_VIOLATION",
      message: "Do not merge this change",
    };
  }

  // 3 — Warning state
  if (level === "warn") {
    return {
      code: "REVIEW",
      category: "RISKY_CHANGE",
      message: "Review architectural impact before merging",
    };
  }

  // 4 — Trivial safe change
  if (level === "allow" && structuralFastPath) {
    return {
      code: "MERGE",
      category: "SAFE_TRIVIAL",
      message: "Merge normally",
    };
  }

  // 5 — Verified but non-trivial change
  if (level === "allow" && !structuralFastPath && !hasViolations) {
    return {
      code: "REVIEW",
      category: "SAFE_COMPLEX",
      message: "Merge after reviewing dependency change",
    };
  }

  // 6 — Defensive fallback (must always succeed)
  return {
    code: "ESCALATE",
    category: "SYSTEM_FALLBACK",
    message: "Manual review recommended",
  };
}
