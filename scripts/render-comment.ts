/**
 * Deterministic PR Comment Renderer (Prompt 12 — GitHub-Immutable).
 * Generates the exact GitHub PR comment body from ArcSight decision + explanation.
 * Only component allowed to produce human-visible output.
 * Identical inputs → identical bytes AND identical GitHub rendering.
 */

import type { ReviewerAction } from "./recommend-action.js";
import { explainResult } from "./explain-result.js";
import type { Violation } from "./explain-result.js";

export type RenderInput = {
  action: ReviewerAction;
  runId: string;
  scopeMode: string;
  coverageRatio: number;
  explanationViolations?: Violation[] | null;
  downgradeReasons?: string[] | null;
};

const MAX_BODY = 60000;
const MAX_EXPLANATION = 4000;
const LF = "\n";

function normalizeUnicode(s: string): string {
  return s.normalize("NFC");
}

function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripControlChars(s: string): string {
  return s.replace(/[\u0000-\u001f]/g, (c) => (c === "\n" || c === "\t" ? c : ""));
}

function trimTrailingWhitespace(s: string): string {
  return s
    .split(LF)
    .map((line) => line.replace(/\s+$/, ""))
    .join(LF);
}

function collapseExtraBlankLines(s: string): string {
  return s.replace(/(\n{2,})/g, LF + LF);
}

function forceSingleEOF(s: string): string {
  return s.replace(/\n+$/, "");
}

function stableFloat(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return (Math.round(n * 100) / 100).toFixed(2);
}

function sanitizeInline(value: unknown): string {
  if (value == null) return "";
  let s = String(value).trim();
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "&#124;");
  s = s.replace(/`/g, "'");
  return s.trim();
}

function normalizeExplanation(text: string): string {
  let s = normalizeUnicode(text);
  s = normalizeNewlines(s);
  s = stripControlChars(s);
  s = trimTrailingWhitespace(s);
  s = collapseExtraBlankLines(s);
  if (s.length > MAX_EXPLANATION) s = s.slice(0, MAX_EXPLANATION);
  const lines = s.split(LF);
  const prefixed = lines.map((line) => "> " + line).join(LF);
  const noTrailing = forceSingleEOF(prefixed);
  if (!noTrailing.trim()) return "> No architectural issues detected.";
  return noTrailing;
}

function resultLine(code: string): string {
  switch (code) {
    case "MERGE":
      return "🟢 Safe to merge";
    case "REVIEW":
      return "🟡 Needs review";
    case "BLOCK":
      return "🔴 Must fix before merge";
    case "ESCALATE":
      return "🟠 Unable to verify";
    default:
      return "🟠 Unable to verify";
  }
}

/**
 * Renders the full PR comment body. Deterministic, GitHub-stable.
 */
export function renderComment(input: RenderInput): string {
  const explanationRaw = explainResult({
    action: input.action,
    violations: input.explanationViolations ?? null,
    downgradeReasons: input.downgradeReasons ?? null,
  });
  const explanation = normalizeExplanation(explanationRaw);

  const code = (input.action?.code ?? "ESCALATE") as string;
  const runId = sanitizeInline(input.runId);
  const scopeMode = sanitizeInline(input.scopeMode);
  const coverage = stableFloat(Number(input.coverageRatio));

  const section1 = "<!-- arcsight:v2:run:" + runId + " -->";
  const section2 = "ArcSight Architectural Review";
  const section3 = "Result: " + resultLine(code);
  const section4 = "Explanation" + LF + LF + explanation;
  const section5 =
    "<details>" +
    LF +
    "<summary>Technical Details</summary>" +
    LF +
    LF +
    "Run ID: " +
    runId +
    LF +
    "Scope: " +
    scopeMode +
    LF +
    "Coverage: " +
    coverage +
    LF +
    LF +
    "</details>";

  let out = [section1, section2, section3, section4, section5].join(LF + LF);
  out = normalizeUnicode(out);
  out = normalizeNewlines(out);
  out = stripControlChars(out);
  out = trimTrailingWhitespace(out);
  out = collapseExtraBlankLines(out);
  out = forceSingleEOF(out);

  if (out.length >= MAX_BODY) {
    out = out.slice(0, MAX_BODY);
    const lastLf = out.lastIndexOf(LF);
    if (lastLf > 0) out = out.slice(0, lastLf);
    out = forceSingleEOF(out);
  }
  return out;
}
