/**
 * Classify missing abstraction from token dominance. First match wins.
 */

const INTERFACE_TOKENS = new Set([
  "schema",
  "model",
  "state",
  "entity",
  "contract",
  "shape",
  "type",
  "spec",
]);

const SERVICE_TOKENS = new Set([
  "compute",
  "evaluate",
  "hash",
  "resolve",
  "execute",
  "build",
  "run",
  "calculate",
]);

const ADAPTER_TOKENS = new Set([
  "parse",
  "encode",
  "decode",
  "map",
  "convert",
  "serialize",
  "normalize",
  "transform",
]);

export type AbstractionKind =
  | "INTERFACE"
  | "SERVICE"
  | "ADAPTER"
  | "REASSESS_BOUNDARY";

function countDominance(tokens: string[], set: Set<string>): number {
  return tokens.filter((t) => set.has(t)).length;
}

export function classifyAbstraction(tokens: string[]): AbstractionKind {
  if (tokens.length === 0) return "REASSESS_BOUNDARY";

  const iface = countDominance(tokens, INTERFACE_TOKENS);
  const svc = countDominance(tokens, SERVICE_TOKENS);
  const adp = countDominance(tokens, ADAPTER_TOKENS);

  if (iface > svc && iface > adp) return "INTERFACE";
  if (svc > iface && svc > adp) return "SERVICE";
  if (adp > iface && adp > svc) return "ADAPTER";

  return "REASSESS_BOUNDARY";
}
