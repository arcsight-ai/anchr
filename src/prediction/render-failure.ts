/**
 * ANCHR Predictive Failure Rendering.
 * Converts a structural violation into a concrete future runtime failure a developer can imagine.
 * Pure function: violation → classification → evidence → wording. No IO, no timestamps, no banned vocabulary.
 */

import type { Violation, ViolationKind } from "../structural/types.js";

/** Violation as used by the prediction pipeline (structural types contract). */
export type StructuralViolation = Violation;

export type FailureKind =
  | "timeout_cascade"
  | "dropped_event"
  | "duplicate_effect"
  | "stale_read"
  | "partial_initialization"
  | "silent_corruption"
  | "version_mismatch_crash"
  /* v12 runtime-structural only */
  | "hidden_shared_state"
  | "async_init_race"
  | "temporal_coupling"
  | "fanout_side_effects"
  | "circular_responsibility"
  | "implicit_global_dependency"
  | "retry_removed"
  | "stale_read_risk";

export type FailurePrediction = {
  failure_kind: FailureKind | "unknown";
  confidence: "high" | "medium" | "low";
  evidence: string[];
  short_sentence: string;
  causal_chain: string[];
  runtime_symptom: string;
  when_it_happens: string;
};

/** Required mapping: structural cause → FailureKind. No heuristics. */
const CAUSE_TO_FAILURE_KIND: Record<ViolationKind, FailureKind> = {
  boundary_violation: "timeout_cascade",
  type_import_private_target: "silent_corruption",
  relative_escape: "partial_initialization",
  deleted_public_api: "version_mismatch_crash",
  circular_import: "circular_responsibility",
};

/** Vivid, runtime-only wording per failure_kind. No architecture vocabulary. */
const FAILURE_WORDING: Record<
  FailureKind,
  { short_sentence: string; causal_chain: string[]; runtime_symptom: string; when_it_happens: string }
