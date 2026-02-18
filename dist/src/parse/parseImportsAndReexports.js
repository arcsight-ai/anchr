import ts from "typescript";
function getModuleSpecifier(node) {
    const spec = node.moduleSpecifier;
    if (!spec || !ts.isStringLiteral(spec))
        return undefined;
    return spec.text;
}
function isTypeOnlyImportClause(clause) {
    if (!clause)
        return true;
    return !!clause.isTypeOnly;
}
function isTypeOnlyExportDeclaration(node) {
    return !!node.isTypeOnly;
}
export function parseModuleDeps(_filePath, fileText) {
    const sourceFile = ts.createSourceFile("file.ts", fileText, ts.ScriptTarget.Latest, true);
    const valueImports = [];
    const reExports = [];
    function visit(node) {
        if (ts.isImportDeclaration(node)) {
            if (!isTypeOnlyImportClause(node.importClause)) {
                const spec = getModuleSpecifier(node);
                if (spec)
                    valueImports.push(spec);
            }
        }
        else if (ts.isExportDeclaration(node)) {
            if (!isTypeOnlyExportDeclaration(node) && node.moduleSpecifier) {
                const spec = getModuleSpecifier(node);
                if (spec)
                    reExports.push(spec);
            }
        }
        else if (ts.isExportAssignment(node)) {
            if (node.expression && ts.isIdentifier(node.expression)) {
                // export = X is not a module specifier
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return { valueImports, reExports };
}
