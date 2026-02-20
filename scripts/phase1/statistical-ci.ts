/**
 * Phase 1 — Statistical confidence (Step 10). CI ≈ ± sqrt(p(1-p)/n).
 */

export function precisionCI(
  truePositives: number,
  falsePositives: number
): { precision: number; n: number; ciHalfWidth: number; ciLower: number; ciUpper: number } {
  const n = truePositives + falsePositives;
  const p = n ? truePositives / n : 0;
  const ciHalfWidth = n ? Math.sqrt((p * (1 - p)) / n) : 0;
  return {
    precision: p,
    n,
    ciHalfWidth,
    ciLower: Math.max(0, p - ciHalfWidth),
    ciUpper: Math.min(1, p + ciHalfWidth),
  };
}
