/**
 * Generate patch from structural report. Never writes to disk.
 * Only boundary_violation: rewrite to public entrypoint.
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { parseMinimalCut } from "./parseReport.js";
import type { Proof } from "../structural/types.js";

const WORKSPACE_PREFIX = "@market-os/";

function posix(p: string): string {
  return p.replace(/\\/g, "/");
}

function repoRelative(repoRoot: string, absPath: string): string {
  const r = posix(resolve(repoRoot));
  const p = posix(resolve(absPath));
  return p.startsWith(r) ? p.slice(r.length).replace(/^\//, "") : p;
}

function targetPackageFromSpecifier(specifier: string): string | null {
  if (!specifier.startsWith(WORKSPACE_PREFIX)) return null;
  const rest = specifier.slice(WORKSPACE_PREFIX.length);
  const slash = rest.indexOf("/");
  return slash >= 0 ? rest.slice(0, slash) : rest;
}

function publicEntrypoint(specifier: string): string {
  const pkg = targetPackageFromSpecifier(specifier);
  return pkg ? `${WORKSPACE_PREFIX}${pkg}` : specifier;
}

function applyImportRewrite(content: string, fromSpec: string, toSpec: string): string {
  if (content.includes(`from "${fromSpec}"`)) return content.replace(`from "${fromSpec}"`, `from "${toSpec.replace(/"/g, '\\"')}"`);
  if (content.includes(`from '${fromSpec}'`)) return content.replace(`from '${fromSpec}'`, `from '${toSpec.replace(/'/g, "\\'")}'`);
  return content;
}

export interface PatchEdit {
  file: string;
  before: string;
  after: string;
  explanation: string;
}

export interface GeneratePatchResult {
  edits: PatchEdit[];
  minimal: boolean;
  error?: "repair_impossible" | "no_violations";
}

export function generatePatch(
  repoRoot: string,
  proofs: Proof[],
  minimalCut: string[],
  pkgDirByName: Map<string, string>,
): GeneratePatchResult {
  const root = resolve(repoRoot);
  const parsed = parseMinimalCut(minimalCut);
  const edits: PatchEdit[] = [];

  const sorted = proofs
    .map((p, i) => ({ proof: p, specifier: parsed[i]?.specifier ?? p.target }))
    .filter(({ proof }) => proof.rule === "boundary_violation" || proof.rule === "relative_escape")
    .sort((a, b) => repoRelative(root, a.proof.source).localeCompare(repoRelative(root, b.proof.source), "en"));

  for (const { proof, specifier } of sorted) {
    if (!specifier) continue;
    const file = repoRelative(root, proof.source);
    const fullPath = join(root, file);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, "utf8");
    const toSpec = proof.rule === "relative_escape"
      ? (targetPackageFromSpecifier(proof.target) ?? targetPackageFromSpecifier(specifier))
        ? `${WORKSPACE_PREFIX}${targetPackageFromSpecifier(proof.target) ?? targetPackageFromSpecifier(specifier)}`
        : null
      : publicEntrypoint(specifier);

    if (!toSpec) continue;

    const after = applyImportRewrite(content, specifier, toSpec);
    if (after === content) continue;

    edits.push({
      file,
      before: content,
      after,
      explanation: `Rewrite import to public entrypoint: ${specifier} → ${toSpec}`,
    });
  }

  return { edits, minimal: true };
}
