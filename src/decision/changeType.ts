import type { ChangeType } from "./types.js";
import type { ConvergenceResult } from "./types.js";

const CAUSE_PRIORITY = [
  "boundary_violation",
  "deleted_public_api",
  "type_import_private_target",
  "relative_escape",
  "resolver_uncertain",
] as const;

export function deriveChangeType(
  primaryCause: string | null,
  convergenceResult: ConvergenceResult | null,
  hasViolations: boolean,
): ChangeType {
  if (primaryCause) {
    switch (primaryCause) {
      case "boundary_violation":
        return hasViolations ? "internal_api_used" : "unknown_change";
      case "deleted_public_api":
        return "public_api_removed";
      case "type_import_private_target":
        return "internal_api_used";
      case "relative_escape":
        return "dependency_direction_changed";
      case "resolver_uncertain":
        return "unknown_change";
      default:
        break;
    }
  }

  if (convergenceResult === "IMPROVED") return "coupling_decrease";
  if (convergenceResult === "REGRESSED") return "coupling_increase";
  if (convergenceResult === "SHIFTED") return "dependency_direction_changed";

  if (hasViolations) return "added_dependency";
  return "unknown_change";
}

export function deriveChangeSummary(
  primaryCause: string | null,
  changeType: ChangeType,
): string {
  switch (changeType) {
    case "internal_api_used":
      return "Introduces a dependency on an internal module file.";
    case "public_api_removed":
      return "Removes or breaks a previously public export.";
    case "dependency_direction_changed":
      return "Changes which package depends on which.";
    case "coupling_increase":
      return "Increases cross-package coupling.";
    case "coupling_decrease":
      return "Reduces cross-package coupling.";
    case "added_dependency":
      return "Adds a new cross-package dependency.";
    case "removed_dependency":
      return "Removes a cross-package dependency.";
    default:
      return "Architectural impact unclear.";
  }
}
