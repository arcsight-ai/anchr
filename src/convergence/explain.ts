import type { BoundaryDelta } from "./compare.js";
import type { ImpactKind } from "./compare.js";

const MAX_BULLETS = 4;

function bulletForDelta(d: BoundaryDelta): string[] {
  const lines: string[] = [];
  if (d.delta < 0) {
    if (d.afterWeight === 0) {
      lines.push("cross-package pressure on this boundary removed");
    } else {
      lines.push("coupling weight reduced");
      lines.push("fewer internal concepts required across the boundary");
    }
  } else if (d.delta > 0) {
    lines.push("coupling weight increased");
    lines.push("more internal concepts accessed across the boundary");
  } else {
    lines.push("coupling unchanged");
  }
  return lines.slice(0, MAX_BULLETS);
}

export function summaryForBoundary(
  d: BoundaryDelta,
  impact: ImpactKind,
): string {
  const bullets = bulletForDelta(d);
  const prefix =
    impact === "IMPROVED"
      ? "Coupling reduced:"
      : impact === "REGRESSED"
        ? "Coupling increased:"
        : impact === "SHIFTED"
          ? "Coupling shifted:"
          : "No change:";
  const body = bullets.map((b) => "• " + b).join("\n");
  return prefix + "\n" + body;
}
