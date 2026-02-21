/**
 * ArcSight GitHub comment renderer (Prompt 16). Deterministic, trust-stable.
 * Formats report JSON → markdown. Enforces: same run.id + different decision → INDETERMINATE.
 * Never throws; never exits non-zero; always outputs.
 */

import { readFileSync } from "fs";
import { createHash } from "crypto";

const ANCHR_REPORT_PATH = process.env.ANCHR_REPORT_PATH ?? "artifacts/anchr-report.json";
const ANCHR_EXISTING_COMMENT = process.env.ANCHR_EXISTING_COMMENT ?? "";

const ANCHOR = "<!-- arcsight:comment -->";
const RUN_PREFIX = "<!-- arcsight:run:";
const HASH_PREFIX = "<!-- arcsight:hash:";

type DecisionLevel = "allow" | "block" | "review" | "error" | "unstable";

interface ReportShape {
  decision?: { level?: string; reason?: string };
  classification?: { primaryCause?: string };
  scope?: { mode?: string };
  minimalCut?: Array<string | { id?: string }>;
  confidence?: { coverageRatio?: number };
  run?: { id?: string };
}

const DECISION_MAP: Record<DecisionLevel, { emoji: string; label: string }> = {
  allow: { emoji: "🟢", label: "ALLOW" },
  block: { emoji: "🔴", label: "BLOCK" },
  review: { emoji: "🟡", label: "REVIEW" },
  error: { emoji: "⚪", label: "ERROR" },
  unstable: { emoji: "🟠", label: "INDETERMINATE" },
};

const MEANING: Record<DecisionLevel, string> = {
  allow: "This change preserves package boundaries.",
  block: "This change bypasses a package boundary and may couple modules.",
  review: "ANCHR cannot prove this change safe.",
  error: "ANCHR could not analyze the change.",
  unstable:
    "ANCHR produced inconsistent results for the same change.",
};

const SUGGESTED_FIX: Record<string, string> = {
  boundary_violation:
    "Import from the package public entrypoint instead of internal paths.",
  deleted_public_api:
    "Restore the public export or update dependents to the new API.",
  type_import_private_target:
    "Move the type to the public API or a shared types package.",
  relative_escape: "Keep imports inside the package boundary.",
};
const SUGGESTED_FIX_DEFAULT =
  "Review architectural dependencies for this change.";

function formatRatio(n: unknown): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return (Math.round(n * 100) / 100).toFixed(2);
}

function confidenceLabel(ratio: number | null): string {
  if (ratio == null) return "Unknown";
  if (ratio >= 0.95) return "High";
  if (ratio >= 0.8) return "Moderate";
  return "Low";
}

function parseExistingLevel(body: string): DecisionLevel | null {
  if (body.includes("🟢 ALLOW")) return "allow";
  if (body.includes("🔴 BLOCK")) return "block";
  if (body.includes("🟡 REVIEW")) return "review";
  if (body.includes("⚪ ERROR")) return "error";
  if (body.includes("🟠 INDETERMINATE")) return "unstable";
  return null;
}

function parseExistingRunId(body: string): string | null {
  const match = body.match(/<!-- arcsight:run:([^\s>]+)\s*-->/);
  return match ? match[1] : null;
}

function normalizeLevel(level: string): DecisionLevel {
  const s = (level ?? "").toLowerCase();
  if (s === "allow" || s === "block" || s === "review" || s === "error" || s === "unstable")
    return s;
  return "review";
}

function applyTrustGuard(
  report: ReportShape,
  existingComment: string,
): { level: DecisionLevel; reason: string } {
  const runId = report.run?.id ?? "";
  const newLevel = normalizeLevel(report.decision?.level ?? "review");
  const reason = report.decision?.reason ?? "";

  if (!runId || !existingComment.trim()) {
    return { level: newLevel, reason };
  }

  const existingRunId = parseExistingRunId(existingComment);
  if (existingRunId !== runId) return { level: newLevel, reason };

  const previousLevel = parseExistingLevel(existingComment);
  if (previousLevel == null) return { level: newLevel, reason };
  if (previousLevel === newLevel) return { level: newLevel, reason };

  return {
    level: "unstable",
    reason:
      "Non-deterministic analysis: identical input produced different certification result.",
  };
}

function getMinimalCutIds(report: ReportShape): string[] {
  const raw = report.minimalCut ?? [];
  const ids = raw.map((e) => (typeof e === "string" ? e : e?.id ?? "")).filter(Boolean);
  return [...ids].sort((a, b) => a.localeCompare(b, "en"));
}

