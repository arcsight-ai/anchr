import {
  pressureKey,
  weightFromKey,
  boundariesFromPressureMap,
} from "./pressure.js";

const RENAME_OVERLAP_THRESHOLD = 0.6;
const SIGNIFICANCE_DELTA_THRESHOLD = 2;
const SIGNIFICANCE_CHANGED_COUNT_THRESHOLD = 1;

function tokensFromKey(key: string): string[] {
  const colon = key.indexOf(":");
  return colon >= 0 ? key.slice(colon + 1).split(",").filter(Boolean) : [];
}

function tokenOverlap(key1: string, key2: string): number {
  const t1 = new Set(tokensFromKey(key1));
  const t2 = new Set(tokensFromKey(key2));
  if (t1.size === 0 && t2.size === 0) return 1;
  let intersection = 0;
  for (const t of t1) {
    if (t2.has(t)) intersection++;
  }
  const maxSize = Math.max(t1.size, t2.size);
  return maxSize === 0 ? 0 : intersection / maxSize;
}

function findRenameMatch(
  disappeared: string,
  appearedKeys: string[],
): string | null {
  for (const k of appearedKeys) {
    if (tokenOverlap(disappeared, k) >= RENAME_OVERLAP_THRESHOLD) {
      return k;
    }
  }
  return null;
}

export function applyRenameStabilization(
  before: Map<string, number>,
  after: Map<string, number>,
): { beforeAdjusted: Map<string, number>; afterAdjusted: Map<string, number> } {
  const beforeKeys = [...before.keys()];
  const afterKeys = [...after.keys()];

  const removed = beforeKeys.filter((k) => !after.has(k));
  const added = afterKeys.filter((k) => !before.has(k));

  const matchedPairs: [string, string][] = [];
  const matchedAdded = new Set<string>();

  for (const r of removed) {
    const m = findRenameMatch(r, added);
    if (m && !matchedAdded.has(m)) {
      matchedPairs.push([r, m]);
      matchedAdded.add(m);
    }
  }

  const beforeAdjusted = new Map(before);
  const afterAdjusted = new Map(after);

  for (const [r, m] of matchedPairs) {
    const w = after.get(m) ?? weightFromKey(m);
    beforeAdjusted.set(r, w);
    afterAdjusted.set(r, w);
    afterAdjusted.delete(m);
  }

  return { beforeAdjusted, afterAdjusted };
}

export function getSharedBoundaries(
  before: Map<string, number>,
  after: Map<string, number>,
): Set<string> {
  const bBoundaries = boundariesFromPressureMap(before);
  const aBoundaries = boundariesFromPressureMap(after);
  const shared = new Set<string>();
  for (const b of bBoundaries) {
    if (aBoundaries.has(b)) shared.add(b);
  }
  return shared;
}

export function weightByBoundary(
  pressureMap: Map<string, number>,
  boundary: string,
): number {
  let sum = 0;
  for (const [key, weight] of pressureMap) {
    if (key.startsWith(boundary + ":")) sum += weight;
  }
  return sum;
}

export type ImpactKind = "IMPROVED" | "REGRESSED" | "SHIFTED" | "UNCHANGED";

export interface BoundaryDelta {
  from: string;
  to: string;
  beforeWeight: number;
  afterWeight: number;
  delta: number;
}

export function classifyImpact(
  beforeAdjusted: Map<string, number>,
  afterAdjusted: Map<string, number>,
  sharedBoundaries: Set<string>,
): { impact: ImpactKind; deltas: BoundaryDelta[] } {
  const deltas: BoundaryDelta[] = [];

  for (const boundary of sharedBoundaries) {
    const [from, to] = boundary.split("→");
    if (!from || !to) continue;
    const beforeWeight = weightByBoundary(beforeAdjusted, boundary);
    const afterWeight = weightByBoundary(afterAdjusted, boundary);
    deltas.push({
      from,
      to,
      beforeWeight,
      afterWeight,
      delta: afterWeight - beforeWeight,
    });
  }

  deltas.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to, "en"));

  const beforeOnly = [...beforeAdjusted.keys()].filter((k) => {
    const b = k.slice(0, k.indexOf(":"));
    return sharedBoundaries.has(b);
  }).length;
  const afterOnly = [...afterAdjusted.keys()].filter((k) => {
    const b = k.slice(0, k.indexOf(":"));
    return sharedBoundaries.has(b);
  }).length;

  const addedCount = [...afterAdjusted.keys()].filter((k) => !beforeAdjusted.has(k)).length;
  const removedCount = [...beforeAdjusted.keys()].filter((k) => !afterAdjusted.has(k)).length;
  const changedPressureCount = addedCount + removedCount;

  const totalDelta = deltas.reduce((s, d) => s + d.delta, 0);
  const maxAbsDelta = deltas.length
    ? Math.max(...deltas.map((d) => Math.abs(d.delta)))
    : 0;

  let impact: ImpactKind = "UNCHANGED";

  if (changedPressureCount === 0 && deltas.every((d) => d.delta === 0)) {
    impact = "UNCHANGED";
  } else if (
    maxAbsDelta < SIGNIFICANCE_DELTA_THRESHOLD &&
    changedPressureCount <= SIGNIFICANCE_CHANGED_COUNT_THRESHOLD
  ) {
    impact = "UNCHANGED";
  } else if (totalDelta < 0 || removedCount > addedCount) {
    impact = "IMPROVED";
  } else if (totalDelta > 0 || addedCount > removedCount) {
    impact = "REGRESSED";
  } else if (totalDelta === 0 && changedPressureCount > 0) {
    impact = "SHIFTED";
  }

  return { impact, deltas };
}
