/**
 * Runtime Structural Signals — AST-based detectors for architectural risks
 * that are not necessarily boundary violations. Pure static analysis; no typechecker.
 * Deterministic output; confidence is "high" (direct AST proof) or "medium" (inferred).
 */

import * as ts from "typescript";
import { resolve, dirname } from "path";

export type RuntimeSignalKind =
  | "hidden_shared_state"
  | "init_order_dependency"
  | "temporal_coupling"
  | "fanout_side_effects"
  | "circular_responsibility";

export interface RuntimeSignal {
  kind: RuntimeSignalKind;
  confidence: "high" | "medium";
  evidence: string[];
  filePath: string;
}

export type Confidence = "high" | "medium";

function createSourceFile(path: string, content: string): ts.SourceFile {
  return ts.createSourceFile(
    path,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
}

function getExportBindings(sf: ts.SourceFile): Set<string> {
  const bindings = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      if (node.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const d of node.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) bindings.add(d.name.text);
        }
      }
    } else if (ts.isExportAssignment(node)) {
      if (ts.isIdentifier(node.expression)) bindings.add(node.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return bindings;
}

function isMutatingExpression(node: ts.Node): boolean {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return true;
  }
  if (ts.isPostfixUnaryExpression(node)) return true;
  if (ts.isPrefixUnaryExpression(node)) {
    return node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken;
  }
  if (ts.isCallExpression(node)) {
    const name = ts.isPropertyAccessExpression(node.expression)
      ? node.expression.name.text
      : ts.isIdentifier(node.expression)
        ? node.expression.text
        : "";
    const mutating = /^(push|pop|shift|unshift|splice|set|delete|assign|write|add|clear)$/i.test(name);
    if (mutating) return true;
  }
  return false;
}

function getMutatedTargetsInFunction(fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression): Set<string> {
  const targets = new Set<string>();
  function visit(node: ts.Node): void {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;
      if (ts.isIdentifier(left)) targets.add(left.text);
      else if (ts.isPropertyAccessExpression(left)) {
        const base = left.expression;
        const key = ts.isIdentifier(left.name) ? left.name.text : "";
        if (ts.isIdentifier(base)) targets.add(`${base.text}.${key}`);
      }
    } else if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const base = expr.expression;
        if (ts.isIdentifier(base)) targets.add(base.text);
      } else if (ts.isIdentifier(expr)) {
        targets.add(expr.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  if (fn.body && ts.isBlock(fn.body)) {
    fn.body.statements.forEach((s: ts.Statement) => visit(s));
  }
  return targets;
}

/** Key: "${exporterFilePath}:${exportName}" -> list of importer file paths */
export function detectHiddenSharedState(
  filePath: string,
  content: string,
  importersByExportKey: Map<string, string[]>,
): RuntimeSignal | null {
  const sf = createSourceFile(filePath, content);
  const evidence: string[] = [];
  let sawReassign = false;
  let exportedMutableName: string | null = null;

  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      if (node.modifiers?.some((m: ts.ModifierLike) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const d of node.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) {
            const name = d.name.text;
            if (d.initializer) {
              const isObjectLike =
                ts.isObjectLiteralExpression(d.initializer) ||
                ts.isArrayLiteralExpression(d.initializer) ||
                (ts.isIdentifier(d.initializer) && /^[a-z]/.test(d.initializer.text));
              if (isObjectLike || node.declarationList.flags & ts.NodeFlags.Let) {
                exportedMutableName = name;
                evidence.push(`exported mutable: ${name}`);
              }
            }
          }
        }
      }
    }
    if (exportedMutableName && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;
      if (ts.isIdentifier(left) && left.text === exportedMutableName) {
        sawReassign = true;
        evidence.push("reassignment of exported binding");
      } else if (ts.isPropertyAccessExpression(left)) {
        const base = left.expression;
        if (ts.isIdentifier(base) && base.text === exportedMutableName) {
          sawReassign = true;
          evidence.push("property mutation of exported object");
        }
      }
    }
    if (exportedMutableName && (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node))) {
      const operand = ts.isPostfixUnaryExpression(node) ? node.operand : node.operand;
      if (ts.isPropertyAccessExpression(operand)) {
        const base = operand.expression;
        if (ts.isIdentifier(base) && base.text === exportedMutableName) {
          sawReassign = true;
          evidence.push("property mutation of exported object");
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  if (!exportedMutableName || !sawReassign) return null;
  const key = `${filePath}:${exportedMutableName}`;
  const importers = importersByExportKey.get(key) ?? [];
  const readers = importers.filter((p) => p !== filePath);
  if (readers.length >= 1) {
    evidence.push(`read in ${readers.length + 1} modules`);
    const confidence: Confidence = readers.length >= 2 ? "high" : "medium";
    return { kind: "hidden_shared_state", confidence, evidence, filePath };
  }
  evidence.push("exported and mutated in single file");
  return { kind: "hidden_shared_state", confidence: "medium", evidence, filePath };
}

/** 2) Init order dependency: top-level async or top-level side effects */
export function detectInitOrderDependency(filePath: string, content: string): RuntimeSignal | null {
  const sf = createSourceFile(filePath, content);
  const evidence: string[] = [];

  for (const stmt of sf.statements) {
    if (ts.isExpressionStatement(stmt)) {
      const expr = stmt.expression;
      if (ts.isCallExpression(expr)) {
        evidence.push("top-level call expression");
        return { kind: "init_order_dependency", confidence: "high", evidence, filePath };
      }
      if (ts.isAwaitExpression(expr)) {
        evidence.push("top-level await");
        return { kind: "init_order_dependency", confidence: "high", evidence, filePath };
      }
    }
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (d.initializer && ts.isCallExpression(d.initializer)) {
          evidence.push("top-level assignment from call");
          return { kind: "init_order_dependency", confidence: "medium", evidence, filePath };
        }
        if (d.initializer && ts.isAwaitExpression(d.initializer)) {
          evidence.push("top-level await in declaration");
          return { kind: "init_order_dependency", confidence: "high", evidence, filePath };
        }
      }
    }
  }
  return null;
}

