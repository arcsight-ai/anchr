# Representation Contract v9 — State Safety & Terminal Discipline

State-discipline hardening pass. No undefined state transitions. Representation as a compiler phase: Enter → Extract → Validate → Commit final state.

**Relationship:** v9 upgrades Representation Contract v8. Policy v1 and Regression v1 unchanged. All invariant failures must be covered; state machine is explicit; no recovery from INVALID within same run.

---

## 1. Prove State Safety

### 1.1 No Silent Success Possible

- **v7 INV-NSS:** VALID only when all required invariants hold and boundary ran when graph had nodes. Empty graph with source files → INVALID. Empty monorepo map → INVALID. Boundary skip → INVALID.
- **v8 INV-COV/INV-RES/INV-TREE/INV-DIFF:** VALID only when S ⊆ G, every import resolved or logged, no unvisited subtree without ignore, and (in diff mode) base and head complete.
- **v9:** Final state is committed only after the **Validate** phase. The only way to reach terminal **VALID** is the single transition **VALIDATE → VALID** when **all** invariant checks pass. There is no code path that can set status to VALID without having executed the full validation phase. So **no silent success**: VALID is reachable only via the defined transition with all checks passed.

### 1.2 No Partial Graph Can End in VALID

- **INV-COV:** S ⊆ G and graph.nodes >= sourceFileCount are **evaluated** in Validate. If either fails, the transition is to INVALID (cause PARTIAL_GRAPH), not to VALID.
- The transition table (below) allows **VALIDATE → VALID** only when **no** invariant failure. Partial graph implies an invariant failure (INV-COV or INV-RES). So the transition to VALID is not enabled when the graph is partial. **No partial graph can end in VALID.**

### 1.3 No Invariant Failure Can Be Masked

- **Explicit transition table:** Every invariant (INV-S, INV-M, INV-B, INV-G, INV-D, INV-NSS, INV-COV, INV-RES, INV-TREE, INV-DIFF when applicable) is checked in Validate. Each failure maps to a **specific** terminal state (INVALID with cause code) or, when allowed by Degradation Contract, DEGRADED with cause code.
- **No catch-all "unknown" that becomes VALID:** If an invariant fails, the only allowed transitions are to INVALID or (where contract allows) DEGRADED. There is no transition from "invariant failed" to VALID.
- **Coverage of failures:** The Severity Monotonicity Rule and the Invariant→Cause mapping (below) ensure every invariant failure has a defined terminal state. **No invariant failure can be masked** by an undefined or default transition.

### 1.4 No Recovery from INVALID Within Same Run

- **Terminal states:** VALID, DEGRADED, INVALID are **terminal**. The state machine has no transition **from** any of these states to any other state within the same run.
- **No INVALID → VALID, no INVALID → DEGRADED:** Once the representation commits INVALID, the run ends. No retry, no correction pass, no "try again" that could overwrite INVALID. So **no recovery from INVALID within the same run.**

### 1.5 No Degradation Without Cause Code

- **Degradation Contract (v7):** DEGRADED may only occur with explicit cause code (e.g. PARTIAL_GRAPH_ALLOWED, OPTIONAL_RESOLVER_DISABLED). Machine-readable status and cause code are required.
- **Transition table:** The only transition to DEGRADED is **VALIDATE → DEGRADED**, and it is allowed only when the condition is one of the **documented** Degradation Contract conditions and the implementation sets **degradation_cause** to the corresponding enum value. There is no transition to DEGRADED without a cause code. So **no degradation without cause code.**

### 1.6 No Policy Execution on Invalid Representation

- **CI Gate (v7/v8):** If representation_status is INVALID, the run must exit with non-zero **before** policy runs. Policy and regression are not executed when representation is INVALID.
- **State machine:** Policy is **not** part of the representation state machine. Policy runs only **after** representation has committed a **terminal** state. The CI Gate checks the terminal state; if it is INVALID, the process exits and policy is never invoked. So **no policy execution on invalid representation.**

---

## 2. State Machine Diagram (Textual)

```
                    ┌─────────┐
                    │  ENTER  │
                    └────┬────┘
                         │ repoRoot valid; start run
                         ▼
                    ┌─────────┐
                    │ EXTRACT │
                    └────┬────┘
                         │ discovery, graph build, boundary path
                         │ (no terminal state yet)
                         ▼
                    ┌─────────┐
                    │VALIDATE │
                    └────┬────┘
                         │ evaluate all invariants in order
                         │ single commit to one terminal state
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌────────┐     ┌──────────┐     ┌─────────┐
    │ VALID  │     │ DEGRADED │     │ INVALID │
    └────────┘     └──────────┘     └─────────┘
    (terminal)     (terminal)       (terminal)
         │               │               │
         │               │               │ no transition out
         ▼               ▼               ▼
    policy may      CI fails         exit; no policy
    run             unless override
```

