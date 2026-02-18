/**
 * Writes production comment body to a file (for use in CI without posting).
 * Reads artifacts/anchr-report.json and artifacts/anchr-policy.json.
 * Writes to artifacts/comment-body.txt.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { renderProductionComment } from "../src/comment/index.js";

const cwd = process.cwd();
const reportPath = join(cwd, "artifacts/anchr-report.json");
const policyPath = join(cwd, "artifacts/anchr-policy.json");
const outPath = join(cwd, "artifacts/comment-body.txt");

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

const report = readJson(reportPath) as {
  status?: string;
  scope?: { mode?: string };
  run?: { id?: string };
  headSha?: string;
  classification?: { primaryCause?: string | null };
  minimalCut?: string[];
  downgradeReasons?: string[];
  timestamp?: string;
} | null;
const policy = readJson(policyPath) as {
  runId: string;
  action: string;
  message: string;
  confidence: string;
} | null;

if (!report || !policy) {
  process.exit(0);
}

const runId = report.run?.id ?? "";
const commitSha = (report.headSha ?? "").slice(0, 7);
const isNonDeterministic =
  typeof policy.message === "string" &&
  policy.message.includes("inconsistent across runs");

const body = renderProductionComment({
  report: {
    status: report.status,
    scope: report.scope,
    run: report.run,
    classification: report.classification,
    minimalCut: report.minimalCut ?? [],
    downgradeReasons: report.downgradeReasons,
    timestamp: report.timestamp,
  },
  decision: {
    action: policy.action as "merge" | "block" | "review" | "retry",
    message: policy.message,
    confidence: policy.confidence as "high" | "medium" | "low",
  },
  commitSha,
  runId,
  isOutdated: false,
  isNonDeterministic,
});

mkdirSync(join(cwd, "artifacts"), { recursive: true });
writeFileSync(outPath, body, "utf8");
