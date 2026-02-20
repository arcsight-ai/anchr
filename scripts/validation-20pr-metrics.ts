#!/usr/bin/env npx tsx
/**
 * 20 PR validation — Mechanical metrics from human-ground-truth + ANCHR results.
 * No interpretation. Fills evaluation-table.csv and metrics-summary.md.
 *
 * Prerequisite: human-ground-truth.csv must have Human_Decision and Catastrophic filled for all 20.
 *
 * Usage: npx tsx scripts/validation-20pr-metrics.ts
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const HUMAN_CSV = join(ROOT, "docs", "validation-20pr", "human-ground-truth.csv");
const RESULTS_DIR = join(ROOT, "docs", "validation-20pr", "results");
const EVAL_TABLE = join(ROOT, "docs", "validation-20pr", "evaluation-table.csv");
const METRICS_MD = join(ROOT, "docs", "validation-20pr", "metrics-summary.md");
const MANIFEST_PATH = join(ROOT, "docs", "validation-20pr", "validation-20pr-manifest.json");

interface HumanRow {
  pr_id: string;
  human: "ALLOW" | "BLOCK";
  catastrophic: "Y" | "N";
}

function parseHumanCsv(): HumanRow[] {
  const raw = readFileSync(HUMAN_CSV, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.error("human-ground-truth.csv has no data rows");
    process.exit(1);
  }
  const rows: HumanRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(",").map((p) => p.trim());
    const pr_id = parts[0] ?? "";
    if (!pr_id) continue;
    const human = (parts[1] ?? "").toUpperCase() as "ALLOW" | "BLOCK";
    const catastrophic = (parts[3] ?? "").toUpperCase() as "Y" | "N";
    if (human !== "ALLOW" && human !== "BLOCK") {
      console.error(`Row ${i + 1}: Human_Decision must be ALLOW or BLOCK (got "${parts[1]}"). Fill human-ground-truth.csv first.`);
      process.exit(1);
    }
    rows.push({ pr_id, human, catastrophic: catastrophic === "Y" ? "Y" : "N" });
  }
  return rows;
}

function getAnchrDecision(prId: string): "allow" | "block" {
  const path = join(RESULTS_DIR, `${prId}.json`);
  if (!existsSync(path)) {
    console.error(`Missing result: ${path}`);
    process.exit(1);
  }
  const j = JSON.parse(readFileSync(path, "utf8")) as { decision?: { level?: string } };
  const level = (j?.decision?.level ?? "allow").toLowerCase();
  return level === "block" ? "block" : "allow";
}

function main(): void {
  const humanRows = parseHumanCsv();
  if (humanRows.length !== 20) {
    console.error(`Expected 20 rows in human-ground-truth.csv, got ${humanRows.length}`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { pr_id: string }[];
  const prOrder = manifest.map((e) => e.pr_id);

  const rows: { pr_id: string; human: string; anchr: string; cell: string; catastrophicFn: string; latencyMs: string }[] = [];
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  let catastrophicFn = 0;

  for (const prId of prOrder) {
    const humanRow = humanRows.find((r) => r.pr_id === prId);
    if (!humanRow) {
      console.error(`PR_ID ${prId} in manifest not found in human-ground-truth.csv`);
      process.exit(1);
    }
    const anchr = getAnchrDecision(prId);
    const human = humanRow.human;
    const anchrBlock = anchr === "block";
    const humanBlock = human === "BLOCK";
    let cell: string;
    if (humanBlock && anchrBlock) {
      cell = "TP";
      tp++;
    } else if (!humanBlock && anchrBlock) {
      cell = "FP";
      fp++;
    } else if (humanBlock && !anchrBlock) {
      cell = "FN";
      fn++;
      if (humanRow.catastrophic === "Y") catastrophicFn++;
    } else {
      cell = "TN";
      tn++;
    }
    rows.push({
      pr_id: prId,
      human,
      anchr: anchr.toUpperCase(),
      cell,
      catastrophicFn: humanRow.catastrophic === "Y" && cell === "FN" ? "Y" : "",
      latencyMs: "",
    });
  }

  const header = "PR_ID,Human,ANCHR,TP_FP_FN_TN,Catastrophic_FN,Latency_ms";
  const csvLines = [header, ...rows.map((r) => `${r.pr_id},${r.human},${r.anchr},${r.cell},${r.catastrophicFn},${r.latencyMs}`)];
  writeFileSync(EVAL_TABLE, csvLines.join("\n") + "\n", "utf8");
  console.error(`Wrote ${EVAL_TABLE}`);

  const precDen = tp + fp;
  const recDen = tp + fn;
  const precision = precDen === 0 ? 0 : tp / precDen;
  const recall = recDen === 0 ? 0 : tp / recDen;
  const precisionTwo = Math.floor(precision * 100) / 100;
  const recallTwo = Math.floor(recall * 100) / 100;

  const md = `# Metrics summary (mechanical only)

From evaluation-table.csv. Do NOT round up. Two decimal precision.

TP: ${tp}

FP: ${fp}

FN: ${fn}

TN: ${tn}

Precision = TP / (TP + FP): ${precisionTwo}

Recall = TP / (TP + FN): ${recallTwo}

Catastrophic FN: ${catastrophicFn}

Average latency (ms): N/A (not recorded in run)

Worst latency (ms): N/A (not recorded in run)

## Optional — confusion matrix

| | Human BLOCK | Human ALLOW |
|--|-------------|-------------|
| ANCHR BLOCK | TP = ${tp} | FP = ${fp} |
| ANCHR ALLOW | FN = ${fn} | TN = ${tn} |
`;
  writeFileSync(METRICS_MD, md, "utf8");
  console.error(`Wrote ${METRICS_MD}`);
}

main();
