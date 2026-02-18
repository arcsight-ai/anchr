import ts from "typescript";

export interface ValueImport {
  specifier: string;
  identifiers: string[];
}

export interface ParsedDeps {
  valueImports: ValueImport[];
  typeOnlyImports: string[];
  reExports: string[];
}

function getSpecifier(node: ts.ImportDeclaration | ts.ExportDeclaration): string | undefined {
  const spec = node.moduleSpecifier;
  if (!spec || !ts.isStringLiteral(spec)) return undefined;
  return spec.text;
}

function getImportedIdentifiers(node: ts.ImportDeclaration): string[] {
  const ids: string[] = [];
  const clause = node.importClause;
  if (!clause) return ids;
  if (clause.name) ids.push(clause.name.text);
  if (clause.namedBindings) {
    if (ts.isNamedImports(clause.namedBindings)) {
      for (const e of clause.namedBindings.elements) {
        ids.push(e.propertyName?.text ?? e.name.text);
      }
    } else if (ts.isNamespaceImport(clause.namedBindings)) {
      ids.push(clause.namedBindings.name.text);
    }
  }
  return ids;
}

export function parseDeps(fileText: string): ParsedDeps {
  const sourceFile = ts.createSourceFile(
    "file.ts",
    fileText,
    ts.ScriptTarget.Latest,
    true,
  );

  const valueImports: ValueImport[] = [];
  const typeOnlyImports: string[] = [];
  const reExports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const spec = getSpecifier(node);
      if (!spec) return;
      if (node.importClause?.isTypeOnly) {
        typeOnlyImports.push(spec);
      } else {
        valueImports.push({
          specifier: spec,
          identifiers: getImportedIdentifiers(node),
        });
      }
    } else if (ts.isExportDeclaration(node)) {
      const spec = getSpecifier(node);
      if (spec && node.moduleSpecifier) {
        reExports.push(spec);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { valueImports, typeOnlyImports, reExports };
}
