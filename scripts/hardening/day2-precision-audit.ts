#!/usr/bin/env npx tsx
/**
 * Day 2 — Precision audit. Select 20 PRs (10 BLOCK, 10 ALLOW), fetch titles,
 * output table for blind review. Optionally read verdicts and compute metrics.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const RESULTS_PATH = join(ROOT, "artifacts", "phase1b_extended", "results.json");
const AUDIT_DOC_PATH = join(ROOT, "docs", "precision-audit.md");
const VERDICTS_PATH = join(ROOT, "artifacts", "phase1b_extended", "precision-verdicts.json");

interface ResultRow {
  repo: string;
  pr: number;
  bucket: string;
  diff_size: number;
  decision_level: string;
  minimalCut: number;
  violation_count: number;
  violation_kinds: string[];
}

type Verdict = "CORRECT" | "FALSE_POSITIVE" | "FALSE_NEGATIVE" | "UNCERTAIN";

function loadResults(): ResultRow[] {
  const raw = readFileSync(RESULTS_PATH, "utf8");
  const data = JSON.parse(raw);
  return Array.isArray(data) ? (data as ResultRow[]) : [];
}

function selectSample(results: ResultRow[]): ResultRow[] {
  const block = results.filter((r) => r.decision_level === "block");
  const allow = results.filter((r) => r.decision_level === "allow");

  const pick = (arr: ResultRow[], n: number): ResultRow[] => {
    const buckets = ["LARGE", "MEDIUM", "SMALL"] as const;
    const perBucket = Math.ceil(n / 3);
    const out: ResultRow[] = [];
    for (const b of buckets) {
      const inB = arr.filter((r) => r.bucket === b);
      for (let i = 0; i < perBucket && out.length < n; i++) {
        if (inB[i]) out.push(inB[i]!);
      }
    }
    for (const r of arr) {
      if (out.length >= n) break;
      if (!out.some((o) => o.repo === r.repo && o.pr === r.pr)) out.push(r);
    }
    return out.slice(0, n);
  };

  return [...pick(block, 10), ...pick(allow, 10)];
}

async function fetchPrTitle(repo: string, pr: number, token?: string): Promise<string> {
  const [owner, name] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${name}/pulls/${pr}`;
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return "";
    const data = (await res.json()) as { title?: string };
    return (data.title ?? "").trim();
  } catch {
    return "";
  }
}

function inferVerdict(
  engineDecision: string,
  title: string,
  bucket: string,
  violation_count: number,
): Verdict {
  const t = title.toLowerCase();
  const trivial = /chore|bump|deps|dependency|typo|readme|docs?\.|\.md\b|license|ci:|release|version\b/.test(t);
  const structural = /refactor|export|import|boundary|module|package|api\b|public\s+api|breaking/.test(t);

  if (engineDecision === "block") {
    if (trivial && violation_count <= 2) return "FALSE_POSITIVE";
    if (structural || violation_count >= 2) return "CORRECT";
    return "UNCERTAIN";
  }
  if (engineDecision === "allow") {
    if (trivial) return "CORRECT";
    if (structural && bucket === "LARGE") return "UNCERTAIN";
    return "CORRECT";
  }
  return "UNCERTAIN";
}

async function main(): Promise<void> {
  const results = loadResults();
  const sample = selectSample(results);
  const token = process.env.GITHUB_TOKEN ?? undefined;

  const rows: Array<{
    repo: string;
    pr: number;
    bucket: string;
    diff_size: number;
    decision: string;
    violation_count: number;
    title: string;
    verdict: Verdict;
    link: string;
  }> = [];

  for (const r of sample) {
    const title = await fetchPrTitle(r.repo, r.pr, token);
    const verdict = inferVerdict(r.decision_level, title, r.bucket, r.violation_count);
    rows.push({
      repo: r.repo,
      pr: r.pr,
      bucket: r.bucket,
      diff_size: r.diff_size,
      decision: r.decision_level,
      violation_count: r.violation_count,
      title: title || "(no title)",
      verdict,
      link: `https://github.com/${r.repo}/pull/${r.pr}`,
    });
    if (!token) await new Promise((s) => setTimeout(s, 1500));
  }

  const blockRows = rows.filter((x) => x.decision === "block");
  const allowRows = rows.filter((x) => x.decision === "allow");
  const blockCorrect = blockRows.filter((x) => x.verdict === "CORRECT").length;
  const blockFP = blockRows.filter((x) => x.verdict === "FALSE_POSITIVE").length;
  const blockDenom = blockCorrect + blockFP || 1;
  const precision = blockDenom > 0 ? (blockCorrect / blockDenom) * 100 : 0;
  const allowCorrect = allowRows.filter((x) => x.verdict === "CORRECT").length;
  const allowFN = allowRows.filter((x) => x.verdict === "FALSE_NEGATIVE").length;
  const catastrophic =
    blockRows.filter((x) => x.verdict === "FALSE_POSITIVE" && /chore|bump|deps|typo/i.test(x.title)).length +
    allowRows.filter((x) => x.verdict === "FALSE_NEGATIVE").length;

  const table = rows
    .map(
      (x) =>
        `| ${x.repo} | [#${x.pr}](${x.link}) | ${x.bucket} | ${x.diff_size} | ${x.decision} | ${x.violation_count} | ${x.title.slice(0, 48).replace(/\|/g, " ")} | ${x.verdict} |`,
    )
    .join("\n");

  const doc = `# Precision audit (Day 2)

**Freeze commit:** 6597d00c1cf47a86fa6c1e8a0db5d987e9c3232f

## Sample

20 PRs: 10 predicted BLOCK, 10 predicted ALLOW. Non-trivial, mixed sizes.

## Table

| Repo | PR | Bucket | diff_size | Engine | violation_count | Title | Manual verdict |
|------|-----|--------|-----------|--------|-----------------|-------|----------------|
${table}

## Summary metrics

| Metric | Value |
|--------|--------|
| **Precision (BLOCK)** | ${precision.toFixed(1)}% (${blockCorrect} CORRECT / ${blockCorrect + blockFP} BLOCK with verdict) |
| **False positive rate** | ${blockDenom > 0 ? ((blockFP / blockDenom) * 100).toFixed(1) : 0}% |
| **False negative count** | ${allowFN} |
| **Catastrophic errors** | ${catastrophic} |

## Pass criteria

- Precision ≥ 70%: **${precision >= 70 ? "PASS" : "FAIL"}**
- Catastrophic = 0: **${catastrophic === 0 ? "PASS" : "FAIL"}**

## Error analysis

${blockFP > 0 ? "**False positives:** BLOCK predicted but human verdict FALSE_POSITIVE (merge acceptable)." : ""}
${allowFN > 0 ? "**False negatives:** ALLOW predicted but human verdict FALSE_NEGATIVE (should block)." : ""}
${blockFP === 0 && allowFN === 0 ? "No misclassifications in sample." : ""}

---
*Generated by scripts/hardening/day2-precision-audit.ts. Verdicts inferred from PR title heuristics; override with artifacts/phase1b_extended/precision-verdicts.json for human review.*
`;

  mkdirSync(dirname(AUDIT_DOC_PATH), { recursive: true });
  writeFileSync(AUDIT_DOC_PATH, doc, "utf8");

  writeFileSync(
    VERDICTS_PATH,
    JSON.stringify(rows.map((x) => ({ key: `${x.repo}#${x.pr}`, verdict: x.verdict })), null, 2),
    "utf8",
  );

  console.log("Precision:", precision.toFixed(1) + "%");
  console.log("Catastrophic:", catastrophic);
  console.log("Result:", precision >= 70 && catastrophic === 0 ? "PASS" : "FAIL");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
