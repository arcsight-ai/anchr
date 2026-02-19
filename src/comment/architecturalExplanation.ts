/**
 * ArcSight Explanation Engine — Deterministic Law Mode v4.
 * Explains architectural stability using causal system laws.
 * No code review, no fixes, no quality evaluation. Only dependency and propagation.
 * Same report → identical text. Time-forward: consequences as future inevitabilities.
 * Inputs: status, decision.level, classification.primaryCause, minimalCut, scope.mode, confidence.coverageRatio.
 */

const MAX_WORDS_ALLOW = 70;
const MAX_WORDS_WARN = 110;
const MAX_WORDS_BLOCK = 160;

export interface ArchitecturalExplanationInput {
  status?: string;
  decision?: { level?: string };
  classification?: { primaryCause?: string | null };
  minimalCut?: string[];
  scope?: { mode?: string };
  confidence?: { coverageRatio?: number };
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function trimToMaxWords(s: string, max: number): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return s.trim();
  return words.slice(0, max).join(" ").trim();
}

/** Extract up to 3 unique package names from minimalCut (first segment before colon). Deterministic sort. */
function affectedSurfaceFromMinimalCut(minimalCut: string[]): string | null {
  if (!Array.isArray(minimalCut) || minimalCut.length === 0) return null;
  const packages = new Set<string>();
  for (const entry of minimalCut) {
    if (typeof entry !== "string") continue;
    const first = entry.split(":")[0]?.trim();
    if (first) packages.add(first.replace(/^packages\/+/, ""));
  }
  const list = [...packages].sort((a, b) => a.localeCompare(b, "en"));
  if (list.length === 0) return null;
  if (list.length <= 3) return list.join(", ");
  return list.slice(0, 3).join(", ") + " and others";
}

function confidenceLabel(ratio: number | undefined): "High" | "Moderate" | "Limited" {
  if (ratio == null || typeof ratio !== "number") return "Limited";
  if (ratio >= 0.95) return "High";
  if (ratio >= 0.8) return "Moderate";
  return "Limited";
}

/**
 * Law Mode v4: verdict line (exact phrase) + 3 paragraphs.
 * Paragraph 1: structural fact. Paragraph 2: propagation law (future inevitability). Paragraph 3: stability principle.
 * No advice, no forbidden words. At least one forward-time propagation statement.
 */
export function formatArchitecturalExplanation(input: ArchitecturalExplanationInput): string {
  const status = (input.status ?? "").trim();
  const level = (input.decision?.level ?? "warn").trim();
  const primaryCause = (input.classification?.primaryCause ?? null) as string | null;
  const minimalCut = input.minimalCut ?? [];
  const coverage = input.confidence?.coverageRatio;
  const affected = affectedSurfaceFromMinimalCut(minimalCut);

  let verdict: string;
  let structuralFact: string;
  let propagationLaw: string;
  let stabilityPrinciple: string;
  let maxWords: number;

  if (status === "VERIFIED" && level === "allow") {
    verdict = "This change preserves the system's dependency invariants.";
    structuralFact =
      "Dependency direction between modules is unchanged. No new coupling crosses a visibility boundary. The public surface of affected modules is unchanged.";
    propagationLaw =
      "Future changes in one module will continue to stay local. Change pressure will not propagate across boundaries because the dependency graph is unchanged.";
    stabilityPrinciple =
      "Stability is preserved when dependency direction and boundary visibility remain invariant across the change.";
    maxWords = MAX_WORDS_ALLOW;
  } else if (status === "BLOCKED" && level === "block" && primaryCause === "deleted_public_api") {
    verdict = "This change breaks a dependency invariant.";
    structuralFact =
      "A public surface was removed. At least one dependency still targets that surface. The boundary no longer exposes the capability that downstream modules rely on.";
    if (affected) structuralFact = structuralFact + " Affected surface: " + affected + ".";
    propagationLaw =
      "Future upgrades or changes in the dependent modules will now fail when they resolve the missing surface. Change in the removed capability will no longer propagate; instead, absence of the capability will force failures elsewhere.";
    stabilityPrinciple =
      "Removing a public surface breaks the invariant that dependents resolve their declared dependency direction. System stability requires the boundary to remain stable for existing consumers.";
    maxWords = MAX_WORDS_BLOCK;
  } else if (status === "BLOCKED" && level === "block") {
    verdict = "This change breaks a dependency invariant.";
    structuralFact =
      "A module now depends on another module's internal surface. The dependency direction crosses a visibility boundary: the dependent reaches into non-public surface.";
    if (affected) structuralFact = structuralFact + " Affected surface: " + affected + ".";
    propagationLaw =
      "Future changes in the internal implementation of the dependency will now force changes or failures in the dependent. Refactors that were previously contained will propagate across the boundary.";
    stabilityPrinciple =
      "Coupling to internal surface violates the invariant that dependency direction respects visibility. Stability requires dependencies to target public surface so that internal change does not propagate.";
    maxWords = MAX_WORDS_BLOCK;
  } else {
    verdict = "The system could not determine architectural safety.";
    structuralFact =
      "Dependency direction and boundary visibility could not be fully resolved. The relationship between changed code and module boundaries is ambiguous.";
    propagationLaw =
      "A hidden coupling may exist. If so, future changes in one area will propagate to another in ways the system could not isolate. Unrelated changes may later expose the coupling.";
    stabilityPrinciple =
      "When isolation cannot be proven, the invariant that change stays within boundaries is not established. Stability is unknown until dependency direction is fully determined.";
    maxWords = MAX_WORDS_WARN;
  }

  const body = [structuralFact, propagationLaw, stabilityPrinciple].join(" ");
  const reserved = wordCount(verdict) + 2;
  const bodyTrimmed = trimToMaxWords(body, Math.max(10, maxWords - reserved));

  const lines = [verdict, "", bodyTrimmed];
  const confidence = confidenceLabel(coverage);
  lines.push("", "Confidence: " + confidence);

  return lines.join("\n");
}
