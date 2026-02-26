/**
 * Run suggest step: read report, generate suggestions (convergence or minimalCut fallback),
 * write artifacts/anchr-fix-suggestions.json. Never affects PASS/FAIL or report.
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { stableStringify } from "../structural/report.js";
import { suggestionsFromMinimalCut } from "./minimalCutSuggestions.js";
import { getConvergenceSuggestions } from "./convergenceAdapter.js";
import type { SuggestOutput } from "./types.js";

const DEFAULT_REPORT_PATH = "artifacts/anchr-report.json";
const DEFAULT_SUGGESTIONS_PATH = "artifacts/anchr-fix-suggestions.json";

interface ReportShape {
  status?: string;
  minimalCut?: string[];
  baseSha?: string;
  headSha?: string;
  run?: { id?: string };
}

/**
 * Run suggest: read report, write suggestions file. Returns exit code (0 or 2).
 */
export async function runSuggest(cwd: string): Promise<number> {
  const reportPath = process.env.ANCHR_REPORT_PATH ?? DEFAULT_REPORT_PATH;
  const suggestionsPath = process.env.ANCHR_SUGGESTIONS_PATH ?? DEFAULT_SUGGESTIONS_PATH;
  const absReport = resolve(cwd, reportPath);
  const absSuggestions = resolve(cwd, suggestionsPath);

  let raw: string;
  try {
    raw = readFileSync(absReport, "utf8");
  } catch {
    console.error("anchr suggest: report not found at " + reportPath);
    return 2;
  }

  let report: ReportShape;
  try {
    report = JSON.parse(raw) as ReportShape;
  } catch {
    console.error("anchr suggest: invalid report JSON at " + reportPath);
    return 2;
  }

  const status = (report.status ?? "").trim();
  const baseSha = (report.baseSha ?? "").trim();
  const headSha = (report.headSha ?? "").trim();
  const runId = (report.run?.id ?? "").trim();

  if (status === "INCOMPLETE" || status === "") {
    console.error("anchr suggest: report status is INCOMPLETE or missing; cannot generate suggestions");
    return 2;
  }

  if (status === "VERIFIED") {
    const out: SuggestOutput = {
      version: "v1",
      source: "minimalCut",
      run: { base: baseSha, head: headSha, run_id: runId },
      suggestions: [],
    };
    mkdirSync(dirname(absSuggestions), { recursive: true });
    writeFileSync(absSuggestions, stableStringify(out) + "\n", "utf8");
    console.log("# suggestions: 0 (VERIFIED)");
    return 0;
  }

  if (status !== "BLOCKED" && status !== "INDETERMINATE") {
    console.error("anchr suggest: unexpected report status " + status);
    return 2;
  }

  const minimalCut = report.minimalCut ?? [];
  let suggestions = await getConvergenceSuggestions({
    repoRoot: cwd,
    minimalCut,
    baseSha,
    headSha,
    runId,
  });
  const source: "convergence" | "minimalCut" = suggestions != null ? "convergence" : "minimalCut";
  if (suggestions == null) {
    suggestions = suggestionsFromMinimalCut(minimalCut);
  }

  const out: SuggestOutput = {
    version: "v1",
    source,
    run: { base: baseSha, head: headSha, run_id: runId },
    suggestions,
  };

  mkdirSync(dirname(absSuggestions), { recursive: true });
  writeFileSync(absSuggestions, stableStringify(out) + "\n", "utf8");
  const n = suggestions.length;
  console.log(`# suggestions: ${n} (from ${source})`);
  return 0;
}
