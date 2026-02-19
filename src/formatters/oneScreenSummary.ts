/**
 * One-Screen Rule (Prompt 7 — Honest Unknown Mode v6).
 * Concise summary that fully explains the decision in ≤12 lines.
 * Includes: decision, primaryCause, affectedPackages, developerAction.
 * Everything else is supporting evidence.
 */

import type { ArcSightReportLike } from "./law.js";
import { parseMinimalCut } from "../repair/parseReport.js";

export const ONE_SCREEN_MAX_LINES = 12;

export type OneScreenReport = ArcSightReportLike & {
  decision?: { level?: string };
  classification?: { primaryCause?: string | null };
  minimalCut?: string[];
};

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

/** Unique affected package names from minimalCut, sorted. */
function affectedPackagesList(minimalCut: string[]): string[] {
  const set = new Set<string>();
  const parsed = parseMinimalCut(minimalCut);
  for (const v of parsed) {
    const p = pkgName(v.package);
    if (p) set.add(p);
    const t = targetFromSpecifier(v.specifier);
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "en"));
}

const CAUSE_LABEL: Record<string, string> = {
  boundary_violation: "internal module access",
  type_import_private_target: "cross-package type dependency",
  deleted_public_api: "public API removed",
  relative_escape: "relative path escape",
  indeterminate: "coupling increase",
};

function developerAction(level: string, primaryCause: string | null): string {
  const l = level.trim().toLowerCase();
  if (l === "allow") return "No action required.";
  if (l === "block") {
    switch (primaryCause) {
      case "boundary_violation":
        return "Import from the package entrypoint instead of internal files.";
      case "type_import_private_target":
        return "Expose required types via the public API.";
      case "deleted_public_api":
        return "Re-export the interface or provide a public alias.";
      case "relative_escape":
        return "Move shared logic into a shared module or use the public boundary.";
      default:
        return "Resolve the boundary violation before merge.";
    }
  }
  if (l === "warn") return "Safe to merge; consider reducing coupling in a follow-up.";
  return "Re-run the check or expand analysis to resolve.";
}

function decisionLabel(level: string): string {
  const l = level.trim().toLowerCase();
  if (l === "block") return "BLOCK";
  if (l === "allow") return "ALLOW";
  if (l === "warn") return "WARN";
  return "UNKNOWN";
}

/**
 * Format a one-screen summary (≤12 lines) that fully explains the decision.
 * Deterministic: same report → same summary.
 */
export function formatOneScreenSummary(report: OneScreenReport): string {
  const level = (report.decision?.level ?? "warn").trim().toLowerCase();
  const primaryCause = (report.classification?.primaryCause ?? null) as string | null;
  const minimalCut = report.minimalCut ?? [];
  const packages = affectedPackagesList(minimalCut);
  const causeLabel = primaryCause ? (CAUSE_LABEL[primaryCause] ?? primaryCause) : "none";
  const action = developerAction(level, primaryCause);
  const decision = decisionLabel(level);

  const lines: string[] = [];
  lines.push(`Decision: ${decision}`);
  lines.push(`Primary cause: ${causeLabel}`);
  lines.push(`Affected packages: ${packages.length > 0 ? packages.join(", ") : "none"}`);
  lines.push(`Developer action: ${action}`);

  if (level === "allow") {
    lines.push("");
    lines.push("This change does not modify module dependency boundaries.");
  } else if (level === "block") {
    lines.push("");
    lines.push("This change introduces a dependency that bypasses the public boundary.");
  } else if (level === "warn") {
    lines.push("");
    lines.push("Potential architectural coupling detected; review recommended.");
  }

  const out = lines.join("\n");
  const lineCount = out.split("\n").length;
  if (lineCount > ONE_SCREEN_MAX_LINES) {
    return lines.slice(0, ONE_SCREEN_MAX_LINES).join("\n");
  }
  return out;
}
