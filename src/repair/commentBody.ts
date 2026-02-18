import { parseMinimalCut } from "./parseReport.js";
import { generateGuidance, generateIntent, generateNextStep } from "./guidance.js";

const WORKSPACE_PREFIX = "@market-os/";

function toPublicEntrypoint(specifier: string | undefined): string | null {
  if (!specifier || !specifier.startsWith(WORKSPACE_PREFIX)) return null;
  const rest = specifier.slice(WORKSPACE_PREFIX.length);
  const slash = rest.indexOf("/");
  const pkg = slash >= 0 ? rest.slice(0, slash) : rest;
  return `${WORKSPACE_PREFIX}${pkg}`;
}

function summaryForCause(cause: string): string {
  const map: Record<string, string> = {
    boundary_violation:
      "You imported internal code from another package. Use the public entrypoint instead.",
    type_import_private_target:
      "You imported a type from a private module. Re-export the type from the package entrypoint and import from there.",
    relative_escape:
      "A relative import crossed a package boundary. Replace it with a package import.",
    deleted_public_api:
      "A public file or export was removed. Restore the export or provide a re-export replacement.",
  };
  return map[cause] ?? "An architectural boundary was violated.";
}

export interface DiffSuggestion {
  from: string;
  to: string;
}

function buildDiffSuggestions(minimalCut: string[]): DiffSuggestion[] {
  const parsed = parseMinimalCut(minimalCut);
  const seen = new Set<string>();
  const out: DiffSuggestion[] = [];

  for (const v of parsed) {
    if (v.cause === "boundary_violation" && v.specifier) {
      const to = toPublicEntrypoint(v.specifier);
      if (to && v.specifier !== to) {
        const key = `${v.specifier} -> ${to}`;
        if (!seen.has(key) && out.length < 3) {
          seen.add(key);
          out.push({ from: v.specifier, to });
        }
      }
    } else if (v.cause === "relative_escape" && v.specifier) {
      const parts = v.specifier.replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..");
      const toPkg = parts[0];
      if (toPkg && !seen.has(`relative -> ${toPkg}`) && out.length < 3) {
        seen.add(`relative -> ${toPkg}`);
        out.push({ from: v.specifier, to: `${WORKSPACE_PREFIX}${toPkg}` });
      }
    } else if (v.cause === "type_import_private_target" && v.specifier) {
      const to = toPublicEntrypoint(v.specifier);
      if (to && v.specifier !== to) {
        const key = `type ${v.specifier} -> ${to}`;
        if (!seen.has(key) && out.length < 3) {
          seen.add(key);
          out.push({ from: v.specifier, to });
        }
      }
    }
  }

  return out.slice(0, 3);
}

export function buildCommentBody(
  decision: string,
  runId: string,
  primaryCause: string | null,
  minimalCut: string[],
  headShaShort: string,
  includeRepair: boolean,
): string {
  const lines: string[] = [];

  lines.push("## ArcSight Certification Result");
  lines.push("");
  lines.push(`**Decision:** ${decision}`);
  lines.push(`**Commit:** ${headShaShort}`);
  lines.push("");

  if (decision === "BLOCK" && primaryCause) {
    const summary = summaryForCause(primaryCause);
    lines.push("**Summary:** " + summary);
    lines.push("");

    lines.push("ArcSight detected a boundary violation. To restore boundary integrity, apply the suggested change below.");
    lines.push("");

    if (includeRepair) {
      const diffs = buildDiffSuggestions(minimalCut);
      if (diffs.length > 0) {
        lines.push("**Suggested Fix**");
        lines.push("");
        for (const d of diffs) {
          lines.push("```diff");
          lines.push(`- import { ... } from '${d.from}'`);
          lines.push(`+ import { ... } from '${d.to}'`);
          lines.push("```");
          lines.push("");
        }
      }

      const guidance = generateGuidance(primaryCause);
      const intent = generateIntent(primaryCause);
      const nextStep = generateNextStep(primaryCause);
      if (guidance) {
        lines.push("**Architecture Guidance**");
        lines.push("");
        lines.push(guidance);
        lines.push("");
      }
      if (intent) {
        lines.push("**Architectural Intent**");
        lines.push("");
        lines.push(intent);
        lines.push("");
      }
      if (nextStep) {
        lines.push("**Next Step**");
        lines.push("");
        lines.push(nextStep);
        lines.push("");
      }
    }

    lines.push("**Details**");
    lines.push(`- run id: \`${runId}\``);
    lines.push(`- primary cause: ${primaryCause}`);
    lines.push("- affected boundary: package public surface");
  } else if (decision === "ALLOW") {
    lines.push("No architectural impact detected. No action required.");
  } else if (decision === "WARN") {
    lines.push("ArcSight could not prove the change safe. No boundary violation detected but architectural certainty was not reached. No repair suggested.");
  }

  return lines.join("\n");
}

export function parseExistingCommentBody(body: string): { runId: string | null; decision: string | null } {
  let runId: string | null = null;
  let decision: string | null = null;

  const runMatch = body.match(/run id:\s*`?([a-f0-9]+)`?/i);
  if (runMatch) runId = runMatch[1];

  const decisionMatch = body.match(/\*\*Decision:\*\*\s*(\w+)/);
  if (decisionMatch) decision = decisionMatch[1];

  return { runId, decision };
}
