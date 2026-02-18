/**
 * Certifiable guidance only. Paths that could lead to VERIFIED.
 * Architectural only: relationships and responsibilities, no files/imports/steps.
 */

const CERTIFIABLE_GUIDANCE: Record<string, string> = {
  boundary_violation:
    "Depend on the module's public boundary rather than its internals. Introduce an abstraction at the boundary that both sides can rely on.",
  type_import_private_target:
    "Surface the needed contract through the package's public boundary so dependents use a single stable interface.",
  relative_escape:
    "Use the package's declared public surface so dependencies flow in one direction and stay verifiable.",
};

export function getCertifiableGuidance(primaryCause: string): string | null {
  return CERTIFIABLE_GUIDANCE[primaryCause] ?? null;
}
