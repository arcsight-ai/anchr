/**
 * Advisability gate (Prompt 11). Only ADAPTABLE causes with no PROHIBITED conditions.
 */

import { parseMinimalCut } from "../repair/parseReport.js";

const ADAPTABLE_CAUSES = new Set([
  "boundary_violation",
  "type_import_private_target",
  "relative_escape",
]);

const PROHIBITED_CAUSES = new Set([
  "deleted_public_api",
  "resolver_uncertain",
  "missing_public_entry",
]);

export function isAdvisable(input: {
  primaryCause: string | null;
  violations: string[];
}): boolean {
  const { primaryCause, violations } = input;

  if (!primaryCause) return false;
  if (PROHIBITED_CAUSES.has(primaryCause)) return false;
  if (!ADAPTABLE_CAUSES.has(primaryCause)) return false;

  if (violations.length > 3) return false;

  const parsed = parseMinimalCut(violations);
  const causes = new Set(parsed.map((p) => p.cause).filter(Boolean));
  if (causes.size > 1) return false;

  return true;
}
