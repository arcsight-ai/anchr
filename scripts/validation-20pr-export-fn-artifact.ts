#!/usr/bin/env npx tsx
/**
 * Export artifact for FN adjudication (artifact-based protocol).
 * Anchr owns replay identity; wedge does not. This script exports the exact
 * structural input and emission for a given pr_id so adjudication can run
 * without identifier lookup in wedge.
 *
 * Usage: npx tsx scripts/validation-20pr-export-fn-artifact.ts <pr_id>
 * Example: npx tsx scripts/validation-20pr-export-fn-artifact.ts sindresorhus_ky_751
 *
 * Writes:
 *   docs/validation-20pr/adjudication/<pr_id>.input.json   — repo, base_sha, head_sha (reproduce run)
 *   docs/validation-20pr/adjudication/<pr_id>.emission.json — exact report from results/
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST_PATH = join(ROOT, "docs", "validation-20pr", "validation-20pr-manifest.json");
const RESULTS_DIR = join(ROOT, "docs", "validation-20pr", "results");
const ADJUDICATION_DIR = join(ROOT, "docs", "validation-20pr", "adjudication");

interface ManifestEntry {
  pr_id: string;
  repo: string;
  pr: number;
  base_sha: string;
  head_sha: string;
}

function main(): void {
  const prId = process.argv[2];
  if (!prId) {
    process.stderr.write("Usage: npx tsx scripts/validation-20pr-export-fn-artifact.ts <pr_id>\n");
    process.exit(1);
  }

  const raw = readFileSync(MANIFEST_PATH, "utf8");
  const entries = JSON.parse(raw) as ManifestEntry[];
  const entry = entries.find((e) => e.pr_id === prId);
  if (!entry) {
    process.stderr.write(`pr_id not in manifest: ${prId}\n`);
    process.exit(1);
  }

  const resultPath = join(RESULTS_DIR, `${prId}.json`);
  if (!existsSync(resultPath)) {
    process.stderr.write(`No result found: ${resultPath}. Run validation-20pr-run first.\n`);
    process.exit(1);
  }

  mkdirSync(ADJUDICATION_DIR, { recursive: true });

  // Deterministic key order: pr_id (case key), repo, pr, base_sha, head_sha. No timestamps.
  const inputArtifact = {
    pr_id: entry.pr_id,
    repo: entry.repo,
    pr: entry.pr,
    base_sha: entry.base_sha,
    head_sha: entry.head_sha,
  };
  const inputPath = join(ADJUDICATION_DIR, `${prId}.input.json`);
  writeFileSync(inputPath, JSON.stringify(inputArtifact, null, 2) + "\n", "utf8");

  const emissionPath = join(ADJUDICATION_DIR, `${prId}.emission.json`);
  copyFileSync(resultPath, emissionPath);

  const origBuf = readFileSync(resultPath);
  const copyBuf = readFileSync(emissionPath);
  const exactCopy = origBuf.length === copyBuf.length && origBuf.equals(copyBuf);

  process.stdout.write(`${inputPath}\n${emissionPath}\n`);
  process.stderr.write(
    exactCopy
      ? "Emission: exact byte-preserving copy (no formatting changes).\n"
      : "Emission: copy verification failed.\n",
  );
  if (!exactCopy) process.exit(1);
}

main();
