# ANCHR Projection Audit — Full Hardened Version

**Mode:** ANCHR PROJECTION AUDIT (STRICT).  
**Prerequisite:** Wedge (truth layer) is sealed and verified. Engine emission v10 schema is complete.

---

## Scope Boundary

**This audit verifies projection fidelity only.** It does not certify UX quality, performance optimizations, or future schema evolution strategy. It does not cover observability logging, metrics enforcement, version governance, deployment discipline, operational monitoring, performance SLAs, or CI enforcement language. Those belong in product governance, not projection fidelity.

**Do NOT:** Modify wedge. Modify schema. Introduce new logic. "Improve" UX during this audit.

**Philosophy lock:** Projection is a **lossless, deterministic identity transform** over wedge emission. Everything else in this audit derives from that.

---

## Non-Negotiable Rule

Anchr must:

- **Add zero truth**
- **Remove zero truth**
- **Recompute zero truth**
- **Reorder zero truth**
- **Mask zero truth**
- **Truncate zero truth**

Mutation = **projection blind spot.**

---

## Core Guarantee

For any wedge v10 emission:

**Wedge JSON → Anchr parse → Anchr render → Re-serialize**  
must produce **byte-identical** JSON.

This subsumes deep structural equality (Phase 1), deterministic rendering (Phase 7), and round-trip guarantee (Phase 10): one principle, byte-level equivalence across parse → render → serialize cycles.

---

## Fail-Fast Discipline

- On **first** detection of projection mutation (add/remove/recompute/reorder/mask/truncate), **fail immediately**.
- **No** best-effort rendering. **No** fallback to partial output. **No** "continue and report at end."
- Single mutation → audit result FAIL; stop or mark and do not certify.

---

## Ban on "Helpful Formatting"

Anchr must **not** introduce display-level formatting in the data model layer. No label substitution, enum prettification, or casing changes applied to wedge fields when storing or re-serializing. That is where projection bugs sneak in: "helpful" formatting mutates truth.

---

## Test Inputs

Use **raw wedge v10 emission JSON**. Test with:

| # | Scenario | Purpose |
|---|----------|---------|
| 1 | VALID repo | Null causes; empty all_failures; status fidelity. |
| 2 | Single INVALID | One failure; primary = only entry; type fidelity. |
| 3 | Multiple INVALID (≥3, mixed priority) | Order preservation; no deduplication; no truncation. |
| 4 | DEGRADED-only | degradation_cause set; invalid_cause null. |
| 5 | Large 5k–20k file repo | Large payload stability; no dropped failures; no silent truncation. |
| 6 | Circular dependency case | Failure set present; status INVALID. |
| 7 | Version_missing | Schema drift guard; explicit reject or version branch. |
| 8 | Envelope with full failure set | all_failures and invariants_evaluated integrity. |

---

## Phase 1 — Deep Structural Equality

- Parse wedge JSON. Parse anchr internal model (or anchr output after consuming wedge).
- Assert **deep equality:**  
  `JSON.stringify(wedge, canonicalKeys) === JSON.stringify(anchrModel, canonicalKeys)`  
  (or equivalent: same keys, same values, same nesting; no key reordering, removal, or addition; no default injection.)
- Fail on any mismatch.

**Lock:** No shallow checks. Full structure must match.

**Field order preservation:** Key order in serialized JSON must match wedge emission order. Even if deep-equality passes, key-order drift breaks byte-level determinism and future hashing. Assert: after re-serialize, key order (top-level and in nested objects) is identical to wedge.

---

## Phase 2 — Unknown Field Guard

- If wedge emits any field **not** explicitly handled by anchr, anchr must either:
  - **Preserve it verbatim** (pass-through), or
  - **Explicitly reject** with a version/schema error.
- **Never** silently drop unknown fields.
- **Test:** Inject a dummy field into wedge JSON (e.g. `"future_wedge_field": true`). Assert anchr either forwards it or rejects with clear error. No silent drop.

---

## Phase 3 — Strict Type Fidelity

Assert identical **types** for every field:

