#!/usr/bin/env node
/**
 * Bin wrapper: "npx anchr" (no args) → trust-safe flow (never block workflow on tool failure).
 * "npx anchr <command>" → dist/scripts/cli.js when built (no tsx), else scripts/cli.ts via tsx (dev).
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const pkgRoot = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const distCli = path.join(pkgRoot, "dist", "scripts", "cli.js");
const tsxPath = path.join(pkgRoot, "node_modules", ".bin", "tsx");
const scriptCli = path.join(pkgRoot, "scripts", "cli.ts");
const useDist = fs.existsSync(distCli);

if (args.length === 0) {
  const trustSafePath = path.join(pkgRoot, "scripts", "cli-trust-safe.ts");
  const out = spawnSync(process.execPath, [tsxPath, trustSafePath], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  process.exit(out.status !== null ? out.status : 2);
}

if (useDist) {
  const out = spawnSync(process.execPath, [distCli, ...args], {
    stdio: "inherit",
    cwd: pkgRoot,
  });
  process.exit(out.status !== null ? out.status : 0);
}

const out = spawnSync(process.execPath, [tsxPath, scriptCli, ...args], {
  stdio: "inherit",
  cwd: pkgRoot,
});
process.exit(out.status !== null ? out.status : 0);
