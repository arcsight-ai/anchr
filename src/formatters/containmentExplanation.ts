/**
 * Deterministic Containment Explanation Mode (Prompt 5 — v1.3.0 Frozen).
 * Only describe containment when BLOCK; never suggest, advise, or attribute blame.
 * Change-causality: only explain if the PR introduced the boundary crossing.
 */

import type { ArcSightReportLike } from "./law.js";
import { parseMinimalCut } from "../repair/parseReport.js";

export const EXPLANATION_VERSION = "1.3.0";

export type ArcSightReport = ArcSightReportLike & {
  run?: { id?: string };
  confidence?: { coverageRatio?: number };
  downgradeReasons?: string[];
};

const FALLBACK = "No refactor suggestion.";

const SUPPORTED_CAUSES = new Set(["boundary_violation", "type_import_private_target"]);

const INTERNAL_MODULE_ACCESS =
  "This change crosses a package's internal boundary. " +
  "Internal modules are not dependency-stable surfaces. " +
  "Stability is defined at the public boundary.";

const PRIVATE_TYPE_USAGE =
  "This change depends on a non-public type. " +
  "Private types are not cross-package contracts. " +
  "Stability requires a public interface boundary.";

function pkgName(p: string): string {
  return p.replace(/^packages\/+/, "").trim();
}

function targetFromSpecifier(spec: string | undefined): string | null {
  if (!spec || typeof spec !== "string") return null;
  const t = spec.replace(/\\/g, "/").trim();
  const m = t.match(/^packages\/([^/]+)/);
  if (m) return m[1] ?? null;
  const first = t.split("/")[0];
  return first && first !== ".." && first !== "." ? first : null;
}

/** Normalize path for comparison: forward slashes, no leading ./, optional packages/ strip for match. */
function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\/+/, "").trim();
}

/** Canonical path for causality match: repo-relative, no packages/ prefix. */
function pathForCausalityMatch(p: string): string {
  const n = normPath(p);
  return n.replace(/^packages\/+/, "");
}

/** True if path is likely a test file (suppress unless we have non-test changes). */
function isTestPath(path: string): boolean {
  const n = normPath(path).toLowerCase();
  return (
    /\.(spec|test)\.(ts|tsx|js|jsx)$/.test(n) ||
    /__(tests?|mocks?)__\//.test(n) ||
    /\/tests?\//.test(n)
  );
}

/**
 * Format containment explanation or fallback. v1.3.0 frozen.
 * Returns "No refactor suggestion." unless all eligibility and causality checks pass.
 */
export function formatContainmentExplanation(
  report: ArcSightReport,
  context?: { changedFiles?: string[] },
): string {
  const level = (report.decision?.level ?? "").trim().toLowerCase();
  if (level !== "block") return FALLBACK;

  const runId = (report.run?.id ?? "").trim();
  if (!runId) return FALLBACK;

  const coverage = report.confidence?.coverageRatio ?? 0;
  if (coverage < 0.9) return FALLBACK;

  if ((report.downgradeReasons ?? []).length > 0) return FALLBACK;

  const primaryCause = (report.classification?.primaryCause ?? null) as string | null;
  if (primaryCause === "deleted_public_api") return FALLBACK;
  if (!primaryCause || !SUPPORTED_CAUSES.has(primaryCause)) return FALLBACK;

  const minimalCut = report.minimalCut ?? [];
  if (minimalCut.length !== 1) return FALLBACK;

  const parsed = parseMinimalCut(minimalCut);
  if (parsed.length === 0) return FALLBACK;

  const v = parsed[0]!;
  const sourcePackage = pkgName(v.package);
  const targetPackage = targetFromSpecifier(v.specifier) ?? pkgName(v.package);
  if (!sourcePackage || !targetPackage) return FALLBACK;
  if (sourcePackage === targetPackage) return FALLBACK;

  const changedFiles = context?.changedFiles ?? [];
  if (changedFiles.length === 0) return FALLBACK;

  const onlyTestChanged = changedFiles.every((f) => isTestPath(f));
  if (onlyTestChanged) return FALLBACK;

  const violatingMatch = pathForCausalityMatch(v.path);
  const changedMatches = new Set(changedFiles.map(pathForCausalityMatch));
  const violatingFileInDiff =
    changedMatches.has(violatingMatch) ||
    changedMatches.has(normPath(v.path)) ||
    [...changedMatches].some((c) => c === violatingMatch || c.endsWith("/" + violatingMatch) || violatingMatch.endsWith("/" + c));
  if (!violatingFileInDiff) return FALLBACK;

  const causesInCut = new Set(parsed.map((x) => x.cause?.trim()).filter(Boolean));
  if (causesInCut.size !== 1) return FALLBACK;

  const targetPackagesInCut = new Set(parsed.map((x) => targetFromSpecifier(x.specifier) ?? pkgName(x.package)));
  if (targetPackagesInCut.size !== 1) return FALLBACK;

  switch (primaryCause) {
    case "boundary_violation":
      return INTERNAL_MODULE_ACCESS;
    case "type_import_private_target":
      return PRIVATE_TYPE_USAGE;
    default:
      return FALLBACK;
  }
}
