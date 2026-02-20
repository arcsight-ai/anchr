/**
 * Phase 1 — PR sampling. Sort PRs by number, select every Nth to get target count (no cherry-picking).
 */

export interface SamplePrsOptions {
  prNumbers: number[];
  targetCount?: number;
}

/**
 * Returns a deterministic subset of PR numbers.
 * Sort by number ascending, then take every Nth such that we get at most targetCount (default 50).
 */
export function samplePrs(options: SamplePrsOptions): number[] {
  const { prNumbers, targetCount = 50 } = options;
  const sorted = [...prNumbers].sort((a, b) => a - b);
  if (sorted.length <= targetCount) return sorted;
  const step = Math.max(1, Math.floor(sorted.length / targetCount));
  const out: number[] = [];
  for (let i = 0; i < sorted.length && out.length < targetCount; i += step) {
    out.push(sorted[i]!);
  }
  return out.slice(0, targetCount);
}
