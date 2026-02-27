/**
 * Gate PR comment (Prompt 3). Architectural, decisive, screenshot-worthy.
 * Presentation layer only. No structural logic. Deterministic.
 */

import { createHash } from "crypto";
import { parseMinimalCut, type ParsedViolation } from "../repair/parseReport.js";
import { normalizeComment } from "./v5.js";

const ANCHOR = "<!-- arcsight:comment -->";
const GATE_MARKER = "<!-- ANCHR:GATE:V1 -->";
const VERSION = "5";
const MAX_VIOLATION_LINES = 15;
const CATEGORY_ORDER: string[] = [
  "circular_import",
  "boundary_violation",
  "type_import_private_target",
  "deleted_public_api",
  "relative_escape",
];
const CATEGORY_LABELS: Record<string, string> = {
  circular_import: "New cycle introduced",
  boundary_violation: "Cross-domain dependency",
  type_import_private_target: "Cross-domain dependency",
  deleted_public_api: "Deleted public API",
  relative_escape: "Relative path escape",
};

/** Frozen suggestion bullets by violation type (Prompt 4). Order: Cycle, Cross-domain, Deleted, Relative. */
const SUGGESTION_ORDER: string[] = [
  "circular_import",
  "boundary_violation",
  "type_import_private_target",
  "deleted_public_api",
  "relative_escape",
];
const FROZEN_SUGGESTIONS: Record<string, string> = {
  circular_import: "Remove one dependency in the cycle chain",
  boundary_violation: "Route dependency through target package public API",
  type_import_private_target: "Add explicit export in target package index",
  deleted_public_api: "Restore removed export or update downstream imports to new public surface",
  relative_escape: "Replace relative path with public package import",
};

const MAX_SUGGESTION_BULLETS = 5;

/** Architectural delta: count of minimalCut by display category (Prompt A). Frozen order. */
const DELTA_ORDER: string[] = ["cycle", "cross-domain", "deleted_public_api", "relative_escape"];
const DELTA_LABELS: Record<string, string> = {
  cycle: "Cycles",
  "cross-domain": "Cross-domain edges",
  deleted_public_api: "Deleted public APIs",
  relative_escape: "Relative path escapes",
};
/** Map report cause to delta category. */
function causeToDeltaCategory(cause: string): string {
  if (cause === "circular_import") return "cycle";
  if (cause === "boundary_violation" || cause === "type_import_private_target") return "cross-domain";
  if (cause === "deleted_public_api") return "deleted_public_api";
  if (cause === "relative_escape") return "relative_escape";
  return "cross-domain";
}

/** Count minimalCut entries by delta category. Deterministic: same minimalCut → same counts. */
function countDeltaByCategory(minimalCut: string[]): Record<string, number> {
  const parsed = parseMinimalCut([...minimalCut].sort((a, b) => a.localeCompare(b, "en")));
  const counts: Record<string, number> = {
    cycle: 0,
    "cross-domain": 0,
    deleted_public_api: 0,
    relative_escape: 0,
  };
  for (const v of parsed) {
    const cat = causeToDeltaCategory(v.cause);
    if (cat in counts) counts[cat]++;
  }
  return counts;
}

/** Format architectural delta block. Render only when minimalCut non-empty and status BLOCKED or INDETERMINATE. */
function formatArchitecturalDelta(minimalCut: string[], status: string): string[] {
  if (minimalCut.length === 0) return [];
  if (status !== "BLOCKED" && status !== "INDETERMINATE") return [];
  const counts = countDeltaByCategory(minimalCut);
  const lines: string[] = ["Architectural delta:", ""];
  for (const cat of DELTA_ORDER) {
    const label = DELTA_LABELS[cat];
    const n = counts[cat] ?? 0;
    const value = n > 0 ? `+${n}` : "0";
    lines.push(`• ${label}: ${value}`);
  }
  lines.push("");
  return lines;
}

