/**
 * ANCHR Report Renderer — V1.2 Provenance Safe
 *
 * Converts story-summary.json into deterministic anchr-report.md.
 * Stable public protocol artifact. No redesign of semantics after release.
 *
 * Determinism: same input → byte-identical output. No time, timezone, locale,
 * filesystem order, OS differences, or randomness.
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const ANCHR_REPORT_V1 = "ANCHR_REPORT_V1";
const RENDERER_VERSION = 1;
const PROTOCOL_REVISION = "2026-01";
const ENGINE = "structural-story-v1";
const ANALYZER_NAME = "anchr";
const MIN_COMMITS_FOR_DATA = 50;
const MAX_REPAIRS_BEFORE_TRUNCATE = 20;
const FIRST_REPAIRS_SHOWN = 10;
const LAST_REPAIRS_SHOWN = 5;
const MAX_LINES = 120;

// --- Canonical vocabulary (immutable; never add synonyms or rename) ---
type State =
  | "STABLE"
  | "RECOVERING"
  | "UNSTABLE"
  | "INSUFFICIENT DATA"
  | "ANALYSIS FAILED";
type Confidence = "Low" | "Medium" | "High";
type Trend = "Improving" | "Flat" | "Degrading" | "Unknown";

interface TimelineRepair {
  summary?: string;
  at?: string;
  [key: string]: unknown;
}

interface StoryTimeline {
  first_instability?: string;
  worst_period?: string;
  repairs?: TimelineRepair[];
  current_state?: string;
}

export interface StorySummary {
  repo_slug?: string;
  repo_name?: string;
  commits?: number;
  state?: string;
  confidence?: string;
  trend?: string;
  analysis_hash?: string;
  share_summary?: string;
  narrative?: string;
  why_this_matters?: string[];
  timeline?: StoryTimeline;
  analyzer_version?: string;
  [key: string]: unknown;
}

function sha1Hex(input: string): string {
  return createHash("sha1").update(input, "utf8").digest("hex");
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function normalizeState(s: string | undefined): State {
  const v = (s ?? "").trim();
  if (
    v === "STABLE" ||
    v === "RECOVERING" ||
    v === "UNSTABLE" ||
    v === "INSUFFICIENT DATA" ||
    v === "ANALYSIS FAILED"
  )
    return v;
  return "ANALYSIS FAILED";
}

function normalizeConfidence(s: string | undefined): Confidence {
  const v = (s ?? "").trim();
  if (v === "Low" || v === "Medium" || v === "High") return v;
  return "Low";
}

function normalizeTrend(s: string | undefined): Trend {
  const v = (s ?? "").trim();
  if (v === "Improving" || v === "Flat" || v === "Degrading" || v === "Unknown")
    return v;
  return "Unknown";
}

function isValidSummary(summary: unknown): summary is StorySummary {
  return summary !== null && typeof summary === "object";
}

function resolveState(
  raw: StorySummary,
  commits: number,
  inputValid: boolean,
): { state: State; confidence: Confidence; trend: Trend } {
  if (!inputValid || !isValidSummary(raw)) {
    return {
      state: "ANALYSIS FAILED",
      confidence: "Low",
      trend: "Unknown",
    };
  }
  if (commits < MIN_COMMITS_FOR_DATA) {
    return {
      state: "INSUFFICIENT DATA",
      confidence: "Low",
      trend: "Unknown",
    };
  }
  return {
    state: normalizeState(raw.state),
    confidence: normalizeConfidence(raw.confidence),
    trend: normalizeTrend(raw.trend),
  };
}

function repoHash(repoSlug: string): string {
  return sha1Hex(repoSlug).slice(0, 10);
}

function semanticHash(
  repo: string,
  state: State,
  confidence: Confidence,
  trend: Trend,
  commits: number,
): string {
  const payload = [repo, state, confidence, trend, String(commits)].join("\n");
  return sha256Hex(payload).slice(0, 12);
}

function toolHash(
  analyzerVersion: string,
  engine: string,
  protocolRevision: string,
): string {
  return sha1Hex(analyzerVersion + engine + protocolRevision).slice(0, 12);
}

function escapeMd(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function truncateRepairs(repairs: TimelineRepair[]): TimelineRepair[] {
  if (repairs.length <= MAX_REPAIRS_BEFORE_TRUNCATE) return repairs;
  const first = repairs.slice(0, FIRST_REPAIRS_SHOWN);
  const last = repairs.slice(-LAST_REPAIRS_SHOWN);
  return [...first, { summary: "…intermediate repairs omitted for brevity…" } as TimelineRepair, ...last];
}

function formatRepair(r: TimelineRepair): string {
  const line = [r.summary, r.at].filter(Boolean).join(" — ");
  return line || "—";
}

export function renderReport(summary: unknown, repoRoot: string): string {
  const slug = (isValidSummary(summary) && typeof summary.repo_slug === "string"
    ? summary.repo_slug
    : "/").trim() || "/";
  const repoName =
    (isValidSummary(summary) && typeof summary.repo_name === "string"
      ? summary.repo_name
      : "repository").trim() || "repository";
  const commits = isValidSummary(summary) && typeof summary.commits === "number"
    ? Math.max(0, Math.floor(summary.commits))
    : 0;

  const inputValid = isValidSummary(summary);
  const { state, confidence, trend } = resolveState(
    inputValid ? summary : ({} as StorySummary),
    commits,
    inputValid,
  );

  const analysisHash =
    isValidSummary(summary) && typeof summary.analysis_hash === "string"
      ? summary.analysis_hash.trim()
      : "";
  const analyzerVersion =
    isValidSummary(summary) && typeof summary.analyzer_version === "string"
      ? summary.analyzer_version.trim()
      : "";

  const repo = repoHash(slug);
  const semantic = semanticHash(repo, state, confidence, trend, commits);
  const tool = toolHash(analyzerVersion, ENGINE, PROTOCOL_REVISION);

  const shareSummary =
    isValidSummary(summary) && typeof summary.share_summary === "string"
      ? escapeMd(summary.share_summary).slice(0, 280)
      : "";
  const narrative =
    isValidSummary(summary) && typeof summary.narrative === "string"
      ? escapeMd(summary.narrative)
      : "";
  const summaryRecord = summary as Record<string, unknown> | undefined;
  const whyBullets = Array.isArray(summaryRecord?.why_this_matters)
    ? (summaryRecord.why_this_matters as unknown[])
        .filter((x): x is string => typeof x === "string")
        .slice(0, 6)
        .map((s) => escapeMd(s))
    : [];
  const timeline = isValidSummary(summary) ? summary.timeline : undefined;
  const repairs = Array.isArray(timeline?.repairs)
    ? truncateRepairs(timeline.repairs)
    : [];
  const firstInstability =
    typeof timeline?.first_instability === "string"
      ? escapeMd(timeline.first_instability)
      : "";
  const worstPeriod =
    typeof timeline?.worst_period === "string"
      ? escapeMd(timeline.worst_period)
      : "";
  const currentState =
    typeof timeline?.current_state === "string"
      ? escapeMd(timeline.current_state)
      : "";

  const lines: string[] = [];

  lines.push(`<!-- ${ANCHR_REPORT_V1} -->`);
  lines.push(`<!-- renderer_version:${RENDERER_VERSION} -->`);
  lines.push(`<!-- protocol_revision:${PROTOCOL_REVISION} -->`);
  lines.push("");
  lines.push(`Repository ID: ${repo}`);
  lines.push("");
  lines.push(`Analyzer: ${ANALYZER_NAME}`);
  lines.push(`Analyzer Version: ${analyzerVersion}`);
  lines.push(`Analysis Engine: ${ENGINE}`);
  lines.push("");
  lines.push(`# ANCHR Architectural Report — ${escapeMd(repoName)}`);
  lines.push("");
  lines.push(`Analyzed commits: ${commits}`);
  lines.push("");
  lines.push("## Headline");
  lines.push("");
  lines.push(`ARCHITECTURAL HEALTH: ${state}`);
  lines.push(`Confidence: ${confidence}`);
  lines.push(`Risk Trend: ${trend}`);
  lines.push("");
  if (shareSummary) {
    lines.push("## Share Summary");
    lines.push("");
    lines.push(shareSummary);
    lines.push("");
  }
  if (narrative) {
    lines.push("## Full Narrative");
    lines.push("");
    lines.push(narrative);
    lines.push("");
  }
  if (whyBullets.length > 0) {
    lines.push("## Why This Matters");
    lines.push("");
    whyBullets.forEach((b) => lines.push(`- ${b}`));
    lines.push("");
  }
  lines.push("## Timeline");
  lines.push("");
  if (firstInstability) {
    lines.push("### First Instability");
    lines.push("");
    lines.push(firstInstability);
    lines.push("");
  }
  if (worstPeriod) {
    lines.push("### Worst Period");
    lines.push("");
    lines.push(worstPeriod);
    lines.push("");
  }
  if (repairs.length > 0) {
    lines.push("### Repairs");
    lines.push("");
    repairs.forEach((r) => lines.push(`- ${formatRepair(r)}`));
    lines.push("");
  }
  if (currentState) {
    lines.push("### Current State");
    lines.push("");
    lines.push(currentState);
    lines.push("");
  }
  lines.push("## Shareable");
  lines.push("");
  lines.push(
    `Shareable: ${escapeMd(repoName)} architecture is currently ${state}. Confidence: ${confidence}. Trend: ${trend}.`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("<!-- ANCHR_METADATA_V1");
  lines.push(`repo:${repo}`);
  lines.push(`state:${state}`);
  lines.push(`confidence:${confidence}`);
  lines.push(`trend:${trend}`);
  lines.push(`commits:${commits}`);
  lines.push(`analysis_hash:${analysisHash}`);
  lines.push(`semantic_hash:${semantic}`);
  lines.push(`renderer_version:${RENDERER_VERSION}`);
  lines.push(`protocol_revision:${PROTOCOL_REVISION}`);
  lines.push(`engine:${ENGINE}`);
  lines.push(`tool_hash:${tool}`);
  lines.push("compatibility:V1");
  lines.push("-->");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Reproduce locally:");
  lines.push("`npx anchr analyze`");
  lines.push("");
  lines.push(`Analysis Hash: ${analysisHash}`);

  const out = lines.join("\n");
  const lineCount = lines.length;
  if (lineCount > MAX_LINES) {
    return lines.slice(0, MAX_LINES).join("\n");
  }
  return out;
}

const DEFAULT_INPUT = "artifacts/story-summary.json";
const DEFAULT_OUTPUT = "anchr-report.md";

function main(): void {
  const cwd = process.cwd();
  const inputPath = resolve(cwd, process.env.ANCHR_STORY_SUMMARY ?? DEFAULT_INPUT);
  const outputPath = resolve(cwd, process.env.ANCHR_REPORT_MD ?? DEFAULT_OUTPUT);

  let summary: unknown;
  try {
    if (!existsSync(inputPath)) {
      summary = { commits: 0 };
    } else {
      const raw = readFileSync(inputPath, "utf8");
      summary = JSON.parse(raw) as unknown;
    }
  } catch {
    summary = null;
  }

  const md = renderReport(summary, cwd);
  writeFileSync(outputPath, md, "utf8");
}

main();
