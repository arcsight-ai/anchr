import type { RepairAction, RepairPlan } from "./types.js";

function invariantSummary(status: string, primaryCause: string | null): string {
  if (status === "verified") return "ArcSight verified no architectural impact.";
  if (status === "uncertain") return "ArcSight could not prove the change safe.";
  if (status === "no-report") return "ArcSight report missing — certification did not execute.";
  if (status === "blocked" && primaryCause) {
    const causeMap: Record<string, string> = {
      boundary_violation: "A consumer package depends on an implementation detail of another package.",
      type_import_private_target: "A consumer imports a type that is not part of the target package's public API.",
      relative_escape: "A package uses a relative import that crosses package boundaries.",
      deleted_public_api: "A previously public symbol was removed without a replacement.",
    };
    return causeMap[primaryCause] ?? "An architectural boundary was violated.";
  }
  return "An architectural boundary was violated.";
}

export function formatMarkdown(plan: RepairPlan, primaryCause: string | null): string {
  const lines: string[] = [];

  lines.push("# ArcSight Architectural Repair Plan");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(invariantSummary(plan.status, primaryCause));
  lines.push("");

  if (plan.status === "verified") {
    lines.push("No action required.");
    return lines.join("\n");
  }

  if (plan.status === "uncertain") {
    lines.push("No boundary violation detected but architectural certainty was not reached.");
    return lines.join("\n");
  }

  if (plan.status === "no-report") {
    return lines.join("\n");
  }

  if (plan.primaryActionPath.length > 0) {
    lines.push("## Primary Repair Path");
    lines.push("");
    lines.push("Apply the following changes in order. Each step restores boundary integrity.");
    lines.push("");

    for (let i = 0; i < plan.primaryActionPath.length; i++) {
      const a = plan.primaryActionPath[i];
      lines.push(`${i + 1}. **${a.requiredChange}**`);
      if (a.impactRadius > 1) {
        lines.push(`   - Resolves ${a.impactRadius} violations`);
      }
      lines.push("");
    }

    const totalImpact = plan.primaryActionPath.reduce((s, a) => s + a.impactRadius, 0);
    lines.push("## Impact");
    lines.push("");
    lines.push(`This plan addresses ${totalImpact} violation${totalImpact !== 1 ? "s" : ""} across ${plan.primaryActionPath.length} action${plan.primaryActionPath.length !== 1 ? "s" : ""}.`);
    lines.push("");

    lines.push("## Detailed Actions");
    lines.push("");

    for (const a of plan.primaryActionPath) {
      lines.push(`### ${a.id}`);
      lines.push("");
      lines.push(`- **Type:** ${a.type}`);
      lines.push(`- **From:** ${a.fromPackage} → **To:** ${a.toPackage}`);
      lines.push(`- **Required change:** ${a.requiredChange}`);
      if (a.impactRadius > 0) {
        lines.push(`- **Impact radius:** ${a.impactRadius} violation${a.impactRadius !== 1 ? "s" : ""} resolved`);
      }
      lines.push("");
    }

    lines.push("## Result");
    lines.push("");
    lines.push("After applying the primary repair path, the next ArcSight run will return VERIFIED. Boundary integrity is restored without changing runtime behavior beyond what is strictly necessary.");
  }

  return lines.join("\n");
}
