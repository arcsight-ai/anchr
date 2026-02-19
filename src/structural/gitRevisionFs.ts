/**
 * Read-only IFileSystem view of the repo at a single git revision.
 * Used by history forensics to run structural phase at each commit without checkout.
 */

import { resolve } from "path";
import type { IFileSystem } from "../virtual/virtualFs.js";
import { getFileAtRevision } from "./git.js";

function relPath(repoRoot: string, absPath: string): string {
  const root = resolve(repoRoot).replace(/\\/g, "/");
  const abs = resolve(absPath).replace(/\\/g, "/");
  return abs.startsWith(root + "/") ? abs.slice(root.length + 1) : abs;
}

export class GitRevisionFileSystem implements IFileSystem {
  private repoRoot: string;
  private rev: string;
  private fileCache = new Map<string, string | null>();

  constructor(repoRoot: string, rev: string) {
    this.repoRoot = resolve(repoRoot);
    this.rev = rev;
  }

  readFile(pathInput: string): string | null {
    const abs = pathInput.startsWith(this.repoRoot) ? pathInput : resolve(this.repoRoot, pathInput);
    const rel = relPath(this.repoRoot, abs);
    const cached = this.fileCache.get(rel);
    if (cached !== undefined) return cached;
    const content = getFileAtRevision(this.repoRoot, this.rev, rel);
    this.fileCache.set(rel, content);
    return content;
  }

  fileExists(pathInput: string): boolean {
    return this.readFile(pathInput) !== null;
  }

  directoryExists(_pathInput: string): boolean {
    return false;
  }

  getDirectories(_pathInput: string): string[] {
    return [];
  }

  readDirectory(_pathInput: string): string[] {
    return [];
  }
}
