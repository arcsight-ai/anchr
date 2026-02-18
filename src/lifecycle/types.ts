export interface RunMetadata {
  runId: string;
  headSha: string;
  baseSha: string;
  decision: "APPROVE" | "REVIEW" | "REWORK" | "INVESTIGATE";
}

export interface PullRequest {
  currentHeadSha: string;
  currentBaseSha: string;
}

export interface ExistingComment {
  id: number;
  body: string;
  createdAt: string;
}

export type LifecycleInstruction =
  | { kind: "CREATE"; commentBody: string }
  | { kind: "UPDATE"; commentId: number; commentBody: string }
  | { kind: "DELETE"; commentId: number }
  | { kind: "NO_OP" };

export interface LifecycleInput {
  renderedComment: string;
  runMetadata: RunMetadata;
  pullRequest: PullRequest;
  existingComments: ExistingComment[];
}
