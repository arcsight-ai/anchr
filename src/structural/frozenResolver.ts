import { existsSync, statSync } from "fs";
import { dirname, join, resolve } from "path";

const WORKSPACE_PREFIX = "@market-os/";
const STOP_DIRS = new Set(["internal", "private", "impl"]);
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

export interface ResolverContext {
  repoRoot: string;
  pkgDirByName: Map<string, string>;
}

function tryResolveFile(baseDir: string, spec: string): string | null {
  const norm = spec.replace(/\\/g, "/");
  for (const suffix of CANDIDATES) {
    const candidate = suffix ? join(baseDir, norm + suffix) : join(baseDir, norm);
    const abs = resolve(candidate);
    if (existsSync(abs)) {
      try {
        const st = statSync(abs, { throwIfNoEntry: false });
        if (st?.isFile()) return abs;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function isStopDir(relPath: string): boolean {
  const parts = relPath.split("/");
  return parts.some((p) => STOP_DIRS.has(p));
}

export function resolveSpecifierFrozen(
  fromFileAbs: string,
  spec: string,
  ctx: ResolverContext,
): { resolvedAbs: string | null; kind: "relative" | "workspace" | "external" | "forbidden" | "unresolved" } {
  const absRoot = resolve(ctx.repoRoot);

  if (spec.startsWith(".")) {
    const baseDir = dirname(fromFileAbs);
    const resolved = tryResolveFile(baseDir, spec);
    if (!resolved) return { resolvedAbs: null, kind: "unresolved" };

    const match = resolved.match(
      new RegExp(`^${absRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/packages/([^/]+)/src/`),
    );
    if (!match) return { resolvedAbs: resolved, kind: "unresolved" };

    const pkgDir = ctx.pkgDirByName.get(match[1]);
    if (!pkgDir) return { resolvedAbs: resolved, kind: "unresolved" };

    const srcDir = join(pkgDir, "src");
    const relFromSrc = resolved.slice(srcDir.length).replace(/^\//, "").replace(/\\/g, "/");
    if (isStopDir(relFromSrc)) return { resolvedAbs: null, kind: "forbidden" };

    return { resolvedAbs: resolved, kind: "relative" };
  }

  if (spec.startsWith(WORKSPACE_PREFIX)) {
    const rest = spec.slice(WORKSPACE_PREFIX.length);
    if (/^[^/]+\/(src|internal|private)(\/|$)/.test(rest)) {
      return { resolvedAbs: null, kind: "forbidden" };
    }

    const slashIdx = rest.indexOf("/");
    const pkgName = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
    const subpath = slashIdx >= 0 ? rest.slice(slashIdx + 1) : "";

    const pkgDir = ctx.pkgDirByName.get(pkgName);
    if (!pkgDir) return { resolvedAbs: null, kind: "external" };

    const srcDir = join(pkgDir, "src");

    let resolved: string | null;
    if (!subpath) {
      resolved = tryResolveFile(srcDir, "index");
      if (!resolved) resolved = tryResolveFile(srcDir, "index.ts");
      if (!resolved) resolved = tryResolveFile(srcDir, "index.tsx");
    } else {
      resolved = tryResolveFile(srcDir, subpath);
    }

    if (!resolved) return { resolvedAbs: null, kind: "unresolved" };

    const relFromSrc = resolved.slice(srcDir.length).replace(/^\//, "").replace(/\\/g, "/");
    if (isStopDir(relFromSrc)) return { resolvedAbs: null, kind: "forbidden" };

    return { resolvedAbs: resolved, kind: "workspace" };
  }

  return { resolvedAbs: null, kind: "external" };
}
