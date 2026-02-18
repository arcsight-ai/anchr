import { createHash } from "crypto";
import { parseMinimalCut } from "../repair/parseReport.js";

const WORKSPACE_PREFIX = "@market-os/";

function normalizeBoundaryIdentity(fromPackage: string, toPackage: string): string {
  const from = fromPackage.toLowerCase().trim();
  const to = toPackage.toLowerCase().trim();
  return `${from} → ${to}`;
}

function extractTargetPackage(specifier: string | undefined): string | null {
  if (!specifier || !specifier.startsWith(WORKSPACE_PREFIX)) return null;
  const rest = specifier.slice(WORKSPACE_PREFIX.length);
  const slash = rest.indexOf("/");
  return slash >= 0 ? rest.slice(0, slash) : rest;
}

export function computeBoundaryFingerprints(
  minimalCut: string[],
): { boundary: string; fingerprint: string }[] {
  const parsed = parseMinimalCut(minimalCut);
  const byBoundary = new Map<string, string[]>();

  for (const v of parsed) {
    if (v.cause !== "boundary_violation") continue;

    const toPkg = extractTargetPackage(v.specifier);
    if (!toPkg) continue;

    const boundary = normalizeBoundaryIdentity(v.package, toPkg);
    const paths = byBoundary.get(boundary) ?? [];
    const path = v.path.replace(/\\/g, "/").trim();
    if (!paths.includes(path)) paths.push(path);
    byBoundary.set(boundary, paths);
  }

  const out: { boundary: string; fingerprint: string }[] = [];

  for (const [boundary, paths] of byBoundary) {
    const sorted = [...paths].sort((a, b) => a.localeCompare(b, "en"));
    const payload = boundary + "\n" + sorted.join("\n");
    const fingerprint = createHash("sha256").update(payload, "utf8").digest("hex");
    out.push({ boundary, fingerprint });
  }

  return out.sort((a, b) => a.boundary.localeCompare(b.boundary, "en"));
}
