# Engine Emission Verification v1 (ArcSight-Wedge Only)

**Purpose:** Gate before the full Blind Spot Contract v2. Verify that the engine (ArcSight-wedge) **emits** every failure class it claims to detect — deterministically, completely, and observably.

**Scope:** Truth layer only. No anchr projection audit. No new invariants. No representation expansion.

**Question:** Does ArcSight-wedge actually emit every invariant/failure type it is supposed to, in a form that can be observed and verified?

---

## 1. What Must Be Proven

For **each** invariant and failure type (INV-TREE, INV-COV, INV-RES, INV-DIFF, INV-NSS, INV-G, INV-S, INV-M, INV-D, INV-B; and each cause code: UNVISITED_SUBTREE, PARTIAL_GRAPH, UNRESOLVED_IMPORTS_WITHOUT_LOG, INCOMPLETE_DIFF_GRAPH, SILENT_SUCCESS_VIOLATION, EMPTY_MONOREPO_MAP, BOUNDARY_SKIP, EMPTY_GRAPH_WITH_SOURCE_FILES, LAYOUT_OR_MAP_INVALID, NON_DETERMINISTIC, plus DEGRADED causes):

| # | Requirement | Meaning |
|---|-------------|---------|
| 1 | **Structured emission** | When the failure is triggered, the engine produces a machine-readable emission (not only logs). |
| 2 | **Emission shape** | Emission includes: `invariant_id`, `cause_code`, `priority`, `terminal_state` (VALID / DEGRADED / INVALID). |
| 3 | **Present in JSON output** | The emission appears in the report JSON (or in a designated structured output stream that CI consumes). No emission only in stderr without a corresponding structured field. |
| 4 | **Cannot be dropped silently** | No code path that triggers the failure but omits the emission (e.g. catch block that swallows and returns VERIFIED). Contract: INV-NSS and terminal-state rules forbid VALID when any invariant failed. |
| 5 | **Multi-failure secondary list** | When multiple invariants fail, the primary is emitted as terminal cause and **all** others appear in a secondary list (e.g. `invariant_failures` or `all_failures`) in deterministic order. No failure is dropped from the list. |
| 6 | **Survives CLI formatting** | If the engine is invoked via CLI (e.g. `npx tsx scripts/...`), the emission is present in the output (report file or structured stderr) after the CLI formats and exits. No truncation or overwrite. |
| 7 | **Survives CI execution** | When run inside CI (e.g. validation-20pr-run), the emission is present in the artifact (result JSON or log) that CI retains. CI does not strip or filter it. |
| 8 | **Byte-stable across identical runs** | For the same repo state and config, two runs produce identical bytes for the emission (same JSON field values, same ordering of secondary list). No timestamps or non-deterministic IDs in the emission. |

If the engine **cannot** emit a failure type when it is triggered → **structural blind spot.**  
If the engine emits but **anchr** later hides or distorts it → **projection blind spot.**  
This verification isolates the first; do not conflate with the second.

---

## 2. Required Emission Schema (Contract v10 / B.2)

The engine output must include (when not VALID) at least:

| Field | Type | Required when |
|-------|------|----------------|
| `representation_status` | "VALID" \| "DEGRADED" \| "INVALID" | Always |
| `invalid_cause` or `degradation_cause` | string (enum) | When status is INVALID or DEGRADED |
| `primary_invariant` | string (invariant_id) | When status is not VALID |
| `all_failures` or `invariant_failures` | array of { invariant_id, cause_code, priority } | When status is not VALID (primary + secondary) |
| `representation_version` | string (e.g. "v10") | Always (B.2) |
| `priority_table_version` | string (date or version) | Always (B.2) |
| `invariants_evaluated` | array of invariant_id | Always |

Emission is **complete** only if every triggered failure appears in `all_failures` (or equivalent) and the primary is reflected in `invalid_cause`/`degradation_cause` and `primary_invariant`.

---

## 3. Verification Checklist (Per Failure Type)

For each cause code, perform:

| Step | Action | Pass criterion |
|------|--------|----------------|
| 3.1 | Construct a minimal repo or scenario that **triggers** this failure (and no other, if possible). | Repo/scenario is documented and reproducible. |
| 3.2 | Run the engine (structural audit) against it. | Run completes (exit 0 or non-zero as expected). |
| 3.3 | Inspect report JSON (or structured output). | Field `representation_status` exists and is INVALID or DEGRADED when failure is triggered. |
| 3.4 | Inspect `invalid_cause` or `degradation_cause`. | Value matches the expected cause code for this failure. |
| 3.5 | Inspect `primary_invariant`. | When this failure is the only one (or highest priority), value matches the invariant that was triggered. |
| 3.6 | Inspect `all_failures` (or equivalent). | At least one entry has invariant_id and cause_code for this failure. In multi-failure scenario, all triggered failures appear; order is deterministic (priority, then invariant_id). |
| 3.7 | Run the same scenario again (identical repo + config). | Report JSON (emission portion) is byte-identical to first run. |
| 3.8 | Run via CLI (e.g. `npx tsx scripts/cli.ts audit ...`). | Emission is present in the output (report file or designated stream). |
| 3.9 | Run via CI path (e.g. validation-20pr-run for a single PR that triggers this failure). | Emission is present in the result JSON (or CI-retained artifact). |

