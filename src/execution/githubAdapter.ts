/**
 * GitHub Comment Execution Adapter (Prompt 5 — Convergence-Safe).
 * Executes CommentAction[]; only module that calls GitHub. Never throws; eventually consistent.
 */

import type { CommentAction } from "../reconciliation/types.js";
import type { ExecutionContext } from "./types.js";

const USER_AGENT = "anchr/1.0";
const REQUEST_TIMEOUT_MS = 15000;
const VERIFY_DELAY_MS = 1000;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];
const MAX_ATTEMPTS = 5;
const ARCSIGHT_MARKER = "<!-- arcsight:";

export function normalizeBody(body: string): string {
  if (typeof body !== "string") return "";
  let out = body
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd();
  if (out.length > 0 && !out.endsWith("\n")) out += "\n";
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms: number): number {
  const spread = Math.floor(ms * 0.2);
  return ms + Math.floor(Math.random() * (2 * spread + 1)) - spread;
}

function hasCreate(actions: CommentAction[]): boolean {
  return actions.some((a) => a.type === "create");
}

/**
 * Pre-filter: dedupe, max one delete, if create exists ignore deletes, preserve order.
 */
export function preFilterActions(actions: CommentAction[]): CommentAction[] {
  const out: CommentAction[] = [];
  const seenIds = new Set<number>();
  const hasCreateAction = hasCreate(actions);
  let deleteCount = 0;

  for (const a of actions) {
    if (a.type === "noop") continue;
    if (a.type === "create") {
      if (out.some((x) => x.type === "create")) continue;
      out.push(a);
      continue;
    }
    if (a.type === "delete") {
      if (hasCreateAction) continue;
      if (deleteCount >= 1) continue;
      deleteCount++;
      out.push(a);
      continue;
    }
    if (a.type === "update" || a.type === "replace") {
      if (seenIds.has(a.id)) continue;
      seenIds.add(a.id);
      out.push(a);
    }
  }
  return out;
}

interface FetchOptions {
  method?: string;
  body?: string;
  signal?: AbortSignal;
}

async function fetchWithRetry(
  url: string,
  token: string,
  opts: FetchOptions,
): Promise<{ ok: boolean; status: number; data: unknown; headers: Headers }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const signal = opts.signal ?? controller.signal;
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: {
          Accept: "application/vnd.github.v3+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": USER_AGENT,
          ...(opts.body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: opts.body,
        signal,
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        if (attempt < MAX_ATTEMPTS - 1) {
          if (attempt > 0) console.log("ANCHR retry:" + attempt);
          await sleep(jitter(RETRY_DELAYS_MS[attempt] ?? 16000));
          continue;
        }
        return { ok: false, status: res.status, data: null, headers: res.headers };
      }

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.status === 403) {
        const text = typeof data === "object" && data && "message" in (data as object)
          ? String((data as { message?: string }).message)
          : "";
        if (text.includes("secondary rate limit")) {
          if (attempt === 0) {
            console.log("ANCHR ratelimit");
            await sleep(60000);
            continue;
          }
        }
        const remaining = res.headers.get("x-ratelimit-remaining");
        if (remaining === "0") {
          const reset = res.headers.get("x-ratelimit-reset");
          if (reset) {
            const wait = Math.max(0, parseInt(reset, 10) * 1000 - Date.now());
            if (wait > 0 && attempt === 0) {
              console.log("ANCHR ratelimit");
              await sleep(Math.min(wait, 60000));
              continue;
            }
          }
        }
        if (!text.includes("rate limit")) {
          console.log("ANCHR permission-denied");
          return { ok: true, status: 200, data: {}, headers: res.headers };
        }
      }

      if (
        res.status === 429 ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504
      ) {
        if (attempt < MAX_ATTEMPTS - 1) {
          console.log("ANCHR retry:" + attempt);
          await sleep(jitter(RETRY_DELAYS_MS[attempt] ?? 16000));
          continue;
        }
      }

      return { ok: res.ok, status: res.status, data, headers: res.headers };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < MAX_ATTEMPTS - 1) {
        console.log("ANCHR retry:" + attempt);
        await sleep(jitter(RETRY_DELAYS_MS[attempt] ?? 16000));
      }
    }
  }
  return {
    ok: false,
    status: 0,
    data: lastError?.message ?? "unknown",
    headers: new Headers(),
  };
}

function apiUrl(ctx: ExecutionContext, path: string): string {
  return `https://api.github.com/repos/${ctx.owner}/${ctx.repo}${path}`;
}

async function getComment(
  ctx: ExecutionContext,
  commentId: number,
): Promise<{ body: string } | null> {
  const res = await fetchWithRetry(
    apiUrl(ctx, `/issues/comments/${commentId}`),
    ctx.githubToken,
    {},
  );
  if (!res.ok || !res.data || typeof (res.data as { body?: string }).body !== "string") {
    return null;
  }
  return { body: (res.data as { body: string }).body };
}

