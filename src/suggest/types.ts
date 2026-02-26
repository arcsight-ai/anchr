/**
 * Canonical shape for anchr-fix-suggestions.json. Deterministic; no timestamps or randomness.
 */

export type SuggestionCategory =
  | "cycle"
  | "cross-domain"
  | "deleted-public-api"
  | "relative-escape"
  | "other";

export interface SuggestionItem {
  title: string;
  steps: string[];
  category: SuggestionCategory;
}

export interface SuggestOutput {
  version: "v1";
  source: "convergence" | "minimalCut";
  run: { base: string; head: string; run_id: string };
  suggestions: SuggestionItem[];
}
