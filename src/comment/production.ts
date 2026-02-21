/**
 * Production PR comment generator (Prompt 13). Lifecycle-safe, identity marker,
 * outdated and non-determinism handling. Uses Human Architectural Comment (Prompt 3).
 */

import type { PolicyOutput } from "../policy/types.js";
import { formatCausalReport } from "../formatters/causalReport.js";
import { formatArchitecturalComment } from "../formatters/architecturalComment.js";
import { formatFollowUpHint, FOLLOW_UP_SILENCE } from "../formatters/followUpHint.js";
import { formatContainmentExplanation } from "../formatters/containmentExplanation.js";
import { formatPredictiveConsequence } from "../formatters/predictiveConsequence.js";
import { formatOneScreenSummary } from "../formatters/oneScreenSummary.js";

const IDENTITY_MARKER_PREFIX = "<!-- arcsight:run:";
const INITIAL_HEAD_MARKER_PREFIX = "<!-- arcsight:initial_head:";
const CONSEQUENCE_MARKER_PREFIX = "<!-- arcsight:consequence:";

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
  /** For stability guard: if run.id changed but structural summary same, show short ALLOW. */
  previousRunId?: string;
  previousStructuralSummary?: string;
  /** If true, do not add follow-up hint (e.g. existing ArcSight comment on PR). */
  hasExistingArcSightComment?: boolean;
  /** Paths of files changed in the PR (for change-causality: only explain if violation introduced by this change). */
  changedFiles?: string[];
  /** First observed head SHA for this PR (stacked-PR anchor). Parsed from existing comment or set on first comment. */
  initialHeadShaForPR?: string;
  /** Last emitted consequence keys (monotonic guard). Parsed from existing comment. */
  previouslyEmittedStructuralKey?: string;
  previouslyEmittedRelationKey?: string;
  /** Last emitted consequence sentence (preserve on comment update when we do not re-emit). */
  previousConsequenceText?: string;
}

function runIdShort(runId: string): string {
  return typeof runId === "string" && runId.length >= 12 ? runId.slice(0, 12) : runId;
}

/**
 * Renders the production PR comment. First line is always the identity marker.
 * Uses Human Architectural Comment (Prompt 3): primary + secondary cause, determinism line, technical details = full causal report.
 */
export function renderProductionComment(input: ProductionCommentInput): string {
  const { report, decision, commitSha, runId, isOutdated, isNonDeterministic, previousRunId, previousStructuralSummary, hasExistingArcSightComment, changedFiles, initialHeadShaForPR, previouslyEmittedStructuralKey, previouslyEmittedRelationKey, previousConsequenceText } = input;

  const firstLine = `${IDENTITY_MARKER_PREFIX}${runId} -->`;

  if (isOutdated) {
    return [
      firstLine,
      "",
      "ANCHR Result: ⏳ OUTDATED",
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
      "ANCHR Result: ⚠️ INDETERMINATE",
      "",
      "The same change produced different architectural decisions across runs.",
      "This result is ignored for safety. Please re-run the check.",
      "",
      `Run ID: ${runIdShort(runId)}`,
    ].join("\n");
  }

  const levelFromPolicy =
    decision.action === "merge" ? "allow" : decision.action === "block" ? "block" : "warn";
  const reportForComment = {
    ...report,
    decision: report.decision?.level ? report.decision : { level: levelFromPolicy },
    run: report.run ?? { id: runId },
  };
  const causalReportBody = formatCausalReport(reportForComment as import("../formatters/causalReport.js").ArcSightReport);
  const architecturalBody = formatArchitecturalComment({
    report: reportForComment as import("../formatters/architecturalComment.js").ArcSightReport,
    causalReportBody,
    previousRunId,
    previousStructuralSummary,
  });

  const oneScreen = formatOneScreenSummary(reportForComment as import("../formatters/oneScreenSummary.js").OneScreenReport);
  const hint = formatFollowUpHint(reportForComment as import("../formatters/followUpHint.js").ArcSightReport, {
    hasExistingArcSightComment: hasExistingArcSightComment === true,
  });
  let body = oneScreen;
  body = [body, "", "---", "", "Supporting evidence:", ""].join("\n");
  body = hint !== FOLLOW_UP_SILENCE ? [body, architecturalBody, "", hint].join("\n") : [body, architecturalBody].join("\n");

  const containment = formatContainmentExplanation(reportForComment as import("../formatters/containmentExplanation.js").ArcSightReport, { changedFiles });
  if (containment !== "No refactor suggestion.") {
    body = [body, "", containment].join("\n");
  }

  const predictive = formatPredictiveConsequence(reportForComment as import("../formatters/containmentExplanation.js").ArcSightReport, {
    changedFiles,
    previouslyEmittedStructuralKey,
    previouslyEmittedRelationKey,
  });
  if (predictive) {
    body = [body, "", predictive.text].join("\n");
    body = [body, "", `${CONSEQUENCE_MARKER_PREFIX}${predictive.structuralKey}:${predictive.relationKey} -->`].join("\n");
  } else if (
    previouslyEmittedStructuralKey &&
    previouslyEmittedRelationKey &&
    previousConsequenceText
  ) {
    body = [body, "", previousConsequenceText].join("\n");
    body = [body, "", `${CONSEQUENCE_MARKER_PREFIX}${previouslyEmittedStructuralKey}:${previouslyEmittedRelationKey} -->`].join("\n");
  }

  if (initialHeadShaForPR) {
    body = [body, "", `${INITIAL_HEAD_MARKER_PREFIX}${initialHeadShaForPR} -->`].join("\n");
  }

  return [firstLine, "", body].join("\n");
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

/** Parses initial head SHA from comment (stacked-PR anchor). */
export function parseInitialHeadFromComment(body: string): string | null {
  const m = body.match(/<!-- arcsight:initial_head:([^\s>]+)\s*-->/);
  return m ? m[1].trim() : null;
}

/** Parses last emitted consequence keys and visible text from comment (monotonic guard; preserve on update). */
export function parseConsequenceFromComment(
  body: string,
): { structuralKey: string; relationKey: string; text?: string } | null {
  const m = body.match(/<!-- arcsight:consequence:([^:]+):([^\s>]+)\s*-->/);
  if (!m) return null;
  const structuralKey = m[1].trim();
  const relationKey = m[2].trim();
  const before = body.slice(0, body.indexOf(m[0]));
  const trimmed = before.replace(/\n+$/, "");
  const lastParagraph = trimmed.slice(trimmed.lastIndexOf("\n\n") + 2).trim();
  const text = lastParagraph && !lastParagraph.startsWith("<!--") ? lastParagraph : undefined;
  return { structuralKey, relationKey, text };
}
