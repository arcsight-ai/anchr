/**
 * ArcSight repair comment script.
 * Runs after certification. Only reads report JSON and event JSON.
 * Never executes PR code or project imports.
 */

import { readFileSync } from "fs";
import { resolve, join } from "path";
import { buildCommentBody, parseExistingCommentBody } from "../src/repair/commentBody.js";
import {
  getDirectionForSignals,
  type BoundaryViolationDetail,
} from "../src/direction/index.js";
import { readPressureSignals, loadPressurePRMemory, savePressurePRMemory, mergeSignalsWithPRMemory } from "../src/pressure/store.js";
import { formatSignalsSection } from "../src/pressure/signals.js";

const REPORT_PATH = "artifacts/anchr-report.json";
const COMMENT_MARKER = "ANCHR";

function readReport(cwd: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(resolve(cwd, REPORT_PATH), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readEvent(eventPath: string): { pull_request?: { number: number; head?: { sha?: string } } } | null {
  try {
    const raw = readFileSync(eventPath, "utf8");
    return JSON.parse(raw) as { pull_request?: { number: number; head?: { sha?: string } } };
  } catch {
    return null;
  }
}

function shortSha(sha: string): string {
  return typeof sha === "string" && sha.length >= 7 ? sha.slice(0, 7) : sha;
}

async function listComments(
  token: string,
  repo: string,
  issueNumber: number,
): Promise< { id: number; body: string; user?: { login?: string } }[] > {
  const [owner, repoName] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${repoName}/issues/${issueNumber}/comments`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { id: number; body: string; user?: { login?: string } }[];
  return Array.isArray(data) ? data : [];
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

  const report = readReport(cwd);
  const currentHeadShort = shortSha(pr.head.sha);

  const decision = report?.decision as { level?: string } | undefined;
  const level = decision?.level ?? "allow";
  const reportHeadSha = typeof report?.headSha === "string" ? report.headSha : "";
  const reportHeadShort = shortSha(reportHeadSha);
  const runId = (report?.run as { id?: string })?.id ?? "";
  const primaryCause = (report?.classification as { primaryCause?: string | null })?.primaryCause ?? null;
  const minimalCut = Array.isArray(report?.minimalCut) ? (report.minimalCut as string[]) : [];

  if (!report) {
    const body = [
      "## ArcSight Certification Result",
      "",
      "ANCHR report missing — certification did not execute.",
    ].join("\n");
    const comments = await listComments(token, repo, pr.number);
    const existing = comments.find((c) => c.body && c.body.includes(COMMENT_MARKER));
    if (existing) {
      await updateComment(token, repo, existing.id, body);
    } else {
      await createComment(token, repo, pr.number, body);
    }
    process.exit(0);
  }

  if (reportHeadShort && currentHeadShort && reportHeadShort !== currentHeadShort) {
    const body = [
      "## ArcSight Certification Result",
      "",
      "Result outdated — re-running for latest commit.",
    ].join("\n");
    const comments = await listComments(token, repo, pr.number);
    const existing = comments.find((c) => c.body && c.body.includes(COMMENT_MARKER));
    if (existing) {
      await updateComment(token, repo, existing.id, body);
    } else {
      await createComment(token, repo, pr.number, body);
    }
    process.exit(0);
  }

  const comments = await listComments(token, repo, pr.number);
  const existing = comments.find((c) => c.body && c.body.includes(COMMENT_MARKER));

  if (existing && runId) {
    const parsed = parseExistingCommentBody(existing.body);
    if (parsed.runId === runId) {
      const existingDecision = parsed.decision?.toUpperCase() ?? "";
      const currentDecision = level.toUpperCase();
      if (existingDecision === currentDecision) {
        process.exit(0);
      }
      const body = [
        "## ArcSight Certification Result",
        "",
        "Non-deterministic analysis detected. Result ignored.",
      ].join("\n");
      await updateComment(token, repo, existing.id, body);
      process.exit(0);
    }
  }

  const decisionLabel = level === "block" ? "BLOCK" : level === "warn" ? "WARN" : "ALLOW";
  const includeRepair = level === "block";

  let body = buildCommentBody(
    decisionLabel,
    runId,
    primaryCause,
    minimalCut,
    reportHeadShort || currentHeadShort,
    includeRepair,
  );

  const artifactsDir = join(cwd, "artifacts");
  const pressureData = readPressureSignals(artifactsDir);
  const headSha = reportHeadSha || pr.head.sha;
  if (pressureData && pressureData.signals.length > 0) {
    const memory = loadPressurePRMemory(artifactsDir);
    const { signalsToShow, updatedMemory } = mergeSignalsWithPRMemory(
      headSha,
      pressureData.signals,
      memory,
    );
    if (signalsToShow.length > 0) {
      body = body + "\n\n" + formatSignalsSection(signalsToShow);

      const boundaryViolationDetails = Array.isArray(report?.boundaryViolationDetails)
        ? (report.boundaryViolationDetails as BoundaryViolationDetail[])
        : [];
      const directionMessages = getDirectionForSignals(
        signalsToShow,
        boundaryViolationDetails,
      );
      for (const msg of directionMessages) {
        body = body + "\n\n" + msg;
      }
    }
    savePressurePRMemory(artifactsDir, updatedMemory);
  }

  if (existing) {
    await updateComment(token, repo, existing.id, body);
  } else {
    await createComment(token, repo, pr.number, body);
  }

  process.exit(0);
}

main();
