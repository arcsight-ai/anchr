/**
 * .anchr.yml loader (v1 — frozen schema). Governance layer only.
 * Only anchr gate reads this. Policy does not alter structural authority.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

const ALLOWED_KEYS = new Set(["enforcement", "ignore", "maxFiles", "timeoutMs"]);
const VALID_ENFORCEMENT = new Set(["STRICT", "ADVISORY"]);
const DEFAULT_MAX_FILES = 400;
const DEFAULT_TIMEOUT_MS = 8000;
const MIN_MAX_FILES = 1;
const MAX_MAX_FILES = 10000;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 120000;

export interface AnchrConfig {
  enforcement: "STRICT" | "ADVISORY";
  ignore: string[];
  maxFiles: number;
  timeoutMs: number;
}

/**
 * Load and validate .anchr.yml from repository root.
 * Unknown keys or invalid values → throw (caller exits 2).
 * Missing file → return default config (ADVISORY, []).
 */
export function loadAnchrConfig(repoRoot: string): AnchrConfig {
  const path = join(repoRoot, ".anchr.yml");
  if (!existsSync(path)) {
    return { enforcement: "ADVISORY", ignore: [], maxFiles: DEFAULT_MAX_FILES, timeoutMs: DEFAULT_TIMEOUT_MS };
  }

  let raw: unknown;
  try {
    const content = readFileSync(path, "utf8");
    raw = parse(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`.anchr.yml: invalid YAML — ${msg}`);
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(".anchr.yml: root must be an object");
  }

  const obj = raw as Record<string, unknown>;

  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`.anchr.yml: unknown key "${key}" (v1 schema is frozen)`);
    }
  }

  let enforcement: "STRICT" | "ADVISORY" = "ADVISORY";
  if (obj.enforcement !== undefined) {
    if (typeof obj.enforcement !== "string") {
      throw new Error(".anchr.yml: enforcement must be STRICT or ADVISORY");
    }
    if (!VALID_ENFORCEMENT.has(obj.enforcement)) {
      throw new Error(".anchr.yml: enforcement must be STRICT or ADVISORY");
    }
    enforcement = obj.enforcement as "STRICT" | "ADVISORY";
  }

  let ignore: string[] = [];
  if (obj.ignore !== undefined) {
    if (!Array.isArray(obj.ignore)) {
      throw new Error(".anchr.yml: ignore must be an array of glob patterns");
    }
    for (let i = 0; i < obj.ignore.length; i++) {
      const v = obj.ignore[i];
      if (typeof v !== "string") {
        throw new Error(`.anchr.yml: ignore[${i}] must be a string`);
      }
      ignore.push(v);
    }
  }

  let maxFiles = DEFAULT_MAX_FILES;
  if (obj.maxFiles !== undefined) {
    const n = Number(obj.maxFiles);
    if (!Number.isInteger(n) || n < MIN_MAX_FILES || n > MAX_MAX_FILES) {
      throw new Error(`.anchr.yml: maxFiles must be an integer between ${MIN_MAX_FILES} and ${MAX_MAX_FILES}`);
    }
    maxFiles = n;
  }

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (obj.timeoutMs !== undefined) {
    const n = Number(obj.timeoutMs);
    if (!Number.isInteger(n) || n < MIN_TIMEOUT_MS || n > MAX_TIMEOUT_MS) {
      throw new Error(`.anchr.yml: timeoutMs must be an integer between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS}`);
    }
    timeoutMs = n;
  }

  return { enforcement, ignore, maxFiles, timeoutMs };
}
