/**
 * DINA share — Convert structural report into a human-readable future incident report.
 * Format: Title, System Context, Prediction, Observable Symptom, Diagnostic Clue, Trigger,
 * Impact, First Wrong Assumption, Moment of Realization, Confidence Tone.
 * No tool/analysis branding. No fixes. No numbers or certainty words. Under 150 words. Deterministic.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const REPORT_PATH = "artifacts/anchr-report.json";
const MAX_WORDS = 150;

export interface ReportLike {
  status?: string;
  decision?: { level?: string; reason?: string };
  classification?: { primaryCause?: string | null };
  minimalCut?: string[];
  scope?: { mode?: string };
}

/** Incident report fields for share output. Diagnostic Clue is required and concrete. */
interface IncidentReport {
  title: string;
  systemContext: string;
  prediction: string;
  observableSymptom: string;
  diagnosticClue: string;
  trigger: string;
  impact: string;
  firstWrongAssumption: string;
  momentOfRealization: string;
  confidenceTone: string;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function trimToMaxWords(s: string, max: number): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return s.trim();
  return words.slice(0, max).join(" ").trim();
}

function formatIncident(inc: IncidentReport): string {
  const parts = [
    `Title — ${inc.title}`,
    `System Context — ${inc.systemContext}`,
    `Prediction — ${inc.prediction}`,
    `Observable Symptom — ${inc.observableSymptom}`,
    `Diagnostic Clue — ${inc.diagnosticClue}`,
    `Trigger — ${inc.trigger}`,
    `Impact — ${inc.impact}`,
    `First Wrong Assumption — ${inc.firstWrongAssumption}`,
    `Moment of Realization — ${inc.momentOfRealization}`,
    `Confidence Tone — ${inc.confidenceTone}`,
  ];
  let out = parts.join("\n");
  let total = wordCount(out);
  if (total <= MAX_WORDS) return out;
  const over = total - MAX_WORDS;
  const pred = inc.prediction.trim().split(/\s+/);
  const predTrim = Math.max(5, pred.length - over);
  inc.prediction = pred.slice(0, predTrim).join(" ").trim();
  parts[2] = `Prediction — ${inc.prediction}`;
  out = parts.join("\n");
  total = wordCount(out);
  if (total <= MAX_WORDS) return out;
  const sym = inc.observableSymptom.trim().split(/\s+/);
  inc.observableSymptom = sym.slice(0, Math.max(3, sym.length - (total - MAX_WORDS))).join(" ").trim();
  parts[3] = `Observable Symptom — ${inc.observableSymptom}`;
  return parts.join("\n");
}

/**
 * Extract one short reference from minimalCut for the first sentence.
 * Strip repo prefixes and "packages/". Never invent. Return null if none.
 */
export function shortRefFromMinimalCut(minimalCut: string[] | undefined): string | null {
  if (!Array.isArray(minimalCut) || minimalCut.length === 0) return null;
  const first = minimalCut[0];
  if (typeof first !== "string" || !first.trim()) return null;
  const parts = first.split(":");
  const pkg = parts[0]?.trim();
  const pathPart = parts[1]?.trim();
  if (pkg) {
    const moduleName = pkg.replace(/^packages\/+/, "").trim();
    if (moduleName.length > 0) return moduleName;
  }
  if (pathPart) {
    const segments = pathPart.split("/").filter(Boolean);
    const fileName = segments[segments.length - 1];
    if (fileName && fileName.length > 0) return fileName;
  }
  return null;
}

/**
 * Format report as future incident: plausible failure scenario as if it already happened.
 * One concrete Diagnostic Clue per scenario (retry spike, timeout, cache miss, flaky test, etc.).
 */
