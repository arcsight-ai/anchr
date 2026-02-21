import { mkdirSync, readdirSync, statSync } from "fs";
import { dirname, join, resolve } from "path";
import { buildGraph } from "../src/graph/buildGraph.js";
import { detectCycles } from "../src/graph/detectCycles.js";
import { canonicalPath } from "../src/structural/canonicalPath.js";
import { getRepoRoot, getBaseHead, getDiff, getDiffCached } from "../src/structural/git.js";
import { computePublicFiles } from "../src/structural/publicSurface.js";
import { detectViolations } from "../src/structural/violations.js";
import { cyclesToViolations } from "../src/structural/cycleViolations.js";
import { buildDeterministicReport } from "../src/structural/buildReport.js";
import { stableStringify } from "../src/structural/report.js";
import { writeFileSync } from "fs";
import { computeBoundaryFingerprints } from "../src/pressure/fingerprint.js";
import { loadPressureStore, savePressureStore, writePressureSignals } from "../src/pressure/store.js";
import { addFingerprintsToStore, computeSignals } from "../src/pressure/signals.js";
import { computeRepoHash } from "../src/repair/repoHash.js";

const OUT_PATH = process.env.ANCHR_REPORT_PATH ?? "artifacts/anchr-report.json";

function discoverPackages(repoRoot: string): Map<string, string> {
  const pkgDirByName = new Map<string, string>();
  const packagesDir = join(repoRoot, "packages");
  try {
    const entries = readdirSync(packagesDir, { withFileTypes: true });
    const names = entries
      .filter((e) => e.isDirectory() && !e.isSymbolicLink())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "en"));
    for (const name of names) {
      const srcDir = join(packagesDir, name, "src");
      try {
        if (statSync(srcDir, { throwIfNoEntry: false })?.isDirectory()) {
          pkgDirByName.set(name, join(packagesDir, name));
        }
      } catch {
        // skip
      }
    }
  } catch {
    // no packages
  }
  return pkgDirByName;
}

function collectCanonicalPaths(
  repoRoot: string,
  diffEntries: { path: string }[],
): string[] {
  const absRoot = resolve(repoRoot);
  const paths = new Set<string>();
  for (const e of diffEntries) {
    const abs = resolve(absRoot, e.path);
    paths.add(canonicalPath(abs, absRoot));
  }
  return Array.from(paths);
}

function writeReport(report: unknown, outPath: string): void {
  const dir = dirname(outPath);
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // exists
  }
  const json = stableStringify(report);
  writeFileSync(outPath, json + "\n", "utf8");
}

function runIncomplete(basePath: string): number {
  const report = {
    status: "INCOMPLETE" as const,
    classification: { primaryCause: null as null },
    minimalCut: [] as string[],
    decision: { level: "warn" as const, reason: "git_unavailable" },
    confidence: { coverageRatio: 0 },
    scope: { mode: "structural-audit" },
    run: { id: "incomplete" },
  };
  const outPath = resolve(basePath, OUT_PATH);
  writeReport(report, outPath);
  return 0;
}

function logStructured(obj: Record<string, unknown>): void {
  if (process.env.ANCHR_STRUCTURED_LOG !== "1") return;
  try {
    process.stderr.write(JSON.stringify(obj) + "\n");
  } catch {
    // ignore
  }
}

