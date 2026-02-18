import type { DecisionOutput, ChangeType, AnchRReport, ReportStatus } from "./types.js";
import { deriveChangeType } from "./changeType.js";
import { buildDecisionFromAnchRReport } from "./rules.js";

export { buildDecisionFromAnchRReport } from "./rules.js";
export { deriveChangeType, deriveChangeSummary } from "./changeType.js";
export type { DecisionOutput, DecisionInput, ChangeType, AnchRReport } from "./types.js";

export interface DecisionWithContext {
  output: DecisionOutput;
  changeType: ChangeType;
  confidence: number;
}

function mapReportStatus(status: string): ReportStatus {
  if (status === "VERIFIED") return "VERIFIED";
  if (status === "BLOCKED") return "UNSAFE";
  if (status === "INCOMPLETE") return "INCOMPLETE";
  return "INDETERMINATE";
}

function mapScopeMode(mode: string): "structural-fast-path" | "structural" | "causal" {
  if (mode === "structural" || mode === "causal") return mode;
  return "structural-fast-path";
}

export interface ReportLike {
  status?: string;
  classification?: { primaryCause?: string | null };
  confidence?: { coverageRatio?: number };
  minimalCut?: string[];
  scope?: { mode?: string };
}

export interface ConvergenceLike {
  impact?: string;
}

function reportToAnchRReport(report: ReportLike): AnchRReport {
  const coverageRatio = report.confidence?.coverageRatio ?? 0;
  return {
    status: mapReportStatus(report.status ?? "INDETERMINATE"),
    primaryCause: report.classification?.primaryCause ?? null,
    violations: report.minimalCut ?? [],
    coverageRatio,
    scopeMode: mapScopeMode(report.scope?.mode ?? "structural-fast-path"),
    confidence: coverageRatio,
  };
}

export function buildDecisionFromReport(
  report: ReportLike,
  _convergence: ConvergenceLike | null,
): DecisionOutput {
  return buildDecisionFromReportWithContext(report, _convergence).output;
}

export function buildDecisionFromReportWithContext(
  report: ReportLike,
  convergence: ConvergenceLike | null,
): DecisionWithContext {
  const anchRReport = reportToAnchRReport(report);
  const output = buildDecisionFromAnchRReport(anchRReport);

  const primaryCause = report.classification?.primaryCause ?? null;
  const hasViolations = (report.minimalCut?.length ?? 0) > 0;
  const convergenceResult =
    convergence?.impact === "IMPROVED" || convergence?.impact === "REGRESSED"
      || convergence?.impact === "SHIFTED" || convergence?.impact === "UNCHANGED"
      ? convergence.impact
      : null;

  const changeType = deriveChangeType(primaryCause, convergenceResult, hasViolations);
  const confidence = anchRReport.confidence;

  return {
    output,
    changeType,
    confidence,
  };
}
