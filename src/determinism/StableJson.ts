/**
 * Deterministic JSON stringification with binary key ordering.
 * Array order is preserved (caller must canonicalize before if needed).
 */

import { stringCompareBinary } from "./CanonicalOrder.js";

export function stableStringify(obj: unknown): string {
  if (obj === null) return "null";
  if (typeof obj === "boolean") return String(obj);
  if (typeof obj === "number") return String(obj);
  if (typeof obj === "string") return JSON.stringify(obj);

  if (Array.isArray(obj)) {
    const parts = obj.map((v) => stableStringify(v));
    return "[" + parts.join(",") + "]";
  }

  if (typeof obj === "object") {
    const keys = Object.keys(obj).sort((a, b) => stringCompareBinary(a, b));
    const parts = keys.map(
      (k) => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k])
    );
    return "{" + parts.join(",") + "}";
  }

  return "null";
}
