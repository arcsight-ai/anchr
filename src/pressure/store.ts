import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import type { PressureStore, PressurePRMemory, PressureSignalsOutput, PressureSignal } from "./types.js";

function stableStringify(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj === "boolean") return String(obj);
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "string") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return "[" + obj.map((v) => stableStringify(v)).join(",") + "]";
  }
  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b, "en"));
    const parts = keys.map((k) => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k]));
    return "{" + parts.join(",") + "}";
  }
  return "null";
}

function atomicWrite(path: string, content: string): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, ".tmp-arcsight-pressure-write.json");
  writeFileSync(tmp, content, "utf8");
  try {
    renameSync(tmp, path);
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
}

const PRESSURE_FILE = "arcsight-pressure.json";
const PRESSURE_PR_FILE = "arcsight-pressure-pr.json";
const SIGNALS_FILE = "arcsight-pressure-signals.json";

export function loadPressureStore(artifactsDir: string): PressureStore {
  const path = join(artifactsDir, PRESSURE_FILE);
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as PressureStore;
    if (data && typeof data.boundaries === "object") return data;
  } catch {
    // missing or invalid
  }
  return { boundaries: {} };
}

export function savePressureStore(artifactsDir: string, store: PressureStore): void {
  const path = join(artifactsDir, PRESSURE_FILE);
  atomicWrite(path, stableStringify(store) + "\n");
}

export function loadPressurePRMemory(artifactsDir: string): PressurePRMemory {
  const path = join(artifactsDir, PRESSURE_PR_FILE);
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as PressurePRMemory;
    if (data && typeof data.shown === "object") return data;
  } catch {
    // missing or invalid
  }
  return { shown: {} };
}

/** Merge current signals with previously shown for this head; return merged list and updated memory. */
export function mergeSignalsWithPRMemory(
  headSha: string,
  currentSignals: PressureSignal[],
  memory: PressurePRMemory,
): { signalsToShow: PressureSignal[]; updatedMemory: PressurePRMemory } {
  const prev = memory.shown[headSha] ?? {};
  const byBoundary = new Map<string, number>();

  for (const s of currentSignals) {
    byBoundary.set(s.boundary, s.count);
  }
  for (const [boundary, count] of Object.entries(prev)) {
    if (!byBoundary.has(boundary)) byBoundary.set(boundary, count);
  }

  const signalsToShow: PressureSignal[] = Array.from(byBoundary.entries())
    .map(([boundary, count]) => ({ boundary, count }))
    .sort((a, b) => b.count - a.count);

  const updated: PressurePRMemory = {
    ...memory,
    shown: {
      ...memory.shown,
      [headSha]: Object.fromEntries(byBoundary),
    },
  };

  return { signalsToShow, updatedMemory: updated };
}

export function savePressurePRMemory(artifactsDir: string, memory: PressurePRMemory): void {
  const path = join(artifactsDir, PRESSURE_PR_FILE);
  atomicWrite(path, stableStringify(memory) + "\n");
}

export function writePressureSignals(artifactsDir: string, output: PressureSignalsOutput): void {
  const path = join(artifactsDir, SIGNALS_FILE);
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  atomicWrite(path, stableStringify(output) + "\n");
}

export function readPressureSignals(artifactsDir: string): PressureSignalsOutput | null {
  const path = join(artifactsDir, SIGNALS_FILE);
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as PressureSignalsOutput;
    if (data && Array.isArray(data.signals) && typeof data.headSha === "string") return data;
  } catch {
    // missing or invalid
  }
  return null;
}
