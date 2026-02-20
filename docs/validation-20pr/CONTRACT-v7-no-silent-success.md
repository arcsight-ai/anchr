# Representation Contract v7 — No Silent Success & Degradation Discipline

Failure-discipline hardening pass. Eliminate all silent degradation paths.

**Relationship:** v7 upgrades Representation Contract v6. Policy Contract v1 and Regression Contract v1 unchanged. CI Gate is new and binds representation outcome to CI.

---

## 1. No Silent Success Invariant

Representation must never succeed (emit VALID) when a required invariant did not hold or a required code path was skipped.

**INV-NSS (No Silent Success):**

- If `sourceFileCount > 0` AND `graph.nodes.count === 0` → **INVALID**. No result may be VALID. No silent empty graph.
- If `layout_mode === "monorepo_packages"` AND `pkgDirByName.size === 0` → **INVALID**. Monorepo with empty map is contract violation.
- If boundary logic was **not** executed AND the layout_mode **requires** boundary evaluation (i.e. graph had at least one node) → **INVALID**. No silent skip of boundary evaluation.
- No representation result may be **VALID** unless: layout_mode in allowed set, INV-S or INV-M holds, INV-G holds, boundary evaluation was executed when `graph.nodes.count > 0`, and `pkgDirByName.size >= 1`.

**Operational rule:** Representation either produces VALID (all invariants held, all required paths run), produces INVALID (invariant violated; fail loudly), or produces DEGRADED only under the Degradation Contract below. It may **never** produce VALID when any of the above conditions are false.

---

## 2. Degradation Contract

DEGRADED is not default. It is an explicit, opt-in exception.

### 2.1 When DEGRADED May Occur

DEGRADED may **only** occur when:

- An **explicit config flag** allows partial graph (e.g. `REPRESENTATION_ALLOW_DEGRADED=1` or equivalent in config), **or**
- **Missing optional resolvers** are documented and the contract defines a fallback that produces DEGRADED (e.g. optional alias resolver disabled), **or**
- An **explicitly documented fallback mode** is triggered (e.g. "workspace config unparseable → single_package + DEGRADED with cause code").

No implicit degradation. No "we couldn't find packages so we skipped boundary" without a defined DEGRADED path and cause code.

### 2.2 What DEGRADED Must Do

- **Emit machine-readable status:** `representation_status: "DEGRADED"` in structured output (e.g. report or stderr JSON).
- **Log cause code:** e.g. `degradation_cause: "PARTIAL_GRAPH_ALLOWED"` or `"OPTIONAL_RESOLVER_MISSING"` or `"WORKSPACE_FALLBACK"`. Enum; no free text for cause.
- **Fail CI unless override present:** CI Gate (below) treats DEGRADED as CI failure unless an explicit override (e.g. `CI_ALLOW_REPRESENTATION_DEGRADED=1`) is set for that run. Override must be auditable (logged or in CI config).

### 2.3 What Is Forbidden

- **No implicit degradation:** Code must not transition to DEGRADED without going through a codepath that sets status and cause code.
- **No VALID when invariants failed:** If any of the INVALID conditions in §1 hold, result must be INVALID, not DEGRADED and not VALID.
- **No silent skip then VALID:** If boundary was skipped when graph had nodes, result is INVALID, not VALID.

---

## 3. CI Enforcement Layer

### 3.1 Representation CI Gate

| Representation status | CI outcome (default) | With override |
|----------------------|----------------------|---------------|
| **VALID** | Pass (representation gate) | Pass |
| **DEGRADED** | **Fail** | Pass (only if explicit override set) |
| **INVALID** | **Fail** (block) | No override. Always fail. |

- **VALID required in production:** Production CI must not use DEGRADED override for normal runs. Override is for one-off or migration only.
- **INVALID blocks CI:** No override for INVALID. Invariant violation is always a hard failure.
- **Regression Contract must not mask INVALID:** If representation returns INVALID, the run must fail before regression metrics are computed. Regression Contract evaluates only runs that passed the Representation CI Gate (or that explicitly ran with DEGRADED override). Regression must not treat INVALID as "allow" or "skip" and then report TN/FP.

### 3.2 Gate Order

1. Run representation (discovery + graph + boundary path).
2. Assert invariants; set representation_status = VALID | DEGRADED | INVALID.
3. **If INVALID:** Exit with non-zero; do not run policy; do not run regression. CI fails.
4. **If DEGRADED:** If override not set, exit with non-zero; CI fails. If override set, log and continue.
5. **If VALID:** Continue to policy; then regression if applicable.

---

## 4. Silent Skip Audit — Mechanical Checks

The following assertions must be implemented. Any failure → INVALID (or DEGRADED only if under Degradation Contract with cause code).

