import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseDeps } from "./parseDeps.js";
import { resolveSpecifierFrozen, type ResolverContext } from "./frozenResolver.js";

const STOP_DIRS = new Set(["internal", "private", "impl"]);

function isStopPath(relFromSrc: string): boolean {
  return STOP_DIRS.some((d) => relFromSrc === d || relFromSrc.startsWith(d + "/"));
}

export function computePublicFiles(
  repoRoot: string,
  pkgDirByName: Map<string, string>,
): Map<string, Set<string>> {
  const publicFiles = new Map<string, Set<string>>();
  const ctx: ResolverContext = { repoRoot, pkgDirByName };

  for (const [pkg, pkgDir] of pkgDirByName) {
    const srcDir = join(pkgDir, "src");

    let entryPath: string | null = null;
    const indexTs = join(srcDir, "index.ts");
    const indexTsx = join(srcDir, "index.tsx");
    if (existsSync(indexTs)) entryPath = indexTs;
    else if (existsSync(indexTsx)) entryPath = indexTsx;

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
        const content = readFileSync(file, "utf8")
          .replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n");
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
