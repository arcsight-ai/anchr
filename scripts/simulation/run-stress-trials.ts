/**
 * Runnable institutional stress test: multi-agent, multi-step, stochastic trials.
 * Deterministic given seed (seeded PRNG). Produces time series for protocol Steps 3–5.
 * Does not modify ANCHR or any product code.
 */

const STEPS = 300;
const BURN_IN_FRAC = 0.3;
const BASE_RUNS = 7;
const N_AGENTS = 9; // Survival v5 archetypes
const SHOCK_AT_STEP = 150;
const REBELLION_FRAC = 0.2; // 20% permanently non-compliant
const HYSTERESIS_STEPS = 100; // continue after ANCHR removed

type Condition = "CONTROL" | "WEAK" | "SHOCK" | "REBELLION";

// Seeded PRNG (mulberry32) — deterministic for reproducibility
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TrialConfig {
  condition: Condition;
  runId: number;
  seed: number;
  anchrStrength: number; // 0 = off, 1 = full
  shockAfterStep: number;
  rebellionFrac: number;
}

interface StepSnapshot {
  t: number;
  override_rate: number;
  trust: number;
  adoption: number;
  compliance: number;
}

interface AgentState {
  trust: Float64Array;
  complianceTendency: Float64Array;
}

function runTrial(config: TrialConfig): { series: StepSnapshot[]; finalState: AgentState } {
  const rng = mulberry32(config.seed);
  const series: StepSnapshot[] = [];

  const trust = new Float64Array(N_AGENTS);
  const complianceTendency = new Float64Array(N_AGENTS);
  const isRebel = new Uint8Array(N_AGENTS);

  for (let i = 0; i < N_AGENTS; i++) {
    trust[i] = 0.3 + 0.4 * rng();
    complianceTendency[i] = 0.2 + 0.6 * rng();
    isRebel[i] = config.condition === "REBELLION" && i < Math.ceil(N_AGENTS * config.rebellionFrac) ? 1 : 0;
  }

  let anchrStrength = config.anchrStrength;
  if (config.condition === "WEAK") anchrStrength *= 0.35;

  for (let t = 0; t < STEPS; t++) {
    if (config.condition === "SHOCK" && t >= config.shockAfterStep) {
      anchrStrength *= 0.5;
    }

    let overrides = 0;
    let complianceSum = 0;
    let trustSum = 0;
    let adoptionSum = 0;

    for (let i = 0; i < N_AGENTS; i++) {
      const pressure = 0.4 + 0.4 * rng();
      const effectiveStrength = anchrStrength * trust[i];
      let comply: number;
      if (isRebel[i]) {
        comply = 0.1 + 0.2 * rng();
      } else {
        comply = 0.2 + 0.6 * effectiveStrength + 0.2 * complianceTendency[i] - 0.2 * pressure;
      }
      comply = Math.max(0, Math.min(1, comply));
      const override = comply < 0.5 ? 1 : 0;
      overrides += override;
      complianceSum += 1 - override;
      trustSum += trust[i];
      adoptionSum += anchrStrength > 0 ? 1 : 0;

      if (override && effectiveStrength > 0.2) {
        trust[i] *= 0.98;
      } else if (!override && effectiveStrength > 0.1) {
        trust[i] = Math.min(1, trust[i] * 1.01);
      }
    }

    series.push({
      t,
      override_rate: overrides / N_AGENTS,
      trust: trustSum / N_AGENTS,
      adoption: adoptionSum / N_AGENTS,
      compliance: complianceSum / N_AGENTS,
    });
  }

  const finalTrust = new Float64Array(trust);
  const finalTendency = new Float64Array(complianceTendency);
  return { series, finalState: { trust: finalTrust, complianceTendency: finalTendency } };
}

function runHysteresisPhase(seed: number, state: AgentState): StepSnapshot[] {
  const rng = mulberry32(seed + 99999);
  const series: StepSnapshot[] = [];
  const N = state.trust.length;
  const trust = new Float64Array(state.trust);
  const tendency = new Float64Array(state.complianceTendency);

  for (let t = 0; t < HYSTERESIS_STEPS; t++) {
    let overrides = 0;
    let complianceSum = 0;
    let trustSum = 0;
    const anchrStrength = 0;
    for (let i = 0; i < N; i++) {
      const pressure = 0.4 + 0.4 * rng();
      const effectiveStrength = anchrStrength * trust[i];
      let comply = tendency[i] * (0.5 + 0.5 * effectiveStrength) - pressure * 0.3;
      comply = Math.max(0, Math.min(1, comply));
      const override = comply < 0.5 ? 1 : 0;
      overrides += override;
      complianceSum += 1 - override;
      trustSum += trust[i];
    }
    series.push({
      t: STEPS + t,
      override_rate: overrides / N,
      trust: trustSum / N,
      adoption: 0,
      compliance: complianceSum / N,
    });
  }
  return series;
}

