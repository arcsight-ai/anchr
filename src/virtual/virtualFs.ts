/**
 * Virtual filesystem for Shadow Repair (Prove Mode).
 * Overlay precedence: overlay > real filesystem.
 * When overlayOnly, any read outside overlay throws.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

function posix(p: string): string {
  return p.replace(/\\/g, "/");
}

function normalizePath(absPath: string, repoRoot: string): string {
  const r = resolve(repoRoot);
  const p = resolve(absPath);
  const rel = posix(p).startsWith(posix(r)) ? posix(p).slice(posix(r).length).replace(/^\//, "") : posix(p);
  return rel || posix(p);
}

export interface IFileSystem {
  readFile(path: string): string | null;
  fileExists(path: string): boolean;
  directoryExists(path: string): boolean;
  getDirectories(path: string): string[];
  readDirectory(path: string): string[];
}

export class VirtualFs implements IFileSystem {
  private overlay = new Map<string, string>();
  private repoRoot: string;
  private overlayOnly: boolean;

  constructor(repoRoot: string, options?: { overlayOnly?: boolean }) {
    this.repoRoot = resolve(repoRoot);
    this.overlayOnly = options?.overlayOnly ?? false;
  }

  setOverlay(absolutePath: string, content: string): void {
    const key = normalizePath(absolutePath, this.repoRoot);
    this.overlay.set(key, content);
  }

  setOverlayFromEdits(edits: { file: string; after: string }[]): void {
    for (const e of edits) {
      const abs = resolve(this.repoRoot, e.file);
      this.setOverlay(abs, e.after);
    }
  }

  getOverlayKeys(): string[] {
    return [...this.overlay.keys()].sort((a, b) => a.localeCompare(b, "en"));
  }

  private resolvePath(pathInput: string): string {
    const p = pathInput.startsWith(this.repoRoot) ? pathInput : join(this.repoRoot, pathInput);
    return resolve(p);
  }

  private overlayKey(pathInput: string): string {
    const abs = this.resolvePath(pathInput);
    return normalizePath(abs, this.repoRoot);
  }

  private readReal(pathInput: string): string | null {
    if (this.overlayOnly) {
      throw new Error(`VirtualFs(overlayOnly): cannot read real path: ${pathInput}`);
    }
    const abs = this.resolvePath(pathInput);
    try {
      if (!existsSync(abs)) return null;
      const st = statSync(abs, { throwIfNoEntry: false });
      if (!st?.isFile()) return null;
      return readFileSync(abs, "utf8");
    } catch {
      return null;
    }
  }

  readFile(pathInput: string): string | null {
    const key = this.overlayKey(pathInput);
    const overlayContent = this.overlay.get(key);
    if (overlayContent !== undefined) return overlayContent;
    return this.readReal(pathInput);
  }

  fileExists(pathInput: string): boolean {
    const key = this.overlayKey(pathInput);
    if (this.overlay.has(key)) return true;
    if (this.overlayOnly) return false;
    const abs = this.resolvePath(pathInput);
    try {
      const st = statSync(abs, { throwIfNoEntry: false });
      return st?.isFile() ?? false;
    } catch {
      return false;
    }
  }

  directoryExists(pathInput: string): boolean {
    if (this.overlayOnly) return false;
    const abs = this.resolvePath(pathInput);
    try {
      const st = statSync(abs, { throwIfNoEntry: false });
      return st?.isDirectory() ?? false;
    } catch {
      return false;
    }
  }

  getDirectories(pathInput: string): string[] {
    if (this.overlayOnly) return [];
    const abs = this.resolvePath(pathInput);
    try {
      const names = readdirSync(abs, { withFileTypes: true });
      return names.filter((d) => d.isDirectory()).map((d) => d.name).sort((a, b) => a.localeCompare(b, "en"));
    } catch {
      return [];
    }
  }

  readDirectory(pathInput: string): string[] {
    if (this.overlayOnly) return [];
    const abs = this.resolvePath(pathInput);
    try {
      return readdirSync(abs).sort((a, b) => a.localeCompare(b, "en"));
    } catch {
      return [];
    }
  }

  get overlayFileCount(): number {
    return this.overlay.size;
  }
}