/** 3) Temporal coupling: guard variable + setter + reader function */
export function detectTemporalCoupling(filePath: string, content: string): RuntimeSignal | null {
  const sf = createSourceFile(filePath, content);
  const guardVars = new Set<string>();
  const setters = new Set<string>();
  const readers = new Set<string>();

  function scanForGuard(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) {
          const init = d.initializer;
          if (init && (init.kind === ts.SyntaxKind.FalseKeyword || (ts.isIdentifier(init) && init.text === "false"))) {
            guardVars.add(d.name.text);
          }
        }
      }
    }
    ts.forEachChild(node, scanForGuard);
  }
  scanForGuard(sf);

  function scanFunction(fn: ts.Node, name: string): void {
    if (!ts.isFunctionDeclaration(fn) && !ts.isFunctionExpression(fn) && !ts.isArrowFunction(fn)) return;
    const body = (fn as ts.FunctionDeclaration).body;
    if (!body || !ts.isBlock(body)) return;
    let setsGuard = false;
    let readsGuard = false;
    function walk(n: ts.Node): void {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (ts.isIdentifier(n.left) && guardVars.has(n.left.text)) setsGuard = true;
      }
      if (ts.isIdentifier(n) && guardVars.has(n.text)) readsGuard = true;
      if (ts.isIfStatement(n)) {
        if (ts.isIdentifier(n.expression) && guardVars.has(n.expression.text)) readsGuard = true;
      }
      ts.forEachChild(n, walk);
    }
    ts.forEachChild(body, walk);
    if (setsGuard) setters.add(name);
    if (readsGuard) readers.add(name);
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      scanFunction(node, node.name.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  for (const g of guardVars) {
    if (setters.size >= 1 && readers.size >= 1) {
      return {
        kind: "temporal_coupling",
        confidence: "high",
        evidence: [`guard variable: ${g}`, `setters: ${[...setters].join(", ")}`, `readers: ${[...readers].join(", ")}`],
        filePath,
      };
    }
  }
  return null;
}

/** 4) Fanout side effects: one function mutates 3+ distinct targets */
export function detectFanoutSideEffects(filePath: string, content: string): RuntimeSignal | null {
  const sf = createSourceFile(filePath, content);

  function visit(node: ts.Node): RuntimeSignal | null {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      const targets = getMutatedTargetsInFunction(node);
      if (targets.size >= 3) {
        return {
          kind: "fanout_side_effects",
          confidence: "high",
          evidence: [`${targets.size} distinct mutation targets`, [...targets].slice(0, 5).join(", ")],
          filePath,
        };
      }
    }
    let result: RuntimeSignal | null = null;
    ts.forEachChild(node, (n: ts.Node) => {
      const r = visit(n);
      if (r) result = r;
    });
    return result;
  }
  return visit(sf);
}

