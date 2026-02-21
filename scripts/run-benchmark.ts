/**
 * ANCHR continuous benchmark — wraps validation protocol on a rotating dataset.
 * Does not modify validation protocol.
 */

import { spawn } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANCHR_ROOT = join(__dirname, "..");
const BENCHMARK_REPOS_PATH = join(ANCHR_ROOT, "data", "benchmark-repos.json");
const HISTORY_PATH = join(ANCHR_ROOT, "artifacts", "benchmark-history.json");
const AUDIT_LOG_PATH = join(ANCHR_ROOT, "artifacts", "validation-v11-audit-log.json");
const ROLLING_WINDOW = 20;
const LOOP_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface BenchmarkReposFile {
  [category: string]: string[];
}

interface HistoryEntry {
  date: string;
  dataset_hash: string;
  repos: { train: string[]; holdout: string[] };
  classification: string;
  lift: number | null;
  precision: number | null;
  efficiency: number | null;
}

interface AuditLog {
  classification?: string;
  dataset_hash?: string;
  per_repo?: Array<{
    precision?: number;
    lift?: number;
    efficient?: boolean;
  }>;
}

function loadBenchmarkRepos(): { repos: string[]; byCategory: Map<string, string[]> } {
  const raw = readFileSync(BENCHMARK_REPOS_PATH, "utf8");
  const data = JSON.parse(raw) as BenchmarkReposFile;
  const byCategory = new Map<string, string[]>();
  const repos: string[] = [];
  for (const [cat, list] of Object.entries(data)) {
    byCategory.set(cat, list);
    for (const r of list) if (!repos.includes(r)) repos.push(r);
  }
  return { repos, byCategory };
}

function loadHistory(): HistoryEntry[] {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const raw = readFileSync(HISTORY_PATH, "utf8");
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function combinationKey(train: string[], holdout: string[]): string {
  return JSON.stringify([[...train].sort(), [...holdout].sort()]);
}

function sampleCombination(
  repos: string[],
  usedKeys: Set<string>,
  rng: () => number,
): { train: string[]; holdout: string[] } | null {
  if (repos.length < 5) return null;
  const pool = [...repos];
  for (let i = 0; i < 500; i++) {
    for (let j = pool.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [pool[j], pool[k]] = [pool[k]!, pool[j]!];
    }
    const train = pool.slice(0, 3);
    const holdout = pool.slice(3, 5);
    const key = combinationKey(train, holdout);
    if (!usedKeys.has(key)) return { train, holdout };
  }
  return null;
}

function runPrepareRepos(train: string[], holdout: string[], seed: number): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["tsx", join(ANCHR_ROOT, "scripts", "prepare-repos.ts")],
      {
        cwd: ANCHR_ROOT,
        stdio: ["inherit", "pipe", "pipe"],
        env: {
          ...process.env,
          TRAIN_REPOS: train.join(","),
          HOLDOUT_REPOS: holdout.join(","),
          RANDOM_SEED: String(seed),
        },
      },
    );
    if (child.stdout) child.stdout.pipe(process.stdout);
    if (child.stderr) child.stderr.pipe(process.stderr);

    const barWidth = 20;
    process.stderr.write("Starting validation (prepare-repos → run-validation-v11)...\n");
    const start = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      const pos = Math.min(elapsed % (barWidth + 1), barWidth - 1);
      const bar = "[" + "=".repeat(pos) + ">" + " ".repeat(barWidth - 1 - pos) + "]";
      process.stderr.write(`  ${bar} ${m}m ${s}s elapsed\n`);
    }, 15000);

    child.on("close", (code) => {
      clearInterval(progressInterval);
      const elapsed = Math.floor((Date.now() - start) / 1000);
      process.stderr.write(`  → Run finished in ${Math.floor(elapsed / 60)}m ${elapsed % 60}s\n`);
      resolve(code ?? 1);
    });
  });
}

function readAuditLog(): AuditLog | null {
  if (!existsSync(AUDIT_LOG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(AUDIT_LOG_PATH, "utf8")) as AuditLog;
  } catch {
    return null;
  }
}

