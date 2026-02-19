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

  let base: string | null | undefined = cliBase ?? envBase;
  let head: string | null | undefined = cliHead ?? envHead;

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
    if (typeof base === "string" && typeof head === "string") return { base, head };
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

/**
 * Staged diff (index vs HEAD). For CLI --staged mode. Same shape as getDiff.
 */
export function getDiffCached(repoRoot: string): DiffEntry[] {
  try {
    const out = spawnSync(
      "git",
      ["diff", "--cached", "--no-renames", "--name-status"],
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
      const normalized = m[2].replace(/\\/g, "/").trim();
      if (!isTracked(normalized)) continue;
      entries.push({ status, path: normalized } as DiffEntry);
    }
    return entries;
  } catch {
    return [];
  }
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

export function getFirstParentWindow(
  repoRoot: string,
  head: string,
  n: number,
): string[] {
  try {
    const out = spawnSync("git", ["rev-list", "--first-parent", "-n", String(n), head], {
      encoding: "utf8",
      cwd: repoRoot,
      maxBuffer: 64 * 1024,
    });
    if (out.status !== 0) return [];
    return (out.stdout ?? "").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function listFilesAtRef(repoRoot: string, ref: string): string[] {
  try {
    const out = spawnSync("git", ["ls-tree", "-r", "--name-only", ref, "--", "packages/"], {
      encoding: "utf8",
      cwd: repoRoot,
      maxBuffer: 2 * 1024 * 1024,
    });
    if (out.status !== 0) return [];
    return (out.stdout ?? "")
      .trim()
      .split("\n")
      .filter((p) => (p.endsWith(".ts") || p.endsWith(".tsx")) && /^packages\/[^/]+\/src\//.test(p));
  } catch {
    return [];
  }
}

export function getMergeBase(repoRoot: string, head: string, baseRef: string): string | null {
  try {
    const out = spawnSync("git", ["merge-base", head, baseRef], {
      encoding: "utf8",
      cwd: repoRoot,
      maxBuffer: 64 * 1024,
    });
    return out.status === 0 && out.stdout?.trim() ? out.stdout.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Resolve commit to its tree SHA (topology-stable; unchanged by rebase).
 * Use for deterministic Instance ID.
 */
export function getTreeAtRef(repoRoot: string, ref: string): string | null {
  try {
    const out = spawnSync("git", ["rev-parse", `${ref}^{tree}`], {
      encoding: "utf8",
      cwd: repoRoot,
      maxBuffer: 64 * 1024,
    });
    return out.status === 0 && out.stdout?.trim() ? out.stdout.trim() : null;
  } catch {
    return null;
  }
}

/** rev-list --reverse; either since..HEAD or -n maxCount HEAD. Stops at maxCount. */
export function getRevListReverse(
  repoRoot: string,
  opts: { since?: string; maxCount: number },
): string[] {
  try {
    const args = ["rev-list", "--first-parent", "--reverse", "-n", String(opts.maxCount)];
    if (opts.since) {
      args.push(`${opts.since}..HEAD`);
    } else {
      args.push("HEAD");
    }
    const out = spawnSync("git", args, {
      encoding: "utf8",
      cwd: repoRoot,
      maxBuffer: 512 * 1024,
    });
    if (out.status !== 0) return [];
    return (out.stdout ?? "").trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function getParentCommit(repoRoot: string, commit: string): string | null {
  try {
    const out = spawnSync("git", ["rev-parse", `${commit}^`], {
      encoding: "utf8",
      cwd: repoRoot,
      maxBuffer: 64 * 1024,
    });
    return out.status === 0 && out.stdout?.trim() ? out.stdout.trim() : null;
  } catch {
    return null;
  }
}

export function getCommitMeta(
  repoRoot: string,
  commit: string,
): { date: string; author: string; email: string } | null {
  try {
    const out = spawnSync(
      "git",
      ["log", "-1", "--format=%aI%n%an%n%ae", commit],
      { encoding: "utf8", cwd: repoRoot, maxBuffer: 4096 },
    );
    if (out.status !== 0 || !out.stdout?.trim()) return null;
    const [date, author, email] = (out.stdout ?? "").trim().split("\n");
    return date && author && email ? { date, author, email } : null;
  } catch {
    return null;
  }
}
