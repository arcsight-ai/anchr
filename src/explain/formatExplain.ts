/**
 * Deterministic explain output: summary block, grouped violations, next step, ANCHR_DATA.
 * Machine-readable; canonical text only. No timestamps; sorted keys in JSON.
 */

import type { Proof, ViolationKind } from "../structural/types.js";
import {
  RULE_TO_FIX,
  RULE_TO_INTENT,
  RULE_TO_FIX_CONFIDENCE,
  type RepairIntent,
  type FixConfidence,
  type SummaryConfidence,
} from "./constants.js";

const PKG_SRC_RE = /^packages\/([^/]+)\/src\//;
const PKG_IN_PATH_RE = /packages\/([^/]+)(?:\/src)?(?:\/|$)/;

function packageFromPath(repoRoot: string, pathOrSpec: string): string {
  const norm = pathOrSpec.replace(/\\/g, "/");
  const rootNorm = repoRoot.replace(/\\/g, "/");
  const rel = norm.startsWith(rootNorm) ? norm.slice(rootNorm.length).replace(/^\//, "") : norm;
  const m = rel.match(PKG_SRC_RE) ?? rel.match(PKG_IN_PATH_RE);
  if (m) return m[1]!;
  if (norm.startsWith("@") && norm.includes("/")) return norm.split("/")[1] ?? norm;
  if (norm.startsWith("..")) {
    const segments = norm.split("/").filter(Boolean);
    return segments[0] ?? "?";
  }
  return "?";
}

function repoRelativePath(repoRoot: string, absPath: string): string {
  const norm = absPath.replace(/\\/g, "/");
  const rootNorm = repoRoot.replace(/\\/g, "/").replace(/\/$/, "");
  return norm.startsWith(rootNorm) ? norm.slice(rootNorm.length).replace(/^\//, "") : norm;
}

export type ExplainResult = "ALLOW" | "BLOCK" | "UNCERTAIN";

export interface ExplainReportInput {
  status: string;
  decision: { level: string; reason: string };
  classification?: { primaryCause: ViolationKind | null };
  proofs?: Proof[];
  minimalCut?: string[];
}

export interface ViolationStructured {
  source: string;
  target: string;
  type: string;
  intent: string;
  files: string[];
  fix: string;
  fixConfidence: string;
}

export interface ExplainStructuredData {
  result: string;
  confidence: string;
  violations: ViolationStructured[];
}

function resultFromStatus(status: string): ExplainResult {
  if (status === "VERIFIED") return "ALLOW";
  if (status === "BLOCKED") return "BLOCK";
  return "UNCERTAIN";
}

function summaryConfidence(
  result: ExplainResult,
  primaryCause: ViolationKind | null,
): SummaryConfidence {
  if (result === "ALLOW") return "High";
  if (result === "UNCERTAIN") return "Low";
  if (primaryCause === "deleted_public_api") return "Medium";
  return "High";
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

function stableJson(data: ExplainStructuredData): string {
  return JSON.stringify(sortObjectKeys(data as unknown as Record<string, unknown>));
}

const BOUNDARY_WHY =
  "The target package exposes a stable public contract only through its entrypoint. Internal modules may change without notice.";

export function formatExplainOutput(
  input: ExplainReportInput,
  repoRoot: string,
): { lines: string[]; structured: ExplainStructuredData } {
  const result = resultFromStatus(input.status);
  const primaryCause = input.classification?.primaryCause ?? null;
  const confidence = summaryConfidence(result, primaryCause);
  const proofs = input.proofs ?? [];

  const violationsForData: ViolationStructured[] = [];
  const lines: string[] = [];

  // ——— 1. Summary block ———
  lines.push("ANCHR Architectural Guidance");
  lines.push("");
  lines.push(`Result: ${result}`);
  lines.push(`Confidence: ${confidence}`);
  lines.push("");
  lines.push("Primary issue:");
  if (result === "ALLOW") {
    lines.push("None");
  } else if (result === "UNCERTAIN") {
    lines.push("Proof incomplete.");
  } else {
    lines.push(primaryCause ?? "boundary_violation");
  }
  lines.push("");
  lines.push("Recommended direction:");
  if (result === "ALLOW") {
    lines.push("No change required.");
  } else if (result === "UNCERTAIN") {
    lines.push("Run: anchr check --deep");
  } else {
    lines.push(primaryCause ? RULE_TO_FIX[primaryCause] : RULE_TO_FIX.boundary_violation);
  }
  lines.push("");
  lines.push("Rules:");
  if (result === "ALLOW" || result === "UNCERTAIN") {
    lines.push("None");
  } else {
    const rules = [...new Set(proofs.map((p) => p.rule))].sort((a, b) => a.localeCompare(b, "en"));
    lines.push(rules.join(", "));
  }
  lines.push("");

  // ——— 2. Grouped violation explanations ———
  if (result === "BLOCK" && proofs.length > 0) {
    const byKey = new Map<string, Proof[]>();
    for (const p of proofs) {
      const srcPkg = packageFromPath(repoRoot, p.source);
      const tgtPkg = packageFromPath(repoRoot, p.target);
      const key = `${srcPkg}\t${tgtPkg}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(p);
    }
    const keys = [...byKey.keys()].sort((a, b) => a.localeCompare(b, "en"));

    for (const key of keys) {
      const [sourcePkg, targetPkg] = key.split("\t");
      const groupProofs = byKey.get(key)!;
      const files = [...new Set(groupProofs.map((p) => repoRelativePath(repoRoot, p.source)))].sort(
        (a, b) => a.localeCompare(b, "en"),
      );
      const first = groupProofs[0]!;
      const offendingImport = first.target.startsWith(".") || first.target.includes("@")
        ? first.target
        : repoRelativePath(repoRoot, first.target);
      const fix = RULE_TO_FIX[first.rule];
      const fixConf = RULE_TO_FIX_CONFIDENCE[first.rule];

      lines.push(`${sourcePkg} → ${targetPkg}`);
      lines.push("");
      lines.push("Why this boundary exists:");
      lines.push(BOUNDARY_WHY);
      lines.push("");
      lines.push("Files affected:");
      for (const f of files) {
        lines.push(`\t•\t${f}`);
      }
      lines.push("");
      lines.push("Offending import:");
      lines.push(offendingImport);
      lines.push("");
      lines.push("Correct usage:");
      lines.push(fix);
      lines.push("");
      lines.push(`Fix confidence: ${fixConf}`);
      lines.push("");
      lines.push("");

      const srcPkg = packageFromPath(repoRoot, first.source);
      const tgtPkg = packageFromPath(repoRoot, first.target);
      violationsForData.push({
        source: srcPkg,
        target: tgtPkg,
        type: first.rule,
        intent: RULE_TO_INTENT[first.rule],
        files,
        fix: RULE_TO_FIX[first.rule],
        fixConfidence: RULE_TO_FIX_CONFIDENCE[first.rule],
      });
    }
  }

  if (result === "UNCERTAIN") {
    lines.push("ANCHR cannot determine architectural safety.");
    lines.push("");
    lines.push("Suggested next step:");
    lines.push("Run: anchr check --deep");
    lines.push("");
  }

  // ——— 3. Next step (always) ———
  lines.push("Next step:");
  lines.push("Run: anchr fix --apply");
  lines.push("");

  // ——— 4. Hidden structured block ———
  const structured: ExplainStructuredData = {
    result,
    confidence,
    violations: violationsForData,
  };
  lines.push("<!-- ANCHR_DATA");
  lines.push(stableJson(structured));
  lines.push("-->");

  return { lines, structured };
}
