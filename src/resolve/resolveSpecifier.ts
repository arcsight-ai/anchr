import { existsSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { normalizeSeparators } from "../fs/pathUtils.js";

export type ResolveKind = "workspace" | "relative" | "external" | "unresolved";

export interface ResolveResult {
  target: string | null;
  resolvedFileAbs: string | null;
  kind: ResolveKind;
}

export interface ResolveContext {
  repoRoot: string;
  pkgDirByName: Map<string, string>;
  pkgNameByAbsFile: Map<string, string>;
}

const WORKSPACE_PREFIX = "@market-os/";
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function tryResolveFile(baseDir: string, spec: string): string | null {
  const normalized = spec.replace(/\\/g, "/");
  const stems = [normalized];
  if (normalized.endsWith(".js") && !normalized.endsWith(".json")) {
    stems.push(normalized.slice(0, -3));
  }
  for (const stem of stems) {
    for (const suffix of CANDIDATES) {
      const candidate = suffix ? join(baseDir, stem + suffix) : join(baseDir, stem);
      const abs = resolve(candidate);
      if (existsSync(abs)) {
        try {
          if (statSync(abs, { throwIfNoEntry: false })?.isFile()) {
            return abs;
          }
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function getSrcDir(pkg: string, pkgDir: string): string {
  return pkg === "root" ? pkgDir : join(pkgDir, "src");
}

function isInsidePackageSrc(absRoot: string, absFile: string, pkgDir: string, pkg: string): boolean {
  const srcDir = getSrcDir(pkg, pkgDir);
  const rel = absFile.slice(srcDir.length);
  return absFile.startsWith(srcDir) && (rel === "" || rel.startsWith("/"));
}

function fileToModuleId(
  absRoot: string,
  absFile: string,
  pkgName: string,
  pkgDir: string,
): string {
  const srcDir = getSrcDir(pkgName, pkgDir);
  if (!absFile.startsWith(srcDir)) return "";
  let rel = absFile.slice(srcDir.length).replace(/^\//, "").replace(/\\/g, "/").toLowerCase();
  rel = rel.replace(/\.(ts|tsx)$/, "");
  if (rel === "index" || rel === "") return `pkg:${pkgName}`;
  return `pkg:${pkgName}:${rel}`;
}

export function resolveSpecifier(
  fromFileAbs: string,
  spec: string,
  ctx: ResolveContext,
): ResolveResult {
  const absRoot = resolve(ctx.repoRoot);

  if (spec.startsWith(".")) {
    const baseDir = dirname(fromFileAbs);
    const resolved = tryResolveFile(baseDir, spec);
    if (!resolved) {
      return { target: null, resolvedFileAbs: null, kind: "unresolved" };
    }
    const pkg = ctx.pkgNameByAbsFile.get(fromFileAbs);
    if (!pkg) return { target: null, resolvedFileAbs: resolved, kind: "unresolved" };
    const pkgDir = ctx.pkgDirByName.get(pkg);
    if (!pkgDir) return { target: null, resolvedFileAbs: resolved, kind: "unresolved" };
    if (!isInsidePackageSrc(absRoot, resolved, pkgDir, pkg)) {
      return { target: null, resolvedFileAbs: resolved, kind: "unresolved" };
    }
    const target = fileToModuleId(absRoot, resolved, pkg, pkgDir);
    return { target, resolvedFileAbs: resolved, kind: "relative" };
  }

  if (spec.startsWith(WORKSPACE_PREFIX)) {
    const rest = spec.slice(WORKSPACE_PREFIX.length);
    const slashIdx = rest.indexOf("/");
    const pkgName = slashIdx >= 0 ? rest.slice(0, slashIdx) : rest;
    const subpath = slashIdx >= 0 ? rest.slice(slashIdx + 1) : "";

    const pkgDir = ctx.pkgDirByName.get(pkgName);
    if (!pkgDir) {
      return { target: null, resolvedFileAbs: null, kind: "external" };
    }

    const srcDir = getSrcDir(pkgName, pkgDir);

    let resolved: string | null;
    if (!subpath) {
      resolved = tryResolveFile(srcDir, "index") ?? tryResolveFile(srcDir, "index.ts") ?? tryResolveFile(srcDir, "index.tsx");
    } else {
      resolved = tryResolveFile(srcDir, subpath);
    }

    if (!resolved) {
      return { target: null, resolvedFileAbs: null, kind: "unresolved" };
    }

    if (!isInsidePackageSrc(absRoot, resolved, pkgDir, pkgName)) {
      return { target: null, resolvedFileAbs: resolved, kind: "unresolved" };
    }

    const target = fileToModuleId(absRoot, resolved, pkgName, pkgDir);
    return { target, resolvedFileAbs: resolved, kind: "workspace" };
  }

  return { target: null, resolvedFileAbs: null, kind: "external" };
}
