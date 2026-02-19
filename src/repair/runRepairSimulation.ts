/**
 * Shadow Repair (Prove Mode): simulate repair, re-certify, prove safety.
 * No file writes; overlay-only simulation.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { sha256 } from "../structural/report.js";
import { discoverPackages } from "../structural/packages.js";
import { computePublicFiles } from "../structural/publicSurface.js";
import { detectViolations } from "../structural/violations.js";
import { buildDeterministicReport } from "../structural/buildReport.js";
import { canonicalPath } from "../structural/canonicalPath.js";
import { VirtualFs } from "../virtual/virtualFs.js";
import { generatePatch } from "./generatePatch.js";
import { parseDeps } from "../structural/parseDeps.js";
import { resolveSpecifierFrozen, type ResolverContext } from "../structural/frozenResolver.js";

export type RepairDecision =
  | "fix_proven_safe"
  | "fix_behavior_changed"
  | "fix_runtime_changed"
  | "fix_evaluation_order_changed"
  | "fix_insufficient"
  | "repair_impossible";

export interface RepairSimulationResult {
  decision: RepairDecision;
  minimal: boolean;
  filesChanged: number;
  semanticEqual: boolean;
  runtimeEqual: boolean;
  evaluationOrderEqual: boolean;
  baselineDiagnosticHash: string;
  fixedDiagnosticHash: string;
  semanticHashBaseline: string;
  semanticHashFixed: string;
  runtimeHashBaseline: string;
  runtimeHashFixed: string;
  evaluationHashBaseline: string;
  evaluationHashFixed: string;
  overlayFileCount: number;
  violationSummary?: string;
  edits?: { file: string; explanation: string }[];
}

function posix(p: string): string {
  return p.replace(/\\/g, "/");
}

function repoRelative(repoRoot: string, absPath: string): string {
  const r = posix(resolve(repoRoot));
  const p = posix(resolve(absPath));
  return p.startsWith(r) ? p.slice(r.length).replace(/^\//, "") : p;
}

function semanticHashForFiles(
  repoRoot: string,
  files: string[],
  fileSystem: { readFile(path: string): string | null },
): string {
  const parts: string[] = [];
  const root = resolve(repoRoot);
  for (const f of files.sort((a, b) => a.localeCompare(b, "en"))) {
    const content = fileSystem.readFile(f.startsWith(root) ? f : `${root}/${f}`);
    if (!content) continue;
    const deps = parseDeps(content);
    for (const v of deps.valueImports) parts.push(`${f}\tvalue\t${v.specifier}`);
    for (const t of deps.typeOnlyImports) parts.push(`${f}\ttype\t${t}`);
  }
  return sha256(parts.join("\n"));
}

function runtimeGraphHash(
  repoRoot: string,
  files: string[],
  pkgDirByName: Map<string, string>,
  fileSystem: { readFile(path: string): string | null },
): string {
  const ctx: ResolverContext = { repoRoot, pkgDirByName, fileSystem };
  const edges: string[] = [];
  const root = resolve(repoRoot);
  for (const f of files.sort((a, b) => a.localeCompare(b, "en"))) {
    const abs = f.startsWith(root) ? f : `${root}/${f}`;
    const content = fileSystem.readFile(abs);
    if (!content) continue;
    const deps = parseDeps(content);
    for (const v of deps.valueImports) {
      const res = resolveSpecifierFrozen(abs, v.specifier, ctx);
      if (res.resolvedAbs) edges.push(`${repoRelative(repoRoot, abs)}\t${repoRelative(repoRoot, res.resolvedAbs)}`);
    }
    for (const t of deps.typeOnlyImports) {
      const res = resolveSpecifierFrozen(abs, t, ctx);
      if (res.resolvedAbs) edges.push(`${repoRelative(repoRoot, abs)}\t${repoRelative(repoRoot, res.resolvedAbs)}`);
    }
  }
  edges.sort((a, b) => a.localeCompare(b, "en"));
  return sha256(edges.join("\n"));
}

function evaluationOrderHash(
  repoRoot: string,
  files: string[],
  pkgDirByName: Map<string, string>,
  fileSystem: { readFile(path: string): string | null },
): string {
  const ctx: ResolverContext = { repoRoot, pkgDirByName, fileSystem };
  const root = resolve(repoRoot);
  const edges = new Map<string, string[]>();
  const allNodes = new Set<string>();

  for (const f of files) {
    const abs = f.startsWith(root) ? f : `${root}/${f}`;
    allNodes.add(repoRelative(repoRoot, abs));
  }
  for (const f of files) {
    const abs = f.startsWith(root) ? f : `${root}/${f}`;
    const from = repoRelative(repoRoot, abs);
    const content = fileSystem.readFile(abs);
    if (!content) continue;
    const deps = parseDeps(content);
    const tos: string[] = [];
    for (const v of deps.valueImports) {
      const res = resolveSpecifierFrozen(abs, v.specifier, ctx);
      if (res.resolvedAbs) tos.push(repoRelative(repoRoot, res.resolvedAbs));
    }
    for (const t of deps.typeOnlyImports) {
      const res = resolveSpecifierFrozen(abs, t, ctx);
      if (res.resolvedAbs) tos.push(repoRelative(repoRoot, res.resolvedAbs));
    }
    if (tos.length) edges.set(from, [...new Set(tos)].sort((a, b) => a.localeCompare(b, "en")));
  }

  const order: string[] = [];
  const visited = new Set<string>();
  function dfs(node: string): void {
    if (visited.has(node)) return;
    visited.add(node);
    for (const to of edges.get(node) ?? []) dfs(to);
    order.push(node);
  }
  for (const n of [...allNodes].sort((a, b) => a.localeCompare(b, "en"))) dfs(n);
  return sha256(order.join("\n"));
}

export interface RepairSimulationInput {
  report: {
    status: string;
    proofs?: Array<{ source: string; target: string; rule: string }>;
    minimalCut?: string[];
    baseSha?: string;
    headSha?: string;
  };
  repoRoot: string;
}

export function runRepairSimulation(input: RepairSimulationInput): RepairSimulationResult {
  const { report, repoRoot } = input;
  const root = resolve(repoRoot);
  const proofs = report.proofs ?? [];
  const minimalCut = report.minimalCut ?? [];
  const baseSha = report.baseSha ?? "";
  const headSha = report.headSha ?? "";

  const emptyResult = (
    decision: RepairDecision,
    opts: { semanticEqual?: boolean; runtimeEqual?: boolean; evaluationOrderEqual?: boolean } = {},
  ): RepairSimulationResult => ({
    decision,
    minimal: true,
    filesChanged: 0,
    semanticEqual: opts.semanticEqual ?? true,
    runtimeEqual: opts.runtimeEqual ?? true,
    evaluationOrderEqual: opts.evaluationOrderEqual ?? true,
    baselineDiagnosticHash: sha256("baseline"),
    fixedDiagnosticHash: sha256("fixed"),
    semanticHashBaseline: sha256(""),
    semanticHashFixed: sha256(""),
    runtimeHashBaseline: sha256(""),
    runtimeHashFixed: sha256(""),
    evaluationHashBaseline: sha256(""),
    evaluationHashFixed: sha256(""),
    overlayFileCount: 0,
  });

  const pkgDirByName = discoverPackages(root);
  if (pkgDirByName.size === 0) {
    return emptyResult(report.status === "VERIFIED" ? "fix_proven_safe" : "repair_impossible");
  }

  const publicFiles = computePublicFiles(root, pkgDirByName);
  const diffEntries = proofs.length
    ? [...new Set(proofs.map((p) => repoRelative(root, p.source)))].map((path) => ({ status: "M" as const, path }))
    : [];
  const canonicalPaths = diffEntries.map((e) => canonicalPath(resolve(root, e.path), root));

  const baselineViolations = detectViolations(root, diffEntries, pkgDirByName, publicFiles, baseSha);
  const baselineStatus = baselineViolations.length > 0 ? "BLOCKED" : "VERIFIED";
  const baselineDiagnosticHash = sha256(`${baselineStatus}\n${baselineViolations.length}`);

  if (proofs.length === 0) {
    return {
      ...emptyResult("fix_proven_safe"),
      baselineDiagnosticHash,
      fixedDiagnosticHash: baselineDiagnosticHash,
    };
  }

  const patch = generatePatch(root, proofs as import("../structural/types.js").Proof[], minimalCut, pkgDirByName);
  if (patch.error === "repair_impossible") {
    return { ...emptyResult("repair_impossible"), baselineDiagnosticHash, fixedDiagnosticHash: baselineDiagnosticHash };
  }
  if (patch.edits.length === 0 && report.status === "BLOCKED") {
    return { ...emptyResult("fix_insufficient"), baselineDiagnosticHash, fixedDiagnosticHash: baselineDiagnosticHash };
  }

  const virtualFs = new VirtualFs(root, { overlayOnly: false });
  virtualFs.setOverlayFromEdits(patch.edits.map((e) => ({ file: e.file, after: e.after })));

  const fixedViolations = detectViolations(root, diffEntries, pkgDirByName, publicFiles, baseSha, virtualFs);
  const fixedStatus = fixedViolations.length > 0 ? "BLOCKED" : "VERIFIED";
  const fixedDiagnosticHash = sha256(`${fixedStatus}\n${fixedViolations.length}`);

  if (fixedStatus !== "VERIFIED") {
    return {
      ...emptyResult("fix_insufficient", {}),
      baselineDiagnosticHash,
      fixedDiagnosticHash,
      overlayFileCount: virtualFs.overlayFileCount,
      edits: patch.edits.map((e) => ({ file: e.file, explanation: e.explanation })),
    };
  }

  const affectedFiles = [...new Set([...patch.edits.map((e) => e.file), ...diffEntries.map((e) => e.path)])];
  const realFs = {
    readFile: (p: string): string | null => {
      try {
        return readFileSync(p, "utf8");
      } catch {
        return null;
      }
    },
  };
  const semanticBaseline = semanticHashForFiles(root, affectedFiles, realFs);
  const semanticFixed = semanticHashForFiles(root, affectedFiles, virtualFs);
  const semanticEqual = semanticBaseline === semanticFixed;

  const runtimeBaseline = runtimeGraphHash(root, affectedFiles, pkgDirByName, realFs);
  const runtimeFixed = runtimeGraphHash(root, affectedFiles, pkgDirByName, virtualFs);
  const runtimeEqual = runtimeBaseline === runtimeFixed;

  const evalBaseline = evaluationOrderHash(root, affectedFiles, pkgDirByName, realFs);
  const evalFixed = evaluationOrderHash(root, affectedFiles, pkgDirByName, virtualFs);
  const evaluationOrderEqual = evalBaseline === evalFixed;

  let decision: RepairDecision = "fix_proven_safe";
  if (!semanticEqual) decision = "fix_behavior_changed";
  else if (!runtimeEqual) decision = "fix_runtime_changed";
  else if (!evaluationOrderEqual) decision = "fix_evaluation_order_changed";

  return {
    decision,
    minimal: patch.minimal,
    filesChanged: patch.edits.length,
    semanticEqual,
    runtimeEqual,
    evaluationOrderEqual,
    baselineDiagnosticHash,
    fixedDiagnosticHash,
    semanticHashBaseline: semanticBaseline,
    semanticHashFixed: semanticFixed,
    runtimeHashBaseline: runtimeBaseline,
    runtimeHashFixed: runtimeFixed,
    evaluationHashBaseline: evalBaseline,
    evaluationHashFixed: evalFixed,
    overlayFileCount: virtualFs.overlayFileCount,
    violationSummary: baselineViolations.length ? `${baselineViolations[0]?.package} → ${baselineViolations[0]?.cause}` : undefined,
    edits: patch.edits.map((e) => ({ file: e.file, explanation: e.explanation })),
  };
}
