/**
 * Bounded TypeScript check on affected files only.
 * Detects compile regression after applying patches.
 */

import * as ts from "typescript";
import { resolve } from "path";

export interface CompileSoundnessInput {
  repoRoot: string;
  affectedPaths: string[];
  patchedContentByPath: Map<string, string>;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function getDiagnosticsForFiles(
  program: ts.Program,
  filePaths: Set<string>,
): ts.Diagnostic[] {
  const all = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ];
  const normalized = new Set([...filePaths].map(normalizePath));
  return all.filter((d) => {
    if (!d.file) return false;
    const path = normalizePath(d.file.fileName);
    return normalized.has(path) || [...normalized].some((n) => path.endsWith(n));
  });
}

function diagnosticKey(d: ts.Diagnostic): string {
  const file = d.file?.fileName ?? "";
  const start = d.start ?? 0;
  const len = d.length ?? 0;
  const code = d.code ?? 0;
  return `${normalizePath(file)}\t${start}\t${len}\t${code}`;
}

/**
 * Returns null if no regression; otherwise returns new diagnostics (compile_regression).
 */
export function checkCompileSoundness(input: CompileSoundnessInput): ts.Diagnostic[] | null {
  const { repoRoot, affectedPaths, patchedContentByPath } = input;
  const rootAbs = resolve(repoRoot);
  const affectedAbs = new Set(
    affectedPaths.map((p) => normalizePath(resolve(rootAbs, p))),
  );

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
  };

  const rootFiles = affectedPaths.map((p) => resolve(rootAbs, p));

  const patchedByAbs = new Map<string, string>();
  for (const [rel, content] of patchedContentByPath) {
    patchedByAbs.set(normalizePath(resolve(rootAbs, rel)), content);
  }

  function createProgram(usePatched: boolean): ts.Program {
    const defaultHost = ts.createCompilerHost(compilerOptions);
    const host: ts.CompilerHost = {
      ...defaultHost,
      getSourceFile: (fileName, languageVersion) => {
        if (usePatched) {
          const norm = normalizePath(fileName);
          const override = patchedByAbs.get(norm);
          if (override !== undefined) {
            return ts.createSourceFile(
              fileName,
              override,
              languageVersion,
              true,
            );
          }
        }
        return defaultHost.getSourceFile(fileName, languageVersion);
      },
    };
    return ts.createProgram(rootFiles, compilerOptions, host);
  }

  const programBefore = createProgram(false);
  const beforeDiags = getDiagnosticsForFiles(programBefore, affectedAbs);
  const beforeKeys = new Set(beforeDiags.map(diagnosticKey));

  const programAfter = createProgram(true);
  const afterDiags = getDiagnosticsForFiles(programAfter, affectedAbs);
  const newDiags = afterDiags.filter((d) => !beforeKeys.has(diagnosticKey(d)));

  return newDiags.length > 0 ? newDiags : null;
}
