# Representation Contract v10 — Deterministic Failure Precedence

Deterministic failure precedence pass. Same repo state and config → same terminal state and same primary cause code, independent of evaluation order.

**Relationship:** v10 upgrades Representation Contract v9. Policy v1 and Regression v1 unchanged. All invariant failures remain covered; selection of **which** failure is emitted as terminal cause is now deterministic and stable.

---

## 1. Global Invariant Priority Order

Strict, total ordering. Highest severity first. Used only to select the **primary** cause when multiple invariants fail; all failures are still collected and logged.

| Priority (1 = highest) | Invariant | Cause code(s) | Rationale |
|------------------------|-----------|---------------|-----------|
| 1 | INV-TREE | UNVISITED_SUBTREE | Traversal incomplete; S may be wrong; downstream checks unreliable. |
| 2 | INV-COV | PARTIAL_GRAPH (or PARTIAL_GRAPH_ALLOWED → DEGRADED) | Graph incomplete; coverage violated. |
| 3 | INV-RES | UNRESOLVED_IMPORTS_WITHOUT_LOG, OPTIONAL_RESOLVER_DISABLED | Edges missing; resolver gap. |
| 4 | INV-DIFF | INCOMPLETE_DIFF_GRAPH | (Diff mode only) Base or head graph incomplete. |
| 5 | INV-NSS | SILENT_SUCCESS_VIOLATION, EMPTY_MONOREPO_MAP, BOUNDARY_SKIP | No silent success; structural skip. |
| 6 | INV-G | EMPTY_GRAPH_WITH_SOURCE_FILES | Graph structural. |
| 7 | INV-S / INV-M | LAYOUT_OR_MAP_INVALID, EMPTY_MONOREPO_MAP | Layout / package map structural. |
| 8 | INV-D | NON_DETERMINISTIC | Determinism violated. |
| 9 | INV-B | BOUNDARY_SKIP | Boundary evaluation skipped. |

**Properties:**

- **Explicit:** Order is fixed in this document. No "implementation-defined" order.
- **Stable:** Order does not change between runs or versions without a contract change.
- **Documented:** This table is the single source of truth.
- **Non-overlapping:** Each invariant has exactly one priority rank. INV-S and INV-M share rank 7; tie-breaker below applies if both fail.

**Tie-breaker (same priority):** When two or more invariants at the **same** priority fail, select by **lexical order of invariant ID** (e.g. INV-D before INV-M, INV-M before INV-S). Invariant IDs: INV-B, INV-COV, INV-D, INV-DIFF, INV-G, INV-M, INV-NSS, INV-RES, INV-S, INV-TREE. So for priority 7, INV-M < INV-S lexically → if both fail, primary cause = LAYOUT_OR_MAP_INVALID (or EMPTY_MONOREPO_MAP) associated with INV-M first, then INV-S. For a single cause code shared by both (LAYOUT_OR_MAP_INVALID), emit that cause once; the invariant set in the log will list both INV-M and INV-S.

---

## 2. Failure Resolution Rule

During **VALIDATE**:

1. **Evaluate all invariants** (in any order). No short-circuit: do not stop at first failure for the purpose of skipping later checks. Every invariant is evaluated.
2. **Collect all failures** into a set (or list) of (invariant_id, cause_code) pairs. Include Degradation cases as failures for collection; they will be resolved to DEGRADED when selected as primary.
3. **Select the single highest-priority failure** using the Global Invariant Priority Order. If two failures have the same priority, apply the tie-breaker (lexical order of invariant_id).
4. **Emit that failure as the terminal cause:** If the selected failure is an INVALID cause → terminal state INVALID, invalid_cause = that cause code. If the selected failure is a Degradation case → terminal state DEGRADED, degradation_cause = that cause code.
5. **Log all failures** (primary + secondary). Primary is the emitted cause; secondary are all others, in a deterministic order (e.g. by priority, then by invariant_id). Output field e.g. `invariant_failures: [primary, ...secondary]` or `primary_cause` + `secondary_failures: [...]`.

**No "first failure wins."** No dependency on the order in which invariants are evaluated. The only ordering that matters is the **priority table** and the **tie-breaker**.

---

## 3. Deterministic Cause Emission

**Rule:** For a fixed repository state and fixed config, the representation output must be identical across runs:

- Same **terminal state** (VALID, DEGRADED, or INVALID).
- Same **primary cause code** (when not VALID).
- Same **set of invariant failures** reported (primary + secondary); order of secondary list may be fixed (e.g. by priority then invariant_id) so that the same set produces the same list.

