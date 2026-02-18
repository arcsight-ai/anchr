export type ModuleID = string;

export type EdgeKind = "value-import" | "reexport" | "public-surface";

export interface Edge {
  from: ModuleID;
  to: ModuleID;
  kind: EdgeKind;
}

export interface NodeMetadata {
  moduleId: ModuleID;
  filePath: string;
  package: string;
  isEntry: boolean;
}

export interface GraphResult {
  nodes: ModuleID[];
  edges: Edge[];
  metadata: Map<ModuleID, NodeMetadata>;
  stats: {
    nodeCount: number;
    edgeCount: number;
    kindsBreakdown: Record<EdgeKind, number>;
  };
}
