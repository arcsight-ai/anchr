/**
 * ANCHR convergence advisor (Prompt 11). Suggests next architectural direction
 * only when the path is certifiable and gates pass. Prevents infinite fix loops.
 */

import type { AdvisorInput } from "./types.js";
import { isAdvisable } from "./gates.js";
import { getCertifiableGuidance } from "./guidance.js";
import { wouldRepeatTooMuch } from "./dedupe.js";

const SECTION_TITLE = "Next architectural direction";

/**
 * Returns "Next architectural direction\n\n<2–4 sentences>" or "".
 * Only outputs when: ADAPTABLE cause, not PROHIBITED, ≤3 violations, single cause,
 * certifiable guidance exists, and suggestion does not repeat >40% of explanation/reasoning.
 */
export function getNextDirection(input: AdvisorInput): string {
  if (!input.primaryCause) return "";

  if (!isAdvisable({ primaryCause: input.primaryCause, violations: input.violations })) {
    return "";
  }

  const guidance = getCertifiableGuidance(input.primaryCause);
  if (!guidance) return "";

  if (wouldRepeatTooMuch(guidance, input.explanation, input.reasoning)) {
    return "";
  }

  return `${SECTION_TITLE}\n\n${guidance}`;
}

export type { AdvisorInput } from "./types.js";
