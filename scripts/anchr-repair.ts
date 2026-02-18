import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { parseMinimalCut } from "../src/repair/parseReport.js";
import { buildRepairPlan } from "../src/repair/buildPlan.js";
import { formatMarkdown } from "../src/repair/markdown.js";
import type { RepairPlan } from "../src/repair/types.js";

const REPORT_PATH = "artifacts/anchr-report.json";
const OUT_JSON = "artifacts/anchr-repair.json";
const OUT_MD = "artifacts/anchr-repair.md";

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
    const parts = keys.map((k) => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k]));
    return "{" + parts.join(",") + "}";
  }
  return "null";
}

function readReport(reportPath: string): unknown | null {
  try {
    const raw = readFileSync(reportPath, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function main(): void {
  const cwd = process.cwd();
  const reportPath = resolve(cwd, REPORT_PATH);
  const report = readReport(reportPath);

  let plan: RepairPlan;

  if (!report || typeof report !== "object") {
    plan = {
      status: "no-report",
      primaryActionPath: [],
      actions: [],
    };
  } else {
    const r = report as {
      status?: string;
      classification?: { primaryCause?: string | null };
      decision?: { level?: string };
      minimalCut?: string[];
    };

    const status = r.status ?? "INCOMPLETE";
    const primaryCause = r.classification?.primaryCause ?? null;
    const minimalCut = Array.isArray(r.minimalCut) ? r.minimalCut : [];

    if (status === "VERIFIED") {
      plan = {
        status: "verified",
        primaryActionPath: [],
        actions: [],
      };
    } else if (status === "INCOMPLETE" || r.decision?.level === "warn") {
      plan = {
        status: "uncertain",
        primaryActionPath: [],
        actions: [],
      };
    } else if (status === "BLOCKED") {
      const parsed = parseMinimalCut(minimalCut);
      const actions = buildRepairPlan(parsed);
      plan = {
        status: "blocked",
        primaryActionPath: actions,
        actions,
      };
    } else {
      plan = {
        status: "uncertain",
        primaryActionPath: [],
        actions: [],
      };
    }
  }

  const outDir = resolve(cwd, "artifacts");
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    // exists
  }

  const jsonPath = resolve(cwd, OUT_JSON);
  const mdPath = resolve(cwd, OUT_MD);

  writeFileSync(jsonPath, stableStringify(plan) + "\n", "utf8");

  const reportObj = report as { classification?: { primaryCause?: string | null } } | null;
  const primaryCause = reportObj?.classification?.primaryCause ?? null;
  const md = formatMarkdown(plan, primaryCause);
  writeFileSync(mdPath, md + "\n", "utf8");
}

main();
process.exit(0);
