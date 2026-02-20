import { resolve } from "path";
import { canonicalPath } from "./canonicalPath.js";
import type { Proof, Violation } from "./types.js";
import type { GraphResult } from "../graph/types.js";
import type { ModuleID } from "../graph/types.js";

function makeProof(source: string, target: string): Proof {
  return {
    type: "circular_import",
    source,
    target,
    rule: "circular_import",
  };
}

/**
 * Converts graph cycles (from detectCycles) into Violation[] compatible with
 * buildDeterministicReport. One violation per cycle; proof points at first edge.
 */
export function cyclesToViolations(
  repoRoot: string,
  graph: GraphResult,
  cycles: ModuleID[][],
): Violation[] {
  const absRoot = resolve(repoRoot);
  const violations: Violation[] = [];

  for (const cycle of cycles) {
    if (cycle.length < 2) continue;
    const meta0 = graph.metadata.get(cycle[0]!);
    const meta1 = graph.metadata.get(cycle[1]!);
    if (!meta0 || !meta1) continue;
    const pkg = meta0.package;
    const path = canonicalPath(meta0.filePath, absRoot);
    const proof = makeProof(meta0.filePath, meta1.filePath);
    violations.push({
      package: pkg,
      path,
      cause: "circular_import",
      proof,
    });
  }

  return violations;
}
