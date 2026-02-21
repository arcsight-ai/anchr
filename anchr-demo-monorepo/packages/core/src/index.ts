/**
 * Core public API. Dependents must import only from this surface.
 */
export function getVersion(): string {
  return "1.0.0";
}

export { formatMessage } from "./format.js";
