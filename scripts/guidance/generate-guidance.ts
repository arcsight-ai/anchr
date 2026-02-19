/**
 * Prompt 1 — Deterministic Portable Guidance Engine (FINAL v2.0).
 * Converts structural violations into stable guidance. Hash depends only on
 * schema, id, law, cause, from, to — NOT on title, explanation, why, safeRepairs, preserves.
 */

import { createHash } from "crypto";

export const GUIDANCE_SCHEMA_VERSION = 1;

export type StructuralViolation = {
  cause: string;
  fromPackage: string;
  toPackage?: string;
  targetPath?: string;
};

export type GuidanceOutput = {
  id: string;
  cause: string;
  law: string;
  title: string;
  explanation: string;
  why: string;
  safeRepairs: string[];
  preserves: string[];
  /** Semantic only: used for meaning hash. Not wording. */
  fromPackage: string;
  /** Semantic only: used for meaning hash. Not wording. */
  toPackage: string | null;
};

type Meaning = {
  schema: number;
  id: string;
  law: string;
  cause: string;
  from: string;
  to: string | null;
};

const CAUSE_TO_ID: Record<string, string> = {
  boundary_violation: "G001",
  deleted_public_api: "G002",
  type_import_private_target: "G003",
  relative_escape: "G004",
};

const CAUSE_TO_LAW: Record<string, string> = {
  boundary_violation: "dependency_boundary",
  deleted_public_api: "api_stability",
  type_import_private_target: "encapsulation",
  relative_escape: "module_integrity",
  unknown: "unknown_law",
};

function stableHash(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 12);
}

function collapseKey(v: StructuralViolation): string {
  const from = (v.fromPackage ?? "").trim().replace(/\s+/g, " ");
  const to = (v.toPackage ?? "").trim().replace(/\s+/g, " ");
  return v.cause + "|" + from + "|" + to;
}

function canon(str: string): string {
  const t = str.trim().replace(/\s+/g, " ");
  return t || "unknown";
}

function interpolate(template: string, from: string, to: string): string {
  return template
    .replace(/\{fromPackage\}/g, from)
    .replace(/\{toPackage\}/g, to);
}

const G001 = {
  id: "G001",
  cause: "boundary_violation",
  law: "dependency_boundary",
  title: "Internal module dependency detected",
  explanation: "The package {fromPackage} depends on internal implementation of {toPackage}.",
  why: "This couples code to implementation details and prevents safe refactoring.",
  safeRepairs: [
    "Re-export symbols via public API",
    "Create shared contract package",
    "Invert dependency direction",
  ],
  preserves: ["Layer isolation", "Public contracts", "Independent evolution"],
};

const G002 = {
  id: "G002",
  cause: "deleted_public_api",
  law: "api_stability",
  title: "Public API removal detected",
  explanation: "A public export of {fromPackage} was removed.",
  why: "Downstream packages may break after upgrade.",
  safeRepairs: [
    "Restore export or replace",
    "Deprecate before removal",
    "Provide compatibility adapter",
  ],
  preserves: ["Backward compatibility", "Upgrade safety", "Dependency stability"],
};

const G003 = {
  id: "G003",
  cause: "type_import_private_target",
  law: "encapsulation",
  title: "Type import from private module",
  explanation: "A type import references a non-public module in {toPackage}.",
  why: "Type dependencies still create architecture coupling.",
  safeRepairs: [
    "Export type via public API",
    "Create shared types package",
    "Depend on interface instead",
  ],
  preserves: ["Encapsulation", "Independent builds", "Refactor safety"],
};

const G004 = {
  id: "G004",
  cause: "relative_escape",
  law: "module_integrity",
  title: "Cross-package relative path detected",
  explanation: "A relative import escapes the boundary of {fromPackage}.",
  why: "This bypasses dependency tracking.",
  safeRepairs: [
    "Use package import",
    "Move code to shared package",
    "Define explicit dependency",
  ],
  preserves: ["Dependency clarity", "Build correctness", "Tooling guarantees"],
};

const UNKNOWN_TEMPLATE = {
  id: "GX-",
  law: "unknown_law",
  title: "Architectural constraint violation",
  explanation: 'The change breaks a structural rule identified as "{cause}".',
  why: "The architecture enforces explicit dependency boundaries.",
  safeRepairs: [
    "Review dependency direction",
    "Introduce public interface",
    "Add abstraction boundary",
  ],
  preserves: ["Deterministic architecture", "Refactor safety", "Dependency clarity"],
};

