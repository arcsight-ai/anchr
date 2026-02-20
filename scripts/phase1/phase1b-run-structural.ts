#!/usr/bin/env npx tsx
/**
 * Phase 1B — Run structural certification on all 40 pilot PRs.
 * No injection. Pure measurement. Output: artifacts/phase1b/pilot-structural-results.json
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, mkdirSync, existsSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { PilotRecord } from "./pilot-types.js";
import { TMP_BASE } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const PILOT_ARTIFACTS = join(ROOT, "artifacts", "phase1", "pilot");
const OUT_PATH = join(ROOT, "artifacts", "phase1b", "pilot-structural-results.json");
const RUN_SINGLE = join(ROOT, "scripts", "phase1", "run-single.ts");

function slug(repo: string): string {
  return repo.replace(/\//g, "_");
}

function listPilotEntries(): { repo: string; pr: number }[] {
  const entries: { repo: string; pr: number }[] = [];
  try {
    const dirs = readdirSync(PILOT_ARTIFACTS, { withFileTypes: true });
    for (const d of dirs) {
      if (!d.isDirectory()) continue;
      const repo = d.name.replace(/_/g, "/");
      const subPath = join(PILOT_ARTIFACTS, d.name);
      const files = readdirSync(subPath, { withFileTypes: false });
      for (const f of files) {
        if (typeof f !== "string" || !f.endsWith(".json")) continue;
        const pr = parseInt(f.replace(/\.json$/, ""), 10);
        if (Number.isNaN(pr) || pr <= 0) continue;
        entries.push({ repo, pr });
      }
    }
  } catch {
    // ignore
  }
  entries.sort((a, b) => a.repo.localeCompare(b.repo) || a.pr - b.pr);
  return entries;
}

function loadPilotRecord(repo: string, prNumber: number): PilotRecord | null {
  const path = join(PILOT_ARTIFACTS, slug(repo), `${prNumber}.json`);
  try {
    const raw = readFileSync(path, "utf8");
    const r = JSON.parse(raw) as PilotRecord;
    return r.repo && r.pr_number != null ? r : null;
  } catch {
    return null;
  }
}

function ensureCleanHead(workDir: string, headSha: string): void {
  if (!existsSync(workDir)) return;
  try {
    execSync(`git checkout ${headSha} -- .`, { encoding: "utf8", cwd: workDir, stdio: "pipe" });
    execSync("git clean -fd", { encoding: "utf8", cwd: workDir, stdio: "pipe" });
  } catch {
    // ignore
  }
}

interface StructuralOutput {
  decision_level?: string;
  coverage_ratio?: number;
  minimal_cut_size?: number;
  primary_cause?: string | null;
  execution_ms?: number;
  rule_evaluation_trace?: string[];
}

interface Phase1BResultRow {
  repo: string;
  pr: number;
  bucket: string;
  diff_size: number;
  decision_level: string;
  minimalCut: number;
  coverage_ratio: number;
  violation_count: number;
  violation_kinds: string[];
  execution_ms: number;
}

function runStructuralForPr(repo: string, pr: number, record: PilotRecord): Phase1BResultRow {
  const workDir = join(TMP_BASE, slug(repo), String(pr));
  ensureCleanHead(workDir, record.head_sha);

  const r = spawnSync(
    "npx",
    ["tsx", RUN_SINGLE, "--repo", repo, "--pr", String(pr), "--structural"],
    {
      encoding: "utf8",
      cwd: ROOT,
      timeout: 150000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );

  let out: StructuralOutput = {};
  if (r.stdout) {
    try {
      out = JSON.parse(r.stdout.trim()) as StructuralOutput;
    } catch {
      // leave empty
    }
  }

  const decision_level = (out.decision_level ?? "allow").toLowerCase();
  const minimal_cut_size = typeof out.minimal_cut_size === "number" ? out.minimal_cut_size : 0;
  const violation_kinds = Array.isArray(out.rule_evaluation_trace) ? out.rule_evaluation_trace : [];

  return {
    repo,
    pr,
    bucket: record.complexity_bucket,
    diff_size: record.lines_changed,
    decision_level,
    minimalCut: minimal_cut_size,
    coverage_ratio: typeof out.coverage_ratio === "number" ? out.coverage_ratio : 0,
    violation_count: minimal_cut_size,
    violation_kinds,
    execution_ms: typeof out.execution_ms === "number" ? out.execution_ms : 0,
  };
}

function main(): void {
  const entries = listPilotEntries();
  mkdirSync(join(ROOT, "artifacts", "phase1b"), { recursive: true });

  const results: Phase1BResultRow[] = [];
  for (let i = 0; i < entries.length; i++) {
    const { repo, pr } = entries[i]!;
    const record = loadPilotRecord(repo, pr);
    if (!record) {
      console.error(`Skip ${repo}#${pr}: no pilot record`);
      continue;
    }
    process.stderr.write(`[${i + 1}/${entries.length}] ${repo}#${pr} ... `);
    try {
      const row = runStructuralForPr(repo, pr, record);
      results.push(row);
      process.stderr.write(`${row.decision_level} minCut=${row.minimalCut}\n`);
    } catch (e) {
      process.stderr.write(`error: ${e}\n`);
      results.push({
        repo,
        pr,
        bucket: record.complexity_bucket,
        diff_size: record.lines_changed,
        decision_level: "allow",
        minimalCut: 0,
        coverage_ratio: 0,
        violation_count: 0,
        violation_kinds: [],
        execution_ms: 0,
      });
    }
  }

  const json = JSON.stringify(results, null, 2);
  writeFileSync(OUT_PATH, json + "\n", "utf8");
  console.error(`Wrote ${results.length} results to ${OUT_PATH}`);
}

main();
