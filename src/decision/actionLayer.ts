/**
 * ArcSight Decision Engine — Deterministic Action Layer (Frozen Production Spec).
 * Converts analyzer proof output into a single developer action. Semantic stability:
 * cause normalization, coverage snap, severity lattice, idempotency guard, stable unknown.
 */

import { createHash } from "crypto";

export type ReportStatus = "VERIFIED" | "UNSAFE" | "INDETERMINATE" | "INCOMPLETE";
export type DecisionLevel = "allow" | "warn" | "block";

export type Action =
  | "proceed"
  | "require-review"
  | "require-adapter"
  | "require-migration"
  | "fix-architecture"
  | "rerun-analysis";

export type Severity = "info" | "caution" | "risk" | "critical";

export type ReasonCode =
  | "safe_structural"
  | "manual_review_required"
  | "introduce_public_interface"
  | "public_api_break"
  | "architectural_violation"
  | "analysis_incomplete";

export interface Decision {
  action: Action;
  severity: Severity;
  reasonCode: ReasonCode;
  explanation: string;
  signature: string;
}

const COVERAGE_SNAP_THRESHOLD = 0.999;

const SEMANTIC_ARCHITECTURE_BREAK = new Set(["boundary_violation", "relative_escape"]);
const SEMANTIC_API_BREAK = new Set(["deleted_public_api"]);
const SEMANTIC_ADAPTER_REQUIRED = new Set(["type_import_private_target"]);
const SEMANTIC_ANALYSIS_UNCERTAIN = new Set([
  "resolver_uncertain",
  "missing_public_entry",
  "certifier_script_missing",
]);

type SemanticGroup =
  | "ARCHITECTURE_BREAK"
  | "API_BREAK"
  | "ADAPTER_REQUIRED"
  | "ANALYSIS_UNCERTAIN"
  | "UNKNOWN";

const ACTION_ORDER: Action[] = [
  "proceed",
  "require-review",
  "require-adapter",
  "require-migration",
  "fix-architecture",
  "rerun-analysis",
];

function actionOrdinal(a: Action): number {
  const i = ACTION_ORDER.indexOf(a);
  return i >= 0 ? i : -1;
}

function maxAction(a: Action, b: Action): Action {
  return actionOrdinal(a) >= actionOrdinal(b) ? a : b;
}

function causeToGroup(cause: string): SemanticGroup {
  if (SEMANTIC_ARCHITECTURE_BREAK.has(cause)) return "ARCHITECTURE_BREAK";
  if (SEMANTIC_API_BREAK.has(cause)) return "API_BREAK";
  if (SEMANTIC_ADAPTER_REQUIRED.has(cause)) return "ADAPTER_REQUIRED";
  if (SEMANTIC_ANALYSIS_UNCERTAIN.has(cause)) return "ANALYSIS_UNCERTAIN";
  return "UNKNOWN";
}

function groupToAction(group: SemanticGroup): Action {
  switch (group) {
    case "ARCHITECTURE_BREAK":
      return "fix-architecture";
    case "API_BREAK":
      return "require-migration";
    case "ADAPTER_REQUIRED":
      return "require-adapter";
    case "ANALYSIS_UNCERTAIN":
      return "rerun-analysis";
    case "UNKNOWN":
      return "require-review";
    default:
      return "require-review";
  }
}

const SEVERITY_MAP: Record<Action, Severity> = {
  proceed: "info",
  "require-review": "caution",
  "require-adapter": "risk",
  "require-migration": "critical",
  "fix-architecture": "critical",
  "rerun-analysis": "caution",
};

const REASON_MAP: Record<Action, ReasonCode> = {
  proceed: "safe_structural",
  "require-review": "manual_review_required",
  "require-adapter": "introduce_public_interface",
  "require-migration": "public_api_break",
  "fix-architecture": "architectural_violation",
  "rerun-analysis": "analysis_incomplete",
};

const EXPLANATION_MAP: Record<ReasonCode, string> = {
  safe_structural: "No architectural impact detected.",
  manual_review_required: "Change cannot be fully proven safe; review recommended.",
  introduce_public_interface: "Private dependency must be exposed via stable interface.",
  public_api_break: "Public API removal requires coordinated migration.",
  architectural_violation: "Change violates package architectural boundaries.",
  analysis_incomplete: "Analysis could not confidently complete; rerun required.",
};

export interface NormalizedReport {
  status: ReportStatus;
  decisionLevel: DecisionLevel;
  primaryCause: string | null;
  causes: string[];
  coverageRatio: number;
  scopeMode: string;
}

function normalizeStatus(s: unknown): ReportStatus {
  if (s === "VERIFIED" || s === "UNSAFE" || s === "INDETERMINATE" || s === "INCOMPLETE")
    return s;
  return "INCOMPLETE";
}

function normalizeLevel(s: unknown): DecisionLevel {
  if (s === "allow" || s === "warn" || s === "block") return s;
  return "block";
}

