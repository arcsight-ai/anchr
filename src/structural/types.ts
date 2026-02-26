export type ViolationKind =
  | "boundary_violation"
  | "type_import_private_target"
  | "relative_escape"
  | "deleted_public_api"
  | "circular_import";

/** Causal Proof Contract: verifiable repo facts only. No reasoning. */
export type ProofType =
  | "import_path"
  | "export_path"
  | "deleted_file"
  | "relative_escape_path"
  | "circular_import"
  | "runtime_signal";

export interface Proof {
  type: ProofType;
  /** Absolute repo path of the file that introduced the change */
  source: string;
  /** Absolute repo path or module specifier that caused the violation */
  target: string;
  /** Exact rule triggered */
  rule: ViolationKind;
}

export interface Violation {
  package: string;
  path: string;
  cause: ViolationKind;
  specifier?: string;
  identifiers?: string[];
  /** Required for BLOCKED decision. If missing, status must be INDETERMINATE. */
  proof?: Proof;
}

export type DecisionLevel = "allow" | "block" | "warn";

export type ReportStatus = "VERIFIED" | "BLOCKED" | "INCOMPLETE" | "INDETERMINATE";

export interface Report {
  status: ReportStatus;
  classification: { primaryCause: ViolationKind | null };
  minimalCut: string[];
  /** One proof per violation (same order). Omitted when status is INDETERMINATE. */
  proofs?: Proof[];
  decision: { level: DecisionLevel; reason: string };
  confidence: { coverageRatio: number };
  scope: { mode: string };
  run: { id: string };
}