| # | Assertion | On failure |
|---|-----------|------------|
| S1 | `boundaryEvaluationRan === true` OR `layout_mode === "single_package"` (boundary runs when graph has nodes; for single_package we still run it but policy emits nothing cross-package) | INVALID if boundary was skipped when graph.nodes > 0 |
| S2 | `sourceFileCount > 0 → graph.nodes.count > 0` | INVALID |
| S3 | `pkgDirByName.size >= 1` (never empty when we have a layout_mode) | INVALID |
| S4 | `layout_mode` logged in structured output | CI cannot verify representation without it; treat as INVALID if not logged |
| S5 | All invariants (INV-S or INV-M, INV-G, INV-B) evaluated before emitting result; no early return that skips invariant check | INVALID if result emitted without running invariant checks |

**Clarification for S1:** "Boundary evaluation ran" means the code path that would compute boundary/relative_escape violations was **entered**. For single_package that path is still entered; it simply produces no cross-package violations. So: `boundaryEvaluationRan === true` whenever `graph.nodes.count > 0`. When `graph.nodes.count === 0`, boundary path need not run (no nodes to evaluate). So assertion: `(graph.nodes.count > 0 → boundaryEvaluationRan) && (layout_mode in {"monorepo_packages","single_package"})`.

---

## 5. Scenario Re-run (VALID / DEGRADED / INVALID; CI; Silent Skip?)

| Scenario | representation_status | CI pass (no override)? | Silent skip possible? |
|----------|------------------------|-------------------------|------------------------|
| **SWR** | VALID. single_package, map size 1, graph has nodes, boundary runs. | Yes | No. Boundary runs; no empty map. |
| **ky** | VALID. single_package, map size 1, graph has nodes, boundary runs. | Yes | No. Discovery returns non-empty map; boundary not skipped. |
| **Empty repo** | VALID. sourceFileCount === 0; graph.nodes may be 0; INV-G does not require nodes when source files are 0. Boundary need not run. layout_mode single_package, map size 1. | Yes | No. No "skip" of boundary when there were no nodes. |
| **Single file repo** | VALID. sourceFileCount === 1, graph.nodes >= 1, boundary runs. single_package. | Yes | No. |
| **Misclassified workspace** | single_package (L2); no workspace parsing. VALID. Or if we add workspace and it fails to parse → DEGRADED with cause code, only if that path is in Degradation Contract. | Yes if VALID; No if DEGRADED (unless override) | No. No silent VALID with wrong layout. |
| **Alias failure** | If aliases are required for correct graph and resolver fails: either INVALID (no fallback) or DEGRADED (documented fallback + cause code). Must not be VALID with incomplete graph. | Fail if INVALID or DEGRADED without override | No silent VALID with incomplete topology. |
| **Partial diff** | Graph is over current tree. VALID if graph and map consistent. No "partial graph" as VALID unless under Degradation Contract. | Depends on whether implementation allows partial; if not, VALID. | No. |

---

## 6. Representation Contract v7 (Clean Version)

### 6.1 Scope

Graph extraction. Layout classification. Package map. No policy. No regression. No silent success.

### 6.2 Layout (Unchanged from v6)

- **L1.** If `repoRoot/packages` is a directory and for some direct child `d`, `repoRoot/packages/d/src` is a directory → `layout_mode = "monorepo_packages"`, `pkgDirByName` = map of such `d` → `repoRoot/packages/d`.
- **L2.** Else → `layout_mode = "single_package"`, `pkgDirByName = {"root" -> primaryRoot}`, primaryRoot = first of `repoRoot/source`, `repoRoot/src`, `repoRoot` that is a directory (else repoRoot).

### 6.3 Invariants (v7)

- **INV-S:** single_package ⇒ pkgDirByName.size === 1, only key "root".
- **INV-M:** monorepo_packages ⇒ every key from packages/<d>/src/ only; if L1 applied, pkgDirByName non-empty.
- **INV-B:** Boundary evaluation is executed whenever graph.nodes.count > 0. Never skipped because map is empty.
- **INV-G:** sourceFileCount > 0 ⇒ graph.nodes.count > 0.
- **INV-D:** Deterministic output for fixed repoRoot and filesystem.
- **INV-NSS:** No Silent Success. VALID only when: layout_mode in {monorepo_packages, single_package}, INV-S or INV-M, INV-G, pkgDirByName.size >= 1, and boundary evaluation ran when graph.nodes > 0. If sourceFileCount > 0 and graph.nodes === 0 → INVALID. If monorepo_packages and pkgDirByName.size === 0 → INVALID. If boundary not run when graph had nodes → INVALID.

### 6.4 Failure Modes (v7)

| Mode | Condition | CI |
|------|-----------|-----|
| **VALID** | All invariants hold; boundary ran when nodes > 0; layout_mode and map consistent; no silent skip. | Pass |
| **DEGRADED** | Only when explicitly allowed by Degradation Contract; cause code set; logged. | Fail unless override |
| **INVALID** | Any of: sourceFileCount > 0 and graph.nodes === 0; monorepo and pkgDirByName.size === 0; boundary not run when graph had nodes; layout_mode invalid; pkgDirByName.size !== 1 when single_package. | Always fail |