function aggregateFromAudit(audit: AuditLog): {
  classification: string;
  dataset_hash: string;
  lift: number | null;
  precision: number | null;
  efficiency: number | null;
} {
  const classification = audit.classification ?? "FAIL";
  const dataset_hash = audit.dataset_hash ?? "";
  const perRepo = audit.per_repo ?? [];
  const valid = perRepo.filter((r) => r.precision != null && r.lift != null);
  if (valid.length === 0) {
    return { classification, dataset_hash, lift: null, precision: null, efficiency: null };
  }
  const lifts = valid.map((r) => r.lift!);
  const precisions = valid.map((r) => r.precision!);
  const efficientCount = valid.filter((r) => r.efficient === true).length;
  const lift = lifts.length > 0 ? median(lifts) : null;
  const precision = precisions.length > 0 ? median(precisions) : null;
  const efficiency = efficientCount / valid.length;
  return { classification, dataset_hash, lift, precision, efficiency };
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function appendHistory(entry: HistoryEntry): void {
  mkdirSync(join(ANCHR_ROOT, "artifacts"), { recursive: true });
  const history = loadHistory();
  history.push(entry);
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf8");
}

function computeRollingMetrics(history: HistoryEntry[]): {
  runs: number;
  pass_rate: number;
  median_lift: number | null;
  median_precision: number | null;
  median_efficiency: number | null;
} {
  const runs = history.length;
  const last = history.slice(-ROLLING_WINDOW);
  const passCount = last.filter(
    (e) => e.classification === "STRONG_SIGNAL" || e.classification === "REAL_SIGNAL",
  ).length;
  const pass_rate = last.length > 0 ? passCount / last.length : 0;
  const lifts = last.map((e) => e.lift).filter((v): v is number => v != null);
  const precisions = last.map((e) => e.precision).filter((v): v is number => v != null);
  const efficiencies = last.map((e) => e.efficiency).filter((v): v is number => v != null);
  return {
    runs,
    pass_rate,
    median_lift: lifts.length > 0 ? median(lifts) : null,
    median_precision: precisions.length > 0 ? median(precisions) : null,
    median_efficiency: efficiencies.length > 0 ? median(efficiencies) : null,
  };
}

function printBenchmarkSummary(metrics: ReturnType<typeof computeRollingMetrics>): void {
  console.log("BENCHMARK_SUMMARY");
  console.log("runs " + metrics.runs);
  console.log("pass_rate " + metrics.pass_rate);
  console.log("median_lift " + (metrics.median_lift ?? "null"));
  console.log("median_precision " + (metrics.median_precision ?? "null"));
  console.log("median_efficiency " + (metrics.median_efficiency ?? "null"));
}

async function runOne(history: HistoryEntry[], repos: string[]): Promise<void> {
  const usedKeys = new Set(history.map((e) => combinationKey(e.repos.train, e.repos.holdout)));
  const rng = seededRandom(Date.now());
  const combo = sampleCombination(repos, usedKeys, rng);
  if (!combo) {
    console.error("No unused train/holdout combination available. Exhausted pool.");
    process.exit(1);
  }
  const seed = Math.floor(rng() * 1e9);
  console.log("BENCHMARK_RUN train=" + combo.train.join(",") + " holdout=" + combo.holdout.join(",") + " seed=" + seed);
  await runPrepareRepos(combo.train, combo.holdout, seed);
  const audit = readAuditLog();
  const { classification, dataset_hash, lift, precision, efficiency } = audit
    ? aggregateFromAudit(audit)
    : {
        classification: "FAIL",
        dataset_hash: "",
        lift: null as number | null,
        precision: null as number | null,
        efficiency: null as number | null,
      };
  const entry: HistoryEntry = {
    date: new Date().toISOString(),
    dataset_hash,
    repos: combo,
    classification,
    lift,
    precision,
    efficiency,
  };
  appendHistory(entry);
  const updated = loadHistory();
  const metrics = computeRollingMetrics(updated);
  printBenchmarkSummary(metrics);
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

async function main(): Promise<void> {
  const loop = process.argv.includes("--loop");
  const { repos } = loadBenchmarkRepos();
  if (repos.length < 5) {
    console.error("Benchmark repo pool must have at least 5 repos.");
    process.exit(1);
  }
  do {
    const history = loadHistory();
    await runOne(history, repos);
    if (loop) {
      console.log("Sleeping 6 hours until next run...");
      await new Promise((r) => setTimeout(r, LOOP_INTERVAL_MS));
    }
  } while (loop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
