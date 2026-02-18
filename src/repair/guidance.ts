/**
 * Deterministic architectural guidance. Template-based only.
 * Identical cause → identical output. No repo-specific wording.
 */

const CAUSES = [
  "boundary_violation",
  "deleted_public_api",
  "relative_escape",
  "type_import_private_target",
] as const;

type Cause = (typeof CAUSES)[number];

function normalizeCause(cause: string | null): Cause | null {
  if (!cause) return null;
  return CAUSES.includes(cause as Cause) ? (cause as Cause) : null;
}

const GUIDANCE: Record<Cause, string> = {
  boundary_violation: [
    "Packages interact only through public contracts.",
    "Internal modules are implementation details and cannot be depended upon externally.",
    "Correct dependency shape: Consumer → Public API → Implementation.",
    "Never: Consumer → Implementation.",
  ].join("\n"),

  deleted_public_api: [
    "Public exports form compatibility guarantees.",
    "Removing them breaks downstream packages and violates version stability.",
  ].join("\n"),

  relative_escape: [
    "Filesystem layout must not define architecture.",
    "Cross-package sharing requires explicit ownership.",
  ].join("\n"),

  type_import_private_target: [
    "Types define data contracts.",
    "Private types cannot be depended upon externally.",
  ].join("\n"),
};

const INTENT: Record<Cause, string> = {
  boundary_violation:
    "You are trying to use another package's capability directly instead of through its interface.",
  deleted_public_api:
    "You are changing a shared contract without coordinating dependents.",
  relative_escape:
    "You are trying to share code that has no defined owning package.",
  type_import_private_target:
    "You are coupling to another package's internal data representation.",
};

const NEXT_STEP: Record<Cause, string> = {
  boundary_violation:
    "Expose the needed functionality in the target package's public index.ts OR create a consumer-side adapter that depends only on the public API.",
  deleted_public_api:
    "Restore the export, mark deprecated, migrate dependents, then remove in a later change.",
  relative_escape:
    "Create a shared package for the code and import it normally.",
  type_import_private_target:
    "Promote the type to the public API or define a local interface abstraction.",
};

export function generateGuidance(cause: string | null): string {
  const c = normalizeCause(cause);
  return c ? GUIDANCE[c] : "";
}

export function generateIntent(cause: string | null): string {
  const c = normalizeCause(cause);
  return c ? INTENT[c] : "";
}

export function generateNextStep(cause: string | null): string {
  const c = normalizeCause(cause);
  return c ? NEXT_STEP[c] : "";
}