**Same priority, multiple failures:** Use tie-breaker: **lexical order of invariant ID**. Assign a canonical cause code when multiple invariants map to the same code (e.g. LAYOUT_OR_MAP_INVALID for both INV-S and INV-M): the **primary** is the one with the lexically smallest invariant_id among those that failed at that priority. So INV-M (lexically before INV-S) wins if both fail at priority 7; primary cause = LAYOUT_OR_MAP_INVALID, secondary_failures includes INV-S.

**Stable IDs:** Invariant IDs are fixed strings: INV-B, INV-COV, INV-D, INV-DIFF, INV-G, INV-M, INV-NSS, INV-RES, INV-S, INV-TREE. No numeric ID required for tie-break if lexical order is stable (it is for this set).

---

## 4. CI Stability Guarantee

**Statement:**

Given **identical** repository state (same files, same content, same layout) and **identical** representation config (same flags, same ignore lists, same resolver settings):

- Representation output must be **identical** across runs:
  - Same **representation_status** (VALID | DEGRADED | INVALID).
  - Same **primary cause code** (when status is not VALID).
  - Same **invariant set** reported (same set of failed invariants; same primary selection).

No nondeterminism in failure reporting. No "sometimes we report COV, sometimes RES" for the same repo. CI artifacts (logs, reports) must be reproducible for the same input.

---

## 5. Deterministic Failure Selection Algorithm (Pseudocode)

```
VALIDATE(repoRoot, layout_mode, pkgDirByName, graph, S, ...):
  failures := []   // list of (priority, invariant_id, cause_code, terminal_type)

  for each invariant Inv in [INV-TREE, INV-COV, INV-RES, INV-DIFF, INV-NSS, INV-G, INV-S, INV-M, INV-D, INV-B]:
    (ok, cause_code, terminal_type) := check(Inv)   // terminal_type in {INVALID, DEGRADED}
    if not ok:
      priority := PRIORITY_TABLE[Inv]   // 1..9
      append (priority, Inv, cause_code, terminal_type) to failures

  if failures is empty:
    if boundary ran when graph.nodes > 0 and all other conditions for VALID hold:
      return (VALID, null, [])
    else:
      // shouldn't happen if checks are complete; treat as INV-NSS or INV-B
      return (INVALID, BOUNDARY_SKIP or SILENT_SUCCESS_VIOLATION, [...])

  // Select primary: lowest priority number (1 first), then lexically smallest invariant_id
  sort failures by (priority ASC, invariant_id ASC)
  (primary_priority, primary_id, primary_cause, primary_terminal) := failures[0]

  secondary := failures[1..]
  emit primary_cause as terminal cause
  log secondary in deterministic order (already sorted)

  if primary_terminal = INVALID:
    return (INVALID, primary_cause, failures)
  else:
    return (DEGRADED, primary_cause, failures)
```

**Notes:**

- **PRIORITY_TABLE** is the Global Invariant Priority Order (1 = highest). INV-S and INV-M both have priority 7; lexical order of invariant_id (INV-M, INV-S) breaks ties.
- **check(Inv)** evaluates one invariant; returns (ok, cause_code, terminal_type). No short-circuit: all invariants are evaluated before the loop completes (or failures are collected in a single pass).
- **No evaluation-order dependency:** The result depends only on the set of failures and the (priority, invariant_id) ordering. The order in which invariants are checked does not affect which failure is selected as primary.
- **Stable output:** Same failures → same sort order → same primary → same cause code.

---

## 6. Example: Multi-Failure Scenario Resolved Deterministically

**Scenario:** Repo has source files; graph was built but one subtree was never visited (INV-TREE fails), and graph has fewer nodes than source files (INV-COV fails), and one import was unresolved with no log (INV-RES fails).

**Collection:** failures = [(1, INV-TREE, UNVISITED_SUBTREE, INVALID), (2, INV-COV, PARTIAL_GRAPH, INVALID), (3, INV-RES, UNRESOLVED_IMPORTS_WITHOUT_LOG, INVALID)].

**Sort:** Already by priority (1, 2, 3). Primary = (1, INV-TREE, UNVISITED_SUBTREE, INVALID).

**Emit:** representation_status = INVALID, invalid_cause = UNVISITED_SUBTREE. secondary_failures = [INV-COV, INV-RES] (or full list with cause codes).

