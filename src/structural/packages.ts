import { readdirSync, statSync } from "fs";
import { join } from "path";

export function discoverPackages(repoRoot: string): Map<string, string> {
  const pkgDirByName = new Map<string, string>();
  const packagesDir = join(repoRoot, "packages");
  try {
    const entries = readdirSync(packagesDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.isSymbolicLink()) {
        const srcDir = join(packagesDir, e.name, "src");
        try {
          if (statSync(srcDir, { throwIfNoEntry: false })?.isDirectory()) {
            pkgDirByName.set(e.name, join(packagesDir, e.name));
          }
        } catch {
          // skip
        }
      }
    }
  } catch {
    // no packages
  }
  return pkgDirByName;
}
