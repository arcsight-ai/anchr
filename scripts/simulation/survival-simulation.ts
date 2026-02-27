/**
 * ANCHR Survival, Incentive & Institutionalization Simulation v5
 * Loads SURVIVAL_V5_PROMPT.md, runs cold start for sample ANCHR output,
 * writes a report for multi-phase evaluation (Phases 1–15, aggregated metrics, final judgment).
 * Does not modify the tool.
 */

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const REPO_ROOT = resolve(process.cwd());
const ARTIFACTS_DIR = join(REPO_ROOT, "artifacts");
const SIMULATION_DIR = join(REPO_ROOT, "scripts", "simulation");
const REPORT_PATH = join(ARTIFACTS_DIR, "simulation-survival-report.md");
const PROMPT_PATH = join(SIMULATION_DIR, "SURVIVAL_V5_PROMPT.md");

function discoverEntrypoint(): { command: string; reason: string } {
  const pkgPath = join(REPO_ROOT, "package.json");
  let pkg: { bin?: Record<string, string>; scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    return {
      command: "npx tsx scripts/cli.ts",
      reason: "fallback: no package.json or parse error",
    };
  }
  if (pkg.bin && (pkg.bin.anchr || pkg.bin.arcsight)) {
    return {
      command: "npx @arcsight-ai/anchr@1",
      reason: "package.json bin.anchr — developer would run via npx (e.g. in CI or locally)",
    };
  }
  if (pkg.scripts?.anchr) {
    return {
      command: "npm run anchr",
      reason: "package.json scripts.anchr — developer would run via npm script",
    };
  }
  return {
    command: "npx tsx scripts/cli.ts",
    reason: "fallback: no bin or anchr script",
  };
}

function coldStart(command: string): { stdout: string; stderr: string; exitCode: number } {
  const env = { ...process.env };
  Object.keys(env).forEach((k) => {
    if (k.startsWith("ANCHR_")) delete (env as Record<string, unknown>)[k];
  });
  const isNpx = command.startsWith("npx ");
  const isNpmRun = command.startsWith("npm run ");
  const cmd = isNpmRun ? "npm" : isNpx ? "npx" : command.split(" ")[0];
  const rest = isNpmRun
    ? ["run", command.replace("npm run ", "").trim()]
    : isNpx
      ? command.slice(4).split(" ").filter(Boolean)
      : command.split(" ").slice(1);
  const out = spawnSync(cmd!, rest, {
    encoding: "utf8",
    cwd: REPO_ROOT,
    env,
    timeout: 15000,
  });
  return {
    stdout: out.stdout ?? "",
    stderr: out.stderr ?? "",
    exitCode: out.status ?? -1,
  };
}

function aggregatedMetricsTemplate(): string {
  return [
    "",
    "---",
    "",
    "## AGGREGATED METRICS (fill after running simulation)",
    "",
    "1. Merge rate without ANCHR:",
    "2. Immediate compliance rate:",
    "3. Override rate under pressure:",
    "4. Trust resilience score (0–100):",
    "5. 3-month retention probability:",
    "6. Institutionalization probability:",
    "7. Executive removal probability:",
    "8. Silent sabotage probability:",
    "9. Viral adoption probability:",
    "10. Narrative stickiness score:",
    "11. Anti-fragility index:",
    "12. Economic net value estimate:",
    "13. Cultural reinforcement index:",
    "14. Long-term authority trajectory:",
    "",
    "---",
    "",
    "## FINAL JUDGMENT",
    "",
    "DURABLE ARCHITECTURAL CONTROL SYSTEM | FRAGILE ADVISORY LINT TOOL",
    "",
    "Justification:",
    "",
    "---",
  ].join("\n");
}

function main(): void {
  const { command, reason } = discoverEntrypoint();
  console.log("ANCHR Survival Simulation v5");
  console.log("Entrypoint:", command);
  console.log("Reason:", reason);
  console.log("");

  let promptText: string;
  try {
    promptText = readFileSync(PROMPT_PATH, "utf8");
  } catch (e) {
    console.error("Missing prompt file:", PROMPT_PATH, e);
    process.exit(1);
  }

  console.log("Cold start (sample output for Test Condition A/B)...");
  const { stdout, stderr, exitCode } = coldStart(command);
  console.log("Exit code:", exitCode);

  mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const sampleOutput = [
    stdout,
    stderr ? "\n" + stderr : "",
  ].join("");

  const report = [
    "# ANCHR Survival, Incentive & Institutionalization Simulation v5",
    "",
    "Copy the prompt below into your evaluator (e.g. Cursor). Complete every phase, then fill Aggregated Metrics and Final Judgment in this file.",
    "",
    "---",
    "",
    "## PROMPT (paste into simulation engine)",
    "",
    promptText,
    "",
    "---",
    "",
    "## SAMPLE ANCHR OUTPUT (for Test Condition A/B substitution)",
    "",
    "Use this real run to substitute or compare with the neutral/consequence-framed blocks in the prompt.",
    "",
    "```",
    sampleOutput,
    "```",
    "",
    "Exit code: " + exitCode,
    aggregatedMetricsTemplate(),
  ].join("\n");

  writeFileSync(REPORT_PATH, report, "utf8");
  console.log("");
  console.log("Report written to:", REPORT_PATH);
  console.log("Open SURVIVAL_V5_PROMPT.md or the report prompt section; complete Phases 1–15, then fill metrics and judgment.");
}

main();
