/**
 * Predictive Structural Consequence Mode (Prompt 6 — v2.1.0).
 * Stacked-PR safe, replay-stable, monotonic. One sentence, package-level only.
 */

import { createHash } from "crypto";
import { parseMinimalCut } from "../repair/parseReport.js";
import { formatContainmentExplanation } from "./containmentExplanation.js";
import type { ArcSightReport } from "./containmentExplanation.js";

export const PREDICTIVE_CONSEQUENCE_VERSION = "2.1.0";

const SUPPORTED_CAUSES = new Set([
  "boundary_violation",
  "deleted_public_api",
  "type_import_private_target",
  "relative_escape",
]);

const CAUSE_TO_DEPENDENCY_KIND: Record<string, string> = {
  boundary_violation: "internal_access",
  deleted_public_api: "contract_removal",
  type_import_private_target: "private_type_dependency",
  relative_escape: "file_structure_dependency",
};

const SEVERITY_ORDER: Record<string, number> = {
  contract_removal: 1,
  internal_access: 2,
  private_type_dependency: 3,
  file_structure_dependency: 4,
};

const CONSEQUENCE_TEXT: Record<string, string> = {
  HIDDEN_COUPLING_BREAK:
    "A change to internal components of the target package requires modification of this dependency.",
  TYPE_PROPAGATION_BREAK:
    "A private type change in the target package requires modification of this dependency.",
  DOWNSTREAM_INTERFACE_BREAK:
    "Removing this public interface requires updates in dependent packages.",
  LOCALITY_LEAK:
    "This dependency relies on file-level structure instead of package boundaries.",
};

const DEPENDENCY_KIND_TO_CONSEQUENCE: Record<string, string> = {
  internal_access: "HIDDEN_COUPLING_BREAK",
  private_type_dependency: "TYPE_PROPAGATION_BREAK",
  contract_removal: "DOWNSTREAM_INTERFACE_BREAK",
  file_structure_dependency: "LOCALITY_LEAK",
};

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Stable package identity: normalized relative package root (no absolute paths, no aliases). */
function stablePkgId(pkg: string): string {
  const n = pkg.replace(/^packages\/+/, "").trim().replace(/\\/g, "/");
  const first = n.split("/")[0];
  return (first ?? n) || pkg.trim();
}

function targetPkgFromSpecifier(spec: string | undefined): string | null {
  if (!spec || typeof spec !== "string") return null;
  const t = spec.replace(/\\/g, "/").trim();
  const m = t.match(/^packages\/([^/]+)/);
  if (m) return m[1] ?? null;
  const first = t.split("/")[0];
  return first && first !== ".." && first !== "." ? first : null;
}

function relationKey(importer: string, dependency: string, dependencyKind: string): string {
  return sha256Hex([importer, dependency, dependencyKind].join("\0"));
}

function structuralKey(primaryCause: string, relKey: string): string {
  return sha256Hex(primaryCause + "\0" + relKey);
}

/** Compute anchorKey for stacked-PR identity. Caller stores initialHeadSha per PR. */
export function anchorKeyForPR(prNumber: number, initialHeadCommitSha: string): string {
  return sha256Hex(String(prNumber) + "\0" + initialHeadCommitSha);
}

export interface PredictiveConsequenceContext {
  changedFiles?: string[];
  prNumber?: number;
  headSha?: string;
  /** First observed head SHA for this PR (for stacked-PR anchor). Caller persists per PR. */
  initialHeadShaForPR?: string;
  /** Last emitted structuralKey for this PR (monotonic guard). Caller persists per PR. */
  previouslyEmittedStructuralKey?: string;
  /** Last emitted relationKey for this PR (structural stability guard). Caller persists per PR. */
  previouslyEmittedRelationKey?: string;
}

export interface PredictiveConsequenceResult {
  text: string;
  structuralKey: string;
  relationKey: string;
}

/**
 * Emit one guaranteed architectural maintenance consequence when mathematically certain.
 * Returns null (emit nothing) if any activation or stability guard fails.
 */
export function formatPredictiveConsequence(
  report: ArcSightReport,
  context?: PredictiveConsequenceContext,
): PredictiveConsequenceResult | null {
  const level = (report.decision?.level ?? "").trim().toLowerCase();
  if (level !== "block") return null;

  if (report.confidence?.coverageRatio !== 1) return null;

  const downgradeReasons = report.downgradeReasons ?? [];
  if (downgradeReasons.length > 0) return null;
  const forbiddenReasons = /resolver_uncertain|missing_public_entry|certifier_script_missing/i;
  if (downgradeReasons.some((r) => forbiddenReasons.test(String(r)))) return null;

  const primaryCause = (report.classification?.primaryCause ?? null) as string | null;
  if (!primaryCause || !SUPPORTED_CAUSES.has(primaryCause)) return null;

  const minimalCut = report.minimalCut ?? [];
  if (minimalCut.length === 0) return null;

  const containment = formatContainmentExplanation(report, {
    changedFiles: context?.changedFiles,
  });
  if (containment === "No refactor suggestion.") return null;

  const parsed = parseMinimalCut(minimalCut);
  if (parsed.length === 0) return null;

  const relations: { importer: string; dependency: string; kind: string; relKey: string }[] = [];
  for (const v of parsed) {
    const cause = (v.cause ?? "").trim();
    const kind = CAUSE_TO_DEPENDENCY_KIND[cause];
    if (!kind) continue;
    const importer = stablePkgId(v.package);
    const dep = targetPkgFromSpecifier(v.specifier) ?? stablePkgId(v.package);
    if (importer === dep) continue;
    relations.push({
      importer,
      dependency: dep,
      kind,
      relKey: relationKey(importer, dep, kind),
    });
  }
  if (relations.length === 0) return null;

  const bySeverity = new Map<number, typeof relations>();
  for (const r of relations) {
    const sev = SEVERITY_ORDER[r.kind] ?? 999;
    if (!bySeverity.has(sev)) bySeverity.set(sev, []);
    bySeverity.get(sev)!.push(r);
  }
  const minSeverity = Math.min(...bySeverity.keys());
  const group = bySeverity.get(minSeverity)!;
  const distinctByKey = new Map<string, (typeof relations)[0]>();
  for (const r of group) {
    if (!distinctByKey.has(r.relKey)) distinctByKey.set(r.relKey, r);
  }
  const sortedKeys = [...distinctByKey.keys()].sort((a, b) => a.localeCompare(b, "en"));
  const selectedKey = sortedKeys[0];
  if (!selectedKey) return null;
  const selected = distinctByKey.get(selectedKey)!;
  const consequenceType = DEPENDENCY_KIND_TO_CONSEQUENCE[selected.kind];
  if (!consequenceType) return null;
  const text = CONSEQUENCE_TEXT[consequenceType];
  if (!text) return null;

  const structKey = structuralKey(primaryCause, selected.relKey);

  if (context?.previouslyEmittedStructuralKey === structKey) return null;
  if (
    context?.previouslyEmittedRelationKey != null &&
    context.previouslyEmittedRelationKey === selected.relKey &&
    context.previouslyEmittedStructuralKey !== structKey
  ) {
    return null;
  }
  if (
    context?.previouslyEmittedRelationKey != null &&
    context.previouslyEmittedRelationKey !== selected.relKey
  ) {
    return null;
  }

  return { text, structuralKey: structKey, relationKey: selected.relKey };
}