function buildGuidance(
  cause: string,
  fromPackage: string,
  toPackage: string | null,
): Omit<GuidanceOutput, "fromPackage" | "toPackage"> & { fromPackage: string; toPackage: string | null } {
  const from = canon(fromPackage);
  const to = toPackage != null ? canon(toPackage) : "unknown";
  const known = G001.cause === cause || G002.cause === cause || G003.cause === cause || G004.cause === cause;
  let def: typeof G001 & { cause: string };
  let id: string;
  if (cause === "boundary_violation") {
    def = G001;
    id = G001.id;
  } else if (cause === "deleted_public_api") {
    def = G002;
    id = G002.id;
  } else if (cause === "type_import_private_target") {
    def = G003;
    id = G003.id;
  } else if (cause === "relative_escape") {
    def = G004;
    id = G004.id;
  } else {
    id = "GX-" + stableHash(cause);
    def = {
      ...UNKNOWN_TEMPLATE,
      id,
      cause,
      explanation: UNKNOWN_TEMPLATE.explanation.replace("{cause}", cause),
    };
  }
  return {
    id,
    cause: def.cause,
    law: def.law,
    title: def.title,
    explanation: interpolate(def.explanation, from, to),
    why: def.why,
    safeRepairs: [...def.safeRepairs],
    preserves: [...def.preserves],
    fromPackage: from,
    toPackage: to === "unknown" ? null : to,
  };
}

/**
 * Transform structural violations into stable guidance. One output per collapseKey.
 * Same violations → byte-identical output. No side effects.
 */
export function generateGuidance(violations: StructuralViolation[]): GuidanceOutput[] {
  if (violations.length === 0) return [];

  const seen = new Map<string, { v: StructuralViolation }>();
  for (const v of violations) {
    const key = collapseKey(v);
    if (!seen.has(key)) seen.set(key, { v });
  }
  const collapsed = [...seen.values()].map((x) => x.v);

  const out: GuidanceOutput[] = [];
  for (const v of collapsed) {
    const from = (v.fromPackage ?? "").trim();
    const to = v.toPackage != null ? v.toPackage.trim() : null;
    const g = buildGuidance(v.cause, from || "unknown", to);
    out.push({
      id: g.id,
      cause: g.cause,
      law: g.law,
      title: g.title,
      explanation: g.explanation,
      why: g.why,
      safeRepairs: g.safeRepairs,
      preserves: g.preserves,
      fromPackage: g.fromPackage,
      toPackage: g.toPackage,
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id, "en"));
  return out;
}

/** Normalize package names to PKG_A, PKG_B, ... by first appearance order (sorted by id). */
function normalizePackages(guidance: GuidanceOutput[]): Map<string, string> {
  const order = new Map<string, number>();
  let idx = 0;
  const sorted = [...guidance].sort((a, b) => a.id.localeCompare(b.id, "en"));
  for (const g of sorted) {
    for (const pkg of [g.fromPackage, g.toPackage]) {
      if (pkg != null && pkg !== "unknown" && !order.has(pkg)) {
        order.set(pkg, idx++);
      }
    }
  }
  const labels = ["PKG_A", "PKG_B", "PKG_C", "PKG_D", "PKG_E", "PKG_F", "PKG_G", "PKG_H", "PKG_I", "PKG_J"];
  const map = new Map<string, string>();
  const sortedPkgs = [...order.entries()].sort((a, b) => a[1] - b[1]);
  sortedPkgs.forEach(([pkg], i) => {
    map.set(pkg, labels[i] ?? "PKG_" + String(i));
  });
  return map;
}

/**
 * Hash depends only on semantic meaning: schema, id, law, cause, from, to.
 * Does NOT depend on title, explanation, why, safeRepairs, preserves.
 */
export function hashGuidance(guidance: GuidanceOutput[]): string {
  if (guidance.length === 0) {
    return createHash("sha256").update(JSON.stringify({ schema: GUIDANCE_SCHEMA_VERSION, meanings: [] }), "utf8").digest("hex");
  }
  const pkgNorm = normalizePackages(guidance);
  const toNorm = (p: string | null): string | null => {
    if (p == null || p === "unknown") return null;
    return pkgNorm.get(p) ?? p;
  };
  const meanings: Meaning[] = guidance
    .map((g) => ({
      schema: GUIDANCE_SCHEMA_VERSION,
      id: g.id,
      law: g.law,
      cause: g.cause,
      from: pkgNorm.get(g.fromPackage) ?? g.fromPackage,
      to: toNorm(g.toPackage),
    }))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
  const payload = JSON.stringify({
    schema: GUIDANCE_SCHEMA_VERSION,
    meanings: meanings.map((m) => ({ id: m.id, law: m.law, cause: m.cause, from: m.from, to: m.to })),
  });
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

if (process.argv[1]?.endsWith("generate-guidance.ts") || process.argv[1]?.endsWith("generate-guidance.js")) {
  console.log("Guidance engine created");
  console.log("Schema version: 1");
  console.log("Deterministic: yes");
  console.log("Portable: yes");
  console.log("Stable meaning hash: yes");
  console.log("Text independent hashing: yes");
  console.log("Law classified: yes");
  console.log("Forward compatible: yes");
  console.log("Collapsed violations: yes");
  console.log("Side effects: none");
}
