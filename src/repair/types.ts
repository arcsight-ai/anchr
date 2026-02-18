export type RepairActionType =
  | "promote_to_public"
  | "introduce_adapter"
  | "redirect_import"
  | "remove_usage";

export interface RepairAction {
  id: string;
  type: RepairActionType;
  intentPreservingLevel: 1 | 2 | 3 | 4;
  fromPackage: string;
  toPackage: string;
  symbol: string;
  requiredChange: string;
  impactRadius: number;
  guaranteesUnblock: boolean;
  dependsOn: string[];
}

export interface RepairPlan {
  status: "no-report" | "verified" | "uncertain" | "blocked";
  primaryActionPath: RepairAction[];
  actions: RepairAction[];
}
