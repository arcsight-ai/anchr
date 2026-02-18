import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { getMergeBase } from "../structural/git.js";
import { analyzeAtRef } from "./analyzer.js";
import {
  applyRenameStabilization,
  getSharedBoundaries,
  classifyImpact,
} from "./compare.js";
import { buildConvergenceOutput, writeConvergenceJson } from "./output.js";

const OUTPUT_FILE = "arcsight-convergence.json";

function getBaselineRef(repoRoot: string): string | null {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (baseRef) {
    const mergeBase = getMergeBase(repoRoot, "HEAD", `origin/${baseRef}`);
    return mergeBase;
  }
  try {
    const out = spawnSync("git", ["rev-parse", "HEAD~1"], {
      encoding: "utf8",
      cwd: repoRoot,
      maxBuffer: 64 * 1024,
    });
    return out.status === 0 && out.stdout?.trim() ? out.stdout.trim() : null;
  } catch {
    return null;
  }
}

function getHeadRef(repoRoot: string): string | null {
  try {
    const out = spawnSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      cwd: repoRoot,
      maxBuffer: 64 * 1024,
    });
    return out.status === 0 && out.stdout?.trim() ? out.stdout.trim() : null;
  } catch {
    return null;
  }
}

export function runConvergence(repoRoot: string, artifactsDir: string): boolean {
  try {
    const baselineRef = getBaselineRef(repoRoot);
    const headRef = getHeadRef(repoRoot);
    if (!baselineRef || !headRef) return false;

    const before = analyzeAtRef(repoRoot, baselineRef);
    const after = analyzeAtRef(repoRoot, headRef);

    let shared = getSharedBoundaries(before, after);
    if (shared.size === 0) return false;

    const { beforeAdjusted, afterAdjusted } = applyRenameStabilization(before, after);
    shared = getSharedBoundaries(beforeAdjusted, afterAdjusted);
    if (shared.size === 0) return false;

    const { impact, deltas } = classifyImpact(
      beforeAdjusted,
      afterAdjusted,
      shared,
    );

    const output = buildConvergenceOutput(impact, deltas);
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(
      join(artifactsDir, OUTPUT_FILE),
      writeConvergenceJson(output),
      "utf8",
    );
    return true;
  } catch {
    return false;
  }
}