async function createComment(
  ctx: ExecutionContext,
  body: string,
): Promise<{ id: number } | null> {
  const res = await fetchWithRetry(
    apiUrl(ctx, `/issues/${ctx.issueNumber}/comments`),
    ctx.githubToken,
    { method: "POST", body: JSON.stringify({ body: normalizeBody(body) }) },
  );
  if (res.status === 422) return null;
  if (!res.ok || !res.data) return null;
  const id = (res.data as { id?: number }).id;
  return typeof id === "number" ? { id } : null;
}

async function updateComment(
  ctx: ExecutionContext,
  commentId: number,
  body: string,
): Promise<boolean> {
  const res = await fetchWithRetry(
    apiUrl(ctx, `/issues/comments/${commentId}`),
    ctx.githubToken,
    {
      method: "PATCH",
      body: JSON.stringify({ body: normalizeBody(body) }),
    },
  );
  return res.ok;
}

async function deleteComment(
  ctx: ExecutionContext,
  commentId: number,
): Promise<void> {
  const res = await fetchWithRetry(
    apiUrl(ctx, `/issues/comments/${commentId}`),
    ctx.githubToken,
    { method: "DELETE" },
  );
  if (res.status === 404) return;
}

async function listComments(ctx: ExecutionContext): Promise<{ id: number; body: string; created_at: string }[]> {
  const res = await fetchWithRetry(
    apiUrl(ctx, `/issues/${ctx.issueNumber}/comments?per_page=100`),
    ctx.githubToken,
    {},
  );
  if (!res.ok || !Array.isArray(res.data)) return [];
  return (res.data as { id: number; body?: string; created_at?: string }[])
    .filter((c) => c && typeof c.id === "number")
    .map((c) => ({
      id: c.id,
      body: typeof c.body === "string" ? c.body : "",
      created_at: typeof c.created_at === "string" ? c.created_at : "",
    }));
}

function findNewestArcSightComment(
  comments: { id: number; body: string; created_at: string }[],
): { id: number } | null {
  const withMarker = comments
    .filter((c) => c.body.includes(ARCSIGHT_MARKER))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const first = withMarker[0];
  return first ? { id: first.id } : null;
}

async function postWriteVerification(
  ctx: ExecutionContext,
  commentId: number,
  expectedBody: string,
): Promise<void> {
  await sleep(VERIFY_DELAY_MS);
  const got = await getComment(ctx, commentId);
  const expected = normalizeBody(expectedBody);
  const actual = got ? normalizeBody(got.body) : "";
  if (actual === expected) return;
  console.log("ANCHR verify-mismatch");
  for (let r = 0; r < 2; r++) {
    await sleep(VERIFY_DELAY_MS);
    const ok = await updateComment(ctx, commentId, expectedBody);
    if (!ok) continue;
    await sleep(VERIFY_DELAY_MS);
    const refetch = await getComment(ctx, commentId);
    const refetchNorm = refetch ? normalizeBody(refetch.body) : "";
    if (refetchNorm === expected) return;
  }
}

/**
 * Execute actions sequentially. Never throws. Post-write verification prevents cache loops.
 */
export async function executeCommentActions(
  actions: CommentAction[],
  ctx: ExecutionContext,
): Promise<void> {
  const filtered = preFilterActions(actions);
  const toRun = filtered.filter((a) => a.type !== "noop");
  if (toRun.length === 0) return;

  for (const action of toRun) {
    if (action.type === "create") {
      console.log("ANCHR action:create");
      const created = await createComment(ctx, action.body);
      if (created) {
        await postWriteVerification(ctx, created.id, action.body);
      } else {
        const list = await listComments(ctx);
        const existing = findNewestArcSightComment(list);
        if (existing) {
          console.log("ANCHR action:update:" + existing.id);
          await updateComment(ctx, existing.id, action.body);
          await postWriteVerification(ctx, existing.id, action.body);
        }
      }
      continue;
    }

    if (action.type === "update") {
      const current = await getComment(ctx, action.id);
      if (current && normalizeBody(current.body) === normalizeBody(action.body)) {
        continue;
      }
      console.log("ANCHR action:update:" + action.id);
      const ok = await updateComment(ctx, action.id, action.body);
      if (ok) await postWriteVerification(ctx, action.id, action.body);
      continue;
    }

    if (action.type === "replace") {
      console.log("ANCHR action:replace:" + action.id);
      const existing = await getComment(ctx, action.id);
      if (!existing) {
        await createComment(ctx, action.body);
      } else {
        const ok = await updateComment(ctx, action.id, action.body);
        if (ok) await postWriteVerification(ctx, action.id, action.body);
      }
      continue;
    }

    if (action.type === "delete") {
      console.log("ANCHR action:delete:" + action.id);
      await deleteComment(ctx, action.id);
    }
  }
}
