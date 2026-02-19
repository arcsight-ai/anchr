/**
 * ANCHR Institutional Stress Test Protocol — Falsification experiment setup.
 * Loads INSTITUTIONAL_STRESS_TEST_PROMPT.md, validates that institutional
 * simulation content exists, writes a report template for Steps 1–7 output.
 * Does not run trials or classify; the evaluator executes the protocol.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join, resolve } from "path";

const REPO_ROOT = resolve(process.cwd());
const ARTIFACTS_DIR = join(REPO_ROOT, "artifacts");
const SIMULATION_DIR = join(REPO_ROOT, "scripts", "simulation");
const REPORT_PATH = join(ARTIFACTS_DIR, "simulation-institutional-stress-report.md");
const PROMPT_PATH = join(SIMULATION_DIR, "INSTITUTIONAL_STRESS_TEST_PROMPT.md");

const INSTITUTIONAL_CANDIDATES = [
  { path: join(SIMULATION_DIR, "SURVIVAL_V5_PROMPT.md"), label: "Survival v5 (multi-phase, archetypes, incentives)" },
  { path: join(SIMULATION_DIR, "CONVICTION_PROMPT.md"), label: "Conviction (trust, accountability, behavior)" },
];

function findInstitutionalSimulation(): { path: string; label: string } | null {
  for (const candidate of INSTITUTIONAL_CANDIDATES) {
    if (existsSync(candidate.path)) return candidate;
  }
  return null;
}

function outputReportTemplate(): string {
  return [
    "",
    "---",
    "",
    "## STEP 1 — Simulation validation (fill after locating)",
    "",
    "simulation_path:",
    "what agents represent:",
    "what choices agents make:",
    "why it is institutional behavior:",
    "",
    "---",
    "",
    "## STEP 2 — Experimental configuration",
    "",
    "base_runs: 7",
    "steps: (≥ 300)",
    "seeds: (unique per run)",
    "CONTROL / WEAK / SHOCK / REBELLION parameters:",
    "",
    "---",
    "",
    "## STEP 3 — Raw time series (reference)",
    "",
    "override_rate(t), trust(t), adoption(t), compliance(t) — save elsewhere; do not summarize here.",
    "",
    "---",
    "",
    "## STEP 4 — Stability & convergence",
    "",
    "mean_override:",
    "trend_override:",
    "trust_trend:",
    "cross_run_variance:",
    "post_shock_behavior:",
    "post_rebellion_behavior:",
    "",
    "---",
    "",
    "## STEP 5 — Hysteresis result",
    "",
    "persistence_length (after ANCHR removed):",
    "",
    "---",
    "",
    "## STEP 6 & 7 — Classification and report",
    "",
    "simulation_used:",
    "parameters:",
    "results_per_condition:",
    "shock_response:",
    "rebellion_response:",
    "hysteresis_result:",
    "final_classification: (TOOL | NORM | AUTHORITY | INDETERMINATE)",
    "confidence_level:",
    "reasoning_summary:",
    "",
    "---",
  ].join("\n");
}

function main(): void {
  console.log("ANCHR Institutional Stress Test Protocol");
  console.log("Falsification experiment — attempt to BREAK before classifying.");
  console.log("");

  let promptText: string;
  try {
    promptText = readFileSync(PROMPT_PATH, "utf8");
  } catch (e) {
    console.error("Missing prompt file:", PROMPT_PATH, e);
    process.exit(1);
  }

  const candidate = findInstitutionalSimulation();
  if (candidate) {
    console.log("Institutional simulation candidate:", candidate.path);
    console.log("Label:", candidate.label);
    console.log("Protocol requires you to validate it in STEP 1 (agents, choices, repeated decisions).");
  } else {
    console.log("No institutional simulation candidate found in", SIMULATION_DIR);
    console.log("STEP 1 will require locating or constructing a simulation that models repeated human decisions.");
  }
  console.log("");

  mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const report = [
    "# ANCHR Institutional Stress Test Protocol",
    "",
    "Hostile scientist protocol. Do not optimize for success. Attempt to break the system before classifying.",
    "",
    "Classification: TOOL | NORM | AUTHORITY | INDETERMINATE",
    "",
    "---",
    "",
    "## PROMPT (execute in order; do not stop early)",
    "",
    promptText,
    outputReportTemplate(),
  ].join("\n");

  writeFileSync(REPORT_PATH, report, "utf8");
  console.log("Report written to:", REPORT_PATH);
  console.log("Complete Steps 1–7 per the prompt; fill the structured output above.");
}

main();
