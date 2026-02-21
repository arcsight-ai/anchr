/**
 * Non-invasive diagnostics layer for validation.
 * Runs ONLY after classification is finalized. Does not modify any validation state or decision.
 */

import { createHash } from "crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANCHR_ROOT = join(__dirname, "..");
const DIAGNOSTICS_DIR = join(ANCHR_ROOT, "artifacts", "diagnostics");
const BENCHMARK_HISTORY_PATH = join(ANCHR_ROOT, "artifacts", "benchmark-history.json");
const DIAGNOSTICS_VERSION = "1";
const EPSILON = 1e-6;
const ROLLING_WINDOW = 20;
const DRIFT_THRESHOLD = 0.15;
const ALPHA_FOR_REASON = 0.05 / 12;
const GATE_EVALUATION_ORDER = [
  "churn_control",
  "negative_control",
  "bootstrap",
  "permutation",
  "temporal",
  "calibration",
  "ranking",
  "early_warning",
  "efficiency",
];
const PREDICTION_DENSITY_SPARSE = 0.01;
const MATCH_RATE_LOW = 0.05;
const HIGH_VARIANCE_CV_THRESHOLD = 1.5;
const WEAK_STAT_POWER_MIN_REPOS = 2;

export interface DiagnosticsPerRepo {
  repo: string;
  commit_count: number;
  total_predictions: number;
  causal_matches: number;
  precision: number;
  baseline_precision: number;
  lift: number;
  effect_size: number;
  bootstrap_ci_low: number;
  bootstrap_ci_high: number | null;
  p_value: number;
  warnings_per_true_issue: number;
  ranking_valid: boolean;
  early_warning_valid: boolean;
  efficient: boolean;
  failed_gates: string[];
  signal_direction: boolean;
}

