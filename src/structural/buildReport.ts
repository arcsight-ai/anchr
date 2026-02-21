import type { Report, Violation, ViolationKind } from "./types.js";
import { sha256, stableStringify } from "./report.js";

export function buildDeterministicReport(
  status: "VERIFIED" | "BLOCKED" | "INCOMPLETE",
  violations: Violation[],
  baseSha: string,
  headSha: string,
  allCanonicalPaths: string[],
): Report {
  const sortedPaths = [...allCanonicalPaths].sort((a, b) => a.localeCompare(b, "en"));
  const graphHash = sha256(sortedPaths.join("\n"));

  const sortedViolations = [...violations].sort((a, b) => {
    const ka = `${a.package}\t${a.path}\t${a.cause}\t${a.specifier ?? ""}`;
    const kb = `${b.package}\t${b.path}\t${b.cause}\t${b.specifier ?? ""}`;
    return ka.localeCompare(kb, "en");
  });
  const violationsHash = sha256(
    sortedViolations.map((v) => `${v.package}:${v.path}:${v.cause}:${v.specifier ?? ""}`).join("\n"),
  );

  const analysisId = sha256(baseSha + headSha + graphHash + violationsHash);
  const runId = analysisId;

  const minimalCut = sortedViolations.map(
    (v) => `${v.package}:${v.path}:${v.cause}${v.specifier ? `:${v.specifier}` : ""}`,
  );

  const primaryCause: ViolationKind | null =
    sortedViolations.length > 0 ? sortedViolations[0].cause : null;

  /** Causal Proof Contract: no BLOCKED without every violation having a proof. */
  const allHaveProof = sortedViolations.every((v) => v.proof != null);
  const effectiveStatus: Report["status"] =
    status === "BLOCKED" && !allHaveProof ? "INDETERMINATE" : status;

  let decisionLevel: "allow" | "block" | "warn" = "allow";
  let reason = "No architectural impact detected.";

  if (status === "INCOMPLETE") {
    decisionLevel = "warn";
    reason = "git_unavailable";
  } else if (effectiveStatus === "INDETERMINATE") {
    decisionLevel = "warn";
    reason = "Proof object could not be produced for all violations.";
  } else if (effectiveStatus === "BLOCKED") {
    decisionLevel = "block";
    reason = primaryCause ?? "boundary_violation";
  } else if (effectiveStatus === "VERIFIED") {
    decisionLevel = "allow";
    reason = "No architectural impact detected.";
  }

  const coverageRatio = effectiveStatus === "VERIFIED" ? 1 : 0;

  const proofs =
    effectiveStatus === "BLOCKED" && allHaveProof
      ? sortedViolations.map((v) => v.proof!)
      : undefined;

  return {
    status: effectiveStatus,
    classification: { primaryCause },
    minimalCut,
    ...(proofs != null && proofs.length > 0 ? { proofs } : {}),
    decision: { level: decisionLevel, reason },
    confidence: { coverageRatio },
    scope: {
      mode:
        effectiveStatus === "VERIFIED"
          ? "structural-fast-path"
          : "structural-audit",
    },
    run: { id: runId },
  };
}
