import { mkdirSync, readdirSync, statSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { canonicalPath } from "../src/structural/canonicalPath.js";
import { getRepoRoot, getBaseHead, getDiff } from "../src/structural/git.js";
import { resolveSpecifierFrozen } from "../src/structural/frozenResolver.js";
import { computePublicFiles } from "../src/structural/publicSurface.js";
import { detectViolations } from "../src/structural/violations.js";
import { buildDeterministicReport } from "../src/structural/buildReport.js";
import { stableStringify } from "../src/structural/report.js";
import { writeFileSync } from "fs";
import { computeBoundaryFingerprints } from "../src/pressure/fingerprint.js";
import { loadPressureStore, savePressureStore, writePressureSignals } from "../src/pressure/store.js";
import { addFingerprintsToStore, computeSignals } from "../src/pressure/signals.js";

const OUT_PATH = "artifacts/anchr-report.json";

function discoverPackages(repoRoot: string): Map<string, string> {
  const pkgDirByName = new Map<string, string>();
  const packagesDir = join(repoRoot, "packages");
  try {
    const entries = readdirSync(packagesDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && !e.isSymbolicLink()) {
        const srcDir = join(packagesDir, e.name, "src");
        try {
          if (statSync(srcDir, { throwIfNoEntry: false })?.isDirectory()) {
            pkgDirByName.set(e.name, join(packagesDir, e.name));
          }
        } catch {
          // skip
        }
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

function main(): number {
  const cwd = process.cwd();
  const repoRoot = getRepoRoot();
  if (!repoRoot) {
    return runIncomplete(cwd);
  }

  const baseHead = getBaseHead(repoRoot);
  if (!baseHead) {
    return runIncomplete(repoRoot);
  }

  const diffEntries = getDiff(repoRoot, baseHead.base, baseHead.head);
  const pkgDirByName = discoverPackages(repoRoot);

  if (pkgDirByName.size === 0) {
    const report = buildDeterministicReport(
      "VERIFIED",
      [],
      baseHead.base,
      baseHead.head,
      collectCanonicalPaths(repoRoot, diffEntries),
    );
    const outPath = resolve(repoRoot, OUT_PATH);
    writeReport(
      { ...report, headSha: baseHead.head, baseSha: baseHead.base },
      outPath,
    );
    return 0;
  }

  const publicFiles = computePublicFiles(repoRoot, pkgDirByName);
  const violations = detectViolations(
    repoRoot,
    diffEntries,
    pkgDirByName,
    publicFiles,
    baseHead.base,
  );

  const hasBlock =
    violations.some((v) => v.cause === "boundary_violation" || v.cause === "deleted_public_api");

  const status = hasBlock ? "BLOCKED" : violations.length > 0 ? "BLOCKED" : "VERIFIED";
  const canonicalPaths = collectCanonicalPaths(repoRoot, diffEntries);

  const report = buildDeterministicReport(
    status,
    violations,
    baseHead.base,
    baseHead.head,
    canonicalPaths,
  );

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
  writeReport(
    {
      ...report,
      headSha: baseHead.head,
      baseSha: baseHead.base,
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
      addFingerprintsToStore(store, fingerprints, baseHead.head);
      savePressureStore(artifactsDir, store);
      const signals = computeSignals(store, repoRoot, baseHead.head);
      writePressureSignals(artifactsDir, {
        signals,
        headSha: baseHead.head,
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
