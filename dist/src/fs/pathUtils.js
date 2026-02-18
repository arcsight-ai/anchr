import { normalize, sep } from "path";
/**
 * Normalize path separators to forward slashes for deterministic cross-platform output.
 */
export function normalizeSeparators(p) {
    return normalize(p).split(sep).join("/");
}