**Rules:**

- **ENTER:** Single entry state. Input: repoRoot. No invariant checks yet.
- **EXTRACT:** Discovery (layout_mode, pkgDirByName), list source files (S), build graph (G), run boundary evaluation when graph has nodes. No commitment to terminal state. No early exit to VALID/DEGRADED/INVALID from EXTRACT.
- **VALIDATE:** Evaluate all invariants (INV-S/M, INV-G, INV-D, INV-NSS, INV-B, INV-COV, INV-RES, INV-TREE, INV-DIFF when applicable). Exactly one transition to exactly one terminal state. No multi-pass; no "fix and re-validate."
- **VALID | DEGRADED | INVALID:** Terminal. No transition from any terminal state to any other state. Run ends with that state.

---

## 3. Transition Table

| From   | To       | Condition | Cause / notes |
|--------|----------|-----------|----------------|
| ENTER  | EXTRACT  | Always (repoRoot available) | Start extraction. |
| EXTRACT| VALIDATE | Always (extraction phase done) | No terminal state in EXTRACT. |
| VALIDATE | VALID   | All invariants pass; boundary ran when graph.nodes > 0; S ⊆ G; no unresolved without log; no unvisited subtree without ignore; (INV-DIFF when diff mode). | Single transition; no cause code. |
| VALIDATE | DEGRADED | Degradation Contract condition holds; cause code set (e.g. PARTIAL_GRAPH_ALLOWED, OPTIONAL_RESOLVER_DISABLED). | degradation_cause required. |
| VALIDATE | INVALID  | Any invariant failure not covered by Degradation Contract. See Invariant→Cause mapping below. | invalid_cause required. |
| VALID   | —        | None. Terminal. | — |
| DEGRADED| —        | None. Terminal. | — |
| INVALID | —        | None. Terminal. | — |

**Invariant → Terminal State (when failed):**

| Invariant | If failed → | Cause code |
|-----------|-------------|------------|
| INV-S / INV-M | INVALID | LAYOUT_OR_MAP_INVALID |
| INV-G | INVALID | EMPTY_GRAPH_WITH_SOURCE_FILES |
| INV-D | INVALID | NON_DETERMINISTIC |
| INV-NSS | INVALID | SILENT_SUCCESS_VIOLATION, EMPTY_MONOREPO_MAP, BOUNDARY_SKIP |
| INV-B | INVALID | BOUNDARY_SKIP |
| INV-COV | INVALID (or DEGRADED if PARTIAL_GRAPH_ALLOWED) | PARTIAL_GRAPH |
| INV-RES | INVALID (or DEGRADED if OPTIONAL_RESOLVER_DISABLED) | UNRESOLVED_IMPORTS_WITHOUT_LOG, or OPTIONAL_RESOLVER_DISABLED |
| INV-TREE | INVALID | UNVISITED_SUBTREE |
| INV-DIFF | INVALID | INCOMPLETE_DIFF_GRAPH |

Every invariant failure maps to exactly one terminal state and (when not VALID) to a cause code. No ambiguity.

**Full invariant failure coverage (all invariants):**

| Invariant | Failure condition | Terminal | Cause code |
|-----------|-------------------|----------|------------|
| INV-S | single_package but pkgDirByName.size !== 1 or key !== "root" | INVALID | LAYOUT_OR_MAP_INVALID |
| INV-M | monorepo_packages but map empty or key not from packages/<d>/src/ | INVALID | LAYOUT_OR_MAP_INVALID, EMPTY_MONOREPO_MAP |
| INV-G | sourceFileCount > 0 and graph.nodes === 0 | INVALID | EMPTY_GRAPH_WITH_SOURCE_FILES |
| INV-D | Non-deterministic output for same inputs | INVALID | NON_DETERMINISTIC |
| INV-NSS | Empty graph with source files; empty monorepo map; boundary skipped when nodes > 0 | INVALID | SILENT_SUCCESS_VIOLATION, EMPTY_MONOREPO_MAP, BOUNDARY_SKIP |
| INV-B | graph.nodes > 0 but boundary evaluation not run | INVALID | BOUNDARY_SKIP |
| INV-COV | S ⊄ G or graph.nodes < sourceFileCount (and not Degradation case) | INVALID | PARTIAL_GRAPH |
| INV-COV | Same, but config allows partial graph | DEGRADED | PARTIAL_GRAPH_ALLOWED |
| INV-RES | Unresolved import(s) without UNRESOLVED_IMPORT event | INVALID | UNRESOLVED_IMPORTS_WITHOUT_LOG |
| INV-RES | Resolver intentionally disabled | DEGRADED | OPTIONAL_RESOLVER_DISABLED |
| INV-TREE | Directory not visited and not in explicit ignore list (or not logged) | INVALID | UNVISITED_SUBTREE |
| INV-DIFF | (Diff mode) base or head graph fails INV-COV or INV-RES | INVALID | INCOMPLETE_DIFF_GRAPH |