**Reproducibility:** For the same repo state, any run that produces these three failures will always select INV-TREE as primary (priority 1). No "sometimes COV, sometimes RES" depending on check order.

**Tie-breaker example:** Suppose INV-S and INV-M both fail (priority 7). failures = [(7, INV-M, LAYOUT_OR_MAP_INVALID, INVALID), (7, INV-S, LAYOUT_OR_MAP_INVALID, INVALID)]. Sort by (priority, invariant_id): INV-M < INV-S lexically, so primary = INV-M, cause = LAYOUT_OR_MAP_INVALID. Same every time.

---

## 7. Deterministic Failure Selection Proof

**Claim:** The emitted terminal state and primary cause code do not depend on the order in which invariants are evaluated. They depend only on the set of failing invariants and the fixed priority + tie-breaker.

**No evaluation-order dependency:**

- The algorithm **collects** all failures first. It does **not** emit on first failure. So the set of failures is the same regardless of evaluation order (assuming deterministic invariant checks).
- Selection is done **after** collection, using only the **priority table** and **lexical invariant_id**. Neither depends on evaluation order. So the primary is uniquely determined by the set of failures.

**No race condition:**

- Validation is single-threaded (or, if parallel, the collection step must be synchronized so that all results are gathered before selection). The contract assumes a single VALIDATE phase with a single commit. No concurrent updates to the failure set during selection.

**No short-circuit masking:**

- The contract **requires** that all invariants be evaluated. No "stop at first failure and emit that." So no invariant is skipped; no failure is masked by an earlier short-circuit. (Implementation must not short-circuit for the purpose of choosing the cause; it may short-circuit for performance only if it still evaluates all invariants and then selects by priority.)

**All failures collected before selection:**

- The Failure Resolution Rule and the pseudocode both require: evaluate all → collect all → then select one. So the primary is chosen from the full set. No "we already emitted COV so we never consider RES."

**Stable ordering guarantees reproducibility:**

- Priority is a fixed integer per invariant. Tie-breaker is lexical order of invariant_id, which is fixed. So for a fixed set of failures, (priority, invariant_id) sort order is unique. Same failures → same primary → same cause code across runs.

**Conclusion:** For identical repository state and config, the same set of invariant failures will always produce the same terminal state and the same primary cause code. Deterministic failure selection is satisfied.

---

## 8. Representation Contract v10 (Clean Version)

### 8.1 Scope

Graph extraction. Layout. Package map. Completeness and coverage. State discipline. **Deterministic failure precedence.** Same input → same output (state + cause + invariant set).

### 8.2 State Machine (Unchanged from v9)

ENTER → EXTRACT → VALIDATE → (VALID | DEGRADED | INVALID). Terminal states have no outgoing transitions.

### 8.3 VALIDATE Phase (v10)

1. Evaluate **all** invariants (no short-circuit for selection).
2. **Collect** all failures (invariant_id, cause_code, terminal_type).
3. **Select** primary failure by Global Invariant Priority Order; tie-break by lexical invariant_id.
4. **Emit** terminal state and primary cause. **Log** all failures (primary + secondary in deterministic order).
5. No "first failure wins." No evaluation-order dependency.

### 8.4 Global Invariant Priority Order

As in §1. Priority 1 = highest (INV-TREE), 9 = lowest (INV-B). Same priority → tie-break by invariant_id lexical order.

### 8.5 CI Reproducibility Guarantee

Given identical repository state and config, representation output (representation_status, primary cause code, set of reported invariant failures) must be identical across runs.

### 8.6 Outputs (v10)

- representation_status: VALID | DEGRADED | INVALID
- invalid_cause / degradation_cause: enum (primary only)
- primary_invariant: (optional) invariant_id that produced the primary cause
- invariant_failures: (optional) full list of (invariant_id, cause_code) in deterministic order (e.g. by priority then invariant_id), so that the same set of failures produces the same list
- layout_mode, pkgDirByName.size, sourceFileCount, graph.nodes.count
- Graph and map only when status is VALID or (DEGRADED with override).

### 8.7 Invariant List (Unchanged)

INV-S, INV-M, INV-B, INV-G, INV-D, INV-NSS, INV-COV, INV-RES, INV-TREE, INV-DIFF. Each evaluated; each failure mapped to cause and terminal; selection by priority + tie-breaker.

---

## 9. Invariant Priority Table (Reference)

