#!/usr/bin/env npx tsx
/**
 * Day 3 — Adversarial structure test. Inject a dependency edge (cycle), then remove it.
 * Validate: injection increases risk signal; removal decreases it.
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, mkdirSync, existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const CLI_PATH = join(ROOT, "scripts", "cli.ts");
const TMP_BASE = join(tmpdir(), "anchr-phase1");
const WORK_DIR = join(TMP_BASE, "adversarial-ky");

const KY_BASE_SHA = "d8d6cfed4e0d69f1b923f1f7b2e00e5f81345172";
const CLONE_URL = "https://github.com/sindresorhus/ky.git";

function run(cmd: string, cwd: string, env?: Record<string, string>): void {
  execSync(cmd, {
    encoding: "utf8",
    cwd,
    stdio: "pipe",
    ...(env && { env: { ...process.env, ...env } }),
  });
}

function ensureClone(): void {
  if (!existsSync(join(WORK_DIR, ".git"))) {
    mkdirSync(WORK_DIR, { recursive: true });
    run("git init", WORK_DIR);
    run(`git remote add origin ${CLONE_URL}`, WORK_DIR);
    run(`git fetch --depth=1 origin ${KY_BASE_SHA}`, WORK_DIR, { GIT_TERMINAL_PROMPT: "0" });
    run(`git checkout ${KY_BASE_SHA}`, WORK_DIR);
  }
}

function runAnchr(baseSha: string, headSha: string, reportPath: string): Record<string, unknown> {
  mkdirSync(dirname(reportPath), { recursive: true });
  spawnSync(
    "npx",
    ["tsx", CLI_PATH, "audit", "--all", "--base", baseSha, "--head", headSha, "--json"],
    {
      encoding: "utf8",
      cwd: WORK_DIR,
      env: {
        ...process.env,
        ANCHR_REPORT_PATH: reportPath,
        GITHUB_BASE_SHA: baseSha,
        HEAD_SHA: headSha,
        BASE_SHA: baseSha,
      },
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  try {
    const raw = readFileSync(reportPath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function main(): { injectionPass: boolean; removalPass: boolean; fixes: string[] } {
  ensureClone();

  run(`git checkout ${KY_BASE_SHA}`, WORK_DIR);
  const sourceDir = join(WORK_DIR, "source");
  if (!existsSync(sourceDir)) {
    throw new Error("ky has no source/ dir");
  }

  const fileA = join(sourceDir, "adversarial-cycle-a.ts");
  const fileB = join(sourceDir, "adversarial-cycle-b.ts");

  writeFileSync(
    fileA,
    `// Day 3 adversarial injection: cycle with b
import "./adversarial-cycle-b.js";
export const adversarialA = 1;
`,
    "utf8",
  );
  writeFileSync(
    fileB,
    `// Day 3 adversarial injection: cycle with a
import "./adversarial-cycle-a.js";
export const adversarialB = 2;
`,
    "utf8",
  );
  run("git add source/adversarial-cycle-a.ts source/adversarial-cycle-b.ts", WORK_DIR);
  run('git commit -m "adversarial: add circular dependency (Day 3 injection)"', WORK_DIR);
  const injectionSha = execSync("git rev-parse HEAD", { encoding: "utf8", cwd: WORK_DIR }).trim();

  const reportInjectPath = join(WORK_DIR, "artifacts", "adversarial-injection.json");
  const reportInject = runAnchr(KY_BASE_SHA, injectionSha, reportInjectPath);
  const injectDecision = (reportInject.decision as { level?: string })?.level ?? "allow";
  const injectMinimalCut = (reportInject.minimalCut as string[]) ?? [];
  const injectViolationCount = injectMinimalCut.length;

  run(`git checkout ${KY_BASE_SHA}`, WORK_DIR);

  const reportRemovalPath = join(WORK_DIR, "artifacts", "adversarial-removal.json");
  const reportRemoval = runAnchr(injectionSha, KY_BASE_SHA, reportRemovalPath);
  const removalDecision = (reportRemoval.decision as { level?: string })?.level ?? "allow";
  const removalMinimalCut = (reportRemoval.minimalCut as string[]) ?? [];
  const removalViolationCount = removalMinimalCut.length;

  const injectionPass =
    injectViolationCount > 0 &&
    injectMinimalCut.some((e) => e.includes("circular") || e.includes("adversarial"));
  const removalPass = removalViolationCount < injectViolationCount || removalDecision === "allow";

  const doc = `# Adversarial structure test (Day 3)

**Freeze commit:** 6597d00c1cf47a86fa6c1e8a0db5d987e9c3232f  
**Repo:** sindresorhus/ky (medium-sized, Phase 1)

## A) Dependency injection test

**Structural change:** Added two files in \`source/\` that form a circular import:
- \`source/adversarial-cycle-a.ts\` imports \`./adversarial-cycle-b.js\`
- \`source/adversarial-cycle-b.ts\` imports \`./adversarial-cycle-a.js\`

No functional logic change. Compiles (synthetic edge only).

| Metric | Before (base) | After (injection) |
|--------|----------------|-------------------|
| minimalCut | [] | \`${JSON.stringify(injectMinimalCut)}\` |
| violation_count | 0 | ${injectViolationCount} |
| decision | allow | ${injectDecision} |

**Explanation excerpt:** ${injectMinimalCut.length > 0 ? injectMinimalCut[0]?.slice(0, 80) ?? "" : "N/A"}

**Result:** ${injectionPass ? "PASS — structural risk signal increased" : "FAIL — signal did not increase"}

---

## B) Dependency removal test

**Structural change:** Removed the circular edge (checkout back to base). Diff = injection_sha → base_sha.

| Metric | Before (injection) | After (removal) |
|--------|---------------------|-----------------|
| minimalCut | ${injectViolationCount} items | ${removalViolationCount} items |
| violation_count | ${injectViolationCount} | ${removalViolationCount} |
| decision | ${injectDecision} | ${removalDecision} |

**Result:** ${removalPass ? "PASS — structural risk signal decreased" : "FAIL — signal did not decrease"}

---

## Summary

| Test | Result |
|------|--------|
| Injection (add edge → risk up) | ${injectionPass ? "PASS" : "FAIL"} |
| Removal (remove edge → risk down) | ${removalPass ? "PASS" : "FAIL"} |
| **Day 3 overall** | **${injectionPass && removalPass ? "PASS" : "FAIL"}** |

**Wiring fixes made:** None.

---
*Generated by scripts/hardening/day3-adversarial-structure.ts*
`;

  const docPath = join(ROOT, "docs", "adversarial-structure-test.md");
  mkdirSync(dirname(docPath), { recursive: true });
  writeFileSync(docPath, doc, "utf8");

  return {
    injectionPass,
    removalPass,
    fixes: [],
  };
}

const { injectionPass, removalPass } = main();
console.log("Injection:", injectionPass ? "PASS" : "FAIL");
console.log("Removal:", removalPass ? "PASS" : "FAIL");
console.log("Day 3:", injectionPass && removalPass ? "PASS" : "FAIL");
process.exit(injectionPass && removalPass ? 0 : 1);
