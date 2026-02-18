/**
 * Deterministic Human Explanation Generator (Prompt 11 — Hardened Final).
 * Converts ArcSight decision output into a stable human explanation for PR comments.
 * NEVER decides outcomes; only renders from already-computed facts.
 * Byte-identical output for identical input across machines, Node, OS, and future engine releases.
 */

import type { ReviewerAction } from "./recommend-action.js";

export type Violation = {
  cause?: string | null;
  fromPkg?: string | null;
  toPkg?: string | null;
  target?: string | null;
};

export type ExplanationInput = {
  action: ReviewerAction;
  violations?: Violation[] | null;
  structuralFastPath?: boolean | null;
  downgradeReasons?: string[] | null;
};

const LF = "\n";
const MAX_LINES = 6;
const MAX_CHARS = 420;

function trim(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function violationKey(v: { cause?: string | null; fromPkg?: string | null; toPkg?: string | null; target?: string | null }): string {
  return trim(v.cause) + "|" + trim(v.fromPkg) + "|" + trim(v.toPkg) + "|" + trim(v.target);
}

function normalizeViolations(violations: Violation[] | null | undefined): Violation[] {
  const raw = violations ?? [];
  const trimmed: Violation[] = raw.map((v) => ({
    cause: trim(v.cause),
    fromPkg: trim(v.fromPkg),
    toPkg: trim(v.toPkg),
    target: trim(v.target),
  }));
  const seen = new Set<string>();
  const deduped: Violation[] = [];
  for (const v of trimmed) {
    const key = violationKey(v);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(v);
  }
  deduped.sort((a, b) => violationKey(a).localeCompare(violationKey(b), "en"));
  return deduped.slice(0, 3);
}

function normalizeDowngradeReasons(reasons: string[] | null | undefined): string[] {
  const raw = reasons ?? [];
  const trimmed = raw.map((s) => trim(s)).filter(Boolean);
  return [...trimmed].sort((a, b) => a.localeCompare(b, "en"));
}

function summaryLine(code: string): string {
  switch (code) {
    case "MERGE":
      return "ArcSight verified no architectural impact";
    case "REVIEW":
      return "ArcSight detected a non-trivial dependency change";
    case "BLOCK":
      return "ArcSight detected an architectural boundary violation";
    case "ESCALATE":
      return "ArcSight could not reach a reliable conclusion";
    default:
      return "ArcSight could not reach a reliable conclusion";
  }
}

function reasonLine(category: string): string {
  switch (category) {
    case "SAFE_TRIVIAL":
      return "The change does not alter package dependencies";
    case "SAFE_COMPLEX":
      return "The change affects dependencies but remains allowed";
    case "RISKY_CHANGE":
      return "The change modifies cross-package behavior";
    case "ARCHITECTURE_VIOLATION":
      return "The change breaks a declared package boundary";
    case "UNCERTAIN_ANALYSIS":
      return "The analysis result is not deterministic";
    case "SYSTEM_FALLBACK":
      return "The analysis encountered an unexpected state";
    default:
      return "The analysis result is not deterministic";
  }
}

function violationLine(v: Violation): string | null {
  const cause = trim(v.cause);
  if (cause === "boundary_violation") {
    const toPkg = trim(v.toPkg);
    if (!toPkg) return null;
    return "Import from " + toPkg + " internal module detected";
  }
  if (cause === "deleted_public_api") {
    const fromPkg = trim(v.fromPkg);
    if (!fromPkg) return null;
    return "Public API removed from " + fromPkg;
  }
  if (cause === "relative_escape") {
    return "Relative import escapes package boundary";
  }
  if (cause === "type_import_private_target") {
    return "Type import references private module";
  }
  return null;
}

/**
 * Pure deterministic formatter. No side effects, no I/O, stable output.
 */
export function explainResult(input: ExplanationInput): string {
  const action = input.action;
  const violations = normalizeViolations(input.violations);
  const downgradeReasons = normalizeDowngradeReasons(input.downgradeReasons);

  const code = (action?.code ?? "ESCALATE") as string;
  const category = (action?.category ?? "UNCERTAIN_ANALYSIS") as string;

  const lines: string[] = [];

  // 1. Summary line (always)
  lines.push(summaryLine(code));

  // 2. Reason line (always)
  lines.push(reasonLine(category));

  // 3. Violation lines (0–3)
  for (const v of violations) {
    const line = violationLine(v);
    if (line != null) lines.push(line);
  }

  // 4. Uncertainty line (optional)
  if (downgradeReasons.length > 0) {
    lines.push("Manual review is recommended");
  }

  let out = lines.join(LF);
  if (out.length > MAX_CHARS) {
    const at = out.lastIndexOf(LF, MAX_CHARS);
    out = at > 0 ? out.slice(0, at) : out.slice(0, MAX_CHARS);
  }
  const lineCount = out.split(LF).length;
  if (lineCount > MAX_LINES) {
    const parts = out.split(LF);
    out = parts.slice(0, MAX_LINES).join(LF);
  }
  return out;
}
