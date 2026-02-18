/**
 * Mode 3: Architectural Convergence Engine.
 * Runs after structural verification. Never blocks. Deterministic.
 */

import { join } from "path";
import { runConvergence } from "../src/convergence/run.js";
import { getRepoRoot } from "../src/structural/git.js";

function main(): void {
  const repoRoot = getRepoRoot();
  if (!repoRoot) process.exit(0);

  const artifactsDir = join(repoRoot, "artifacts");
  runConvergence(repoRoot, artifactsDir);
  process.exit(0);
}

main();