### 6.5 Outputs (v7)

Representation must emit:

- `representation_status`: "VALID" | "DEGRADED" | "INVALID"
- `layout_mode`: "monorepo_packages" | "single_package"
- `pkgDirByName.size`
- If DEGRADED: `degradation_cause`: enum value
- Graph and package map only when status is VALID or (when override) DEGRADED.

---

## 7. Degradation Contract (Standalone Summary)

- **When:** Only with explicit config flag, or documented optional-resolver fallback, or documented workspace fallback with cause code.
- **Must:** Emit machine-readable DEGRADED, log cause code, fail CI unless override.
- **Never:** Implicit degradation; VALID when invariants failed; silent skip then VALID.

---

## 8. CI Gate Spec

- **Gate:** After representation run, read `representation_status`.
- **INVALID** → exit non-zero; do not run policy or regression. CI fails.
- **DEGRADED** → exit non-zero unless `CI_ALLOW_REPRESENTATION_DEGRADED` (or equivalent) set; if set, log and continue. CI fails by default.
- **VALID** → continue. CI passes representation gate.
- Regression run only after gate passes (VALID or DEGRADED with override). Regression must not run on INVALID.

---

## 9. Silent Success Risk Table

| Risk | v6 | v7 |
|------|-----|-----|
| Empty package map when source files exist | INV-G; boundary "never skipped" (narrative) | INVALID; S2, S3; no VALID possible. |
| Boundary evaluation skipped | INV-B (narrative) | INVALID; S1; result must not be VALID. |
| Empty graph when source files exist | INV-G | INVALID; S2; explicit in INV-NSS. |
| Monorepo with zero packages | INV-M | INVALID; INV-NSS. |
| "Technically succeeded but wrong graph" | Not explicitly invalid | VALID only when all invariants and S1–S5 hold; otherwise INVALID or DEGRADED. |
| DEGRADED without CI visibility | Not specified | Degradation Contract: must log cause; CI fails unless override. |
| Regression masks representation INVALID | Not specified | Gate order: INVALID fails before regression runs. |

---

## 10. What Changed v6 → v7

| Area | v6 | v7 |
|------|-----|-----|
| **Silent success** | VALID when invariants hold; DEGRADED as implementation bug. | INV-NSS: explicit INVALID conditions; no VALID when any required path skipped or invariant false. |
| **DEGRADED** | Allowed when "single_package but zero nodes" (implementation bug). | Degradation Contract: only with explicit flag or documented fallback; cause code; CI fails unless override. |
| **INVALID** | Layout invalid or invariant violation. | Same plus: empty graph with source files; empty map in monorepo; boundary not run when graph had nodes. Non-recoverable; no override. |
| **VALID** | Invariants hold. | Invariants hold **and** boundary ran when nodes > 0 **and** no silent skip. |
| **CI** | Not specified. | Representation CI Gate: VALID pass; DEGRADED fail unless override; INVALID always fail. Regression does not run on INVALID. |
| **Assertions** | A1–A8. | S1–S5 (silent-skip audit) plus A1–A8. |
| **Output** | layout_mode, map, graph. | representation_status, layout_mode, map size, degradation_cause when DEGRADED. |

---

## 11. Why Silent Representation Blind Spots Are Now Structurally Impossible

1. **Empty map when source files exist:** INV-NSS and S2/S3 force INVALID. No code path can return VALID. CI fails. No silent success.

2. **Skipped boundary evaluation:** INV-NSS and S1 force INVALID when graph had nodes but boundary did not run. Result cannot be VALID. CI fails. No silent skip.

3. **Empty graph with source files:** INV-NSS and S2 force INVALID. VALID is disallowed. No "graph built but empty" as success.

4. **Monorepo with zero packages:** INV-NSS and L1/INV-M: if layout_mode is monorepo_packages, map must be non-empty. Else INVALID. No silent empty monorepo.

5. **DEGRADED without visibility:** Degradation Contract requires machine-readable status and cause code; CI fails unless override. No implicit DEGRADED that passes CI as if VALID.

6. **Regression masking INVALID:** Gate order requires checking representation_status before running regression. INVALID stops execution. Regression never sees INVALID runs. No masking.

7. **Early return skipping invariants:** S5 requires that all invariants are evaluated before emitting result. No early return that produces VALID without running checks. Implementations must either run checks and set VALID/INVALID/DEGRADED or fail.

**Summary:** Every previously silent failure mode is mapped to an explicit INVALID condition or to DEGRADED with cause and CI failure. VALID is only possible when the implementation has actually run boundary evaluation, built a non-empty graph when source files exist, and produced a non-empty package map. So representation either works fully, fails loudly (INVALID), or degrades explicitly (DEGRADED with cause and CI fail unless override). Never silently succeeds.

---

*End of Representation Contract v7 — No Silent Success.*
