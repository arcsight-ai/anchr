import { listFilesAtRef, getFileAtRevision } from "../structural/git.js";
import { parseDeps } from "../structural/parseDeps.js";
import { extractPressuresFromFile } from "./pressure.js";

export function analyzeAtRef(
  repoRoot: string,
  ref: string,
): Map<string, number> {
  const combined = new Map<string, number>();
  const files = listFilesAtRef(repoRoot, ref);

  for (const path of files) {
    try {
      const content = getFileAtRevision(repoRoot, ref, path);
      if (!content) continue;

      const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const deps = parseDeps(normalized);
      const pressures = extractPressuresFromFile(path, deps.valueImports);

      for (const [key, weight] of pressures) {
        combined.set(key, weight);
      }
    } catch {
      // skip file
    }
  }

  return combined;
}
