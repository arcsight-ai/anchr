/**
 * ArcSight Persistent PR Reviewer (Prompt 13 — Final Hardened).
 * Maintains exactly one authoritative ArcSight review comment per PR.
 * Never breaks CI: missing env or API errors → exit(0).
 */

import { Octokit } from "@octokit/rest";
import { createHash } from "crypto";
import fs from "fs";
import { generateExplanationSection } from "./generate-explanations.js";
import { renderComment } from "./render-comment.js";
import { recommendAction } from "./recommend-action.js";

const requiredEnv = ["GITHUB_TOKEN", "GITHUB_REPOSITORY", "PR_NUMBER", "ANCHR_REPORT_PATH"] as const;

function getEnv(key: (typeof requiredEnv)[number]): string {
  const v = process.env[key];
  if (v == null || String(v).trim() === "") return "";
  return String(v).trim();
}

function log(state: string): void {
  console.log("ANCHR comment: " + state);
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function safeBody(text: string): string {
  if (text.length < 60000) return text;
  return text.slice(0, 58000) + "\n\n…output truncated…";
}

function extract(body: string | undefined): { run?: string; hash?: string } {
  if (!body) return {};
  const run = body.match(/run:([a-z0-9]+)/)?.[1];
  const hash = body.match(/hash:([a-f0-9]+)/)?.[1];
  return { run, hash };
}

async function main(): Promise<void> {
  for (const key of requiredEnv) {
    if (!getEnv(key)) {
      process.exit(0);
    }
  }

  const ownerRepo = getEnv("GITHUB_REPOSITORY");
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) process.exit(0);

  const prNumber = Number(process.env.PR_NUMBER);
  if (!Number.isInteger(prNumber) || prNumber < 1) process.exit(0);

  const reportPath = getEnv("ANCHR_REPORT_PATH");
  let rawReport: unknown;
  try {
    rawReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    process.exit(0);
  }

  const report = rawReport as Record<string, unknown>;
  const action = recommendAction(report);

  const runId = (report.run as { id?: string } | undefined)?.id ?? "";
  const scopeMode = (report.scope as { mode?: string } | undefined)?.mode ?? "";
  const confidence = report.confidence as { coverageRatio?: number } | undefined;
  const coverageRatio = typeof confidence?.coverageRatio === "number" && Number.isFinite(confidence.coverageRatio)
    ? confidence.coverageRatio
    : 0;
  const classification = report.classification as { violations?: unknown[] } | undefined;
  const downgradeReasons = (report.confidence as { downgradeReasons?: string[] } | undefined)?.downgradeReasons ?? null;

  const bodyFromRender = renderComment({
    action,
    runId,
    scopeMode,
    coverageRatio,
    explanationViolations: (classification?.violations ?? null) as import("./render-comment.js").RenderInput["explanationViolations"],
    downgradeReasons,
  });
  const whySection = generateExplanationSection(rawReport);
  const body = bodyFromRender + whySection;

  const newHash = createHash("sha256").update(normalize(body)).digest("hex");
  const marker = "<!-- arcsight:v3:run:" + runId + " hash:" + newHash + " -->";
  const finalBody = body + "\n\n" + marker;
  const safeFinalBody = safeBody(finalBody);

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

  async function getAllComments(): Promise<{ id: number; user?: { type?: string } | null; body?: string | null }[]> {
    return octokit.paginate(octokit.issues.listComments, {
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });
  }

  const comments = await getAllComments();
  const arcComments = comments.filter(
    (c) => c.user?.type === "Bot" && (c.body?.includes("<!-- arcsight:v3:run:") ?? false),
  );
  arcComments.sort((a, b) => a.id - b.id);
  const existing = arcComments.at(-1) ?? null;
  const old = extract(existing?.body ?? undefined);

  if (!existing) {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: safeFinalBody,
    });
    log("created");
    return;
  }

  if (old.hash === newHash) {
    log("unchanged");
    return;
  }

  await octokit.issues.updateComment({
    owner,
    repo,
    comment_id: existing.id,
    body: safeFinalBody,
  });

  for (const c of arcComments.slice(0, -1)) {
    await octokit.issues.deleteComment({ owner, repo, comment_id: c.id }).catch(() => {});
  }
  log("updated");
}

try {
  await main();
} catch {
  console.log("ANCHR comment: skipped");
  process.exit(0);
}
