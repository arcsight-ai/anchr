/**
 * Human Architectural Comment Renderer (Prompt 3 — FINAL).
 * Renders structural analysis into a short, neutral PR comment.
 * Primary + secondary cause; ALLOW hides boundary/intent sections.
 * Only formats — never changes severity or decisions.
 */

import type { ArcSightReportLike } from "./law.js";
import { deriveNarrativeKey } from "./law.js";
import { parseMinimalCut } from "../repair/parseReport.js";

export type ArcSightReport = ArcSightReportLike & { run?: { id?: string } };

const CAUSE_PRIORITY = [
  "deleted_public_api",
  "boundary_violation",
  "type_import_private_target",
  "relative_escape",
  "indeterminate",
] as const;

const CAUSE_LABEL: Record<string, string> = {
  deleted_public_api: "public API removed",
  boundary_violation: "internal module access",
  type_import_private_target: "new cross-package dependency",
  relative_escape: "relative escape",
  indeterminate: "coupling increase",
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

function causeOrder(c: string): number {
  const i = CAUSE_PRIORITY.indexOf(c as (typeof CAUSE_PRIORITY)[number]);
  return i >= 0 ? i : 999;
}

/** Unique causes in minimalCut, ordered by CAUSE_PRIORITY. First = primary, second = secondary. */
function primaryAndSecondaryCauses(minimalCut: string[]): { primary: string | null; secondary: string | null } {
  const seen = new Set<string>();
  const parsed = parseMinimalCut(minimalCut);
  for (const v of parsed) {
    const c = (v.cause ?? "").trim();
    if (c) seen.add(c);
  }
  const ordered = [...seen].sort((a, b) => causeOrder(a) - causeOrder(b));
  const primary = ordered[0] ?? null;
  const secondary = ordered.length > 1 ? ordered[1]! : null;
  return { primary, secondary };
}

/** First (from, to) package pair from minimalCut for boundary line. */
function boundaryPair(minimalCut: string[]): { from: string; to: string } | null {
  const parsed = parseMinimalCut(minimalCut);
  for (const v of parsed) {
    const from = pkgName(v.package);
    const to = targetFromSpecifier(v.specifier) ?? from;
    if (from && to) return { from, to };
  }
  return null;
}

/** Structural change label from level and primary cause. */
function structuralChangeLabel(level: string, primaryCause: string | null): string {
  if (level === "allow") return "non-structural change";
  switch (primaryCause) {
    case "deleted_public_api":
      return "public API removed";
    case "boundary_violation":
    case "relative_escape":
      return "internal module accessed";
    case "type_import_private_target":
      return "new dependency introduced";
    case "indeterminate":
      return "coupling increased";
    default:
      return "coupling increased";
  }
}

/** Intent signal: many files vs single file vs deleted public API. */
function intentSignal(minimalCut: string[], primaryCause: string | null): string {
  if (primaryCause === "deleted_public_api") return "intent unclear — review recommended";
  const parsed = parseMinimalCut(minimalCut);
  const fromFiles = new Set(parsed.map((v) => v.path));
  if (fromFiles.size > 1) return "likely intentional architecture change";
  return "likely incidental coupling";
}

export interface FormatArchitecturalCommentInput {
  report: ArcSightReport;
  causalReportBody: string;
  previousRunId?: string;
  previousStructuralSummary?: string;
}

/**
 * Format the PR comment body (Prompt 3). Idempotency: same run.id → update; different run.id → replace.
 * Stability guard: if previous comment exists and run.id changed but structural summary unchanged → short ALLOW.
 */
export function formatArchitecturalComment(input: FormatArchitecturalCommentInput): string {
  const { report, causalReportBody, previousRunId, previousStructuralSummary } = input;
  const runId = (report.run?.id ?? "").trim();
  const level = (report.decision?.level ?? "warn").trim().toLowerCase();
  const key = deriveNarrativeKey(report);
  const minimalCut = report.minimalCut ?? [];
  const { primary, secondary } = primaryAndSecondaryCauses(minimalCut);
  const subject = key.subject || "modified code";
  const dependency = key.dependency || "another package";
  const boundary = boundaryPair(minimalCut);

  const currentStructuralSummary = level + (primary ?? "") + (secondary ?? "") + (boundary ? `${boundary.from}->${boundary.to}` : "");

  if (
    previousRunId &&
    previousStructuralSummary != null &&
    runId !== previousRunId &&
    currentStructuralSummary === previousStructuralSummary
  ) {
    const shortLines = [
      "ANCHR",
      "",
      "No architectural boundary changes detected.",
      "",
      "Architecture unchanged since last analysis.",
      "",
      "Do not restate previous warnings.",
      "",
      "Analyzed relative to the PR base branch.",
      "",
      "This describes structural impact only and does not block merging.",
      "",
      `<!-- arcsight:summary:${currentStructuralSummary} -->`,
    ];
    return shortLines.join("\n");
  }

  const lines: string[] = [];

  lines.push("ANCHR");
  lines.push("");

  if (level === "block") {
    lines.push("Architectural dependency change detected.");
  } else if (level === "warn") {
    lines.push("Potential architectural coupling detected.");
  } else {
    lines.push("No architectural boundary changes detected.");
  }
  lines.push("");

  if (level !== "allow") {
    const primaryLabel = primary ? (CAUSE_LABEL[primary] ?? primary) : null;
    const secondaryLabel = secondary ? (CAUSE_LABEL[secondary] ?? secondary) : null;
    if (primaryLabel) lines.push(`Primary cause: ${primaryLabel}`);
    if (secondaryLabel) lines.push(`Secondary cause: ${secondaryLabel}`);
    if (primaryLabel || secondaryLabel) lines.push("");

    if (boundary) {
      lines.push(`Boundary: ${boundary.from} → ${boundary.to}`);
      lines.push("");
    }
    lines.push(`Structural change: ${structuralChangeLabel(level, primary)}`);
    lines.push(`Intent signal: ${intentSignal(minimalCut, primary)}`);
    lines.push("");
    lines.push(`Scope: ${level === "block" ? `Downstream packages depending on ${dependency}` : `Future changes to ${dependency} may affect ${subject}`}`);
    const blast =
      level === "block"
        ? `Changes in ${dependency} can propagate across package boundaries.`
        : "Coupling increases sensitivity to future refactors.";
    lines.push(`Blast radius: ${blast.slice(0, 120)}`);
    lines.push(
      level === "block"
        ? "Review guidance: Architectural review recommended before merge"
        : "Review guidance: Safe to merge but note increased coupling"
    );
    lines.push("");
  } else {
    lines.push("Structural change: non-structural change");
    lines.push("Scope: Localized to modified files only");
    lines.push("Blast radius: No cross-package impact.");
    lines.push("Review guidance: No architectural review needed");
    lines.push("");
  }

  if (level === "allow") {
    lines.push("This change does not alter how modules depend on each other.");
  } else {
    lines.push(
      "This change introduces a dependency that bypasses the public boundary. Future refactors in the target package can break this code without changing its public API."
    );
  }
  lines.push("");

  if (level !== "allow") {
    lines.push("Ripple-effect risk increases when modules depend on internal implementation instead of the public contract.");
  }
  lines.push("");

  lines.push("<details>");
  lines.push("<summary>Technical details</summary>");
  lines.push("");
  lines.push(causalReportBody);
  lines.push("");
  lines.push("</details>");
  lines.push("");
  lines.push("Analyzed relative to the PR base branch.");
  lines.push("");
  lines.push("This describes structural impact only and does not block merging.");

  const summaryMarker = [level, primary ?? "", secondary ?? "", boundary ? `${boundary.from}->${boundary.to}` : ""].join("|");
  lines.push("");
  lines.push(`<!-- arcsight:summary:${summaryMarker} -->`);

  return lines.join("\n");
}

/** Parse structural summary from a previous comment body (for stability guard). */
export function parseArchitecturalCommentSummary(body: string): string | null {
  const m = body.match(/<!-- arcsight:summary:([^>]+)\s*-->/);
  return m ? m[1].trim() : null;
}
