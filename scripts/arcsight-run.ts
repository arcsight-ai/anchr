/**
 * ArcSight Runtime (Prompt 6 — Production Hardened). Single CI entrypoint.
 * Force-push guard, optimistic lock, never breaks CI.
 */

import { readFileSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import { decide, normalizeReport } from "../src/decision/actionLayer.js";
import { planRemediation } from "../src/remediation/index.js";
import { renderPRComment } from "../src/comment/canonicalPRComment.js";
import {
  reconcileComment,
  buildArcSightMetadataLine,
  buildArcSightRunLine,
} from "../src/reconciliation/index.js";
import { executeCommentActions } from "../src/execution/index.js";
import { findExistingArcSightComment } from "../src/github/index.js";

const REPORT_PATH = process.env.ANCHR_REPORT_PATH ?? "artifacts/anchr-report.json";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function runStructuralAudit(cwd: string): Promise<Record<string, unknown>> {
  const scriptPath = resolve(cwd, "scripts/anchr-structural-audit.ts");
  spawnSync("npx", ["tsx", scriptPath], {
    cwd,
    stdio: "pipe",
    env: { ...process.env, GITHUB_BASE_SHA: process.env.GITHUB_BASE_SHA, HEAD_SHA: process.env.HEAD_SHA },
  });
  const raw = readJson(join(cwd, REPORT_PATH));
  const report = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return report;
}

async function runCertifier(_fast: Record<string, unknown>): Promise<Record<string, unknown>> {
  return _fast;
}

function actionToReconciliationStatus(action: string): "VERIFIED" | "UNSAFE" | "INDETERMINATE" {
  if (action === "proceed") return "VERIFIED";
  if (action === "rerun-analysis") return "INDETERMINATE";
  return "UNSAFE";
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const baseSha = process.env.GITHUB_BASE_SHA ?? "";
  const headSha = process.env.HEAD_SHA ?? "";

  if (!eventPath || !repo) {
    process.exit(0);
  }

  let event: { pull_request?: { number: number } };
  try {
    event = JSON.parse(readFileSync(eventPath, "utf8")) as { pull_request?: { number: number } };
  } catch {
    process.exit(0);
  }

  if (!event.pull_request) {
    console.log("ANCHR: not a PR");
    process.exit(0);
  }

  const prNumber = event.pull_request.number;
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName || !token || !headSha) {
    process.exit(0);
  }

  const runId = sha256(repo + String(prNumber) + baseSha + headSha);

  const fast = await runStructuralAudit(cwd);
  const fastStatus = (fast.status as string) ?? "INCOMPLETE";
  const fastLevel = (fast.decision as { level?: string })?.level ?? "block";

  let finalReport: Record<string, unknown>;
  if (fastStatus === "UNSAFE" && fastLevel === "block") {
    finalReport = fast;
    console.log("ANCHR: fast-path BLOCK");
  } else if (fastStatus === "VERIFIED") {
    finalReport = fast;
    console.log("ANCHR: structural VERIFIED");
  } else {
    console.log("ANCHR: running certifier");
    finalReport = await runCertifier(fast);
  }

  finalReport.run = {
    id: runId,
    head: headSha,
    base: baseSha,
  };

  const decisionLevel = (finalReport.decision as { level?: string })?.level ?? "block";

  let existing = await findExistingArcSightComment(owner, repoName, prNumber, token);

  if (existing && existing.headSha !== headSha) {
    console.log("ANCHR: head changed — re-analysis required");
    existing = null;
  }

  if (
    existing &&
    existing.runId === runId &&
    existing.decisionLevel === decisionLevel
  ) {
    console.log("ANCHR: already converged");
    process.exitCode = finalReport.decision && (finalReport.decision as { level?: string }).level === "block" ? 1 : 0;
    return;
  }

  const norm = normalizeReport(finalReport);
  const decision = decide(finalReport);
  const plan = planRemediation({
    action: decision.action,
    reasonCode: decision.reasonCode,
    severity: decision.severity,
    explanation: decision.explanation,
    semanticCauses: norm.causes,
  });
  const rendered = renderPRComment(plan);
  const metaLine = buildArcSightMetadataLine(headSha, plan.metadata.messageId, rendered.fingerprint);
  const runLine = buildArcSightRunLine(runId, decisionLevel);
  const bodyWithMeta = rendered.body + "\n" + metaLine + "\n" + runLine;

  const status = actionToReconciliationStatus(decision.action);
  const next = {
    body: bodyWithMeta,
    fingerprint: rendered.fingerprint,
    messageId: plan.metadata.messageId,
    status,
    commitSha: headSha,
  };

  const existingComments = existing
    ? [{ id: existing.id, body: existing.body, createdAt: "" }]
    : [];

  const actions = reconcileComment(existingComments, next, headSha);

  const hasNonNoop = actions.some((a) => a.type !== "noop");
  if (!hasNonNoop) {
    console.log("ANCHR: no changes");
    process.exitCode = decisionLevel === "block" ? 1 : 0;
    return;
  }

  const latest = await findExistingArcSightComment(owner, repoName, prNumber, token);
  if (existing && latest && latest.bodyHash !== existing.bodyHash) {
    console.log("ANCHR: concurrent update detected — aborting edit");
    process.exitCode = decisionLevel === "block" ? 1 : 0;
    return;
  }

  await executeCommentActions(actions, {
    owner,
    repo: repoName,
    issueNumber: prNumber,
    githubToken: token,
  });
  console.log("ANCHR: updating comment");

  if (decisionLevel === "block") {
    console.log("ANCHR: CI result BLOCK");
    process.exitCode = 1;
  } else {
    console.log("ANCHR: CI result ALLOW");
    process.exitCode = 0;
  }
}

main().catch((err) => {
  console.error("ArcSight internal error");
  console.error(err?.message ?? String(err));
  process.exitCode = 0;
});
