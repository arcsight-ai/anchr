/**
 * ANCHR PR Comment Lifecycle (Prompt 8).
 * Posts or updates exactly one ANCHR review comment using the lifecycle controller.
 * Stale runs (headSha != PR head) do nothing. Newest commit always wins.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { getLifecycleInstruction } from "../src/lifecycle/index.js";
import type { LifecycleInstruction, ExistingComment } from "../src/lifecycle/types.js";
import { renderProductionComment } from "../src/comment/index.js";

const REPORT_PATH = "artifacts/anchr-report.json";
const POLICY_PATH = "artifacts/anchr-policy.json";
const COMMENT_BODY_PATH = "artifacts/anchr-comment-body.md";

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return "";
  }
}

function shortSha(sha: string): string {
  return typeof sha === "string" && sha.length >= 7 ? sha.slice(0, 7) : sha;
}

function readEvent(eventPath: string): {
  pull_request?: { number: number; head?: { sha?: string }; base?: { sha?: string } };
} | null {
  try {
    return JSON.parse(readFileSync(eventPath, "utf8")) as {
      pull_request?: { number: number; head?: { sha?: string }; base?: { sha?: string } };
    };
  } catch {
    return null;
  }
}

async function listComments(
  token: string,
  repo: string,
  issueNumber: number,
): Promise<ExistingComment[]> {
  const [owner, repoName] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${repoName}/issues/${issueNumber}/comments`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { id: number; body: string; created_at?: string }[];
  const list = Array.isArray(data) ? data : [];
  return list.map((c) => ({
    id: c.id,
    body: c.body ?? "",
    createdAt: c.created_at ?? "",
  }));
}

async function createComment(
  token: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<boolean> {
  const [owner, repoName] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${repoName}/issues/${issueNumber}/comments`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  return res.ok;
}

async function updateComment(
  token: string,
  repo: string,
  commentId: number,
  body: string,
): Promise<boolean> {
  const [owner, repoName] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${repoName}/issues/comments/${commentId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  return res.ok;
}

async function deleteComment(
  token: string,
  repo: string,
  commentId: number,
): Promise<boolean> {
  const [owner, repoName] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${repoName}/issues/comments/${commentId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
    },
  });
  return res.ok;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!eventPath || !token || !repo) {
    process.exit(0);
  }

  const event = readEvent(eventPath);
  const pr = event?.pull_request;
  if (!pr?.number || pr.head?.sha == null) {
    process.exit(0);
  }

  const report = readJson(join(cwd, REPORT_PATH)) as {
    headSha?: string;
    run?: { id?: string };
    status?: string;
    decision?: { level?: string };
    scope?: { mode?: string };
    classification?: { primaryCause?: string | null };
    minimalCut?: string[];
    downgradeReasons?: string[];
    timestamp?: string;
    confidence?: { coverageRatio?: number };
  } | null;
  const policy = readJson(join(cwd, POLICY_PATH)) as {
    runId: string;
    action: string;
    message: string;
    confidence: string;
  } | null;

  const headSha = report?.headSha ?? pr.head.sha;
  const baseSha = process.env.BASE_SHA ?? process.env.GITHUB_BASE_SHA ?? (pr as { base?: { sha?: string } }).base?.sha ?? "";
  const runId = report?.run?.id ?? "";
  const currentHeadSha = pr.head.sha;
  const currentBaseSha = (pr as { base?: { sha?: string } }).base?.sha ?? process.env.BASE_SHA ?? process.env.GITHUB_BASE_SHA ?? "";
  const isOutdated =
    Boolean(report?.headSha && currentHeadSha) && report!.headSha !== currentHeadSha;
  const isNonDeterministic =
    policy?.message === "Analysis inconsistent across runs — manual review required.";

  let renderedComment: string;
  if (report && policy && runId) {
    renderedComment = renderProductionComment({
      report: {
        status: report.status,
        decision: report.decision,
        scope: report.scope,
        run: report.run,
        classification: report.classification,
        minimalCut: report.minimalCut,
        downgradeReasons: report.downgradeReasons,
        timestamp: report.timestamp,
        confidence: report.confidence,
      },
      decision: {
        action: policy.action as "merge" | "block" | "review" | "retry",
        message: policy.message,
        confidence: policy.confidence as "high" | "medium" | "low",
      },
      commitSha: shortSha(report.headSha ?? currentHeadSha),
      runId,
      isOutdated,
      isNonDeterministic,
    });
  } else {
    renderedComment = readText(join(cwd, COMMENT_BODY_PATH));
  }

  const pullRequest = { currentHeadSha: pr.head.sha, currentBaseSha };
  let existingComments: ExistingComment[] = await listComments(token, repo, pr.number);

  const decisionFromPolicy: "APPROVE" | "REVIEW" | "REWORK" | "INVESTIGATE" =
    policy?.action === "merge"
      ? "APPROVE"
      : policy?.action === "block"
        ? "REWORK"
        : policy?.action === "retry"
          ? "INVESTIGATE"
          : "REVIEW";
  const input = {
    renderedComment,
    runMetadata: { runId, headSha, baseSha, decision: decisionFromPolicy },
    pullRequest,
    existingComments,
  };

  let instruction: LifecycleInstruction = getLifecycleInstruction(input);

  while (instruction.kind === "DELETE") {
    await deleteComment(token, repo, instruction.commentId);
    existingComments = await listComments(token, repo, pr.number);
    instruction = getLifecycleInstruction({
      ...input,
      existingComments,
    });
  }

  switch (instruction.kind) {
    case "NO_OP":
      process.exit(0);
    case "CREATE":
      await createComment(token, repo, pr.number, instruction.commentBody);
      break;
    case "UPDATE":
      await updateComment(token, repo, instruction.commentId, instruction.commentBody);
      break;
  }

  process.exit(0);
}

main();
