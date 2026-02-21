/**
 * ANCHR v5 — Pre-Registered Multi-Repo Causal Validation.
 * Frozen thresholds. No metric drift. No reclassification.
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANCHR_ROOT = join(__dirname, "..");

// Pre-registered thresholds (frozen)
const MIN_COMMITS = 30;
const MIN_PREDICTIONS = 15;
const MIN_FAILURE_KINDS = 3;
const MIN_HIGH_CONFIDENCE = 1;
const MIN_REPLAY_JSON_KB = 10;
const MIN_VALID_REPOS = 2;
const MIN_PREDICTIONS_PER_SEGMENT = 5;
const REFACTOR_FILES_THRESHOLD = 20;
const REFACTOR_LINES_THRESHOLD = 800;
const LIFT_GENERALIZABLE = 1.2;
const LIFT_STRONG = 1.3;
const PRECISION_STRONG = 0.35;

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
  false_positives: number;
  precision: number;
  baseline_precision: number;
  lift: number;
  hindsight_only_removed: number;
  causal_matches_detail?: Array<{
    prediction_sha: string;
    fix_sha: string;
    confidence: string;
    bug_intro_sha?: string | null;
  }>;
}

function safeExec(cwd: string, cmd: string): string | null {
  try {
    return execSync(cmd, { encoding: "utf8", cwd, maxBuffer: 2 * 1024 * 1024 }).trim();
  } catch {
    return null;
  }
}

function main(): void {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN required. Abort.");
    process.exit(1);
  }
  const cwd = ANCHR_ROOT;
  const gitStatus = safeExec(cwd, "git status --porcelain");
  if (gitStatus && gitStatus.length > 0) {
    console.error("Dirty working tree. Abort.");
    process.exit(1);
  }

  const repoRemote = safeExec(cwd, "git remote get-url origin") ?? "";
  const headSha = safeExec(cwd, "git rev-parse HEAD") ?? "";
  const nodeVersion = process.version;
  const os = process.platform + " " + process.arch;
  const timestamp = new Date().toISOString();

  console.log("PHASE_0_ENVIRONMENT");
  console.log("repo=" + repoRemote);
  console.log("HEAD=" + headSha);
  console.log("node=" + nodeVersion);
  console.log("os=" + os);
  console.log("timestamp=" + timestamp);
  console.log("anchr_version_hash=" + headSha);
  console.log("");

  const reposRaw = process.env.VALIDATION_REPOS ?? "arcsight-ai/anchr,vercel/next.js,nodejs/node";
  const repos = reposRaw.split(",").map((r) => r.trim()).filter(Boolean);
  if (repos.length < 3) {
    console.error("Set VALIDATION_REPOS to 'owner/a,owner/b,owner/c' (3 repos). Abort.");
    process.exit(1);
  }

  const validationDir = join(cwd, "artifacts", "validation");
  mkdirSync(validationDir, { recursive: true });

  const repoData: Array<{
    repo: string;
    cloneDir: string;
    replayResults: ReplayResults | null;
    valid: boolean;
    proofReport: ProofReport | null;
    segmentPrecision: { early: number; middle: number; late: number } | null;
    randomPrecision: number;
    precisionHigh: number;
    precisionMedium: number;
    calibrated: boolean;
    temporalOverfit: boolean;
    invalidDirectionCount: number;
    adjustedPrecision: number;
    effectSize: number;
    powerProxy: number;
  }> = [];

  for (const repo of repos) {
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
      } catch (e) {
        console.log("Clone failed for " + repo + ", skip.");
        repoData.push({
          repo,
          cloneDir,
          replayResults: null,
          valid: false,
          proofReport: null,
          segmentPrecision: null,
          randomPrecision: 0,
          precisionHigh: 0,
          precisionMedium: 0,
          calibrated: true,
          temporalOverfit: false,
          invalidDirectionCount: 0,
          adjustedPrecision: 0,
          effectSize: 0,
          powerProxy: 0,
        });
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
      console.log(repo + ": no replay-results after run, skip.");
      repoData.push({ repo, cloneDir, replayResults: null, valid: false, proofReport: null, segmentPrecision: null, randomPrecision: 0, precisionHigh: 0, precisionMedium: 0, calibrated: true, temporalOverfit: false, invalidDirectionCount: 0, adjustedPrecision: 0, effectSize: 0, powerProxy: 0 });
      continue;
    }

    let replayResults: ReplayResults;
    try {
      replayResults = JSON.parse(readFileSync(replayPath, "utf8")) as ReplayResults;
    } catch {
      repoData.push({ repo, cloneDir, replayResults: null, valid: false, proofReport: null, segmentPrecision: null, randomPrecision: 0, precisionHigh: 0, precisionMedium: 0, calibrated: true, temporalOverfit: false, invalidDirectionCount: 0, adjustedPrecision: 0, effectSize: 0, powerProxy: 0 });
      continue;
    }

    const commits = replayResults.total_commits_scanned ?? 0;
    const predictions = replayResults.predictions ?? 0;
    const failureKinds = new Set((replayResults.hits ?? []).map((h) => h.failure_kind).filter(Boolean)).size;
    const highConf = replayResults.confidence_distribution?.high ?? 0;
    const fileSizeKb = existsSync(replayPath) ? statSync(replayPath).size / 1024 : 0;

    const valid =
      commits >= MIN_COMMITS &&
      predictions >= MIN_PREDICTIONS &&
      failureKinds >= MIN_FAILURE_KINDS &&
      highConf >= MIN_HIGH_CONFIDENCE &&
      fileSizeKb > MIN_REPLAY_JSON_KB;

    console.log("PHASE_1_REPO " + repo);
    console.log("commits=" + commits);
    console.log("predictions=" + predictions);
    console.log("failure_kinds=" + failureKinds);
    console.log("confidence_distribution=" + JSON.stringify(replayResults.confidence_distribution ?? {}));
    console.log("valid=" + valid);
    console.log("");

    if (!valid) {
      repoData.push({
        repo,
        cloneDir,
        replayResults,
        valid: false,
        proofReport: null,
        segmentPrecision: null,
        randomPrecision: 0,
        precisionHigh: 0,
        precisionMedium: 0,
        calibrated: true,
        temporalOverfit: false,
        invalidDirectionCount: 0,
        adjustedPrecision: 0,
        effectSize: 0,
        powerProxy: 0,
      });
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
      console.error("PHASE_2 NON_DETERMINISTIC " + repo);
      process.exit(1);
    }
    console.log("PHASE_2 DETERMINISTIC " + repo);

    const hitsWithDate = (replayResults.hits ?? []).filter((h) => h.date);
    const sorted = [...hitsWithDate].sort(
      (a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime(),
    );
    const n = sorted.length;
    const segSize = Math.floor(n / 3) || 1;
    const early = sorted.slice(0, segSize);
    const middle = sorted.slice(segSize, segSize * 2);
    const late = sorted.slice(segSize * 2);
    const segmentOk = early.length >= MIN_PREDICTIONS_PER_SEGMENT && middle.length >= MIN_PREDICTIONS_PER_SEGMENT && late.length >= MIN_PREDICTIONS_PER_SEGMENT;
    if (!segmentOk) {
      console.log("PHASE_3 " + repo + " INSUFFICIENT_SEGMENTS");
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

    const shuffledPath = join(cloneDir, "artifacts", "replay-results-shuffled.json");
    const shuffledHits = [...(replayResults.hits ?? [])];
    for (let i = shuffledHits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledHits[i]!.fix_sha, shuffledHits[j]!.fix_sha] = [shuffledHits[j]!.fix_sha!, shuffledHits[i]!.fix_sha!];
    }
    writeFileSync(
      shuffledPath,
      JSON.stringify(
        { ...replayResults, hits: shuffledHits },
        null,
        2,
      ),
      "utf8",
    );
    spawnSync(
      "npx",
      ["tsx", join(ANCHR_ROOT, "scripts", "generate-proof.ts"), "--input", shuffledPath],
      { encoding: "utf8", cwd: cloneDir, timeout: 300000, stdio: "pipe" },
    );
    let randomPrecision = 0;
    if (existsSync(proofPath)) {
      try {
        const shuffledProof = JSON.parse(readFileSync(proofPath, "utf8")) as ProofReport;
        randomPrecision = shuffledProof.precision ?? 0;
      } catch {
        // ignore
      }
    }
    if (precision <= randomPrecision) {
      console.error("PHASE_5 NO_REAL_SIGNAL " + repo + " precision=" + precision + " random_precision=" + randomPrecision);
    }

    const detail = proofReport?.causal_matches_detail ?? [];
    const earlyShas = new Set(early.map((h) => h.prediction_sha));
    const middleShas = new Set(middle.map((h) => h.prediction_sha));
    const lateShas = new Set(late.map((h) => h.prediction_sha));
    const earlyMatches = detail.filter((d) => earlyShas.has(d.prediction_sha)).length;
    const middleMatches = detail.filter((d) => middleShas.has(d.prediction_sha)).length;
    const lateMatches = detail.filter((d) => lateShas.has(d.prediction_sha)).length;
    const predEarly = early.length;
    const predMiddle = middle.length;
    const predLate = late.length;
    const segmentPrecision = {
      early: predEarly > 0 ? earlyMatches / predEarly : 0,
      middle: predMiddle > 0 ? middleMatches / predMiddle : 0,
      late: predLate > 0 ? lateMatches / predLate : 0,
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

    let invalidDirectionCount = 0;
    for (const d of detail) {
      if (d.bug_intro_sha) {
        try {
          execSync(`git merge-base --is-ancestor ${d.prediction_sha} ${d.bug_intro_sha}`, { cwd: cloneDir, stdio: "pipe" });
        } catch {
          invalidDirectionCount++;
        }
      }
    }

    let adjustedMatches = causalMatches;
    for (const d of detail) {
      const stat = safeExec(cloneDir, `git show --shortstat ${d.fix_sha}`);
      if (stat) {
        const filesMatch = stat.match(/(\d+)\s+files? changed/);
        const insDelMatch = stat.match(/(\d+)\s+insertions?.+(\d+)\s+deletions?/);
        const files = filesMatch ? parseInt(filesMatch[1]!, 10) : 0;
        const ins = insDelMatch ? parseInt(insDelMatch[1]!, 10) : 0;
        const del = insDelMatch ? parseInt(insDelMatch[2]!, 10) : 0;
        if (files > REFACTOR_FILES_THRESHOLD || ins + del > REFACTOR_LINES_THRESHOLD) adjustedMatches--;
      }
    }
    const adjustedPrecision = totalPred > 0 ? adjustedMatches / totalPred : 0;
    const effectSize = precision - baselinePrecision;
    const powerProxy = totalPred > 0 ? causalMatches / totalPred : 0;

    repoData.push({
      repo,
      cloneDir,
      replayResults,
      valid: true,
      proofReport,
      segmentPrecision,
      randomPrecision,
      precisionHigh,
      precisionMedium,
      calibrated,
      temporalOverfit,
      invalidDirectionCount,
      adjustedPrecision,
      effectSize,
      powerProxy,
    });
  }

  const validRepos = repoData.filter((r) => r.valid);
  if (validRepos.length < MIN_VALID_REPOS) {
    console.error("INSUFFICIENT_DATA valid_repos=" + validRepos.length);
    process.exit(1);
  }

  const passGeneralizable = validRepos.filter(
    (r) =>
      (r.proofReport?.lift ?? 0) > LIFT_GENERALIZABLE &&
      (r.proofReport?.causal_matches ?? 0) >= 3 &&
      r.calibrated &&
      !r.temporalOverfit,
  ).length;
  const generalizable = passGeneralizable >= 2 ? "GENERALIZABLE_SIGNAL" : "REPO_SPECIFIC_SIGNAL";

  let classification: string;
  const strongCandidates = validRepos.filter(
    (r) =>
      (r.proofReport?.lift ?? 0) >= LIFT_STRONG &&
      (r.proofReport?.precision ?? 0) >= PRECISION_STRONG &&
      !r.temporalOverfit &&
      r.calibrated,
  );
  if (strongCandidates.length >= 2) classification = "STRONG_SIGNAL";
  else if (passGeneralizable >= 2) classification = "REAL_SIGNAL";
  else if (validRepos.some((r) => (r.proofReport?.lift ?? 0) > 1.0)) classification = "WEAK_SIGNAL";
  else if (validRepos.every((r) => (r.proofReport?.lift ?? 0) <= 1.0)) classification = "NO_SIGNAL";
  else if (validRepos.length === 1) classification = "OVERFIT";
  else if (validRepos.some((r) => (r.proofReport?.baseline_precision ?? 0) > (r.proofReport?.precision ?? 0)))
    classification = "REGRESSION";
  else classification = "WEAK_SIGNAL";

  const datasetHash = createHash("sha256")
    .update(repos.join(",") + headSha + validRepos.map((r) => (r.replayResults?.hits ?? []).map((h) => h.prediction_sha).join(",")).join("|") + validRepos.map((r) => r.proofReport?.causal_matches ?? 0).join(",") + timestamp)
    .digest("hex")
    .slice(0, 32);

  const auditLog = {
    phase0: { repo: repoRemote, head: headSha, node: nodeVersion, os, timestamp, anchr_version_hash: headSha },
    phase1: repoData.map((r) => ({ repo: r.repo, valid: r.valid, commits: r.replayResults?.total_commits_scanned, predictions: r.replayResults?.predictions })),
    phase4: repoData.map((r) => ({ repo: r.repo, total_predictions: r.proofReport?.total_predictions, causal_matches: r.proofReport?.causal_matches, precision: r.proofReport?.precision, baseline_precision: r.proofReport?.baseline_precision, lift: r.proofReport?.lift })),
    phase5: repoData.map((r) => ({ repo: r.repo, random_precision: r.randomPrecision })),
    phase7: repoData.map((r) => ({ repo: r.repo, precision_high: r.precisionHigh, precision_medium: r.precisionMedium, calibrated: r.calibrated })),
    phase10: repoData.map((r) => ({ repo: r.repo, effect_size: r.effectSize, power_proxy: r.powerProxy })),
    classification,
    generalizability: generalizable,
    dataset_hash: datasetHash,
    generated_at: timestamp,
  };
  mkdirSync(join(cwd, "artifacts"), { recursive: true });
  writeFileSync(join(cwd, "artifacts", "validation-v5-audit-log.json"), JSON.stringify(auditLog, null, 2), "utf8");

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
        " causal_direction_ok=" +
        (r.invalidDirectionCount === 0),
    );
  }
  console.log("SEGMENT_PRECISION");
  for (const r of repoData) {
    if (!r.valid || !r.segmentPrecision) continue;
    console.log(r.repo + " early=" + r.segmentPrecision.early + " middle=" + r.segmentPrecision.middle + " late=" + r.segmentPrecision.late);
  }
  console.log("NEGATIVE_CONTROL");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(r.repo + " precision=" + (r.proofReport?.precision ?? 0) + " random_precision=" + r.randomPrecision + " pass=" + ((r.proofReport?.precision ?? 0) > r.randomPrecision));
  }
  console.log("CALIBRATION");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(r.repo + " precision_high=" + r.precisionHigh + " precision_medium=" + r.precisionMedium + " calibrated=" + r.calibrated);
  }
  console.log("EFFECT_SIZE");
  for (const r of repoData) {
    if (!r.valid) continue;
    console.log(r.repo + " effect_size=" + r.effectSize + " lift=" + (r.proofReport?.lift ?? 0) + " power_proxy=" + r.powerProxy);
  }
  console.log("GENERALIZABILITY " + generalizable);
  console.log("CLASSIFICATION " + classification);
  console.log("DATASET_HASH " + datasetHash);
}

main();
