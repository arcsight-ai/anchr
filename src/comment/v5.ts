/**
 * ArcSight v5 comment format (Prompt: Causally-Correct Convergent PR Comment Controller).
 * Authority = (HEAD_SHA, BASE_SHA). Deterministic; hash over normalized full body.
 */

import { createHash } from "crypto";

const ANCHOR = "<!-- arcsight:comment -->";
const VERSION = "5";

export type DecisionLevel = "allow" | "warn" | "block";

export interface ArcsightV5Input {
  repo: string;
  prNumber: number;
  headSha: string;
  baseSha: string;
  runId: string;
  decisionLevel: DecisionLevel;
  reason: string;
  shortHead: string;
  shortBase: string;
}

/**
 * Normalize comment per spec: CRLF→LF, trim trailing whitespace,
 * collapse >2 blank lines to 2, exactly one trailing newline.
 */
export function normalizeComment(text: string): string {
  let out = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  out = out.replace(/[ \t]+$/gm, "");
  out = out.trimEnd();
  out = out.replace(/\n{3,}/g, "\n\n");
  if (out !== "" && !out.endsWith("\n")) out += "\n";
  return out;
}

/**
 * Build full comment (metadata + visible body), then normalize and set arcsight:hash.
 * Returns the final comment string with hash computed over normalized full text.
 */
export function buildArcsightV5Comment(input: ArcsightV5Input): string {
  const reasonLine =
    input.reason.length > 256 ? input.reason.slice(0, 253) + "..." : input.reason;
  const decisionLabel =
    input.decisionLevel === "allow"
      ? "🟢 ALLOW"
      : input.decisionLevel === "block"
        ? "🔴 BLOCK"
        : "🟡 WARN";

  const visibleLines = [
    "ANCHR",
    "",
    `Decision: ${decisionLabel}`,
    "",
    "Reason:",
    reasonLine,
    "",
    "Run:",
    input.runId,
    "",
    "Commit:",
    input.shortHead,
    "",
    "Base:",
    input.shortBase,
    "",
  ];

  const hashPlaceholder = "<!-- arcsight:hash: -->";
  const metadataLinesForHash = [
    ANCHOR,
    `<!-- arcsight:version:${VERSION} -->`,
    `<!-- arcsight:repo:${input.repo} -->`,
    `<!-- arcsight:pr:${input.prNumber} -->`,
    `<!-- arcsight:head:${input.headSha} -->`,
    `<!-- arcsight:base:${input.baseSha} -->`,
    `<!-- arcsight:run:${input.runId} -->`,
    `<!-- arcsight:decision:${input.decisionLevel} -->`,
    hashPlaceholder,
  ];

  const bodyForHash = [...visibleLines, "", ...metadataLinesForHash].join("\n");
  const normalizedForHash = normalizeComment(bodyForHash);
  const hash = createHash("sha256").update(normalizedForHash, "utf8").digest("hex");

  const finalMetadata = [
    ANCHOR,
    `<!-- arcsight:version:${VERSION} -->`,
    `<!-- arcsight:repo:${input.repo} -->`,
    `<!-- arcsight:pr:${input.prNumber} -->`,
    `<!-- arcsight:head:${input.headSha} -->`,
    `<!-- arcsight:base:${input.baseSha} -->`,
    `<!-- arcsight:run:${input.runId} -->`,
    `<!-- arcsight:decision:${input.decisionLevel} -->`,
    `<!-- arcsight:hash:${hash} -->`,
  ];

  const fullComment = [...visibleLines, "", ...finalMetadata].join("\n");
  return normalizeComment(fullComment);
}

/** Ownership: comment belongs to ArcSight iff it starts with the anchor. */
export function isArcsightComment(body: string): boolean {
  return body.trimStart().startsWith(ANCHOR);
}

export interface ParsedV5Meta {
  headSha: string;
  baseSha: string;
  runId: string;
  hash: string;
  decision: string;
}

/**
 * Parse v5 metadata from comment body. Returns null if missing or corrupted.
 */
export function parseArcsightV5Meta(body: string): ParsedV5Meta | null {
  if (!body.includes(ANCHOR)) return null;
  const headMatch = body.match(/<!-- arcsight:head:([^\s>]+)\s*-->/);
  const baseMatch = body.match(/<!-- arcsight:base:([^\s>]+)\s*-->/);
  const runMatch = body.match(/<!-- arcsight:run:([^\s>]+)\s*-->/);
  const hashMatch = body.match(/<!-- arcsight:hash:([^\s>]*)\s*-->/);
  const decisionMatch = body.match(/<!-- arcsight:decision:([^\s>]+)\s*-->/);
  if (
    !headMatch?.[1] ||
    !baseMatch?.[1] ||
    !runMatch?.[1] ||
    hashMatch === null
  ) {
    return null;
  }
  return {
    headSha: headMatch[1],
    baseSha: baseMatch[1],
    runId: runMatch[1],
    hash: hashMatch[1] ?? "",
    decision: decisionMatch?.[1] ?? "",
  };
}
