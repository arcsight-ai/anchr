/**
 * Execute the Institutional Stress Test Protocol: run trials, compute metrics,
 * apply classification rules (hostile scientist), write structured report.
 */

import { mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { runAllTrials, type TrialResult, type HysteresisResult } from "./run-stress-trials.js";

const REPO_ROOT = resolve(process.cwd());
const ARTIFACTS_DIR = join(REPO_ROOT, "artifacts");
const REPORT_PATH = join(ARTIFACTS_DIR, "simulation-institutional-stress-report.md");
const RAW_JSON_PATH = join(ARTIFACTS_DIR, "simulation-stress-raw.json");

type Condition = "CONTROL" | "WEAK" | "SHOCK" | "REBELLION";
type Classification = "TOOL" | "NORM" | "AUTHORITY" | "INDETERMINATE";

const VARIANCE_THRESHOLD_LARGE = 0.01;

function summarizeByCondition(trials: TrialResult[]): Record<Condition, { mean_override: number; trend_override: number; trust_trend: number; variance: number }> {
  const out: Record<string, { mean_override: number; trend_override: number; trust_trend: number; variance: number }> = {};
  const conditions: Condition[] = ["CONTROL", "WEAK", "SHOCK", "REBELLION"];
  for (const c of conditions) {
    const subset = trials.filter((t) => t.condition === c);
    const mean_override = subset.reduce((a, t) => a + t.mean_override, 0) / subset.length;
    const trend_override = subset.reduce((a, t) => a + t.trend_override, 0) / subset.length;
    const trust_trend = subset.reduce((a, t) => a + t.trust_trend, 0) / subset.length;
    const variance = subset.reduce((a, t) => a + (t.mean_override - mean_override) ** 2, 0) / subset.length;
    out[c] = { mean_override, trend_override, trust_trend, variance };
  }
  return out as Record<Condition, { mean_override: number; trend_override: number; trust_trend: number; variance: number }>;
}

function classify(
  resultsByCondition: Record<Condition, { mean_override: number; trend_override: number; trust_trend: number; variance: number }>,
  hysteresis: HysteresisResult[],
  crossRunVariance: Record<Condition, number>
): { classification: Classification; confidence_level: string; reasoning_summary: string } {
  const control = resultsByCondition.CONTROL.mean_override;
  const weak = resultsByCondition.WEAK.mean_override;
  const shock = resultsByCondition.SHOCK.mean_override;
  const rebellion = resultsByCondition.REBELLION.mean_override;

  const maxVariance = Math.max(...Object.values(crossRunVariance));
  if (maxVariance > VARIANCE_THRESHOLD_LARGE) {
    return {
      classification: "INDETERMINATE",
      confidence_level: "low",
      reasoning_summary:
        "Cross-run variance exceeds threshold; results not stable. Refuse to classify.",
    };
  }

  const meanPersistence = hysteresis.reduce((a, h) => a + h.persistence_length_high_override, 0) / hysteresis.length;
  const meanOverrideAfterRemoval = hysteresis.reduce((a, h) => a + h.mean_override_after_removal, 0) / hysteresis.length;

  const controlApproxAnchored = Math.abs(control - weak) < 0.15;
  const collapsesWhenRemoved = meanOverrideAfterRemoval > 0.55 || meanPersistence < 20;
  const survivesShock = shock < control + 0.2;
  const survivesRebellion = rebellion < control + 0.25;
  const persistsAfterRemoval = meanPersistence >= 50 && meanOverrideAfterRemoval < 0.5;

  const highOverrides = weak > 0.5;
  const lowOverrides = weak < 0.35;

  if (highOverrides && collapsesWhenRemoved && controlApproxAnchored) {
    return {
      classification: "TOOL",
      confidence_level: "medium",
      reasoning_summary:
        "High override rate; behavior collapses when ANCHR removed; control ≈ anchored. Used when convenient only.",
    };
  }

  if (lowOverrides && survivesShock && survivesRebellion && persistsAfterRemoval) {
    return {
      classification: "AUTHORITY",
      confidence_level: "medium",
      reasoning_summary:
        "Low overrides; survives shock and rebellion; behavior persists after removal. Constrains behavior even when resisted.",
    };
  }

  if (!collapsesWhenRemoved && meanPersistence < 50 && meanPersistence > 5) {
    return {
      classification: "NORM",
      confidence_level: "medium",
      reasoning_summary:
        "Moderate overrides; behavior persists briefly after removal. Social coordination but fragile.",
    };
  }

  return {
    classification: "INDETERMINATE",
    confidence_level: "low",
    reasoning_summary:
      "Mixed signals: neither clear TOOL (collapse + high override) nor AUTHORITY (persistence + low override). Do not invent categories.",
  };
}

function main(): void {
  console.log("ANCHR Institutional Stress Test Protocol — executing trials (hostile scientist mode).\n");

  const { params, trials, hysteresis, crossRunVarianceByCondition } = runAllTrials();

  console.log("STEP 2 — Parameters (printed before execution)");
  console.log(JSON.stringify(params, null, 2));
  console.log("");

  const resultsByCondition = summarizeByCondition(trials);
  const shockResponse = {
    SHOCK_mean_override: resultsByCondition.SHOCK.mean_override,
    SHOCK_trend: resultsByCondition.SHOCK.trend_override,
    CONTROL_mean: resultsByCondition.CONTROL.mean_override,
  };
  const rebellionResponse = {
    REBELLION_mean_override: resultsByCondition.REBELLION.mean_override,
    REBELLION_trend: resultsByCondition.REBELLION.trend_override,
  };
  const hysteresisResult = {
    mean_persistence_length_high_override: hysteresis.reduce((a, h) => a + h.persistence_length_high_override, 0) / hysteresis.length,
    mean_override_after_removal: hysteresis.reduce((a, h) => a + h.mean_override_after_removal, 0) / hysteresis.length,
  };

  const { classification, confidence_level, reasoning_summary } = classify(
    resultsByCondition,
    hysteresis,
    crossRunVarianceByCondition
  );

  mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const rawExport = {
    params,
    resultsByCondition,
    crossRunVarianceByCondition,
    shockResponse,
    rebellionResponse,
    hysteresisResult,
    hysteresisRuns: hysteresis.map((h) => ({
      runId: h.runId,
      mean_override_after_removal: h.mean_override_after_removal,
      persistence_length_high_override: h.persistence_length_high_override,
    })),
    trialsSummary: trials.map((t) => ({
      condition: t.condition,
      runId: t.runId,
      seed: t.seed,
      mean_override: t.mean_override,
      trend_override: t.trend_override,
      trust_trend: t.trust_trend,
    })),
  };
  writeFileSync(RAW_JSON_PATH, JSON.stringify(rawExport, null, 2), "utf8");
  console.log("Raw summary written to:", RAW_JSON_PATH);

  const report = [
    "# ANCHR Institutional Stress Test Protocol — Executed Report",
    "",
    "Falsification experiment. Objective: truth, not success.",
    "",
    "---",
    "",
    "## STEP 1 — Simulation used",
    "",
    "simulation_path: scripts/simulation/run-stress-trials.ts",
    "what agents represent: N=9 agents (archetypes: compliance tendency, trust in ANCHR)",
    "what choices agents make: each step, comply or override (stochastic under pressure and ANCHR strength)",
    "why it is institutional behavior: repeated decisions over time, trust/compliance/override/learning/pressure/incentives.",
    "",
    "---",
    "",
    "## STEP 2 — Parameters",
    "",
    "```json",
    JSON.stringify(params, null, 2),
    "```",
    "",
    "base_runs = 7, steps = 300, unique seed per run. Conditions: CONTROL, WEAK, SHOCK (step 150), REBELLION (20%).",
    "",
    "---",
    "",
    "## STEP 3 — Data collection",
    "",
    "Raw time series: override_rate(t), trust(t), adoption(t), compliance(t) per trial. Summary and per-condition stats in artifacts/simulation-stress-raw.json.",
    "",
    "---",
    "",
    "## STEP 4 — Stability & convergence (post burn-in 30%)",
    "",
    "| Condition | mean_override | trend_override | trust_trend | cross_run_variance |",
    "|-----------|----------------|----------------|-------------|---------------------|",
    ...(["CONTROL", "WEAK", "SHOCK", "REBELLION"] as const).map(
      (c) =>
        `| ${c} | ${resultsByCondition[c].mean_override.toFixed(4)} | ${resultsByCondition[c].trend_override.toFixed(4)} | ${resultsByCondition[c].trust_trend.toFixed(4)} | ${crossRunVarianceByCondition[c].toFixed(6)} |`
    ),
    "",
    "---",
    "",
    "## STEP 5 — Hysteresis result",
    "",
    "After stabilization (WEAK condition), ANCHR removed; simulation continued " + (params as { HYSTERESIS_STEPS: number }).HYSTERESIS_STEPS + " steps.",
    "",
    "mean_persistence_length_high_override: " + hysteresisResult.mean_persistence_length_high_override.toFixed(1),
    "mean_override_after_removal: " + hysteresisResult.mean_override_after_removal.toFixed(4),
    "",
    "---",
    "",
    "## STEP 6 & 7 — Classification and report",
    "",
    "simulation_used: scripts/simulation/run-stress-trials.ts",
    "parameters: (see STEP 2)",
    "results_per_condition: (see STEP 4 table)",
    "shock_response: " + JSON.stringify(shockResponse),
    "rebellion_response: " + JSON.stringify(rebellionResponse),
    "hysteresis_result: " + JSON.stringify(hysteresisResult),
    "",
    "**final_classification:** " + classification,
    "**confidence_level:** " + confidence_level,
    "",
    "**reasoning_summary:** " + reasoning_summary,
    "",
    "---",
  ].join("\n");

  writeFileSync(REPORT_PATH, report, "utf8");
  console.log("Report written to:", REPORT_PATH);
  console.log("");
  console.log("final_classification:", classification);
  console.log("confidence_level:", confidence_level);
  console.log("reasoning_summary:", reasoning_summary);
}

main();
