/**
 * Extract and normalize semantic tokens. Pure functions only.
 */

const STOP_LIST = new Set([
  "index",
  "types",
  "utils",
  "helpers",
  "common",
  "shared",
  "base",
  "core",
  "lib",
  "data",
  "value",
  "item",
  "thing",
  "object",
  "misc",
  "internal",
  "private",
]);

const MIN_TOKEN_LENGTH = 3;

function splitCamelCase(s: string): string[] {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/);
}

function splitSnakeCase(s: string): string[] {
  return s.split(/_+/);
}

export function normalizeToken(raw: string): string[] {
  let s = raw.toLowerCase().trim();
  s = s.replace(/\.(ts|tsx|js|jsx)$/, "");
  s = s.replace(/\d+/g, "");
  const parts: string[] = [];
  for (const segment of s.split(/[/\\.-]+/)) {
    for (const camel of splitCamelCase(segment)) {
      for (const snake of splitSnakeCase(camel)) {
        const t = snake.trim().toLowerCase();
        if (t.length >= MIN_TOKEN_LENGTH && !STOP_LIST.has(t)) {
          parts.push(t);
        }
      }
    }
  }
  return parts;
}

export function tokensFromSpecifier(specifier: string): string[] {
  const segments = specifier.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const seg of segments) {
    out.push(...normalizeToken(seg));
  }
  return out;
}

export function tokensFromPath(path: string): string[] {
  const fileName = path.split("/").pop() ?? path;
  return normalizeToken(fileName);
}

export function tokensFromIdentifiers(identifiers: string[]): string[] {
  const out: string[] = [];
  for (const id of identifiers) {
    out.push(...normalizeToken(id));
  }
  return out;
}

export function filterStopAndShort(tokens: string[]): string[] {
  return tokens
    .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOP_LIST.has(t))
    .sort((a, b) => a.localeCompare(b, "en"));
}

export function uniqueSorted(tokens: string[]): string[] {
  return [...new Set(filterStopAndShort(tokens))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
}
