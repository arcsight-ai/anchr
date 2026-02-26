/**
 * ANCHR Historical Replay Runner (v1 + Prompt 2).
 * Replays ANCHR against historical closed PRs; writes structured results.
 * Detects SIGNAL MOMENTS: predictions before humans reacted (predictive hits).
 */

import { execSync, spawnSync } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANCHR_ROOT = join(__dirname, "..");
const CLI_SCRIPT = join(ANCHR_ROOT, "scripts", "cli.ts");
import { parseMinimalCut } from "../src/repair/parseReport.js";
import { renderFailurePrediction } from "../src/prediction/render-failure.js";
import type { ViolationKind } from "../src/structural/types.js";
import type { FailureKind } from "../src/prediction/render-failure.js";

/** Stored prediction for later correlation (Prompt 2). */
interface StoredPrediction {
  sha: string;
  merge_commit_sha: string | null;
  date: string;
  prediction: string;
  confidence: string;
  trigger: string;
  evidence: string[];
  failure_kind?: FailureKind;
}

/** HUMAN_SIGNAL: keywords that suggest humans later fixed the predicted issue. */
const HUMAN_SIGNAL_KEYWORDS = [
  "fix",
  "bug",
  "race",
  "retry",
  "null",
  "undefined",
  "edge",
  "hotfix",
  "revert",
  "handle",
  "guard",
  "prevent",
  "issue",
  "crash",
  "fail",
];

const ALLOWED_FAILURE_KINDS: FailureKind[] = [
  "timeout_cascade",
  "duplicate_effect",
  "stale_read",
  "partial_initialization",
  "silent_corruption",
  "version_mismatch_crash",
  "hidden_shared_state",
  "async_init_race",
  "temporal_coupling",
  "fanout_side_effects",
  "circular_responsibility",
  "implicit_global_dependency",
  "retry_removed",
  "stale_read_risk",
];

const NOISE_PATTERNS = [
  /\.md$/i,
  /\.json$/i,
  /\.yml$/i,
  /\.yaml$/i,
  /\.lock$/i,
  /^docs\//i,
  /README/i,
  /^test\//i,
  /^tests\//i,
  /\/tests?\//i,
];

/** Strictly diagnostic: pipeline stage counters. Read-only, counter-only. Safe to remove. */
const DEBUG_REPLAY = true;
const replayDebug: {
  totals: {
    commits_scanned: number;
    structural_events: number;
    wedge_invocations: number;
    predictions_raw: number;
    predictions_after_filters: number;
    predictions_sent_to_validation: number;
    cli_reports_received: number;
    cli_status_blocked: number;
    cli_has_proofs: number;
    cli_has_minimal_cut: number;
  };
  perRepo: Record<
    string,
    {
      commits_scanned: number;
      structural_events: number;
      wedge_invocations: number;
      predictions_raw: number;
      predictions_after_filters: number;
      predictions_sent_to_validation: number;
      cli_reports_received: number;
      cli_status_blocked: number;
      cli_has_proofs: number;
      cli_has_minimal_cut: number;
    }
  >;
} = {
  totals: {
    commits_scanned: 0,
    structural_events: 0,
    wedge_invocations: 0,
    predictions_raw: 0,
    predictions_after_filters: 0,
    predictions_sent_to_validation: 0,
    cli_reports_received: 0,
    cli_status_blocked: 0,
    cli_has_proofs: 0,
    cli_has_minimal_cut: 0,
  },
  perRepo: {},
};

function allFilesNoise(files: string[]): boolean {
  if (files.length === 0) return true;
  return files.every((f) => NOISE_PATTERNS.some((re) => re.test(f)));
}

function parseArgs(): {
  repo: string;
  limit: number;
  since: string | null;
  mode: string;
  token: string;
} {
  const args = process.argv.slice(2);
  let repo = "";
  let limit = 50;
  let since: string | null = null;
  let mode = "prediction";
  let token = process.env.GITHUB_TOKEN ?? "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--repo" && i + 1 < args.length) repo = args[i + 1]!;
    if (args[i] === "--limit" && i + 1 < args.length) limit = Math.max(1, parseInt(args[i + 1]!, 10) || 50);
    if (args[i] === "--since" && i + 1 < args.length) since = args[i + 1];
    if (args[i] === "--mode" && i + 1 < args.length) mode = args[i + 1]!;
    if (args[i] === "--token" && i + 1 < args.length) token = args[i + 1]!;
  }

  return { repo, limit, since, mode, token };
}