/** Impact layer (Prompt B). Frozen mapping. One bullet per present type; order fixed. */
const IMPACT_ORDER: string[] = ["cycle", "cross-domain", "deleted_public_api", "relative_escape"];
const IMPACT_MAP: Record<string, string> = {
  cycle: "Hidden coupling introduced",
  "cross-domain": "Repository boundary violation",
  deleted_public_api: "Public contract instability",
  relative_escape: "Layer boundary bypass",
};
const KNOWN_CAUSES = new Set<string>([
  "circular_import",
  "boundary_violation",
  "type_import_private_target",
  "deleted_public_api",
  "relative_escape",
]);

function formatImpact(minimalCut: string[] | undefined, status: string): string[] {
  if (!minimalCut || minimalCut.length === 0) return [];
  if (status !== "BLOCKED" && status !== "INDETERMINATE") return [];
  const parsed = parseMinimalCut(minimalCut);
  const present = new Set<string>();
  for (const v of parsed) {
    const cause = v && typeof v.cause === "string" ? v.cause : "";
    if (!KNOWN_CAUSES.has(cause)) continue;
    const key = causeToDeltaCategory(cause);
    if (key in IMPACT_MAP) present.add(key);
  }
  const lines: string[] = ["Impact:", ""];
  for (const key of IMPACT_ORDER) {
    if (present.has(key)) lines.push(`• ${IMPACT_MAP[key]}`);
  }
  if (lines.length === 2) return [];
  lines.push("");
  return lines;
}

export type GateReport = {
  status: string;
  minimalCut?: string[];
  classification?: { primaryCause?: string | null };
  decision?: { level?: string };
  run?: { id?: string };
  /** When status is INCOMPLETE due to scope (max_files or timeout). Display-only. */
  scopeExceeded?: { reason: string; changedFiles?: number; maxFiles?: number };
};

export type GateMode = "STRICT" | "ADVISORY";

export interface GateCommentMeta {
  repo: string;
  prNumber: number;
  headSha: string;
  baseSha: string;
  runId: string;
  decisionLevel: "allow" | "block" | "warn";
}

/** Package-level only for cycles (architectural, not file-scoped). */
function cyclePackageChain(items: { package: string }[]): string {
  const pkgs = [...new Set(items.map((v) => v.package))].sort((a, b) => a.localeCompare(b, "en"));
  if (pkgs.length === 0) return "";
  if (pkgs.length === 1) return `• packages/${pkgs[0]}`;
  return `• packages/${pkgs.join(" → packages/")} → packages/${pkgs[0]}`;
}

