import { readdirSync, statSync } from "fs";
import { join, resolve } from "path";
import { normalizeSeparators } from "./pathUtils.js";
const EXCLUDED_DIRS = new Set([
    "node_modules",
    "dist",
    "build",
    ".git",
    "artifacts",
]);
const TEST_DIRS = new Set(["__tests__", "tests", "test"]);
const TEST_PATTERN = /\.(spec|test)\.(ts|tsx)$/;
const EXTENSIONS = new Set([".ts", ".tsx"]);
const PACKAGES_PREFIX = "packages/";
function isSymlink(absPath) {
    try {
        const stats = statSync(absPath, { throwIfNoEntry: false });
        if (!stats)
            return true;
        return stats.isSymbolicLink();
    }
    catch {
        return true;
    }
}
function isExcludedDir(name) {
    return EXCLUDED_DIRS.has(name);
}
function isTestDir(name) {
    return TEST_DIRS.has(name);
}
function isTestFile(name) {
    return TEST_PATTERN.test(name);
}
function isSourceFile(name) {
    const ext = name.slice(name.lastIndexOf("."));
    return EXTENSIONS.has(ext);
}
function walk(repoRoot, base, collected) {
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
        if (isExcludedDir(name))
            continue;
        try {
            const stats = statSync(absPath, { throwIfNoEntry: false });
            if (!stats)
                continue;
            if (stats.isDirectory()) {
                if (isTestDir(name))
                    continue;
                walk(repoRoot, absPath, collected);
            }
            else if (stats.isFile() && isSourceFile(name) && !isTestFile(name)) {
                collected.push(resolve(absPath));
            }
        }
        catch {
            // skip unreadable entries
        }
    }
}
/**
 * Lists all .ts/.tsx files under packages/<pkg>/src.
 * Excludes node_modules, dist, build, .git, artifacts, test dirs, *.spec.ts(x), *.test.ts(x).
 * Returns absolute paths, sorted lexicographically by normalized relative path.
 */
export function listSourceFiles(repoRoot) {
    const absRoot = resolve(repoRoot);
    const packagesDir = join(absRoot, "packages");
    try {
        const pkgNames = readdirSync(packagesDir, { withFileTypes: true });
        const dirs = [];
        for (const e of pkgNames) {
            if (!e.isSymbolicLink() && e.isDirectory()) {
                dirs.push(e.name);
            }
        }
        dirs.sort((a, b) => a.localeCompare(b, "en"));
        const collected = [];
        for (const pkg of dirs) {
            const srcDir = join(packagesDir, pkg, "src");
            try {
                const stats = statSync(srcDir, { throwIfNoEntry: false });
                if (stats?.isDirectory() && !isSymlink(srcDir)) {
                    walk(absRoot, srcDir, collected);
                }
            }
            catch {
                // skip if src does not exist
            }
        }
        collected.sort((a, b) => {
            const relA = normalizeSeparators(a.slice(absRoot.length).replace(/^\//, ""));
            const relB = normalizeSeparators(b.slice(absRoot.length).replace(/^\//, ""));
            return relA.localeCompare(relB, "en");
        });
        return collected;
    }
    catch {
        return [];
    }
}
