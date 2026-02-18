/**
 * ArcSight Comment Reconciliation Engine (Prompt 4 — Final Hardened).
 * Decides lifecycle of the PR comment. Deterministic, commit-aware, race-safe.
 * Stale run protection: only the run for currentPrHeadSha may modify the comment.
 */

import type {
  ExistingComment,
  RenderedCommentForReconcile,
  CommentAction,
  ParsedArcSightMeta,
} from "./types.js";

const ARCSIGHT_MARKER = "<!-- arcsight:";

/**
 * Build the single required metadata line for an ArcSight comment.
 * Caller must include this in the body passed to create/update/replace.
 */
export function buildArcSightMetadataLine(
  commitSha: string,
  messageId: string,
  fingerprint: string,
): string {
  return `<!-- arcsight:${commitSha}:${messageId}:${fingerprint} -->`;
}

/**
 * Build optional runtime line for convergence (runId + decisionLevel).
 * Enables "already converged" and force-push guard when parsing existing comment.
 */
export function buildArcSightRunLine(runId: string, decisionLevel: string): string {
  return `<!-- arcsight:run:${runId}:${decisionLevel} -->`;
}

/**
 * Parse optional runtime line: <!-- arcsight:run:runId:level -->
 */
export function parseArcSightRunLine(body: string): { runId: string; decisionLevel: string } | null {
  const match = body.match(/<!--\s*arcsight:run:([^:]+):([^>]+)\s*-->/);
  if (!match) return null;
  return { runId: match[1].trim(), decisionLevel: match[2].trim() };
}

function isArcSightComment(body: string): boolean {
  return typeof body === "string" && body.includes(ARCSIGHT_MARKER);
}

/**
 * Parse metadata line: <!-- arcsight:<commitSha>:<messageId>:<fingerprint> -->
 */
export function parseArcSightMetadata(body: string): ParsedArcSightMeta | null {
  const match = body.match(
    /<!--\s*arcsight:([^:]+):([^:]+):([a-f0-9]+)\s*-->/i,
  );
  if (!match) return null;
  const commitSha = match[1].trim();
  const messageId = match[2].trim();
  const fingerprint = match[3].trim();
  if (!commitSha || !messageId || !fingerprint) return null;
  return { commitSha, messageId, fingerprint };
}

/**
 * Deterministic reconciliation. Returns zero or more actions; executor runs in order.
 */
export function reconcileComment(
  existingComments: ExistingComment[],
  next: RenderedCommentForReconcile,
  currentPrHeadSha: string,
): CommentAction[] {
  const actions: CommentAction[] = [];

  // Step 1 — Filter ArcSight comments
  const arcsightComments = existingComments.filter((c) =>
    isArcSightComment(c.body),
  );

  // Step 2 — VERIFIED → delete all ArcSight comments
  if (next.status === "VERIFIED") {
    for (const c of arcsightComments) {
      actions.push({ type: "delete", id: c.id });
    }
    if (actions.length === 0) {
      actions.push({ type: "noop" });
    }
    return actions;
  }

  // Step 3 — No existing ArcSight comment
  if (arcsightComments.length === 0) {
    actions.push({ type: "create", body: next.body });
    return actions;
  }

  // Step 4 — Normalize multiple: keep newest, delete others
  const byCreated = [...arcsightComments].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const canonical = byCreated[0]!;
  for (let i = 1; i < byCreated.length; i++) {
    actions.push({ type: "delete", id: byCreated[i]!.id });
  }

  // Step 5 — Parse canonical metadata; if malformed → replace
  const parsed = parseArcSightMetadata(canonical.body);
  if (!parsed) {
    actions.push({ type: "replace", id: canonical.id, body: next.body });
    return actions;
  }

  // Step 6 — Stale run protection
  if (next.commitSha !== currentPrHeadSha) {
    actions.push({ type: "noop" });
    return actions;
  }
  if (parsed.commitSha !== currentPrHeadSha) {
    actions.push({ type: "replace", id: canonical.id, body: next.body });
    return actions;
  }

  // Step 7 — Same fingerprint → noop
  if (parsed.fingerprint === next.fingerprint) {
    actions.push({ type: "noop" });
    return actions;
  }

  // Step 8 — Same messageId, different fingerprint → update
  if (parsed.messageId === next.messageId) {
    actions.push({ type: "update", id: canonical.id, body: next.body });
    return actions;
  }

  // Step 9 — Different messageId → replace
  actions.push({ type: "replace", id: canonical.id, body: next.body });
  return actions;
}
