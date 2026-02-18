import { readFileSync } from "fs";
import { join, resolve } from "path";
import { listSourceFiles } from "../fs/listSourceFiles.js";
import { normalizeSeparators } from "../fs/pathUtils.js";
import { parseModuleDeps } from "../parse/parseImportsAndReexports.js";
import { resolveSpecifier } from "../resolve/resolveSpecifier.js";
import { sortStrings } from "../util/stableSort.js";
import { propagatePublicSurface } from "./publicSurface.js";
function buildPackageMaps(repoRoot, files) {
    const absRoot = resolve(repoRoot);
    const pkgDirByName = new Map();
    const pkgNameByAbsFile = new Map();
    for (const absFile of files) {
        const rel = normalizeSeparators(absFile.slice(absRoot.length).replace(/^\//, ""));
        const match = rel.match(/^packages\/([^/]+)\/src\//);
        if (match) {
            const pkg = match[1];
            const pkgDir = join(absRoot, "packages", pkg);
            pkgDirByName.set(pkg, pkgDir);
            pkgNameByAbsFile.set(absFile, pkg);
        }
    }
    return { pkgDirByName, pkgNameByAbsFile };
}
function fileToModuleId(absRoot, absFile, pkgName, pkgDir) {
    const srcDir = join(pkgDir, "src");
    let rel = absFile.slice(srcDir.length).replace(/^\//, "").replace(/\\/g, "/").toLowerCase();
    rel = rel.replace(/\.(ts|tsx)$/, "");
    if (rel === "index" || rel === "")
        return `pkg:${pkgName}`;
    return `pkg:${pkgName}:${rel}`;
}
function readFileWithRetry(absPath) {
    for (let i = 0; i < 2; i++) {
        try {
            return readFileSync(absPath, { encoding: "utf8" })
                .replace(/\r\n/g, "\n")
                .replace(/\r/g, "\n")
                .normalize("NFC");
        }
        catch {
            // retry
        }
    }
    return "";
}
export function buildGraph(repoRoot) {
    const absRoot = resolve(repoRoot);
    const files = listSourceFiles(absRoot);
    const { pkgDirByName, pkgNameByAbsFile } = buildPackageMaps(absRoot, files);
    const ctx = {
        repoRoot: absRoot,
        pkgDirByName,
        pkgNameByAbsFile,
    };
    const nodeSet = new Set();
    const edgeSet = new Set();
    const metadataMap = new Map();
    const sortedFiles = sortStrings([...files]);
    for (const absFile of sortedFiles) {
        const pkg = pkgNameByAbsFile.get(absFile);
        if (!pkg)
            continue;
        const pkgDir = pkgDirByName.get(pkg);
        if (!pkgDir)
            continue;
        const moduleId = fileToModuleId(absRoot, absFile, pkg, pkgDir);
        const srcDir = join(pkgDir, "src");
        const relPath = absFile.slice(srcDir.length).replace(/^\//, "").replace(/\.(ts|tsx)$/, "");
        const isEntry = relPath === "index" || relPath === "" || relPath === "index.ts" || relPath === "index.tsx";
        nodeSet.add(moduleId);
        metadataMap.set(moduleId, {
            moduleId,
            filePath: absFile,
            package: pkg,
            isEntry,
        });
        const content = readFileWithRetry(absFile);
        const deps = parseModuleDeps(absFile, content);
        for (const spec of deps.valueImports) {
            const res = resolveSpecifier(absFile, spec, ctx);
            if (res.target) {
                const key = `${moduleId}→${res.target}#value-import`;
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    nodeSet.add(res.target);
                }
            }
        }
        for (const spec of deps.reExports) {
            const res = resolveSpecifier(absFile, spec, ctx);
            if (res.target) {
                const key = `${moduleId}→${res.target}#reexport`;
                if (!edgeSet.has(key)) {
                    edgeSet.add(key);
                    nodeSet.add(res.target);
                }
            }
        }
    }
    let edges = Array.from(edgeSet).map((k) => {
        const [fromTo, kind] = k.split("#");
        const [from, to] = fromTo.split("→");
        return { from, to, kind: kind };
    });
    edges = propagatePublicSurface(edges);
    const nodes = sortStrings(Array.from(nodeSet));
    edges = edges.sort((a, b) => {
        const x = `${a.from} ${a.to} ${a.kind}`;
        const y = `${b.from} ${b.to} ${b.kind}`;
        return x.localeCompare(y, "en");
    });
    const kindsBreakdown = {
        "value-import": 0,
        reexport: 0,
        "public-surface": 0,
    };
    for (const e of edges) {
        kindsBreakdown[e.kind]++;
    }
    return {
        nodes,
        edges,
        metadata: metadataMap,
        stats: {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            kindsBreakdown,
        },
    };
}