export interface DiagnosticsSnapshot {
  protocol_version: string;
  protocol_hash: string;
  dataset_hash: string;
  threshold_hash: string;
  random_seed: number;
  train_repos: string[];
  holdout_repos: string[];
  node_version: string;
  anchr_version: string;
  git_head: string;
  timestamp: string;
  per_repo: DiagnosticsPerRepo[];
  classification: string;
  /** Read-only pass-through for observational use only (signal_strength_bucket, eligibility funnel). */
  lift_real?: number;
  lift_strong?: number;
  min_commits?: number;
  min_predictions?: number;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function signalStrengthBucket(
  lift: number,
  liftReal: number | undefined,
  liftStrong: number | undefined,
): "NONE" | "NEGATIVE" | "WEAK" | "REAL" | "STRONG" {
  const real = liftReal ?? 1.2;
  const strong = liftStrong ?? 1.3;
  if (lift < 1) return "NEGATIVE";
  if (lift < real) return "WEAK";
  if (lift < strong) return "REAL";
  return "STRONG";
}

export function writeDiagnostics(snapshot: DiagnosticsSnapshot): void {
  try {
    const runHashInput = snapshot.dataset_hash + snapshot.threshold_hash + String(snapshot.random_seed);
    const run_hash = createHash("sha256").update(runHashInput).digest("hex").slice(0, 16);

    const minCommits = snapshot.min_commits ?? 30;
    const minPredictions = snapshot.min_predictions ?? 15;
    const liftReal = snapshot.lift_real;
    const liftStrong = snapshot.lift_strong;

    const perRepoEnriched = snapshot.per_repo.map((r) => {
      const commitCount = r.commit_count || 1;
      const totalPred = r.total_predictions || 0;
      const prediction_density = totalPred / commitCount;
      const match_rate = totalPred > 0 ? r.causal_matches / totalPred : 0;
      const first_failed_gate =
        GATE_EVALUATION_ORDER.find((g) => r.failed_gates.includes(g)) ?? null;
      const liftVal = r.lift;
      const signal_strength_bucket: "NONE" | "NEGATIVE" | "WEAK" | "REAL" | "STRONG" =
        liftVal == null || (typeof liftVal === "number" && Number.isNaN(liftVal))
          ? "NONE"
          : signalStrengthBucket(liftVal, liftReal, liftStrong);
      return {
        ...r,
        prediction_density,
        match_rate,
        first_failed_gate,
        signal_strength_bucket,
      };
    });

    const valid = snapshot.per_repo.filter((r) => r.lift != null && r.precision != null);
    const validReposCount = valid.length;
    const reposTotal = snapshot.per_repo.length;

    const repos_with_enough_commits = snapshot.per_repo.filter((r) => r.commit_count >= minCommits).length;
    const repos_with_enough_predictions = snapshot.per_repo.filter((r) => r.total_predictions >= minPredictions).length;
    const repos_with_enough_matches = snapshot.per_repo.filter((r) => r.causal_matches >= 1).length;
    const repos_stat_significant = snapshot.per_repo.filter((r) => r.p_value < ALPHA_FOR_REASON).length;
    const repos_passing_all_gates = snapshot.per_repo.filter((r) => r.failed_gates.length === 0).length;

    const lifts = valid.map((r) => r.lift);
    const precisions = valid.map((r) => r.precision);
    const efficiencies = valid.map((r) => (r.efficient ? 1 : 0));
    const medianLift = lifts.length > 0 ? median(lifts) : 0;
    const meanLift = lifts.length > 0 ? mean(lifts) : 0;
    const stdLift = lifts.length > 0 ? std(lifts) : 0;
    const medianPrecision = precisions.length > 0 ? median(precisions) : 0;
    const medianEfficiency = efficiencies.length > 0 ? median(efficiencies) : 0;
    const positiveRepoFraction = valid.length > 0 ? valid.filter((r) => r.lift > 1).length / valid.length : 0;

    const positive_lift_count = valid.filter((r) => r.lift > 1).length;
    const negative_lift_count = valid.filter((r) => r.lift < 1).length;
    const zero_or_null_lift_count = snapshot.per_repo.filter(
      (r) => r.lift == null || r.lift === 0 || Number.isNaN(r.lift),
    ).length;
    const lift_std_to_median_ratio =
      stdLift / Math.max(Math.abs(medianLift), EPSILON);
    const prediction_densities = snapshot.per_repo
      .filter((r) => r.commit_count > 0)
      .map((r) => r.total_predictions / r.commit_count);
    const prediction_density_median = prediction_densities.length > 0 ? median(prediction_densities) : 0;
    const match_rates = snapshot.per_repo
      .filter((r) => r.total_predictions > 0)
      .map((r) => r.causal_matches / r.total_predictions);
    const match_rate_median = match_rates.length > 0 ? median(match_rates) : 0;

    const consistencyScore = medianLift > EPSILON ? Math.max(0, 1 - stdLift / Math.max(medianLift, EPSILON)) : 0;
    const effectDirectionAgreement = positiveRepoFraction;

    const structural_signal_score =
      (medianLift || 0) *
      (positiveRepoFraction || 0) *
      (repos_passing_all_gates / Math.max(reposTotal, 1));

    const gateFailureCounts = {
      churn_control: valid.filter((r) => r.failed_gates.includes("churn_control")).length,
      negative_control: valid.filter((r) => r.failed_gates.includes("negative_control")).length,
      bootstrap: valid.filter((r) => r.failed_gates.includes("bootstrap")).length,
      permutation: valid.filter((r) => r.failed_gates.includes("permutation")).length,
      temporal: valid.filter((r) => r.failed_gates.includes("temporal")).length,
      calibration: valid.filter((r) => r.failed_gates.includes("calibration")).length,
      ranking: valid.filter((r) => r.failed_gates.includes("ranking")).length,
      early_warning: valid.filter((r) => r.failed_gates.includes("early_warning")).length,
      efficiency: valid.filter((r) => r.failed_gates.includes("efficiency")).length,
    };
    const reposTotalSafe = Math.max(reposTotal, 1);
    const gate_failure_rate = {
      churn_control: gateFailureCounts.churn_control / reposTotalSafe,
      negative_control: gateFailureCounts.negative_control / reposTotalSafe,
      bootstrap: gateFailureCounts.bootstrap / reposTotalSafe,
      permutation: gateFailureCounts.permutation / reposTotalSafe,
      temporal: gateFailureCounts.temporal / reposTotalSafe,
      calibration: gateFailureCounts.calibration / reposTotalSafe,
      ranking: gateFailureCounts.ranking / reposTotalSafe,
      early_warning: gateFailureCounts.early_warning / reposTotalSafe,
      efficiency: gateFailureCounts.efficiency / reposTotalSafe,
    };

    const commitCounts = snapshot.per_repo.map((r) => r.commit_count);
    const totalPredictionsArr = snapshot.per_repo.map((r) => r.total_predictions);
    const causalMatchesArr = snapshot.per_repo.map((r) => r.causal_matches);
    const median_commit_count = commitCounts.length > 0 ? median(commitCounts) : 0;
    const median_total_predictions = totalPredictionsArr.length > 0 ? median(totalPredictionsArr) : 0;
    const median_causal_matches = causalMatchesArr.length > 0 ? median(causalMatchesArr) : 0;
    const prediction_to_match_ratio_median =
      median_total_predictions / Math.max(median_causal_matches, 1);

    const repos_with_any_predictions = snapshot.per_repo.filter((r) => r.total_predictions > 0).length;
    const repos_with_any_matches = snapshot.per_repo.filter((r) => r.causal_matches > 0).length;
    const repos_with_lift_above_1 = valid.filter((r) => r.lift > 1).length;
    const repos_with_p_value_below_alpha = snapshot.per_repo.filter((r) => r.p_value < ALPHA_FOR_REASON).length;

    const lift_coefficient_of_variation =
      validReposCount === 0 || Math.abs(meanLift) < EPSILON
        ? null
        : stdLift / Math.max(Math.abs(meanLift), EPSILON);

    const data_sufficiency_score =
      (repos_with_enough_commits / reposTotalSafe) *
      (repos_with_enough_predictions / reposTotalSafe) *
      (repos_with_enough_matches / reposTotalSafe);

    const high_variance_flag =
      lift_coefficient_of_variation != null && lift_coefficient_of_variation > HIGH_VARIANCE_CV_THRESHOLD;
    const low_signal_agreement_flag = positiveRepoFraction < 0.5;
    const weak_stat_power_flag = repos_with_p_value_below_alpha < WEAK_STAT_POWER_MIN_REPOS;

    let primary_issue: string;
    if (reposTotal === 0 || repos_with_enough_commits === 0) {
      primary_issue = "NO_COMMITS";
    } else if (repos_with_enough_predictions === 0) {
      primary_issue = "PREDICTIONS_TOO_SPARSE";
    } else if (repos_with_enough_matches === 0) {
      primary_issue = "MATCHING_TOO_LOW";
    } else if (repos_with_p_value_below_alpha < WEAK_STAT_POWER_MIN_REPOS) {
      primary_issue = "NOT_STAT_SIGNIFICANT";
    } else if (
      lift_coefficient_of_variation != null &&
      lift_coefficient_of_variation > HIGH_VARIANCE_CV_THRESHOLD
    ) {
      primary_issue = "HIGH_VARIANCE_SIGNAL";
    } else if (repos_passing_all_gates < 2) {
      primary_issue = "GATE_REJECTION";
    } else {
      primary_issue = "PASS";
    }
    let confidence: "LOW" | "MEDIUM" | "HIGH";
    if (primary_issue === "PASS") {
      confidence =
        positiveRepoFraction >= 0.7 && repos_passing_all_gates >= 3 ? "HIGH" : repos_passing_all_gates >= 2 ? "MEDIUM" : "LOW";
    } else if (primary_issue === "NO_COMMITS" || primary_issue === "PREDICTIONS_TOO_SPARSE") {
      confidence = reposTotal > 0 ? "HIGH" : "MEDIUM";
    } else if (primary_issue === "NOT_STAT_SIGNIFICANT" && repos_with_p_value_below_alpha === 1) {
      confidence = "HIGH";
    } else if (primary_issue === "GATE_REJECTION" && repos_passing_all_gates === 0) {
      confidence = "HIGH";
    } else {
      confidence = "MEDIUM";
    }
    const diagnostic_summary = { primary_issue, confidence };

    let diagnostic_reason: string;
    if (validReposCount === 0) {
      diagnostic_reason = "INSUFFICIENT_DATA";
    } else if (positiveRepoFraction < 0.5) {
      diagnostic_reason = "INCONSISTENT_SIGNAL";
    } else if (medianLift <= 1.05) {
      diagnostic_reason = "NO_SIGNAL";
    } else if (valid.some((r) => r.p_value >= ALPHA_FOR_REASON)) {
      diagnostic_reason = "NOT_STAT_SIGNIFICANT";
    } else if (medianEfficiency < 0.5) {
      diagnostic_reason = "TOO_NOISY";
    } else {
      diagnostic_reason = "PASS";
    }

    let diagnostic_reason_detailed: string;
    if (validReposCount === 0 && reposTotal > 0 && repos_with_enough_commits === 0) {
      diagnostic_reason_detailed = "NO_REPOS_ELIGIBLE";
    } else if (validReposCount === 0 && repos_with_enough_commits > 0 && repos_with_enough_predictions === 0) {
      diagnostic_reason_detailed = "PREDICTIONS_TOO_SPARSE";
    } else if (validReposCount === 0) {
      diagnostic_reason_detailed = "NO_REPOS_ELIGIBLE";
    } else if (prediction_density_median < PREDICTION_DENSITY_SPARSE) {
      diagnostic_reason_detailed = "PREDICTIONS_TOO_SPARSE";
    } else if (match_rate_median < MATCH_RATE_LOW) {
      diagnostic_reason_detailed = "MATCH_RATE_TOO_LOW";
    } else if (valid.some((r) => r.p_value >= ALPHA_FOR_REASON)) {
      diagnostic_reason_detailed = "NOT_STAT_SIGNIFICANT";
    } else if (positiveRepoFraction < 0.5) {
      diagnostic_reason_detailed = "INCONSISTENT_SIGNAL";
    } else if (medianEfficiency < 0.5) {
      diagnostic_reason_detailed = "TOO_NOISY";
    } else {
      diagnostic_reason_detailed = "PASS";
    }

    let rollingMedianLiftLast20: number | null = null;
    let rollingPassRateLast20: number | null = null;
    let driftFlag = false;
    if (existsSync(BENCHMARK_HISTORY_PATH)) {
      try {
        const history = JSON.parse(readFileSync(BENCHMARK_HISTORY_PATH, "utf8")) as Array<{
          classification?: string;
          lift?: number | null;
        }>;
        const last20 = history.slice(-ROLLING_WINDOW);
        const withLift = last20.filter((e) => e.lift != null) as Array<{ lift: number; classification?: string }>;
        if (withLift.length > 0) {
          rollingMedianLiftLast20 = median(withLift.map((e) => e.lift));
        }
        if (last20.length > 0) {
          const passCount = last20.filter((e) => e.classification === "STRONG_SIGNAL" || e.classification === "REAL_SIGNAL").length;
          rollingPassRateLast20 = passCount / last20.length;
        }
        if (rollingMedianLiftLast20 != null && validReposCount > 0 && medianLift < rollingMedianLiftLast20 * (1 - DRIFT_THRESHOLD)) {
          driftFlag = true;
        }
      } catch {
        // ignore
      }
    }

    const out = {
      diagnostics_version: DIAGNOSTICS_VERSION,
      reproducibility_snapshot: {
        protocol_version: snapshot.protocol_version,
        protocol_hash: snapshot.protocol_hash,
        dataset_hash: snapshot.dataset_hash,
        threshold_hash: snapshot.threshold_hash,
        run_hash,
        random_seed: snapshot.random_seed,
        train_repos: snapshot.train_repos,
        holdout_repos: snapshot.holdout_repos,
        node_version: snapshot.node_version,
        anchr_version: snapshot.anchr_version,
        git_head: snapshot.git_head,
        timestamp: snapshot.timestamp,
      },
      per_repo_signal_metrics: perRepoEnriched,
      eligibility_funnel: {
        repos_total: reposTotal,
        repos_with_enough_commits,
        repos_with_enough_predictions,
        repos_with_enough_matches,
        repos_stat_significant,
        repos_passing_all_gates,
      },
      run_level_aggregates: {
        valid_repos_count: validReposCount,
        median_lift: medianLift,
        mean_lift: meanLift,
        std_lift: stdLift,
        median_precision: medianPrecision,
        median_efficiency: medianEfficiency,
        positive_repo_fraction: positiveRepoFraction,
        classification: snapshot.classification,
        structural_signal_score,
      },
      distribution_snapshot: {
        lift_distribution: lifts,
        precision_distribution: precisions,
        consistency_score: consistencyScore,
        effect_direction_agreement: effectDirectionAgreement,
        positive_lift_count,
        negative_lift_count,
        zero_or_null_lift_count,
        lift_std_to_median_ratio,
        prediction_density_median,
        match_rate_median,
        lift_coefficient_of_variation,
      },
      causal_density_diagnostics: {
        median_commit_count,
        median_total_predictions,
        median_causal_matches,
        prediction_to_match_ratio_median,
      },
      statistical_power_snapshot: {
        repos_with_any_predictions,
        repos_with_any_matches,
        repos_with_lift_above_1,
        repos_with_p_value_below_alpha,
      },
      gate_failure_summary: {
        gate_failure_counts: gateFailureCounts,
        gate_failure_rate,
      },
      data_sufficiency_score,
      diagnostic_summary,
      anomaly_flags: {
        high_variance_flag,
        low_signal_agreement_flag,
        weak_stat_power_flag,
      },
      diagnostic_reason,
      diagnostic_reason_detailed,
      drift_check: {
        rolling_median_lift_last_20: rollingMedianLiftLast20,
        rolling_pass_rate_last_20: rollingPassRateLast20,
        drift_flag: driftFlag,
      },
    };

    mkdirSync(DIAGNOSTICS_DIR, { recursive: true });
    const filename = `diagnostics-${snapshot.dataset_hash}-${snapshot.threshold_hash}-${run_hash}.json`;
    const filepath = join(DIAGNOSTICS_DIR, filename);
    writeFileSync(filepath, JSON.stringify(out, null, 2), "utf8");
  } catch (err) {
    console.warn("Diagnostics error:", err instanceof Error ? err.message : String(err));
  }
}
