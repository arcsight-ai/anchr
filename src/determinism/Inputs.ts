/**
 * Bounded input capture for determinism certification.
 */

import { spawnSync } from "child_process";
import { resolve } from "path";

export interface DiffEntry {
  status: string;
  path: string;
}

const EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORE_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  "test",
  "tests",
  "__tests__",
]);
const IGNORE_PATTERN = /\.(spec|test)\.(ts|tsx)$|\.(generated|gen)\.ts$/;

/** Same rules as structural: exclude test paths. */
export function isTestPath(path: string): boolean {
  if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return true;
  if (IGNORE_PATTERN.test(path)) return true;
  const parts = path.split("/");
  for (const p of parts) {
    if (IGNORE_DIRS.has(p)) return true;
  }
  return false;
}

function isTracked(path: string): boolean {
  if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return false;
  if (IGNORE_PATTERN.test(path)) return false;
  const parts = path.split("/");
  for (const p of parts) {
    if (IGNORE_DIRS.has(p)) return false;
  }
  return true;
}

export function resolveRepoRoot(): string {
  const out = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024,
  });
  if (out.status !== 0 || !out.stdout?.trim()) {
    throw new Error("DETERMINISM_INPUT: not a git repository or rev-parse failed");
  }
  return resolve(out.stdout.trim());
}

export function resolveBaseHead(params: {
  baseSha?: string;
  headSha?: string;
}): { baseSha: string; headSha: string } {
  const { baseSha, headSha } = params;
  if (!baseSha || !headSha) {
    throw new Error(
      "DETERMINISM_INPUT: baseSha and headSha are required (no guessing). Pass --base and --head."
    );
  }
  return { baseSha, headSha };
}

export function getDiffNameStatus(
  repoRoot: string,
  baseSha: string,
  headSha: string,
  staged: boolean
): DiffEntry[] {
  const args = staged
    ? ["diff", "--cached", "--no-renames", "--name-status"]
    : ["diff", "--no-renames", "--name-status", baseSha, headSha];
  const out = spawnSync("git", args, {
    encoding: "utf8",
    cwd: repoRoot,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (out.status !== 0) return [];

  const entries: DiffEntry[] = [];
  const lines = (out.stdout ?? "").split("\n");
  for (const line of lines) {
    const m = line.match(/^([ADM])\s+(.+)$/);
    if (!m) continue;
    const status = m[1]!;
    const path = m[2]!.replace(/\\/g, "/").trim();
    if (!isTracked(path)) continue;
    entries.push({ status, path });
  }
  return entries;
}

export interface ClassifiedFiles {
  changedTs: string[];
  deletedTs: string[];
  renamedPairs: { from: string; to: string }[];
}

export function classifyChangedFiles(diffEntries: DiffEntry[]): ClassifiedFiles {
  const changedTs: string[] = [];
  const deletedTs: string[] = [];
  const renamedPairs: { from: string; to: string }[] = [];

  for (const e of diffEntries) {
    if (!EXTENSIONS.has(pathExt(e.path))) continue;
    if (e.status === "D") {
      deletedTs.push(e.path);
    } else if (e.status === "A" || e.status === "M") {
      changedTs.push(e.path);
    }
  }

  changedTs.sort();
  deletedTs.sort();
  return { changedTs, deletedTs, renamedPairs };
}

function pathExt(p: string): string {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i) : "";
}