function snapCoverage(ratio: number): number {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) return 0;
  if (ratio >= COVERAGE_SNAP_THRESHOLD) return 1;
  return Math.max(0, Math.min(1, Math.round(ratio * 100) / 100));
}

function collectCauses(report: Record<string, unknown>): string[] {
  const causes: string[] = [];
  const primary = report.classification as Record<string, unknown> | undefined;
  if (primary != null && typeof primary.primaryCause === "string" && primary.primaryCause !== "")
    causes.push(primary.primaryCause);

  const violations = report.violations;
  if (Array.isArray(violations)) {
    for (const v of violations) {
      const cause =
        v != null && typeof v === "object" && typeof (v as Record<string, unknown>).cause === "string"
          ? (v as Record<string, unknown>).cause as string
          : null;
      if (cause && cause !== "") causes.push(cause);
    }
  }

  const minimalCut = report.minimalCut;
  if (Array.isArray(minimalCut)) {
    for (const item of minimalCut) {
      if (typeof item === "string") {
        const parts = item.split(":");
        const cause = parts.length >= 3 ? parts[2] : parts[parts.length - 1];
        if (cause && cause !== "" && !causes.includes(cause)) causes.push(cause);
      }
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of causes) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Normalize raw report. Never throws. Missing fields get defaults; coverage snaps >= 0.999 to 1.
 */
export function normalizeReport(report: unknown): NormalizedReport {
  const r = report != null && typeof report === "object" ? (report as Record<string, unknown>) : {};
  const status = normalizeStatus(r.status);
  const decisionLevel = normalizeLevel(
    (r.decision as Record<string, unknown> | undefined)?.level,
  );
  const rawCoverage =
    typeof (r.confidence as Record<string, unknown> | undefined)?.coverageRatio === "number"
      ? (r.confidence as Record<string, unknown>).coverageRatio as number
      : 0;
  const coverageRatio = snapCoverage(rawCoverage);
  const primaryCause =
    (r.classification as Record<string, unknown> | undefined)?.primaryCause;
  const primary =
    primaryCause != null && typeof primaryCause === "string" ? primaryCause : null;
  const causes = collectCauses(r);
  const scopeMode =
    typeof (r.scope as Record<string, unknown> | undefined)?.mode === "string"
      ? (r.scope as Record<string, unknown>).mode as string
      : "";

  return {
    status,
    decisionLevel,
    primaryCause: primary,
    causes,
    coverageRatio,
    scopeMode,
  };
}

function computeSignature(
  status: ReportStatus,
  decisionLevel: DecisionLevel,
  sortedGroups: string[],
  coverageRatio: number,
  action: Action,
): string {
  const coverageRounded = Math.round(coverageRatio * 100) / 100;
  const payload = [
    status,
    decisionLevel,
    sortedGroups.join(","),
    String(coverageRounded),
    action,
  ].join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}

/**
 * Deterministic decision from normalized report. Same meaning → same Decision.
 */
export function decide(report: unknown): Decision {
  const norm = normalizeReport(report);

  if (norm.status === "INCOMPLETE") {
    const action: Action = "rerun-analysis";
    const reasonCode = REASON_MAP[action];
    const explanation = EXPLANATION_MAP[reasonCode];
    const signature = computeSignature(
      norm.status,
      norm.decisionLevel,
      [],
      norm.coverageRatio,
      action,
    );
    return {
      action,
      severity: SEVERITY_MAP[action],
      reasonCode,
      explanation: explanation.length > 160 ? explanation.slice(0, 157) + "..." : explanation,
      signature,
    };
  }

  const groups = new Set<SemanticGroup>();
  for (const cause of norm.causes) {
    groups.add(causeToGroup(cause));
  }

  let action: Action = "proceed";

  if (norm.status === "VERIFIED" && norm.decisionLevel === "allow" && norm.coverageRatio === 1 && groups.size === 0) {
    action = "proceed";
  } else {
    for (const g of groups) {
      action = maxAction(action, groupToAction(g));
    }
  }

  if (norm.coverageRatio < 1) {
    action = maxAction(action, "require-review");
  }

  if (norm.decisionLevel === "warn" || norm.decisionLevel === "block") {
    if (action === "proceed") action = "require-review";
  }

  const sortedGroups = [...groups].sort((a, b) => a.localeCompare(b, "en"));
  const reasonCode = REASON_MAP[action];
  const explanation = EXPLANATION_MAP[reasonCode];
  const explanationTrimmed = explanation.length > 160 ? explanation.slice(0, 157) + "..." : explanation;
  const signature = computeSignature(
    norm.status,
    norm.decisionLevel,
    sortedGroups,
    norm.coverageRatio,
    action,
  );

  return {
    action,
    severity: SEVERITY_MAP[action],
    reasonCode,
    explanation: explanationTrimmed,
    signature,
  };
}
