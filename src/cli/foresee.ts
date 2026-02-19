/**
 * Foresee (Aftermath + Dina) — Pure renderer over the certification report.
 * No IO, no dates, no randomness. Deterministic.
 * Max 5 sentences for Dina explanation.
 */

export interface ForeseeReportLike {
  status?: string;
  decision?: { level?: string; reason?: string };
  classification?: { primaryCause?: string | null };
  confidence?: { coverageRatio?: number };
  scope?: { mode?: string };
  run?: { id?: string };
  downgradeReasons?: string[];
}

/** Confidence label from report.confidence.coverageRatio. Fixed 2 decimals. */
export function getConfidenceLabel(report: ForeseeReportLike): {
  label: "High" | "Moderate" | "Low" | "Unknown";
  ratioFormatted: string;
} {
  const ratio = report.confidence?.coverageRatio;
  if (ratio == null || typeof ratio !== "number") {
    return { label: "Unknown", ratioFormatted: "0.00" };
  }
  const formatted = ratio.toFixed(2);
  if (ratio >= 0.95) return { label: "High", ratioFormatted: formatted };
  if (ratio >= 0.8) return { label: "Moderate", ratioFormatted: formatted };
  if (ratio > 0) return { label: "Low", ratioFormatted: formatted };
  return { label: "Unknown", ratioFormatted: formatted };
}

/**
 * Pure function. First match wins. Max 5 sentences.
 * No IO, no dates, no randomness.
 */
export function explainReport(report: ForeseeReportLike): string {
  const status = (report.status ?? "").trim();
  const level = (report.decision?.level ?? "warn").trim();
  const primaryCause = (report.classification?.primaryCause ?? null) as string | null;
  const downgradeReasons = report.downgradeReasons ?? [];

  if (status === "VERIFIED" && level === "allow") {
    return [
      "No architectural impact detected.",
      "Imports remain within public API boundaries.",
      "Safe to merge.",
    ].join(" ");
  }

  if (status === "BLOCKED" && level === "block" && primaryCause === "boundary_violation") {
    return [
      "A package imports another package's internal module.",
      "This creates hidden dependency coupling.",
      "Recommend importing from package entrypoint.",
    ].join(" ");
  }

  if (status === "BLOCKED" && level === "block" && primaryCause === "deleted_public_api") {
    return [
      "A public API was removed.",
      "Downstream packages may break.",
      "Recommend restore export or introduce migration adapter.",
    ].join(" ");
  }

  if (
    status === "INDETERMINATE" ||
    status === "INCOMPLETE" ||
    level === "warn"
  ) {
    const parts = [
      "Safety could not be proven.",
      ...(downgradeReasons.length > 0 && Array.isArray(downgradeReasons)
        ? [`Downgrade reasons: ${downgradeReasons.filter((r) => typeof r === "string").slice(0, 3).join("; ")}.`]
        : []),
      "Recommend manual review or running full audit.",
    ].filter(Boolean);
    return parts.slice(0, 5).join(" ");
  }

  return [
    "No architectural impact detected.",
    "Imports remain within public API boundaries.",
    "Safe to merge.",
  ].join(" ");
}

function decisionDisplay(level: string): "ALLOW" | "WARN" | "BLOCK" {
  if (level === "block") return "BLOCK";
  if (level === "warn") return "WARN";
  return "ALLOW";
}

/**
 * Render Aftermath block. No emojis, colors, timestamps, randomness.
 * Stdout-only format.
 */
export function renderAftermath(report: ForeseeReportLike): string {
  const level = (report.decision?.level ?? "warn").trim();
  const { label: confidenceLabel, ratioFormatted } = getConfidenceLabel(report);
  const scopeMode = report.scope?.mode ?? "packages";
  const runId = (report.run?.id ?? "").slice(0, 12);
  const primaryCause =
    report.classification?.primaryCause != null &&
    String(report.classification.primaryCause).trim() !== ""
      ? String(report.classification.primaryCause).trim()
      : "none";

  const dinaExplanation = explainReport(report);

  const lines = [
    "---",
    "Aftermath — Predicted Impact",
    "",
    `Decision: ${decisionDisplay(level)}`,
    `Confidence: ${confidenceLabel} (${ratioFormatted})`,
    `Scope: ${scopeMode}`,
    "",
    "Dina:",
    "",
    dinaExplanation,
    "",
    "---",
    `Run id: ${runId}`,
    `Primary cause: ${primaryCause}`,
  ];

  return lines.join("\n");
}
