/**
 * Mode 3 token normalization. Semantic stop-words, singularize, min 2 tokens.
 */

const STOP_WORDS = new Set([
  "get",
  "set",
  "data",
  "util",
  "utils",
  "helper",
  "helpers",
  "index",
  "type",
  "types",
  "base",
  "common",
  "core",
  "value",
  "values",
  "manager",
  "impl",
  "implementation",
  "internal",
  "public",
  "default",
  "create",
  "make",
  "build",
  "process",
  "run",
  "exec",
  "handle",
  "do",
  "lib",
  "misc",
  "item",
  "thing",
  "object",
  "shared",
  "private",
]);

const PLURALS: [RegExp, string][] = [
  [/objects$/i, "object"],
  [/values$/i, "value"],
  [/types$/i, "type"],
  [/helpers$/i, "helper"],
  [/utils$/i, "util"],
  [/managers$/i, "manager"],
  [/schemas$/i, "schema"],
  [/models$/i, "model"],
  [/entities$/i, "entity"],
];

function singularize(t: string): string {
  for (const [re, repl] of PLURALS) {
    if (re.test(t)) return repl;
  }
  return t;
}

function splitCamelCase(s: string): string[] {
  return s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/);
}

function splitSnakeCase(s: string): string[] {
  return s.split(/_+/);
}

function tokenizeSegment(segment: string): string[] {
  const out: string[] = [];
  for (const camel of splitCamelCase(segment)) {
    for (const snake of splitSnakeCase(camel)) {
      const t = snake.trim().toLowerCase();
      if (t.length > 0 && !STOP_WORDS.has(t)) {
        out.push(singularize(t));
      }
    }
  }
  return out;
}

export function normalizeForPressure(raw: string): string[] {
  const s = raw.toLowerCase().trim().replace(/\.(ts|tsx|js|jsx)$/, "").replace(/\d+/g, "");
  const out: string[] = [];
  for (const segment of s.split(/[/\\._-]+/)) {
    out.push(...tokenizeSegment(segment));
  }
  return out;
}

export function pressureTokensFromSpecifierAndIdentifiers(
  specifier: string,
  identifiers: string[],
): string[] {
  const out: string[] = [];
  for (const seg of specifier.replace(/\\/g, "/").split("/")) {
    out.push(...normalizeForPressure(seg));
  }
  for (const id of identifiers) {
    out.push(...normalizeForPressure(id));
  }
  const dedup = [...new Set(out)].filter((t) => !STOP_WORDS.has(t));
  return dedup.sort((a, b) => a.localeCompare(b, "en"));
}

export const MIN_MEANINGFUL_TOKENS = 2;

export function toStablePressureTokens(
  specifier: string,
  identifiers: string[],
): string[] | null {
  const tokens = pressureTokensFromSpecifierAndIdentifiers(specifier, identifiers);
  return tokens.length >= MIN_MEANINGFUL_TOKENS ? tokens : null;
}
