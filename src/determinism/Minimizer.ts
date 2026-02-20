/**
 * Deterministic delta-debugging minimizer for counterexample reduction.
 */

import { stringCompareBinary } from "./CanonicalOrder.js";

export interface MinimizerState {
  changedFiles?: string[];
  diffEntries?: { status: string; path: string }[];
}

type ReproduceFn = (state: MinimizerState) => boolean;

/**
 * Greedy delta debug: remove one component at a time; if failure still reproduces, keep removal.
 * Deterministic: iterate in stable order (sorted indices).
 */
export function minimizeOnFailure(
  state: MinimizerState,
  reproduceFn: ReproduceFn
): MinimizerState {
  let current = { ...state };

  if (current.changedFiles && current.changedFiles.length > 1) {
    const sorted = [...current.changedFiles].sort((a, b) => stringCompareBinary(a, b));
    let reduced: string[] = sorted;
    for (let i = 0; i < sorted.length; i++) {
      const without = sorted.filter((_, j) => j !== i);
      const candidate: MinimizerState = { ...current, changedFiles: without };
      if (reproduceFn(candidate)) {
        reduced = without;
        current = candidate;
        i = -1;
        if (reduced.length <= 1) break;
      }
    }
    current.changedFiles = reduced;
  }

  if (current.diffEntries && current.diffEntries.length > 1) {
    const sorted = [...current.diffEntries].sort((a, b) => {
      const p = stringCompareBinary(a.path, b.path);
      return p !== 0 ? p : stringCompareBinary(a.status, b.status);
    });
    let reduced = sorted;
    for (let i = 0; i < sorted.length; i++) {
      const without = sorted.filter((_, j) => j !== i);
      const candidate: MinimizerState = { ...current, diffEntries: without };
      if (reproduceFn(candidate)) {
        reduced = without;
        current = candidate;
        i = -1;
        if (reduced.length <= 1) break;
      }
    }
    current.diffEntries = reduced;
  }

  return current;
}
