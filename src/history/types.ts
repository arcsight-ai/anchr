/**
 * Prompt 2 — Architectural History Forensics. Types only.
 */

export type ViolationCause =
  | "boundary_violation"
  | "deleted_public_api"
  | "type_import_private_target"
  | "relative_escape";

export interface HistoryIncident {
  id: string;
  type: ViolationCause;
  from: string;
  to: string;
  violationKey: string;
  introducedCommit: string;
  introducedDate: string;
  introducedIndex: number;
  introducedBy?: string;
  introducedEmail?: string;
  fixedCommit?: string;
  fixedDate?: string;
  fixedBy?: string;
  active: boolean;
  ageCommits: number;
  ageDays?: number;
  branchResponsibility?: "NEW" | "FIXED" | "INHERITED" | "UNCHANGED";
}

export interface HistoryResult {
  mode: "history";
  commitsAnalyzed: number;
  debtScore: number;
  responsibility: {
    introduced: number;
    fixed: number;
    inherited: number;
  };
  incidents: HistoryIncident[];
  confidence: {
    coverageRatio: number;
    downgradeReasons: string[];
  };
  incomplete?: boolean;
  incompleteReason?: string;
}
