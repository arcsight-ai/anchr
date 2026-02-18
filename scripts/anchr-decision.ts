/**
 * ANCHR Decision Engine. Reads report + convergence, outputs decision and comment input.
 */

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { buildDecisionFromReportWithContext } from "../src/decision/index.js";
import { buildCommentInput, renderComment } from "../src/comment/index.js";
import { evaluatePolicy } from "../src/policy/index.js";
import type { RunMode } from "../src/comment/types.js";
import type { PolicyOutput } from "../src/policy/types.js";

const REPORT_PATH = "artifacts/anchr-report.json";
const CONVERGENCE_PATH = "artifacts/arcsight-convergence.json";
const DECISION_PATH = "artifacts/anchr-decision.json";
const COMMENT_INPUT_PATH = "artifacts/anchr-comment-input.json";
const COMMENT_BODY_PATH = "artifacts/anchr-comment-body.md";
const POLICY_PATH = "artifacts/anchr-policy.json";

function readJson(path: string): unknown {
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function stableStringify(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj === "boolean") return String(obj);
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "string") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map((v) => stableStringify(v)).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b, "en"));
    const parts = keys.map(
      (k) => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k]),
    );
    return "{" + parts.join(",") + "}";
  }
  return "null";
}

function main(): void {
  const cwd = process.cwd();
  const report = readJson(join(cwd, REPORT_PATH)) as {
    status?: string;
    run?: { id?: string };
    classification?: { primaryCause?: string | null };
    confidence?: { coverageRatio?: number };
    minimalCut?: string[];
    scope?: { mode?: string };
    downgradeReasons?: string[];
  } | null;

  if (!report || typeof report !== "object") {
    const fallback = {
      decision: "INVESTIGATE",
      explanation: "Analysis could not complete.",
      reasoning: "The tool could not reliably evaluate the architectural effect of this change.",
      guidance: "Re-run analysis or inspect manually.",
    };
    const mode: RunMode =
      process.env.ANCHR_MODE === "FAST_PATH" ? "FAST_PATH" : "FULL_ANALYSIS";
    const commentInput = buildCommentInput(
      fallback,
      "unknown_change",
      0,
      mode,
      { technicalContext: { status: "—", scopeMode: "—", violations: [] } },
    );
    mkdirSync(join(cwd, "artifacts"), { recursive: true });
    writeFileSync(
      join(cwd, DECISION_PATH),
      stableStringify(fallback) + "\n",
      "utf8",
    );
    writeFileSync(
      join(cwd, COMMENT_INPUT_PATH),
      stableStringify(commentInput) + "\n",
      "utf8",
    );
    writeFileSync(
      join(cwd, COMMENT_BODY_PATH),
      renderComment(commentInput) + "\n",
      "utf8",
    );
    process.exit(0);
  }

  const convergence = readJson(join(cwd, CONVERGENCE_PATH)) as { impact?: string } | null;
  const { output, changeType, confidence } = buildDecisionFromReportWithContext(
    report,
    convergence ?? null,
  );

  const mode: RunMode =
    process.env.ANCHR_MODE === "FAST_PATH" ? "FAST_PATH" : "FULL_ANALYSIS";

  const previousPolicy = readJson(join(cwd, POLICY_PATH)) as
    | { runId: string; action: string; message: string; confidence: string }
    | null;
  const runId = report.run?.id ?? "";
  const previousDecision: PolicyOutput | null =
    previousPolicy && previousPolicy.runId === runId
      ? {
          action: previousPolicy.action as PolicyOutput["action"],
          message: previousPolicy.message,
          confidence: previousPolicy.confidence as PolicyOutput["confidence"],
        }
      : null;
  const policy = evaluatePolicy({
    currentReport: report,
    previousDecision,
  });
  const policyStore = { runId, ...policy };

  const commentInput = buildCommentInput(output, changeType, confidence, mode, {
    technicalContext: {
      status: report.status ?? "—",
      scopeMode: report.scope?.mode ?? "structural-fast-path",
      violations: report.minimalCut ?? [],
      primaryCause: report.classification?.primaryCause ?? null,
      decisionLevel: (report as { decision?: { level?: string } }).decision?.level ?? "",
    },
    policy,
  });

  mkdirSync(join(cwd, "artifacts"), { recursive: true });
  writeFileSync(
    join(cwd, DECISION_PATH),
    stableStringify(output) + "\n",
    "utf8",
  );
  writeFileSync(
    join(cwd, POLICY_PATH),
    stableStringify(policyStore) + "\n",
    "utf8",
  );
  writeFileSync(
    join(cwd, COMMENT_INPUT_PATH),
    stableStringify(commentInput) + "\n",
    "utf8",
  );
  writeFileSync(
    join(cwd, COMMENT_BODY_PATH),
    renderComment(commentInput) + "\n",
    "utf8",
  );
  process.exit(0);
}

main();