/** 5) Circular responsibility: mutual import + usage (cycle in imports) */
export function detectCircularResponsibility(
  filePaths: string[],
  readFile: (path: string) => string | null,
  resolveImport: (fromPath: string, spec: string) => string | null,
): RuntimeSignal[] {
  const signals: RuntimeSignal[] = [];
  const imports: Map<string, string[]> = new Map();
  for (const p of filePaths) {
    const content = readFile(p);
    if (!content) continue;
    const sf = createSourceFile(p, content);
    const specs: string[] = [];
    sf.forEachChild((node: ts.Node) => {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        if (spec.startsWith(".")) specs.push(resolveImport(p, spec) ?? spec);
      }
    });
    imports.set(p, specs);
  }
  const pathList = [...filePaths].sort((a, b) => a.localeCompare(b, "en"));
  for (let i = 0; i < pathList.length; i++) {
    for (let j = i + 1; j < pathList.length; j++) {
      const a = pathList[i]!;
      const b = pathList[j]!;
      const aImportsB = imports.get(a)?.some((res) => res === b) ?? false;
      const bImportsA = imports.get(b)?.some((res) => res === a) ?? false;
      if (aImportsB && bImportsA) {
        signals.push({
          kind: "circular_responsibility",
          confidence: "high",
          evidence: [`${a} imports ${b}`, `${b} imports ${a}`],
          filePath: a,
        });
      }
    }
  }
  return signals;
}

export interface RunRuntimeSignalsInput {
  repoRoot: string;
  diffEntries: { path: string }[];
  readFile: (path: string) => string | null;
}

/** Run all runtime signal detectors and return signals (high or medium only). */
export function runRuntimeSignals(input: RunRuntimeSignalsInput): RuntimeSignal[] {
  const { repoRoot, diffEntries, readFile } = input;
  const absRoot = resolve(repoRoot);
  const results: RuntimeSignal[] = [];
  const tsPaths = diffEntries
    .filter((e) => e.path.endsWith(".ts") || e.path.endsWith(".tsx"))
    .map((e) => resolve(absRoot, e.path))
    .sort((a, b) => a.localeCompare(b, "en"));

  const resolveImport = (fromPath: string, spec: string): string | null => {
    const dir = dirname(fromPath);
    const joined = resolve(dir, spec);
    for (const ext of ["", ".ts", ".tsx"]) {
      const candidate = joined + ext;
      if (tsPaths.includes(candidate)) return candidate;
      const withIndex = resolve(joined, "index" + ext);
      if (tsPaths.includes(withIndex)) return withIndex;
    }
    return null;
  };

  const exportToImporters = new Map<string, string[]>();
  for (const p of tsPaths) {
    const content = readFile(p);
    if (!content) continue;
    const sf = createSourceFile(p, content);
    sf.forEachChild((node: ts.Node) => {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const spec = node.moduleSpecifier.text;
        if (!spec.startsWith(".")) return;
        const resolved = resolveImport(p, spec);
        if (!resolved) return;
        const contentResolved = readFile(resolved);
        if (!contentResolved) return;
        const otherSf = createSourceFile(resolved, contentResolved);
        const otherExports = getExportBindings(otherSf);
        const clause = node.importClause;
        if (clause?.name) {
          if (otherExports.has(clause.name.text)) {
            const key = `${resolved}:${clause.name.text}`;
            const list = exportToImporters.get(key) ?? [];
            if (!list.includes(p)) list.push(p);
            exportToImporters.set(key, list);
          }
        }
        if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const e of clause.namedBindings.elements) {
            const name = e.propertyName?.text ?? e.name.text;
            if (otherExports.has(name)) {
              const key = `${resolved}:${name}`;
              const list = exportToImporters.get(key) ?? [];
              if (!list.includes(p)) list.push(p);
              exportToImporters.set(key, list);
            }
          }
        }
      }
    });
  }

  for (const p of tsPaths) {
    const content = readFile(p);
    if (!content) continue;

    const h = detectHiddenSharedState(p, content, exportToImporters);
    if (h) results.push(h);

    const i = detectInitOrderDependency(p, content);
    if (i) results.push(i);

    const t = detectTemporalCoupling(p, content);
    if (t) results.push(t);

    const f = detectFanoutSideEffects(p, content);
    if (f) results.push(f);
  }

  const circular = detectCircularResponsibility(tsPaths, readFile, (from, spec) => resolveImport(from, spec));
  results.push(...circular);

  return results;
}
