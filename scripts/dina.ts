#!/usr/bin/env npx tsx
/**
 * Dina: determinism certification CLI.
 * Usage: npx tsx scripts/dina.ts certify --base <sha> --head <sha> [--runs 10]
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { certifyOnce, certifyMultiRun } from "../src/determinism/Certify.js";
import { serializeReport } from "../src/determinism/Report.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function getArgs(): string[] {
  return process.argv.slice(2);
}

function getFlagValue(args: string[], name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 && i < args.length - 1 ? args[i + 1]! : null;
}

function main(): number {
  const args = getArgs();
  if (args[0] !== "certify") {
    console.error("Usage: npx tsx scripts/dina.ts certify --base <sha> --head <sha> [--runs 10]");
    process.exit(2);
  }

  const baseSha = getFlagValue(args, "--base");
  const headSha = getFlagValue(args, "--head");
  const runsRaw = getFlagValue(args, "--runs");
  const runs = runsRaw ? Math.min(50, Math.max(1, parseInt(runsRaw, 10) || 10)) : 10;

  if (!baseSha || !headSha) {
    console.error("--base and --head are required.");
    process.exit(2);
  }

  const envAllowlist: Record<string, string> = {};
  const argvAllowlist = ["--base", baseSha, "--head", headSha, "--runs", String(runs)];

  if (runs <= 1) {
    const result = certifyOnce({
      baseSha,
      headSha,
      staged: false,
      envAllowlist,
      argvAllowlist,
    });
    const json = serializeReport(result.report);
    console.log(json);
    const reportPath = process.env.REPORT_PATH;
    if (reportPath) {
      const dir = dirname(reportPath);
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        // ignore
      }
      writeFileSync(reportPath, json + "\n", "utf8");
    }
    return result.report.certification_status === "PASS" ? 0 : 1;
  }

  const multi = certifyMultiRun({
    baseSha,
    headSha,
    runs,
    permutations: true,
    staged: false,
    envAllowlist,
    argvAllowlist,
  });

  const report = multi.firstReport;
  report.certification_status = multi.pass ? "PASS" : "FAIL";
  report.determinism_violation_detected = !multi.pass;
  if (!multi.pass && multi.mismatchIndex != null) {
    report.violation_classification = "BYTE_VARIANCE";
  }

  const json = serializeReport(report);
  console.log(json);

  const reportPath = process.env.REPORT_PATH;
  if (reportPath) {
    const dir = dirname(reportPath);
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // ignore
    }
    writeFileSync(reportPath, json + "\n", "utf8");
  }

  return multi.pass ? 0 : 1;
}

process.exit(main());
