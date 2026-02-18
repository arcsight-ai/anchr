import { getFirstParentWindow } from "../structural/git.js";
import type { PressureStore, PressureSignal } from "./types.js";

const WINDOW_SIZE = 150;
const THRESHOLD = 3;

export function addFingerprintsToStore(
  store: PressureStore,
  entries: { boundary: string; fingerprint: string }[],
  headSha: string,
): void {
  for (const { boundary, fingerprint } of entries) {
    if (!store.boundaries[boundary]) {
      store.boundaries[boundary] = { fingerprints: {} };
    }
    store.boundaries[boundary].fingerprints[fingerprint] = headSha;
  }
}

export function computeSignals(
  store: PressureStore,
  repoRoot: string,
  headSha: string,
): PressureSignal[] {
  const windowSet = new Set(
    getFirstParentWindow(repoRoot, headSha, WINDOW_SIZE),
  );

  const signals: PressureSignal[] = [];

  for (const [boundary, data] of Object.entries(store.boundaries)) {
    let count = 0;
    for (const commit of Object.values(data.fingerprints)) {
      if (windowSet.has(commit)) count++;
    }
    if (count >= THRESHOLD) {
      signals.push({ boundary, count });
    }
  }

  return signals.sort((a, b) => b.count - a.count);
}

export function formatSignalsSection(signals: PressureSignal[]): string {
  if (signals.length === 0) return "";

  const lines: string[] = [];
  lines.push("**Architecture Signals**");
  lines.push("");
  lines.push("Repeated dependency pressure detected:");
  lines.push("");
  for (const s of signals) {
    lines.push(`- ${s.boundary} (${s.count})`);
  }
  lines.push("");
  lines.push("This usually indicates a missing abstraction rather than a mistake.");
  lines.push("");
  lines.push("Suggested actions:");
  lines.push("- introduce a shared interface package");
  lines.push("- expose a stable public entrypoint");
  lines.push("- intentionally merge the modules if separation is artificial");
  lines.push("");
  lines.push("This is advisory only and does not block the PR.");

  return lines.join("\n");
}
