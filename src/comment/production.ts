/**
 * Production PR comment generator (Prompt 13). Lifecycle-safe, identity marker,
 * outdated and non-determinism handling. Byte-stable output.
 */

import type { PolicyOutput } from "../policy/types.js";

const IDENTITY_MARKER_PREFIX = "<!-- arcsight:run:";

const ACTION_DISPLAY: Record<string, { emoji: string; word: string }> = {
  merge: { emoji: "🟢", word: "ALLOW" },
  block: { emoji: "🔴", word: "BLOCK" },
  review: { emoji: "🟡", word: "REVIEW" },
  retry: { emoji: "🟠", word: "RETRY" },
};

export interface ProductionReport {
  status?: string;
  scope?: { mode?: string };
  run?: { id?: string };
  classification?: { primaryCause?: string | null };
  minimalCut?: string[];
  downgradeReasons?: string[];
  timestamp?: string;
}

export interface ProductionCommentInput {
  report: ProductionReport;
  decision: PolicyOutput;
  commitSha: string;
  runId: string;
  isOutdated: boolean;
  isNonDeterministic: boolean;
}

function runIdShort(runId: string): string {
  return typeof runId === "string" && runId.length >= 12 ? runId.slice(0, 12) : runId;
}

function sortedList(items: string[], limit: number): { lines: string[]; more: number } {
  const sorted = [...items].filter((x) => typeof x === "string").sort((a, b) => a.localeCompare(b, "en"));
  const more = Math.max(0, sorted.length - limit);
  const lines = sorted.slice(0, limit);
  return { lines, more };
}

/**
 * Renders the production PR comment. First line is always the identity marker.
 * Deterministic: only depends on the six inputs; all lists sorted alphabetically.
 */
export function renderProductionComment(input: ProductionCommentInput): string {
  const { report, decision, commitSha, runId, isOutdated, isNonDeterministic } = input;

  const firstLine = `${IDENTITY_MARKER_PREFIX}${runId} -->`;

  if (isOutdated) {
    return [
      firstLine,
      "",
      "ArcSight Result: ⏳ OUTDATED",
      "",
      "This result was generated for an older commit and has been replaced by newer changes.",
      "",
      `Commit: ${commitSha}`,
    ].join("\n");
  }

  if (isNonDeterministic) {
    return [
      firstLine,
      "",
      "ArcSight Result: ⚠️ INDETERMINATE",
      "",
      "The same change produced different architectural decisions across runs.",
      "This result is ignored for safety. Please re-run the check.",
      "",
      `Run ID: ${runIdShort(runId)}`,
    ].join("\n");
  }

  const display = ACTION_DISPLAY[decision.action] ?? { emoji: "🟡", word: "REVIEW" };
  const primaryCause = report.classification?.primaryCause ?? "none";
  const minimalCut = report.minimalCut ?? [];
  const { lines: boundaryLines, more: boundaryMore } = sortedList(minimalCut, 8);

  const sections: string[] = [
    firstLine,
    "",
    `ArcSight Result: ${display.emoji} ${display.word}`,
    "",
    `Message: ${decision.message}`,
    "",
    `Confidence: (${decision.confidence})`,
    "",
    `Primary Cause: ${primaryCause}`,
    "",
    "Affected Boundaries:",
  ];

  for (const id of boundaryLines) {
    sections.push(`- ${id}`);
  }
  if (boundaryMore > 0) {
    sections.push(`+${boundaryMore} more`);
  }

  const status = report.status ?? "—";
  const scopeMode = report.scope?.mode ?? "—";
  const timestamp = report.timestamp ?? "";
  const downgradeReasons = report.downgradeReasons ?? [];
  const violationItems = minimalCut;

  const detailParts: string[] = [
    `Status: ${status}`,
    `Scope: ${scopeMode}`,
    `Run ID: ${runIdShort(runId)}`,
    `Commit: ${commitSha}`,
    `Timestamp: ${timestamp}`,
  ];

  if (downgradeReasons.length > 0) {
    const { lines: reasonLines } = sortedList(downgradeReasons, 999);
    detailParts.push("", "Downgrade Reasons:");
    for (const r of reasonLines) {
      detailParts.push(`- ${r}`);
    }
  }

  if (violationItems.length > 0) {
    const { lines: violationLines } = sortedList(violationItems, 999);
    detailParts.push("", "Violations:");
    for (const v of violationLines) {
      detailParts.push(`- ${v}`);
    }
  }

  sections.push(
    "",
    "<details>",
    "<summary>Details (click to expand)</summary>",
    "",
    ...detailParts,
    "",
    "</details>",
  );

  return sections.join("\n");
}

/** Returns true if body contains the production identity marker. */
export function productionCommentContainsMarker(body: string): boolean {
  return body.includes(IDENTITY_MARKER_PREFIX);
}

/** Parses runId from production marker line. */
export function parseProductionMarker(body: string): { runId: string } | null {
  const match = body.match(/<!-- arcsight:run:([^\s>]+)\s*-->/);
  if (!match) return null;
  return { runId: match[1] };
}
