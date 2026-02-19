#!/usr/bin/env node
/**
 * Bin wrapper: "npx anchr" (no args) → trust-safe flow (never block workflow on tool failure).
 * "npx anchr <command>" → scripts/cli.ts.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const pkgRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const tsxPath = path.join(pkgRoot, "node_modules", ".bin", "tsx");

if (args.length === 0) {
  const trustSafePath = path.join(pkgRoot, "scripts", "cli-trust-safe.ts");
  const out = spawnSync(process.execPath, [tsxPath, trustSafePath], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  process.exit(out.status !== null ? out.status : 2);
}

const cliPath = path.join(pkgRoot, "scripts", "cli.ts");
const out = spawnSync(process.execPath, [tsxPath, cliPath, ...args], {
  stdio: "inherit",
  cwd: pkgRoot,
});
process.exitCode = out.status !== null ? out.status : 0;
