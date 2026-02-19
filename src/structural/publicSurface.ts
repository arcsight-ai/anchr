import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseDeps } from "./parseDeps.js";
import { resolveSpecifierFrozen, type ResolverContext } from "./frozenResolver.js";
import type { IFileSystem } from "../virtual/virtualFs.js";

const STOP_DIRS = new Set(["internal", "private", "impl"]);

function isStopPath(relFromSrc: string): boolean {
  return [...STOP_DIRS].some((d: string) => relFromSrc === d || relFromSrc.startsWith(d + "/"));
}

export function computePublicFiles(
  repoRoot: string,
  pkgDirByName: Map<string, string>,
  fileSystem?: IFileSystem,
): Map<string, Set<string>> {
  const publicFiles = new Map<string, Set<string>>();
  const ctx: ResolverContext = { repoRoot, pkgDirByName, fileSystem };

  for (const [pkg, pkgDir] of pkgDirByName) {
    const srcDir = join(pkgDir, "src");

    let entryPath: string | null = null;
    const indexTs = join(srcDir, "index.ts");
    const indexTsx = join(srcDir, "index.tsx");
    const exists = (p: string) => (fileSystem ? fileSystem.fileExists(p) : existsSync(p));
    if (exists(indexTs)) entryPath = indexTs;
    else if (exists(indexTsx)) entryPath = indexTsx;

    if (!entryPath) continue;

    const visited = new Set<string>();
    const stack: string[] = [entryPath];
    const publicSet = new Set<string>();

    while (stack.length > 0) {
      const file = stack.pop()!;
      if (visited.has(file)) continue;
      visited.add(file);

      const relFromSrc = file.slice(srcDir.length).replace(/^\//, "").replace(/\\/g, "/");
      if (isStopPath(relFromSrc)) continue;

      publicSet.add(file);

      try {
        const raw = fileSystem ? fileSystem.readFile(file) : readFileSync(file, "utf8");
        if (raw == null) continue;
        const content = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        const deps = parseDeps(content);

        for (const spec of [...deps.reExports]) {
          const res = resolveSpecifierFrozen(file, spec, ctx);
          if (res.resolvedAbs && res.kind !== "forbidden" && res.kind !== "external") {
            if (!visited.has(res.resolvedAbs)) stack.push(res.resolvedAbs);
          }
        }
      } catch {
        // skip unreadable
      }
    }

    publicFiles.set(pkg, publicSet);
  }

  return publicFiles;
}
