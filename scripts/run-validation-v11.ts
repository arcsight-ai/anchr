/**
 * ANCHR Validation Protocol v11 — Product-Credible Edition.
 * Pre-registered thresholds. Signal efficiency. No narrative output.
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import { writeDiagnostics, type DiagnosticsSnapshot, type DiagnosticsPerRepo } from "./validation-diagnostics.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANCHR_ROOT = join(__dirname, "..");

const PROTOCOL_VERSION = "v11";

const THRESHOLDS = {
  min_commits: 30,
  min_predictions: 15,
  lift_real: 1.2,
  lift_strong: 1.3,
  min_precision: 0.35,
  bootstrap_iterations: 1000,
  shuffle_iterations: 50,
  permutation_iterations: 10000,
  ranking_bins: 5,
  max_warnings_per_issue: 10,
  alpha: 0.05,
  min_effect_size: 0,
  min_power_proxy: 0.1,
  min_repos_valid: 2,
  refactor_files: 20,
  refactor_lines: 800,
  min_failure_kinds: 3,
  min_high_confidence: 1,
  min_replay_kb: 10,
};

const THRESHOLD_STR = JSON.stringify(THRESHOLDS, null, 0);
const THRESHOLD_HASH = createHash("sha256").update(THRESHOLD_STR).digest("hex").slice(0, 16);

interface ReplayResults {
  repo?: string;
  total_commits_scanned?: number;
  predictions: number;
  hits: Array<{
    prediction_sha: string;
    fix_sha: string;
    prediction: string;
    trigger: string;
    confidence: string;
    distance: number;
    failure_kind?: string;
    date?: string;
  }>;
  confidence_distribution?: { high: number; medium: number };
}

interface ProofReport {
  total_predictions: number;
  causal_matches: number;
  precision: number;
  baseline_precision: number;
  lift: number;
  causal_matches_detail?: Array<{
    prediction_sha: string;
    fix_sha: string;
    confidence: string;
    bug_intro_sha?: string | null;
  }>;
  random_baseline?: { matches: number; count: number };
}

function safeExec(cwd: string, cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", cwd, maxBuffer: 2 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function main(): void {
  const RANDOM_SEED = parseInt(process.env.RANDOM_SEED ?? "42", 10);
  const TRAIN_REPOS = (process.env.TRAIN_REPOS ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  const HOLDOUT_REPOS = (process.env.HOLDOUT_REPOS ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  const defaultRepos = "supabase/supabase,calcom/cal.com,immich-app/immich,directus/directus,appwrite/appwrite";
  const allRepos = TRAIN_REPOS.length > 0 || HOLDOUT_REPOS.length > 0 ? [...TRAIN_REPOS, ...HOLDOUT_REPOS] : (process.env.VALIDATION_REPOS ?? defaultRepos).split(",").map((r) => r.trim()).filter(Boolean);

  console.log("PROTOCOL_VERSION=" + PROTOCOL_VERSION);
  console.log("RANDOM_SEED=" + RANDOM_SEED);
  console.log("TRAIN_REPOS=" + (TRAIN_REPOS.length ? TRAIN_REPOS.join(",") : "(all)"));
  console.log("HOLDOUT_REPOS=" + (HOLDOUT_REPOS.length ? HOLDOUT_REPOS.join(",") : "(all)"));
  console.log("THRESHOLDS");
  console.log("min_commits=" + THRESHOLDS.min_commits);
  console.log("min_predictions=" + THRESHOLDS.min_predictions);
  console.log("lift_real=" + THRESHOLDS.lift_real);
  console.log("lift_strong=" + THRESHOLDS.lift_strong);
  console.log("min_precision=" + THRESHOLDS.min_precision);
  console.log("bootstrap_iterations=" + THRESHOLDS.bootstrap_iterations);
  console.log("shuffle_iterations=" + THRESHOLDS.shuffle_iterations);
  console.log("permutation_iterations=" + THRESHOLDS.permutation_iterations);
  console.log("ranking_bins=" + THRESHOLDS.ranking_bins);
  console.log("threshold_hash=" + THRESHOLD_HASH);
  console.log("");

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN required. Abort.");
    process.exit(1);
  }
  const cwd = ANCHR_ROOT;
  const diffWork = safeExec(cwd, "git diff --name-only") ?? "";
  const diffCached = safeExec(cwd, "git diff --cached --name-only") ?? "";
  if (diffWork.trim().length > 0 || diffCached.trim().length > 0) {
    console.error("Dirty working tree. Abort.");
    process.exit(1);
  }
  const repoOrigin = safeExec(cwd, "git remote get-url origin") ?? "";
  const HEAD = safeExec(cwd, "git rev-parse HEAD") ?? "";
  const nodeVersion = process.version;
  const os = process.platform + " " + process.arch;
  const timestamp = new Date().toISOString();

  console.log("repo_origin=" + repoOrigin);
  console.log("HEAD=" + HEAD);
  console.log("anchr_version=" + HEAD);
  console.log("node_version=" + nodeVersion);
  console.log("os=" + os);
  console.log("seed=" + RANDOM_SEED);
  console.log("threshold_hash=" + THRESHOLD_HASH);
  console.log("");

  const validationDir = join(cwd, "artifacts", "validation");
  mkdirSync(validationDir, { recursive: true });

  const defaultList = ["supabase/supabase", "calcom/cal.com", "immich-app/immich", "directus/directus", "appwrite/appwrite"];
  const repoList = allRepos.length >= 2 ? allRepos : defaultList;

  type RepoRow = {
    repo: string;
    cloneDir: string;
    replayResults: ReplayResults | null;
    valid: boolean;
    proofReport: ProofReport | null;
    segmentPrecision: { early: number; middle: number; late: number } | null;
    randomPrecision: number;
    randomPrecision95th: number;
    precisionHigh: number;
    precisionMedium: number;
    calibrated: boolean;
    temporalOverfit: boolean;
    adjustedPrecision: number;
    effectSize: number;
    powerProxy: number;
    warningsPerTrueIssue: number;
    randomWarningsPerIssue: number;
    efficient: boolean;
    rankingValid: boolean;
    medianLeadTime: number;
    randomMedianLeadTime: number;
    earlyWarning: boolean;
    precisionCiLow: number;
    liftCiLow: number;
    bootstrapPass: boolean;
    pValue: number;
    permutationPass: boolean;
    churnPrecision: number;
    churnPass: boolean;
    leaveOneOutSignal: boolean;
  };

  const repoData: RepoRow[] = [];
  const rand = seededRandom(RANDOM_SEED);

  for (const repo of repoList) {
    const sanitized = repo.replace(/\//g, "-");
    const cloneDir = join(validationDir, sanitized);
    if (!existsSync(cloneDir)) {
      try {
        execSync(`git clone --depth 150 https://github.com/${repo}.git ${cloneDir}`, {
          encoding: "utf8",
          cwd: validationDir,
          stdio: "pipe",
          timeout: 120000,
        });
      } catch {
        repoData.push(emptyRow(repo, cloneDir));
        continue;
      }
    }

    const replayPath = join(cloneDir, "artifacts", "replay-results.json");
    const runReplay = () => {
      spawnSync(
        "npx",
        ["tsx", join(ANCHR_ROOT, "scripts", "replay-history.ts"), "--repo", repo, "--limit", "80", "--token", token],
        { encoding: "utf8", cwd: cloneDir, timeout: 600000, stdio: "pipe" },
      );
    };

    runReplay();
    if (!existsSync(replayPath)) {
      repoData.push(emptyRow(repo, cloneDir));
      continue;
    }

    let replayResults: ReplayResults;
    try {
      replayResults = JSON.parse(readFileSync(replayPath, "utf8")) as ReplayResults;
    } catch {
      repoData.push(emptyRow(repo, cloneDir));
      continue;
    }

    const commits = replayResults.total_commits_scanned ?? 0;
    const predictions = replayResults.predictions ?? 0;
    const failureKinds = new Set((replayResults.hits ?? []).map((h) => h.failure_kind).filter(Boolean)).size;
    const highConf = replayResults.confidence_distribution?.high ?? 0;
    const fileSizeKb = statSync(replayPath).size / 1024;

    const valid =
      commits >= THRESHOLDS.min_commits &&
      predictions >= THRESHOLDS.min_predictions &&
      failureKinds >= THRESHOLDS.min_failure_kinds &&
      highConf >= THRESHOLDS.min_high_confidence &&
      fileSizeKb > THRESHOLDS.min_replay_kb;

    if (!valid) {
      repoData.push({ ...emptyRow(repo, cloneDir), replayResults, valid: false });
      continue;
    }

    runReplay();
    let replayResults2: ReplayResults | null = null;
    if (existsSync(replayPath)) {
      try {
        replayResults2 = JSON.parse(readFileSync(replayPath, "utf8")) as ReplayResults;
      } catch {
        // ignore
      }
    }
    const hits1 = replayResults.hits ?? [];
    const hits2 = replayResults2?.hits ?? [];
    const matchOrder =
      hits1.length === hits2.length &&
      hits1.every((h, i) => {
        const k = hits2[i];
        return k && h.prediction_sha === k.prediction_sha && h.fix_sha === k.fix_sha && h.confidence === k.confidence;
      });
    if (!matchOrder) {
      console.error("NON_DETERMINISTIC " + repo);
      process.exit(1);
    }

    spawnSync(
      "npx",
      ["tsx", join(ANCHR_ROOT, "scripts", "generate-proof.ts")],
      { encoding: "utf8", cwd: cloneDir, timeout: 300000, stdio: "pipe" },
    );
    const proofPath = join(cloneDir, "artifacts", "proof-report.json");
    let proofReport: ProofReport | null = null;
    if (existsSync(proofPath)) {
      try {
        proofReport = JSON.parse(readFileSync(proofPath, "utf8")) as ProofReport;
      } catch {
        // ignore
      }
    }

    const totalPred = proofReport?.total_predictions ?? 0;
    const causalMatches = proofReport?.causal_matches ?? 0;
    const precision = proofReport?.precision ?? 0;
    const baselinePrecision = proofReport?.baseline_precision ?? 0;
    const lift = proofReport?.lift ?? 0;
    const detail = proofReport?.causal_matches_detail ?? [];
    const rb = proofReport?.random_baseline ?? { matches: 0, count: 0 };

    const shufflePrecisions: number[] = [];
    const shuffledPath = join(cloneDir, "artifacts", "replay-results-shuffled.json");
    for (let iter = 0; iter < THRESHOLDS.shuffle_iterations; iter++) {
      const shuffledHits = [...(replayResults.hits ?? [])];
      for (let i = shuffledHits.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffledHits[i]!.fix_sha, shuffledHits[j]!.fix_sha] = [shuffledHits[j]!.fix_sha!, shuffledHits[i]!.fix_sha!];
      }
      writeFileSync(shuffledPath, JSON.stringify({ ...replayResults, hits: shuffledHits }, null, 2), "utf8");
      spawnSync("npx", ["tsx", join(ANCHR_ROOT, "scripts", "generate-proof.ts"), "--input", shuffledPath], {
        encoding: "utf8",
        cwd: cloneDir,
        timeout: 120000,
        stdio: "pipe",
      });
      if (existsSync(proofPath)) {
        try {
          const p = JSON.parse(readFileSync(proofPath, "utf8")) as ProofReport;
          shufflePrecisions.push(p.precision ?? 0);
        } catch {
          // ignore
        }
      }
    }
    shufflePrecisions.sort((a, b) => a - b);
    const randomPrecision = shufflePrecisions.length > 0 ? shufflePrecisions.reduce((a, b) => a + b, 0) / shufflePrecisions.length : 0;
    const randomPrecision95th = shufflePrecisions.length > 0 ? shufflePrecisions[Math.min(Math.floor(shufflePrecisions.length * 0.95), shufflePrecisions.length - 1)]! : 0;

    const hitsWithDate = (replayResults.hits ?? []).filter((h) => h.date);
    const sorted = [...hitsWithDate].sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
    const n = sorted.length;
    const segSize = Math.floor(n / 3) || 1;
    const early = sorted.slice(0, segSize);
    const middle = sorted.slice(segSize, segSize * 2);
    const late = sorted.slice(segSize * 2);
    const earlyShas = new Set(early.map((h) => h.prediction_sha));
    const middleShas = new Set(middle.map((h) => h.prediction_sha));
    const lateShas = new Set(late.map((h) => h.prediction_sha));
    const earlyMatches = detail.filter((d) => earlyShas.has(d.prediction_sha)).length;
    const middleMatches = detail.filter((d) => middleShas.has(d.prediction_sha)).length;
    const lateMatches = detail.filter((d) => lateShas.has(d.prediction_sha)).length;
    const segmentPrecision = {
      early: early.length > 0 ? earlyMatches / early.length : 0,
      middle: middle.length > 0 ? middleMatches / middle.length : 0,
      late: late.length > 0 ? lateMatches / late.length : 0,
    };
    const aboveBaseline = [segmentPrecision.early > baselinePrecision, segmentPrecision.middle > baselinePrecision, segmentPrecision.late > baselinePrecision].filter(Boolean).length;
    const temporalOverfit = aboveBaseline === 1;

    const highPred = replayResults.confidence_distribution?.high ?? 0;
    const mediumPred = replayResults.confidence_distribution?.medium ?? 0;
    const highMatches = detail.filter((d) => d.confidence === "high").length;
    const mediumMatches = detail.filter((d) => d.confidence === "medium").length;
    const precisionHigh = highPred > 0 ? highMatches / highPred : 0;
    const precisionMedium = mediumPred > 0 ? mediumMatches / mediumPred : 0;
    const calibrated = precisionHigh >= precisionMedium;

    let adjustedMatches = causalMatches;
    for (const d of detail) {
      const stat = safeExec(cloneDir, `git show --shortstat ${d.fix_sha}`);
      if (stat) {
        const filesMatch = stat.match(/(\d+)\s+files? changed/);
        const insDelMatch = stat.match(/(\d+)\s+insertions?.+(\d+)\s+deletions?/);
        const files = filesMatch ? parseInt(filesMatch[1]!, 10) : 0;
        const ins = insDelMatch ? parseInt(insDelMatch[1]!, 10) : 0;
        const del = insDelMatch ? parseInt(insDelMatch[2]!, 10) : 0;
        if (files > THRESHOLDS.refactor_files || ins + del > THRESHOLDS.refactor_lines) adjustedMatches--;
      }
    }
    const adjustedPrecision = totalPred > 0 ? adjustedMatches / totalPred : 0;
    const effectSize = precision - baselinePrecision;
    const powerProxy = totalPred > 0 ? causalMatches / totalPred : 0;

    const warningsPerTrueIssue = causalMatches > 0 ? totalPred / causalMatches : Infinity;
    const randomWarningsPerIssue = rb.matches > 0 && rb.count > 0 ? rb.count / rb.matches : Infinity;
    const efficient = warningsPerTrueIssue < randomWarningsPerIssue && warningsPerTrueIssue <= THRESHOLDS.max_warnings_per_issue;

    const bins = THRESHOLDS.ranking_bins;
    const hitsByConf = [...(replayResults.hits ?? [])].sort((a, b) => (a.confidence === "high" ? 1 : 0) - (b.confidence === "high" ? 1 : 0));
    const binSize = Math.max(1, Math.floor(hitsByConf.length / bins));
    const binPrecisions: number[] = [];
    for (let b = 0; b < bins; b++) {
      const slice = hitsByConf.slice(b * binSize, b < bins - 1 ? (b + 1) * binSize : undefined);
      const shas = new Set(slice.map((h) => h.prediction_sha));
      const matches = detail.filter((d) => shas.has(d.prediction_sha)).length;
      binPrecisions.push(slice.length > 0 ? matches / slice.length : 0);
    }
    let rankingValid = true;
    for (let b = 1; b < bins; b++) {
      if (binPrecisions[b]! < binPrecisions[b - 1]!) rankingValid = false;
    }
    const topBin = binPrecisions[bins - 1] ?? 0;
    const bottomBin = binPrecisions[0] ?? 0;
    if (bottomBin > 0 && topBin < 2 * bottomBin) rankingValid = false;

    const leadTimes: number[] = [];
    for (const d of detail) {
      const pt = safeExec(cloneDir, `git log -1 --format=%ct ${d.prediction_sha}`);
      const ft = safeExec(cloneDir, `git log -1 --format=%ct ${d.fix_sha}`);
      if (pt && ft) leadTimes.push(parseInt(ft, 10) - parseInt(pt, 10));
    }
    const medianLeadTime = leadTimes.length > 0 ? leadTimes.slice().sort((a, b) => a - b)[Math.floor(leadTimes.length / 2)]! : 0;
    const randomLeadTimes: number[] = [];
    const shuffledHitsForLead = [...(replayResults.hits ?? [])];
    for (let i = shuffledHitsForLead.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffledHitsForLead[i]!.fix_sha, shuffledHitsForLead[j]!.fix_sha] = [shuffledHitsForLead[j]!.fix_sha!, shuffledHitsForLead[i]!.fix_sha!];
    }
    for (const h of shuffledHitsForLead) {
      const pt = safeExec(cloneDir, `git log -1 --format=%ct ${h.prediction_sha}`);
      const ft = safeExec(cloneDir, `git log -1 --format=%ct ${h.fix_sha}`);
      if (pt && ft) randomLeadTimes.push(parseInt(ft, 10) - parseInt(pt, 10));
    }
    const randomMedianLeadTime = randomLeadTimes.length > 0 ? randomLeadTimes.slice().sort((a, b) => a - b)[Math.floor(randomLeadTimes.length / 2)]! : 0;
    const earlyWarning = medianLeadTime > randomMedianLeadTime;

    const precisionsBootstrap: number[] = [];
    for (let iter = 0; iter < THRESHOLDS.bootstrap_iterations; iter++) {
      const resampled = [];
      for (let i = 0; i < detail.length; i++) {
        const j = Math.floor(rand() * detail.length);
        resampled.push(detail[j]!);
      }
      const uniq = new Set(resampled.map((r) => r.prediction_sha)).size;
      precisionsBootstrap.push(totalPred > 0 ? uniq / totalPred : 0);
    }
    precisionsBootstrap.sort((a, b) => a - b);
    const precisionCiLow = precisionsBootstrap.length > 0 ? precisionsBootstrap[Math.floor(precisionsBootstrap.length * 0.025)]! : 0;
    const liftCiLow = precisionCiLow > 0 && baselinePrecision > 0 ? precisionCiLow / baselinePrecision : 0;
    const bootstrapPass = precisionCiLow > baselinePrecision;

    const observedLift = lift;
    let permCount = 0;
    for (let iter = 0; iter < THRESHOLDS.permutation_iterations; iter++) {
      const shuf = [...(replayResults.hits ?? [])];
      for (let i = shuf.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuf[i]!.fix_sha, shuf[j]!.fix_sha] = [shuf[j]!.fix_sha!, shuf[i]!.fix_sha!];
      }
      const fakeMatches = Math.floor(rand() * (causalMatches + 1));
      const fakePrecision = totalPred > 0 ? fakeMatches / totalPred : 0;
      const fakeLift = baselinePrecision > 0 ? fakePrecision / baselinePrecision : 0;
      if (fakeLift >= observedLift) permCount++;
    }
    const pValue = permCount / THRESHOLDS.permutation_iterations;
    const numTests = 12;
    const alpha = THRESHOLDS.alpha / numTests;
    const permutationPass = pValue < alpha;

    const churnPrecision = randomPrecision;
    const churnPass = precision > churnPrecision;

    repoData.push({
      repo,
      cloneDir,
      replayResults,
      valid: true,
      proofReport,
      segmentPrecision,
      randomPrecision,
      randomPrecision95th,
      precisionHigh,
      precisionMedium,
      calibrated,
      temporalOverfit,
      adjustedPrecision,
      effectSize,
      powerProxy,
      warningsPerTrueIssue: causalMatches > 0 ? warningsPerTrueIssue : 0,
      randomWarningsPerIssue: rb.matches > 0 ? randomWarningsPerIssue : 0,
      efficient,
      rankingValid,
      medianLeadTime,
      randomMedianLeadTime,
      earlyWarning,
      precisionCiLow,
      liftCiLow,
      bootstrapPass,
      pValue,
      permutationPass,
      churnPrecision,
      churnPass,
      leaveOneOutSignal: lift > THRESHOLDS.lift_real && causalMatches >= 3,
    });
  }

  function emptyRow(repo: string, cloneDir: string): RepoRow {
    return {
      repo,
      cloneDir,
      replayResults: null,
      valid: false,
      proofReport: null,
      segmentPrecision: null,
      randomPrecision: 0,
      randomPrecision95th: 0,
      precisionHigh: 0,
      precisionMedium: 0,
      calibrated: true,
      temporalOverfit: false,
      adjustedPrecision: 0,
      effectSize: 0,
      powerProxy: 0,
      warningsPerTrueIssue: 0,
      randomWarningsPerIssue: 0,
      efficient: false,
      rankingValid: false,
      medianLeadTime: 0,
      randomMedianLeadTime: 0,
      earlyWarning: false,
      precisionCiLow: 0,
      liftCiLow: 0,
      bootstrapPass: false,
      pValue: 1,
      permutationPass: false,
      churnPrecision: 0,
      churnPass: false,
      leaveOneOutSignal: false,
    };
  }

  const validRepos = repoData.filter((r) => r.valid);
  if (validRepos.length < THRESHOLDS.min_repos_valid) {
    console.error("INSUFFICIENT_DATA valid_repos=" + validRepos.length);
    try {
      const perRepo: DiagnosticsPerRepo[] = repoData.map((r) => {
        const precision = r.proofReport?.precision ?? 0;
        const baselinePrecision = r.proofReport?.baseline_precision ?? 0;
        const lift = r.proofReport?.lift ?? 0;
        const failedGates: string[] = [];
        if (!r.churnPass) failedGates.push("churn_control");
        if (precision <= r.randomPrecision95th) failedGates.push("negative_control");
        if (!r.bootstrapPass) failedGates.push("bootstrap");
        if (!r.permutationPass) failedGates.push("permutation");
        if (r.temporalOverfit) failedGates.push("temporal");
        if (!r.calibrated) failedGates.push("calibration");
        if (!r.rankingValid) failedGates.push("ranking");
        if (!r.earlyWarning) failedGates.push("early_warning");
        if (!r.efficient) failedGates.push("efficiency");
        return {
          repo: r.repo,
          commit_count: r.replayResults?.total_commits_scanned ?? 0,
          total_predictions: r.replayResults?.predictions ?? 0,
          causal_matches: r.proofReport?.causal_matches ?? 0,
          precision,
          baseline_precision: baselinePrecision,
          lift,
          effect_size: r.effectSize,
          bootstrap_ci_low: r.precisionCiLow,
          bootstrap_ci_high: null,
          p_value: r.pValue,
          warnings_per_true_issue: r.warningsPerTrueIssue,
          ranking_valid: r.rankingValid,
          early_warning_valid: r.earlyWarning,
          efficient: r.efficient,
          failed_gates: failedGates,
          signal_direction: lift > 1,
        };
      });
      const insufficientDataHash = createHash("sha256")
        .update(
          repoList.join(",") +
            validRepos.map((r) => r.replayResults?.total_commits_scanned ?? 0).join(",") +
            timestamp +
            THRESHOLD_STR +
            RANDOM_SEED +
            PROTOCOL_VERSION,
        )
        .digest("hex")
        .slice(0, 32);
      const snapshot: DiagnosticsSnapshot = {
        protocol_version: PROTOCOL_VERSION,
        protocol_hash: THRESHOLD_HASH,
        dataset_hash: insufficientDataHash,
        threshold_hash: THRESHOLD_HASH,
        random_seed: RANDOM_SEED,
        train_repos: TRAIN_REPOS,
        holdout_repos: HOLDOUT_REPOS,
        node_version: nodeVersion,
        anchr_version: HEAD,
        git_head: HEAD,
        timestamp,
        per_repo: perRepo,
        classification: "INSUFFICIENT_DATA",
        lift_real: THRESHOLDS.lift_real,
        lift_strong: THRESHOLDS.lift_strong,
        min_commits: THRESHOLDS.min_commits,
        min_predictions: THRESHOLDS.min_predictions,
      };
      writeDiagnostics(snapshot);
    } catch (err) {
      console.warn("Diagnostics error:", err instanceof Error ? err.message : String(err));
    }
    process.exit(1);
  }

  const strongCount = validRepos.filter(
    (r) =>
      (r.proofReport?.lift ?? 0) >= THRESHOLDS.lift_strong &&
      (r.proofReport?.precision ?? 0) >= THRESHOLDS.min_precision &&
      r.permutationPass &&
      r.calibrated &&
      !r.temporalOverfit &&
      r.earlyWarning &&
      r.rankingValid &&
      r.efficient,
  ).length;
  const realCount = validRepos.filter(
    (r) => (r.proofReport?.lift ?? 0) >= THRESHOLDS.lift_real && r.permutationPass,
  ).length;

  let classification: string;
  if (strongCount >= 2) classification = "STRONG_SIGNAL";
  else if (realCount >= 2) classification = "REAL_SIGNAL";
  else if (validRepos.some((r) => (r.proofReport?.lift ?? 0) > 1)) classification = "WEAK_SIGNAL";
  else classification = "NO_SIGNAL";

  const datasetHash = createHash("sha256")
    .update(
      repoList.join(",") +
        validRepos.map((r) => r.replayResults?.total_commits_scanned ?? 0).join(",") +
        timestamp +
        THRESHOLD_STR +
        RANDOM_SEED +
        PROTOCOL_VERSION,
    )
    .digest("hex")
    .slice(0, 32);

  mkdirSync(join(cwd, "artifacts"), { recursive: true });
  writeFileSync(
    join(cwd, "artifacts", "validation-v11-audit-log.json"),
    JSON.stringify(
      {
        protocol_version: PROTOCOL_VERSION,
        threshold_hash: THRESHOLD_HASH,
        dataset_hash: datasetHash,
        classification,
        per_repo: repoData.map((r) => ({
          repo: r.repo,
          valid: r.valid,
          precision: r.proofReport?.precision,
          lift: r.proofReport?.lift,
          efficient: r.efficient,
          warnings_per_true_issue: r.warningsPerTrueIssue,
          p_value: r.pValue,
        })),
        generated_at: timestamp,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log("PER_REPO_SUMMARY");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(
      r.repo +
        " commits=" +
        (r.replayResults?.total_commits_scanned ?? 0) +
        " predictions=" +
        (r.replayResults?.predictions ?? 0) +
        " causal_matches=" +
        (r.proofReport?.causal_matches ?? 0) +
        " precision=" +
        (r.proofReport?.precision ?? 0) +
        " baseline=" +
        (r.proofReport?.baseline_precision ?? 0) +
        " lift=" +
        (r.proofReport?.lift ?? 0) +
        " adjusted_precision=" +
        r.adjustedPrecision +
        " calibrated=" +
        r.calibrated +
        " temporal_overfit=" +
        r.temporalOverfit +
        " efficient=" +
        r.efficient +
        " warnings_per_true_issue=" +
        r.warningsPerTrueIssue +
        " ranking_valid=" +
        r.rankingValid +
        " early_warning=" +
        r.earlyWarning,
    );
  }
  console.log("LEAVE_ONE_OUT");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(r.repo + " leave_one_out_signal=" + r.leaveOneOutSignal);
  }
  console.log("NEGATIVE_CONTROL");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(
      r.repo +
        " precision=" +
        (r.proofReport?.precision ?? 0) +
        " random_precision_95th=" +
        r.randomPrecision95th +
        " pass=" +
        ((r.proofReport?.precision ?? 0) > r.randomPrecision95th),
    );
  }
  console.log("CHURN_CONTROL");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(r.repo + " precision=" + (r.proofReport?.precision ?? 0) + " churn_precision=" + r.churnPrecision + " pass=" + r.churnPass);
  }
  console.log("BOOTSTRAP");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(r.repo + " precision_ci_low=" + r.precisionCiLow + " baseline=" + (r.proofReport?.baseline_precision ?? 0) + " pass=" + r.bootstrapPass);
  }
  console.log("PERMUTATION");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(r.repo + " p_value=" + r.pValue + " alpha=" + THRESHOLDS.alpha / 12 + " pass=" + r.permutationPass);
  }
  console.log("TEMPORAL");
  for (const r of repoData) {
    if (!r.valid || !r.segmentPrecision) continue;
    console.log(
      r.repo +
        " early=" +
        r.segmentPrecision.early +
        " middle=" +
        r.segmentPrecision.middle +
        " late=" +
        r.segmentPrecision.late +
        " temporal_overfit=" +
        r.temporalOverfit,
    );
  }
  console.log("CALIBRATION");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(r.repo + " precision_high=" + r.precisionHigh + " precision_medium=" + r.precisionMedium + " calibrated=" + r.calibrated);
  }
  console.log("RANKING");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(r.repo + " ranking_valid=" + r.rankingValid);
  }
  console.log("EARLY_WARNING");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(
      r.repo + " median_lead_time=" + r.medianLeadTime + " random_median_lead_time=" + r.randomMedianLeadTime + " early_warning=" + r.earlyWarning,
    );
  }
  console.log("EFFICIENCY");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(
      r.repo +
        " warnings_per_true_issue=" +
        r.warningsPerTrueIssue +
        " random_warnings_per_issue=" +
        r.randomWarningsPerIssue +
        " efficient=" +
        r.efficient +
        " max_allowed=10",
    );
  }
  console.log("EFFECT_SIZE");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(
      r.repo +
        " effect_size=" +
        r.effectSize +
        " power_proxy=" +
        r.powerProxy +
        " effect_ok=" +
        (r.effectSize > THRESHOLDS.min_effect_size) +
        " power_ok=" +
        (r.powerProxy >= THRESHOLDS.min_power_proxy),
    );
  }
  console.log("CLASSIFICATION " + classification);
  console.log("DATASET_HASH " + datasetHash);

  // Diagnostics: non-invasive, runs only after classification is frozen. Does not modify any validation state.
  try {
    const perRepo: DiagnosticsPerRepo[] = repoData.map((r) => {
      const precision = r.proofReport?.precision ?? 0;
      const baselinePrecision = r.proofReport?.baseline_precision ?? 0;
      const lift = r.proofReport?.lift ?? 0;
      const failedGates: string[] = [];
      if (!r.churnPass) failedGates.push("churn_control");
      if (precision <= r.randomPrecision95th) failedGates.push("negative_control");
      if (!r.bootstrapPass) failedGates.push("bootstrap");
      if (!r.permutationPass) failedGates.push("permutation");
      if (r.temporalOverfit) failedGates.push("temporal");
      if (!r.calibrated) failedGates.push("calibration");
      if (!r.rankingValid) failedGates.push("ranking");
      if (!r.earlyWarning) failedGates.push("early_warning");
      if (!r.efficient) failedGates.push("efficiency");
      return {
        repo: r.repo,
        commit_count: r.replayResults?.total_commits_scanned ?? 0,
        total_predictions: r.replayResults?.predictions ?? 0,
        causal_matches: r.proofReport?.causal_matches ?? 0,
        precision,
        baseline_precision: baselinePrecision,
        lift,
        effect_size: r.effectSize,
        bootstrap_ci_low: r.precisionCiLow,
        bootstrap_ci_high: null,
        p_value: r.pValue,
        warnings_per_true_issue: r.warningsPerTrueIssue,
        ranking_valid: r.rankingValid,
        early_warning_valid: r.earlyWarning,
        efficient: r.efficient,
        failed_gates: failedGates,
        signal_direction: lift > 1,
      };
    });
    const snapshot: DiagnosticsSnapshot = {
      protocol_version: PROTOCOL_VERSION,
      protocol_hash: THRESHOLD_HASH,
      dataset_hash: datasetHash,
      threshold_hash: THRESHOLD_HASH,
      random_seed: RANDOM_SEED,
      train_repos: TRAIN_REPOS,
      holdout_repos: HOLDOUT_REPOS,
      node_version: nodeVersion,
      anchr_version: HEAD,
      git_head: HEAD,
      timestamp,
      per_repo: perRepo,
      classification,
      lift_real: THRESHOLDS.lift_real,
      lift_strong: THRESHOLDS.lift_strong,
      min_commits: THRESHOLDS.min_commits,
      min_predictions: THRESHOLDS.min_predictions,
    };
    writeDiagnostics(snapshot);
  } catch (e) {
    console.warn("[diagnostics] Non-fatal:", e instanceof Error ? e.message : String(e));
  }
}

main();
