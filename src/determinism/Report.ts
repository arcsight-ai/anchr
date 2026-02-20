/**
 * Certification report schema and deterministic build.
 */

import { stableStringify } from "./StableJson.js";
import { createHash } from "crypto";

export type CertificationStatus = "PASS" | "FAIL";
export type ViolationClassification =
  | "ORDER_DEPENDENCE"
  | "ENVIRONMENT_DEPENDENCE"
  | "IMPLICIT_INPUT"
  | "BYTE_VARIANCE"
  | "SEMANTIC_VARIANCE"
  | "OTHER";

export interface DeterminismReport {
  certification_status: CertificationStatus;
  determinism_violation_detected: boolean;
  violation_classification?: ViolationClassification;
  repro_seed?: number;
  minimal_repro_state?: unknown;
  attack_vectors_triggered: string[];
  confidence_score: number;
  coverage_score?: number;
  cross_machine_consistency?: boolean;
  envelope_hash: string;
  contract_version: string;
  certificate_id?: string;
}

export interface BuildReportParams {
  violations: unknown[];
  envelopeHash: string;
  coverage?: number;
  confidence: number;
  reproSeed?: number;
  minimalReproState?: unknown;
  attackVectors: string[];
  certificationStatus: CertificationStatus;
  determinismViolationDetected: boolean;
  violationClassification?: ViolationClassification;
  crossMachineConsistency?: boolean;
}

const CONTRACT_VERSION = "0.1.0";

export function buildReport(params: BuildReportParams): DeterminismReport {
  const report: DeterminismReport = {
    certification_status: params.certificationStatus,
    determinism_violation_detected: params.determinismViolationDetected,
    attack_vectors_triggered: [...params.attackVectors].sort(),
    confidence_score: params.confidence,
    envelope_hash: params.envelopeHash,
    contract_version: CONTRACT_VERSION,
  };
  if (params.violationClassification != null) {
    report.violation_classification = params.violationClassification;
  }
  if (params.reproSeed != null) report.repro_seed = params.reproSeed;
  if (params.minimalReproState != null) report.minimal_repro_state = params.minimalReproState;
  if (params.coverage != null) report.coverage_score = params.coverage;
  if (params.crossMachineConsistency != null) {
    report.cross_machine_consistency = params.crossMachineConsistency;
  }
  const serialized = stableStringify(report);
  report.certificate_id = createHash("sha256").update(serialized, "utf8").digest("hex").slice(0, 16);
  return report;
}

/** Byte-identical serialization. */
export function serializeReport(report: DeterminismReport): string {
  return stableStringify(report);
}

/** SHA256 of serialized report for multi-run comparison. */
export function hashReport(report: DeterminismReport): string {
  return createHash("sha256").update(serializeReport(report), "utf8").digest("hex");
}
