export interface PressureStore {
  boundaries: Record<string, { fingerprints: Record<string, string> }>;
}

export interface PressurePRMemory {
  /** headSha -> boundary -> count (so we can re-show and merge with current signals) */
  shown: Record<string, Record<string, number>>;
}

export interface PressureSignal {
  boundary: string;
  count: number;
}

export interface PressureSignalsOutput {
  signals: PressureSignal[];
  headSha: string;
}
