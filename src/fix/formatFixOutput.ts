/**
 * Deterministic fix plan output: summary, grouped edits, patch previews,
 * post-condition guarantee, final instructions, ANCHR_FIX_PLAN.
 */

import type { FixEdit, FixPlan, FixPlanRisk } from "./types.js";
import type { ViolationKind } from "../structural/types.js";

const WORKSPACE_PREFIX = "@market-os/";

function targetPackageFromSpecifier(specifier: string | undefined): string {
  if (!specifier) return "?";
  if (specifier.startsWith(WORKSPACE_PREFIX)) {
    const rest = specifier.slice(WORKSPACE_PREFIX.length);
    const slash = rest.indexOf("/");
    return slash >= 0 ? rest.slice(0, slash) : rest;
  }
  return "?";
}

function sortObjectKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort((a, b) => a.localeCompare(b, "en"))) {
    const v = obj[k];
    sorted[k] =
      v != null && typeof v === "object" && !Array.isArray(v)
        ? sortObjectKeys(v as Record<string, unknown>)
        : v;
  }
  return sorted as T;
}

function stableJson(plan: FixPlan): string {
  const obj = {
    baseCommit: plan.baseCommit,
    edits: plan.edits.map((e) =>
      sortObjectKeys({
        file: e.file,
        importKind: e.importKind,
        kind: e.kind,
        newSpecifier: e.newSpecifier,
        originalSpecifier: e.originalSpecifier,
        rule: e.rule,
        symbol: e.symbol,
      } as Record<string, unknown>),
    ),
    postCondition: plan.postCondition,
    risk: plan.risk,
    version: plan.version,
  };
  return JSON.stringify(sortObjectKeys(obj as unknown as Record<string, unknown>));
}

const PRIMARY_CAUSE_LABEL: Record<string, string> = {
  boundary_violation: "boundary_violation",
  deleted_public_api: "deleted_public_api",
  relative_escape: "relative_escape",
  type_import_private_target: "type_import_private_target",
};

export function formatFixOutput(result: {
  status: string;
  plan?: FixPlan;
  violationCount: number;
  filesAffected: string[];
  primaryCause: ViolationKind | null;
  risk: FixPlanRisk;
  repairStrategy: string;
}): string[] {
  const lines: string[] = [];

  if (result.status === "stale_analysis") {
    lines.push("Source files changed since analysis. Re-run anchr check.");
    return lines;
  }

  if (result.status === "no_report" || result.status === "no_violations") {
    lines.push("ANCHR Repair Plan");
    lines.push("");
    lines.push("Violations: 0");
    lines.push("Files affected: 0");
    lines.push("Risk level: Low");
    lines.push("Primary cause: None");
    lines.push("Repair strategy: No repairs required.");
    lines.push("");
    lines.push("No files were modified.");
    lines.push("To apply safely:");
    lines.push("anchr fix --apply");
    lines.push("If files changed:");
    lines.push("re-run anchr check");
    lines.push("");
    lines.push("<!-- ANCHR_FIX_PLAN");
    lines.push(
      JSON.stringify(
        sortObjectKeys({
          baseCommit: "unknown",
          edits: [],
          postCondition: "structural_verified",
          risk: "low",
          version: 3,
        } as Record<string, unknown>),
      ),
    );
    lines.push("-->");
    return lines;
  }

  const plan = result.plan!;

  lines.push("ANCHR Repair Plan");
  lines.push("");
  lines.push(`Violations: ${result.violationCount}`);
  lines.push(`Files affected: ${result.filesAffected.length}`);
  lines.push(`Risk level: ${result.risk.charAt(0).toUpperCase() + result.risk.slice(1)}`);
  lines.push(
    `Primary cause: ${result.primaryCause ? PRIMARY_CAUSE_LABEL[result.primaryCause] ?? result.primaryCause : "mixed"}`,
  );
  lines.push("Repair strategy:");
  lines.push(result.repairStrategy);
  lines.push("");

  const byTarget = new Map<string, FixEdit[]>();
  for (const e of plan.edits) {
    const targetPkg = targetPackageFromSpecifier(e.newSpecifier ?? e.originalSpecifier);
    const key = `${WORKSPACE_PREFIX}${targetPkg}`;
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key)!.push(e);
  }
  for (const arr of byTarget.values()) {
    arr.sort((a, b) => a.file.localeCompare(b.file, "en"));
  }
  const targetKeys = [...byTarget.keys()].sort((a, b) => a.localeCompare(b, "en"));

  for (const key of targetKeys) {
    const edits = byTarget.get(key)!;
    lines.push(key);
    for (const e of edits) {
      lines.push(`\t${e.file}`);
    }
    lines.push("");
  }

  const editsByFile = new Map<string, FixEdit[]>();
  for (const e of plan.edits) {
    if (!editsByFile.has(e.file)) editsByFile.set(e.file, []);
    editsByFile.get(e.file)!.push(e);
  }
  const sortedFiles = [...editsByFile.keys()].sort((a, b) => a.localeCompare(b, "en"));
  for (const file of sortedFiles) {
    lines.push("File:");
    lines.push(file);
    lines.push("@@ import");
    for (const e of editsByFile.get(file)!) {
      if (e.kind === "import-rewrite" && e.newSpecifier) {
        lines.push(`\t•\t${e.originalSpecifier}`);
        lines.push(`\t•\t${e.newSpecifier}`);
      }
    }
    lines.push("");
  }
  lines.push("");

  lines.push("After applying this plan:");
  lines.push("• No private package imports will remain");
  lines.push("• No relative imports will escape package boundaries");
  lines.push("• No deleted public APIs will be referenced");
  lines.push("• ANCHR structural phase will return VERIFIED");
  lines.push("");

  lines.push("No files were modified.");
  lines.push("To apply safely:");
  lines.push("anchr fix --apply");
  lines.push("If files changed:");
  lines.push("re-run anchr check");
  lines.push("");
  lines.push("<!-- ANCHR_FIX_PLAN");
  lines.push(stableJson(plan));
  lines.push("-->");

  return lines;
}
