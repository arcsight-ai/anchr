/**
 * Deterministic repair planner (Prompt 15). Converts violations into minimal
 * fix suggestions with confidenceReason. Pure function; no I/O.
 */

import type { PlannerViolation, FixSuggestion, PlannerInput, PlannerOutput } from "./plannerTypes.js";

const STRATEGIES: Record<
  string,
  Omit<FixSuggestion, "affects"> & { kind: string }
> = {
  boundary_violation: {
    kind: "boundary_violation",
    title: "Import from public entrypoint",
    strategy: "public_entry_import",
    priority: 1,
    confidenceReason: "Preserves package ownership and avoids internal coupling",
    explanation: "A private module from another package is imported.",
    steps: [
      "Import from the package entrypoint",
      "Re-export symbol from index.ts if needed",
      "Create adapter only if symbol cannot be public",
    ],
    safeExample: "@market-os/foo",
    unsafeExample: "@market-os/foo/src/internal/hash",
  },
  deleted_public_api: {
    kind: "deleted_public_api",
    title: "Deprecation bridge",
    strategy: "deprecation_bridge",
    priority: 1,
    confidenceReason: "Maintains backward compatibility while enabling migration",
    explanation: "A public export was removed while still depended on.",
    steps: [
      "Restore export temporarily",
      "Mark deprecated",
      "Introduce replacement",
      "Migrate callers",
      "Remove later",
    ],
    safeExample: "export { newFn as oldFn }",
    unsafeExample: "(removed export)",
  },
  type_import_private_target: {
    kind: "type_import_private_target",
    title: "Public type export",
    strategy: "public_type_export",
    priority: 1,
    confidenceReason: "Types must obey the same boundary as runtime values",
    explanation: "Types must follow public boundaries.",
    steps: [
      "Re-export type in index.ts",
      "Import from entrypoint",
    ],
    safeExample: "import type { T } from '@market-os/foo'",
    unsafeExample: "import type { T } from '@market-os/foo/src/types'",
  },
  relative_escape: {
    kind: "relative_escape",
    title: "Package import",
    strategy: "package_import",
    priority: 2,
    confidenceReason: "Relative paths bypass package contracts",
    explanation: "Relative paths escape package boundaries.",
    steps: [
      "Replace relative path with package import",
      "Move file only if impossible",
    ],
    safeExample: "@market-os/other-package",
    unsafeExample: "../../other-package/file",
  },
  fallback: {
    kind: "fallback",
    title: "Architectural refactor",
    strategy: "architectural_refactor",
    priority: 5,
    confidenceReason: "No minimal safe repair exists within current boundaries",
    explanation: "Dependency structure is invalid.",
    steps: [
      "Depend only on public APIs",
      "Remove private coupling",
      "Introduce abstraction",
    ],
    safeExample: "(use public API)",
    unsafeExample: "(private coupling)",
  },
};

const SUPPORTED_KINDS = new Set([
  "boundary_violation",
  "deleted_public_api",
  "type_import_private_target",
  "relative_escape",
]);

function templateToSuggestion(
  t: (typeof STRATEGIES)[string],
  affects: string[],
): FixSuggestion {
  const affectsSorted = [...affects].sort((a, b) => a.localeCompare(b, "en"));
  return {
    title: t.title,
    strategy: t.strategy,
    priority: t.priority,
    explanation: t.explanation,
    confidenceReason: t.confidenceReason,
    steps: [...t.steps],
    safeExample: t.safeExample,
    unsafeExample: t.unsafeExample,
    affects: affectsSorted,
  };
}

function groupViolationsByKind(
  violations: PlannerViolation[],
): Map<string, PlannerViolation[]> {
  const byKind = new Map<string, PlannerViolation[]>();
  for (const v of violations) {
    const kind = SUPPORTED_KINDS.has(v.kind) ? v.kind : "fallback";
    const list = byKind.get(kind) ?? [];
    list.push(v);
    byKind.set(kind, list);
  }
  if (byKind.size === 0) {
    byKind.set("fallback", []);
  }
  return byKind;
}

function affectsForViolations(violations: PlannerViolation[]): string[] {
  const set = new Set<string>();
  for (const v of violations) {
    const key = v.targetPath ? `${v.fromPackage}:${v.targetPath}` : v.fromPackage;
    set.add(key);
  }
  return [...set];
}

/**
 * Generates fix suggestions from violations. Deterministic: same input → same output.
 */
export function generateFixSuggestions(input: PlannerInput): FixSuggestion[] {
  const { violations } = input;
  const byKind = groupViolationsByKind(violations);
  const suggestions: FixSuggestion[] = [];

  const kinds = [...byKind.keys()].sort((a, b) => a.localeCompare(b, "en"));
  for (const kind of kinds) {
    const list = byKind.get(kind)!;
    const template = STRATEGIES[kind] ?? STRATEGIES.fallback;
    const affects = affectsForViolations(list);
    suggestions.push(templateToSuggestion(template, affects));
  }

  return suggestions.sort((a, b) => a.title.localeCompare(b.title, "en"));
}

/**
 * Selects exactly one primary suggestion: lowest priority, then smallest affects, then alphabetical strategy.
 */
export function selectPrimarySuggestion(suggestions: FixSuggestion[]): string {
  if (suggestions.length === 0) return STRATEGIES.fallback.strategy;
  const sorted = [...suggestions].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.affects.length !== b.affects.length) return a.affects.length - b.affects.length;
    return a.strategy.localeCompare(b.strategy, "en");
  });
  return sorted[0].strategy;
}

/**
 * Full planner output: suggestions plus primary strategy.
 */
export function planRepairs(input: PlannerInput): PlannerOutput {
  const suggestions = generateFixSuggestions(input);
  const primarySuggestion = selectPrimarySuggestion(suggestions);
  return { primarySuggestion, suggestions };
}