If any step fails → emission is **incomplete** or **unstable** for that failure type. Document the gap; do not proceed to full blind spot audit as if emissions were complete.

---

## 4. Invariant and Cause Code Coverage

| invariant_id | cause_code(s) | Priority | Terminal | Verified? (Y/N/Gap) |
|--------------|---------------|----------|----------|---------------------|
| INV-TREE | UNVISITED_SUBTREE | 1 | INVALID | |
| INV-COV | PARTIAL_GRAPH, PARTIAL_GRAPH_ALLOWED | 2 | INVALID, DEGRADED | |
| INV-RES | UNRESOLVED_IMPORTS_WITHOUT_LOG, OPTIONAL_RESOLVER_DISABLED | 3 | INVALID, DEGRADED | |
| INV-DIFF | INCOMPLETE_DIFF_GRAPH | 4 | INVALID | |
| INV-NSS | SILENT_SUCCESS_VIOLATION, EMPTY_MONOREPO_MAP, BOUNDARY_SKIP | 5 | INVALID | |
| INV-G | EMPTY_GRAPH_WITH_SOURCE_FILES | 6 | INVALID | |
| INV-M, INV-S | LAYOUT_OR_MAP_INVALID, EMPTY_MONOREPO_MAP | 7 | INVALID | |
| INV-D | NON_DETERMINISTIC | 8 | INVALID | |
| INV-B | BOUNDARY_SKIP | 9 | INVALID | |

**Gap:** Current engine (anchr structural audit) does **not** yet emit `representation_status`, `invalid_cause`, `primary_invariant`, or `all_failures` in the report JSON. Report shape is status/minimalCut/decision/classification, not the v10 emission schema. So **Verified?** for all rows is **Gap** until the engine is updated to emit per contract v10 and B.2.

---

## 5. Current Status (Implementation vs Contract)

| Item | Contract (v10 / B.2) | Current engine behavior | Verdict |
|------|----------------------|--------------------------|---------|
| representation_status | Required (VALID/DEGRADED/INVALID) | Not emitted; report has status (VERIFIED/BLOCKED) and decision.level | **Gap** |
| invalid_cause / degradation_cause | Required when not VALID | Not emitted | **Gap** |
| primary_invariant | Required when not VALID | Not emitted | **Gap** |
| all_failures / invariant_failures | Required when not VALID (primary + secondary) | Not emitted; minimalCut is policy-level, not invariant-level | **Gap** |
| representation_version, priority_table_version | Required (B.2) | Not emitted | **Gap** |
| invariants_evaluated | Required | Not emitted | **Gap** |
| Terminal state prevents VALID when invariant failed | INV-NSS, failure modes | Implementation can produce VERIFIED with empty map (boundary skipped) | **Gap** |
| Multi-failure secondary list | Collect all, emit primary + secondary | No collect-then-select; no secondary list | **Gap** |
| Byte-stable identical runs | INV-D, CI reproducibility | Not yet stress-tested; stableStringify used for report | **Partial** (likely but unverified) |

**Conclusion:** Engine emission verification **cannot** be completed until the engine emits the v10/B.2 schema. Until then, every failure type is **Gap** for requirements 1–7; requirement 8 (byte-stable) is testable on current output but the emission content itself is missing. This document is the **gate**: complete Phase A (this verification) before treating the full blind spot audit as grounded in observable emissions.

---

## 6. Audit Flow (Where This Sits)

| Phase | Document / Activity | Purpose |
|-------|---------------------|---------|
| **Phase A** | **ENGINE-EMISSION-VERIFICATION-v1** (this doc) | Confirm engine truth surface is complete: every failure type is emitted, structured, observable, and byte-stable. |
| Phase B | BLIND-SPOT-CONTRACT-v2 (engine layer) | Attempt to break guarantees conceptually; risk synthesis. |
| Phase C | Projection audit (anchr) | Ensure nothing is filtered or distorted between engine and user/CI. |
| Phase D | Statistical validation (pilot / labs) | Validate signal quality and real-world impact. |

Do not run Phase B under the assumption that emissions are complete until Phase A passes (all rows in §4 verified, or gaps documented and accepted as implementation backlog).

---

## 7. What Not To Do

- Do **not** expand representation or add new invariants in this step.
- Do **not** add new meta-layers to the contract.
- Do **not** jump back into structural tightening.
- Do **not** audit anchr (projection) yet.

This is truth-layer validation only: **does the engine emit what it claims?**

---

*End of Engine Emission Verification v1.*
