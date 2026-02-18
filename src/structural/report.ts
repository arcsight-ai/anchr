import { createHash } from "crypto";

export function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

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
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b, "en"));
    const parts = keys.map((k) => JSON.stringify(k) + ":" + stableStringify((obj as Record<string, unknown>)[k]));
    return "{" + parts.join(",") + "}";
  }

  return "null";
}