function render(report: ReportShape | null, existingComment: string): string {
  const level: DecisionLevel = report ? applyTrustGuard(report, existingComment).level : "error";
  const reason =
    report && level !== "unstable"
      ? report.decision?.reason ?? ""
      : level === "unstable"
        ? "Non-deterministic analysis: identical input produced different certification result."
        : "ANCHR could not analyze the change.";
  const display = DECISION_MAP[level];
  const meaning = MEANING[level];

  const ratio =
    report?.confidence?.coverageRatio != null
      ? formatRatio(report.confidence.coverageRatio)
      : null;
  const ratioNum =
    typeof report?.confidence?.coverageRatio === "number" &&
    Number.isFinite(report.confidence.coverageRatio)
      ? report.confidence.coverageRatio
      : null;
  const confidence = confidenceLabel(ratioNum);
  const confidenceLine =
    ratio != null
      ? `Confidence: ${confidence} (${ratio})`
      : "Confidence: Unknown";

  const primaryCause =
    report?.classification?.primaryCause != null &&
    report.classification.primaryCause !== ""
      ? String(report.classification.primaryCause)
      : "—";
  const scope = report?.scope?.mode ?? "—";
  const runId = report?.run?.id ?? "—";
  const runIdShort =
    typeof runId === "string" && runId.length >= 12 ? runId.slice(0, 12) : runId;

  const minimalCutIds = report ? getMinimalCutIds(report) : [];
  const cutDisplay = minimalCutIds.slice(0, 8);
  const more = minimalCutIds.length - 8;

  const primaryCauseKey =
    typeof report?.classification?.primaryCause === "string"
      ? report.classification.primaryCause
      : "";
  const suggestedFixLine =
    level !== "allow" && level !== "error" && level !== "unstable"
      ? SUGGESTED_FIX[primaryCauseKey] ?? SUGGESTED_FIX_DEFAULT
      : null;

  const timestamp = new Date().toISOString();
  const rawCoverage = ratioNum != null ? formatRatio(ratioNum) ?? "—" : "—";

  const lines: string[] = [
    "## ANCHR Result",
    "",
    `${display.emoji} ${display.label}`,
    "",
    meaning,
    "",
    `Reason: ${reason.trim() || "—"}`,
    "",
    confidenceLine,
    "",
  ];

  if (suggestedFixLine) {
    lines.push("**Suggested fix:**", "", suggestedFixLine, "", "");
  }

  lines.push("<details>", "<summary>Technical details</summary>", "");
  lines.push(`Primary cause: ${primaryCause}`);
  lines.push(`Scope: ${scope}`);
  lines.push(`Run ID: ${runIdShort}`);
  lines.push("");
  lines.push("Affected boundaries:");
  if (cutDisplay.length > 0) {
    for (const id of cutDisplay) {
      lines.push(`- ${id}`);
    }
    if (more > 0) {
      lines.push(`+${more} more`);
    }
  } else {
    lines.push("- (none)");
  }
  lines.push("");
  lines.push(`Raw coverage: ${rawCoverage}`);
  lines.push(`Timestamp: ${timestamp}`);
  lines.push("");
  lines.push("</details>");

  const visibleContent = lines.join("\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const visibleForHash = visibleContent.replace(
    /Timestamp: [^\n]+/,
    "Timestamp: (excluded)",
  );
  const hash = createHash("sha256").update(visibleForHash, "utf8").digest("hex").slice(0, 16);

  const runIdForMarker = report?.run?.id ?? "";
  const out = [
    visibleContent,
    "",
    ANCHOR,
    "",
    `${RUN_PREFIX}${runIdForMarker} -->`,
    "",
    `${HASH_PREFIX}${hash} -->`,
  ].join("\n");

  return out.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd();
}

function main(): void {
  try {
    let report: ReportShape | null = null;
    try {
      const raw = readFileSync(ANCHR_REPORT_PATH, "utf8");
      report = JSON.parse(raw) as ReportShape;
      if (report && typeof report !== "object") report = null;
    } catch {
      report = null;
    }

    const existingComment =
      typeof ANCHR_EXISTING_COMMENT === "string" ? ANCHR_EXISTING_COMMENT : "";
    const body = render(report, existingComment);
    process.stdout.write(body);
    process.stdout.write("\n");
  } catch {
    const fallback = [
      "## ANCHR Result",
      "",
      "⚪ ERROR",
      "",
      "ANCHR could not analyze the change.",
      "",
      ANCHOR,
      "",
      `${RUN_PREFIX} -->`,
      "",
      `${HASH_PREFIX}error -->`,
    ].join("\n");
    process.stdout.write(fallback);
    process.stdout.write("\n");
  }
  process.exit(0);
}

main();
