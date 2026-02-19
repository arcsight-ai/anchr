/**
 * Human Law Formatter — Stable Narrative Contract.
 * Converts a structural result into a causal explanation derived only from
 * a normalized narrative key. Same change → same sentence forever.
 * Do not depend on report structure, order, or ArcSight version.
 */

export type ArcSightReportLike = {
  status?: string;
  decision?: { level?: string };
  classification?: { primaryCause?: string | null };
  minimalCut?: string[];
};

export type NarrativeSeverity =
  | "deleted_public_api"
  | "boundary_violation"
  | "type_import_private_target"
  | "relative_escape"
  | "indeterminate"
  | "verified";

export interface NarrativeKey {
  severity: NarrativeSeverity;
  subject: string;
  dependency: string;
}

const SEVERITY_ORDER: NarrativeSeverity[] = [
  "deleted_public_api",
  "boundary_violation",
  "type_import_private_target",
  "relative_escape",
  "indeterminate",
  "verified",
];

/** Normalize minimalCut to sorted package names only. Deterministic. */
function normalizedPackages(minimalCut: string[]): string[] {
  if (!Array.isArray(minimalCut)) return [];
  const set = new Set<string>();
  for (const entry of minimalCut) {
    if (typeof entry !== "string") continue;
    const first = entry.split(":")[0]?.trim();
    if (first) set.add(first.replace(/^packages\/+/, "").trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b, "en"));
}

/**
 * Derive the narrative key from the report. Only this key is used for formatting.
 * Severity: highest present cause only. Subject/dependency from first valid pair in normalized packages.
 */
export function deriveNarrativeKey(report: ArcSightReportLike): NarrativeKey {
  const status = (report.status ?? "").trim();
  const level = (report.decision?.level ?? "warn").trim();
  const primaryCause = (report.classification?.primaryCause ?? null) as string | null;
  const packages = normalizedPackages(report.minimalCut ?? []);

  if (status === "VERIFIED" && level === "allow") {
    return { severity: "verified", subject: "", dependency: "" };
  }

  if (
    status === "INDETERMINATE" ||
    status === "INCOMPLETE" ||
    level === "warn"
  ) {
    return { severity: "indeterminate", subject: "", dependency: "" };
  }

  const causeSeverity = primaryCause as NarrativeSeverity | null;
  const severity: NarrativeSeverity =
    causeSeverity && SEVERITY_ORDER.includes(causeSeverity)
      ? causeSeverity
      : "indeterminate";

  const first = packages[0] ?? "";
  const second = packages[1] ?? "";

  switch (severity) {
    case "deleted_public_api":
    case "relative_escape":
      return { severity, subject: first, dependency: "" };
    case "boundary_violation":
    case "type_import_private_target":
      return { severity, subject: first, dependency: second };
    default:
      return { severity, subject: "", dependency: "" };
  }
}

/**
 * Format the law from the narrative key only. Max 3 lines. Second person. Plain English.
 * Never read report fields after deriving the key.
 */
export function formatLaw(report: ArcSightReportLike): string {
  const key = deriveNarrativeKey(report);

  switch (key.severity) {
    case "verified":
      return (
        "You changed code without changing behavior.\n" +
        "Nothing else in the system will act differently."
      );
    case "deleted_public_api": {
      const subj = key.subject || "a package";
      return (
        `You removed part of ${subj}'s public contract.\n` +
        "Code that depends on it will fail the next time it runs."
      );
    }
    case "boundary_violation": {
      const subj = key.subject || "one package";
      const dep = key.dependency || "another";
      return (
        `You made ${subj} rely on internal code from ${dep}.\n` +
        `When ${dep} changes, ${subj} can break without being updated.`
      );
    }
    case "type_import_private_target": {
      const dep = key.dependency || "another package";
      return (
        `You depended on non-public types from ${dep}.\n` +
        "Future refactors can silently invalidate your assumptions."
      );
    }
    case "relative_escape":
      return (
        "You reached outside the package boundary.\n" +
        "Moving files will change behavior unexpectedly."
      );
    case "indeterminate":
    default:
      return (
        "This change has effects the system cannot fully trace.\n" +
        "A hidden dependency path may behave differently later."
      );
  }
}