export function formatShareMessage(report: ReportLike): string {
  const status = (report.status ?? "INCOMPLETE").trim();
  const level = (report.decision?.level ?? "warn").trim();
  const primaryCause = (report.classification?.primaryCause ?? null) as string | null;

  if (status === "VERIFIED" && level === "allow") {
    return formatIncident({
      title: "No cross-boundary risk",
      systemContext: "Local call sites and refactors",
      prediction: "At some point someone renames or refactors this code. Impact stays local; no distant surface breaks.",
      observableSymptom: "None observed.",
      diagnosticClue: "None observed.",
      trigger: "Refactor or rename.",
      impact: "None beyond the changed area.",
      firstWrongAssumption: "N/A.",
      momentOfRealization: "Boundaries held; no incident.",
      confidenceTone: "Safe today fragile tomorrow.",
    });
  }

  if (status === "BLOCKED" && level === "block" && primaryCause === "deleted_public_api") {
    return formatIncident({
      title: "Consumer break after API removal",
      systemContext: "API server or background worker",
      prediction: "Eventually a consumer still depending on the old contract hits a code path that used the removed surface.",
      observableSymptom: "One endpoint or job starts failing or returning errors.",
      diagnosticClue: "Retry spike or repeated 5xx on the same route.",
      trigger: "Deploy that removes or upgrades the consumer, or a rarely hit code path is exercised.",
      impact: "Broken behavior or bad data for that consumer; failure shows up far from the deletion.",
      firstWrongAssumption: "Env, config, or network; the removal is not connected to the incident.",
      momentOfRealization: "Tracing which call site still expected the old contract.",
      confidenceTone: "Eventually.",
    });
  }

  if (status === "BLOCKED" && level === "block" && primaryCause === "relative_escape") {
    return formatIncident({
      title: "Stale behavior after code move",
      systemContext: "Test suite or build pipeline",
      prediction: "At some point the codebase is split or reorganized. A local path now points at the wrong place or is missed.",
      observableSymptom: "Tests fail or a build step behaves differently after a deploy.",
      diagnosticClue: "Stale read or cache miss after deploy; same test passes locally.",
      trigger: "Splitting packages or moving files; path no longer resolves as before.",
      impact: "Wrong code path or missing module; looks like an integration or environment issue.",
      firstWrongAssumption: "Timing or caching; the boundary escape is not in the blame set.",
      momentOfRealization: "Mapping the failing path back to the relative import that escaped.",
      confidenceTone: "Mentionable risk.",
    });
  }

  if (status === "BLOCKED" && level === "block" && primaryCause === "type_import_private_target") {
    return formatIncident({
      title: "Runtime failure after build change",
      systemContext: "Build pipeline or runtime",
      prediction: "Eventually a refactor or optimization changes how that type is built or bundled. The private dependency is no longer available where the consumer expects.",
      observableSymptom: "Build passes locally, fails in CI, or a runtime error in a different service.",
      diagnosticClue: "Build passes locally, fails in CI; or duplicate symbol / missing type at runtime.",
      trigger: "Upgrade, cache clear, or parallelization change in the build.",
      impact: "Broken build or runtime failure; stack trace does not point at the type dependency.",
      firstWrongAssumption: "Build or bundling flake; the private type import is not suspected.",
      momentOfRealization: "Finding the consumer that still referenced the private type.",
      confidenceTone: "Rare but catastrophic.",
    });
  }

  if (status === "BLOCKED" && level === "block") {
    return formatIncident({
      title: "Hidden dependency breaks after reorg",
      systemContext: "API server or background worker",
      prediction: "Eventually someone renames or reorganizes the internal implementation. A hidden dependency from another area is no longer satisfied.",
      observableSymptom: "A flaky test or a timeout on a rarely hit path.",
      diagnosticClue: "Flaky test in CI or a timeout on a rarely hit path.",
      trigger: "Rename or reorg of the internal implementation; consumer was not in the dependency graph.",
      impact: "Larger failure in production; investigation points to recent changes elsewhere.",
      firstWrongAssumption: "Last deploy or dependency upgrade; the hidden link is hard to trace.",
      momentOfRealization: "Connecting the failure to the call site that crossed the boundary.",
      confidenceTone: "Likely.",
    });
  }

  if (status === "INDETERMINATE" || level === "warn" || status === "INCOMPLETE") {
    return formatIncident({
      title: "Unresolved dependency risk",
      systemContext: "Test suite or deploy path",
      prediction: "At some point a refactor, rename, or upgrade might touch a hidden link that could not be fully resolved.",
      observableSymptom: "Unexplained timeout or a test that only fails sometimes.",
      diagnosticClue: "Intermittent timeout or flaky test; no clear repro.",
      trigger: "Refactor, rename, or upgrade; dependency graph was incomplete.",
      impact: "If a real dependency exists, a surprising failure that is hard to trace; if not, no escalation.",
      firstWrongAssumption: "Env or flake; the unresolved dependency is not in the picture.",
      momentOfRealization: "Uncertain; the unresolved link may or may not be the cause.",
      confidenceTone: "Mentionable risk.",
    });
  }

  return formatIncident({
    title: "No cross-boundary risk",
    systemContext: "Local call sites and refactors",
    prediction: "At some point someone renames or refactors this code. Impact stays local; no distant surface breaks.",
    observableSymptom: "None observed.",
    diagnosticClue: "None observed.",
    trigger: "Refactor or rename.",
    impact: "None beyond the changed area.",
    firstWrongAssumption: "N/A.",
    momentOfRealization: "Boundaries held; no incident.",
    confidenceTone: "Safe today fragile tomorrow.",
  });
}

export type ShareResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * Read report from path and return share message or fallback.
 * Never throws. Missing/invalid return fallback message.
 */
export function shareFromPath(path: string): ShareResult {
  if (!existsSync(path)) {
    return { ok: false, message: "No structural report available for this change." };
  }
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (data === null || typeof data !== "object") {
      return { ok: false, message: "The structural report is unreadable." };
    }
    const message = formatShareMessage(data as ReportLike);
    return { ok: true, message };
  } catch {
    return { ok: false, message: "The structural report is unreadable." };
  }
}

/**
 * Run share: read default path (or ANCHR_REPORT_PATH), print one line, exit 0.
 */
export function runShare(cwd: string): void {
  const path = resolve(cwd, process.env.ANCHR_REPORT_PATH ?? REPORT_PATH);
  const result = shareFromPath(path);
  console.log(result.message);
}
