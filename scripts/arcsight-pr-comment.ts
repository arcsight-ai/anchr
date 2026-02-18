/**
 * ArcSight Causally-Correct Convergent PR Comment Controller (Final).
 * Authority = (HEAD_SHA, BASE_SHA). Single Node script; never exit non-zero.
 * Converges to exactly one authoritative comment per (head, base) pair.
 */

import { readFileSync } from "fs";
import { join } from "path";
import {
  buildArcsightV5Comment,
  parseArcsightV5Meta,
  isArcsightComment,
  type ArcsightV5Input,
  type DecisionLevel,
} from "../src/comment/v5.js";

const REPORT_PATH = process.env.REPORT_PATH ?? "artifacts/anchr-report.json";

type LogState =
  | "CREATED"
  | "UPDATED"
  | "UNCHANGED"
  | "UPDATED_REPAIR"
  | "CREATED_AFTER_DELETE"
  | "SKIPPED_NOT_HEAD"
  | "SKIPPED_NOT_BASE"
  | "LOST_RACE"
  | "API_FAILED";

function log(state: LogState): void {
  console.log(state);
}

function readReport(cwd: string): {
  decision?: { level?: string; reason?: string };
  run?: { id?: string };
  headSha?: string;
  baseSha?: string;
} | null {
  try {
    const raw = readFileSync(join(cwd, REPORT_PATH), "utf8");
    const data = JSON.parse(raw) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) as {
      decision?: { level?: string; reason?: string };
      run?: { id?: string };
      headSha?: string;
      baseSha?: string;
    } : null;
  } catch {
    return null;
  }
}

function shortSha(sha: string): string {
  return typeof sha === "string" && sha.length >= 7 ? sha.slice(0, 7) : sha;
}

async function fetchWithRetry(
  url: string,
  opts: RequestInit,
  token: string,
): Promise<Response> {
  const headers = {
    Accept: "application/vnd.github.v3+json",
    Authorization: `Bearer ${token}`,
    ...opts.headers,
  };
  const delays = [1000, 2000, 4000];
  let lastRes: Response | null = null;
  for (let i = 0; i <= delays.length; i++) {
    const res = await fetch(url, { ...opts, headers });
    if (res.status !== 403 && res.status !== 429) return res;
    lastRes = res;
    if (i < delays.length) await new Promise((r) => setTimeout(r, delays[i]));
  }
  return lastRes!;
}

async function getPr(
  token: string,
  repo: string,
  prNumber: number,
): Promise<{ headSha: string; baseSha: string } | null> {
  const [owner, name] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${name}/pulls/${prNumber}`;
  const res = await fetchWithRetry(url, {}, token);
  if (!res.ok) return null;
  const data = (await res.json()) as { head?: { sha?: string }; base?: { sha?: string } };
  const headSha = data.head?.sha;
  const baseSha = data.base?.sha;
  if (!headSha || !baseSha) return null;
  return { headSha, baseSha };
}

async function listComments(
  token: string,
  repo: string,
  issueNumber: number,
): Promise<{ id: number; body: string; created_at: string }[]> {
  const [owner, name] = repo.split("/");
  const out: { id: number; body: string; created_at: string }[] = [];
  let page = 1;
  const perPage = 100;
  for (;;) {
    const url = `https://api.github.com/repos/${owner}/${name}/issues/${issueNumber}/comments?per_page=${perPage}&page=${page}`;
    const res = await fetchWithRetry(url, {}, token);
    if (!res.ok) return out;
    const data = (await res.json()) as { id: number; body: string; created_at: string }[];
    const list = Array.isArray(data) ? data : [];
    for (const c of list) {
      out.push({
        id: c.id,
        body: c.body ?? "",
        created_at: c.created_at ?? "",
      });
    }
    if (list.length < perPage) break;
    page++;
  }
  return out;
}

async function createComment(
  token: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<boolean> {
  const [owner, name] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${name}/issues/${issueNumber}/comments`;
  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
    token,
  );
  return res.ok;
}

async function updateComment(
  token: string,
  repo: string,
  commentId: number,
  body: string,
): Promise<boolean> {
  const [owner, name] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${name}/issues/comments/${commentId}`;
  const res = await fetchWithRetry(
    url,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    },
    token,
  );
  return res.ok;
}

async function deleteComment(
  token: string,
  repo: string,
  commentId: number,
): Promise<boolean> {
  const [owner, name] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${name}/issues/comments/${commentId}`;
  const res = await fetchWithRetry(url, { method: "DELETE" }, token);
  return res.ok;
}

async function getComment(
  token: string,
  repo: string,
  commentId: number,
): Promise<{ body: string } | null> {
  const [owner, name] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${name}/issues/comments/${commentId}`;
  const res = await fetchWithRetry(url, {}, token);
  if (!res.ok) return null;
  const data = (await res.json()) as { body?: string };
  return { body: data.body ?? "" };
}

