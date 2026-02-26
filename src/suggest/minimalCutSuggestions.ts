/**
 * Deterministic suggestions from minimalCut only. Same semantic order as gateComment.
 * No timestamps, no randomness. Sorted by (category, title).
 */

import { parseMinimalCut } from "../repair/parseReport.js";
import type { SuggestionItem, SuggestionCategory } from "./types.js";

const SUGGESTION_ORDER: string[] = [
  "circular_import",
  "boundary_violation",
  "type_import_private_target",
  "deleted_public_api",
  "relative_escape",
];

const FROZEN_SUGGESTIONS: Record<string, string> = {
  circular_import: "Remove one dependency in the cycle chain",
  boundary_violation: "Route dependency through target package public API",
  type_import_private_target: "Add explicit export in target package index",
  deleted_public_api: "Restore removed export or update downstream imports to new public surface",
  relative_escape: "Replace relative path with public package import",
};

function causeToCategory(cause: string): SuggestionCategory {
  if (cause === "circular_import") return "cycle";
  if (cause === "boundary_violation" || cause === "type_import_private_target") return "cross-domain";
  if (cause === "deleted_public_api") return "deleted-public-api";
  if (cause === "relative_escape") return "relative-escape";
  return "other";
}

/**
 * Build suggestion items from minimalCut. Deterministic: same minimalCut → same suggestions.
 * Sorted by (category, title).
 */
export function suggestionsFromMinimalCut(minimalCut: string[]): SuggestionItem[] {
  const parsed = parseMinimalCut([...minimalCut].sort((a, b) => a.localeCompare(b, "en")));
  const causes = [...new Set(parsed.map((v) => v.cause))];
  const ordered = SUGGESTION_ORDER.filter((c) => causes.includes(c));
  const seen = new Set<string>();
  const items: SuggestionItem[] = [];
  for (const cause of ordered) {
    const text = FROZEN_SUGGESTIONS[cause] ?? "Resolve the architectural violation.";
    if (seen.has(text)) continue;
    seen.add(text);
    const category = causeToCategory(cause);
    items.push({
      title: text,
      steps: [text],
      category,
    });
  }
  return items.sort((a, b) => {
    const c = a.category.localeCompare(b.category, "en");
    if (c !== 0) return c;
    return a.title.localeCompare(b.title, "en");
  });
}
