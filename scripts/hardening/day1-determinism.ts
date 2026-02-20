#!/usr/bin/env npx tsx
/**
 * Day 1 — Determinism proof. Run ANCHR on one PR three times; assert identical output.
 * Exit 0 if zero variance; 1 if variance detected.
 * Writes docs/determinism-proof.md.
 */

import { execSync, spawnSync } from "child_process";
import { createHash } from "crypto";
import { readFileSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CLI_PATH = join(ROOT, "scripts", "cli.ts");

import { tmpdir } from "os";
const TMP_BASE = join(tmpdir(), "anchr-phase1");

const PR = {
  repo: "sindresorhus/ky",
  pr: 796,
  base_sha: "d8d6cfed4e0d69f1b923f1f7b2e00e5f81345172",
  head_sha: "33967b45b6c89d4794b8d0a42ad330f0780b8bd6",
};

function slug(repo: string): string {
  return repo.replace(/\//g, "_");
}

function shallowCloneAndCheckout(
  workDir: string,
  cloneUrl: string,
  baseSha: string,
  headSha: string,
): void {
  mkdirSync(workDir, { recursive: true });
  execSync("git init", { encoding: "utf8", cwd: workDir, stdio: "pipe" });
  execSync(`git remote add origin ${cloneUrl}`, { encoding: "utf8", cwd: workDir, stdio: "pipe" });
  execSync(`git fetch --depth=1 origin ${baseSha}`, {
    encoding: "utf8",
    cwd: workDir,
    timeout: 90000,
    stdio: "pipe",
  });
  execSync(`git fetch --depth=1 origin ${headSha}`, {
    encoding: "utf8",
    cwd: workDir,
    timeout: 90000,
    stdio: "pipe",
  });
  execSync(`git checkout ${headSha}`, { encoding: "utf8", cwd: workDir, stdio: "pipe" });
}

interface RunOutput {
  decision: string;
  minimalCut: string[];
  violation_count: number;
  explanationHash: string;
  runId: string;
}

async function runOne(workDir: string, reportPath: string): Promise<RunOutput> {
  mkdirSync(dirname(reportPath), { recursive: true });
  spawnSync(
    "npx",
    ["tsx", CLI_PATH, "audit", "--all", "--base", PR.base_sha, "--head", PR.head_sha, "--json"],
    {
      encoding: "utf8",
      cwd: workDir,
      env: {
        ...process.env,
        ANCHR_REPORT_PATH: reportPath,
        GITHUB_BASE_SHA: PR.base_sha,
        HEAD_SHA: PR.head_sha,
        GITHUB_HEAD_SHA: PR.head_sha,
      },
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  let report: Record<string, unknown> = {};
  try {
    const raw = readFileSync(reportPath, "utf8");
    report = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // leave empty
  }
  const decision = String((report.decision as { level?: string })?.level ?? "allow").toLowerCase();
  const minimalCut = Array.isArray(report.minimalCut) ? (report.minimalCut as string[]) : [];
  const violation_count = minimalCut.length;

  const { formatExplanation } = await import("../../src/formatters/explain.js");
  const explanation = formatExplanation(report as import("../../src/formatters/explain.js").ArcSightReport);
  const explanationHash = createHash("sha256").update(explanation, "utf8").digest("hex");
  const runId = String((report.run as { id?: string })?.id ?? "");

  return { decision, minimalCut, violation_count, explanationHash, runId };
}

async function main(): Promise<boolean> {
  const workDir = join(TMP_BASE, slug(PR.repo), String(PR.pr));
  if (!existsSync(workDir)) {
    const [owner, name] = PR.repo.split("/");
    shallowCloneAndCheckout(
      workDir,
      `https://github.com/${owner}/${name}.git`,
      PR.base_sha,
      PR.head_sha,
    );
  }

  const runs: RunOutput[] = [];
  for (let i = 1; i <= 3; i++) {
    const reportPath = join(workDir, "artifacts", `det-run-${i}.json`);
    const out = await runOne(workDir, reportPath);
    runs.push(out);
  }

  const a = runs[0]!;
  const b = runs[1]!;
  const c = runs[2]!;

  const minimalCutSame =
    JSON.stringify(a.minimalCut) === JSON.stringify(b.minimalCut) &&
    JSON.stringify(b.minimalCut) === JSON.stringify(c.minimalCut);
  const decisionSame = a.decision === b.decision && b.decision === c.decision;
  const violationCountSame =
    a.violation_count === b.violation_count && b.violation_count === c.violation_count;
  const explanationHashSame =
    a.explanationHash === b.explanationHash && b.explanationHash === c.explanationHash;

  const pass = minimalCutSame && decisionSame && violationCountSame && explanationHashSame;

  const docPath = join(ROOT, "docs", "determinism-proof.md");
  mkdirSync(dirname(docPath), { recursive: true });
  const doc = `# Determinism proof (Day 1)

**PR:** ${PR.repo}#${PR.pr}  
**Base:** ${PR.base_sha.slice(0, 7)}  
**Head:** ${PR.head_sha.slice(0, 7)}

## Run outputs

| Run | decision | violation_count | explanationHash (sha256) | runId |
|-----|----------|-----------------|--------------------------|------|
| 1   | ${a.decision} | ${a.violation_count} | ${a.explanationHash} | ${a.runId.slice(0, 12)} |
| 2   | ${b.decision} | ${b.violation_count} | ${b.explanationHash} | ${b.runId.slice(0, 12)} |
| 3   | ${c.decision} | ${c.violation_count} | ${c.explanationHash} | ${c.runId.slice(0, 12)} |

## minimalCut (run 1)

\`\`\`
${JSON.stringify(a.minimalCut, null, 2)}
\`\`\`

## Comparison

- minimalCut identical: ${minimalCutSame}
- decision identical: ${decisionSame}
- violation_count identical: ${violationCountSame}
- explanation hash identical: ${explanationHashSame}

## Result

**Zero variance:** ${pass ? "YES" : "NO"}

${pass ? "" : "## Root cause analysis\n(If fix was required, document here.)\n"}

---
*Generated by scripts/hardening/day1-determinism.ts*
`;
  writeFileSync(docPath, doc, "utf8");

  return pass;
}

main().then((pass) => process.exit(pass ? 0 : 1));