export interface TrialResult {
  condition: Condition;
  runId: number;
  seed: number;
  series: StepSnapshot[];
  burninFrom: number;
  burninTo: number;
  mean_override: number;
  trend_override: number;
  trust_trend: number;
}

export interface HysteresisResult {
  runId: number;
  seed: number;
  postRemovalSeries: StepSnapshot[];
  mean_override_after_removal: number;
  persistence_length_high_override: number; // steps until override_rate > 0.6
}

function extractBurninMetrics(series: StepSnapshot[], burninFrom: number, burninTo: number): {
  mean_override: number;
  trend_override: number;
  trust_trend: number;
} {
  const slice = series.filter((s) => s.t >= burninFrom && s.t <= burninTo);
  const n = slice.length;
  const mean_override = slice.reduce((a, s) => a + s.override_rate, 0) / n;
  const firstHalf = slice.filter((_, i) => i < n / 2);
  const secondHalf = slice.filter((_, i) => i >= n / 2);
  const meanFirst = firstHalf.length ? firstHalf.reduce((a, s) => a + s.override_rate, 0) / firstHalf.length : 0;
  const meanSecond = secondHalf.length ? secondHalf.reduce((a, s) => a + s.override_rate, 0) / secondHalf.length : 0;
  const trend_override = meanSecond - meanFirst;
  const trustFirst = firstHalf.length ? firstHalf.reduce((a, s) => a + s.trust, 0) / firstHalf.length : 0;
  const trustSecond = secondHalf.length ? secondHalf.reduce((a, s) => a + s.trust, 0) / secondHalf.length : 0;
  const trust_trend = trustSecond - trustFirst;
  return { mean_override, trend_override, trust_trend };
}

export function runAllTrials(): {
  params: Record<string, number | string>;
  trials: TrialResult[];
  hysteresis: HysteresisResult[];
  crossRunVarianceByCondition: Record<Condition, number>;
} {
  const burninFrom = Math.floor(STEPS * BURN_IN_FRAC);
  const burninTo = STEPS - 1;

  const params = {
    STEPS,
    BURN_IN_FRAC,
    burninFrom,
    burninTo,
    BASE_RUNS,
    N_AGENTS,
    SHOCK_AT_STEP,
    REBELLION_FRAC,
    HYSTERESIS_STEPS,
  };

  const trials: TrialResult[] = [];
  const conditions: Condition[] = ["CONTROL", "WEAK", "SHOCK", "REBELLION"];

  const trialOutputs: { condition: Condition; runId: number; seed: number; series: StepSnapshot[]; finalState: AgentState }[] = [];

  for (const condition of conditions) {
    for (let runId = 0; runId < BASE_RUNS; runId++) {
      const seed = 1000 * (conditions.indexOf(condition) + 1) + 31 * (runId + 1) + runId * 7;
      const anchrStrength = condition === "CONTROL" ? 0 : 1;
      const { series, finalState } = runTrial({
        condition,
        runId,
        seed,
        anchrStrength,
        shockAfterStep: SHOCK_AT_STEP,
        rebellionFrac: REBELLION_FRAC,
      });
      trialOutputs.push({ condition, runId, seed, series, finalState });
      const { mean_override, trend_override, trust_trend } = extractBurninMetrics(series, burninFrom, burninTo);
      trials.push({
        condition,
        runId,
        seed,
        series,
        burninFrom,
        burninTo,
        mean_override,
        trend_override,
        trust_trend,
      });
    }
  }

  const hysteresis: HysteresisResult[] = [];
  const anchoredRuns = trialOutputs.filter((o) => o.condition === "WEAK");
  for (let i = 0; i < anchoredRuns.length; i++) {
    const { runId, seed, finalState } = anchoredRuns[i];
    const postRemovalSeries = runHysteresisPhase(seed, finalState);
    const mean_override_after = postRemovalSeries.reduce((a, s) => a + s.override_rate, 0) / postRemovalSeries.length;
    let persistence_length_high_override = postRemovalSeries.length;
    for (let j = 0; j < postRemovalSeries.length; j++) {
      if (postRemovalSeries[j].override_rate > 0.6) {
        persistence_length_high_override = j;
        break;
      }
    }
    hysteresis.push({
      runId,
      seed,
      postRemovalSeries,
      mean_override_after_removal: mean_override_after,
      persistence_length_high_override,
    });
  }

  const crossRunVarianceByCondition: Record<Condition, number> = {} as Record<Condition, number>;
  for (const cond of conditions) {
    const means = trials.filter((r) => r.condition === cond).map((r) => r.mean_override);
    const avg = means.reduce((a, b) => a + b, 0) / means.length;
    const variance = means.reduce((a, m) => a + (m - avg) ** 2, 0) / means.length;
    crossRunVarianceByCondition[cond] = variance;
  }

  return {
    params: params as unknown as Record<string, number | string>,
    trials,
    hysteresis,
    crossRunVarianceByCondition,
  };
}
