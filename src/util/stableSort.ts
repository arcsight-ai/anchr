/**
 * Sort arrays deterministically. Uses localeCompare with "en" for strings.
 */
export function sortStrings(arr: string[]): string[] {
  return [...arr].sort((a, b) => a.localeCompare(b, "en"));
}

export function sortBy<T>(
  arr: T[],
  key: (x: T) => string,
): T[] {
  return [...arr].sort((a, b) => key(a).localeCompare(key(b), "en"));
}