No invariant failure is unmapped. No transition to VALID when any of the above hold (except DEGRADED cases, which do not lead to VALID).

---

## 4. Severity Monotonicity Rule

**Rule:** Within a single run, representation state **never** improves after an invariant failure.

- **No INVALID → VALID.** Once INVALID, terminal. No recovery.
- **No INVALID → DEGRADED.** INVALID is terminal.
- **No DEGRADED → VALID.** DEGRADED is terminal. No "retry and promote."
- **No VALIDATE → VALID** after any invariant has failed in that same Validate phase. Validation is a single pass: evaluate all invariants, then make exactly one transition to one terminal state. If any invariant fails (and the failure is not a documented Degradation case), the only allowed transition is to INVALID.

**Order of evaluation (recommended):** Check invariants in a fixed order (e.g. layout/map, then graph non-empty, then coverage, then resolver, then tree, then diff). First failure that is not a documented DEGRADED condition → transition to INVALID with corresponding cause; do not continue to other invariants for the purpose of "finding more errors." Fail-fast: one failure, one terminal state. (Optional: collect all failures for diagnostic output, but the **committed** state is still a single INVALID with one primary cause, or DEGRADED with one cause.)

**Monotonicity:** The "severity" of the outcome is monotonic in the sense that once we have decided INVALID, we do not downgrade to DEGRADED or VALID. Once DEGRADED, we do not upgrade to VALID. So the final state is the worst outcome that occurred during Validate, and that outcome is terminal.

---

## 5. CI Mapping Spec

| Representation terminal state | CI outcome (default) | Override allowed? | Policy runs? | Regression runs? |
|-------------------------------|----------------------|-------------------|--------------|------------------|
| **VALID** | Pass (representation gate) | N/A | Yes | Yes (if applicable) |
| **DEGRADED** | Fail | Yes (e.g. CI_ALLOW_REPRESENTATION_DEGRADED=1) | Only if override set | Only if override set |
| **INVALID** | Fail (block) | No | No | No |

**Gate order:**

1. Run representation to terminal state (ENTER → EXTRACT → VALIDATE → VALID | DEGRADED | INVALID).
2. Read representation_status (and cause code if not VALID).
3. If INVALID: exit non-zero; do not run policy; do not run regression. CI fails.
4. If DEGRADED: if override not set, exit non-zero; CI fails. If override set, log and continue to policy/regression.
5. If VALID: continue to policy; then regression if applicable.

**Invariant failure coverage:** Every cause code in the Transition Table (LAYOUT_OR_MAP_INVALID, EMPTY_GRAPH_WITH_SOURCE_FILES, PARTIAL_GRAPH, UNRESOLVED_IMPORTS_WITHOUT_LOG, UNVISITED_SUBTREE, INCOMPLETE_DIFF_GRAPH, BOUNDARY_SKIP, etc.) must map to CI failure when status is INVALID. No cause code may be "warning only" and still allow CI to pass the representation gate. So **all invariant failures** are covered by the CI mapping: INVALID → fail, DEGRADED → fail unless override.

---

## 6. Representation Contract v9 (Clean Version)

### 6.1 Scope

Graph extraction. Layout. Package map. Completeness and coverage. **State discipline.** No undefined transitions. No recovery from INVALID. No policy on invalid representation.

### 6.2 State Machine (Summary)

- **Phases:** ENTER → EXTRACT → VALIDATE → (VALID | DEGRADED | INVALID). Single entry, single validate pass, single terminal state per run.
- **Terminal states:** VALID, DEGRADED, INVALID. No transition out of any terminal state.
- **No multi-pass:** Validate runs once. One failure → one terminal state (INVALID or DEGRADED). No "fix and re-validate" within same run.

### 6.3 Layout (Unchanged)

- **L1.** If `repoRoot/packages` is a directory and for some direct child `d`, `repoRoot/packages/d/src` is a directory → layout_mode = "monorepo_packages", pkgDirByName = map of such d.
- **L2.** Else → layout_mode = "single_package", pkgDirByName = {"root" -> primaryRoot}, primaryRoot = first of source, src, repoRoot.

