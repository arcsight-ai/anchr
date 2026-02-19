/**
 * Deterministic repo state hash: sorted .ts/.tsx paths + file sizes.
 * No git; filesystem only.
 */

import { readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { sha256 } from "../structural/report.js";

const EXCLUDED = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  "artifacts",
  "coverage",
]);

function posix(p: string): string {
  return p.replace(/\\/g, "/");
}

function walkTs(repoRoot: string, dir: string, out: { path: string; size: number }[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  const names = entries.map((e) => e.name).filter((n) => !EXCLUDED.has(n));
  names.sort((a, b) => a.localeCompare(b, "en"));

  for (const name of names) {
    const abs = join(dir, name);
    try {
      const st = statSync(abs, { throwIfNoEntry: false });
      if (!st) continue;
      if (st.isDirectory()) walkTs(repoRoot, abs, out);
      else if ((name.endsWith(".ts") || name.endsWith(".tsx")) && st.isFile()) {
        const rel = posix(abs.slice(resolve(repoRoot).length).replace(/^\//, ""));
        out.push({ path: rel, size: st.size });
      }
    } catch {
      // skip
    }
  }
}

/**
 * Deterministic hash of repo state: sorted paths + sizes.
 */
export function computeRepoHash(repoRoot: string): string {
  const root = resolve(repoRoot);
  const entries: { path: string; size: number }[] = [];
  walkTs(root, root, entries);
  entries.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const payload = entries.map((e) => `${e.path}\n${e.size}`).join("\n");
  return sha256(payload);
}
