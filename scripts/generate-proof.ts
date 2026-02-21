/**
 * ANCHR Scientific Proof Report (v8 — Counterfactual Validity).
 * Removes hindsight bias: validates that ANCHR would have flagged risk at prediction time.
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANCHR_ROOT = join(__dirname, "..");
const CLI_SCRIPT = join(ANCHR_ROOT, "scripts", "cli.ts");

interface ReplayResults {
  repo?: string;
  total_commits_scanned?: number;
  predictions: number;
  predictive_hits?: number;
  precision?: number;
  hits: Array<{
    prediction_sha: string;
    fix_sha: string;
    prediction: string;
    trigger: string;
    confidence: string;
    distance: number;
  }>;
}

const BEHAVIORAL_KEYWORDS = [
  "if ",
  "else",
  "try",
  "catch",
  "throw",
  "await ",
  "async ",
  "retry",
  "fallback",
  "guard",
  "handle",
  "return ",
  "throw ",
  "mutat",
  "state",
  "setState",
  "dispatch",
  "Promise",
  ".then(",
  ".catch(",
  "finally",
  "switch ",
  "case ",
];

const IGNORE_PATTERNS = [
  /^\s*\/\//,
  /^\s*\/\*[\s\S]*?\*\//,
  /^\s*\* /,
  /^\s*#/,
  /^[\s+-]*import\s+/m,
  /^[\s+-]*from\s+['"]/m,
  /^\s*$/,
  /formatting|prettier|eslint|rename|refactor\s+only/i,
];

function safeExec(cwd: string, cmd: string, maxBuffer = 1024 * 1024): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", cwd, maxBuffer }).trim();
  } catch {
    return null;
  }
}

function commitExists(cwd: string, sha: string): boolean {
  const out = safeExec(cwd, `git cat-file -e ${sha} 2>/dev/null`);
  return out !== null;
}

function runAuditAtCommit(cwd: string, baseSha: string, headSha: string): { stdout: string; risk: boolean } {
  const reportDir = join(cwd, "artifacts");
  mkdirSync(reportDir, { recursive: true });
  const env = {
    ...process.env,
    GITHUB_BASE_SHA: baseSha,
    HEAD_SHA: headSha,
    BASE_SHA: baseSha,
    ANCHR_REPORT_PATH: join(reportDir, "anchr-proof-temp.json"),
  };
  const r = spawnSync("npx", ["tsx", CLI_SCRIPT, "audit", "--all", "--base", baseSha, "--head", headSha, "--json"], {
    encoding: "utf8",
    cwd,
    env,
    timeout: 90000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const stdout = r.stdout ?? "";
  let risk = false;
  try {
    const report = JSON.parse(stdout) as { status?: string };
    risk = report.status === "BLOCKED";
  } catch {
    // no risk
  }
  return { stdout, risk };
}

function getCommitMessage(cwd: string, sha: string): string {
  return safeExec(cwd, `git log -1 --pretty=%B ${sha}`) ?? "";
}

function getCommitDiff(cwd: string, sha: string, unified: number): string {
  return safeExec(cwd, `git show --unified=${unified} ${sha}`) ?? "";
}

function getParentSha(cwd: string, sha: string): string | null {
  return safeExec(cwd, `git rev-parse ${sha}^ 2>/dev/null`);
}

function hasBehavioralChange(diff: string): boolean {
  const lines = diff.split("\n").filter((l) => l.startsWith("+") || l.startsWith("-"));
  const content = lines.map((l) => l.slice(1)).join("\n");
  const hasIgnoreOnly = lines.every((l) => IGNORE_PATTERNS.some((re) => re.test(l)));
  if (hasIgnoreOnly && lines.length > 0) return false;
  const lower = content.toLowerCase();
  return BEHAVIORAL_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

function tokenize(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^\w\s]/g, " ");
  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);
  return new Set(tokens);
}

function overlapRatio(predictionText: string, fixText: string): number {
  const fixTokens = tokenize(fixText);
  if (fixTokens.size === 0) return 0;
  const predTokens = tokenize(predictionText);
  let shared = 0;
  for (const t of fixTokens) {
    if (predTokens.has(t)) shared++;
  }
  return shared / fixTokens.size;
}

function getAffectedFiles(cwd: string, sha: string): string[] {
  const out = safeExec(cwd, `git show --name-only --pretty=format: ${sha}`);
  if (!out) return [];
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

function findBugIntroSha(cwd: string, fixSha: string, affectedFiles: string[]): string | null {
  if (affectedFiles.length === 0) return null;
  const filesArg = affectedFiles.map((f) => `-- ${f}`).join(" ");
  const out = safeExec(cwd, `git rev-list ${fixSha} --reverse ${filesArg} 2>/dev/null`);
  if (!out) return null;
  const shas = out.split("\n").filter(Boolean);
  return shas[0] ?? null;
}

function getCurrentHead(cwd: string): string | null {
  return safeExec(cwd, "git rev-parse HEAD");
}

function checkout(cwd: string, ref: string): boolean {
  try {
    execSync(`git checkout ${ref}`, { encoding: "utf8", cwd, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

interface ValidatedHit {
  prediction_sha: string;
  fix_sha: string;
  prediction: string;
  trigger: string;
  confidence: string;
  distance: number;
  hindsight_only: boolean;
  validated_prediction_output: string;
  prediction_message: string;
  fix_message: string;
  prediction_diff: string;
  fix_diff: string;
  parent_sha: string | null;
  behavioral_change: boolean;
  overlap_ratio: number;
  bug_intro_sha: string | null;
  causal_prediction: boolean;
  score: number;
}

function scoreHit(v: ValidatedHit): number {
  let s = 0;
  if (v.behavioral_change) s += 2;
  if (v.overlap_ratio >= 0.3) s += 1;
  if (v.causal_prediction) s += 2;
  if (v.confidence === "high") s += 1;
  return s;
}

function processHit(cwd: string, hit: ReplayResults["hits"][0], originalHead: string | null): ValidatedHit | null {
  const { prediction_sha, fix_sha, prediction, trigger, confidence } = hit;

  if (!commitExists(cwd, prediction_sha) || !commitExists(cwd, fix_sha)) return null;

  // Counterfactual freeze: run ANCHR at prediction_sha (base = parent, head = prediction_sha)
  const parent = getParentSha(cwd, prediction_sha);
  if (!parent) return null;

  if (!checkout(cwd, prediction_sha)) return null;
  const { stdout: validatedOutput, risk } = runAuditAtCommit(cwd, parent, prediction_sha);
  if (originalHead && !checkout(cwd, originalHead)) {
    checkout(cwd, originalHead);
  }

  if (!risk) {
    return {
      prediction_sha,
      fix_sha,
      prediction,
      trigger,
      confidence,
      distance: hit.distance,
      hindsight_only: true,
      validated_prediction_output: validatedOutput,
      prediction_message: "",
      fix_message: "",
      prediction_diff: "",
      fix_diff: "",
      parent_sha: null,
      behavioral_change: false,
      overlap_ratio: 0,
      bug_intro_sha: null,
      causal_prediction: false,
      score: 0,
    };
  }

  const prediction_message = getCommitMessage(cwd, prediction_sha);
  const fix_message = getCommitMessage(cwd, fix_sha);
  const prediction_diff = getCommitDiff(cwd, prediction_sha, 3);
  const fix_diff = getCommitDiff(cwd, fix_sha, 5);

  const behavioral_change = hasBehavioralChange(fix_diff);
  const overlap_ratio = overlapRatio(validatedOutput + " " + prediction, fix_diff + " " + fix_message);
  if (overlap_ratio < 0.15) return null;

  const affectedFiles = getAffectedFiles(cwd, fix_sha);
  const bug_intro_sha = findBugIntroSha(cwd, fix_sha, affectedFiles);
  let causal_prediction = false;
  if (bug_intro_sha) {
    try {
      execSync(`git merge-base --is-ancestor ${prediction_sha} ${bug_intro_sha}`, { cwd, stdio: "pipe" });
      causal_prediction = true; // prediction_sha is before bug_intro_sha
    } catch {
      // prediction is not before bug intro → discard later if score < 3
    }
  }

  const v: ValidatedHit = {
    prediction_sha,
    fix_sha,
    prediction,
    trigger,
    confidence,
    distance: hit.distance,
    hindsight_only: false,
    validated_prediction_output: validatedOutput,
    prediction_message,
    fix_message,
    prediction_diff,
    fix_diff,
    parent_sha: parent,
    behavioral_change,
    overlap_ratio,
    bug_intro_sha,
    causal_prediction,
    score: 0,
  };
  v.score = scoreHit(v);
  return v;
}

function runRandomBaseline(
  cwd: string,
  totalPredictions: number,
  originalHead: string | null,
): { matches: number; count: number } {
  const allShas = safeExec(cwd, "git log --format=%H -n 500");
  if (!allShas) return { matches: 0, count: 0 };
  const shas = allShas.split("\n").filter(Boolean);
  if (shas.length < 10) return { matches: 0, count: 0 };
  const n = Math.min(totalPredictions, 25);
  const used = new Set<number>();
  const indices: number[] = [];
  for (let t = 0; t < n * 3 && indices.length < n; t++) {
    const i = Math.floor(Math.random() * (shas.length - 5));
    if (i >= 0 && i + 5 < shas.length && !used.has(i)) {
      used.add(i);
      indices.push(i);
    }
  }
  let randomMatches = 0;
  for (const i of indices) {
    const predSha = shas[i]!;
    const parent = getParentSha(cwd, predSha);
    if (!parent) continue;
    if (!checkout(cwd, predSha)) continue;
    const { risk, stdout: validatedOut } = runAuditAtCommit(cwd, parent, predSha);
    if (originalHead) checkout(cwd, originalHead);
    if (!risk) continue;
    for (let d = 1; d <= 5 && i + d < shas.length; d++) {
      const fixSha = shas[i + d]!;
      const fixDiff = getCommitDiff(cwd, fixSha, 5);
      const fixMsg = getCommitMessage(cwd, fixSha);
      if (!hasBehavioralChange(fixDiff)) continue;
      const ratio = overlapRatio(validatedOut + " risk", fixDiff + " " + fixMsg);
      if (ratio >= 0.15) randomMatches++;
      break;
    }
  }
  return { matches: randomMatches, count: indices.length };
}

function getResultsPath(): string {
  const cwd = process.cwd();
  const args = process.argv.slice(2);
  const i = args.indexOf("--input");
  if (i >= 0 && i + 1 < args.length) {
    const p = args[i + 1]!;
    return p.startsWith("/") ? p : join(cwd, p);
  }
  return join(cwd, "artifacts", "replay-results.json");
}

function main(): void {
  const cwd = process.cwd();
  const resultsPath = getResultsPath();

  if (!existsSync(resultsPath)) {
    console.error("Replay results not found at " + resultsPath + ". Run replay-history.ts first.");
    process.exit(1);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resultsPath, "utf8"));
  } catch {
    console.error("Invalid replay-results.json");
    process.exit(1);
  }

  const results = raw as ReplayResults;
  const total_predictions = results.predictions ?? 0;
  const hits = Array.isArray(results.hits) ? results.hits : [];

  if (total_predictions === 0 && hits.length === 0) {
    console.log("No predictive signals detected.");
    process.exit(0);
  }

  const originalHead = getCurrentHead(cwd);

  // Step 1 & 2: validate commits + counterfactual freeze
  const validated: ValidatedHit[] = [];
  let hindsightOnlyCount = 0;
  for (const hit of hits) {
    const v = processHit(cwd, hit, originalHead);
    if (!v) continue;
    if (v.hindsight_only) {
      hindsightOnlyCount++;
      continue;
    }
    validated.push(v);
  }
  if (originalHead) checkout(cwd, originalHead);

  // Steps 4–7: keep only score >= 3 and (no bug_intro or prediction before bug intro)
  const causal_matches = validated.filter(
    (v) => v.score >= 3 && !v.hindsight_only && (v.bug_intro_sha == null || v.causal_prediction),
  );
  const matched_predictions = causal_matches.length;
  const unmatched_predictions = Math.max(0, total_predictions - matched_predictions);
  const precision = total_predictions > 0 ? matched_predictions / total_predictions : 0;
  const sample_unmatched = validated.filter((v) => v.score < 3).slice(0, 10);

  // Random baseline
  const { matches: random_matches, count: random_count } = runRandomBaseline(cwd, total_predictions, originalHead);
  const baseline_precision = random_count > 0 ? random_matches / random_count : 0;
  const lift = baseline_precision > 0 ? precision / baseline_precision : precision > 0 ? 999 : 0;

  // Blind review dataset
  const causalEntries = causal_matches.map((c) => ({ type: "causal" as const, ...c }));
  const decoyCount = Math.min(causalEntries.length, 20);
  const allShas = safeExec(cwd, "git log --format=%H -n 100")?.split("\n").filter(Boolean) ?? [];
  const decoys = [];
  for (let i = 0; i < decoyCount && i < allShas.length; i++) {
    const sha = allShas[Math.floor(Math.random() * allShas.length)]!;
    decoys.push({ type: "decoy" as const, prediction_sha: sha, fix_sha: sha, prediction: "", trigger: "", confidence: "low", distance: 0 });
  }
  const blindReview = [...causalEntries, ...decoys].sort(() => Math.random() - 0.5);

  mkdirSync(join(cwd, "artifacts"), { recursive: true });

  const proofReport = {
    repo: results.repo ?? "",
    total_predictions,
    causal_matches: matched_predictions,
    false_positives: unmatched_predictions,
    precision: Math.round(precision * 1000) / 1000,
    random_baseline: { matches: random_matches, count: random_count },
    baseline_precision: Math.round(baseline_precision * 1000) / 1000,
    lift: Math.round(lift * 100) / 100,
    hindsight_only_removed: hindsightOnlyCount,
    causal_matches_detail: causal_matches.map((c) => ({
      prediction_sha: c.prediction_sha,
      fix_sha: c.fix_sha,
      prediction: c.prediction,
      trigger: c.trigger,
      confidence: c.confidence,
      distance: c.distance,
      behavioral_change: c.behavioral_change,
      overlap_ratio: c.overlap_ratio,
      causal_prediction: c.causal_prediction,
      score: c.score,
    })),
    sample_unmatched: sample_unmatched.map((u) => ({
      prediction_sha: u.prediction_sha,
      fix_sha: u.fix_sha,
      prediction: u.prediction,
      score: u.score,
    })),
    generated_at: new Date().toISOString(),
  };

  writeFileSync(join(cwd, "artifacts", "proof-report.json"), JSON.stringify(proofReport, null, 2), "utf8");
  writeFileSync(join(cwd, "artifacts", "blind-review.json"), JSON.stringify(blindReview, null, 2), "utf8");

  const md: string[] = [
    "# ANCHR Scientific Replay Report",
    "",
    "Generated: " + new Date().toISOString(),
    "",
    "| Metric | Value |",
    "|--------|-------|",
    "| Total predictions | " + total_predictions + " |",
    "| Causal matches | " + matched_predictions + " |",
    "| False positives | " + unmatched_predictions + " |",
    "| Precision | " + (precision * 100).toFixed(1) + "% |",
    "| Random baseline | " + (baseline_precision * 100).toFixed(1) + "% |",
    "| Lift | " + lift.toFixed(2) + "× |",
    "| Hindsight-only detections removed | " + hindsightOnlyCount + " |",
    "",
    "---",
    "",
    "## Causal Matches",
    "",
  ];
  for (const c of causal_matches) {
    md.push("- **" + c.prediction_sha.slice(0, 7) + "** → " + c.fix_sha.slice(0, 7));
    md.push("  - Predicted BEFORE bug introduced: " + (c.causal_prediction ? "YES" : "N/A"));
    md.push("  - Appeared in real time (counterfactual): YES");
    md.push("  - " + c.prediction);
    md.push("");
  }
  md.push("---");
  md.push("");
  md.push("## Unmatched Warnings (Sample)");
  md.push("");
  for (const u of sample_unmatched) {
    md.push("- " + u.prediction_sha.slice(0, 7) + ": " + (u.prediction || "(no title)") + " (score " + u.score + ")");
  }
  md.push("");
  md.push("---");
  md.push("");
  md.push("## Blind Review Instructions");
  md.push("");
  md.push("Review `artifacts/blind-review.json`. If humans detect real cases >50%, validated beyond chance.");
  md.push("");

  writeFileSync(join(cwd, "artifacts", "proof-report.md"), md.join("\n"), "utf8");

  console.log("Causal matches: " + matched_predictions);
  console.log("False positives: " + unmatched_predictions);
  console.log("Precision: " + (precision * 100).toFixed(1) + "%");
  console.log("Baseline: " + (baseline_precision * 100).toFixed(1) + "%");
  console.log("Lift: " + lift.toFixed(2) + "×");
  console.log("Hindsight-only removed: " + hindsightOnlyCount);
  console.log("Blind dataset created");
}

main();
