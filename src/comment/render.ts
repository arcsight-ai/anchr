/**
 * PR comment renderer. Deterministic, grounded.
 * Adapts tone and length to perceived change size and confidence.
 */

import type { CommentRenderInput } from "./types.js";
import { parseMinimalCut } from "../repair/parseReport.js";
import { getNextDirection } from "../advisor/index.js";

export type PerceivedSize = "SMALL" | "MEDIUM" | "LARGE";

const DECISION_HEADERS: Record<string, string> = {
  APPROVE: "🟢 Safe to merge",
  REVIEW: "🟡 Worth a quick look",
  REWORK: "🔴 Should be adjusted",
  INVESTIGATE: "⚪ Needs investigation",
};

function confidenceTier(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}

/** Perceived change size: drives tone and length. */
export function getPerceivedSize(
  scopeMode: string,
  violationsLength: number,
  confidence: number,
  decision: string,
): PerceivedSize {
  const high = confidenceTier(confidence) === "high";
  if (
    scopeMode === "structural-fast-path" &&
    violationsLength === 0 &&
    high &&
    (decision === "APPROVE" || decision === "REVIEW")
  ) {
    return "SMALL";
  }
  if (
    violationsLength > 0 ||
    scopeMode === "causal" ||
    decision === "REWORK" ||
    decision === "INVESTIGATE"
  ) {
    return "LARGE";
  }
  return "MEDIUM";
}

/** Opening line (≤14 words). Impact-focused, no analysis/tool language. */
const OPENING_LINES: Record<string, Record<PerceivedSize, string>> = {
  APPROVE: {
    SMALL: "Nothing here meaningfully alters how modules relate to each other.",
    MEDIUM: "This stays within the intended boundaries between modules.",
    LARGE: "Module boundaries and contracts remain respected.",
  },
  REVIEW: {
    SMALL: "Worth a quick look to confirm module boundaries.",
    MEDIUM: "This reaches slightly outside the module's usual boundaries.",
    LARGE: "Impact on module boundaries needs a quick human check.",
  },
  REWORK: {
    SMALL: "This affects how responsibilities are divided across packages.",
    MEDIUM: "This introduces coupling that crosses module boundaries.",
    LARGE: "This affects how responsibilities are divided across packages.",
  },
  INVESTIGATE: {
    SMALL: "The architectural impact is unclear from structure alone.",
    MEDIUM: "The architectural impact is unclear from structure alone.",
    LARGE: "The architectural impact of this change could not be assessed.",
  },
};

/** Summary (≤18 words). Impact, not mechanism. */
const SUMMARY_LINES: Record<string, string> = {
  APPROVE: "This stays within existing module responsibilities.",
  REVIEW: "Likely safe; a quick confirmation of boundaries is recommended.",
  REWORK: "This crosses or removes declared module boundaries.",
  INVESTIGATE: "More context is needed to assess architectural impact.",
};

function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]+[.!?]?/);
  return (m ? m[0].trim() : text.trim().split(/\s+/).slice(0, 12).join(" ")).replace(/\.$/, "") + ".";
}

function reasoningForDisplay(
  reasoning: string,
  size: PerceivedSize,
  decision: string,
  confidence: number,
): string | null {
  const tier = confidenceTier(confidence);
  if (size === "SMALL" && decision === "APPROVE" && tier === "high") {
    return null;
  }
  if (size === "SMALL") {
    return firstSentence(reasoning);
  }
  const sentences = reasoning
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const take = size === "LARGE" ? Math.min(4, sentences.length) : Math.min(3, sentences.length);
  return sentences.slice(0, take).join(" ");
}

function guidanceForDisplay(guidance: string, size: PerceivedSize): string {
  const parts = guidance
    .split(/[.;]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (size === "SMALL" && parts.length > 0) {
    return parts[0] + (parts[0].endsWith(".") ? "" : ".");
  }
  if (size === "MEDIUM") {
    return parts.slice(0, 2).join(" ").trim() + (parts.length > 0 ? "" : "");
  }
  return guidance.trim();
}

function buildTechnicalDetails(
  status: string,
  scopeMode: string,
  violations: string[],
): string {
  const lines: string[] = [
    "<details>",
    "<summary>Technical details</summary>",
    "",
    `Status: ${status}`,
    `Scope: ${scopeMode}`,
    "",
  ];

  const parsed = parseMinimalCut(violations);
  const byCause = new Map<string, { path: string; specifier?: string }[]>();
  for (const v of parsed) {
    const list = byCause.get(v.cause) ?? [];
    list.push({ path: v.path, specifier: v.specifier });
    byCause.set(v.cause, list);
  }

  if (byCause.size === 0) {
    lines.push("No structural violations detected.");
  } else {
    const boundary = byCause.get("boundary_violation");
    if (boundary?.length) {
      lines.push("Boundary violations:");
      for (const { path, specifier } of boundary) {
        lines.push(specifier ? `- ${path} → ${specifier}` : `- ${path}`);
      }
      lines.push("");
    }
    const deleted = byCause.get("deleted_public_api");
    if (deleted?.length) {
      lines.push("Deleted public API:");
      for (const { path } of deleted) {
        lines.push(`- ${path}`);
      }
      lines.push("");
    }
    const privateType = byCause.get("type_import_private_target");
    if (privateType?.length) {
      lines.push("Private type exposure:");
      for (const { path, specifier } of privateType) {
        lines.push(specifier ? `- ${path} → ${specifier}` : `- ${path}`);
      }
    }
  }

  lines.push("", "</details>");
  return lines.join("\n");
}

/**
 * Renders a single Markdown PR comment. Deterministic: same input → identical output.
 * Adapts verbosity to perceived size (SMALL → minimal, LARGE → fuller).
 */
export function renderComment(input: CommentRenderInput): string {
  const {
    decision: { decision, explanation, reasoning, guidance },
    changeSummary: { changeType },
    runInfo: { confidence, mode },
    technicalContext,
  } = input;

  const status = technicalContext?.status ?? "—";
  const scopeMode = technicalContext?.scopeMode ?? "—";
  const violations = technicalContext?.violations ?? [];
  const size = getPerceivedSize(scopeMode, violations.length, confidence, decision);

  const header = DECISION_HEADERS[decision] ?? "⚪ Needs investigation";
  const opening = OPENING_LINES[decision]?.[size] ?? explanation.split(/\s+/).slice(0, 14).join(" ");
  const summary = SUMMARY_LINES[decision] ?? explanation.split(/\s+/).slice(0, 18).join(" ");
  const reasoningBlock = reasoningForDisplay(reasoning, size, decision, confidence);
  const guidanceBlock = guidanceForDisplay(guidance, size);

  const sections: string[] = [
    `## ${header}`,
    "",
    opening,
    "",
    summary,
  ];
  if (reasoningBlock) {
    sections.push("", reasoningBlock);
  }
  sections.push("", guidanceBlock);

  const nextDirection = getNextDirection({
    primaryCause: technicalContext?.primaryCause ?? null,
    decisionLevel: technicalContext?.decisionLevel ?? "",
    explanation,
    reasoning,
    violations,
  });
  if (nextDirection) {
    const [title, ...rest] = nextDirection.split("\n");
    const body = rest.join("\n").trim();
    sections.push("", `**${title}**`, "", body);
  }

  if (technicalContext) {
    sections.push("", buildTechnicalDetails(status, scopeMode, violations));
  }

  if (input.policy) {
    sections.push(
      "",
      "---",
      "",
      `**Decision:** ${input.policy.action} — ${input.policy.message} (_${input.policy.confidence} confidence_)`,
    );
  }

  return sections.join("\n").trim();
}
