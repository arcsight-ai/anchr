/**
 * Prompt 2 — Architectural History Forensics. Read-only, deterministic.
 */

import { createHash } from "crypto";
import { join, resolve } from "path";
import { readdirSync, statSync } from "fs";
import type { Violation } from "../structural/types.js";
import { getRepoRoot, getDiff, getRevListReverse, getParentCommit, getCommitMeta, getMergeBase } from "../structural/git.js";
import { GitRevisionFileSystem } from "../structural/gitRevisionFs.js";
import { detectViolations } from "../structural/violations.js";
import { computePublicFiles } from "../structural/publicSurface.js";
import type { HistoryIncident, HistoryResult } from "./types.js";

const HISTORY_SCAN_FILE_LIMIT = 2000;
const DEFAULT_LIMIT = 30;
const HARD_MAX_COMMITS = 200;

const ALLOWED_CAUSES = new Set<string>([
  "boundary_violation",
  "deleted_public_api",
  "type_import_private_target",
  "relative_escape",
]);

function violationKey(v: Violation): string {
  const from = (v.package ?? "").trim();
  const to = (v.specifier ?? "").trim().replace(/^packages\/[^/]+\//, "").split("/")[0] ?? from;
  const cause = (v.cause ?? "").trim();
  return [from, to, cause].join("::");
}

function deterministicId(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex").slice(0, 16);
}

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

function filterDiffForHistory(entries: { status: string; path: string }[]): { status: "A" | "M"; path: string }[] {
  const out: { status: "A" | "M"; path: string }[] = [];
  const ignoreDirs = /(^|\/)(node_modules|dist|build|coverage|test|tests|__tests__)(\/|$)/;
  const ignoreTest = /\.(spec|test)\.(ts|tsx)$/;
  for (const e of entries) {
    if (e.status !== "A" && e.status !== "M") continue;
    if (!e.path.endsWith(".ts") && !e.path.endsWith(".tsx")) continue;
    if (ignoreDirs.test(e.path) || ignoreTest.test(e.path)) continue;
    out.push({ status: e.status as "A" | "M", path: e.path });
  }
  return out;
}

export interface HistoryForensicsOptions {
  repoRoot: string;
  base?: string;
  since?: string;
  limit?: number;
  withBlame?: boolean;
  boundaryFilter?: string;
}

export function runHistoryForensics(opts: HistoryForensicsOptions): HistoryResult {
  const { repoRoot, base: explicitBase, since, limit = DEFAULT_LIMIT, withBlame = false, boundaryFilter } = opts;
  const downgradeReasons: string[] = [];
  let coverageRatio = 1;

  const envBase = process.env.GITHUB_BASE_SHA ?? process.env.BASE_SHA;
  const base = explicitBase ?? envBase ?? getMergeBase(repoRoot, "HEAD", "main");
  if (!base) {
    return {
      mode: "history",
      commitsAnalyzed: 0,
      debtScore: 0,
      responsibility: { introduced: 0, fixed: 0, inherited: 0 },
      incidents: [],
      confidence: { coverageRatio: 0, downgradeReasons: ["merge_base_unavailable"] },
      incomplete: true,
      incompleteReason: "Could not determine base for responsibility",
    };
  }

  const maxCount = Math.min(Math.max(1, limit), HARD_MAX_COMMITS);
  const revList = getRevListReverse(repoRoot, since ? { since, maxCount: HARD_MAX_COMMITS } : { maxCount });
  const commits = revList.filter((c) => getParentCommit(repoRoot, c) != null).slice(0, maxCount);

  const pkgDirByName = discoverPackages(repoRoot);
  if (pkgDirByName.size === 0) {
    return {
      mode: "history",
      commitsAnalyzed: 0,
      debtScore: 0,
      responsibility: { introduced: 0, fixed: 0, inherited: 0 },
      incidents: [],
      confidence: { coverageRatio: 1, downgradeReasons: [] },
    };
  }

  const activeViolations = new Set<string>();
  const incidentsById = new Map<string, HistoryIncident>();
  let totalFilesScanned = 0;
  const commitIndexBySha = new Map<string, number>();

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]!;
    commitIndexBySha.set(commit, i);
    const parent = getParentCommit(repoRoot, commit);
    if (!parent) continue;

    const diffEntries = getDiff(repoRoot, parent, commit);
    const filtered = filterDiffForHistory(diffEntries);
    totalFilesScanned += filtered.length;
    if (totalFilesScanned > HISTORY_SCAN_FILE_LIMIT) {
      downgradeReasons.push("history_scan_limit_exceeded");
      coverageRatio = 0;
      return {
        mode: "history",
        commitsAnalyzed: i,
        debtScore: [...incidentsById.values()].filter((x) => x.active).reduce((s, x) => s + x.ageCommits, 0),
        responsibility: { introduced: 0, fixed: 0, inherited: 0 },
        incidents: sortIncidents([...incidentsById.values()]),
        confidence: { coverageRatio: 0, downgradeReasons },
        incomplete: true,
        incompleteReason: "history_scan_limit_exceeded",
      };
    }

    const gitFs = new GitRevisionFileSystem(repoRoot, commit);
    const publicFiles = computePublicFiles(repoRoot, pkgDirByName, gitFs);
    const violations = detectViolations(repoRoot, filtered, pkgDirByName, publicFiles, parent, gitFs);
    const detectedKeys = new Set<string>();
    for (const v of violations) {
      if (!ALLOWED_CAUSES.has(v.cause)) continue;
      const key = violationKey(v);
      detectedKeys.add(key);
    }

    const newKeys = [...detectedKeys].filter((k) => !activeViolations.has(k));
    const fixedKeys = [...activeViolations].filter((k) => !detectedKeys.has(k));
    const meta = getCommitMeta(repoRoot, commit);

    for (const key of newKeys) {
      const id = deterministicId(key);
      if (incidentsById.has(id)) continue;
      const [fromPkg, toPkg, cause] = key.split("::");
      const incident: HistoryIncident = {
        id,
        type: cause as HistoryIncident["type"],
        from: fromPkg,
        to: toPkg ?? "",
        violationKey: key,
        introducedCommit: commit.slice(0, 7),
        introducedDate: meta?.date ?? "",
        introducedIndex: i,
        introducedBy: withBlame ? meta?.author : undefined,
        introducedEmail: withBlame ? meta?.email : undefined,
        active: true,
        ageCommits: 0,
      };
      incidentsById.set(id, incident);
      activeViolations.add(key);
    }

    for (const key of fixedKeys) {
      const id = deterministicId(key);
      const inc = incidentsById.get(id);
      if (!inc || !inc.active) continue;
      const fixMeta = getCommitMeta(repoRoot, commit);
      inc.fixedCommit = commit.slice(0, 7);
      inc.fixedDate = fixMeta?.date;
      inc.fixedBy = withBlame ? fixMeta?.author : undefined;
      inc.active = false;
      inc.ageCommits = i - inc.introducedIndex;
      activeViolations.delete(key);
    }

    for (const key of activeViolations) {
      const id = deterministicId(key);
      const inc = incidentsById.get(id);
      if (inc?.active) inc.ageCommits = i - inc.introducedIndex;
    }
  }

  const parentBase = getParentCommit(repoRoot, base);
  const baseViolations =
    parentBase != null ? runStructuralAtRange(repoRoot, parentBase, base, pkgDirByName) : [];
  const headViolations = runStructuralAtRange(repoRoot, base, "HEAD", pkgDirByName);
  const baseKeys = new Set(baseViolations.map(violationKey));
  const headKeys = new Set(headViolations.map(violationKey));

  const branchIntroduced = [...headKeys].filter((k) => !baseKeys.has(k));
  const branchFixed = [...baseKeys].filter((k) => !headKeys.has(k));
  const inherited = [...baseKeys].filter((k) => headKeys.has(k));

  for (const inc of incidentsById.values()) {
    if (branchIntroduced.includes(inc.violationKey)) inc.branchResponsibility = "NEW";
    else if (branchFixed.includes(inc.violationKey)) inc.branchResponsibility = "FIXED";
    else if (inherited.includes(inc.violationKey)) inc.branchResponsibility = "INHERITED";
    else inc.branchResponsibility = "UNCHANGED";
  }

  const responsibility = {
    introduced: branchIntroduced.length,
    fixed: branchFixed.length,
    inherited: inherited.length,
  };

  let incidents = sortIncidents([...incidentsById.values()]);
  if (boundaryFilter) {
    const b = boundaryFilter.replace(/^@market-os\//, "").trim();
    incidents = incidents.filter((i) => i.from === b || i.to === b);
  }

  const activeIncidents = incidents.filter((i) => i.active);
  const debtScore = activeIncidents.reduce((s, i) => s + i.ageCommits, 0);

  return {
    mode: "history",
    commitsAnalyzed: commits.length,
    debtScore,
    responsibility,
    incidents,
    confidence: { coverageRatio, downgradeReasons },
  };
}

function sortIncidents(list: HistoryIncident[]): HistoryIncident[] {
  return list.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.ageCommits !== b.ageCommits) return b.ageCommits - a.ageCommits;
    return a.violationKey.localeCompare(b.violationKey, "en");
  });
}

function runStructuralAtRange(
  repoRoot: string,
  base: string,
  head: string,
  pkgDirByName: Map<string, string>,
): Violation[] {
  const diffEntries = getDiff(repoRoot, base, head);
  const filtered = filterDiffForHistory(diffEntries);
  const gitFs = new GitRevisionFileSystem(repoRoot, head);
  const publicFiles = computePublicFiles(repoRoot, pkgDirByName, gitFs);
  return detectViolations(repoRoot, filtered, pkgDirByName, publicFiles, base, gitFs);
}