function main(): number {
  const t0 = Date.now();
  const mem0 = process.memoryUsage();
  logStructured({ event: "analysis_start", ts: t0, rss: mem0.rss });

  const cwd = process.cwd();
  const repoRoot = getRepoRoot();
  if (!repoRoot) {
    return runIncomplete(cwd);
  }

  const baseHead = getBaseHead(repoRoot);
  if (!baseHead) {
    return runIncomplete(repoRoot);
  }

  const staged = process.env.ANCHR_STAGED === "1" || process.env.ANCHR_STAGED === "true";
  const diffEntries = staged
    ? getDiffCached(repoRoot)
    : getDiff(repoRoot, baseHead.base, baseHead.head);
  const baseSha = staged ? baseHead.head : baseHead.base;
  const headSha = baseHead.head;
  const pkgDirByName = discoverPackages(repoRoot);

  const graph = buildGraph(repoRoot);
  const t1 = Date.now();
  logStructured({ event: "graph_built", ts: t1, elapsed_ms: t1 - t0 });

  const cycles = detectCycles(graph);
  const cycleViolations = cyclesToViolations(repoRoot, graph, cycles);

  let boundaryViolations: import("../src/structural/types.js").Violation[] = [];
  if (pkgDirByName.size > 0) {
    const publicFiles = computePublicFiles(repoRoot, pkgDirByName);
    boundaryViolations = detectViolations(
      repoRoot,
      diffEntries,
      pkgDirByName,
      publicFiles,
      baseSha,
    );
  }

  const violations = [...cycleViolations, ...boundaryViolations];
  const t2 = Date.now();
  logStructured({ event: "minimalcut_done", ts: t2, elapsed_ms: t2 - t1 });

  const hasBlock = violations.some(
    (v) =>
      v.cause === "boundary_violation" ||
      v.cause === "deleted_public_api" ||
      v.cause === "circular_import",
  );

  const status = hasBlock ? "BLOCKED" : violations.length > 0 ? "BLOCKED" : "VERIFIED";
  const canonicalPaths = collectCanonicalPaths(repoRoot, diffEntries);

  const report = buildDeterministicReport(
    status,
    violations,
    baseSha,
    headSha,
    canonicalPaths,
  );
  const t3 = Date.now();
  logStructured({ event: "decision_made", ts: t3, elapsed_ms: t3 - t2 });
  logStructured({ event: "total_runtime_ms", ms: t3 - t0, rss: process.memoryUsage().rss });

  const boundaryViolationDetails =
    report.decision.level === "block"
      ? violations
          .filter((v) => v.cause === "boundary_violation" && v.specifier)
          .map((v) => {
            const targetPkg = v.specifier!.startsWith("@market-os/")
              ? v.specifier!.slice("@market-os/".length).split("/")[0]
              : "";
            return {
              sourcePkg: v.package,
              targetPkg,
              specifier: v.specifier,
              path: v.path,
              identifiers: v.identifiers ?? [],
            };
          })
      : [];

  const outPath = resolve(repoRoot, OUT_PATH);
  const runWithHash = { ...report.run, repoHash: computeRepoHash(repoRoot) };
  writeReport(
    {
      ...report,
      run: runWithHash,
      headSha,
      baseSha,
      ...(boundaryViolationDetails.length > 0 ? { boundaryViolationDetails } : {}),
    },
    outPath,
  );

  if (
    report.decision.level === "block" &&
    report.classification.primaryCause === "boundary_violation" &&
    report.minimalCut.length > 0
  ) {
    const artifactsDir = join(repoRoot, "artifacts");
    const fingerprints = computeBoundaryFingerprints(report.minimalCut);
    if (fingerprints.length > 0) {
      const store = loadPressureStore(artifactsDir);
      addFingerprintsToStore(store, fingerprints, headSha);
      savePressureStore(artifactsDir, store);
      const signals = computeSignals(store, repoRoot, headSha);
      writePressureSignals(artifactsDir, {
        signals,
        headSha,
      });
    }
  }

  const exitCode = report.decision.level === "block" ? 1 : 0;
  return exitCode;
}

try {
  const code = main();
  process.exit(code);
} catch (err) {
  const report = {
    status: "INCOMPLETE",
    classification: { primaryCause: null },
    minimalCut: [],
    decision: { level: "warn" as const, reason: "unexpected_error" },
    confidence: { coverageRatio: 0 },
    scope: { mode: "structural-audit" },
    run: { id: "incomplete" },
    headSha: "",
    baseSha: "",
  };
  const outPath = resolve(process.cwd(), OUT_PATH);
  writeReport(report, outPath);
  process.exit(0);
}
