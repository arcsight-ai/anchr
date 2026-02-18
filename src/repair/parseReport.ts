export interface ParsedViolation {
  package: string;
  path: string;
  cause: string;
  specifier?: string;
}

export function parseMinimalCut(minimalCut: string[]): ParsedViolation[] {
  const out: ParsedViolation[] = [];
  for (const entry of minimalCut) {
    const parts = entry.split(":");
    if (parts.length < 3) continue;
    const pkg = parts[0];
    const path = parts[1];
    const cause = parts[2];
    const specifier = parts.length >= 4 ? parts.slice(3).join(":") : undefined;
    out.push({ package: pkg, path, cause, specifier });
  }
  return out;
}
