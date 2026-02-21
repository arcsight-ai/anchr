/**
 * Canonical GitHub PR Comment Renderer (Prompt 3 — Final Stable Contract).
 * Converts RemediationPlan → stable human message. Same meaning → identical bytes.
 * Education excluded from fingerprint so explanations can improve without churn.
 */

import { createHash } from "crypto";
import type { RemediationPlan } from "../remediation/types.js";

export interface RenderedComment {
  body: string;
  shortBody: string;
  fingerprint: string;
}

const SUMMARY_MAX = 220;
const EDUCATION_MAX = 600;
const SHORT_BODY_MAX = 120;

const STATUS_MAP: Record<string, string> = {
  proceed: "VERIFIED",
  "require-review": "REVIEW REQUIRED",
  "require-adapter": "ADAPTER REQUIRED",
  "require-migration": "MIGRATION REQUIRED",
  "fix-architecture": "ARCHITECTURE BLOCKED",
  "rerun-analysis": "ANALYSIS INCOMPLETE",
};

function actionToStatus(action: string): string {
  return STATUS_MAP[action] ?? "REVIEW REQUIRED";
}

/**
 * Canonicalize a single string: trim, tabs→space, collapse spaces,
 * normalize quotes/apostrophes, remove redundant trailing period.
 */
function canonicalizeString(s: string): string {
  if (typeof s !== "string") return "";
  let out = s
    .trim()
    .replace(/\t/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'");
  if (/[?!.]\.\s*$/.test(out)) out = out.replace(/\.\s*$/, "");
  return out.trim();
}

/**
 * Dedupe list by normalized value; preserve first occurrence order.
 */
function canonicalizeList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const c = canonicalizeString(item);
    if (c === "") continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/**
 * Truncate at word boundary; append "…" if truncated.
 */
function truncateAtWordBoundary(text: string, limit: number): string {
  const t = canonicalizeString(text);
  if (t.length <= limit) return t;
  const slice = t.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > limit / 2 ? slice.slice(0, lastSpace) : slice;
  return cut.trim() + "…";
}

function buildBulletLines(items: string[], truncatedItems: string[]): string[] {
  if (truncatedItems.length === 0) return ["• None"];
  return truncatedItems.map((item) => "• " + item);
}

/**
 * Render plan to stable body. Truncation applied before fingerprint.
 */
export function renderPRComment(plan: RemediationPlan): RenderedComment {
  const steps = canonicalizeList(plan.steps ?? []);
  const commitGuidance = canonicalizeList(plan.commitGuidance ?? []);
  const verification = canonicalizeList(plan.verification ?? []);

  const rawSummary = canonicalizeString(plan.summary ?? "");
  const canonicalSummary = truncateAtWordBoundary(rawSummary, SUMMARY_MAX);

  const rawEducation = canonicalizeString(plan.education ?? "");
  const canonicalEducation = truncateAtWordBoundary(rawEducation, EDUCATION_MAX);

  const action = plan.metadata?.action ?? "require-review";
  const status = actionToStatus(action);
  const messageId = plan.metadata?.messageId ?? "";

  const lines: string[] = [
    "ANCHR Result: " + status,
    "",
    canonicalSummary,
    "",
    "Required Actions:",
    ...buildBulletLines(steps, steps),
    "",
    "Commit Guidance:",
    ...buildBulletLines(commitGuidance, commitGuidance),
    "",
    "Verification:",
    ...buildBulletLines(verification, verification),
    "",
    "Why this happened:",
    canonicalEducation,
  ];

  const body = lines.join("\n");

  const shortBodyRaw = "ANCHR: " + status + " — " + canonicalSummary;
  const shortBody = (
    shortBodyRaw.length > SHORT_BODY_MAX
      ? truncateAtWordBoundary(shortBodyRaw, SHORT_BODY_MAX)
      : shortBodyRaw
  ).replace(/\n/g, " ");

  const fingerprintPayload = [
    "arcsight:v1",
    messageId,
    status,
    canonicalSummary,
    steps.join("\n"),
    commitGuidance.join("\n"),
    verification.join("\n"),
  ].join("\n");
  const fingerprint = createHash("sha1").update(fingerprintPayload, "utf8").digest("hex");

  return {
    body,
    shortBody,
    fingerprint,
  };
}
