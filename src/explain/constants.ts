/**
 * Canonical text and mappings for explain output. No synonyms; no generated prose.
 */

import type { ViolationKind } from "../structural/types.js";

export const RULE_TO_FIX: Record<ViolationKind, string> = {
  boundary_violation:
    "import from package public entrypoint instead of internal module",
  deleted_public_api: "restore export or add compatible re-export",
  relative_escape:
    "move file inside package boundary or expose via entrypoint",
  type_import_private_target: "import types from public types entry",
};

export type RepairIntent =
  | "move_dependency_to_public_api"
  | "restore_or_version_contract"
  | "replace_filesystem_access_with_package_import"
  | "promote_type_to_public_contract"
  | "require_deeper_analysis";

export const RULE_TO_INTENT: Record<ViolationKind, RepairIntent> = {
  boundary_violation: "move_dependency_to_public_api",
  deleted_public_api: "restore_or_version_contract",
  relative_escape: "replace_filesystem_access_with_package_import",
  type_import_private_target: "promote_type_to_public_contract",
};

/** Fix confidence: High = direct internal import, Medium = deleted public API, Low = resolver uncertainty */
export type FixConfidence = "High" | "Medium" | "Low";

export const RULE_TO_FIX_CONFIDENCE: Record<ViolationKind, FixConfidence> = {
  boundary_violation: "High",
  deleted_public_api: "Medium",
  relative_escape: "High",
  type_import_private_target: "High",
};

export type SummaryConfidence = "High" | "Medium" | "Low";
