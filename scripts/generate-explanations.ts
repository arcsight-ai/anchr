/**
 * Explain WHY (Prompt 18 — Robust + Contextual Reasoning Layer).
 * Self-normalising: accepts any ArcSight report format and extracts findings reliably.
 */

type Violation =
  | "boundary_violation"
  | "deleted_public_api"
  | "type_import_private_target"
  | "relative_escape";

export type Finding = {
  cause: Violation;
  importer?: string;
  target?: string;
  package?: string;
};

const VIOLATIONS = new Set<Violation>([
  "boundary_violation",
  "deleted_public_api",
  "type_import_private_target",
  "relative_escape",
]);

function toFinding(v: unknown): Finding | null {
  if (v != null && typeof v === "object" && typeof (v as Finding).cause === "string") {
    const f = v as Finding;
    if (VIOLATIONS.has(f.cause as Violation)) {
      return { cause: f.cause as Violation, importer: f.importer, target: f.target, package: f.package };
    }
  }
  const s = String(v).trim();
  if (!s) return null;
  const parts = s.split(":");
  const cause = parts[0]?.trim();
  if (!cause || !VIOLATIONS.has(cause as Violation)) return null;
  return {
    cause: cause as Violation,
    importer: parts[1]?.trim() || undefined,
    target: parts.slice(2).join(":").trim() || undefined,
  };
}

/**
 * Input normalisation: supports findings[], minimalCut[], violations[], or classification.primaryCause.
 */
export function normaliseFindings(report: unknown): Finding[] {
  const out: Finding[] = [];
  const r = report as Record<string, unknown> | null | undefined;

  if (Array.isArray(r?.findings)) {
    for (const f of r.findings) {
      const parsed = toFinding(f);
      if (parsed) out.push(parsed);
    }
  }

  if (Array.isArray(r?.minimalCut)) {
    for (const v of r.minimalCut) {
      const parsed = toFinding(v);
      if (parsed) out.push(parsed);
    }
  }

  if (Array.isArray(r?.violations)) {
    for (const v of r.violations) {
      const parsed = toFinding(v);
      if (parsed) out.push(parsed);
    }
  }

  if (out.length === 0) {
    const primary = (r?.classification as { primaryCause?: string } | undefined)?.primaryCause;
    if (primary && VIOLATIONS.has(primary as Violation)) {
      out.push({ cause: primary as Violation });
    }
  }

  return out;
}

function short(p?: string): string {
  if (!p) return "";
  const parts = p.split("/");
  return parts.slice(-3).join("/");
}

function example(findings: Finding[]): string {
  const f = findings[0];
  return f?.importer || f?.target
    ? "`" + short(f.importer) + " → " + short(f.target) + "`"
    : "";
}

function boundaryExplanation(findings: Finding[]): string {
  return `
**Internal files are implementation details**

${example(findings)} bypasses the public interface of a package.

That creates hidden coupling:
• refactors become breaking changes
• packages can't evolve independently
• dependency graph becomes unreliable

Import the package entrypoint instead — depend on behavior, not structure.
`;
}

function deletedApiExplanation(_findings: Finding[]): string {
  return `
**A public contract was removed**

Other packages are allowed to rely on public APIs.
Removing one changes system behaviour even if TypeScript still compiles.

You must either restore the export or migrate dependents in the same change.
`;
}

function typePrivateExplanation(_findings: Finding[]): string {
  return `
**Type imports still create architectural coupling**

Even without runtime code, private types expose internal structure.
Changing them would ripple across packages.

Only public types should cross package boundaries.
`;
}

function relativeEscapeExplanation(_findings: Finding[]): string {
  return `
**Relative paths bypass the architecture**

Cross-package traversal hides dependencies from the system graph.
Package imports keep relationships explicit and safe.
`;
}

const EXPLAINERS: Record<Violation, (f: Finding[]) => string> = {
  boundary_violation: boundaryExplanation,
  deleted_public_api: deletedApiExplanation,
  type_import_private_target: typePrivateExplanation,
  relative_escape: relativeEscapeExplanation,
};

export function generateExplanationSection(report: unknown): string {
  const findings = normaliseFindings(report);
  if (!findings.length) return "";

  const grouped = new Map<Violation, Finding[]>();
  for (const f of findings) {
    if (!grouped.has(f.cause)) grouped.set(f.cause, []);
    grouped.get(f.cause)!.push(f);
  }

  const sections: string[] = [];
  for (const [cause, group] of grouped) {
    const build = EXPLAINERS[cause];
    if (!build) continue;
    const text = build(group).trim().replace(/\n/g, "\n> ");
    sections.push("### Why this matters\n> " + text);
  }

  if (!sections.length) return "";
  return "\n\n" + sections.join("\n\n");
}
