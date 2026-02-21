#!/usr/bin/env npx tsx
/**
 * Copy adjudication artifacts from anchr → wedge so wedge can consume them.
 * Anchr owns replay and exports; wedge only consumes artifacts at tests/adjudication/.
 * Writes SHA256 checksums so wedge adjudication can verify artifact integrity before running.
 *
 * Usage: WEDGE_ROOT=/path/to/wedge npx tsx scripts/copy-adjudication-to-wedge.ts [case_id]
 *        npx tsx scripts/copy-adjudication-to-wedge.ts /path/to/wedge [case_id]
 *
 * Default case: sindresorhus_ky_751
 * Creates: <case>.input.json, <case>.emission.json, <case>.checksums (SHA256 per file)
 */

import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

function sha256Hex(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ADJUDICATION_SRC = join(ROOT, "docs", "validation-20pr", "adjudication");

function main(): void {
  let wedgeRoot = process.env.WEDGE_ROOT;
  let caseId = process.argv[2];
  if (caseId && (caseId.startsWith("/") || caseId.startsWith("."))) {
    wedgeRoot = caseId;
    caseId = process.argv[3];
  }
  if (!wedgeRoot) {
    process.stderr.write(
      "Usage: WEDGE_ROOT=/path/to/wedge npx tsx scripts/copy-adjudication-to-wedge.ts [case_id]\n",
    );
    process.exit(1);
  }
  const id = caseId ?? "sindresorhus_ky_751";

  const inputSrc = join(ADJUDICATION_SRC, `${id}.input.json`);
  const emissionSrc = join(ADJUDICATION_SRC, `${id}.emission.json`);
  if (!existsSync(inputSrc) || !existsSync(emissionSrc)) {
    process.stderr.write(`Missing artifacts for ${id}. Export first: npx tsx scripts/validation-20pr-export-fn-artifact.ts ${id}\n`);
    process.exit(1);
  }

  const destDir = join(wedgeRoot, "tests", "adjudication");
  mkdirSync(destDir, { recursive: true });
  const inputDest = join(destDir, `${id}.input.json`);
  const emissionDest = join(destDir, `${id}.emission.json`);
  copyFileSync(inputSrc, inputDest);
  copyFileSync(emissionSrc, emissionDest);

  const inputHash = sha256Hex(inputDest);
  const emissionHash = sha256Hex(emissionDest);
  const checksumsPath = join(destDir, `${id}.checksums`);
  const checksumsBody = `${id}.input.json  ${inputHash}\n${id}.emission.json  ${emissionHash}\n`;
  writeFileSync(checksumsPath, checksumsBody, "utf8");

  process.stdout.write(`${inputDest}\n${emissionDest}\n${checksumsPath}\n`);
  process.stderr.write(`SHA256 ${id}.input.json  ${inputHash}\n`);
  process.stderr.write(`SHA256 ${id}.emission.json  ${emissionHash}\n`);
  process.stderr.write(`Copied ${id} artifacts + checksums to wedge tests/adjudication/. Commit in wedge repo.\n`);
}

main();
