import type { ValueImport } from "../structural/parseDeps.js";
import { toStablePressureTokens } from "./tokens.js";

const WORKSPACE_PREFIX = "@market-os/";

function getTargetPackage(specifier: string): string | null {
  if (!specifier.startsWith(WORKSPACE_PREFIX)) return null;
  const rest = specifier.slice(WORKSPACE_PREFIX.length);
  const slash = rest.indexOf("/");
  return slash >= 0 ? rest.slice(0, slash) : rest;
}

function getSourcePackageFromPath(filePath: string): string | null {
  const m = filePath.match(/^packages\/([^/]+)\/src\//);
  return m ? m[1] : null;
}

export function pressureKey(sourcePkg: string, targetPkg: string, sortedTokens: string[]): string {
  return sourcePkg + "→" + targetPkg + ":" + sortedTokens.join(",");
}

export function weightFromKey(key: string): number {
  const after = key.indexOf(":");
  if (after < 0) return 0;
  const tokens = key.slice(after + 1).split(",").filter(Boolean);
  return tokens.length;
}

export function extractPressuresFromFile(
  filePath: string,
  valueImports: ValueImport[],
): Map<string, number> {
  const out = new Map<string, number>();
  const sourcePkg = getSourcePackageFromPath(filePath);
  if (!sourcePkg) return out;

  for (const { specifier, identifiers } of valueImports) {
    if (!specifier.startsWith(WORKSPACE_PREFIX)) continue;
    const targetPkg = getTargetPackage(specifier);
    if (!targetPkg) continue;

    const tokens = toStablePressureTokens(specifier, identifiers);
    if (!tokens) continue;

    const key = pressureKey(sourcePkg, targetPkg, tokens);
    out.set(key, tokens.length);
  }

  return out;
}

export function boundariesFromPressureMap(
  pressureMap: Map<string, number>,
): Set<string> {
  const boundaries = new Set<string>();
  for (const key of pressureMap.keys()) {
    const arrow = key.indexOf("→");
    const colon = key.indexOf(":");
    if (arrow >= 0 && colon > arrow) {
      boundaries.add(key.slice(0, colon));
    }
  }
  return boundaries;
}
