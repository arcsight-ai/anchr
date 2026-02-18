import ts from "typescript";

export interface ParsedDeps {
  valueImports: string[];
  typeOnlyImports: string[];
  reExports: string[];
}

function getSpecifier(node: ts.ImportDeclaration | ts.ExportDeclaration): string | undefined {
  const spec = node.moduleSpecifier;
  if (!spec || !ts.isStringLiteral(spec)) return undefined;
  return spec.text;
}

export function parseDeps(fileText: string): ParsedDeps {
  const sourceFile = ts.createSourceFile(
    "file.ts",
    fileText,
    ts.ScriptTarget.Latest,
    true,
  );

  const valueImports: string[] = [];
  const typeOnlyImports: string[] = [];
  const reExports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const spec = getSpecifier(node);
      if (!spec) return;
      if (node.importClause?.isTypeOnly) {
        typeOnlyImports.push(spec);
      } else {
        valueImports.push(spec);
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
