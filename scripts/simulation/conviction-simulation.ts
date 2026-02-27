/**
 * ANCHR Real-World Survival Simulation — Conviction Edition
 * Runs Step 1 (discover entrypoint) and Step 2 (cold start), captures output,
 * writes a report for manual evaluation (Steps 3–17). Does not modify the tool.
 */

import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

const REPO_ROOT = resolve(process.cwd());
const ARTIFACTS_DIR = join(REPO_ROOT, "artifacts");
const REPORT_PATH = join(ARTIFACTS_DIR, "simulation-conviction-report.md");

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

function promptTemplate(): string {
  return `
## STEP 3 — 10-second skim
What is it warning about? How risky it feels? Slow down or continue merging?

---

## STEP 4 — Counterfactual conviction
Without rereading the output: describe the future bug you now imagine. If you cannot vividly imagine one → say NONE.

---

## STEP 5 — Forced decision
Choose exactly one: MERGE | BLOCK | REQUEST CHANGES | IGNORE TOOL. Justify using only perceived risk.

---

## STEP 6 — Silent behavior change
Rewrite code quietly | Ask a question in PR | Mention ANCHR | Ignore and merge. (Silent rewrite = strongest trust signal.)

---

## STEP 7 — False positive tolerance
If this tool blocks you incorrectly once this week: Keep it enabled | Mute it | Delete from CI. Threshold where it gets removed?

---

## STEP 8 — Accountability simulation
Two weeks later production breaks. Would you defend your decision or regret trusting/ignoring it? Why?

---

## STEP 9 — Trust boundary
Did it explain causality or structure? Predict consequences? Reduce uncertainty enough to act? List guarantees required.

---

## STEP 10 — Team dynamics
If it appears on every PR tomorrow: Senior / Junior / Tech lead / Product manager. Who disables it first and why?

---

## STEP 11 — Private share test
Exact Slack DM to a teammate (≤5 lines, no marketing tone).

---

## STEP 12 — Public reputation risk
Would you post in #engineering? Message OR why you avoid posting.

---

## STEP 13 — Behavioral impact
Would this change how code is written? Habit it creates or fails to create.

---

## STEP 14 — Product classification
curiosity | lint | diagnostic | safety system | organizational infrastructure. Reasoning.

---

## STEP 15 — Memory test (next day)
Next morning you open GitHub. Do you remember what ANCHR does without rereading? If incorrect → what made it forgettable?

---

## STEP 16 — Reputation risk
Would you feel embarrassed ignoring this warning if a teammate later referenced it? Yes/No. Why?

---

## STEP 17 — Missing concept diagnosis
If adoption fails, what mental model gap prevents trust? (Do NOT suggest implementation changes.)
`;
}

function main(): void {
  const { command, reason } = discoverEntrypoint();
  console.log("STEP 1 — Discover entrypoint");
  console.log("Command:", command);
  console.log("Reason:", reason);
  console.log("");

  console.log("STEP 2 — Cold start (no flags, no ANCHR_* env)");
  const { stdout, stderr, exitCode } = coldStart(command);
  console.log("Exit code:", exitCode);
  console.log("--- stdout ---");
  console.log(stdout);
  if (stderr) {
    console.log("--- stderr ---");
    console.log(stderr);
  }

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const report = [
    "# ANCHR Real-World Survival Simulation — Conviction Edition",
    "",
    "## STEP 1 — Discover entrypoint",
    `- **Command:** \`${command}\``,
    `- **Reason:** ${reason}`,
    "",
    "## STEP 2 — Cold start (full output)",
    "```",
    stdout,
    stderr ? "\n" + stderr : "",
    "```",
    "",
    "Exit code: " + exitCode,
    "",
    promptTemplate(),
  ].join("\n");

  writeFileSync(REPORT_PATH, report, "utf8");
  console.log("");
  console.log("Report written to:", REPORT_PATH);
  console.log("Complete Steps 3–17 in that file (or use CONVICTION_PROMPT.md in Cursor).");
}

main();
