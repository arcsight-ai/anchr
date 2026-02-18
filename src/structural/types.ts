export type ViolationKind =
  | "boundary_violation"
  | "type_import_private_target"
  | "relative_escape"
  | "deleted_public_api";

export interface Violation {
  package: string;
  path: string;
  cause: ViolationKind;
  specifier?: string;
}

export type DecisionLevel = "allow" | "block" | "warn";

export type ReportStatus = "VERIFIED" | "BLOCKED" | "INCOMPLETE";

export interface Report {
  status: ReportStatus;
  classification: { primaryCause: ViolationKind | null };
  minimalCut: string[];
  decision: { level: DecisionLevel; reason: string };
  confidence: { coverageRatio: number };
  scope: { mode: string };
  run: { id: string };
}