async function gh<T>(token: string, repo: string, path: string): Promise<T> {
  const [owner, repoName] = repo.split("/");
  const url = `https://api.github.com/repos/${owner}/${repoName}${path}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      Authorization: token ? `Bearer ${token}` : "",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

interface PRListItem {
  number: number;
  title: string | null;
  draft?: boolean;
  created_at: string;
  merged_at: string | null;
  merge_commit_sha: string | null;
  user?: { login?: string };
  base?: { sha?: string; ref?: string };
  head?: { sha?: string; ref?: string };
}

interface PRFile {
  filename: string;
}

function buildAnchrFromReport(report: Record<string, unknown>): {
  risk: boolean;
  reason?: string;
  mode?: string;
  title?: string;
  confidence?: string;
  trigger?: string;
  evidence?: string[];
  failure_kind?: FailureKind;
} {
  if (report.status !== "BLOCKED") {
    return { risk: false, reason: "no_signal" };
  }
  const proofs = report.proofs as { source: string; target: string; rule: string }[] | undefined;
  const minimalCut = (report.minimalCut as string[]) ?? [];
  if (!proofs?.length || minimalCut.length === 0) {
    return { risk: false, reason: "no_signal" };
  }
  const parsed = parseMinimalCut(minimalCut);
  const base = parsed[0];
  if (!base) return { risk: false, reason: "no_signal" };

  const proof = proofs[0]!;
  const cause = proof.rule as ViolationKind;
  const violation = {
    package: base.package,
    path: base.path,
    cause,
    specifier: base.specifier,
    proof: { type: "import_path" as const, source: proof.source, target: proof.target, rule: cause },
  };
  const pred = renderFailurePrediction(violation);
  if (pred.failure_kind === "unknown" || pred.confidence === "low") {
    return { risk: false, reason: "no_signal" };
  }
  const kind = pred.failure_kind as FailureKind;
  if (!ALLOWED_FAILURE_KINDS.includes(kind)) {
    return { risk: false, reason: "no_signal" };
  }
  const trigger = pred.when_it_happens || pred.runtime_symptom || "";
  return {
    risk: true,
    mode: "prediction",
    title: pred.short_sentence ?? "",
    confidence: pred.confidence,
    trigger,
    evidence: pred.evidence,
    failure_kind: kind,
  };
}

function runAuditCaptureStdout(cwd: string, baseSha: string, headSha: string): { stdout: string; exitCode: number } {
  const reportDir = join(cwd, "artifacts");
  mkdirSync(reportDir, { recursive: true });
  const env = {
    ...process.env,
    GITHUB_BASE_SHA: baseSha,
    GITHUB_HEAD_SHA: headSha,
    HEAD_SHA: headSha,
    BASE_SHA: baseSha,
    ANCHR_REPORT_PATH: join(reportDir, "anchr-report.json"),
  };
  const r = spawnSync("npx", ["tsx", CLI_SCRIPT, "audit", "--all", "--base", baseSha, "--head", headSha, "--json"], {
    encoding: "utf8",
    cwd,
    env,
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return { stdout: r.stdout ?? "", exitCode: r.status ?? -1 };
}

function getCurrentRef(cwd: string): string | null {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", cwd }).trim() || null;
  } catch {
    return null;
  }
}

function fetchAndCheckoutPR(cwd: string, repo: string, prNumber: number, baseRef?: string): void {
  execSync(`git fetch origin pull/${prNumber}/head:anchr-replay-${prNumber}`, { encoding: "utf8", cwd, stdio: "pipe" });
  if (baseRef) {
    try {
      execSync(`git fetch origin ${baseRef}`, { encoding: "utf8", cwd, stdio: "pipe" });
    } catch {
      // base may already exist
    }
  }
  execSync(`git checkout anchr-replay-${prNumber}`, { encoding: "utf8", cwd, stdio: "pipe" });
}

function restoreBranch(cwd: string, branch: string | null): void {
  if (!branch) return;
  try {
    execSync(`git checkout ${branch}`, { encoding: "utf8", cwd, stdio: "pipe" });
  } catch {
    // ignore
  }
}

function getDefaultBranch(cwd: string): string {
  try {
    const ref = execSync("git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null", { encoding: "utf8", cwd }).trim();
    const parts = ref.split("/");
    if (parts.length > 0 && parts[parts.length - 1]) return parts[parts.length - 1]!;
  } catch {
    // ignore
  }
  try {
    const out = execSync("git remote show origin 2>/dev/null | grep 'HEAD branch' | cut -d' ' -f5", {
      encoding: "utf8",
      cwd,
    }).trim();
    if (out) return out;
  } catch {
    // ignore
  }
  return "main";
}

/** Returns true if commit message or diff (added/removed lines) contains any HUMAN_SIGNAL keyword. */
function commitHasHumanSignal(cwd: string, sha: string): boolean {
  let out = "";
  try {
    out = execSync(`git show --stat --patch ${sha}`, { encoding: "utf8", cwd, maxBuffer: 2 * 1024 * 1024 });
  } catch {
    return false;
  }
  const lower = out.toLowerCase();
  return HUMAN_SIGNAL_KEYWORDS.some((kw) => {
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(lower);
  });
}

/** Get commit SHAs on branch (newest first). */
function getCommitShas(cwd: string, branch: string, maxCount: number): string[] {
  try {
    const out = execSync(`git log ${branch} --format=%H -n ${maxCount}`, { encoding: "utf8", cwd });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Find predictive hits: predictions where a HUMAN_SIGNAL appeared in the next 5 commits (confidence >= medium). */
function findPredictiveHits(
  cwd: string,
  predictions: StoredPrediction[],
): Array<{
  prediction_sha: string;
  fix_sha: string;
  prediction: string;
  trigger: string;
  confidence: string;
  distance: number;
  failure_kind?: string;
  date?: string;
}> {
  const defaultBranch = getDefaultBranch(cwd);
  const commitList = getCommitShas(cwd, defaultBranch, 2000);
  const hits: Array<{
    prediction_sha: string;
    fix_sha: string;
    prediction: string;
    trigger: string;
    confidence: string;
    distance: number;
    failure_kind?: string;
    date?: string;
  }> = [];

  for (const p of predictions) {
    if (p.confidence !== "medium" && p.confidence !== "high") continue;
    const refSha = p.merge_commit_sha || p.sha;
    const idx = commitList.indexOf(refSha);
    if (idx < 0) continue;
    for (let d = 1; d <= 5 && idx + d < commitList.length; d++) {
      const fixSha = commitList[idx + d]!;
      if (commitHasHumanSignal(cwd, fixSha)) {
        hits.push({
          prediction_sha: p.sha,
          fix_sha: fixSha,
          prediction: p.prediction,
          trigger: p.trigger,
          confidence: p.confidence,
          distance: d,
          failure_kind: p.failure_kind,
          date: p.date,
        });
        break;
      }
    }
  }

  return hits;
}

async function main(): Promise<void> {
  const { repo, limit, since, mode, token } = parseArgs();
  if (!repo) {
    console.error("Usage: npx tsx scripts/replay-history.ts --repo owner/name [--limit N] [--since YYYY-MM-DD] [--mode prediction] [--token $GITHUB_TOKEN]");
    process.exit(1);
  }
  if (!token) {
    console.error("GITHUB_TOKEN or --token required for GitHub API.");
    process.exit(1);
  }

  const cwd = process.cwd();
  const historyDir = join(cwd, "artifacts", "history", repo.replace(/\//g, "-"));
  mkdirSync(historyDir, { recursive: true });

  let prs: PRListItem[] = [];
  try {
    const list = await gh<PRListItem[]>(
      token,
      repo,
      `/pulls?state=closed&sort=updated&direction=desc&per_page=${Math.min(limit, 100)}`,
    );
    prs = Array.isArray(list) ? list : [];
  } catch (e) {
    console.error("Failed to fetch PR list:", e);
    process.exit(1);
  }

  if (since) {
    const sinceTime = new Date(since).getTime();
    prs = prs.filter((p) => new Date(p.created_at).getTime() >= sinceTime);
  }
  prs = prs.slice(0, limit);
  prs = prs.filter((p) => !p.draft);

  let scanned = 0;
  let signalsFound = 0;
  let errors = 0;
  const allPredictions: StoredPrediction[] = [];

  const originalBranch = getCurrentRef(cwd);

  for (const pr of prs) {
    const prNumber = pr.number;
    const baseSha = pr.base?.sha ?? "";
    const headSha = pr.head?.sha ?? "";

    if (!baseSha || !headSha) {
      console.log(`Skipping PR #${prNumber} (no base/head sha)`);
      continue;
    }

    let files: string[] = [];
    try {
      const fileList = await gh<PRFile[]>(token, repo, `/pulls/${prNumber}/files`);
      files = Array.isArray(fileList) ? fileList.map((f) => f.filename) : [];
    } catch {
      // continue without files filter
    }
    if (allFilesNoise(files)) {
      console.log(`Skipping PR #${prNumber} (noise-only files)`);
      continue;
    }

    const baseRef = (pr.base as { ref?: string } | undefined)?.ref;
    try {
      fetchAndCheckoutPR(cwd, repo, prNumber, baseRef);
    } catch (e) {
      console.log(`Skipping PR #${prNumber} (fetch/checkout failed)`);
      errors++;
      continue;
    }

    try {
      console.log(`Scanning PR #${prNumber}`);
      const { stdout } = runAuditCaptureStdout(cwd, baseSha, headSha);
      scanned++;
      replayDebug.totals.commits_scanned++;
      replayDebug.totals.wedge_invocations++;

      let report: Record<string, unknown> | null = null;
      try {
        const parsed = JSON.parse(stdout);
        if (parsed && typeof parsed === "object") report = parsed as Record<string, unknown>;
      } catch {
        report = null;
      }

      if (report) replayDebug.totals.cli_reports_received++;
      if (report?.status === "BLOCKED") replayDebug.totals.cli_status_blocked++;
      const proofArr = report?.proofs as unknown[] | undefined;
      if (proofArr !== undefined && proofArr !== null && proofArr.length > 0) replayDebug.totals.cli_has_proofs++;
      if (((report?.minimalCut as string[]) ?? []).length > 0) replayDebug.totals.cli_has_minimal_cut++;

      const hasStructural =
        report &&
        report.status === "BLOCKED" &&
        ((report?.proofs as unknown[] | undefined)?.length ?? 0) > 0 &&
        ((report.minimalCut as string[]) ?? []).length > 0;
      if (hasStructural) {
        replayDebug.totals.structural_events++;
        replayDebug.totals.predictions_raw++;
      }

      const anchr = report ? buildAnchrFromReport(report) : { risk: false as const, reason: "no_signal" as const };
      if (anchr.risk) {
        replayDebug.totals.predictions_after_filters++;
        signalsFound++;
        console.log(`  Signal: risk=true confidence=${anchr.confidence ?? "?"}`);
        allPredictions.push({
          sha: headSha,
          merge_commit_sha: pr.merge_commit_sha ?? null,
          date: pr.merged_at ?? pr.created_at ?? "",
          prediction: anchr.title ?? "",
          confidence: anchr.confidence ?? "low",
          trigger: anchr.trigger ?? "",
          evidence: anchr.evidence ?? [],
          failure_kind: anchr.failure_kind,
        });
      } else {
        console.log(`  Signal: risk=false`);
      }

      const outPath = join(historyDir, `pr-${prNumber}.json`);
      const payload = {
        pr: {
          number: prNumber,
          title: pr.title ?? "",
          author: pr.user?.login ?? "",
          created_at: pr.created_at,
          merged_at: pr.merged_at ?? "",
          merge_commit_sha: pr.merge_commit_sha ?? "",
          base_sha: baseSha,
          head_sha: headSha,
        },
        anchr: {
          risk: anchr.risk,
          ...(anchr.reason && { reason: anchr.reason }),
          ...(anchr.mode && { mode: anchr.mode }),
          ...(anchr.title !== undefined && { title: anchr.title }),
          ...(anchr.confidence && { confidence: anchr.confidence }),
          ...(anchr.trigger && { trigger: anchr.trigger }),
          ...(anchr.evidence && { evidence: anchr.evidence }),
        },
        meta: {
          timestamp: new Date().toISOString(),
          version: "replay-v1",
        },
      };
      writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
      console.log(`  Saved to ${outPath}`);
    } catch (e) {
      console.log(`  Error: ${e}`);
      errors++;
    } finally {
      restoreBranch(cwd, originalBranch);
    }
  }

  console.log("");
  console.log("Replay complete.");
  console.log(`Scanned: ${scanned}`);
  console.log(`Signals found: ${signalsFound}`);
  console.log(`Errors: ${errors}`);

  replayDebug.totals.predictions_sent_to_validation = allPredictions.length;
  replayDebug.perRepo[repo] = { ...replayDebug.totals };

  if (DEBUG_REPLAY) {
    try {
      const runHash = createHash("sha256")
        .update(repo + JSON.stringify(replayDebug.totals))
        .digest("hex")
        .slice(0, 16);
      const replayDebugDir = join(ANCHR_ROOT, "artifacts", "replay-debug");
      mkdirSync(replayDebugDir, { recursive: true });
      writeFileSync(
        join(replayDebugDir, `replay-debug-${runHash}.json`),
        JSON.stringify(replayDebug, null, 2),
        "utf8",
      );
    } catch (e) {
      console.error("[replay-debug] Write failed:", e instanceof Error ? e.message : String(e));
    }
    console.log("=== REPLAY PIPELINE DEBUG START ===");
    console.log(JSON.stringify(replayDebug, null, 2));
    console.log("=== REPLAY PIPELINE DEBUG END ===");
    const t = replayDebug.totals;
    if (t.cli_reports_received === 0) console.log("COLLAPSE_AT_CLI_INVOCATION");
    if (t.cli_reports_received > 0 && t.cli_status_blocked === 0) console.log("COLLAPSE_AT_CLI_STATUS");
    if (t.cli_status_blocked > 0 && t.cli_has_proofs === 0) console.log("COLLAPSE_AT_PROOFS");
    if (t.cli_has_proofs > 0 && t.predictions_raw === 0) console.log("COLLAPSE_AT_PREDICTION_MAPPING");
    if (t.structural_events > 0 && t.wedge_invocations === 0) console.log("COLLAPSE_AT_WEDGE");
    if (t.wedge_invocations > 0 && t.predictions_raw === 0) console.log("COLLAPSE_AT_PREDICTION_GENERATION");
    if (t.predictions_raw > 0 && t.predictions_after_filters === 0) console.log("COLLAPSE_AT_FILTER");
    if (t.predictions_after_filters > 0 && t.predictions_sent_to_validation === 0) console.log("COLLAPSE_AT_EMISSION");
    const sumRaw = Object.values(replayDebug.perRepo).reduce((s, r) => s + r.predictions_raw, 0);
    if (sumRaw !== t.predictions_raw) console.log("INVARIANT_FAIL_TOTAL_MISMATCH");
  }

  // Prompt 2: detect predictive hits (ANCHR spoke before humans fixed)
  const defaultBranch = getDefaultBranch(cwd);
  try {
    execSync(`git fetch origin ${defaultBranch}`, { encoding: "utf8", cwd, stdio: "pipe" });
  } catch {
    // ignore
  }
  restoreBranch(cwd, defaultBranch);
  const hits = findPredictiveHits(cwd, allPredictions);
  restoreBranch(cwd, originalBranch);
  const predictionsCount = allPredictions.length;
  const predictiveHitsCount = hits.length;
  const precision = predictionsCount > 0 ? predictiveHitsCount / predictionsCount : 0;

  const confidence_distribution = { high: 0, medium: 0 };
  for (const p of allPredictions) {
    if (p.confidence === "high") confidence_distribution.high++;
    else if (p.confidence === "medium") confidence_distribution.medium++;
  }
  const resultsPath = join(cwd, "artifacts", "replay-results.json");
  mkdirSync(join(cwd, "artifacts"), { recursive: true });
  writeFileSync(
    resultsPath,
    JSON.stringify(
      {
        repo,
        total_commits_scanned: scanned,
        predictions: predictionsCount,
        predictive_hits: predictiveHitsCount,
        precision: Math.round(precision * 1000) / 1000,
        confidence_distribution,
        hits,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("");
  console.log("ANCHR Replay Summary");
  console.log("Predictions: " + predictionsCount);
  console.log("Predictive Hits: " + predictiveHitsCount);
  console.log("Precision: " + (precision * 100).toFixed(1) + "%");
  console.log("");
  console.log("Results written to " + resultsPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