| Field | Required type | No |
|-------|----------------|-----|
| schema_version | number | stringification of numbers; coercion |
| representation_status | string | boolean or number |
| primary_invariant | string \| null | undefined; empty string for null |
| invalid_cause | string \| null | undefined normalization |
| degradation_cause | string \| null | same |
| priority_table_version | string | number or null |
| invariant_id (in all_failures) | string | number or object |
| cause_code | string | number or null |
| terminal_state | string | boolean |

No stringification of numbers. No coercion. No boolean conversion. No undefined normalization.

---

## Phase 4 — Failure Array Integrity

Assert:

- `all_failures` **length** identical to wedge.
- **Order** identical (same index ⇒ same object).
- **Each** object deep-equal (invariant_id, cause_code, priority, terminal_state).
- **No** deduplication.
- **No** sorting (wedge order is canonical).
- **No** truncation.
- **No** "top N" or cap.

---

## Phase 5 — invariants_evaluated Integrity

Assert:

- **Length** identical to wedge.
- **Order** identical.
- **No** missing entries.
- **No** synthetic entries.
- **No** filtering.

---

## Phase 6 — Status Fidelity

For each scenario, assert identical:

- representation_status
- primary_invariant
- invalid_cause
- degradation_cause

Anchr must **NOT**:

- Recompute severity.
- Collapse DEGRADED into something else.
- Promote a non-primary failure to primary.
- Apply UI severity overrides that change status or cause.

---

## Phase 7 — Deterministic Rendering

- Same wedge JSON → render twice (e.g. anchr format, CLI output, or re-serialization).
- Assert **identical** serialized output (byte or string equality).
- **No** timestamps. **No** random IDs. **No** environment branching. **No** locale-dependent formatting. **No** unstable ordering.
- **Unicode / encoding stability:** Same wedge JSON with non-ASCII must produce identical bytes when re-serialized. No encoding-dependent normalization unless wedge specifies it. No lossy encoding on pass-through.

---

## Phase 8 — Large Payload Stability

For large emission (e.g. 5k–20k file repo, or all_failures with hundreds of entries):

Assert:

- **No** dropped failures.
- **No** silent truncation.
- **No** performance-based filtering.
- Rendering **completes** without mutating the emission.

**UI constraint:** If UI caps results (e.g. "show top N failures"), the cap must be **explicitly declared** in the output and must **not alter underlying data**. The full wedge emission must remain intact; any display limit is metadata only, not a mutation of the data model.

---

## Phase 9 — Null & Edge Handling

Test:

- VALID (null causes, null primary_invariant).
- INVALID (null degradation_cause).
- DEGRADED (null invalid_cause).
- Empty all_failures.
- Full all_failures.

Assert:

- **Null** preserved as `null` (not `"null"`, not `""`, not omitted).
- **No** substitution (e.g. "None", "N/A").
- **No** masking.
- **No** fallback cause injection.

---

## Phase 10 — Round-Trip Guarantee

- Take wedge JSON → pass through anchr (ingest → internal model → re-serialize).
- Compare re-serialized output to **original** wedge JSON.
- Assert **byte-identical** output (or strict JSON equivalence).
- If not identical → **projection mutation exists.**

---

## Phase 11 — Corruption Handling

- Feed **malformed** JSON (truncated, invalid UTF-8, missing bracket, wrong type).
- Assert:
  - **Explicit rejection** (error, non-zero exit, or explicit "invalid" state).
  - **No** silent partial parsing.
  - **No** auto-fix behavior (e.g. inserting missing fields).

---

## Phase 12 — Schema Drift Guard

- If `schema_version !== 10` in wedge JSON:
  - Anchr must **reject** (refuse to process, clear error), **or**
  - **Explicitly** branch version logic (e.g. "v11 handler") with documented behavior.
- **Never** silently accept unknown schema.

---

## Phase 13 — Derived Field Audit

Search codebase for:

- Computed status fields (re-deriving status from failures).
- Aggregated metrics (e.g. "failure count" that is not a direct pass-through).
- Derived severity (e.g. mapping cause_code to a different severity for display).
- Client-side re-evaluation of primary/secondary.
- Failure regrouping or re-sorting for display.
- Summary rewrites that change meaning.

