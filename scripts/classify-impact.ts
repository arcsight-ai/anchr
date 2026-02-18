/**
 * Architectural Impact Classifier (Prompt 9 — Final Locked).
 * Returns one deterministic human-readable sentence: the headline of the ArcSight PR comment.
 * Answers: What architectural change did this PR introduce?
 */

export type AuditDecision = "allow" | "block" | "warn" | "indeterminate";

export type Cause =
  | "boundary_violation"
  | "deleted_public_api"
  | "type_import_private_target"
  | "relative_escape"
  | string;

export interface Report {
  decision: { level: AuditDecision };
  violations?: { cause: Cause }[];
  structuralFastPath?: boolean;
  hasValueCrossPackageImport?: boolean;
  deletedPublicApi?: boolean;
  downgradeReasons?: string[];
}

/**
 * One sentence, ≤120 chars, deterministic. First match wins.
 */
export function classifyImpact(r: Report): string {
  const causes = new Set((r.violations ?? []).map((v) => v.cause));
  const uncertain = (r.downgradeReasons ?? []).length > 0;
  const level = r.decision?.level ?? "indeterminate";

  // 0 — Analysis uncertainty
  if (level === "indeterminate" || uncertain) {
    return "Architectural impact could not be determined.";
  }

  // 1 — Public API deletion
  if (causes.has("deleted_public_api")) {
    return "Public API removal breaks dependent packages.";
  }

  // 2 — Boundary violation
  if (causes.has("boundary_violation")) {
    return "Private module accessed across package boundary.";
  }

  // 3 — Type boundary violation
  if (causes.has("type_import_private_target")) {
    return "Private types referenced outside defining package.";
  }

  // 4 — Relative escape
  if (causes.has("relative_escape")) {
    return "File accesses code outside its package via relative path.";
  }

  // 5 — Purely safe change
  if (level === "allow" && r.structuralFastPath === true) {
    return "No architectural changes detected.";
  }

  // 6 — New dependency introduced
  if (level === "allow" && r.hasValueCrossPackageImport === true) {
    return "New package dependency introduced.";
  }

  // 7 — Internal refactor
  if (level === "allow") {
    return "Internal refactor within existing package boundaries.";
  }

  // 8 — Warning state
  if (level === "warn") {
    return "Possible architectural rule violation detected.";
  }

  // 9 — Unknown violation type
  if (causes.size > 0) {
    return "Architectural rules violated.";
  }

  // 10 — Final fallback
  return "Architectural analysis completed.";
}
