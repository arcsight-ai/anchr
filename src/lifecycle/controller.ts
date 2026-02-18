/**
 * PR Comment Lifecycle Controller (Prompt 8).
 * Returns exactly one instruction. Time-independent: only the run for PR HEAD may update.
 */

import type {
  LifecycleInput,
  LifecycleInstruction,
  ExistingComment,
} from "./types.js";
import {
  buildCommentWithMarker,
  commentContainsMarker,
  parseMarker,
  ARCSIGHT_RUN_PREFIX,
  ARCSIGHT_COMMENT_ANCHOR,
} from "./marker.js";

function findAnchrComments(comments: ExistingComment[]): ExistingComment[] {
  return comments.filter((c) => c.body && commentContainsMarker(c.body));
}

function newestComment(comments: ExistingComment[]): ExistingComment {
  return comments.reduce((a, b) =>
    (a.createdAt && b.createdAt && a.createdAt < b.createdAt) ? b : a,
  );
}

function oldestComment(comments: ExistingComment[]): ExistingComment {
  return comments.reduce((a, b) =>
    (a.createdAt && b.createdAt && a.createdAt > b.createdAt) ? b : a,
  );
}

/**
 * Returns exactly one instruction. No GitHub API calls — decision logic only.
 * Runner must: execute instruction; if DELETE, re-fetch comments and call again until CREATE/UPDATE/NO_OP.
 */
export function getLifecycleInstruction(
  input: LifecycleInput,
): LifecycleInstruction {
  const {
    renderedComment,
    runMetadata: { runId, headSha, baseSha },
    pullRequest: { currentHeadSha, currentBaseSha },
    existingComments,
  } = input;

  // Step 0 — Authority: only the run for current (HEAD, BASE) may update.
  if (headSha !== currentHeadSha || baseSha !== currentBaseSha) {
    return { kind: "NO_OP" };
  }

  const bodyAlreadyHasMarker =
    renderedComment.startsWith(ARCSIGHT_RUN_PREFIX) ||
    renderedComment.includes(ARCSIGHT_COMMENT_ANCHOR) ||
    renderedComment.includes("<!-- ANCHR:REVIEW");
  const fullCommentBody = bodyAlreadyHasMarker
    ? renderedComment
    : buildCommentWithMarker(renderedComment, runId, headSha, baseSha);

  const anchrComments = findAnchrComments(existingComments);

  // Step 1 — Collect ANCHR comments. If >1, keep newest, delete the rest (return DELETE oldest; runner re-runs).
  if (anchrComments.length > 1) {
    const oldest = oldestComment(anchrComments);
    return { kind: "DELETE", commentId: oldest.id };
  }

  if (anchrComments.length === 0) {
    // Step 6 — First comment case.
    return { kind: "CREATE", commentBody: fullCommentBody };
  }

  const comment = anchrComments[0];

  // Step 2 — Parse metadata. If fail, delete malformed and let next run CREATE.
  const parsed = parseMarker(comment.body);
  if (!parsed) {
    return { kind: "DELETE", commentId: comment.id };
  }

  const { runId: existingRunId, commitSha: existingCommitSha, baseSha: existingBaseSha } = parsed;

  // Step 3 — Outdated: existing is for a different (head, base). Overwrite with this run's result.
  const headMismatch = existingCommitSha !== headSha;
  const baseMismatch = currentBaseSha !== undefined && existingBaseSha !== undefined && existingBaseSha !== currentBaseSha;
  if (headMismatch || baseMismatch) {
    return {
      kind: "UPDATE",
      commentId: comment.id,
      commentBody: fullCommentBody,
    };
  }

  // Step 4 — Determinism guard: same run must not rewrite.
  if (existingRunId === runId) {
    return { kind: "NO_OP" };
  }

  // Step 5 — New run for same commit: update existing comment with new review.
  return {
    kind: "UPDATE",
    commentId: comment.id,
    commentBody: fullCommentBody,
  };
}
