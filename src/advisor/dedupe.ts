/**
 * Deduplication rule: if >40% of suggestion would repeat explanation/reasoning, output nothing.
 */

function normalizeWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

export function wouldRepeatTooMuch(
  suggestion: string,
  explanation: string,
  reasoning: string,
): boolean {
  const source = normalizeWords(explanation + " " + reasoning);
  const sourceSet = new Set(source);
  const suggestionWords = normalizeWords(suggestion);
  if (suggestionWords.length === 0) return true;

  const repeatCount = suggestionWords.filter((w) => sourceSet.has(w)).length;
  const ratio = repeatCount / suggestionWords.length;
  return ratio > 0.4;
}
