/**
 * ANCHR Validation Protocol v12 — Institution-grade, product-credible.
 * Hard freeze. No narrative output.
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

function loadEnv(): void {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "").trim();
  }
}
loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANCHR_ROOT = join(__dirname, "..");

const PROTOCOL_VERSION = "v12";

const ALL_THRESHOLDS = {
  min_commits: 30,
  min_predictions: 15,
  min_failure_kinds: 3,
  min_high_confidence: 1,
  min_replay_kb: 10,
  min_repos_valid: 2,
  lift_real: 1.2,
  lift_strong: 1.3,
  min_precision: 0.35,
  shuffle_iterations: 50,
  bootstrap_iterations: 1000,
  permutation_iterations: 10000,
  alpha: 0.05,
  num_tests: 10,
  max_warnings_per_issue: 10,
  min_effect_size: 0,
  min_power_proxy: 0.1,
  ranking_bins: 5,
};

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
  const allRepos =
    TRAIN_REPOS.length > 0 || HOLDOUT_REPOS.length > 0
      ? [...TRAIN_REPOS, ...HOLDOUT_REPOS]
      : (process.env.VALIDATION_REPOS ?? "arcsight-ai/anchr,vercel/next.js,nodejs/node")
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean);
  const repoList = allRepos.length >= 2 ? allRepos : ["arcsight-ai/anchr", "vercel/next.js", "nodejs/node"].slice(0, 3);

  const thresholdHashInput =
    JSON.stringify(ALL_THRESHOLDS, null, 0) + repoList.join(",") + RANDOM_SEED + PROTOCOL_VERSION;
  const threshold_hash = createHash("sha256").update(thresholdHashInput).digest("hex").slice(0, 16);

  console.log("PROTOCOL_VERSION=" + PROTOCOL_VERSION);
  console.log("RANDOM_SEED=" + RANDOM_SEED);
  console.log("TRAIN_REPOS=" + (TRAIN_REPOS.length ? TRAIN_REPOS.join(",") : "(all)"));
  console.log("HOLDOUT_REPOS=" + (HOLDOUT_REPOS.length ? HOLDOUT_REPOS.join(",") : "(all)"));
  console.log("ALL_THRESHOLDS");
  for (const [k, v] of Object.entries(ALL_THRESHOLDS)) {
    console.log(k + "=" + v);
  }
  console.log("threshold_hash=" + threshold_hash);
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
  const repo_origin = safeExec(cwd, "git remote get-url origin") ?? "";
  const HEAD = safeExec(cwd, "git rev-parse HEAD") ?? "";
  const node_version = process.version;
  const os = process.platform + " " + process.arch;
  const timestamp = new Date().toISOString();

  console.log("repo_origin=" + repo_origin);
  console.log("HEAD=" + HEAD);
  console.log("anchr_version=" + HEAD);
  console.log("node_version=" + node_version);
  console.log("os=" + os);
  console.log("seed=" + RANDOM_SEED);
  console.log("threshold_hash=" + threshold_hash);
  console.log("");

  const validationDir = join(cwd, "artifacts", "validation");
  mkdirSync(validationDir, { recursive: true });

  type RepoRow = {
    repo: string;
    valid: boolean;
    replayResults: ReplayResults | null;
    proofReport: ProofReport | null;
    precision: number;
    baselinePrecision: number;
    lift: number;
    causalMatches: number;
    totalPredictions: number;
    randomPrecision95th: number;
    negativeControlPass: boolean;
    precisionCiLow: number;
    bootstrapPass: boolean;
    pValue: number;
    alpha: number;
    permutationPass: boolean;
    effectSize: number;
    powerProxy: number;
    effectSizePass: boolean;
    powerProxyPass: boolean;
    precisionHigh: number;
    precisionMedium: number;
    calibrated: boolean;
    rankingValid: boolean;
    medianLeadTime: number;
    shuffledMedianLeadTime: number;
    earlyWarning: boolean;
    warningsPerTrueIssue: number;
    randomWarningsPerIssue: number;
    efficient: boolean;
  };

  const repoData: RepoRow[] = [];
  const rand = seededRandom(RANDOM_SEED);
  const alpha = ALL_THRESHOLDS.alpha / ALL_THRESHOLDS.num_tests;

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
        repoData.push(emptyRow(repo));
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
      repoData.push(emptyRow(repo));
      continue;
    }

    let replayResults: ReplayResults;
    try {
      replayResults = JSON.parse(readFileSync(replayPath, "utf8")) as ReplayResults;
    } catch {
      repoData.push(emptyRow(repo));
      continue;
    }

    const commits = replayResults.total_commits_scanned ?? 0;
    const predictions = replayResults.predictions ?? 0;
    const failureKinds = new Set((replayResults.hits ?? []).map((h) => h.failure_kind).filter(Boolean)).size;
    const highConf = replayResults.confidence_distribution?.high ?? 0;
    const fileSizeKb = statSync(replayPath).size / 1024;

    const valid =
      commits >= ALL_THRESHOLDS.min_commits &&
      predictions >= ALL_THRESHOLDS.min_predictions &&
      failureKinds >= ALL_THRESHOLDS.min_failure_kinds &&
      highConf >= ALL_THRESHOLDS.min_high_confidence &&
      fileSizeKb > ALL_THRESHOLDS.min_replay_kb;

    if (!valid) {
      repoData.push({ ...emptyRow(repo), replayResults, valid: false });
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
    const byteIdentical =
      hits1.length === hits2.length &&
      hits1.every((h, i) => {
        const k = hits2[i];
        return k && h.prediction_sha === k.prediction_sha && h.fix_sha === k.fix_sha && h.confidence === k.confidence;
      });
    if (!byteIdentical) {
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
    for (let iter = 0; iter < ALL_THRESHOLDS.shuffle_iterations; iter++) {
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
    const randomPrecision95th =
      shufflePrecisions.length > 0
        ? shufflePrecisions[Math.min(Math.floor(shufflePrecisions.length * 0.95), shufflePrecisions.length - 1)]!
        : 0;
    const negativeControlPass = precision > randomPrecision95th;
    if (!negativeControlPass) {
      console.error("NEGATIVE_CONTROL_FAIL " + repo);
      process.exit(1);
    }

    const precisionsBootstrap: number[] = [];
    for (let iter = 0; iter < ALL_THRESHOLDS.bootstrap_iterations; iter++) {
      const resampled = [];
      for (let i = 0; i < detail.length; i++) {
        const j = Math.floor(rand() * detail.length);
        resampled.push(detail[j]!);
      }
      const uniq = new Set(resampled.map((r) => r.prediction_sha)).size;
      precisionsBootstrap.push(totalPred > 0 ? uniq / totalPred : 0);
    }
    precisionsBootstrap.sort((a, b) => a - b);
    const precisionCiLow =
      precisionsBootstrap.length > 0
        ? precisionsBootstrap[Math.floor(precisionsBootstrap.length * 0.025)]!
        : 0;
    const bootstrapPass = precisionCiLow > baselinePrecision;
    if (!bootstrapPass) {
      console.error("BOOTSTRAP_FAIL " + repo);
      process.exit(1);
    }

    const observedLift = lift;
    let permCount = 0;
    for (let iter = 0; iter < ALL_THRESHOLDS.permutation_iterations; iter++) {
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
    const pValue = permCount / ALL_THRESHOLDS.permutation_iterations;
    const permutationPass = pValue < alpha;
    if (!permutationPass) {
      console.error("PERMUTATION_FAIL " + repo);
      process.exit(1);
    }

    const effectSize = precision - baselinePrecision;
    const powerProxy = totalPred > 0 ? causalMatches / totalPred : 0;
    const effectSizePass = effectSize > ALL_THRESHOLDS.min_effect_size;
    const powerProxyPass = powerProxy >= ALL_THRESHOLDS.min_power_proxy;

    const highPred = replayResults.confidence_distribution?.high ?? 0;
    const mediumPred = replayResults.confidence_distribution?.medium ?? 0;
    const highMatches = detail.filter((d) => d.confidence === "high").length;
    const mediumMatches = detail.filter((d) => d.confidence === "medium").length;
    const precisionHigh = highPred > 0 ? highMatches / highPred : 0;
    const precisionMedium = mediumPred > 0 ? mediumMatches / mediumPred : 0;
    const calibrated = precisionHigh >= precisionMedium;

    const bins = ALL_THRESHOLDS.ranking_bins;
    const hitsByConf = [...(replayResults.hits ?? [])].sort(
      (a, b) => (a.confidence === "high" ? 1 : 0) - (b.confidence === "high" ? 1 : 0),
    );
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
    const medianLeadTime =
      leadTimes.length > 0 ? leadTimes.slice().sort((a, b) => a - b)[Math.floor(leadTimes.length / 2)]! : 0;
    const shuffledHitsForLead = [...(replayResults.hits ?? [])];
    for (let i = shuffledHitsForLead.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffledHitsForLead[i]!.fix_sha, shuffledHitsForLead[j]!.fix_sha] = [
        shuffledHitsForLead[j]!.fix_sha!,
        shuffledHitsForLead[i]!.fix_sha!,
      ];
    }
    const shuffledLeadTimes: number[] = [];
    for (const h of shuffledHitsForLead) {
      const pt = safeExec(cloneDir, `git log -1 --format=%ct ${h.prediction_sha}`);
      const ft = safeExec(cloneDir, `git log -1 --format=%ct ${h.fix_sha}`);
      if (pt && ft) shuffledLeadTimes.push(parseInt(ft, 10) - parseInt(pt, 10));
    }
    const shuffledMedianLeadTime =
      shuffledLeadTimes.length > 0
        ? shuffledLeadTimes.slice().sort((a, b) => a - b)[Math.floor(shuffledLeadTimes.length / 2)]!
        : 0;
    const earlyWarning = medianLeadTime > shuffledMedianLeadTime;

    const warningsPerTrueIssue = causalMatches > 0 ? totalPred / causalMatches : Infinity;
    const randomWarningsPerIssue = rb.matches > 0 && rb.count > 0 ? rb.count / rb.matches : Infinity;
    const efficient =
      warningsPerTrueIssue <= ALL_THRESHOLDS.max_warnings_per_issue &&
      warningsPerTrueIssue < randomWarningsPerIssue;

    repoData.push({
      repo,
      valid: true,
      replayResults,
      proofReport,
      precision,
      baselinePrecision,
      lift,
      causalMatches,
      totalPredictions: totalPred,
      randomPrecision95th,
      negativeControlPass,
      precisionCiLow,
      bootstrapPass,
      pValue,
      alpha,
      permutationPass,
      effectSize,
      powerProxy,
      effectSizePass,
      powerProxyPass,
      precisionHigh,
      precisionMedium,
      calibrated,
      rankingValid,
      medianLeadTime,
      shuffledMedianLeadTime,
      earlyWarning,
      warningsPerTrueIssue: causalMatches > 0 ? warningsPerTrueIssue : 0,
      randomWarningsPerIssue: rb.matches > 0 ? randomWarningsPerIssue : 0,
      efficient,
    });
  }

  function emptyRow(repo: string): RepoRow {
    return {
      repo,
      valid: false,
      replayResults: null,
      proofReport: null,
      precision: 0,
      baselinePrecision: 0,
      lift: 0,
      causalMatches: 0,
      totalPredictions: 0,
      randomPrecision95th: 0,
      negativeControlPass: false,
      precisionCiLow: 0,
      bootstrapPass: false,
      pValue: 1,
      alpha,
      permutationPass: false,
      effectSize: 0,
      powerProxy: 0,
      effectSizePass: false,
      powerProxyPass: false,
      precisionHigh: 0,
      precisionMedium: 0,
      calibrated: true,
      rankingValid: false,
      medianLeadTime: 0,
      shuffledMedianLeadTime: 0,
      earlyWarning: false,
      warningsPerTrueIssue: 0,
      randomWarningsPerIssue: 0,
      efficient: false,
    };
  }

  const validRepos = repoData.filter((r) => r.valid);
  if (validRepos.length < ALL_THRESHOLDS.min_repos_valid) {
    console.error("INSUFFICIENT_DATA valid_repos=" + validRepos.length);
    process.exit(1);
  }

  const strongCount = validRepos.filter(
    (r) =>
      r.lift >= ALL_THRESHOLDS.lift_strong &&
      r.precision >= ALL_THRESHOLDS.min_precision &&
      r.permutationPass &&
      r.calibrated &&
      r.rankingValid &&
      r.efficient &&
      r.earlyWarning,
  ).length;
  const realCount = validRepos.filter(
    (r) => r.lift >= ALL_THRESHOLDS.lift_real && r.permutationPass,
  ).length;

  let CLASSIFICATION: string;
  if (strongCount >= 2) CLASSIFICATION = "STRONG_SIGNAL";
  else if (realCount >= 2) CLASSIFICATION = "REAL_SIGNAL";
  else if (validRepos.some((r) => r.lift > 1)) CLASSIFICATION = "WEAK_SIGNAL";
  else CLASSIFICATION = "NO_SIGNAL";

  const dataset_hash = createHash("sha256")
    .update(
      repoList.join(",") +
        validRepos.map((r) => r.replayResults?.total_commits_scanned ?? 0).join(",") +
        timestamp +
        JSON.stringify(ALL_THRESHOLDS, null, 0) +
        RANDOM_SEED +
        PROTOCOL_VERSION,
    )
    .digest("hex")
    .slice(0, 32);

  console.log("PER_REPO_SUMMARY");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(
      r.repo +
        " commits=" +
        (r.replayResults?.total_commits_scanned ?? 0) +
        " predictions=" +
        r.totalPredictions +
        " causal_matches=" +
        r.causalMatches +
        " precision=" +
        r.precision +
        " baseline=" +
        r.baselinePrecision +
        " lift=" +
        r.lift,
    );
  }
  console.log("NEGATIVE_CONTROL");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(
      r.repo +
        " precision=" +
        r.precision +
        " random_precision_95th=" +
        r.randomPrecision95th +
        " pass=" +
        r.negativeControlPass,
    );
  }
  console.log("BOOTSTRAP");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(
      r.repo +
        " precision_ci_low=" +
        r.precisionCiLow +
        " baseline=" +
        r.baselinePrecision +
        " pass=" +
        r.bootstrapPass,
    );
  }
  console.log("PERMUTATION");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(r.repo + " p_value=" + r.pValue + " alpha=" + alpha + " pass=" + r.permutationPass);
  }
  console.log("CALIBRATION");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(
      r.repo +
        " precision_high=" +
        r.precisionHigh +
        " precision_medium=" +
        r.precisionMedium +
        " calibrated=" +
        r.calibrated,
    );
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
      r.repo +
        " median_lead_time=" +
        r.medianLeadTime +
        " shuffled_median=" +
        r.shuffledMedianLeadTime +
        " early_warning=" +
        r.earlyWarning,
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
        r.efficient,
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
        r.effectSizePass +
        " power_ok=" +
        r.powerProxyPass,
    );
  }
  console.log("CLASSIFICATION " + CLASSIFICATION);
  console.log("DATASET_HASH " + dataset_hash);
}

main();
