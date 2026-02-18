/**
 * Comment identity markers. ANCHR:REVIEW (legacy) and arcsight:run (production).
 */

const ANCHR_PREFIX = "<!-- ANCHR:REVIEW";
const RUN_ID_PREFIX = "runId=";
const COMMIT_PREFIX = "commit=";
const BASE_PREFIX = "base=";
export const ARCSIGHT_COMMENT_ANCHOR = "<!-- arcsight:comment -->";
export const ARCSIGHT_RUN_PREFIX = "<!-- arcsight:run:";

export function buildCommentWithMarker(
  renderedBody: string,
  runId: string,
  headSha: string,
  baseSha?: string,
): string {
  const parts = [ANCHR_PREFIX, `${RUN_ID_PREFIX}${runId}`, `${COMMIT_PREFIX}${headSha}`];
  if (baseSha !== undefined && baseSha !== "") {
    parts.push(`base=${baseSha}`);
  }
  parts.push("-->");
  const marker = parts.join("\n");
  const trimmed = renderedBody.trim();
  return trimmed ? `${marker}\n\n${trimmed}` : marker;
}

/** True if body contains ANCHR, arcsight:comment (v5), or arcsight:run marker. */
export function commentContainsMarker(body: string): boolean {
  return (
    body.includes(ANCHR_PREFIX) ||
    body.includes(ARCSIGHT_COMMENT_ANCHOR) ||
    body.includes(ARCSIGHT_RUN_PREFIX)
  );
}

export interface ParsedMarker {
  runId: string;
  commitSha: string;
  baseSha?: string;
}

/** Parses runId, commitSha, and optional baseSha from ANCHR or production marker. */
export function parseMarker(body: string): ParsedMarker | null {
  if (body.includes(ANCHR_PREFIX)) {
    const runIdMatch = body.match(new RegExp(`${RUN_ID_PREFIX}([^\\s\\n]+)`));
    const commitMatch = body.match(new RegExp(`${COMMIT_PREFIX}([^\\s\\n]+)`));
    const baseMatch = body.match(new RegExp(`${BASE_PREFIX}([^\\s\\n]+)`));
    const runId = runIdMatch?.[1];
    const commitSha = commitMatch?.[1];
    const baseSha = baseMatch?.[1];
    if (runId && commitSha) return { runId, commitSha, baseSha };
    return null;
  }
  if (body.includes(ARCSIGHT_COMMENT_ANCHOR) || body.includes(ARCSIGHT_RUN_PREFIX)) {
    const runMatch = body.match(/<!-- arcsight:run:([^\s>]+)\s*-->/);
    const headMatch = body.match(/<!-- arcsight:head:([^\s>]+)\s*-->/);
    const baseMatch = body.match(/<!-- arcsight:base:([^\s>]+)\s*-->/);
    if (runMatch)
      return {
        runId: runMatch[1],
        commitSha: headMatch?.[1] ?? "",
        baseSha: baseMatch?.[1],
      };
  }
  return null;
}
