/**
 * Semantic Causal Repair Engine — symbol identity through re-exports and aliases.
 * Tracks publicName → origin (sourceFile, localName, publicPath) so repair suggestions
 * are valid only when the same symbol identity is exposed via the public API.
 */

import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

export type SymbolOrigin = {
  publicName: string;
  publicPath: string;
  sourceFile: string;
  localName: string;
};

export type SymbolMap = Map<string, SymbolOrigin>;

function read(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(from), spec);
  const candidates = [
    base + ".ts",
    base + ".tsx",
    base + "/index.ts",
    base + "/index.tsx",
  ];
  return candidates.find((f) => fs.existsSync(f)) ?? null;
}

export function buildSemanticSurface(pkg: string): SymbolMap {
  const root = path.join("packages", pkg, "src");
  const entry = [path.join(root, "index.ts"), path.join(root, "index.tsx")].find(
    (f) => fs.existsSync(f),
  );
  if (!entry) return new Map();

  const map = new Map<string, SymbolOrigin>();
  const visited = new Set<string>();

  function visit(file: string, publicPath: string): void {
    if (!file || visited.has(file)) return;
    visited.add(file);
    const normalizedFile = path.normalize(path.resolve(file));

    const sf = read(file);

    sf.forEachChild((node: ts.Node) => {
      if (ts.isExportDeclaration(node)) {
        const specLiteral = node.moduleSpecifier as ts.StringLiteral | undefined;
        const target = specLiteral
          ? resolve(file, specLiteral.text)
          : null;

        if (
          node.exportClause &&
          ts.isNamedExports(node.exportClause)
        ) {
          node.exportClause.elements.forEach((el: ts.ExportSpecifier) => {
            const publicName = el.name.text;
            const localName = el.propertyName?.text ?? publicName;
            if (target) {
              const absTarget = path.normalize(path.resolve(target));
              visit(target, publicPath);
              map.set(publicName, {
                publicName,
                publicPath,
                sourceFile: absTarget,
                localName,
              });
            }
          });
        }

        if (target) visit(target, publicPath);
      }

      if (ts.isFunctionDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (node.name) {
          map.set(node.name.text, {
            publicName: node.name.text,
            publicPath,
            sourceFile: normalizedFile,
            localName: node.name.text,
          });
        }
      }
      if (ts.isClassDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (node.name) {
          map.set(node.name.text, {
            publicName: node.name.text,
            publicPath,
            sourceFile: normalizedFile,
            localName: node.name.text,
          });
        }
      }
      if (ts.isTypeAliasDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (node.name) {
          map.set(node.name.text, {
            publicName: node.name.text,
            publicPath,
            sourceFile: normalizedFile,
            localName: node.name.text,
          });
        }
      }
      if (ts.isInterfaceDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        map.set(node.name.text, {
          publicName: node.name.text,
          publicPath,
          sourceFile: normalizedFile,
          localName: node.name.text,
        });
      }
      if (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        node.declarationList.declarations.forEach((d: ts.VariableDeclaration) => {
          if (ts.isIdentifier(d.name)) {
            map.set(d.name.text, {
              publicName: d.name.text,
              publicPath,
              sourceFile: normalizedFile,
              localName: d.name.text,
            });
          }
        });
      }

      if (ts.isExportAssignment(node)) {
        map.set("default", {
          publicName: "default",
          publicPath,
          sourceFile: normalizedFile,
          localName: "default",
        });
      }
    });
  }

  visit(entry, `@market-os/${pkg}`);
  return map;
}
