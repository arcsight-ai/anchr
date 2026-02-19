/**
 * ANCHR PR Signal (Human Reviewer Final v5) — Merge-Proximity Intelligence.
 * Runs on PRs; posts a single human-like risk note only when meaningful.
 * Stage-based thresholds; human discussion suppression; cooldown. Never blocks.
 */

import { execSync, spawnSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { parseMinimalCut } from "../src/repair/parseReport.js";
import { renderFailurePrediction } from "../src/prediction/render-failure.js";
import type { ViolationKind } from "../src/structural/types.js";

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
];
const REASONING_MAP: Record<string, string> = {
  retry: "retry behavior changed",
  cache: "depends on cache timing",
  async: "crosses async boundary",
  "optional/null": "nullable invariant relied upon",
  ordering: "execution order now matters",
  state: "state updated earlier than before",
  branch: "branch behavior changed",
  error: "failure path altered",
  data: "data origin changed",
};
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

type PRStage = "EARLY" | "ACTIVE_REVIEW" | "PRE_MERGE";

interface PredictionPayload {
  risk: true;
  mode: "prediction";
  title: string;
  prediction: string;
  confidence: "low" | "medium" | "high";
  trigger: string;
  evidence: string[];
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

async function getPRStage(
  token: string,
  repo: string,
  prNumber: number,
  createdAt: string,
): Promise<PRStage> {
  const pr = await gh<{ mergeable: boolean | null; commits?: number }>(token, repo, `/pulls/${prNumber}`);
  const commitsRes = await gh<unknown[]>(token, repo, `/pulls/${prNumber}/commits?per_page=100`);
  const commitCount = Array.isArray(commitsRes) ? commitsRes.length : 0;
  const comments = await ghComments(token, repo, prNumber);
  const humanComments = comments.filter((c) => !isBotComment(c));
  const reviews = await gh<{ state: string }[]>(token, repo, `/pulls/${prNumber}/reviews`);
  const approved = Array.isArray(reviews) && reviews.some((r) => r.state === "APPROVED");

  const created = new Date(createdAt).getTime();
  const ageMs = Date.now() - created;
  const ageMinutes = ageMs / (60 * 1000);

  if (ageMinutes < 20 || commitCount <= 2) return "EARLY";
  if (approved || pr.mergeable === true) return "PRE_MERGE";
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

  const trigger = pred.when_it_happens || pred.runtime_symptom || "";
  return {
    risk: true,
    mode: "prediction",
    title: "",
    prediction: pred.short_sentence,
    confidence: pred.confidence,
    trigger,
    evidence: pred.evidence,
  };
}

function passesStageThreshold(payload: PredictionPayload, stage: PRStage): boolean {
  if (payload.confidence === "low") return false;
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

function intentFromSeed(seed: number): string {
  const intents = [
    "Worth double-checking before merge.",
    "Might be worth a quick look.",
    "Heads-up before merging.",
    "Might want to glance at this.",
    "Something to keep in mind.",
  ];
  return intents[Math.abs(seed) % intents.length] ?? intents[0]!;
}

function reasoningLine(trigger: string): string {
  const lower = trigger.toLowerCase();
  for (const [key, line] of Object.entries(REASONING_MAP)) {
    if (lower.includes(key)) return `Why this stood out: ${line}`;
  }
  return "";
}

async function findExistingComment(
  token: string,
  repo: string,
  issueNumber: number,
): Promise<{ id: number; body: string; created_at: string } | null> {
  const list = await gh<{ id: number; body: string; created_at: string; user: { type?: string } }[]>(
    token,
    repo,
    `/issues/${issueNumber}/comments`,
  );
  const arr = Array.isArray(list) ? list : [];
  const anchr = arr.find((c) => (c.body ?? "").includes(ANCHR_MARKER));
  return anchr ? { id: anchr.id, body: anchr.body, created_at: anchr.created_at } : null;
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

  const stage = await getPRStage(token, repo, pr.number, pr.created_at ?? new Date().toISOString());
  runAudit(cwd, base, head);

  const reportPath = join(cwd, "artifacts", "anchr-report.json");
  if (!existsSync(reportPath)) {
    process.exit(0);
  }

  const payload = reportToPredictionPayload(reportPath);
  if (!payload || !passesStageThreshold(payload, stage)) {
    process.exit(0);
  }

  const comments = await ghComments(token, repo, pr.number);
  const humanComments = comments.filter((c) => !isBotComment(c));
  if (humanMentionedTrigger(humanComments, payload.trigger)) {
    process.exit(0);
  }

  const existing = await findExistingComment(token, repo, pr.number);
  const now = Date.now();
  if (existing?.created_at) {
    const created = new Date(existing.created_at).getTime();
    if (now - created < COOLDOWN_MS) {
      process.exit(0);
    }
  }
  const newEvidenceHash = evidenceHash(payload.evidence);
  if (existing?.body && existing.body.includes(newEvidenceHash)) {
    process.exit(0);
  }

  const seedInput = `${pr.number}:${pr.title ?? ""}:${payload.evidence[0] ?? ""}`;
  const seed = createHash("sha256").update(seedInput).digest("hex");
  const seedNum = parseInt(seed.slice(0, 8), 16);
  const intent = intentFromSeed(seedNum);
  const reasoning = reasoningLine(payload.trigger);
  const lines = [
    ANCHR_MARKER,
    "",
    payload.prediction,
    "",
    intent,
    "",
  ];
  if (reasoning && reasoning.length < 80) {
    lines.push(reasoning);
  }
  lines.push("");
  lines.push(`_evidence: ${newEvidenceHash}_`);
  const body = lines.join("\n");

  if (existing) {
    await updateComment(token, repo, existing.id, body);
  } else {
    await createComment(token, repo, pr.number, body);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
