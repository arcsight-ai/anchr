/**
 * Deterministic repair planner (Prompt 15). Reads ArcSight report, outputs
 * fix suggestions with confidenceReason. Pure interpretation of violations.
 */

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { parseMinimalCut } from "../src/repair/parseReport.js";
import { planRepairs } from "../src/repair/planner.js";
import type { PlannerViolation } from "../src/repair/plannerTypes.js";

const REPORT_PATH = "artifacts/anchr-report.json";
const POLICY_PATH = "artifacts/anchr-policy.json";
const OUT_PATH = "artifacts/anchr-fix-suggestions.json";

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

function toPlannerViolation(
  pkg: string,
  path: string,
  cause: string,
  specifier?: string,
): PlannerViolation {
  let toPackage: string | undefined;
  if (specifier && specifier.includes("/")) {
    const match = specifier.match(/@[\w-]+\/([\w-]+)/);
    if (match) toPackage = match[1];
  }
  return {
    kind: cause,
    fromPackage: pkg,
    toPackage,
    targetPath: path,
  };
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
    decision?: { level?: string; reason?: string };
    minimalCut?: string[];
  } | null;
  const policy = readJson(join(cwd, POLICY_PATH)) as {
    action?: string;
    message?: string;
  } | null;

  const action = policy?.action ?? report?.decision?.level ?? "allow";
  const reason = policy?.message ?? report?.decision?.reason ?? "";
  const minimalCut = report?.minimalCut ?? [];

  if (action !== "block" && action !== "review") {
    mkdirSync(join(cwd, "artifacts"), { recursive: true });
    writeFileSync(
      join(cwd, OUT_PATH),
      stableStringify({ primarySuggestion: "", suggestions: [] }) + "\n",
      "utf8",
    );
    process.exit(0);
  }

  const parsed = parseMinimalCut(minimalCut);
  const violations: PlannerViolation[] = parsed.map((v) =>
    toPlannerViolation(v.package, v.path, v.cause, v.specifier),
  );

  const input = {
    decisionAction: action,
    decisionReason: reason,
    violations,
  };

  const output = planRepairs(input);

  mkdirSync(join(cwd, "artifacts"), { recursive: true });
  writeFileSync(
    join(cwd, OUT_PATH),
    stableStringify(output) + "\n",
    "utf8",
  );
  process.exit(0);
}

main();