function verifyAuthority(
  pr: { headSha: string; baseSha: string },
  headSha: string,
  baseSha: string,
): boolean {
  return pr.headSha === headSha && pr.baseSha === baseSha;
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const prNumberRaw = process.env.PR_NUMBER;
  const headSha = process.env.HEAD_SHA;
  const baseSha = process.env.BASE_SHA;
  const cwd = process.cwd();

  if (!token || !repo || prNumberRaw === undefined || prNumberRaw === "") {
    log("API_FAILED");
    process.exit(0);
  }

  const prNumber = parseInt(prNumberRaw, 10);
  if (!Number.isFinite(prNumber) || prNumber < 1) {
    log("API_FAILED");
    process.exit(0);
  }

  if (!headSha || !baseSha) {
    log("API_FAILED");
    process.exit(0);
  }

  const report = readReport(cwd);
  const runId = report?.run?.id ?? "";
  const decisionLevel = (report?.decision?.level ?? "review") as DecisionLevel;
  const reason = report?.decision?.reason ?? "No report.";
  const shortHead = shortSha(headSha);
  const shortBase = shortSha(baseSha);

  const v5Input: ArcsightV5Input = {
    repo,
    prNumber,
    headSha,
    baseSha,
    runId,
    decisionLevel: decisionLevel === "allow" || decisionLevel === "block" || decisionLevel === "warn" ? decisionLevel : "warn",
    reason,
    shortHead,
    shortBase,
  };
  const newBody = buildArcsightV5Comment(v5Input);
  const newMeta = parseArcsightV5Meta(newBody);
  if (!newMeta) {
    log("API_FAILED");
    process.exit(0);
  }

  let pr = await getPr(token, repo, prNumber);
  if (!pr) {
    log("API_FAILED");
    process.exit(0);
  }
  if (pr.headSha !== headSha) {
    log("SKIPPED_NOT_HEAD");
    process.exit(0);
  }
  if (pr.baseSha !== baseSha) {
    log("SKIPPED_NOT_BASE");
    process.exit(0);
  }

  let comments = await listComments(token, repo, prNumber);
  let attempts = 0;
  while (attempts < 3) {
    const next = await listComments(token, repo, prNumber);
    if (next.length === comments.length) break;
    comments = next;
    attempts++;
  }

  let arcsightComments = comments.filter((c) => isArcsightComment(c.body));

  if (arcsightComments.length > 1) {
    const byDate = [...arcsightComments].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const keepId = byDate[0].id;
    for (let i = 1; i < byDate.length; i++) {
      await deleteComment(token, repo, byDate[i].id);
    }
    comments = await listComments(token, repo, prNumber);
    arcsightComments = comments.filter((c) => isArcsightComment(c.body));
    const single = arcsightComments.find((c) => c.id === keepId) ?? arcsightComments[0];
    if (!single) {
      pr = await getPr(token, repo, prNumber);
      if (!pr || pr.headSha !== headSha || pr.baseSha !== baseSha) {
        log(pr?.headSha !== headSha ? "SKIPPED_NOT_HEAD" : "SKIPPED_NOT_BASE");
        process.exit(0);
      }
      await createComment(token, repo, prNumber, newBody);
      log("CREATED");
      process.exit(0);
    }
    arcsightComments = [single];
  }

  if (arcsightComments.length === 0) {
    pr = await getPr(token, repo, prNumber);
    if (!pr || pr.headSha !== headSha || pr.baseSha !== baseSha) {
      log(pr?.headSha !== headSha ? "SKIPPED_NOT_HEAD" : "SKIPPED_NOT_BASE");
      process.exit(0);
    }
    const ok = await createComment(token, repo, prNumber, newBody);
    if (ok) log("CREATED");
    else log("API_FAILED");
    process.exit(0);
  }

  const existing = arcsightComments[0]!;

  const parsed = parseArcsightV5Meta(existing.body);
  if (!parsed) {
    pr = await getPr(token, repo, prNumber);
    if (!pr || pr.headSha !== headSha || pr.baseSha !== baseSha) {
      log(pr?.headSha !== headSha ? "SKIPPED_NOT_HEAD" : "SKIPPED_NOT_BASE");
      process.exit(0);
    }
    await updateComment(token, repo, existing.id, newBody);
    log("UPDATED_REPAIR");
    process.exit(0);
  }

  if (
    parsed.headSha === headSha &&
    parsed.baseSha === baseSha &&
    parsed.hash === newMeta.hash
  ) {
    log("UNCHANGED");
    process.exit(0);
  }

  pr = await getPr(token, repo, prNumber);
  if (!pr || pr.headSha !== headSha || pr.baseSha !== baseSha) {
    log(pr?.headSha !== headSha ? "SKIPPED_NOT_HEAD" : "SKIPPED_NOT_BASE");
    process.exit(0);
  }

  const updated = await updateComment(token, repo, existing.id, newBody);
  if (!updated) {
    const refetched = await getComment(token, repo, existing.id);
    if (!refetched) {
      await createComment(token, repo, prNumber, newBody);
      log("CREATED_AFTER_DELETE");
    } else {
      log("API_FAILED");
    }
    process.exit(0);
  }

  const refetched = await getComment(token, repo, existing.id);
  if (!refetched || refetched.body !== newBody) {
    log("LOST_RACE");
    process.exit(0);
  }
  log("UPDATED");
  process.exit(0);
}

main().catch(() => {
  log("API_FAILED");
  process.exit(0);
});
