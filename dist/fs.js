import { readdirSync, statSync } from "fs";
import { join, resolve } from "path";
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const EXCLUDED_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
    ".artifacts",
    ".cache",
]);
const MAX_FILE_SIZE = 1024 * 1024; // 1MB
function isSymlink(absPath) {
    try {
        const stats = statSync(absPath, { throwIfNoEntry: false });
        if (!stats)
            return true;
        return stats.isSymbolicLink();
    }
    catch {
        return true; // treat unreadable as symlink-like, exclude
    }
}
function walk(root, base, collected) {
    const entries = readdirSync(base, { withFileTypes: true });
    const names = [];
    for (const entry of entries) {
        if (entry.isSymbolicLink())
            continue;
        names.push(entry.name);
    }
    names.sort((a, b) => a.localeCompare(b, "en"));
    for (const name of names) {
        const absPath = join(base, name);
        if (isSymlink(absPath))
            continue;
        if (entryIsExcludedDir(name))
            continue;
        const entry = { name, absPath };
        if (entryIsDir(entry)) {
            walk(root, entry.absPath, collected);
        }
        else if (entryIsSourceFile(entry)) {
            if (fileSizeOk(entry.absPath)) {
                collected.push(resolve(entry.absPath));
            }
        }
    }
}
function entryIsExcludedDir(name) {
    return EXCLUDED_DIRS.has(name);
}
function entryIsDir(entry) {
    try {
        return statSync(entry.absPath, { throwIfNoEntry: false })?.isDirectory() ?? false;
    }
    catch {
        return false;
    }
}
function entryIsSourceFile(entry) {
    const ext = entry.name.slice(entry.name.lastIndexOf("."));
    return EXTENSIONS.has(ext);
}
function fileSizeOk(absPath) {
    try {
        const stats = statSync(absPath, { throwIfNoEntry: false });
        if (!stats || !stats.isFile())
            return false;
        return stats.size <= MAX_FILE_SIZE;
    }
    catch {
        return false;
    }
}
/**
 * Recursively lists source files (.ts, .tsx, .js, .jsx) under root.
 * Excludes node_modules, .git, dist, build, out, coverage, .next, .artifacts, .cache.
 * Ignores symlinks and files larger than 1MB. Returns absolute paths, sorted lexicographically.
 */
export function listSourceFiles(root) {
    const absRoot = resolve(root);
    const collected = [];
    walk(absRoot, absRoot, collected);
    collected.sort((a, b) => a.localeCompare(b, "en"));
    return collected;
}
