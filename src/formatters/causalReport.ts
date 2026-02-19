/**
 * Human Causal Report — structural, not subjective.
 * Converts audit output into a short causal explanation. No rule wording, no scores.
 * Strict order: Summary, Determinism line, Impact or Stability, Evidence, Suggested boundary.
 */

import type { ArcSightReportLike } from "./law.js";
import { deriveNarrativeKey } from "./law.js";
import { parseMinimalCut } from "../repair/parseReport.js";

export type ArcSightReport = ArcSightReportLike;

function pkgName(p: string): string {
  return p.replace(/^packages\/+/, "").trim();
}

function targetFromSpecifier(spec: string | undefined): string | null {
  if (!spec || typeof spec !== "string") return null;
  const t = spec.replace(/\\/g, "/").trim();
  const m = t.match(/^packages\/([^/]+)/);
  if (m) return m[1] ?? null;
  const first = t.split("/")[0];
  return first && first !== ".." && first !== "." ? first : null;
}

/** Unique (from, to) module pairs from minimalCut, sorted. */
function modulePairs(minimalCut: string[]): Array<{ from: string; to: string }> {
  const seen = new Set<string>();
  const pairs: Array<{ from: string; to: string }> = [];
  const parsed = parseMinimalCut(minimalCut);
  for (const v of parsed) {
    const from = pkgName(v.package);
    if (!from) continue;
    const to = targetFromSpecifier(v.specifier) ?? from;
    const key = `${from}\t${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ from, to });
  }
  pairs.sort((a, b) => {
    const c = a.from.localeCompare(b.from, "en");
    return c !== 0 ? c : a.to.localeCompare(b.to, "en");
  });
  return pairs;
}

/** Suggested boundary direction by cause; max 2 lines, no patches. */
function suggestedBoundary(primaryCause: string | null): string[] {
  switch (primaryCause) {
    case "boundary_violation":
      return ["Import from the package entrypoint instead of internal files."];
    case "type_import_private_target":
      return ["Expose required types via public API."];
    case "relative_escape":
      return ["Move shared logic into a shared module."];
    case "deleted_public_api":
      return ["Re-export the interface or provide a public alias."];
    default:
      return ["Import from the package entrypoint instead of internal files."];
  }
}

/**
 * Format the Human Causal Report. Same report → identical output.
 * Order: Summary, Determinism line, Impact or Stability, Evidence, Suggested boundary.
 */
export function formatCausalReport(report: ArcSightReport): string {
  const key = deriveNarrativeKey(report);
  const level = (report.decision?.level ?? "warn").trim().toLowerCase();
  const primaryCause = (report.classification?.primaryCause ?? null) as string | null;
  const minimalCut = report.minimalCut ?? [];
  const subject = key.subject || "one module";
  const dependency = key.dependency || "another";

  const lines: string[] = [];

  // 1. Structural Summary (always first, exactly one sentence). No filenames or paths.
  if (level === "allow") {
    lines.push("This change does not modify module dependency boundaries.");
  } else if (level === "block") {
    if (primaryCause === "deleted_public_api" && !key.dependency) {
      lines.push("This change removes a public interface that other modules depend on.");
    } else {
      lines.push(`This change makes ${subject} depend on the internal implementation of ${dependency}.`);
    }
  } else {
    lines.push("This change weakens module isolation by introducing a new dependency path.");
  }

  // 2. Determinism Line (always second)
  if (level === "allow") {
    lines.push("No structural dependency changes were detected.");
  } else {
    lines.push("This conclusion is based on module dependency structure, not code style.");
  }

  // 3. Impact or Stability
  if (level === "allow") {
    lines.push("");
    lines.push("No new cross-module dependencies were introduced.");
  } else {
    lines.push("");
    lines.push("Impact");
    lines.push("");
    if (level === "block" && subject && dependency && primaryCause !== "deleted_public_api") {
      lines.push(`Future updates inside ${dependency} may break ${subject} without any public API change.`);
    } else if (level === "block" && primaryCause === "deleted_public_api") {
      lines.push("Future updates may break dependent modules without any public API change.");
    } else {
      lines.push("Future changes may have wider impact than expected due to new coupling.");
    }
  }

  // 4. Evidence (aggregated by module pair)
  const pairs = modulePairs(minimalCut);
  lines.push("");
  lines.push("Evidence");
  lines.push("");
  if (pairs.length === 0 && level !== "allow") {
    lines.push("Structural dependency change detected.");
  } else if (pairs.length > 0) {
    const show = pairs.slice(0, 3);
    for (const p of show) {
      lines.push(`${p.from} → ${p.to} (internal dependency)`);
    }
    if (pairs.length > 3) {
      lines.push(`…and ${pairs.length - 3} similar references`);
    }
  }

  // 5. Suggested boundary (BLOCK and WARN only)
  if (level !== "allow") {
    const boundary = suggestedBoundary(primaryCause);
    if (boundary.length > 0) {
      lines.push("");
      lines.push("Suggested boundary");
      lines.push("");
      for (const b of boundary.slice(0, 2)) lines.push(b);
    }
  }

  return lines.join("\n").replace(/\n+$/, "");
}
