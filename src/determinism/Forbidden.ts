/**
 * Tier-0 scanner for forbidden implicit inputs in changed files.
 * Records attack_vectors_triggered; does not fail determinism by default.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

export enum ForbiddenVector {
  DateNow = "Date.now",
  NewDate = "new Date(",
  MathRandom = "Math.random",
  CryptoRandom = "crypto.random",
  LocaleCompare = "localeCompare",
  ProcessEnv = "process.env",
  Fetch = "fetch(",
  Http = "http",
}

const PATTERNS: { vector: ForbiddenVector; pattern: RegExp }[] = [
  { vector: ForbiddenVector.DateNow, pattern: /Date\.now\s*\(/ },
  { vector: ForbiddenVector.NewDate, pattern: /new\s+Date\s*\(/ },
  { vector: ForbiddenVector.MathRandom, pattern: /Math\.random\s*\(/ },
  { vector: ForbiddenVector.CryptoRandom, pattern: /crypto\.random|require\s*\(\s*['"]crypto['"]\s*\)/ },
  { vector: ForbiddenVector.LocaleCompare, pattern: /\.localeCompare\s*\(/ },
  { vector: ForbiddenVector.ProcessEnv, pattern: /process\.env\s*\[|process\.env\./ },
  { vector: ForbiddenVector.Fetch, pattern: /fetch\s*\(/ },
  { vector: ForbiddenVector.Http, pattern: /require\s*\(\s*['"]https?['"]\s*\)|from\s+['"]https?[:/]/ },
];

export interface ForbiddenFinding {
  vector: ForbiddenVector;
  file: string;
  line?: number;
}

/**
 * Scan file paths (under repoRoot) for Tier-0 forbidden patterns.
 * Returns list of findings; does not throw.
 */
export function scanForbidden(
  repoRoot: string,
  filePaths: string[]
): ForbiddenFinding[] {
  const findings: ForbiddenFinding[] = [];

  for (const rel of filePaths) {
    const abs = resolve(repoRoot, rel);
    let content: string;
    try {
      content = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      for (const { vector, pattern } of PATTERNS) {
        if (pattern.test(line)) {
          findings.push({ vector, file: rel, line: i + 1 });
        }
      }
    }
  }

  return findings;
}

/** Dedupe by (vector, file) and return as attack_vectors_triggered list. */
export function attackVectorsTriggered(findings: ForbiddenFinding[]): string[] {
  const set = new Set<string>();
  for (const f of findings) {
    set.add(f.vector);
  }
  return [...set].sort();
}
