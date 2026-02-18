/**
 * Comment identity markers. ANCHR:REVIEW (legacy) and arcsight:run (production).
 */

const ANCHR_PREFIX = "<!-- ANCHR:REVIEW";
const RUN_ID_PREFIX = "runId=";
const COMMIT_PREFIX = "commit=";
export const ARCSIGHT_RUN_PREFIX = "<!-- arcsight:run:";

export function buildCommentWithMarker(
  renderedBody: string,
  runId: string,
  headSha: string,
): string {
  const marker = [
    ANCHR_PREFIX,
    `${RUN_ID_PREFIX}${runId}`,
    `${COMMIT_PREFIX}${headSha}`,
    "-->",
  ].join("\n");
  const trimmed = renderedBody.trim();
  return trimmed ? `${marker}\n\n${trimmed}` : marker;
}

/** True if body contains either ANCHR or production (arcsight:run) marker. */
export function commentContainsMarker(body: string): boolean {
  return body.includes(ANCHR_PREFIX) || body.includes(ARCSIGHT_RUN_PREFIX);
}

export interface ParsedMarker {
  runId: string;
  commitSha: string;
}

/** Parses runId and commitSha from ANCHR or production marker. Production has no commit in marker; commitSha is "". */
export function parseMarker(body: string): ParsedMarker | null {
  if (body.includes(ANCHR_PREFIX)) {
    const runIdMatch = body.match(new RegExp(`${RUN_ID_PREFIX}([^\\s\\n]+)`));
    const commitMatch = body.match(new RegExp(`${COMMIT_PREFIX}([^\\s\\n]+)`));
    const runId = runIdMatch?.[1];
    const commitSha = commitMatch?.[1];
    if (runId && commitSha) return { runId, commitSha };
    return null;
  }
  if (body.includes(ARCSIGHT_RUN_PREFIX)) {
    const match = body.match(/<!-- arcsight:run:([^\s>]+)\s*-->/);
    if (match) return { runId: match[1], commitSha: "" };
  }
  return null;
}
