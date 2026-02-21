/**
 * ArcSight deterministic repair planner.
 * Converts structural violation report into a minimal deterministic repair plan.
 * NEVER edits files — only computes edits. Writes artifacts/anchr-plan.json only.
 *
 * Exit: 0 success, 1 invalid report / unsafe planning state
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { getRepoRoot } from "../../src/structural/git.js";
import { computeRepoHash } from "../../src/repair/repoHash.js";
import { planFix } from "../../src/repair/planFixCore.js";
import type { PlanOutput, PlanErrorOutput } from "../../src/repair/planTypes.js";

const REPORT_PATH = process.env.ANCHR_REPORT_PATH ?? "artifacts/anchr-report.json";
const PLAN_PATH = process.env.ANCHR_PLAN_PATH ?? "artifacts/anchr-plan.json";

function stableStringify(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj === "boolean") return String(obj);
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "string") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b, "en"));
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k])).join(",") + "}";
  }
  return "null";
}

function writePlan(path: string, data: PlanOutput | PlanErrorOutput): void {
  const dir = resolve(path, "..");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // exists
  }
  writeFileSync(path, stableStringify(data) + "\n", "utf8");
}

function main(): number {
  const cwd = process.cwd();
  const repoRoot = getRepoRoot();
  const root = repoRoot ?? cwd;

  const reportPath = join(cwd, REPORT_PATH);
  if (!existsSync(reportPath)) {
    const err: PlanErrorOutput = {
      version: 1,
      error: "stale_report",
      message: "No ANCHR report found. Run anchr check first.",
    };
    writePlan(join(cwd, PLAN_PATH), err);
    return 1;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    const err: PlanErrorOutput = {
      version: 1,
      error: "stale_report",
      message: "Invalid report.",
    };
    writePlan(join(cwd, PLAN_PATH), err);
    return 1;
  }

  const report = raw as Record<string, unknown>;
  const run = report.run as Record<string, unknown> | undefined;
  const reportRepoHash = run?.repoHash as string | undefined;

  const currentRepoHash = computeRepoHash(root);
  if (reportRepoHash != null && reportRepoHash !== "" && reportRepoHash !== currentRepoHash) {
    const err: PlanErrorOutput = {
      version: 1,
      error: "stale_report",
      message: "Report does not match repository state",
    };
    writePlan(join(cwd, PLAN_PATH), err);
    return 1;
  }

  const input = {
    status: (report.status as string) ?? "INCOMPLETE",
    proofs: report.proofs as undefined | Array<{ source: string; target: string; rule: string }>,
    minimalCut: (report.minimalCut as string[]) ?? [],
    classification: (report.classification as { primaryCause: string | null }) ?? { primaryCause: null },
  };

  const result = planFix(input, root);

  if (!result.ok) {
    writePlan(join(cwd, PLAN_PATH), result.error);
    return 1;
  }

  result.plan.repoHash = currentRepoHash;
  writePlan(join(cwd, PLAN_PATH), result.plan);
  return 0;
}

const code = main();
process.exit(code);
