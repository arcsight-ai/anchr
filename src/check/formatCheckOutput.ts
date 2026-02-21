/**
 * Deterministic check output: RESULT, Confidence, boundary context (From/To package).
 * No timestamps; violations sorted by file path. Rule→Fix mapping from contract.
 */

import type { Proof, ViolationKind } from "../structural/types.js";

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

const RULE_TO_FIX: Record<ViolationKind, string> = {
  boundary_violation:
    "import from package public entrypoint instead of internal module",
  deleted_public_api: "restore export or add compatible re-export",
  relative_escape:
    "move file inside package boundary or expose via entrypoint",
  type_import_private_target: "import types from public types entry",
  circular_import: "break the cycle by moving or inverting the dependency",
};

export type CheckResult = "ALLOW" | "BLOCK" | "UNCERTAIN";
export type CheckConfidence = "PROVEN_SAFE" | "PROVEN_VIOLATION" | "INCOMPLETE_PROOF";

export interface CheckReportInput {
  status: string;
  decision: { level: string; reason: string };
  proofs?: Proof[];
  minimalCut?: string[];
}

export function resultAndConfidence(input: CheckReportInput): {
  result: CheckResult;
  confidence: CheckConfidence;
} {
  const status = input.status;
  if (status === "VERIFIED") {
    return { result: "ALLOW", confidence: "PROVEN_SAFE" };
  }
  if (status === "BLOCKED") {
    return { result: "BLOCK", confidence: "PROVEN_VIOLATION" };
  }
  return { result: "UNCERTAIN", confidence: "INCOMPLETE_PROOF" };
}

export function formatCheckOutput(
  input: CheckReportInput,
  repoRoot: string,
  verbose: boolean,
): string[] {
  const { result, confidence } = resultAndConfidence(input);
  const lines: string[] = [];

  lines.push(`RESULT: ${result}`);
  lines.push(`Confidence: ${confidence}`);
  lines.push("");

  if (result === "ALLOW") {
    if (!verbose) {
      lines.push("No architectural impact detected.");
    }
    return lines;
  }

  if (result === "UNCERTAIN") {
    lines.push("Proof incomplete. Certainty is insufficient.");
    lines.push("");
    lines.push("Run: anchr check --deep");
    return lines;
  }

  const proofs = input.proofs ?? [];
  const sorted = [...proofs].sort((a, b) =>
    a.source.localeCompare(b.source, "en"),
  );

  for (const proof of sorted) {
    const filePath = repoRelativePath(repoRoot, proof.source);
    const fromPkg = packageFromPath(repoRoot, proof.source);
    const toPkg = packageFromPath(repoRoot, proof.target);

    lines.push(filePath);
    lines.push(`From: ${fromPkg}`);
    lines.push(`To: ${toPkg}`);
    lines.push("");
    lines.push("→");
    lines.push("");
    lines.push(`Rule: ${proof.rule}`);
    lines.push("Fix:");
    lines.push(RULE_TO_FIX[proof.rule]);
    lines.push("");
  }

  return lines;
}

export { RULE_TO_FIX };
