/**
 * Deterministic Architectural Explanation Engine — Scannable Proof Mode.
 * Converts ArcSightReport into a human explanation. Contract guarantee report only.
 * Max 2 sentences per section; fact then consequence. No runtime claims.
 */

import type { ArcSightReportLike } from "./law.js";
import { deriveNarrativeKey } from "./law.js";
import { parseMinimalCut } from "../repair/parseReport.js";

export type ArcSightReport = ArcSightReportLike;

const SEVERITY_ORDER = [
  "deleted_public_api",
  "boundary_violation",
  "type_import_private_target",
  "relative_escape",
  "indeterminate",
  "verified",
] as const;

type Cause = (typeof SEVERITY_ORDER)[number];

function nfc(s: string): string {
  return s.normalize("NFC");
}

function normalizeOut(s: string): string {
  return nfc(s).replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n");
}

/** Pick highest-priority cause from report (multi-violation: explain root cause only). */
function primaryCause(report: ArcSightReport): Cause {
  const key = deriveNarrativeKey(report);
  return (key.severity as Cause) ?? "indeterminate";
}

const GUARANTEE_MAP: Record<Cause, string> = {
  deleted_public_api: "Dependent packages lose a guaranteed interface contract.",
  boundary_violation: "Package isolation boundary is no longer guaranteed.",
  type_import_private_target: "Public type stability is no longer guaranteed.",
  relative_escape: "Package containment is no longer guaranteed.",
  indeterminate: "Guarantee status is unknown.",
  verified: "All guarantees preserved.",
};

const FORMAL_REASONING: Record<Cause, string> = {
  boundary_violation:
    "External code now relies on internal implementation. The dependency contract is bypassed.",
  deleted_public_api:
    "A public interface was removed. Downstream packages cannot rely on stability.",
  type_import_private_target:
    "Type safety depends on a private definition. The public contract cannot guarantee compatibility.",
  relative_escape:
    "Code reaches outside package ownership. Encapsulation guarantees stop applying.",
  indeterminate:
    "The dependency graph cannot be resolved statically. Guarantees cannot be proven.",
  verified: "No contract guarantees changed.",
};

const MINIMAL_REPAIR: Record<Cause, string> = {
  boundary_violation:
    "Import through the package entrypoint instead of internal files.",
  deleted_public_api: "Re-export the interface or provide a public alias.",
  type_import_private_target: "Export the type from the public entrypoint.",
  relative_escape: "Move the file inside the package or expose a public entrypoint.",
  indeterminate: "Make the dependency statically resolvable.",
  verified: "No action required.",
};

const FIX_APPEND =
  "This change restores the guarantee without altering runtime behavior.";

function targetFromSpecifier(spec: string | undefined): string | null {
  if (!spec || typeof spec !== "string") return null;
  const t = spec.replace(/\\/g, "/").trim();
  const m = t.match(/^packages\/([^/]+)/);
  if (m) return m[1] ?? null;
  const first = t.split("/")[0];
  return first && first !== ".." && first !== "." ? first : null;
}

function pkgName(p: string): string {
  return p.replace(/^packages\/+/, "").trim();
}

/** Unique (importer, target) pairs from minimalCut, sorted. Importer = package introducing violation. */
function dependencyPairs(minimalCut: string[]): Array<{ importer: string; target: string }> {
  const seen = new Set<string>();
  const pairs: Array<{ importer: string; target: string }> = [];
  const parsed = parseMinimalCut(minimalCut);
  for (const v of parsed) {
    const importer = pkgName(v.package);
    if (!importer) continue;
    const target = targetFromSpecifier(v.specifier) ?? importer;
    const key = `${importer}\t${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ importer, target });
  }
  pairs.sort((a, b) => {
    const c = a.importer.localeCompare(b.importer, "en");
    return c !== 0 ? c : a.target.localeCompare(b.target, "en");
  });
  return pairs;
}

/** Dependency delta: "This change introduces a dependency on X." plus "A depends on B" lines. BLOCK never empty. */
function whatChanged(minimalCut: string[]): string {
  const pairs = dependencyPairs(minimalCut);
  if (pairs.length === 0) return "This change affects package boundaries.";
  const targets = [...new Set(pairs.map((p) => p.target))].sort((a, b) => a.localeCompare(b, "en"));
  const firstLine =
    targets.length === 1
      ? `This change introduces a dependency on ${targets[0]}.`
      : `This change introduces dependencies on ${targets.join(", ")}.`;
  const depLines = pairs.map((p) => `${p.importer} depends on ${p.target}`);
  return [firstLine, ...depLines].join("\n");
}

/** Packages for which guarantees no longer hold (scope). */
function affectedPackages(minimalCut: string[]): string[] {
  const set = new Set<string>();
  const parsed = parseMinimalCut(minimalCut);
  for (const v of parsed) {
    const importer = pkgName(v.package);
    if (importer) set.add(importer);
    const t = targetFromSpecifier(v.specifier);
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Format deterministic architectural explanation. Same graph → identical output.
 * Max 2 sentences per section; fact then consequence. No runtime vocabulary.
 */
export function formatExplanation(report: ArcSightReport): string {
  const level = (report.decision?.level ?? "warn").trim().toLowerCase();
  const cause = primaryCause(report);
  const minimalCut = report.minimalCut ?? [];

  if (level === "allow") {
    const out = "Architecture unchanged.\nAll dependency guarantees remain intact.";
    return normalizeOut(out);
  }

  const whyFailed = GUARANTEE_MAP[cause] ?? GUARANTEE_MAP.indeterminate;
  const whatChangedBlk = whatChanged(minimalCut);
  const packages = affectedPackages(minimalCut);
  const impactLine =
    level === "block"
      ? "Guarantees no longer hold for:"
      : "Guarantee status unknown for:";
  const impactList = packages.length > 0 ? packages.join("\n") : "affected packages";
  const whyMatters = FORMAL_REASONING[cause] ?? FORMAL_REASONING.indeterminate;
  const fixBase = MINIMAL_REPAIR[cause] ?? MINIMAL_REPAIR.indeterminate;
  const fix =
    cause === "verified"
      ? fixBase
      : `${fixBase} ${FIX_APPEND}`;

  const sections = [
    "Why it failed:",
    whyFailed,
    "",
    "What changed:",
    whatChangedBlk,
    "",
    "Impact:",
    impactLine,
    impactList,
    "",
    "Why that matters:",
    whyMatters,
    "",
    "How to fix:",
    fix,
  ];

  return normalizeOut(sections.join("\n"));
}
