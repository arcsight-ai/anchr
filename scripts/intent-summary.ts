/**
 * Architectural Intent Engine (Prompt 4 — Final Final).
 * Single human sentence describing the design intent mismatch. Senior-engineer tone.
 */

type Cause =
  | "deleted_public_api"
  | "boundary_violation"
  | "type_import_private_target"
  | "relative_escape";

const KNOWN_CAUSES: Cause[] = [
  "deleted_public_api",
  "boundary_violation",
  "type_import_private_target",
  "relative_escape",
];

function selectPrimary(causes: Set<string>): Cause | null {
  for (const c of KNOWN_CAUSES) {
    if (causes.has(c)) return c;
  }
  return null;
}

export function summarizeIntent(violations: Array<{ cause: string }>): string {
  if (violations.length === 0) {
    return "No architectural impact detected.";
  }

  const causes = new Set(violations.map((v) => v.cause));
  const primary = selectPrimary(causes);

  if (primary === null) {
    return "Architectural relationships between components are being altered.";
  }

  switch (primary) {
    case "deleted_public_api":
      return "The system expects this contract to remain stable across components.";
    case "boundary_violation":
      return "This assumes internal behavior can be depended on across component boundaries.";
    case "type_import_private_target":
      return "Type knowledge is crossing boundaries meant to share only stable interfaces.";
    case "relative_escape":
      return "The change reaches across components instead of extending through intended structure.";
    default:
      return "Architectural relationships between components are being altered.";
  }
}
