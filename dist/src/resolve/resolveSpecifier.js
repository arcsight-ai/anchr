import { existsSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
const WORKSPACE_PREFIX = "@market-os/";
const CANDIDATES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
function tryResolveFile(baseDir, spec) {
    const normalized = spec.replace(/\\/g, "/");
    for (const suffix of CANDIDATES) {
        const candidate = suffix
            ? join(baseDir, normalized + suffix)
            : join(baseDir, normalized);
        const abs = resolve(candidate);
        if (existsSync(abs)) {
            try {
                if (statSync(abs, { throwIfNoEntry: false })?.isFile()) {
                    return abs;
                }
            }
            catch {
                return null;
            }
        }
    }
    return null;
}
function isInsidePackageSrc(absRoot, absFile, pkgDir) {
    const srcDir = join(pkgDir, "src");
    const rel = absFile.slice(srcDir.length);
    return absFile.startsWith(srcDir) && (rel === "" || rel.startsWith("/"));
}
function fileToModuleId(absRoot, absFile, pkgName, pkgDir) {
    const srcDir = join(pkgDir, "src");
    if (!absFile.startsWith(srcDir))
        return "";
    let rel = absFile.slice(srcDir.length).replace(/^\//, "").replace(/\\/g, "/").toLowerCase();
    rel = rel.replace(/\.(ts|tsx)$/, "");
    if (rel === "index" || rel === "")
        return `pkg:${pkgName}`;
    return `pkg:${pkgName}:${rel}`;
}
export function resolveSpecifier(fromFileAbs, spec, ctx) {
    const absRoot = resolve(ctx.repoRoot);
    if (spec.startsWith(".")) {
        const baseDir = dirname(fromFileAbs);
        const resolved = tryResolveFile(baseDir, spec);
        if (!resolved) {
            return { target: null, resolvedFileAbs: null, kind: "unresolved" };
        }
        const pkg = ctx.pkgNameByAbsFile.get(fromFileAbs);
        if (!pkg)
            return { target: null, resolvedFileAbs: resolved, kind: "unresolved" };
        const pkgDir = ctx.pkgDirByName.get(pkg);
        if (!pkgDir)
            return { target: null, resolvedFileAbs: resolved, kind: "unresolved" };
        if (!isInsidePackageSrc(absRoot, resolved, pkgDir)) {
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
        const srcDir = join(pkgDir, "src");
        let resolved;
        if (!subpath) {
            resolved = tryResolveFile(srcDir, "index") ?? tryResolveFile(srcDir, "index.ts") ?? tryResolveFile(srcDir, "index.tsx");
        }
        else {
            resolved = tryResolveFile(srcDir, subpath);
        }
        if (!resolved) {
            return { target: null, resolvedFileAbs: null, kind: "unresolved" };
        }
        if (!isInsidePackageSrc(absRoot, resolved, pkgDir)) {
            return { target: null, resolvedFileAbs: resolved, kind: "unresolved" };
        }
        const target = fileToModuleId(absRoot, resolved, pkgName, pkgDir);
        return { target, resolvedFileAbs: resolved, kind: "workspace" };
    }
    return { target: null, resolvedFileAbs: null, kind: "external" };
}
