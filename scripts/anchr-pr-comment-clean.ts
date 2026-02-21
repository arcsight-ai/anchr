/**
 * ANCHR PR Commenter (Clean Final). One comment per PR. Idempotent. Human-aware.
 * Marker: <!-- anchr:comment -->
 */

import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

const ANCHR_MARKER = "<!-- anchr:comment -->";
const REPORT_PATH = process.env.REPORT_PATH ?? "artifacts/anchr-report.json";

const NOISE_PATTERNS = [
  /\.md$/i,
  /\.json$/i,
  /\.yml$/i,
  /\.yaml$/i,
  /\.lock$/i,
  /^docs\//i,
  /^\.github\//i,
  /\/test\//i,
  /\/tests\//i,
  /^test\//i,
  /^tests\//i,
  /\.(spec|test)\.(ts|tsx|js|jsx)$/i,
];
const SUPPRESSION_KEYWORDS = [
  "race",
  "retry",
  "async",
  "ordering",
  "cache",
  "timeout",
  "null",
  "state",
  "invariant",
  "public",
  "api",
];

type Stage = "EARLY" | "ACTIVE_REVIEW" | "PRE_MERGE";

async function fetchJson<T>(url: string, token: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function listComments(
  token: string,
  repo: string,
  issueNumber: number
): Promise<{ id: number; body: string; user: { type: string }; created_at: string }[]> {
  const [owner, name] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${name}/issues/${issueNumber}/comments?per_page=100`;
  const data = await fetchJson<{ id: number; body: string; user: { type: string }; created_at: string }[]>(
    url,
    token
  );
  return Array.isArray(data) ? data : [];
}

async function createComment(
  token: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<boolean> {
  const [owner, name] = repo.split("/");
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/issues/${issueNumber}/comments`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    }
  );
  return res.ok;
}

async function updateComment(
  token: string,
  repo: string,
  commentId: number,
  body: string
): Promise<boolean> {
  const [owner, name] = repo.split("/");
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/issues/comments/${commentId}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body }),
    }
  );
  return res.ok;
}

async function deleteComment(
  token: string,
  repo: string,
  commentId: number
): Promise<boolean> {
  const [owner, name] = repo.split("/");
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${name}/issues/comments/${commentId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  return res.ok;
}

function readReport(cwd: string): {
  decision?: { level?: string; reason?: string };
  confidence?: { coverageRatio?: number };
  classification?: { primaryCause?: string | null };
  minimalCut?: string[];
  run?: { id?: string };
  baseSha?: string;
  headSha?: string;
} | null {
  try {
    const raw = readFileSync(join(cwd, REPORT_PATH), "utf8");
    const data = JSON.parse(raw) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) as {
      decision?: { level?: string; reason?: string };
      confidence?: { coverageRatio?: number };
      classification?: { primaryCause?: string | null };
      minimalCut?: string[];
      run?: { id?: string };
      baseSha?: string;
      headSha?: string;
    } : null;
  } catch {
    return null;
  }
}

function shortSha(sha: string): string {
  return typeof sha === "string" && sha.length >= 7 ? sha.slice(0, 7) : sha;
}

function isAnchrComment(body: string): boolean {
  return body.trimStart().startsWith(ANCHR_MARKER);
}

