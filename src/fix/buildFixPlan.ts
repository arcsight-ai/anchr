/**
 * Deterministic fix plan builder. Stale check + semantic edits only.
 * Plan encodes post-condition: structural_verified after apply.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseDeps } from "../structural/parseDeps.js";
import { parseMinimalCut } from "../repair/parseReport.js";
import type { Proof, ViolationKind } from "../structural/types.js";
import type { FixEdit, FixPlan, FixPlanResult, FixPlanRisk, FixPlanStatus } from "./types.js";

const WORKSPACE_PREFIX = "@market-os/";

function posixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

function repoRelativePath(repoRoot: string, absPath: string): string {
  const norm = posixPath(absPath);
  const rootNorm = posixPath(repoRoot).replace(/\/$/, "");
  return norm.startsWith(rootNorm) ? norm.slice(rootNorm.length).replace(/^\//, "") : norm;
}

function resolveFilePath(repoRoot: string, proofSource: string): string {
  const norm = posixPath(proofSource);
  const rootNorm = posixPath(repoRoot).replace(/\/$/, "");
  if (norm.startsWith(rootNorm)) {
    const rel = norm.slice(rootNorm.length).replace(/^\//, "");
    return join(repoRoot, rel);
  }
  return proofSource;
}

function targetPackageFromSpecifier(specifier: string): string | null {
  if (!specifier) return null;
  if (specifier.startsWith(WORKSPACE_PREFIX)) {
    const rest = specifier.slice(WORKSPACE_PREFIX.length);
    const slash = rest.indexOf("/");
    return slash >= 0 ? rest.slice(0, slash) : rest;
  }
  if (specifier.startsWith("..")) {
    const parts = specifier.split("/").filter((p) => p && p !== "..");
    return parts[0] ?? null;
  }
  return null;
}

function publicEntrypointSpecifier(specifier: string): string {
  const pkg = targetPackageFromSpecifier(specifier);
  return pkg ? `${WORKSPACE_PREFIX}${pkg}` : specifier;
}

function violationStillPresent(
  filePath: string,
  specifier: string,
  rule: ViolationKind,
  repoRoot: string,
): boolean {
  const fullPath = filePath.startsWith(repoRoot) ? filePath : join(repoRoot, filePath);
  if (!existsSync(fullPath)) return false;
  const content = readFileSync(fullPath, "utf8");
  const deps = parseDeps(content);
  const spec = specifier.trim();
  if (rule === "type_import_private_target") {
    return deps.typeOnlyImports.some((s) => s.trim() === spec);
  }
  return deps.valueImports.some((v) => v.specifier.trim() === spec);
}

export interface FixPlanInput {
  status: string;
  proofs?: Proof[];
  minimalCut?: string[];
  baseSha?: string;
  headSha?: string;
  classification?: { primaryCause: ViolationKind | null };
}

export function buildFixPlan(input: FixPlanInput, repoRoot: string): FixPlanResult {
  if (!input.proofs || input.proofs.length === 0) {
    const cause = input.classification?.primaryCause ?? null;
    return {
      status: input.status === "BLOCKED" ? "no_violations" : "no_report",
      violationCount: 0,
      filesAffected: [],
      primaryCause: cause,
      risk: "low",
      repairStrategy: "No repairs required.",
    };
  }

  const minimalCut = input.minimalCut ?? [];
  const parsed = parseMinimalCut(minimalCut);
  const baseCommit = (input.headSha ?? input.baseSha ?? "").trim() || "unknown";

  for (let i = 0; i < input.proofs.length; i++) {
    const proof = input.proofs[i]!;
    const filePath = repoRelativePath(repoRoot, proof.source);
    const fullPath = resolveFilePath(repoRoot, proof.source);
    if (!existsSync(fullPath)) {
      return {
        status: "stale_analysis",
        violationCount: input.proofs.length,
        filesAffected: [],
        primaryCause: input.classification?.primaryCause ?? null,
        risk: "high",
        repairStrategy: "Source files changed since analysis. Re-run anchr check.",
      };
    }
    const specifier = parsed[i]?.specifier ?? proof.target;
    if (!specifier) continue;
    const stillPresent = violationStillPresent(fullPath, specifier, proof.rule, repoRoot);
    if (!stillPresent) {
      return {
        status: "stale_analysis",
        violationCount: input.proofs.length,
        filesAffected: [],
        primaryCause: input.classification?.primaryCause ?? null,
        risk: "high",
        repairStrategy: "Source files changed since analysis. Re-run anchr check.",
      };
    }
  }

  const primaryCause = input.classification?.primaryCause ?? input.proofs[0]?.rule ?? null;
  const edits: FixEdit[] = [];
  const filesSet = new Set<string>();

  const sorted = input.proofs
    .map((p, i) => ({
      proof: p,
      specifier: parsed[i]?.specifier ?? p.target,
    }))
    .sort((a, b) => {
      const pathA = repoRelativePath(repoRoot, a.proof.source);
      const pathB = repoRelativePath(repoRoot, b.proof.source);
      const cmpPath = pathA.localeCompare(pathB, "en");
      if (cmpPath !== 0) return cmpPath;
      const cmpRule = a.proof.rule.localeCompare(b.proof.rule, "en");
      if (cmpRule !== 0) return cmpRule;
      return (a.specifier ?? "").localeCompare(b.specifier ?? "", "en");
    });

  for (const { proof, specifier } of sorted) {
    const file = repoRelativePath(repoRoot, proof.source);
    filesSet.add(file);

    if (proof.rule === "deleted_public_api" || proof.rule === "type_import_private_target") {
      const canRewrite = proof.rule === "type_import_private_target";
      const newSpec = canRewrite ? publicEntrypointSpecifier(specifier) : undefined;
      edits.push({
        file,
        kind: newSpec ? "import-rewrite" : "manual",
        originalSpecifier: specifier,
        newSpecifier: newSpec,
        importKind: proof.rule === "type_import_private_target" ? "type" : "value",
        symbol: specifier.split("/").pop()?.replace(/\.(ts|tsx)$/, ""),
        rule: proof.rule,
      });
      continue;
    }

    if (proof.rule === "boundary_violation") {
      edits.push({
        file,
        kind: "import-rewrite",
        originalSpecifier: specifier,
        newSpecifier: publicEntrypointSpecifier(specifier),
        importKind: "value",
        symbol: specifier.split("/").pop()?.replace(/\.(ts|tsx)$/, ""),
        rule: proof.rule,
      });
      continue;
    }

    if (proof.rule === "relative_escape") {
      const targetPkg = targetPackageFromSpecifier(proof.target) ?? targetPackageFromSpecifier(specifier);
      const newSpec = targetPkg ? `${WORKSPACE_PREFIX}${targetPkg}` : specifier;
      edits.push({
        file,
        kind: "import-rewrite",
        originalSpecifier: specifier,
        newSpecifier: newSpec,
        importKind: "value",
        rule: proof.rule,
      });
      continue;
    }

    edits.push({
      file,
      kind: "manual",
      originalSpecifier: specifier,
      importKind: "value",
      rule: proof.rule,
    });
  }

  const hasManual = edits.some((e) => e.kind === "manual");
  const hasDeleted = edits.some((e) => e.rule === "deleted_public_api");
  let risk: FixPlanRisk = "low";
  if (hasDeleted || (hasManual && edits.some((e) => e.rule === "deleted_public_api"))) risk = "high";
  else if (hasManual) risk = "medium";

  const strategy =
    primaryCause === "boundary_violation"
      ? "Replace private import with public entrypoint."
      : primaryCause === "relative_escape"
        ? "Replace relative traversal with package import."
        : primaryCause === "type_import_private_target"
          ? "Rewrite to public types entry or mark manual fix."
          : primaryCause === "deleted_public_api"
            ? "No automatic fix. Mark breaking change."
            : "No patch. Mark manual decision.";

  const plan: FixPlan = {
    version: 3,
    baseCommit,
    postCondition: "structural_verified",
    edits,
    risk,
  };

  return {
    status: "ok",
    plan,
    violationCount: edits.length,
    filesAffected: [...filesSet].sort((a, b) => a.localeCompare(b, "en")),
    primaryCause,
    risk,
    repairStrategy: strategy,
  };
}
