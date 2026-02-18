import type { ImpactKind, BoundaryDelta } from "./compare.js";
import { summaryForBoundary } from "./explain.js";

export interface ConvergenceBoundary {
  from: string;
  to: string;
  beforeWeight: number;
  afterWeight: number;
  summary: string;
}

export interface ConvergenceOutput {
  mode: "convergence";
  impact: ImpactKind;
  boundaries: ConvergenceBoundary[];
}

function stableStringify(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj === "boolean") return String(obj);
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "string") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map((v) => stableStringify(v)).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b, "en"));
    const parts = keys.map(
      (k) => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k]),
    );
    return "{" + parts.join(",") + "}";
  }
  return "null";
}

export function buildConvergenceOutput(
  impact: ImpactKind,
  deltas: BoundaryDelta[],
): ConvergenceOutput {
  const boundaries: ConvergenceBoundary[] = deltas.map((d) => ({
    from: d.from,
    to: d.to,
    beforeWeight: d.beforeWeight,
    afterWeight: d.afterWeight,
    summary: summaryForBoundary(d, impact),
  }));

  boundaries.sort((a, b) =>
    (a.from + a.to).localeCompare(b.from + b.to, "en"),
  );

  return {
    mode: "convergence",
    impact,
    boundaries,
  };
}

export function writeConvergenceJson(output: ConvergenceOutput): string {
  return stableStringify(output) + "\n";
}
