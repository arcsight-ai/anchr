/**
 * anchr uninstall — Remove only anchr files and hook block.
 * Does not touch other hook code.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync, rmdirSync } from "fs";
import { join } from "path";

const HOOK_MARKER_START = ">>> anchr";
const HOOK_MARKER_END = "<<< anchr";

function main(): number {
  const cwd = process.cwd();
  const gitDir = join(cwd, ".git");

  if (!existsSync(gitDir)) return 0;

  const files = [
    join(gitDir, ".anchr-enabled"),
    join(gitDir, ".anchr-first-run"),
    join(gitDir, ".anchr-remote"),
    join(gitDir, ".anchr-bin", "anchr-runner.js"),
  ];

  for (const f of files) {
    try {
      if (existsSync(f)) unlinkSync(f);
    } catch {
      // ignore
    }
  }

  try {
    const binDir = join(gitDir, ".anchr-bin");
    if (existsSync(binDir)) {
      const entries = readdirSync(binDir, { withFileTypes: true });
      if (entries.length === 0) rmdirSync(binDir);
    }
    const cacheDir = join(gitDir, ".anchr-cache");
    if (existsSync(cacheDir)) {
      const entries = readdirSync(cacheDir, { withFileTypes: true });
      if (entries.length === 0) rmdirSync(cacheDir);
    }
  } catch {
    // ignore
  }

  const hookPath = join(gitDir, "hooks", "pre-push");
  if (existsSync(hookPath)) {
    let content = readFileSync(hookPath, "utf8");
    const startIdx = content.indexOf(HOOK_MARKER_START);
    const endIdx = content.indexOf(HOOK_MARKER_END);
    if (startIdx >= 0 && endIdx > startIdx) {
      const before = content.slice(0, startIdx).trimEnd();
      const after = content.slice(endIdx + HOOK_MARKER_END.length).replace(/^\n+/, "");
      content = (before + "\n" + after).trim() + "\n";
      if (content !== "\n") writeFileSync(hookPath, content, "utf8");
      else unlinkSync(hookPath);
    }
  }

  return 0;
}

process.exit(main());
