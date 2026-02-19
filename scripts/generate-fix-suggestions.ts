/**
 * Reliable Repair Suggestions Engine (Prompt 17).
 * Resolves actual imported symbols from the importer file and maps them to the
 * public export graph so suggestions use the same identifier (compiler-level reliable).
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

type Violation =
  | "boundary_violation"
  | "deleted_public_api"
  | "type_import_private_target"
  | "relative_escape";

export type Finding = {
  cause: Violation;
  importer?: string;
  target?: string;
  package?: string;
};

function read(p: string): string | null {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * Step 1 — find identifiers actually imported from the given target in the importer file.
 */
function getImportedSymbols(importer: string, target: string): string[] {
  const src = read(importer);
  if (!src) return [];

  const file = ts.createSourceFile(importer, src, ts.ScriptTarget.Latest, true);
  const results: string[] = [];

  const importerDir = path.dirname(importer);
  const targetNorm = path.normalize(target).replace(/\.ts$/, "");

  file.forEachChild((node: ts.Node) => {
    if (!ts.isImportDeclaration(node) || !node.moduleSpecifier) return;
    const spec = (node.moduleSpecifier as ts.StringLiteral).text;
    const afterSrc = spec.split("/src")[1];
    if (afterSrc != null) {
      if (!target.includes(afterSrc)) return;
    } else {
      const resolved = path.normalize(path.join(importerDir, spec)).replace(/\.ts$/, "");
      if (!targetNorm.endsWith(resolved) && !targetNorm.endsWith(spec.replace(/\.ts$/, ""))) return;
    }

    if (!node.importClause) return;

    if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      node.importClause.namedBindings.elements.forEach((el: ts.ImportSpecifier) => {
        results.push(el.name.text);
      });
    }
    if (node.importClause.name) results.push(node.importClause.name.text);
  });

  return results;
}

/**
 * Step 2 — build export map from public API (index.ts and re-exported modules).
 */
function resolveExports(pkg: string, visited = new Set<string>()): Map<string, string> {
  const indexPath = path.join("packages", pkg, "src", "index.ts");
  const src = read(indexPath);
  const map = new Map<string, string>();
  if (!src) return map;

  const file = ts.createSourceFile(indexPath, src, ts.ScriptTarget.Latest, true);

  file.forEachChild((node: ts.Node) => {
    if (!ts.isExportDeclaration(node) || !node.moduleSpecifier) return;

    const spec = (node.moduleSpecifier as ts.StringLiteral).text;
    const target = path.normalize(path.join(path.dirname(indexPath), spec + ".ts"));

    if (visited.has(target)) return;
    visited.add(target);

    const targetSrc = read(target);
    if (!targetSrc) return;

    const targetFile = ts.createSourceFile(target, targetSrc, ts.ScriptTarget.Latest, true);

    targetFile.forEachChild((n: ts.Node) => {
      if (ts.isFunctionDeclaration(n) && n.name) map.set(n.name.text, spec);
      if (ts.isInterfaceDeclaration(n)) map.set(n.name.text, spec);
      if (ts.isTypeAliasDeclaration(n)) map.set(n.name.text, spec);
      if (ts.isClassDeclaration(n) && n.name) map.set(n.name.text, spec);
      if (ts.isVariableStatement(n)) {
        n.declarationList.declarations.forEach((d: ts.VariableDeclaration) => {
          if (ts.isIdentifier(d.name)) map.set(d.name.text, spec);
        });
      }
    });
  });

  return map;
}

const PACKAGE_SCOPE = "@market-os";

/**
 * Step 3 — generate precise fix for boundary_violation using resolved symbols.
 */
function boundaryFix(f: Finding): string | null {
  if (!f.package || !f.importer || !f.target) return null;

  const used = getImportedSymbols(f.importer, f.target);
  if (!used.length) return `Import via public package entry: ${PACKAGE_SCOPE}/${f.package}`;

  const exportMap = resolveExports(f.package);
  const resolved = used.filter((sym) => exportMap.has(sym));

  if (!resolved.length) {
    return `Create public export in packages/${f.package}/src/index.ts for ${used.join(", ")}`;
  }
  return `Replace with:\nimport { ${resolved.join(", ")} } from "${PACKAGE_SCOPE}/${f.package}"`;
}

function deletedFix(f: Finding): string | null {
  if (!f.package) return null;
  return `Restore or replace removed export in packages/${f.package}/src/index.ts`;
}

function relativeFix(): string {
  return `Use package import instead of relative parent traversal`;
}

function typeImportFix(f: Finding): string | null {
  if (!f.package || !f.importer || !f.target) return null;
  const used = getImportedSymbols(f.importer, f.target);
  const exportMap = resolveExports(f.package);
  const resolved = used.filter((sym) => exportMap.has(sym));
  if (resolved.length) {
    return `Replace with:\nimport type { ${resolved.join(", ")} } from "${PACKAGE_SCOPE}/${f.package}"`;
  }
  return `Expose type via public package entry: ${PACKAGE_SCOPE}/${f.package}`;
}

function buildFix(f: Finding): string | null {
  if (f.cause === "boundary_violation") return boundaryFix(f);
  if (f.cause === "deleted_public_api") return deletedFix(f);
  if (f.cause === "relative_escape") return relativeFix();
  if (f.cause === "type_import_private_target") return typeImportFix(f);
  return null;
}

export function generateFixSection(findings: Finding[]): string {
  const fixes = findings.map(buildFix).filter((x): x is string => x != null);
  if (!fixes.length) return "";
  return "\n### How to fix\n" + fixes.map((f, i) => `${i + 1}. ${f}`).join("\n");
}
