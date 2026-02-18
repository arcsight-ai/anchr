import { createHash } from "crypto";
import { readFileSync } from "fs";
import { relative, resolve } from "path";

const FINGERPRINT_SCHEMA = "fs:v1";
const MAX_RETRIES = 2;

function normalizeContent(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").normalize("NFC");
}

function readFileWithRetry(absPath: string): string | null {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const buf = readFileSync(absPath, { encoding: "utf8" });
      return normalizeContent(buf);
    } catch {
      // retry
    }
  }
  return null;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function relativePath(root: string, absPath: string): string {
  const rel = relative(root, absPath);
  return rel.replace(/\\/g, "/").toLowerCase();
}

/**
 * Creates a deterministic fingerprint of the repository content state.
 * Same content → identical fingerprint regardless of filesystem, OS, or order.
 */
export function createFingerprint(root: string, files: string[]): string {
  const absRoot = resolve(root);
  const sorted = [...files].sort((a, b) => a.localeCompare(b, "en"));

  let buffer = FINGERPRINT_SCHEMA + "\n";

  for (const absPath of sorted) {
    const rel = relativePath(absRoot, absPath);
    const content = readFileWithRetry(absPath);

    if (content === null) {
      buffer += rel + "\nUNREADABLE\n";
    } else {
      const contentHash = sha256Hex(content);
      buffer += rel + "\n" + contentHash + "\n";
    }
  }

  const repoHash = sha256Hex(buffer);
  return repoHash;
}
