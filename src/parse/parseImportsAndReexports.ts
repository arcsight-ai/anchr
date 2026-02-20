import ts from "typescript";

export interface ModuleDeps {
  valueImports: string[];
  reExports: string[];
}

function getModuleSpecifier(node: ts.ImportDeclaration | ts.ExportDeclaration): string | undefined {
  const spec = node.moduleSpecifier;
  if (!spec || !ts.isStringLiteral(spec)) return undefined;
  return spec.text;
}

function isTypeOnlyImportClause(clause: ts.ImportClause | undefined): boolean {
  if (!clause) return false;
  return !!clause.isTypeOnly;
}

function isTypeOnlyExportDeclaration(node: ts.ExportDeclaration): boolean {
  return !!node.isTypeOnly;
}

export function parseModuleDeps(
  _filePath: string,
  fileText: string,
): ModuleDeps {
  const sourceFile = ts.createSourceFile(
    "file.ts",
    fileText,
    ts.ScriptTarget.Latest,
    true,
  );

  const valueImports: string[] = [];
  const reExports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      if (!isTypeOnlyImportClause(node.importClause)) {
        const spec = getModuleSpecifier(node);
        if (spec) valueImports.push(spec);
      }
    } else if (ts.isExportDeclaration(node)) {
      if (!isTypeOnlyExportDeclaration(node) && node.moduleSpecifier) {
        const spec = getModuleSpecifier(node);
        if (spec) reExports.push(spec);
      }
    } else if (ts.isExportAssignment(node)) {
      if (node.expression && ts.isIdentifier(node.expression)) {
        // export = X is not a module specifier
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return { valueImports, reExports };
}