| Priority | Invariant | Cause code(s) |
|----------|-----------|---------------|
| 1 | INV-TREE | UNVISITED_SUBTREE |
| 2 | INV-COV | PARTIAL_GRAPH, PARTIAL_GRAPH_ALLOWED |
| 3 | INV-RES | UNRESOLVED_IMPORTS_WITHOUT_LOG, OPTIONAL_RESOLVER_DISABLED |
| 4 | INV-DIFF | INCOMPLETE_DIFF_GRAPH |
| 5 | INV-NSS | SILENT_SUCCESS_VIOLATION, EMPTY_MONOREPO_MAP, BOUNDARY_SKIP |
| 6 | INV-G | EMPTY_GRAPH_WITH_SOURCE_FILES |
| 7 | INV-M, INV-S | LAYOUT_OR_MAP_INVALID, EMPTY_MONOREPO_MAP |
| 8 | INV-D | NON_DETERMINISTIC |
| 9 | INV-B | BOUNDARY_SKIP |

Tie-break at same priority: lexical order of invariant_id (INV-B, INV-COV, INV-D, INV-DIFF, INV-G, INV-M, INV-NSS, INV-RES, INV-S, INV-TREE).

---

## 10. v9 → v10 Delta

| Area | v9 | v10 |
|------|-----|-----|
| **Failure selection** | "First failure" or "one failure, one cause" (optional collect-all). | **All** failures collected; **highest-priority** (then tie-break) selected as primary. No evaluation-order dependency. |
| **Priority** | Not specified. | Global Invariant Priority Order; strict total order; documented. |
| **Tie-breaker** | Not specified. | Lexical order of invariant_id when same priority. |
| **Output** | Single cause code. | Primary cause + optional full invariant_failures list in deterministic order. |
| **CI** | Gate on status and cause. | **CI reproducibility guarantee:** same repo + config → same status, same primary cause, same invariant set. |
| **Proof** | State safety (no recovery, terminal, etc.). | **Deterministic Failure Selection Proof:** no evaluation-order dependency, no race, no short-circuit masking, all collected before selection, stable ordering. |
| **Algorithm** | Validate phase described informally. | Pseudocode for VALIDATE: collect all, sort by (priority, invariant_id), emit primary. |

---

## 11. CI Reproducibility Guarantee Statement

**Formal statement:**

For any two runs of the representation layer:

- **If** repository state (file tree, file contents, layout) is identical,  
- **and** representation config (flags, ignore patterns, resolver settings) is identical,  
- **then** representation output must satisfy:
  - representation_status is the same in both runs,
  - if status is not VALID, invalid_cause or degradation_cause is the same in both runs,
  - the set of invariant failures reported (primary + secondary) is the same in both runs,
  - the primary failure (and thus primary cause) is the same in both runs.

This is guaranteed by: (1) deterministic extraction (INV-D), (2) evaluation of all invariants (no silent skip), (3) deterministic failure selection (priority + tie-breaker), (4) no randomness or timestamp in output. So representation behaves like a compiler that always produces the same diagnostic for the same input.

---

## Part B: Governance & Implementation Discipline (Optional)

These are **not** required for correctness. They are for governance and implementation discipline so the representation layer stays stable and traceable.

### B.1 Priority Table Immutability

**Goal:** Prevent accidental reordering of priorities and drift in failure semantics.

- **Priority table hash:** Define a canonical serialization of the priority table (e.g. ordered list of `(priority, invariant_id)` pairs). Compute a stable hash (e.g. SHA-256) of that string. Store the hash in the repo (e.g. `docs/validation-20pr/representation-priority-table.sha256` or in the contract doc).
- **CI assertion:** In CI, after any change that touches the representation contract or priority table, recompute the hash. Assert that the hash matches the stored value **or** that the contract version was explicitly bumped (e.g. in a CHANGELOG or version file). If the hash changed without a version bump, fail CI.
- **Versioned invariant registry:** Maintain an explicit registry (e.g. in this document or a separate `representation-invariants.json`) listing invariant_id, priority, cause_code(s), and a version or date. Any change to the table (order, new invariant, removed invariant) requires a version bump and a one-line diff in the registry.

**Effect:** No casual reordering. Changes to failure precedence are explicit and versioned.

### B.2 Representation Version Stamp (Output Schema)

Every representation run **should** emit a version stamp in structured output (report or stderr JSON) for forensic traceability. Recommended shape:

```json
{
  "representation_version": "v10",
  "priority_table_version": "2025-02-20",
  "invariants_evaluated": ["INV-TREE", "INV-COV", "INV-RES", "INV-DIFF", "INV-NSS", "INV-G", "INV-S", "INV-M", "INV-D", "INV-B"],
  "representation_status": "INVALID",
  "primary_invariant": "INV-TREE",
  "invalid_cause": "UNVISITED_SUBTREE",
  "all_failures": [
    { "invariant_id": "INV-TREE", "cause_code": "UNVISITED_SUBTREE", "priority": 1 },
    { "invariant_id": "INV-COV", "cause_code": "PARTIAL_GRAPH", "priority": 2 }
  ],
  "layout_mode": "single_package",
  "sourceFileCount": 42,
  "graph_nodes_count": 38
}
```

- **representation_version:** Contract version (e.g. "v10").
- **priority_table_version:** Date or version of the priority table (e.g. "2025-02-20" or "1.0").
- **invariants_evaluated:** Full list of invariant IDs that were evaluated (deterministic order).
- **primary_invariant:** The invariant that produced the terminal cause (when not VALID).
- **all_failures:** All collected failures with invariant_id, cause_code, priority; enables auditing and CI artifact comparison.

**Effect:** CI artifacts and logs are traceable to a specific contract version and priority table. No ambiguity about which semantics were used.

### B.3 Freeze the Representation Layer

Representation is now **infrastructure**. Treat it like a public interface.

- **Do not iterate casually.** Changes to layout rules, invariants, priority order, or state machine require a **version bump** (e.g. v10 → v11) and a **contract diff** (what changed, why).
- **Representation should evolve rarely.** Policy and regression can evolve more frequently. Representation changes should be deliberate and documented.
- **Require version bump + contract diff for any change.** No silent edits to the priority table, invariant list, or failure semantics. If the priority table hash or the representation_version changes, the change must be visible in the repo (e.g. CHANGELOG, contract doc diff, or versioned invariant registry).
- **Public interface:** The representation output schema (status, cause codes, version stamp) and the state machine (ENTER → EXTRACT → VALIDATE → terminal) are part of the public contract. Downstream (policy, CI, regression) may depend on them. Breaking changes require a major version or explicit migration.

**Effect:** Representation stays stable. Remaining work is in policy, regression, resolver implementation, and performance — not in re-opening structural questions.

### B.4 Invariant Definition Fingerprint (Optional, Elite-Level)

**Goal:** Freeze not only the **order** of invariants but their **meaning**. Prevent subtle weakening, silent relaxation, undocumented tightening, or spec drift that would not trip the priority-table hash.

- **Canonical serialized definition:** For each invariant (INV-S, INV-M, INV-B, INV-G, INV-D, INV-NSS, INV-COV, INV-RES, INV-TREE, INV-DIFF), define a **canonical one-line (or short) statement** that captures the invariant’s semantic condition. Example: `INV-COV: "S ⊆ G and (sourceFileCount > 0 → graph.nodes.count >= sourceFileCount); no source file in S skipped without cause or documented exclude."` Store these in a single registry file (e.g. `representation-invariant-definitions.txt` or `.json`) in a fixed order (e.g. by invariant_id).
- **Hash per invariant (or combined):** Compute a stable hash (e.g. SHA-256) of the canonical definition string for each invariant. Store either (a) one hash for the entire definitions file, or (b) one hash per invariant in a small registry. The registry is the source of truth; CI will recompute and compare.
- **CI check:** In CI, recompute the definition hash(es) from the current canonical definitions. Assert that the hash(es) match the stored value **or** that the representation contract version was explicitly bumped (and the change is documented). If a definition changed without a version bump, fail CI.
- **Semantic change = version bump:** Any change to the **wording or meaning** of an invariant (relaxation, tightening, or rephrase) is a contract change. It must trigger a version bump (e.g. v10 → v11 or priority_table_version / invariant_registry_version bump) and a one-line diff or CHANGELOG entry describing the change.

**What this prevents:** Keeping INV-COV in the same position with the same ID but weakening its definition (e.g. “S ⊆ G” → “S ⊆ G when possible”) would change the definition hash and be caught by CI. So order is frozen (B.1) and **meaning** is frozen (B.4).

**Stop here.** Do not add further meta-layers beyond priority-table immutability, version stamping, interface freeze, and invariant-definition fingerprinting. Further strengthening risks complexity creep and contributor intimidation.

---

*End of Representation Contract v10 — Deterministic Failure Precedence.*
