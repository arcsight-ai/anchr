/**
 * ANCHR PR Signal (vFinal++ Social Reliability Lock).
 * One human-style risk note per PR. Drift protection. Human priority. Never blocks.
 */

import { execSync, spawnSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { parseMinimalCut } from "../src/repair/parseReport.js";
import { renderFailurePrediction } from "../src/prediction/render-failure.js";
import type { ViolationKind } from "../src/structural/types.js";
import type { FailureKind } from "../src/prediction/render-failure.js";

const ANCHR_MARKER = "<!-- anchr:prediction -->";
const NOISE_PATTERNS = [
  /\.md$/i,
  /\.json$/i,
  /\.yml$/i,
  /\.yaml$/i,
  /\.lock$/i,
  /^docs\//i,
  /README/i,
  /^test\//i,
  /^tests\//i,
  /\/tests?\//i,
];
const TRIGGER_KEYWORDS = [
  "race",
  "retry",
  "async",
  "ordering",
  "cache",
  "timeout",
  "null",
  "state",
  "edge",
  "fallback",
  "error",
  "invariant",
  "concurrency",
];
const ADVICE_PHRASES = [
  "consider adding",
  "you should",
  "maybe handle",
  "instead do",
  "should",
  "consider",
  "maybe",
  "instead",
  "you can",
  " add ",
  "ensure",
  "handle by",
];
const ALLOWED_FAILURE_KINDS: FailureKind[] = [
  "timeout_cascade",
  "duplicate_effect",
  "stale_read",
  "partial_initialization",
  "silent_corruption",
  "version_mismatch_crash",
];
const MAX_SENTENCE_CHARS = 110;

type PRStage = "EARLY" | "ACTIVE_REVIEW" | "PRE_MERGE";

interface PredictionPayload {
  risk: true;
  mode: "prediction";
  title: string;
  prediction: string;
  confidence: "low" | "medium" | "high";
  trigger: string;
  evidence: string[];
  impact: "low" | "medium" | "high";
  novelty: "low" | "medium" | "high";
  check: string;
  runtime_symptom: string;
  failure_kind: FailureKind;
}

function readEvent(eventPath: string): {
  pull_request?: {
    number: number;
    title?: string;
    draft?: boolean;
    created_at?: string;
    user?: { type?: string };
    base?: { sha?: string };
    head?: { sha?: string };
  };
} | null {
  try {
    return JSON.parse(readFileSync(eventPath, "utf8")) as ReturnType<typeof readEvent>;
  } catch {
    return null;
  }
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

async function gh<T>(token: string, repo: string, path: string): Promise<T> {
  const [owner, repoName] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${repoName}${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`GH API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function ghComments(token: string, repo: string, issueNumber: number): Promise<{ body: string; user: { type?: string } }[]> {
  const list = await gh<{ body: string; user: { type?: string } }[]>(token, repo, `/issues/${issueNumber}/comments`);
  return Array.isArray(list) ? list : [];
}

function isBotComment(c: { user?: { type?: string }; body?: string }): boolean {
  if (c.user?.type === "Bot") return true;
  const b = (c.body ?? "").toLowerCase();
  return b.includes("[bot]") || b.includes("<!-- bot -->");
}

function allFilesNoise(files: string[]): boolean {
  if (files.length === 0) return true;
  return files.every((f) => NOISE_PATTERNS.some((re) => re.test(f)));
}

function getChangedFiles(cwd: string, base: string, head: string): string[] {
  try {
    const out = execSync(`git diff --name-only ${base}..${head}`, { encoding: "utf8", cwd });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function computeDiffHash(cwd: string, base: string, head: string): string {
  try {
    const out = execSync(`git diff ${base}..${head}`, { encoding: "utf8", cwd, maxBuffer: 2 * 1024 * 1024 });
    return createHash("sha256").update(out).digest("hex").slice(0, 16);
  } catch {
    return "";
  }
}

async function getPRStage(
  token: string,
  repo: string,
  prNumber: number,
  createdAt: string,
): Promise<PRStage> {
  const pr = await gh<{ mergeable: boolean | null }>(token, repo, `/pulls/${prNumber}`);
  const commitsRes = await gh<unknown[]>(token, repo, `/pulls/${prNumber}/commits?per_page=100`);
  const commitCount = Array.isArray(commitsRes) ? commitsRes.length : 0;
  const comments = await ghComments(token, repo, prNumber);
  const humanComments = comments.filter((c) => !isBotComment(c));
  const reviews = await gh<{ state: string }[]>(token, repo, `/pulls/${prNumber}/reviews`);
  const approved = Array.isArray(reviews) && reviews.some((r) => r.state === "APPROVED");

  const created = new Date(createdAt).getTime();
  const ageMs = Date.now() - created;
  const ageMinutes = ageMs / (60 * 1000);

  if (approved || pr.mergeable === true) return "PRE_MERGE";
  if (ageMinutes < 20 || commitCount <= 2) return "EARLY";
  if (humanComments.length > 0 || commitCount > 2) return "ACTIVE_REVIEW";
  return "ACTIVE_REVIEW";
}

function runAudit(cwd: string, base: string, head: string): void {
  const reportDir = join(cwd, "artifacts");
  mkdirSync(reportDir, { recursive: true });
  const env = {
    ...process.env,
    GITHUB_BASE_SHA: base,
    GITHUB_HEAD_SHA: head,
    HEAD_SHA: head,
    BASE_SHA: base,
    ANCHR_REPORT_PATH: join(reportDir, "anchr-report.json"),
  };
  const r = spawnSync("npx", ["tsx", "scripts/cli.ts", "audit", "--all", "--base", base, "--head", head], {
    encoding: "utf8",
    cwd,
    env,
    timeout: 120000,
  });
  if (r.status !== 0 && r.status !== null) {
    return;
  }
}

const IMPACT_HIGH: FailureKind[] = [
  "timeout_cascade",
  "duplicate_effect",
  "stale_read",
  "partial_initialization",
  "silent_corruption",
  "version_mismatch_crash",
];
const IMPACT_MEDIUM: FailureKind[] = ["dropped_event"];

function impactFromFailureKind(kind: FailureKind): "low" | "medium" | "high" {
  if (IMPACT_HIGH.includes(kind)) return "high";
  if (IMPACT_MEDIUM.includes(kind)) return "medium";
  return "low";
}

function outputContainsAdvice(prediction: string, check: string): boolean {
  const combined = `${prediction} ${check}`.toLowerCase();
  return ADVICE_PHRASES.some((p) => combined.includes(p.trim()));
}

function reportToPredictionPayload(reportPath: string): PredictionPayload | null {
  const raw = readJson(reportPath);
  if (!raw || typeof raw !== "object") return null;
  const report = raw as {
    status?: string;
    proofs?: { source: string; target: string; rule: string }[];
    minimalCut?: string[];
  };
  if (report.status !== "BLOCKED") return null;
  const proofs = report.proofs;
  const minimalCut = report.minimalCut ?? [];
  if (!proofs?.length || minimalCut.length === 0) return null;

  const parsed = parseMinimalCut(minimalCut);
  const first = parsed[0];
  const proof = proofs[0];
  if (!first || !proof) return null;

  const cause = proof.rule as ViolationKind;
  const violation = {
    package: first.package,
    path: first.path,
    cause,
    specifier: first.specifier,
    proof: { type: "import_path" as const, source: proof.source, target: proof.target, rule: cause },
  };

  const pred = renderFailurePrediction(violation);
  if (pred.failure_kind === "unknown" || pred.confidence === "low") return null;

  const kind = pred.failure_kind as FailureKind;
  if (!ALLOWED_FAILURE_KINDS.includes(kind)) return null;

  const trigger = pred.when_it_happens || pred.runtime_symptom || "";
  const check = pred.when_it_happens || "";
  if (outputContainsAdvice(pred.short_sentence, check)) return null;

  const impact = impactFromFailureKind(kind);
  return {
    risk: true,
    mode: "prediction",
    title: "",
    prediction: pred.short_sentence,
    confidence: pred.confidence,
    trigger,
    evidence: pred.evidence,
    impact,
    novelty: "high",
    check,
    runtime_symptom: pred.runtime_symptom || "fail",
    failure_kind: kind,
  };
}

function passesStageThreshold(payload: PredictionPayload, stage: PRStage): boolean {
  if (payload.confidence === "low") return false;
  if (payload.impact !== "high" || payload.novelty !== "high") return false;
  const n = payload.evidence.length;
  switch (stage) {
    case "EARLY":
      return payload.confidence === "high" && n >= 3;
    case "ACTIVE_REVIEW":
      return (payload.confidence === "high" || payload.confidence === "medium") && n >= 2;
    case "PRE_MERGE":
      return (payload.confidence === "high" || payload.confidence === "medium") && n >= 1;
    default:
      return false;
  }
}

function humanMentionedTrigger(comments: { body: string }[], trigger: string): boolean {
  const lower = trigger.toLowerCase();
  const hit = TRIGGER_KEYWORDS.find((k) => lower.includes(k));
  if (!hit) return false;
  for (const c of comments) {
    const body = (c.body ?? "").toLowerCase();
    if (body.includes(hit)) return true;
  }
  return false;
}

interface ParsedAnchrComment {
  evidenceHash: string | null;
  commitsUnchanged: number;
  silenced: boolean;
  diffHash: string | null;
}

function parseExistingComment(body: string): ParsedAnchrComment {
  let evidenceHash: string | null = null;
  let commitsUnchanged = 0;
  let silenced = false;
  let diffHash: string | null = null;
  const evidenceMatch = body.match(/_evidence:\s*([a-f0-9]+)_/);
  if (evidenceMatch) evidenceHash = evidenceMatch[1] ?? null;
  const unchangedMatch = body.match(/_anchr_commits_unchanged:\s*(\d+)_/);
  if (unchangedMatch) commitsUnchanged = parseInt(unchangedMatch[1] ?? "0", 10) || 0;
  if (body.includes("_anchr_silenced: true_")) silenced = true;
  const diffMatch = body.match(/_anchr_diff_hash:\s*([a-f0-9]+)_/);
  if (diffMatch) diffHash = diffMatch[1] ?? null;
  return { evidenceHash, commitsUnchanged, silenced, diffHash };
}

function renderCommentBody(
  payload: PredictionPayload,
  evidenceHash: string,
  commitsUnchanged: number,
  silenced: boolean,
  diffHash: string,
): string {
  const outcome = payload.runtime_symptom ? payload.runtime_symptom : "fail";
  let sentence = `If ${payload.trigger}, this will ${outcome}.`;
  if (sentence.length > MAX_SENTENCE_CHARS) {
    sentence = sentence.slice(0, MAX_SENTENCE_CHARS - 1).replace(/\s+[^\s]*$/, "") + ".";
  }
  const lines = [
    ANCHR_MARKER,
    "",
    sentence,
    "",
    `_evidence: ${evidenceHash}_`,
    `_anchr_commits_unchanged: ${commitsUnchanged}_`,
    `_anchr_silenced: ${silenced}_`,
    `_anchr_diff_hash: ${diffHash}_`,
  ];
  return lines.join("\n");
}

async function findExistingComment(
  token: string,
  repo: string,
  issueNumber: number,
): Promise<{ id: number; body: string; created_at: string; updated_at: string } | null> {
  const list = await gh<{ id: number; body: string; created_at: string; updated_at?: string; user: { type?: string } }[]>(
    token,
    repo,
    `/issues/${issueNumber}/comments`,
  );
  const arr = Array.isArray(list) ? list : [];
  const anchr = arr.find((c) => (c.body ?? "").includes(ANCHR_MARKER));
  return anchr
    ? { id: anchr.id, body: anchr.body, created_at: anchr.created_at, updated_at: anchr.updated_at ?? anchr.created_at }
    : null;
}

async function deleteComment(token: string, repo: string, commentId: number): Promise<boolean> {
  const [owner, repoName] = repo.split("/");
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/issues/comments/${commentId}`,
    { method: "DELETE", headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${token}` } },
  );
  return res.ok;
}

async function humanRequestedChangesAfter(
  token: string,
  repo: string,
  prNumber: number,
  ourCommentUpdatedAt: string,
): Promise<boolean> {
  const reviews = await gh<{ state: string; submitted_at?: string; user?: { type?: string } }[]>(
    token,
    repo,
    `/pulls/${prNumber}/reviews`,
  );
  const ourTime = new Date(ourCommentUpdatedAt).getTime();
  for (const r of Array.isArray(reviews) ? reviews : []) {
    if (r.state !== "CHANGES_REQUESTED" || r.user?.type === "Bot") continue;
    const submitted = r.submitted_at ? new Date(r.submitted_at).getTime() : 0;
    if (submitted > ourTime) return true;
  }
  return false;
}

function evidenceHash(evidence: string[]): string {
  const sorted = [...evidence].sort((a, b) => a.localeCompare(b, "en"));
  return createHash("sha256").update(sorted.join("\n")).digest("hex").slice(0, 12);
}

async function createComment(token: string, repo: string, issueNumber: number, body: string): Promise<boolean> {
  const [owner, repoName] = repo.split("/");
  const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues/${issueNumber}/comments`, {
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
  const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/issues/comments/${commentId}`, {
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
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const cwd = process.cwd();
  const base = process.env.GITHUB_BASE_SHA ?? process.env.BASE_SHA;
  const head = process.env.GITHUB_HEAD_SHA ?? process.env.HEAD_SHA;

  if (!token || !repo || !eventPath || !base || !head) {
    process.exit(0);
  }
  if (process.env.ANCHR_DISABLED === "true") {
    process.exit(0);
  }
  const actor = (process.env.GITHUB_ACTOR ?? "").toLowerCase();
  if (actor === "dependabot" || actor === "dependabot[bot]" || actor === "github-actions" || actor === "github-actions[bot]") {
    process.exit(0);
  }

  const event = readEvent(eventPath);
  const pr = event?.pull_request;
  if (!pr?.number || pr.draft) {
    process.exit(0);
  }

  let labels: { name?: string }[] = (pr as { labels?: { name?: string }[] }).labels ?? [];
  if (labels.length === 0) {
    try {
      const prFull = await gh<{ labels?: { name?: string }[] }>(token, repo, `/pulls/${pr.number}`);
      labels = prFull?.labels ?? [];
    } catch {
      labels = [];
    }
  }
  if (labels.some((l) => l.name === "anchr-ignore")) {
    process.exit(0);
  }

  const files = getChangedFiles(cwd, base, head);
  if (allFilesNoise(files)) {
    process.exit(0);
  }

  const currentDiffHash = computeDiffHash(cwd, base, head);
  const stage = await getPRStage(token, repo, pr.number, pr.created_at ?? new Date().toISOString());
  runAudit(cwd, base, head);

  const reportPath = join(cwd, "artifacts", "anchr-report.json");
  if (!existsSync(reportPath)) {
    process.exit(0);
  }

  const payload = reportToPredictionPayload(reportPath);
  if (!payload) {
    process.exit(0);
  }

  const comments = await ghComments(token, repo, pr.number);
  const humanComments = comments.filter((c) => !isBotComment(c));
  payload.novelty = humanMentionedTrigger(humanComments, payload.trigger) ? "low" : "high";
  if (!passesStageThreshold(payload, stage)) {
    process.exit(0);
  }

  const existing = await findExistingComment(token, repo, pr.number);
  const newEvidenceHash = evidenceHash(payload.evidence);
  const parsed = existing?.body ? parseExistingComment(existing.body) : null;

  if (existing && parsed?.silenced) {
    process.exit(0);
  }

  if (existing && parsed?.diffHash && currentDiffHash && parsed.diffHash !== currentDiffHash) {
    await deleteComment(token, repo, existing.id);
    process.exit(0);
  }

  if (existing && parsed?.evidenceHash === newEvidenceHash) {
    const nextUnchanged = (parsed?.commitsUnchanged ?? 0) + 1;
    const nowSilenced = nextUnchanged >= 2;
    const body = renderCommentBody(payload, newEvidenceHash, nextUnchanged, nowSilenced, currentDiffHash);
    await updateComment(token, repo, existing.id, body);
    process.exit(0);
  }

  if (existing && (await humanRequestedChangesAfter(token, repo, pr.number, existing.updated_at))) {
    process.exit(0);
  }

  const body = renderCommentBody(payload, newEvidenceHash, 0, false, currentDiffHash);

  if (existing) {
    await updateComment(token, repo, existing.id, body);
  } else {
    await createComment(token, repo, pr.number, body);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
