/**
 * Gate comment upsert: read report, build body, post or update PR comment.
 * Used by scripts/arcsight-pr-comment.ts and by CLI "anchr comment".
 * No tsx required when invoked via CLI (runs in-process).
 */

import { readFileSync } from "fs";
import { join } from "path";
import { buildGateComment, type GateReport, type GateMode } from "./gateComment.js";
import { parseArcsightV5Meta, isArcsightComment } from "./v5.js";

const FIX_SUGGESTIONS_PATH = "artifacts/anchr-fix-suggestions.json";
const REPAIR_PATH = "artifacts/anchr-repair.json";
/** Max suggestions surfaced in comment; overflow line when more. Preserve artifact order (no re-sort). */
const MAX_SUGGESTION_BULLETS = 5;
const MAX_SUGGESTION_SOURCE = 20;

export type LogState =
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

function readReport(
  cwd: string,
  reportPath: string,
): GateReport & { run?: { id?: string }; headSha?: string; baseSha?: string } | null {
  try {
    const raw = readFileSync(join(cwd, reportPath), "utf8");
    const data = JSON.parse(raw) as unknown;
    return data && typeof data === "object"
      ? (data as GateReport & { run?: { id?: string }; headSha?: string; baseSha?: string })
      : null;
  } catch {
    return null;
  }
}

/** Read suggestion strings from artifacts. Priority: fix-suggestions then repair. Preserve array order; no re-sort. */
function readSuggestionBullets(cwd: string): string[] | undefined {
  try {
    const raw = readFileSync(join(cwd, FIX_SUGGESTIONS_PATH), "utf8");
    const data = JSON.parse(raw) as { suggestions?: { title?: string; steps?: string[] }[] };
    const suggestions = data?.suggestions;
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      const bullets = suggestions
        .map((s) => (typeof s.title === "string" && s.title ? s.title : Array.isArray(s.steps) && s.steps[0] ? String(s.steps[0]) : ""))
        .filter((t) => t.length > 0)
        .slice(0, MAX_SUGGESTION_SOURCE);
      if (bullets.length > 0) return bullets;
    }
  } catch {
    // skip
  }
  try {
    const raw = readFileSync(join(cwd, REPAIR_PATH), "utf8");
    const data = JSON.parse(raw) as { actions?: { requiredChange?: string }[] };
    const actions = data?.actions;
    if (Array.isArray(actions) && actions.length > 0) {
      const bullets = actions
        .map((a) => (typeof a.requiredChange === "string" && a.requiredChange ? a.requiredChange : ""))
        .filter((t) => t.length > 0)
        .slice(0, MAX_SUGGESTION_SOURCE);
      if (bullets.length > 0) return bullets;
    }
  } catch {
    // skip
  }
  return undefined;
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
      out.push({ id: c.id, body: c.body ?? "", created_at: c.created_at ?? "" });
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
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) },
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
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) },
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

/**
 * Run gate comment upsert. Uses cwd for artifact paths and env for GitHub token/repo/PR.
 * Never throws; logs state and returns. Caller should process.exit(0).
 */
export async function runGateComment(
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  const prNumberRaw = env.PR_NUMBER;
  const headSha = env.HEAD_SHA;
  const baseSha = env.BASE_SHA;
  const reportPath = env.REPORT_PATH ?? "artifacts/anchr-report.json";

  if (!token || !repo || prNumberRaw === undefined || prNumberRaw === "") {
    log("API_FAILED");
    return;
  }

  const prNumber = parseInt(prNumberRaw, 10);
  if (!Number.isFinite(prNumber) || prNumber < 1) {
    log("API_FAILED");
    return;
  }

  if (!headSha || !baseSha) {
    log("API_FAILED");
    return;
  }

  const report = readReport(cwd, reportPath);
  const runId = report?.run?.id ?? "";
  const decisionLevel = (report?.decision?.level ?? "warn") as "allow" | "block" | "warn";
  const mode: GateMode = env.ANCHR_GATE_MODE === "STRICT" ? "STRICT" : "ADVISORY";
  const suggestionBullets = readSuggestionBullets(cwd);

  const newBody = buildGateComment(
    report ?? { status: "INCOMPLETE", decision: { level: "warn" } },
    mode,
    {
      repo,
      prNumber,
      headSha,
      baseSha,
      runId,
      decisionLevel: decisionLevel === "allow" || decisionLevel === "block" || decisionLevel === "warn" ? decisionLevel : "warn",
    },
    suggestionBullets,
  );
  const newMeta = parseArcsightV5Meta(newBody);
  if (!newMeta) {
    log("API_FAILED");
    return;
  }

  let pr = await getPr(token, repo, prNumber);
  if (!pr) {
    log("API_FAILED");
    return;
  }
  if (pr.headSha !== headSha) {
    log("SKIPPED_NOT_HEAD");
    return;
  }
  if (pr.baseSha !== baseSha) {
    log("SKIPPED_NOT_BASE");
    return;
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
        return;
      }
      await createComment(token, repo, prNumber, newBody);
      log("CREATED");
      return;
    }
    arcsightComments = [single];
  }

  if (arcsightComments.length === 0) {
    pr = await getPr(token, repo, prNumber);
    if (!pr || pr.headSha !== headSha || pr.baseSha !== baseSha) {
      log(pr?.headSha !== headSha ? "SKIPPED_NOT_HEAD" : "SKIPPED_NOT_BASE");
      return;
    }
    const ok = await createComment(token, repo, prNumber, newBody);
    if (ok) log("CREATED");
    else log("API_FAILED");
    return;
  }

  const existing = arcsightComments[0]!;
  const parsed = parseArcsightV5Meta(existing.body);
  if (!parsed) {
    pr = await getPr(token, repo, prNumber);
    if (!pr || pr.headSha !== headSha || pr.baseSha !== baseSha) {
      log(pr?.headSha !== headSha ? "SKIPPED_NOT_HEAD" : "SKIPPED_NOT_BASE");
      return;
    }
    await updateComment(token, repo, existing.id, newBody);
    log("UPDATED_REPAIR");
    return;
  }

  if (parsed.headSha === headSha && parsed.baseSha === baseSha && parsed.hash === newMeta.hash) {
    log("UNCHANGED");
    return;
  }

  pr = await getPr(token, repo, prNumber);
  if (!pr || pr.headSha !== headSha || pr.baseSha !== baseSha) {
    log(pr?.headSha !== headSha ? "SKIPPED_NOT_HEAD" : "SKIPPED_NOT_BASE");
    return;
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
    return;
  }

  const refetched = await getComment(token, repo, existing.id);
  if (!refetched || refetched.body !== newBody) {
    log("LOST_RACE");
    return;
  }
  log("UPDATED");
}
