/**
 * GitHub read helpers for ArcSight runtime. Fetch existing PR comment with metadata.
 */

import { createHash } from "crypto";
import {
  parseArcSightMetadata,
  parseArcSightRunLine,
} from "../reconciliation/engine.js";

const ARCSIGHT_MARKER = "<!-- arcsight:";
const USER_AGENT = "anchr/1.0";

export interface ExistingArcSightComment {
  id: number;
  body: string;
  decisionLevel: string;
  runId: string;
  headSha: string;
  bodyHash: string;
}

async function listIssueComments(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string,
): Promise<{ id: number; body: string; created_at: string }[]> {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { id: number; body?: string; created_at?: string }[];
  const list = Array.isArray(data) ? data : [];
  return list
    .filter((c) => c && typeof c.id === "number")
    .map((c) => ({
      id: c.id,
      body: typeof c.body === "string" ? c.body : "",
      created_at: typeof c.created_at === "string" ? c.created_at : "",
    }));
}

function bodyHash(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * Find the newest ArcSight comment on the PR. Returns null if none or on error. Never throws.
 */
export async function findExistingArcSightComment(
  owner: string,
  repo: string,
  issueNumber: number,
  token: string,
): Promise<ExistingArcSightComment | null> {
  try {
    const comments = await listIssueComments(owner, repo, issueNumber, token);
    const withMarker = comments
      .filter((c) => c.body.includes(ARCSIGHT_MARKER))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const newest = withMarker[0];
    if (!newest) return null;

    const meta = parseArcSightMetadata(newest.body);
    if (!meta) return null;

    const runMeta = parseArcSightRunLine(newest.body);

    return {
      id: newest.id,
      body: newest.body,
      decisionLevel: runMeta?.decisionLevel ?? "",
      runId: runMeta?.runId ?? "",
      headSha: meta.commitSha,
      bodyHash: bodyHash(newest.body),
    };
  } catch {
    return null;
  }
}
