/**
 * Production PR comment generator (Prompt 13). Lifecycle-safe, identity marker,
 * outdated and non-determinism handling. Byte-stable output.
 * Shareable architectural explanation layer: human review comment, 900-char cap.
 */

import type { PolicyOutput } from "../policy/types.js";
import { formatArchitecturalExplanation } from "./architecturalExplanation.js";
import type { ArchitecturalExplanationInput } from "./architecturalExplanation.js";

const IDENTITY_MARKER_PREFIX = "<!-- arcsight:run:";

export interface ProductionReport {
  status?: string;
  decision?: { level?: string };
  scope?: { mode?: string };
  run?: { id?: string };
  classification?: { primaryCause?: string | null };
  minimalCut?: string[];
  downgradeReasons?: string[];
  timestamp?: string;
  confidence?: { coverageRatio?: number };
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

  const levelFromPolicy =
    decision.action === "merge" ? "allow" : decision.action === "block" ? "block" : "warn";
  const coverageFromPolicy =
    decision.confidence === "high" ? 0.95 : decision.confidence === "medium" ? 0.85 : 0;
  const shareableInput: ArchitecturalExplanationInput = {
    status: report.status,
    decision: report.decision?.level ? { level: report.decision.level } : { level: levelFromPolicy },
    classification: report.classification,
    minimalCut: report.minimalCut,
    scope: report.scope,
    confidence:
      report.confidence?.coverageRatio != null
        ? { coverageRatio: report.confidence.coverageRatio }
        : { coverageRatio: coverageFromPolicy },
  };
  const architecturalBody = formatArchitecturalExplanation(shareableInput);
  return [firstLine, "", architecturalBody].join("\n");
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
