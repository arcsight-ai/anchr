import { sep } from "path";

/**
 * Canonicalize path for deterministic cross-OS behavior.
 * - repo-relative
 * - forward slashes
 * - collapse . and ..
 * - strip trailing slash
 * - lowercase drive letters (Windows)
 * - DO NOT lowercase full path (Linux case-sensitive)
 * - no symlink resolution (use resolved path as-is for determinism)
 */
export function canonicalPath(
  absPath: string,
  repoRoot: string,
): string {
  const norm = absPath.replace(/\\/g, "/");
  const rootNorm = repoRoot.replace(/\\/g, "/");

  let rel = norm;
  if (norm.startsWith(rootNorm)) {
    rel = norm.slice(rootNorm.length).replace(/^\//, "");
  }

  const parts = rel.split("/").filter((p) => p && p !== ".");
  const out: string[] = [];

  for (const p of parts) {
    if (p === "..") {
      out.pop();
    } else {
      out.push(p);
    }
  }

  let result = out.join("/");
  if (result.endsWith("/")) result = result.slice(0, -1);

  if (/^[A-Z]:/.test(result)) {
    result = result[0].toLowerCase() + result.slice(1);
  }

  return result;
}
