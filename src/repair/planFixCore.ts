/**
 * Deterministic repair plan: actions with fileHash, compile-soundness, convergence guard.
 * Never edits files; only computes plan.
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { sha256 } from "../structural/report.js";
import { parseMinimalCut } from "./parseReport.js";
import { checkCompileSoundness } from "./compileSoundness.js";
import type { Proof, ViolationKind } from "../structural/types.js";
import type { PlanAction, PlanOutput, PlanErrorOutput, PlanRisk } from "./planTypes.js";

const WORKSPACE_PREFIX = "@market-os/";

function posix(p: string): string {
  return p.replace(/\\/g, "/");
}

function repoRelative(repoRoot: string, absPath: string): string {
  const norm = posix(absPath);
  const rootNorm = posix(resolve(repoRoot)).replace(/\/$/, "");
  return norm.startsWith(rootNorm) ? norm.slice(rootNorm.length).replace(/^\//, "") : norm;
}

function resolveFilePath(repoRoot: string, source: string): string {
  const norm = posix(source);
  const rootNorm = posix(resolve(repoRoot)).replace(/\/$/, "");
  if (norm.startsWith(rootNorm)) {
    const rel = norm.slice(rootNorm.length).replace(/^\//, "");
    return join(repoRoot, rel);
  }
  return source;
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

function publicEntrypoint(specifier: string): string {
  const pkg = targetPackageFromSpecifier(specifier);
  return pkg ? `${WORKSPACE_PREFIX}${pkg}` : specifier;
}

function applyImportPatch(content: string, fromSpec: string, toSpec: string): string {
  const toDq = `from "${toSpec.replace(/"/g, '\\"')}"`;
  const toSq = `from '${toSpec.replace(/'/g, "\\'")}'`;
  if (content.includes(`from "${fromSpec}"`)) return content.replace(`from "${fromSpec}"`, toDq);
  if (content.includes(`from '${fromSpec}'`)) return content.replace(`from '${fromSpec}'`, toSq);
  return content;
}

export interface PlanFixInput {
  status: string;
  proofs?: Proof[];
  minimalCut?: string[];
  classification?: { primaryCause: ViolationKind | null };
}

export type PlanFixResult = { ok: true; plan: PlanOutput } | { ok: false; error: PlanErrorOutput };

export function planFix(input: PlanFixInput, repoRoot: string): PlanFixResult {
  const root = resolve(repoRoot);
  const proofs = input.proofs ?? [];
  const minimalCut = input.minimalCut ?? [];
  const parsed = parseMinimalCut(minimalCut);
  const violationsBefore = proofs.length;

  if (proofs.length === 0) {
    const plan: PlanOutput = {
      version: 1,
      planHash: sha256("[]"),
      risk: "safe",
      repoHash: "",
      diagnostics: { violationsBefore: 0, violationsAfter: 0, fixes: 0 },
      actions: [],
    };
    return { ok: true, plan };
  }

  const actions: PlanAction[] = [];
  const sorted = proofs
    .map((p, i) => ({ proof: p, specifier: parsed[i]?.specifier ?? p.target }))
    .sort((a, b) => {
      const pathA = repoRelative(root, a.proof.source);
      const pathB = repoRelative(root, b.proof.source);
      const c = pathA.localeCompare(pathB, "en");
      if (c !== 0) return c;
      const r = a.proof.rule.localeCompare(b.proof.rule, "en");
      if (r !== 0) return r;
      return (a.specifier ?? "").localeCompare(b.specifier ?? "", "en");
    });

  for (const { proof, specifier } of sorted) {
    const file = repoRelative(root, proof.source);
    const fullPath = resolveFilePath(root, proof.source);
    if (!existsSync(fullPath)) {
      return {
        ok: false,
        error: {
          version: 1,
          error: "stale_report",
          message: "Report does not match repository state",
        },
      };
    }
    const content = readFileSync(fullPath, "utf8");
    const fileHash = sha256(content);

    if (proof.rule === "deleted_public_api") {
      actions.push({
        type: "manual_migration_required",
        file,
        fileHash,
      });
      continue;
    }

    let toSpec: string | undefined;
    if (proof.rule === "boundary_violation" || proof.rule === "relative_escape") {
      if (proof.rule === "relative_escape") {
        const pkg = targetPackageFromSpecifier(proof.target) ?? targetPackageFromSpecifier(specifier);
        toSpec = pkg ? `${WORKSPACE_PREFIX}${pkg}` : undefined;
      } else {
        toSpec = publicEntrypoint(specifier);
      }
    } else if (proof.rule === "type_import_private_target") {
      toSpec = publicEntrypoint(specifier);
    }

    if (toSpec && specifier) {
      actions.push({
        type: "rewrite_import",
        file,
        fileHash,
        from: specifier,
        to: toSpec,
      });
    } else {
      actions.push({ type: "manual_migration_required", file, fileHash });
    }
  }

  const rewriteCount = actions.filter((a) => a.type === "rewrite_import").length;
  const fixes = rewriteCount;
  const violationsAfter = Math.max(0, violationsBefore - fixes);

  if (violationsAfter >= violationsBefore && violationsBefore > 0) {
    return {
      ok: false,
      error: {
        version: 1,
        error: "non_converging_plan",
      },
    };
  }

  const patchedContentByPath = new Map<string, string>();
  for (const a of actions) {
    if (a.type !== "rewrite_import" || a.from == null || a.to == null) continue;
    const fullPath = join(root, a.file);
    const content = readFileSync(fullPath, "utf8");
    patchedContentByPath.set(a.file, applyImportPatch(content, a.from, a.to));
  }

  const affectedPaths = [...new Set(actions.map((a) => a.file))];
  if (affectedPaths.length > 0 && patchedContentByPath.size > 0) {
    const regression = checkCompileSoundness({
      repoRoot: root,
      affectedPaths,
      patchedContentByPath,
    });
    if (regression != null) {
      return {
        ok: false,
        error: {
          version: 1,
          error: "compile_regression",
          details: regression.map((d) => ({
            file: d.file?.fileName,
            start: d.start,
            length: d.length,
            code: d.code,
            message: typeof d.messageText === "string" ? d.messageText : (d.messageText as { messageText?: string })?.messageText,
          })),
        },
      };
    }
  }

  const typeOrder: Record<PlanAction["type"], number> = {
    add_reexport: 0,
    rewrite_import: 1,
    manual_migration_required: 2,
  };
  actions.sort(
    (a, b) =>
      typeOrder[a.type] - typeOrder[b.type] ||
      a.file.localeCompare(b.file, "en"),
  );

  const hasManual = actions.some((a) => a.type === "manual_migration_required");
  let risk: PlanRisk = fixes > 0 ? "safe" : "manual";
  if (hasManual) risk = "manual";
  else if (rewriteCount > 0) risk = "safe";

  const actionsPayload = JSON.stringify(
    actions.map((a) => ({ type: a.type, file: a.file, from: a.from, to: a.to })),
  );
  const planHash = sha256(actionsPayload);

  const plan: PlanOutput = {
    version: 1,
    planHash,
    risk,
    repoHash: "",
    diagnostics: {
      violationsBefore,
      violationsAfter,
      fixes,
    },
    actions,
  };

  return { ok: true, plan };
}