function violationLine(v: { package: string; path: string; cause: string; specifier?: string }): string {
  if (v.cause === "boundary_violation" || v.cause === "type_import_private_target") {
    if (v.specifier) {
      const targetPkg = v.specifier.replace(/^@[^/]+\//, "").split("/")[0] ?? v.specifier;
      return `• packages/${v.package} importing internal module from packages/${targetPkg}`;
    }
    return `• packages/${v.package}: ${v.path}`;
  }
  if (v.cause === "deleted_public_api") return `• packages/${v.package}: ${v.path} (deleted public API)`;
  if (v.cause === "relative_escape") return `• packages/${v.package}: ${v.path} (relative escape)`;
  return `• packages/${v.package}: ${v.path}`;
}

function formatViolations(minimalCut: string[]): string[] {
  const parsed = parseMinimalCut([...minimalCut].sort((a, b) => a.localeCompare(b, "en")));
  const byCause = new Map<string, typeof parsed>();
  for (const v of parsed) {
    if (!byCause.has(v.cause)) byCause.set(v.cause, []);
    byCause.get(v.cause)!.push(v);
  }
  const lines: string[] = [];
  let lineCount = 0;
  let bulletsShown = 0;
  for (const cause of CATEGORY_ORDER) {
    const items = byCause.get(cause);
    if (!items || items.length === 0) continue;
    const label = CATEGORY_LABELS[cause] ?? cause;
    if (lineCount >= MAX_VIOLATION_LINES) {
      const more = minimalCut.length - bulletsShown;
      if (more > 0) lines.push(`...and ${more} more violations.`);
      return lines;
    }
    lines.push(`${label}:`);
    lines.push("");
    lineCount += 2;
    if (cause === "circular_import") {
      const chain = cyclePackageChain(items);
      if (chain) {
        lines.push(chain);
        lineCount++;
        bulletsShown += items.length;
      }
    } else {
      for (const v of items) {
        if (lineCount >= MAX_VIOLATION_LINES) {
          const more = minimalCut.length - bulletsShown;
          if (more > 0) lines.push(`...and ${more} more violations.`);
          return lines;
        }
        lines.push(violationLine(v));
        lineCount++;
        bulletsShown++;
      }
    }
  }
  return lines;
}

/** Cross-domain causes that can yield a copy-paste fix (internal import → public surface). */
const CROSS_DOMAIN_CAUSES = new Set<string>(["boundary_violation", "type_import_private_target"]);

/** First cross-domain violation in canonical order (same as formatViolations). Deterministic. */
function firstCrossDomainViolation(minimalCut: string[]): ParsedViolation | null {
  const parsed = parseMinimalCut([...minimalCut].sort((a, b) => a.localeCompare(b, "en")));
  const byCause = new Map<string, ParsedViolation[]>();
  for (const v of parsed) {
    if (!byCause.has(v.cause)) byCause.set(v.cause, []);
    byCause.get(v.cause)!.push(v);
  }
  for (const cause of CATEGORY_ORDER) {
    if (!CROSS_DOMAIN_CAUSES.has(cause)) continue;
    const items = byCause.get(cause);
    if (items && items.length > 0) return items[0]!;
  }
  return null;
}

/** Only these path segments count as "internal" for copy-paste snippet. No guessing. */
const INTERNAL_PATH_REGEX = /\/src\/(internal|_internal|private|impl)(?:\/|\.|$)/;

/** Pick index extension from original specifier. Deterministic: .ts/.tsx → index.ts, .js/.jsx/.mjs/.cjs → index.js, else index.ts. */
function indexExtensionForSpecifier(norm: string): string {
  const base = norm.slice(norm.lastIndexOf("/") + 1);
  if (base.endsWith(".ts")) return "index.ts";
  if (base.endsWith(".tsx")) return "index.ts";
  if (base.endsWith(".js") || base.endsWith(".jsx") || base.endsWith(".mjs") || base.endsWith(".cjs")) return "index.js";
  return "index.ts";
}

/**
 * Derive a safe replacement for an internal import. Returns null if we cannot confidently derive one.
 * Only uses specifier string; no filesystem. Allows only /src/internal, /src/_internal, /src/private, /src/impl.
 * Replacement: same prefix up to /src/ + index.<ext> (ext from original: .ts/.tsx→index.ts, .js/…→index.js, else index.ts).
 */
function deriveCopyPasteSnippet(v: ParsedViolation): string[] | null {
  const spec = v.specifier;
  if (!spec || typeof spec !== "string") return null;
  const norm = spec.replace(/\\/g, "/");
  if (!INTERNAL_PATH_REGEX.test(norm)) return null;
  const srcIdx = norm.indexOf("/src/");
  if (srcIdx < 0) return null;
  const indexFile = indexExtensionForSpecifier(norm);
  const replacement = norm.slice(0, srcIdx + 5) + indexFile;
  return [
    "Copy-paste fix (example):",
    "",
    "Replace the internal import with the package's public surface.",
    "",
    "```diff",
    `- import { … } from "${spec}";`,
    `+ import { … } from "${replacement}";`,
    "```",
    "",
  ];
}

/** Deterministic suggestions from minimalCut only. Order: Cycle, Cross-domain, Deleted, Relative. Max 5. */
function buildSuggestionsFromMinimalCut(minimalCut: string[]): string[] {
  const parsed = parseMinimalCut([...minimalCut].sort((a, b) => a.localeCompare(b, "en")));
  const causes = [...new Set(parsed.map((v) => v.cause))];
  const ordered = SUGGESTION_ORDER.filter((c) => causes.includes(c));
  const bullets: string[] = [];
  for (const cause of ordered) {
    const text = FROZEN_SUGGESTIONS[cause];
    if (text && !bullets.includes(text)) bullets.push(text);
    if (bullets.length >= MAX_SUGGESTION_BULLETS) break;
  }
  return bullets;
}

function buildVisibleBody(
  report: GateReport,
  mode: GateMode,
  suggestionBullets?: string[],
  suggestionSource?: "convergence" | "minimalCut",
): string[] {
  const status = report.status ?? "INCOMPLETE";
  const decisionLevel = report.decision?.level ?? "warn";
  const minimalCut = report.minimalCut ?? [];
  const hasViolations = minimalCut.length > 0;

  const scopeExceededOnly = status === "INCOMPLETE" && report.scopeExceeded;
  if (
    status === "VERIFIED" ||
    (!hasViolations && status !== "BLOCKED" && status !== "INDETERMINATE" && !scopeExceededOnly)
  ) {
    const clean: string[] = [
      "✅ No architectural drift detected.",
      "",
      "This change preserves defined repository boundaries.",
      "",
      `Mode: ${mode}`,
      "",
      "ANCHR — Structural Firewall for AI-generated code.",
    ];
    const runId = report.run?.id;
    if (typeof runId === "string" && runId.length >= 8) {
      clean.push("");
      clean.push(`Structural signature: ${runId.slice(0, 8).toLowerCase()}`);
    }
    return clean;
  }

  const isBlock = decisionLevel === "block";
  const headline = isBlock
    ? "❌ Architectural drift detected. Merge blocked."
    : "⚠️ Architectural drift detected.";
  const explanation =
    "This change introduces structural coupling that violates repository boundaries.";
  const lines: string[] = [headline, "", explanation, ""];

  if (scopeExceededOnly && report.scopeExceeded) {
    const scopeExceeded = report.scopeExceeded;
    lines.push("Analysis scope exceeded:");
    lines.push("");
    if (scopeExceeded.reason === "max_files" && scopeExceeded.changedFiles != null && scopeExceeded.maxFiles != null) {
      lines.push(`• Changed files: ${scopeExceeded.changedFiles} (max ${scopeExceeded.maxFiles})`);
    }
    if (scopeExceeded.reason === "timeout") {
      lines.push("• Analysis timed out");
    }
    lines.push("• Structural analysis skipped");
    lines.push("");
    lines.push("Resolve the violations above and re-run CI.");
    lines.push("");
    lines.push(
      isBlock
        ? `Mode: ${mode} — architectural violations block merge.`
        : `Mode: ${mode} — architectural violations do not block merge.`,
    );
    lines.push("");
    lines.push("ANCHR — Structural Firewall for AI-generated code.");
    const runId = report.run?.id;
    if (typeof runId === "string" && runId.length >= 8) {
      lines.push("");
      lines.push(`Structural signature: ${runId.slice(0, 8).toLowerCase()}`);
    }
    return lines;
  }

  const deltaLines = formatArchitecturalDelta(minimalCut, status);
  if (deltaLines.length > 0) lines.push(...deltaLines);

  const impactLines = formatImpact(report.minimalCut, status);
  if (impactLines.length > 0) lines.push(...impactLines);

  const showSuggestions = status === "BLOCKED" || status === "INDETERMINATE";
  const suggestionBulletsList =
    suggestionBullets && suggestionBullets.length > 0
      ? suggestionBullets
      : hasViolations
        ? buildSuggestionsFromMinimalCut(minimalCut)
        : [];
  const previewBullets = suggestionBulletsList.slice(0, MAX_SUGGESTION_BULLETS);
  if (showSuggestions && previewBullets.length > 0) {
    lines.push("Suggested structural correction:");
    lines.push("");
    lines.push("Apply the following structural correction.");
    lines.push("");
    for (const b of previewBullets) lines.push(`• ${b}`);
    if (suggestionBulletsList.length > MAX_SUGGESTION_BULLETS) {
      lines.push(`… and ${suggestionBulletsList.length - MAX_SUGGESTION_BULLETS} additional structural adjustments`);
    }
    if (suggestionSource === "convergence") {
      lines.push("");
      lines.push("Source: convergence");
    } else if (suggestionSource === "minimalCut") {
      lines.push("");
      lines.push("Source: minimalCut fallback");
    }
    const firstCross = firstCrossDomainViolation(minimalCut);
    const snippetLines = firstCross ? deriveCopyPasteSnippet(firstCross) : null;
    if (snippetLines && snippetLines.length > 0) {
      lines.push("");
      lines.push(...snippetLines);
    }
    lines.push("");
  }

  if (hasViolations) {
    lines.push(...formatViolations(minimalCut));
    lines.push("");
  }

  lines.push("Resolve the violations above and re-run CI.");
  lines.push("");
  lines.push(
    isBlock
      ? `Mode: ${mode} — architectural violations block merge.`
      : `Mode: ${mode} — architectural violations do not block merge.`,
  );
  lines.push("");
  lines.push("ANCHR — Structural Firewall for AI-generated code.");

  const runId = report.run?.id;
  if (typeof runId === "string" && runId.length >= 8) {
    lines.push("");
    lines.push(`Structural signature: ${runId.slice(0, 8).toLowerCase()}`);
  }

  return lines;
}

/**
 * Build full gate comment (visible + metadata). Deterministic.
 * Same report + mode → same output. No timestamps.
 * Optional suggestionBullets: when present (from repair/fix-suggestions artifact), used for Structural improvement preview; else derived from minimalCut.
 * When report.run.id exists (≥8 chars), appends deterministic structural signature line (first 8 chars, lowercase); presentation-only, not part of enforcement.
 */
export function buildGateComment(
  report: GateReport,
  mode: GateMode,
  meta: GateCommentMeta,
  suggestionBullets?: string[],
  suggestionSource?: "convergence" | "minimalCut",
): string {
  const visibleLines = buildVisibleBody(report, mode, suggestionBullets, suggestionSource);
  const hashPlaceholder = "<!-- arcsight:hash: -->";
  const metadataLinesForHash = [
    ANCHOR,
    GATE_MARKER,
    `<!-- arcsight:version:${VERSION} -->`,
    `<!-- arcsight:repo:${meta.repo} -->`,
    `<!-- arcsight:pr:${meta.prNumber} -->`,
    `<!-- arcsight:head:${meta.headSha} -->`,
    `<!-- arcsight:base:${meta.baseSha} -->`,
    `<!-- arcsight:run:${meta.runId} -->`,
    `<!-- arcsight:decision:${meta.decisionLevel} -->`,
    hashPlaceholder,
  ];
  const bodyForHash = [...metadataLinesForHash, "", ...visibleLines].join("\n");
  const normalizedForHash = normalizeComment(bodyForHash);
  const hash = createHash("sha256").update(normalizedForHash, "utf8").digest("hex");
  const finalMetadata = [
    ANCHOR,
    GATE_MARKER,
    `<!-- arcsight:version:${VERSION} -->`,
    `<!-- arcsight:repo:${meta.repo} -->`,
    `<!-- arcsight:pr:${meta.prNumber} -->`,
    `<!-- arcsight:head:${meta.headSha} -->`,
    `<!-- arcsight:base:${meta.baseSha} -->`,
    `<!-- arcsight:run:${meta.runId} -->`,
    `<!-- arcsight:decision:${meta.decisionLevel} -->`,
    `<!-- arcsight:hash:${hash} -->`,
  ];
  const fullComment = [...finalMetadata, "", ...visibleLines].join("\n");
  return normalizeComment(fullComment);
}
