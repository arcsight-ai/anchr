/**
 * Remediation Planner (Prompt 2). Deterministic human instructions; stable messaging.
 * Same decision → byte-identical text. No timestamps, dynamic counts, or soft language.
 */

import { createHash } from "crypto";
import type { Action } from "../decision/actionLayer.js";
import type { RemediationDecisionInput, RemediationPlan } from "./types.js";

const CAUSE_PRIORITY_ORDER = [
  "boundary_violation",
  "deleted_public_api",
  "private_import",
  "layer_direction",
  "confidence_low",
  "analysis_incomplete",
  "unknown",
] as const;

const MAX_STEPS = 5;
const MAX_COMMIT_GUIDANCE = 3;
const MAX_VERIFICATION = 3;

function normalizeSemanticCauses(causes: string[]): string[] {
  const lower = causes.map((c) => (typeof c === "string" ? c : "").toLowerCase()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of lower) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "en"));
}

function primaryCauseFromCauses(normalizedCauses: string[]): string {
  const set = new Set(normalizedCauses);
  for (const p of CAUSE_PRIORITY_ORDER) {
    if (set.has(p)) return p;
  }
  return "unknown";
}

function messageId(action: string, primaryCause: string): string {
  const payload = action + ":" + primaryCause;
  return createHash("sha1").update(payload, "utf8").digest("hex").slice(0, 16);
}

function clampSteps(steps: string[], max: number): string[] {
  return steps.slice(0, max);
}

const TEMPLATES: Record<
  Action,
  { summary: string; steps: string[]; commitGuidance: string[]; verification: string[]; education: string }
> = {
  proceed: {
    summary: "This change is architecturally safe.",
    steps: ["No action required."],
    commitGuidance: ["Merge normally."],
    verification: ["ANCHR verified structural integrity."],
    education: "No boundary rules were violated.",
  },
  "require-review": {
    summary: "ANCHR could not fully prove safety.",
    steps: [
      "Review affected dependency relationships.",
      "Confirm no behavioral coupling introduced.",
    ],
    commitGuidance: ["Add reviewer responsible for affected package."],
    verification: ["Manual verification required before merge."],
    education: "Static analysis confidence was insufficient.",
  },
  "require-adapter": {
    summary: "Private dependency usage detected.",
    steps: [
      "Expose required behavior through public export.",
      "Replace private import with public import.",
    ],
    commitGuidance: ["Introduce stable interface before merge."],
    verification: ["Re-run ANCHR after refactor."],
    education: "Packages must depend only on public APIs.",
  },
  "require-migration": {
    summary: "Public API removal detected.",
    steps: ["Restore export OR update dependents."],
    commitGuidance: ["Coordinate change across packages."],
    verification: ["All affected packages must pass ANCHR."],
    education: "Public APIs are compatibility contracts.",
  },
  "fix-architecture": {
    summary: "Architectural boundary violation detected.",
    steps: [
      "Move shared logic to owning package.",
      "OR introduce interface package.",
      "OR invert dependency direction.",
    ],
    commitGuidance: ["Do not merge until dependency direction is corrected."],
    verification: ["ANCHR must return VERIFIED."],
    education: "Dependencies must follow layer direction.",
  },
  "rerun-analysis": {
    summary: "Analysis incomplete.",
    steps: ["Re-run CI.", "Ensure repository builds locally."],
    commitGuidance: ["Do not merge until analysis stabilizes."],
    verification: ["ANCHR must produce deterministic output."],
    education: "Non-deterministic analysis indicates missing information.",
  },
};

/**
 * Returns a deterministic remediation plan. Same decision + same semanticCauses → identical output.
 * No timestamps, dynamic counts, filenames, or randomness.
 */
export function planRemediation(decision: RemediationDecisionInput): RemediationPlan {
  const causes = normalizeSemanticCauses(decision.semanticCauses ?? []);
  const primaryCause = primaryCauseFromCauses(causes);
  const mid = messageId(decision.action, primaryCause);

  const t = TEMPLATES[decision.action];
  const summary = t.summary;
  const steps = clampSteps(t.steps, MAX_STEPS);
  const commitGuidance = clampSteps(t.commitGuidance, MAX_COMMIT_GUIDANCE);
  const verification = clampSteps(t.verification, MAX_VERIFICATION);
  const education = t.education;

  return {
    summary,
    steps,
    commitGuidance,
    verification,
    education,
    metadata: {
      version: "1",
      action: decision.action,
      primaryCause,
      messageId: mid,
    },
  };
}
