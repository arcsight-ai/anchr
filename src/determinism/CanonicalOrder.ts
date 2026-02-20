/**
 * Canonical ordering: binary UTF-16 code unit ascending only.
 * NEVER use localeCompare (normative for determinism platform).
 */

/** Binary string comparison (UTF-16 code unit ascending). Returns -1 | 0 | 1. */
export function stringCompareBinary(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export interface DiffEntry {
  status: string;
  path: string;
}

/** Sort diff entries by (path asc, status asc) using binary order. */
export function sortDiffEntries(entries: DiffEntry[]): DiffEntry[] {
  return [...entries].sort((a, b) => {
    const pathCmp = stringCompareBinary(a.path, b.path);
    if (pathCmp !== 0) return pathCmp;
    return stringCompareBinary(a.status, b.status);
  });
}

export interface ViolationLike {
  package?: string;
  path: string;
  cause: string;
  specifier?: string;
  message?: string;
}

/** Sort violations by (package asc, path asc, cause asc, specifier asc, message asc) using binary order. */
export function sortViolations<T extends ViolationLike>(violations: T[]): T[] {
  return [...violations].sort((a, b) => {
    const pkgA = a.package ?? "";
    const pkgB = b.package ?? "";
    const pkgCmp = stringCompareBinary(pkgA, pkgB);
    if (pkgCmp !== 0) return pkgCmp;
    const pathCmp = stringCompareBinary(a.path, b.path);
    if (pathCmp !== 0) return pathCmp;
    const causeCmp = stringCompareBinary(a.cause, b.cause);
    if (causeCmp !== 0) return causeCmp;
    const specA = a.specifier ?? "";
    const specB = b.specifier ?? "";
    const specCmp = stringCompareBinary(specA, specB);
    if (specCmp !== 0) return specCmp;
    const msgA = a.message ?? "";
    const msgB = b.message ?? "";
    return stringCompareBinary(msgA, msgB);
  });
}
