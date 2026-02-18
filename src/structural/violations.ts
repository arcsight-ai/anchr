import { readFileSync } from "fs";
import { join, resolve } from "path";
import { canonicalPath } from "./canonicalPath.js";
import { resolveSpecifierFrozen, type ResolverContext } from "./frozenResolver.js";
import { parseDeps } from "./parseDeps.js";
import type { Violation, ViolationKind } from "./types.js";

const PKG_SRC_RE = /^packages\/([^/]+)\/src\//;
const STOP_DIRS = new Set(["internal", "private", "impl"]);

function getPackageFromPath(repoRoot: string, absPath: string): string | null {
  const norm = absPath.replace(/\\/g, "/");
  const rootNorm = repoRoot.replace(/\\/g, "/");
  const rel = norm.startsWith(rootNorm) ? norm.slice(rootNorm.length).replace(/^\//, "") : norm;
  const m = rel.match(PKG_SRC_RE);
  return m ? m[1] : null;
}

function isInPackageSrc(absPath: string, pkgDir: string): boolean {
  const srcDir = join(pkgDir, "src");
  return absPath.startsWith(srcDir);
}

function isStopPath(relFromSrc: string): boolean {
  return STOP_DIRS.some((d) => relFromSrc === d || relFromSrc.startsWith(d + "/"));
}

export function detectViolations(
  repoRoot: string,
  diffEntries: { status: string; path: string }[],
  pkgDirByName: Map<string, string>,
  publicFiles: Map<string, Set<string>>,
  baseSha: string,
): Violation[] {
  const violations: Violation[] = [];
  const ctx: ResolverContext = { repoRoot, pkgDirByName };

  const absRoot = resolve(repoRoot);

  for (const entry of diffEntries) {
    if (entry.status !== "A" && entry.status !== "M" && entry.status !== "D") continue;
    if (!entry.path.endsWith(".ts") && !entry.path.endsWith(".tsx")) continue;

    const absPath = resolve(absRoot, entry.path);
    const pkg = getPackageFromPath(absRoot, absPath);
    if (!pkg) continue;

    const pkgDir = pkgDirByName.get(pkg);
    if (!pkgDir) continue;

    const canPath = canonicalPath(absPath, absRoot);

    if (entry.status === "D") {
      const relFromSrc = entry.path.replace(/^packages\/[^/]+\/src\//, "");
      if (!isStopPath(relFromSrc)) {
        violations.push({
          package: pkg,
          path: canPath,
          cause: "deleted_public_api",
        });
      }
      continue;
    }

    try {
      const content = readFileSync(absPath, "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      const deps = parseDeps(content);

      for (const spec of deps.valueImports) {
        const res = resolveSpecifierFrozen(absPath, spec, ctx);

        if (res.kind === "forbidden") {
          violations.push({
            package: pkg,
            path: canPath,
            cause: "boundary_violation",
            specifier: spec,
          });
          continue;
        }

        if (res.kind === "external" || res.kind === "unresolved") continue;

        if (res.resolvedAbs) {
          const targetPkg = getPackageFromPath(absRoot, res.resolvedAbs);

          if (spec.startsWith(".") && pkgDir && !isInPackageSrc(res.resolvedAbs, pkgDir)) {
            violations.push({
              package: pkg,
              path: canPath,
              cause: "relative_escape",
              specifier: spec,
            });
          } else if (targetPkg && targetPkg !== pkg) {
            const pub = publicFiles.get(targetPkg);
            if (!pub || !pub.has(res.resolvedAbs)) {
              violations.push({
                package: pkg,
                path: canPath,
                cause: "boundary_violation",
                specifier: spec,
              });
            }
          }
        }
      }

      for (const spec of deps.typeOnlyImports) {
        const res = resolveSpecifierFrozen(absPath, spec, ctx);
        if (res.kind === "forbidden") continue;

        if (res.resolvedAbs && res.kind !== "external" && res.kind !== "unresolved") {
          const targetPkg = getPackageFromPath(absRoot, res.resolvedAbs);
          if (targetPkg && targetPkg !== pkg) {
            const pub = publicFiles.get(targetPkg);
            if (!pub || !pub.has(res.resolvedAbs)) {
              violations.push({
                package: pkg,
                path: canPath,
                cause: "type_import_private_target",
                specifier: spec,
              });
            }
          }
        }
      }
    } catch {
      // skip unreadable
    }
  }

  return violations;
}