**If present** → log location. Treat as potential projection mutation (add/recompute truth).

**Explicit "no derived metrics" enforcement:** Anchr must not compute or emit any metric derived from the emission (e.g. "failure_count", "severity_score", "summary") unless it is a literal pass-through of a wedge field. Any derived metric = projection adding truth. Scan for and list such logic; require removal or explicit justification (e.g. documented UI-only, never substituted for wedge fields).

---

## Phase 14 — Backward Compatibility

- Ensure existing callers (CLI, CI, scripts) still receive **identical** API surface for the v10 emission.
- **No** breaking changes to consumed fields or semantics.
- New fields may be added by wedge; anchr must preserve or reject, not drop.

---

## Phase 15 — Environment Independence

Test under (when feasible):

- Different Node versions (e.g. 18 vs 20).
- Different OS (e.g. Linux vs macOS; Windows if available).
- Different timezone.

**Output** (re-serialized emission or anchr output derived from same wedge JSON) must remain **identical**. No env-dependent branching in projection.

---

## Required Checks (Summary)

1. Deep structural equality (no shallow checks).
2. **Key order preserved** (serialized JSON key order matches wedge).
3. Unknown fields preserved verbatim or explicitly rejected.
4. Strict type fidelity (no coercion or normalization).
5. all_failures[] identical (length, order, entries).
6. invariants_evaluated[] identical.
7. representation_status + primary_invariant + causes identical.
8. Null preserved as null (no substitution).
9. No derived fields or recomputation.
10. No truncation under large payload; UI cap (if any) explicit and data unchanged.
11. No environment / time / random variance.
12. Corrupted input → explicit reject.
13. schema_version !== 10 → reject or explicit branch.

---

## Reporting

Produce a **strict structured report** with one outcome per line.

| Check | Result |
|-------|--------|
| Deep equality | PASS / FAIL |
| Key order preservation | PASS / FAIL |
| Unknown field handling | PASS / FAIL |
| Type fidelity | PASS / FAIL |
| Failure array integrity | PASS / FAIL |
| invariants_evaluated integrity | PASS / FAIL |
| Status fidelity | PASS / FAIL |
| Deterministic rendering | PASS / FAIL |
| Large payload stability | PASS / FAIL |
| Null handling | PASS / FAIL |
| Round-trip guarantee (byte-identical) | PASS / FAIL |
| Corruption handling | PASS / FAIL |
| Schema drift guard | PASS / FAIL |
| Derived field scan | findings (list locations or "none") |
| Projection blind spots | list (or "none") |

**All must PASS.** Any FAIL → projection defect; fix wiring before certifying.

**Pass means frozen:** If all phases PASS, projection logic is **frozen** and may not be modified without re-running this full audit. Any future change to projection behavior requires re-certification.

---

## Final Constraint

**Do not "fix" during audit.** Only observe. Mutation = product defect. Record results; remediate in a separate change.

---

## Success Condition

If this audit passes:

- ArcSight pipeline is sealed: **truth layer (wedge)** + **projection layer (anchr)**.
- No structural blind spots (wedge emits completely and deterministically).
- No projection blind spots (anchr adds zero, removes zero, recomputes zero, reorders zero, masks zero, truncates zero).
- End-to-end integrity proven.

---

## Optional Next

- **Final end-to-end ArcSight certification contract** (single document tying wedge + projection + regression + CI).
- **Minimal 8-test high-confidence version** for faster iteration (subset of phases with highest leverage).

---

## Appendix: Mutation Examples (Forbidden)

Not additional rules — concrete examples of forbidden behavior so future engineers cannot rationalize small changes:

| Mutation | Forbidden |
|----------|-----------|
| Recomputing representation_status from failures | Yes. Status is wedge truth; do not derive. |
| Filtering DEGRADED entries from display or export | Yes. All entries are part of emission; no filtering. |
| Sorting failures differently (e.g. by severity for UX) | Yes. Order is canonical; no re-sort. |
| Substituting null with "None", "", or omitting | Yes. Null is null; no substitution. |

---

*End of ANCHR Projection Audit — Full Hardened Version.*