> = {
  timeout_cascade: {
    short_sentence: "Checkout may hang when payment retries during inventory refresh",
    causal_chain: [
      "Caller waits on target service",
      "Target is slow or blocks",
      "Caller blocks",
      "Request times out or hangs",
    ],
    runtime_symptom: "hang",
    when_it_happens: "during retries or under load",
  },
  dropped_event: {
    short_sentence: "Events may be dropped when handler depends on internal emitter state",
    causal_chain: [
      "Handler depends on internal state",
      "Internal refactor changes order or shape",
      "Handler receives unexpected payload",
      "Event is dropped or ignored",
    ],
    runtime_symptom: "missing update",
    when_it_happens: "after deploy or internal change",
  },
  duplicate_effect: {
    short_sentence: "Orders may duplicate after webhook retry on slow database",
    causal_chain: [
      "Retry runs same side effect again",
      "Idempotency not enforced across caller and target",
      "Second run commits again",
      "Duplicate charge or duplicate record",
    ],
    runtime_symptom: "duplicate charge",
    when_it_happens: "after retry",
  },
  stale_read: {
    short_sentence: "Cart may show stale totals when cache is written from another path",
    causal_chain: [
      "Two code paths read and write same cache key",
      "One path writes without invalidating the other",
      "Reader sees old value",
      "Stale data returned",
    ],
    runtime_symptom: "stale data",
    when_it_happens: "when cache expires or after concurrent write",
  },
  partial_initialization: {
    short_sentence: "Service may fail on cold start when init order depends on file layout",
    causal_chain: [
      "Init order depends on file or load order",
      "Refactor changes order",
      "Required component not ready",
      "Read or call fails on cold start",
    ],
    runtime_symptom: "intermittent crash",
    when_it_happens: "on cold start",
  },
  silent_corruption: {
    short_sentence: "Billing may write wrong totals when private type shape changes at runtime",
    causal_chain: [
      "Private type flows across call sites",
      "Target changes shape or defaults",
      "Caller still uses old shape",
      "Wrong value written or persisted",
    ],
    runtime_symptom: "silent corruption",
    when_it_happens: "after target package deploy",
  },
  version_mismatch_crash: {
    short_sentence: "App may crash on startup when caller still uses removed API",
    causal_chain: [
      "Public API is removed or changed",
      "Caller still references and calls it",
      "Resolution or call fails at load time",
      "Process crashes or fails to start",
    ],
    runtime_symptom: "reset state",
    when_it_happens: "during deploy",
  },
  /* v12 runtime-structural */
  hidden_shared_state: {
    short_sentence: "If two requests mutate the same top-level state, this will corrupt data or leak across users.",
    causal_chain: [
      "Top-level mutable binding is used in two or more files",
      "It is mutated outside the declaring file",
      "Concurrent or interleaved requests touch the same binding",
      "Wrong value or cross-request leak",
    ],
    runtime_symptom: "corrupt data or leak across users",
    when_it_happens: "under concurrency or request interleaving",
  },
  async_init_race: {
    short_sentence: "If init runs without await and is read before resolution, this will fail on cold start or first run.",
    causal_chain: [
      "Async function is invoked without await",
      "Result is stored at top-level scope",
      "Same file reads it before resolution",
      "Read sees unresolved promise or wrong value",
    ],
    runtime_symptom: "fail on cold start or first run",
    when_it_happens: "on first execution or cold start",
  },
  temporal_coupling: {
    short_sentence: "If call order is not guaranteed, this will behave nondeterministically or fail.",
    causal_chain: [
      "Shared boolean or state flag controls behavior",
      "Two or more exported functions rely on it",
      "No structural ordering guarantee",
      "Call order varies by caller",
    ],
    runtime_symptom: "behave nondeterministically or fail",
    when_it_happens: "when call order varies",
  },
  fanout_side_effects: {
    short_sentence: "If one entry writes to multiple targets or triggers a write chain, this will cascade or leave partial state.",
    causal_chain: [
      "One entry function writes to two or more targets",
      "Or write leads to event then write",
      "No single transaction scope",
      "Cascading mutation or inconsistent state",
    ],
    runtime_symptom: "cascade or leave partial state",
    when_it_happens: "when one path triggers multiple writes",
  },
  circular_responsibility: {
    short_sentence: "If call sites form a cycle, this will recurse or sync state inconsistently.",
    causal_chain: [
      "Cycle across units or mutual calls between call sites",
      "No clear init or call order",
      "Recursive propagation or state sync",
      "Inconsistent state or stack overflow",
    ],
    runtime_symptom: "recurse or sync state inconsistently",
    when_it_happens: "when the cycle is exercised at runtime",
  },
  implicit_global_dependency: {
    short_sentence: "If code reads process.env or global without injection, this will diverge by environment.",
    causal_chain: [
      "Direct use of process.env or global object",
      "No injection or config visible",
      "Accessed in two or more execution paths",
      "Behavior differs by env or host",
    ],
    runtime_symptom: "diverge by environment",
    when_it_happens: "when env or host differs from expectation",
  },
  retry_removed: {
    short_sentence: "If retry was removed and external IO remains, this will escalate transient failures.",
    causal_chain: [
      "Diff removes retry loop",
      "External IO remains",
      "No compensating mechanism added",
      "Transient failure becomes hard failure",
    ],
    runtime_symptom: "escalate transient failures",
    when_it_happens: "when the external call is flaky or slow",
  },
  stale_read_risk: {
    short_sentence: "If cache is read but invalidation or write path was removed, this will serve stale data after mutation.",
    causal_chain: [
      "Cache read is present",
      "Invalidation removed or write path missing",
      "No TTL guard visible",
      "Stale data returned after mutation",
    ],
    runtime_symptom: "serve stale data after mutation",
    when_it_happens: "after a write that no longer invalidates",
  },
};

