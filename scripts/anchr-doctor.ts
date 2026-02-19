/**
 * anchr doctor — Emit a self-contained runner for pre-push hook.
 * Usage: anchr doctor --emit-runner <path>
 * Runner works offline when anchr is in repo node_modules.
 */

import { writeFileSync } from "fs";
import { resolve } from "path";

const RUNNER_SOURCE = `#!/usr/bin/env node
(function() {
  var cwd = process.cwd();
  var cmd = process.argv[2];
  var path = require("path");
  var fs = require("fs");
  var spawnSync = require("child_process").spawnSync;

  function findAnchr() {
    try {
      return require.resolve("anchr/package.json", { paths: [cwd] });
    } catch (e) {
      return null;
    }
  }

  if (cmd === "audit-fast") {
    var pkgPath = findAnchr();
    if (!pkgPath) process.exit(0);
    var anchrRoot = path.dirname(pkgPath);
    var script = path.join(anchrRoot, "scripts", "anchr-structural-audit.ts");
    var scriptJs = path.join(anchrRoot, "dist", "scripts", "anchr-structural-audit.js");
    var target = require("fs").existsSync(scriptJs) ? scriptJs : script;
    var exe = require("fs").existsSync(scriptJs) ? "node" : "npx";
    var args = require("fs").existsSync(scriptJs) ? [target] : ["tsx", script];
    try {
      spawnSync(exe, args, { cwd: cwd, stdio: "pipe", timeout: 500 });
    } catch (e) {}
    process.exit(0);
  }

  if (cmd === "share-compact") {
    var reportPath = path.join(cwd, "artifacts", "anchr-report.json");
    try {
      var raw = fs.readFileSync(reportPath, "utf8");
      var r = JSON.parse(raw);
    } catch (e) {
      process.exit(0);
    }
    var status = (r.status || "").trim();
    var level = (r.decision && r.decision.level) || "warn";
    var msg = "";
    if (status === "BLOCKED" && level === "block") {
      msg = "Editing one area is likely to affect distant behavior.";
    } else if (status === "INDETERMINATE" || level === "warn") {
      msg = "Some edits may have hidden effects.";
    } else if (status === "VERIFIED" && level === "allow") {
      process.exit(0);
    } else if (status === "INCOMPLETE") {
      process.exit(0);
    } else {
      process.exit(0);
    }
    if (msg) console.log("anchr: " + msg);
    process.exit(0);
  }

  process.exit(0);
})();
`;

function main(): number {
  const args = process.argv.slice(2);
  const i = args.indexOf("--emit-runner");
  if (i < 0 || i >= args.length - 1) return 0;
  const outPath = resolve(process.cwd(), args[i + 1]!);
  writeFileSync(outPath, RUNNER_SOURCE, "utf8");
  return 0;
}

process.exit(main());