### 6.4 Invariant List (v9 — Unchanged from v8)

INV-S, INV-M, INV-B, INV-G, INV-D, INV-NSS, INV-COV, INV-RES, INV-TREE, INV-DIFF. Each must be evaluated in Validate. Each failure maps to INVALID (with cause) or, when contract allows, DEGRADED (with cause).

### 6.5 VALID (v9)

VALID iff: reached via transition VALIDATE → VALID after **all** invariants passed and boundary ran when graph.nodes > 0. No other path to VALID.

### 6.6 Failure Modes (v9)

Same as v8, with **explicit** mapping to terminal state and cause code. No unmapped invariant failure. No transition to VALID when any invariant has failed (except when failure is a documented Degradation case → DEGRADED).

### 6.7 Outputs (v9)

- representation_status: VALID | DEGRADED | INVALID
- representation_phase: (optional) last phase completed before terminal — always VALIDATE
- invalid_cause / degradation_cause: enum when not VALID
- layout_mode, pkgDirByName.size, sourceFileCount, graph.nodes.count
- Graph and map only when status is VALID or (DEGRADED with override). Never emit graph for downstream when status is INVALID.

### 6.8 No Policy on Invalid Representation

When representation_status is INVALID, the implementation must **not** invoke policy (boundary/decision logic) or regression. Exit after committing INVALID. CI Gate enforces this by exiting before policy when status is INVALID.

---

## 7. v8 → v9 Delta

| Area | v8 | v9 |
|------|-----|-----|
| **State model** | Implicit (result status). | Explicit state machine: ENTER → EXTRACT → VALIDATE → VALID \| DEGRADED \| INVALID. |
| **Transitions** | Not specified. | Transition table: only allowed from-to pairs; no transition from terminal states. |
| **Invariant failure** | Mapped to INVALID/DEGRADED. | Every invariant failure mapped to terminal state + cause code; no unmapped failure. |
| **Recovery** | Not specified. | Explicit: no recovery from INVALID within same run; terminal states are terminal. |
| **Severity** | Not specified. | Severity monotonicity: no improvement after failure; fail-fast; one failure → one terminal state. |
| **Policy** | CI Gate: no policy on INVALID. | Same, plus stated in contract: no policy execution on invalid representation. |
| **Proof** | Partial graph validity impossible. | State safety proof: no silent success, no partial graph → VALID, no masked failure, no recovery from INVALID, no DEGRADED without cause, no policy on INVALID. |
| **CI** | Gate on status. | CI mapping spec: state → CI outcome, override, policy/regression; all cause codes map to fail when INVALID. |

---

## 8. Why Representation State Is Now Provably Monotonic and Terminal-Safe

**Monotonicity:**

- The representation state moves in one direction: ENTER → EXTRACT → VALIDATE → one of {VALID, DEGRADED, INVALID}. There is no backward transition (e.g. no VALIDATE → EXTRACT, no VALID → VALIDATE).
- Within VALIDATE, outcome severity is monotonic: once an invariant fails, the committed outcome is INVALID or DEGRADED. We do not later "upgrade" to VALID in the same run. So the final state is the worst outcome that was determined during Validate, and that state is committed once.

**Terminal safety:**

- VALID, DEGRADED, and INVALID are **terminal**. The state machine has **no** transition from any terminal state. So after committing, the run does not change state again. No "we said INVALID but then we'll try again and say VALID."
- No recovery from INVALID: the process exits (or returns) with INVALID. Policy and regression are not run. So INVALID is **terminal** both in the state machine and in the process: nothing runs after it.

**Determinism:**

- For fixed repoRoot and filesystem, the path through the state machine is deterministic: same inputs → same phase sequence → same invariant results → same terminal state. No randomness, no "sometimes we recover."

**Coverage:**

- Every invariant has a defined failure outcome (INVALID with cause or DEGRADED with cause). The transition table and Invariant→Cause mapping leave no gap: **all invariant failures are covered**. So there is no "invariant failed but we don't know what state to go to" — we always go to a defined terminal state with a cause code.

**Summary:** Representation behaves like a compiler phase: **Enter → Extract → Validate → Commit final state.** No ambiguity (explicit transitions), no silent recovery (no transition from INVALID), no drift (terminal states are final). The state is **provably** monotonic (one direction, one commit) and **terminal-safe** (no exit from VALID/DEGRADED/INVALID). At v9, the representation layer is **deterministic, complete, monotonic, terminal-safe, CI-governed, and blind-spot resistant.**

---

*End of Representation Contract v9 — State Safety & Terminal Discipline.*
