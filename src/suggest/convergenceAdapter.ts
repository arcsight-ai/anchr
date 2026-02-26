/**
 * Thin adapter for convergence-engine. If CONVERGENCE_PATH is set, dynamically import
 * getSuggestions(input) and return suggestions; otherwise return null (use minimalCut fallback).
 * Does not affect report or gate authority.
 */

import { pathToFileURL } from "url";
import { join } from "path";
import type { SuggestionItem } from "./types.js";

export interface ConvergenceInput {
  repoRoot: string;
  minimalCut: string[];
  baseSha: string;
  headSha: string;
  runId: string;
  ignorePatterns?: string[];
  maxFiles?: number;
  timeoutMs?: number;
}

/**
 * Load convergence-engine and get suggestions. Returns null if CONVERGENCE_PATH unset or load fails.
 */
export async function getConvergenceSuggestions(
  input: ConvergenceInput,
): Promise<SuggestionItem[] | null> {
  const path = process.env.CONVERGENCE_PATH?.trim();
  if (!path) return null;
  const candidates = [
    join(path, "dist", "suggestAdapter.js"),
    join(path, "dist", "src", "suggestAdapter.js"),
    join(path, "src", "suggestAdapter.js"),
  ];
  for (const candidate of candidates) {
    try {
      const url = pathToFileURL(candidate).href;
      const mod = await import(/* webpackIgnore: true */ url);
      const fn = mod.getSuggestions ?? mod.default?.getSuggestions ?? mod.default;
      if (typeof fn !== "function") continue;
      const out = await Promise.resolve(fn(input));
      if (!Array.isArray(out)) return null;
      return out as SuggestionItem[];
    } catch {
      // try next
    }
  }
  return null;
}
