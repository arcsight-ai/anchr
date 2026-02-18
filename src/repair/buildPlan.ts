import type { ParsedViolation } from "./parseReport.js";
import type { RepairAction } from "./types.js";

const WORKSPACE_PREFIX = "@market-os/";

function extractTargetPackage(specifier: string | undefined): string | null {
  if (!specifier) return null;
  if (specifier.startsWith(WORKSPACE_PREFIX)) {
    const rest = specifier.slice(WORKSPACE_PREFIX.length);
    const slash = rest.indexOf("/");
    return slash >= 0 ? rest.slice(0, slash) : rest;
  }
  if (specifier.startsWith(".")) {
    return null;
  }
  return null;
}

function extractSymbol(specifier: string | undefined): string {
  if (!specifier) return "";
  if (specifier.startsWith(WORKSPACE_PREFIX)) {
    const rest = specifier.slice(WORKSPACE_PREFIX.length);
    const slash = rest.indexOf("/");
    const subpath = slash >= 0 ? rest.slice(slash + 1) : "";
    const last = subpath.split("/").pop() ?? "";
    return last.replace(/\.(ts|tsx)$/, "") || subpath || rest;
  }
  const last = specifier.split("/").pop() ?? "";
  return last.replace(/\.(ts|tsx)$/, "");
}

function extractTargetFromRelative(specifier: string | undefined): string | null {
  if (!specifier || !specifier.startsWith(".")) return null;
  const parts = specifier.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..");
  return parts[0] ?? null;
}

function targetKey(v: ParsedViolation): string {
  let toPkg: string;
  let sym: string;
  if (v.cause === "deleted_public_api") {
    toPkg = v.package;
    sym = v.path.split("/").pop()?.replace(/\.(ts|tsx)$/, "") ?? "";
  } else if (v.cause === "relative_escape") {
    toPkg = extractTargetFromRelative(v.specifier) ?? extractTargetPackage(v.specifier) ?? v.package;
    sym = extractSymbol(v.specifier);
  } else {
    toPkg = extractTargetPackage(v.specifier) ?? v.package;
    sym = extractSymbol(v.specifier);
  }
  return `${toPkg}:${sym || "default"}`;
}

export function buildRepairPlan(parsed: ParsedViolation[]): RepairAction[] {
  const byTarget = new Map<string, ParsedViolation[]>();
  for (const v of parsed) {
    const key = targetKey(v);
    const arr = byTarget.get(key) ?? [];
    arr.push(v);
    byTarget.set(key, arr);
  }

  const actions: RepairAction[] = [];
  let id = 1;

  const sortedTargets = [...byTarget.keys()].sort((a, b) => a.localeCompare(b, "en"));

  for (const key of sortedTargets) {
    const violations = byTarget.get(key)!;
    const impactRadius = violations.length;

    const first = violations[0];
    const [toPkg, sym] = key.split(":");
    const fromPkg = first.package;

    if (first.cause === "boundary_violation") {
      const symbol = extractSymbol(first.specifier) || sym || "symbol";
      actions.push({
        id: `A${id++}`,
        type: "promote_to_public",
        intentPreservingLevel: 1,
        fromPackage: fromPkg,
        toPackage: toPkg,
        symbol,
        requiredChange: `Add export in packages/${toPkg}/src/index.ts that re-exports "${symbol}"`,
        impactRadius,
        guaranteesUnblock: true,
        dependsOn: [],
      });
    } else if (first.cause === "type_import_private_target") {
      const symbol = extractSymbol(first.specifier) || sym || "type";
      actions.push({
        id: `A${id++}`,
        type: "promote_to_public",
        intentPreservingLevel: 1,
        fromPackage: fromPkg,
        toPackage: toPkg,
        symbol,
        requiredChange: `Export type from packages/${toPkg}/src/index.ts`,
        impactRadius,
        guaranteesUnblock: true,
        dependsOn: [],
      });
    } else if (first.cause === "relative_escape") {
      const toPkgRel = extractTargetFromRelative(first.specifier) ?? toPkg;
      actions.push({
        id: `A${id++}`,
        type: "redirect_import",
        intentPreservingLevel: 3,
        fromPackage: fromPkg,
        toPackage: toPkgRel,
        symbol: extractSymbol(first.specifier) || "",
        requiredChange: `Change import in ${first.path} to @market-os/${toPkgRel}`,
        impactRadius,
        guaranteesUnblock: true,
        dependsOn: [],
      });
    } else if (first.cause === "deleted_public_api") {
      const symbol = first.path.split("/").pop()?.replace(/\.(ts|tsx)$/, "") ?? "symbol";
      actions.push({
        id: `A${id++}`,
        type: "promote_to_public",
        intentPreservingLevel: 1,
        fromPackage: fromPkg,
        toPackage: toPkg,
        symbol,
        requiredChange: `Restore or re-export removed public symbol in packages/${toPkg}/src/index.ts`,
        impactRadius,
        guaranteesUnblock: true,
        dependsOn: [],
      });
    }
  }

  return actions.sort((a, b) => a.intentPreservingLevel - b.intentPreservingLevel || a.id.localeCompare(b.id, "en"));
}
