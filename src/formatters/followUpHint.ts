/**
 * Human Architectural Follow-Up Hint (Prompt 4 — Non-Blocking, High-Signal Mode).
 * One short, human-style observation. Never influences merge. Rare and high-signal only.
 */

import type { ArcSightReportLike } from "./law.js";
import { deriveNarrativeKey } from "./law.js";
import { parseMinimalCut } from "../repair/parseReport.js";

export type ArcSightReport = ArcSightReportLike;

const MAX_SENTENCE_CHARS = 140;

/** Returned when no hint should be shown. */
export const FOLLOW_UP_SILENCE = "No architectural follow-up needed.";
const SILENCE_MESSAGE = FOLLOW_UP_SILENCE;

export interface FollowUpHintContext {
  /** If true, return silence (cooldown: never comment more than once per PR). */
  alreadyCommentedThisPR?: boolean;
  /** If a previous ArcSight comment exists on this PR, return silence. */
  hasExistingArcSightComment?: boolean;
  /** Diff size in logical lines; if ≤3 return silence. */
  diffLineCount?: number;
  /** Module pair keys (e.g. "a->b") from last 5 commits; if current pair in list, return silence. */
  recentModulePairs?: string[];
  /** Risk categories recently mentioned (coupling, internal_access, etc.); if current in list, return silence. */
  recentRiskCategories?: string[];
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pkgName(p: string): string {
  return p.replace(/^packages\/+/, "").trim();
}

function targetFromSpecifier(spec: string | undefined): string | null {
  if (!spec || typeof spec !== "string") return null;
  const t = spec.replace(/\\/g, "/").trim();
  const m = t.match(/^packages\/([^/]+)/);
  if (m) return m[1] ?? null;
  const first = t.split("/")[0];
  return first && first !== ".." && first !== "." ? first : null;
}

function firstModulePair(minimalCut: string[]): { from: string; to: string } | null {
  const parsed = parseMinimalCut(minimalCut);
  for (const v of parsed) {
    const from = pkgName(v.package);
    const to = targetFromSpecifier(v.specifier) ?? from;
    if (from && to) return { from, to };
  }
  return null;
}

/** Risk category for anti-repetition. */
function riskCategory(cause: string | null): string {
  switch (cause) {
    case "deleted_public_api":
      return "surface_removal";
    case "boundary_violation":
    case "type_import_private_target":
      return "internal_access";
    case "relative_escape":
      return "boundary_spread";
    case "indeterminate":
      return "coupling";
    default:
      return "coupling";
  }
}

/** Word set index 0..2 from hash(moduleA + moduleB) for wording rotation. */
function wordSetIndex(from: string, to: string): number {
  return simpleHash(from + "\t" + to) % 3;
}

/** Hint templates by category; set 0/1/2 for anti-repetition. No forbidden words. Max 140 chars per sentence. */
function hintFor(
  cause: string | null,
  _from: string,
  _to: string,
  setIndex: number,
): string {
  const part = ["parts", "components", "areas"][setIndex] ?? "parts";
  const dep = ["depend", "rely", "couple"][setIndex] ?? "depend";
  const bound = ["boundary", "interface", "contract"][setIndex] ?? "boundary";
  const st = ["stable", "predictable", "consistent"][setIndex] ?? "stable";

  switch (cause) {
    case "deleted_public_api":
      return `Other ${part} may still rely on this entry. A small compatibility layer often prevents ripple changes.`;
    case "boundary_violation":
    case "type_import_private_target":
      return `This reaches inside another module. ${st.charAt(0).toUpperCase() + st.slice(1)} entry points often make modules easier to evolve separately.`;
    case "relative_escape":
      return `Changes here may propagate further than expected. A narrow ${bound} usually limits where edits travel.`;
    case "indeterminate":
    default:
      return `These ${part} now ${dep} more directly on each other. A narrow ${bound} usually keeps later edits localized.`;
  }
}

/**
 * Format one short follow-up hint or silence. Non-blocking, high-signal only.
 * Returns "No architectural follow-up needed." when any guard says to stay silent.
 */
export function formatFollowUpHint(
  report: ArcSightReport,
  context?: FollowUpHintContext,
): string {
  const level = (report.decision?.level ?? "warn").trim().toLowerCase();
  const primaryCause = (report.classification?.primaryCause ?? null) as string | null;
  const minimalCut = report.minimalCut ?? [];

  if (level === "allow") return SILENCE_MESSAGE;
  if (context?.alreadyCommentedThisPR) return SILENCE_MESSAGE;
  if (context?.hasExistingArcSightComment) return SILENCE_MESSAGE;
  if (context?.diffLineCount != null && context.diffLineCount <= 3) return SILENCE_MESSAGE;
  if (!minimalCut || minimalCut.length === 0) return SILENCE_MESSAGE;

  const pair = firstModulePair(minimalCut);
  if (!pair) return SILENCE_MESSAGE;

  const pairKey = `${pair.from}->${pair.to}`;
  if (context?.recentModulePairs?.includes(pairKey)) return SILENCE_MESSAGE;

  const category = riskCategory(primaryCause);
  if (context?.recentRiskCategories?.includes(category)) return SILENCE_MESSAGE;

  const setIdx = wordSetIndex(pair.from, pair.to);
  const raw = hintFor(primaryCause, pair.from, pair.to, setIdx);

  const sentences = raw.replace(/\s+/g, " ").trim().split(/(?<=[.!])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const sent of sentences) {
    if (sent.length > MAX_SENTENCE_CHARS) {
      out.push(sent.slice(0, MAX_SENTENCE_CHARS - 1).trimEnd() + ".");
    } else {
      out.push(sent);
    }
  }
  const result = out.join(" ").trim();
  return result.length > 0 ? result : SILENCE_MESSAGE;
}
