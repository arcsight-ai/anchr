/**
 * Sort arrays deterministically. Uses localeCompare with "en" for strings.
 */
export function sortStrings(arr) {
    return [...arr].sort((a, b) => a.localeCompare(b, "en"));
}
export function sortBy(arr, key) {
    return [...arr].sort((a, b) => key(a).localeCompare(key(b), "en"));
}
