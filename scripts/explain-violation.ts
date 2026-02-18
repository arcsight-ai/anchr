/**
 * Explanation Engine (Prompt 8 — Deterministic + Precise Fix Guidance).
 * Translates a structural violation into a precise developer action.
 * Same violation → identical output. Never analyzes code.
 */

export type Violation = {
  source: string;
  target: string;
  specifier?: string;
  symbols?: string[];
  importKind?: "named" | "default" | "namespace" | "export-all" | "require" | "dynamic";
  cause:
    | "boundary_violation"
    | "deleted_public_api"
    | "type_import_private_target"
    | "relative_escape";
  sourcePkg: string;
  targetPkg?: string;
};

function pkgRoot(pkg: string): string {
  return `packages/${pkg}/src/index.ts`;
}

function pkgImport(pkg: string): string {
  return `@market-os/${pkg}`;
}

function stableSymbols(v: Violation): string {
  if (!v.symbols || v.symbols.length === 0) return "{…}";
  return `{ ${[...v.symbols].sort((a, b) => a.localeCompare(b, "en")).join(", ")} }`;
}

function reconstructImport(v: Violation): string {
  const spec = v.specifier ?? "";

  switch (v.importKind) {
    case "default":
      return `import x from '${spec}'`;
    case "namespace":
      return `import * as x from '${spec}'`;
    case "export-all":
      return `export * from '${spec}'`;
    case "require":
      return `const x = require('${spec}')`;
    case "dynamic":
      return `await import('${spec}')`;
    default:
      return `import ${stableSymbols(v)} from '${spec}'`;
  }
}

function replacementImport(v: Violation): string {
  const pkg = v.targetPkg ?? v.sourcePkg;
  return `import ${stableSymbols(v)} from '${pkgImport(pkg)}'`;
}

/**
 * Deterministic explanation string. Same violation → identical output. ≤8 lines.
 */
export function explainViolation(v: Violation): string {
  const cause = v.cause ?? "boundary_violation";

  switch (cause) {
    case "boundary_violation": {
      const forbidden = reconstructImport(v);
      const replacement = replacementImport(v);
      const root = pkgRoot(v.targetPkg ?? v.target);
      return [
        "You imported a private module across a package boundary.",
        `File: ${v.source}`,
        `Forbidden: ${forbidden}`,
        "Fix:",
        `1. Export the symbol from ${root}`,
        `2. Replace with: ${replacement}`,
        "Direct /src/ imports are not allowed.",
      ].join("\n");
    }

    case "deleted_public_api": {
      const broken = v.specifier ?? v.target;
      const root = pkgRoot(v.targetPkg ?? v.target);
      return [
        "A public API was removed.",
        `Broken dependency: ${broken}`,
        "Fix one of:",
        `• Restore export in ${root}`,
        "• Update callers to the new public API",
        "Public package contracts must remain stable.",
      ].join("\n");
    }

    case "type_import_private_target": {
      const invalid = reconstructImport(v);
      const replacement = replacementImport(v);
      const pkg = v.targetPkg ?? v.target;
      const root = pkgRoot(pkg);
      return [
        "A private type was imported across packages.",
        `File: ${v.source}`,
        `Invalid: ${invalid}`,
        "Fix:",
        `Move the type into ${root}`,
        `Then use: ${replacement}`,
        "Types must be public to cross boundaries.",
      ].join("\n");
    }

    case "relative_escape": {
      const invalid = v.specifier ?? v.target;
      const pkg = v.targetPkg ?? v.target;
      const repl = `import ${stableSymbols(v)} from '${pkgImport(pkg)}'`;
      return [
        "This file escapes its package using relative paths.",
        `File: ${v.source}`,
        `Invalid relative access: ${invalid}`,
        `Replace with: ${repl}`,
        "Packages cannot access parent directories.",
      ].join("\n");
    }

    default: {
      return [
        "This change violates a module boundary.",
        "Expose the symbol through the package public API",
        "and import it from the package root.",
      ].join("\n");
    }
  }
}

/**
 * Stable format block for CI/comments.
 */
export function formatFixBlock(v: Violation): string {
  return ["ARC SIGHT FIX", "———––", explainViolation(v)].join("\n");
}
