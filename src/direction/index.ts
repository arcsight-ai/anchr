import type { AbstractionKind } from "./classify.js";
import { classifyAbstraction } from "./classify.js";
import { inferOwner } from "./ownership.js";
import {
  tokensFromSpecifier,
  tokensFromPath,
  tokensFromIdentifiers,
  uniqueSorted,
} from "./tokens.js";

export interface BoundaryViolationDetail {
  sourcePkg: string;
  targetPkg: string;
  specifier?: string;
  path: string;
  identifiers: string[];
}

const STABLE_MIN_VIOLATIONS = 2;
const STABLE_MIN_FILES = 2;
const MIN_STABLE_TOKENS = 2;

function collectTokensForBoundary(
  details: BoundaryViolationDetail[],
): string[] {
  const tokenCounts = new Map<string, number>();

  for (const d of details) {
    const tokens: string[] = [];
    if (d.specifier) tokens.push(...tokensFromSpecifier(d.specifier));
    tokens.push(...tokensFromPath(d.path));
    tokens.push(...tokensFromIdentifiers(d.identifiers));
    const normalized = uniqueSorted(tokens);
    for (const t of normalized) {
      tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1);
    }
  }

  const fileCountByToken = new Map<string, Set<string>>();
  for (const d of details) {
    const tokens: string[] = [];
    if (d.specifier) tokens.push(...tokensFromSpecifier(d.specifier));
    tokens.push(...tokensFromPath(d.path));
    tokens.push(...tokensFromIdentifiers(d.identifiers));
    const normalized = uniqueSorted(tokens);
    for (const t of normalized) {
      const set = fileCountByToken.get(t) ?? new Set();
      set.add(d.path);
      fileCountByToken.set(t, set);
    }
  }

  const stable: string[] = [];
  for (const [token, count] of tokenCounts) {
    const fileCount = fileCountByToken.get(token)?.size ?? 0;
    if (count >= STABLE_MIN_VIOLATIONS || fileCount >= STABLE_MIN_FILES) {
      stable.push(token);
    }
  }

  return stable.sort((a, b) => a.localeCompare(b, "en"));
}

export function computeDirection(
  boundary: string,
  details: BoundaryViolationDetail[],
  allDetails: BoundaryViolationDetail[],
): { message: string; ownerPkg: string } | null {
  if (details.length === 0) return null;

  const sourcePkg = details[0].sourcePkg;
  const targetPkg = details[0].targetPkg;

  const stableTokens = collectTokensForBoundary(details);
  if (stableTokens.length < MIN_STABLE_TOKENS) return null;

  const kind = classifyAbstraction(stableTokens);
  if (kind === "REASSESS_BOUNDARY") {
    const allBoundaries = allDetails.map((d) => ({
      sourcePkg: d.sourcePkg,
      targetPkg: d.targetPkg,
    }));
    const owner = inferOwner(sourcePkg, targetPkg, allBoundaries);
    if (owner === "mutual") {
      return {
        message: [
          "**Architectural Direction**",
          "",
          `Access patterns span incompatible responsibilities between:`,
          "",
          `${sourcePkg} ↔ ${targetPkg}`,
          "",
          "The boundary does not represent a stable architectural separation.",
          "",
          "Suggested change: Reevaluate package ownership or merge responsibilities.",
          "",
          "Derived deterministically from repeated access patterns.",
        ].join("\n"),
        ownerPkg: "",
      };
    }
    return null;
  }

  const allBoundaries = allDetails.map((d) => ({
    sourcePkg: d.sourcePkg,
    targetPkg: d.targetPkg,
  }));
  const owner = inferOwner(sourcePkg, targetPkg, allBoundaries);
  if (owner === "mutual") {
    return {
      message: [
        "**Architectural Direction**",
        "",
        `Access patterns span incompatible responsibilities between:`,
        "",
        `${sourcePkg} ↔ ${targetPkg}`,
        "",
        "The boundary does not represent a stable architectural separation.",
        "",
        "Suggested change: Reevaluate package ownership or merge responsibilities.",
        "",
        "Derived deterministically from repeated access patterns.",
      ].join("\n"),
      ownerPkg: "",
    };
  }

  const ownerPkg = owner === "target" ? targetPkg : sourcePkg;

  const templates: Record<Exclude<AbstractionKind, "REASSESS_BOUNDARY">, string> = {
    INTERFACE: [
      "**Architectural Direction**",
      "",
      "Developers repeatedly access structural definitions across:",
      "",
      `${sourcePkg} → ${targetPkg}`,
      "",
      `This indicates a missing public interface owned by ${ownerPkg}.`,
      "",
      "Suggested change: Expose a stable contract module in " + ownerPkg + ".",
      "",
      "Derived deterministically from repeated access patterns.",
    ].join("\n"),
    SERVICE: [
      "**Architectural Direction**",
      "",
      "Developers repeatedly call operational logic across:",
      "",
      `${sourcePkg} → ${targetPkg}`,
      "",
      `This indicates a missing service abstraction owned by ${ownerPkg}.`,
      "",
      "Suggested change: Expose a public service API in " + ownerPkg + ".",
      "",
      "Derived deterministically from repeated access patterns.",
    ].join("\n"),
    ADAPTER: [
      "**Architectural Direction**",
      "",
      "Developers repeatedly transform data across:",
      "",
      `${sourcePkg} → ${targetPkg}`,
      "",
      `This indicates a missing adapter layer owned by ${ownerPkg}.`,
      "",
      "Suggested change: Create an adapter module in " + ownerPkg + ".",
      "",
      "Derived deterministically from repeated access patterns.",
    ].join("\n"),
  };

  return { message: templates[kind], ownerPkg };
}

export function getDirectionForSignals(
  signals: { boundary: string }[],
  boundaryViolationDetails: BoundaryViolationDetail[],
): string[] {
  if (boundaryViolationDetails.length === 0) return [];

  const byBoundary = new Map<string, BoundaryViolationDetail[]>();
  for (const d of boundaryViolationDetails) {
    const key = `${d.sourcePkg.toLowerCase().trim()} → ${d.targetPkg.toLowerCase().trim()}`;
    const arr = byBoundary.get(key) ?? [];
    arr.push(d);
    byBoundary.set(key, arr);
  }

  const messages: string[] = [];
  for (const sig of signals) {
    const details = byBoundary.get(sig.boundary);
    if (!details || details.length === 0) continue;

    const result = computeDirection(
      sig.boundary,
      details,
      boundaryViolationDetails,
    );
    if (result?.message) {
      messages.push(result.message);
    }
  }

  return messages;
}
