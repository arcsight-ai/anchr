/**
 * Comment Reconciliation Engine types (Prompt 4).
 * Commit-aware, race-safe lifecycle for ArcSight PR comments.
 */

export interface ExistingComment {
  id: number;
  body: string;
  createdAt: string;
}

export type ReconciliationStatus = "VERIFIED" | "UNSAFE" | "INDETERMINATE";

export interface RenderedCommentForReconcile {
  body: string;
  fingerprint: string;
  messageId: string;
  status: ReconciliationStatus;
  commitSha: string;
}

export type CommentAction =
  | { type: "create"; body: string }
  | { type: "update"; id: number; body: string }
  | { type: "replace"; id: number; body: string }
  | { type: "delete"; id: number }
  | { type: "noop" };

export interface ParsedArcSightMeta {
  commitSha: string;
  messageId: string;
  fingerprint: string;
}
