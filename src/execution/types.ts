/**
 * GitHub Comment Execution Adapter types (Prompt 5).
 */

import type { CommentAction } from "../reconciliation/types.js";

export type { CommentAction };

export interface ExecutionContext {
  owner: string;
  repo: string;
  issueNumber: number;
  githubToken: string;
}