const UNKNOWN_FALLBACK: FailurePrediction = {
  failure_kind: "unknown",
  confidence: "low",
  evidence: [],
  short_sentence: "This change may introduce a runtime bug, but the failure mode is unclear.",
  causal_chain: [],
  runtime_symptom: "",
  when_it_happens: "",
};

/** Banned words in output (architecture vocabulary ban). */
const BANNED_WORDS = new Set([
  "architecture",
  "layer",
  "boundary",
  "dependency",
  "module",
  "graph",
  "violation",
  "import",
]);

/** Vague words that force low confidence (Vividness Guarantee). */
const VAGUE_WORDS = new Set([
  "issue",
  "problem",
  "unexpected",
  "inconsistent",
  "may fail",
  "might behave incorrectly",
  "edge case",
]);

function collectEvidence(v: StructuralViolation): string[] {
  const items: string[] = [];
  if (v.path) items.push(`caller_path:${v.path}`);
  if (v.package) items.push(`package:${v.package}`);
  if (v.specifier) items.push(`target_spec:${v.specifier}`);
  if (v.proof?.source) items.push(`proof_source:${v.proof.source}`);
  if (v.proof?.target) items.push(`proof_target:${v.proof.target}`);
  items.sort((a, b) => a.localeCompare(b, "en"));
  return items.slice(0, 4);
}

function containsBannedWord(text: string): boolean {
  const lower = text.toLowerCase();
  for (const w of BANNED_WORDS) {
    if (lower.includes(w)) return true;
  }
  return false;
}

function containsVagueWord(text: string): boolean {
  const lower = text.toLowerCase();
  for (const w of VAGUE_WORDS) {
    if (lower.includes(w)) return true;
  }
  return false;
}

function confidenceFrom(
  failureKind: FailureKind | "unknown",
  evidenceCount: number,
  shortSentence: string,
  causalChain: string[],
): "high" | "medium" | "low" {
  if (failureKind === "unknown") return "low";
  if (containsVagueWord(shortSentence)) return "low";
  for (const step of causalChain) {
    if (containsVagueWord(step)) return "low";
  }
  if (evidenceCount >= 3 && shortSentence.length <= 140) return "high";
  if (evidenceCount >= 2) return "medium";
  return "low";
}

/**
 * Pure: violation → failure prediction. Deterministic; no IO, no timestamps, no env.
 * Pipeline: violation → classification → evidence → wording.
 */
export function renderFailurePrediction(violation: StructuralViolation): FailurePrediction {
  const cause = violation.cause;
  const failureKind: FailureKind | "unknown" =
    (CAUSE_TO_FAILURE_KIND as Record<ViolationKind, FailureKind | undefined>)[cause] ?? "unknown";

  const evidence = collectEvidence(violation);
  if (evidence.length < 2 && failureKind !== "unknown") {
    return {
      ...UNKNOWN_FALLBACK,
      evidence: evidence.slice().sort((a, b) => a.localeCompare(b, "en")),
    };
  }

  if (failureKind === "unknown") {
    return {
      ...UNKNOWN_FALLBACK,
      evidence: evidence.slice().sort((a, b) => a.localeCompare(b, "en")),
    };
  }

  const wording = FAILURE_WORDING[failureKind];
  const short_sentence = wording.short_sentence;
  const causal_chain = wording.causal_chain.slice(0, 4);
  const runtime_symptom = wording.runtime_symptom;
  const when_it_happens = wording.when_it_happens;

  if (containsBannedWord(short_sentence) || causal_chain.some(containsBannedWord)) {
    return {
      ...UNKNOWN_FALLBACK,
      evidence: evidence.slice().sort((a, b) => a.localeCompare(b, "en")),
    };
  }

  const confidence = confidenceFrom(failureKind, evidence.length, short_sentence, causal_chain);

  return {
    failure_kind: failureKind,
    confidence,
    evidence,
    short_sentence,
    causal_chain,
    runtime_symptom,
    when_it_happens,
  };
}
