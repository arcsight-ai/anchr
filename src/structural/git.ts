import { spawnSync } from "child_process";
import { resolve } from "path";

export interface BaseHead {
  base: string;
  head: string;
}

export interface DiffEntry {
  status: "A" | "M" | "D";
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

function isTracked(path: string): boolean {
  if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return false;
  if (IGNORE_PATTERN.test(path)) return false;
  const parts = path.split("/");
  for (const p of parts) {
    if (IGNORE_DIRS.has(p)) return false;
  }
  return true;
}

export function getRepoRoot(): string | null {
  try {
    const out = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024,
    });
    if (out.status !== 0 || !out.stdout?.trim()) return null;
    return resolve(out.stdout.trim());
  } catch {
    return null;
  }
}

export function getBaseHead(repoRoot: string): BaseHead | null {
  const envBase = process.env.GITHUB_BASE_SHA ?? process.env.BASE_SHA;
  const envHead =
    process.env.HEAD_SHA ??
    process.env.GITHUB_SHA ??
    process.env.GITHUB_HEAD_SHA;

  const cliIdx = process.argv.indexOf("--base");
  const cliBase = cliIdx >= 0 ? process.argv[cliIdx + 1] : undefined;
  const cliHeadIdx = process.argv.indexOf("--head");
  const cliHead = cliHeadIdx >= 0 ? process.argv[cliHeadIdx + 1] : undefined;

  let base = cliBase ?? envBase;
  let head = cliHead ?? envHead;

  if (base && head) return { base, head };

  try {
    if (!head) {
      const out = spawnSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        cwd: repoRoot,
        maxBuffer: 64 * 1024,
      });
      head = out.status === 0 ? out.stdout?.trim() ?? null : null;
    }
    if (!base && head) {
      const out = spawnSync("git", ["merge-base", "main", head], {
        encoding: "utf8",
        cwd: repoRoot,
        maxBuffer: 64 * 1024,
      });
      base = out.status === 0 ? out.stdout?.trim() ?? null : null;
    }
    if (base && head) return { base, head };
  } catch {
    // fallback failed
  }

  return null;
}

export function getDiff(
  repoRoot: string,
  base: string,
  head: string,
): DiffEntry[] {
  const out = spawnSync(
    "git",
    ["diff", "--no-renames", "--name-status", base, head],
    {
      encoding: "utf8",
      cwd: repoRoot,
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (out.status !== 0) return [];

  const entries: DiffEntry[] = [];
  const lines = (out.stdout ?? "").split("\n");

  for (const line of lines) {
    const m = line.match(/^([ADM])\s+(.+)$/);
    if (!m) continue;

    const status = m[1] as "A" | "D" | "M";
    const path = m[2].replace(/\\/g, "/").trim();

    if (!isTracked(path)) continue;

    entries.push({ status, path });
  }

  return entries;
}

export function getFileAtRevision(
  repoRoot: string,
  rev: string,
  path: string,
): string | null {
  try {
    const out = spawnSync("git", ["show", `${rev}:${path}`], {
      encoding: "utf8",
      cwd: repoRoot,
      maxBuffer: 2 * 1024 * 1024,
    });
    return out.status === 0 ? out.stdout ?? null : null;
  } catch {
    return null;
  }
}