function parseAnchrHash(body: string): string | null {
  const m = body.match(/<!-- anchr:hash:([a-f0-9]+)\s*-->/);
  return m?.[1] ?? null;
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumberRaw = process.env.PR_NUMBER;
  const headSha = process.env.HEAD_SHA;
  const baseSha = process.env.BASE_SHA;
  const cwd = process.cwd();

  if (!token || !repo || prNumberRaw === undefined || prNumberRaw === "") {
    process.exit(0);
  }
  const prNumber = parseInt(prNumberRaw, 10);
  if (!Number.isFinite(prNumber) || prNumber < 1 || !headSha || !baseSha) {
    process.exit(0);
  }

  const [owner, name] = repo.split("/");
  let pr: {
    created_at: string;
    labels: { name: string }[];
    user: { type: string };
  } | null = null;
  let files: { filename: string }[] = [];
  let commitCount = 0;
  let mergeableState: string | null = null;

  try {
    pr = await fetchJson<{
      created_at: string;
      labels: { name: string }[];
      user: { type: string };
    }>(`https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}`, token);
    files = (await fetchJson<{ filename: string }[]>(
      `https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}/files?per_page=300`,
      token
    )) ?? [];
    const commits = await fetchJson< unknown[]>(
      `https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}/commits`,
      token
    );
    commitCount = Array.isArray(commits) ? commits.length : 0;
    const prFull = await fetchJson<{ mergeable_state?: string }>(
      `https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}?mergeable_state`,
      token
    );
    mergeableState = prFull?.mergeable_state ?? null;
  } catch {
    process.exit(0);
  }

  if (!pr) process.exit(0);
  if (pr.labels?.some((l) => l.name === "anchr-ignore")) process.exit(0);

  const allNoise =
    files.length > 0 &&
    files.every((f) => NOISE_PATTERNS.some((re) => re.test(f.filename)));
  if (allNoise) process.exit(0);

  const comments = await listComments(token, repo, prNumber);
  const humanComments = comments.filter((c) => c.user?.type === "User");
  const humanBodies = humanComments.map((c) => (c.body ?? "").toLowerCase()).join(" ");
  const approvalsRes = await fetchJson<{ state: string }[]>(
    `https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}/reviews`,
    token
  );
  const approvalsCount = Array.isArray(approvalsRes)
    ? approvalsRes.filter((r) => r.state === "APPROVED").length
    : 0;
  const checksRes = await fetchJson<{ check_runs?: { conclusion?: string }[] }>(
    `https://api.github.com/repos/${owner}/${name}/commits/${headSha}/check-runs`,
    token
  );
  const checksPassed =
    checksRes?.check_runs?.every((r) => r.conclusion === "success") ?? false;
  const humanCommentsExist = humanComments.length > 0;

  let stage: Stage = "EARLY";
  if (approvalsCount >= 1 || checksPassed || (mergeableState && ["clean", "unstable"].includes(mergeableState))) {
    stage = "PRE_MERGE";
  } else if (humanCommentsExist || commitCount > 2) {
    stage = "ACTIVE_REVIEW";
  }

  const report = readReport(cwd);
  if (
    !report ||
    report.decision?.level == null ||
    report.decision?.reason == null ||
    report.confidence?.coverageRatio == null ||
    report.classification?.primaryCause === undefined ||
    !Array.isArray(report.minimalCut)
  ) {
    process.exit(0);
  }

  const level = report.decision.level;
  const reason = (report.decision.reason ?? "").slice(0, 200);
  const ratio = Number(report.confidence.coverageRatio) ?? 0;
  const primaryCause = report.classification.primaryCause ?? "";
  const minimalCut = report.minimalCut ?? [];
  const risk = level === "warn" || level === "block";
  const confidence =
    ratio >= 0.95 ? "High" : ratio >= 0.8 ? "Med" : "Low";
  const evidenceCount =
    Math.min(5, minimalCut.length) + (primaryCause ? 1 : 0);

  const shouldCommentByStage =
    stage === "EARLY"
      ? level === "block" && confidence === "High" && evidenceCount >= 3
      : stage === "ACTIVE_REVIEW"
        ? (confidence === "High" || confidence === "Med") && evidenceCount >= 2
        : (confidence === "High" || confidence === "Med") && evidenceCount >= 1;

  const shouldComment = shouldCommentByStage && confidence !== "Low";

  const suppressionText = `${primaryCause} ${reason}`.toLowerCase();
  const humanSuppressed = SUPPRESSION_KEYWORDS.some((kw) =>
    humanBodies.includes(kw) && suppressionText.includes(kw)
  );
  const postRisk = shouldComment && !humanSuppressed;

  const anchrComments = comments.filter((c) => isAnchrComment(c.body));
  const existingAnchr = anchrComments[0];

  if (!postRisk) {
    if (existingAnchr) {
      try {
        await deleteComment(token, repo, existingAnchr.id);
      } catch {
        // ignore
      }
    }
    process.exit(0);
  }

  const header =
    level === "block" ? "🔴 BLOCK" : level === "warn" ? "🟡 WARN" : "🟢 ALLOW";
  const evidenceLines = minimalCut.slice(0, 4).map((p) => `• ${p}`);
  const runId = (report.run?.id ?? "").slice(0, 12);
  const bodyParts = [
    ANCHR_MARKER,
    "",
    header,
    "",
    reason,
    "",
    "**Why now:**",
    `PR is ${stage.replace("_", " ")}.`,
    "",
    "**Evidence:**",
    ...evidenceLines,
    "",
    `**Confidence:** ${confidence} (${ratio.toFixed(2)})`,
    "",
    "<details>",
    `<summary>base ${shortSha(baseSha)} · head ${shortSha(headSha)} · run ${runId}</summary>`,
    "",
    `base: ${baseSha}`,
    `head: ${headSha}`,
    `run: ${report.run?.id ?? ""}`,
    "</details>",
  ];
  let body = bodyParts.join("\n");
  if (body.length > 3000) body = body.slice(0, 2997) + "...";
  const hash = createHash("sha256").update(body, "utf8").digest("hex");
  body += `\n\n<!-- anchr:hash:${hash} -->`;

  if (existingAnchr && parseAnchrHash(existingAnchr.body) === hash) {
    process.exit(0);
  }

  try {
    if (existingAnchr) {
      await updateComment(token, repo, existingAnchr.id, body);
    } else {
      await createComment(token, repo, prNumber, body);
    }
  } catch {
    // silence
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
