# Representation Contract v8 — Graph Completeness & Coverage Invariant

Graph completeness hardening pass. Eliminate Partial Graph Validity.

**Relationship:** v8 upgrades Representation Contract v7. Policy v1 and Regression v1 unchanged. CI Gate is extended; failure mode taxonomy is extended.

---

## 1. Graph Coverage Invariant (INV-COV)

**Definitions:**

- **S** = set of all source files under primary source root(s) that are **in scope** for representation. In scope = included by the traversal that defines "source files" (e.g. listSourceFiles), after applying **explicit** include/exclude rules only. No implicit pruning. S is fixed once traversal and rules are defined.
- **G** = set of graph nodes (node IDs) emitted in the representation output.

**INV-COV:**

- **S ⊆ G.** Every file in S must have a corresponding node in G. No source file in scope may be missing from the graph.
- If `sourceFileCount > 0` AND `graph.nodes.count < sourceFileCount` → **never VALID**. Result must be **DEGRADED** (with cause code) or **INVALID**.
- If any source file in S is skipped (not present in G) **without** an explicit cause code and without reducing S (e.g. by documented exclude) → **INVALID**.

**Operational rule:** After graph build, assert `|G| >= |S|` and that for every path in S there exists a node in G for that path. If the implementation uses a different notion of "in scope" (e.g. only files under packages/*/src), then S is defined by that same notion and INV-COV applies to that S. No partial graph may be emitted as VALID when S \ G is non-empty.

---

## 2. Resolver Coverage Invariant (INV-RES)

For every import edge **parsed** from a source file in S:

- **Either** the import resolves successfully and the edge is added to the graph,
- **Or** the implementation emits an explicit **UNRESOLVED_IMPORT** event with a **cause code** (e.g. `EXTERNAL`, `ALIAS_UNRESOLVED`, `MISSING_FILE`, `FORBIDDEN_PATH`).

No import may be **silently ignored**. No "we couldn't resolve so we skipped" without logging.

**INV-RES:**

- If unresolved imports exist and **no** UNRESOLVED_IMPORT event was emitted for them → **INVALID**.
- If the resolver is **intentionally disabled** (e.g. optional alias resolver off) → **DEGRADED** with explicit cause code (e.g. `OPTIONAL_RESOLVER_DISABLED`), not VALID. Graph may be incomplete; status must reflect that.

**Operational rule:** Resolver returns one of: resolved (add edge), or unresolved with logged cause. No third outcome (silent drop).

---

## 3. Subtree Exhaustiveness Invariant (INV-TREE)

All directories under the primary source root(s) must be **visited** (considered for inclusion in S) unless explicitly excluded.

**INV-TREE:**

- If a directory is **excluded** from traversal, it must:
  - Match an **explicit ignore pattern** (e.g. `node_modules`, `dist`, `build`, `.git`, `artifacts`, or a configurable list), **and**
  - Be **logged** (e.g. directory path and matched pattern), **and**
  - **S** must be defined **after** exclusions (so S does not claim to include files under that directory). No "we consider S to include everything but we didn't look there."
- **No implicit pruning.** No skipping a subtree because of heuristics, depth limit, or unstated rules. If a directory is not in the explicit ignore list, it must be visited.

**Operational rule:** Traversal is deterministic and exhaustive over (primary root minus explicitly ignored dirs). Any exclusion is by name/pattern only and logged. S is the transitive closure of included files under that traversal.

---

## 4. Diff Completeness Invariant (INV-DIFF)

When operating in **diff mode** (base vs head):

- **Base graph** and **head graph** must each satisfy INV-COV and INV-RES **independently**. That is, the set of source files in scope for base (resp. head) must be fully represented in the base (resp. head) graph; no partial base or partial head graph.
- If either base or head graph is incomplete (e.g. base has fewer nodes than base source file count, or has unresolved imports without log) → **INVALID** (e.g. **INCOMPLETE_DIFF_GRAPH**).
- No partial base graph may be used for delta computation and then emit VALID.

**Operational rule:** In diff mode, run INV-COV and INV-RES checks for both base and head before computing delta or emitting VALID.

---

## 5. VALID Redefined (v8)

Representation may return **VALID** only if **all** of the following hold:

- **INV-S** or **INV-M** (layout and package map consistent).
- **INV-G** (sourceFileCount > 0 ⇒ graph.nodes > 0).
- **INV-D** (deterministic).
- **INV-NSS** (no silent success; boundary ran when graph had nodes; no empty map when monorepo; etc.).
- **INV-COV** (S ⊆ G; no graph.nodes < sourceFileCount without cause).
- **INV-RES** (no unresolved import without UNRESOLVED_IMPORT event and cause code).
- **INV-TREE** (all dirs visited or explicitly ignored and logged; no implicit pruning).
- **INV-DIFF** (when in diff mode; base and head each complete).
- All invariants have been **evaluated** before emitting result (no early VALID).
- **boundaryEvaluationRan** when `graph.nodes.count > 0`.

**VALID** in v8 means:

*Graph is **complete** (coverage-verified), **deterministic**, **evaluated**, and **coverage-verified**. No partial graph. No silent omission.*

---

## 6. Failure Modes Updated (v8)

In addition to existing INVALID conditions (empty graph with source files, empty monorepo map, boundary skip, etc.), the following **cause codes** map to **INVALID**:

| Cause code | Condition | Meaning |
|------------|-----------|---------|
| **PARTIAL_GRAPH** | graph.nodes.count < sourceFileCount without DEGRADED cause code; or S \ G non-empty without documented exclude | Graph incomplete relative to declared source set. |
| **UNRESOLVED_IMPORTS_WITHOUT_LOG** | One or more parsed imports did not resolve and no UNRESOLVED_IMPORT event was emitted for them | Silent resolver gap. |
| **UNVISITED_SUBTREE** | A directory under primary source root was not visited and is not in the explicit ignore list (or was not logged) | Implicit pruning. |
| **INCOMPLETE_DIFF_GRAPH** | In diff mode; base or head graph fails INV-COV or INV-RES | Partial base or head graph. |

These are **INVALID** (no override). CI must fail.

---

## 7. Scenario Re-run (v8)

For each scenario: representation_status, silent coverage loss?, partial graph?, CI behavior.

| Scenario | Status | Silent coverage loss? | Partial graph? | CI (no override) |
|----------|--------|------------------------|----------------|-------------------|
| **SWR** | VALID if S = listSourceFiles and every file has a node and all imports resolved or logged. | No. INV-COV and INV-RES enforced. | No. S ⊆ G. | Pass. |
| **ky** | VALID if S defined over primary root (e.g. source/), S ⊆ G, all imports resolved or logged. | No. | No. | Pass. |
| **Empty repo** | VALID. S = ∅, G = ∅. INV-COV holds. | No. | N/A. | Pass. |
| **Single file repo** | VALID. S = 1, G >= 1, INV-COV. | No. | No. | Pass. |
| **Workspace** | single_package (v8 does not add workspace parsing). VALID if S ⊆ G and INV-RES. If workspace added later and parse fails → DEGRADED with cause. | No. | No under current S. | Pass if VALID. |
| **Alias failure** | If alias does not resolve: must emit UNRESOLVED_IMPORT. If not emitted → INVALID. If resolver disabled → DEGRADED. | No; unresolved must be logged. | Only if DEGRADED with cause. | Fail if INVALID; fail if DEGRADED unless override. |
| **Barrel exports** | Re-exports are edges; must resolve or log. INV-RES applies. | No silent drop. | No VALID if edges dropped without log. | Pass only if VALID. |
| **Dynamic import** | Out-of-scope for static graph. Not in S as "required edge"; no INV-RES obligation for dynamic targets. | N/A (OOS). | No. | Pass. |
| **Generated files** | If in S (included by traversal), must be in G. If excluded by explicit pattern, logged and S reduced. | No implicit exclude. | No VALID if generated in S but not in G. | Depends on S definition. |
| **Partial diff** | If base or head graph incomplete → INCOMPLETE_DIFF_GRAPH → INVALID. | No. INV-DIFF. | No VALID. | Fail. |

**All silent coverage loss** maps to INVALID or to DEGRADED with cause code. No VALID with partial graph.

---

## 8. Representation Contract v8 (Clean Version)

### 8.1 Scope

Graph extraction. Layout. Package map. **Completeness and coverage.** No policy. No regression. No silent success. No partial graph validity.

### 8.2 Layout (Unchanged)

- **L1.** If `repoRoot/packages` is a directory and for some direct child `d`, `repoRoot/packages/d/src` is a directory → `layout_mode = "monorepo_packages"`, `pkgDirByName` = map of such `d` → `repoRoot/packages/d`.
- **L2.** Else → `layout_mode = "single_package"`, `pkgDirByName = {"root" -> primaryRoot}`, primaryRoot = first of `repoRoot/source`, `repoRoot/src`, `repoRoot` that is a directory (else repoRoot).

### 8.3 Invariant List (v8 Full)

| Invariant | Statement |
|-----------|-----------|
| **INV-S** | single_package ⇒ pkgDirByName.size === 1, only key "root". |
| **INV-M** | monorepo_packages ⇒ every key from packages/<d>/src/ only; pkgDirByName non-empty when L1 applied. |
| **INV-B** | Boundary evaluation executed whenever graph.nodes.count > 0. Never skipped because map empty. |
| **INV-G** | sourceFileCount > 0 ⇒ graph.nodes.count > 0. |
| **INV-D** | Deterministic output for fixed repoRoot and filesystem. |
| **INV-NSS** | No silent success. VALID only when all required paths run and invariants hold; empty graph with source files → INVALID; monorepo empty map → INVALID; boundary skip when nodes > 0 → INVALID. |
| **INV-COV** | S ⊆ G. sourceFileCount > 0 and graph.nodes.count < sourceFileCount ⇒ never VALID (DEGRADED with cause or INVALID). No source file skipped without cause or documented exclude. |
| **INV-RES** | Every parsed import: either resolved and in graph, or UNRESOLVED_IMPORT event with cause code. No silent ignore. Unresolved without log → INVALID. Resolver disabled → DEGRADED. |
| **INV-TREE** | All directories under primary source root visited or explicitly ignored (pattern + log); S defined after exclusions. No implicit pruning. |
| **INV-DIFF** | In diff mode: base and head graphs each satisfy INV-COV and INV-RES. No partial base or head graph. |

### 8.4 VALID (v8)

VALID iff: INV-S or INV-M, INV-G, INV-D, INV-NSS, INV-COV, INV-RES, INV-TREE, (INV-DIFF when diff mode), all evaluated, boundary ran when graph.nodes > 0. Graph complete, deterministic, evaluated, coverage-verified.

### 8.5 Failure Modes (v8)

| Mode | Trigger examples |
|------|------------------|
| **VALID** | All invariants hold; S ⊆ G; no unresolved without log; no unvisited subtree without ignore; boundary ran when applicable. |
| **DEGRADED** | Only under Degradation Contract: e.g. PARTIAL_GRAPH_ALLOWED, OPTIONAL_RESOLVER_DISABLED, with cause code; CI fails unless override. |
| **INVALID** | PARTIAL_GRAPH; UNRESOLVED_IMPORTS_WITHOUT_LOG; UNVISITED_SUBTREE; INCOMPLETE_DIFF_GRAPH; or any v7 INVALID (empty graph, empty monorepo map, boundary skip, etc.). No override. |

### 8.6 Outputs (v8)

- representation_status: VALID | DEGRADED | INVALID
- invalid_cause / degradation_cause: enum when not VALID
- layout_mode, pkgDirByName.size
- sourceFileCount, graph.nodes.count (for INV-COV check)
- unresolved_import_count (optional; if > 0 then UNRESOLVED_IMPORT events must exist)
- Graph and map only when VALID or (DEGRADED with override).

---

## 9. Coverage Failure Taxonomy

| Failure class | Invariant | Cause code | CI |
|---------------|-----------|------------|-----|
| Fewer nodes than source files | INV-COV | PARTIAL_GRAPH | INVALID |
| Source file in S not in G (no exclude) | INV-COV | PARTIAL_GRAPH | INVALID |
| Unresolved import, no event | INV-RES | UNRESOLVED_IMPORTS_WITHOUT_LOG | INVALID |
| Directory not visited, not in ignore list | INV-TREE | UNVISITED_SUBTREE | INVALID |
| Base or head graph incomplete (diff mode) | INV-DIFF | INCOMPLETE_DIFF_GRAPH | INVALID |
| Partial graph allowed by config | Degradation Contract | PARTIAL_GRAPH_ALLOWED (DEGRADED) | Fail unless override |
| Optional resolver disabled | INV-RES + Degradation | OPTIONAL_RESOLVER_DISABLED (DEGRADED) | Fail unless override |

---

## 10. CI Gate Updates (v8)

- **Pre-VALID checks (add):** Before accepting VALID, CI or representation layer must verify:
  - `graph.nodes.count >= sourceFileCount` (or S ⊆ G by path).
  - No unresolved imports without corresponding UNRESOLVED_IMPORT in log.
  - (Diff mode only) Base and head each passed INV-COV and INV-RES.
- **New INVALID causes:** PARTIAL_GRAPH, UNRESOLVED_IMPORTS_WITHOUT_LOG, UNVISITED_SUBTREE, INCOMPLETE_DIFF_GRAPH all trigger INVALID → CI fail, no override.
- **DEGRADED cause codes** (existing): PARTIAL_GRAPH_ALLOWED, OPTIONAL_RESOLVER_DISABLED, etc. — still fail CI unless override.

---

## 11. v7 → v8 Delta

| Area | v7 | v8 |
|------|-----|-----|
| **Completeness** | INV-G: non-empty graph when source files exist. | INV-COV: S ⊆ G; graph.nodes >= sourceFileCount; no VALID when partial. |
| **Resolver** | Not specified. | INV-RES: every import resolved or logged with cause; silent ignore → INVALID. |
| **Traversal** | Not specified. | INV-TREE: exhaustive visit or explicit ignore + log; no implicit pruning. |
| **Diff** | Not specified. | INV-DIFF: base and head each complete; no partial base graph. |
| **VALID** | Invariants + no silent success + boundary ran. | Same + INV-COV + INV-RES + INV-TREE + (INV-DIFF in diff mode). VALID = complete, coverage-verified. |
| **Failure modes** | INVALID/DEGRADED/VALID. | + PARTIAL_GRAPH, UNRESOLVED_IMPORTS_WITHOUT_LOG, UNVISITED_SUBTREE, INCOMPLETE_DIFF_GRAPH → INVALID. |
| **Outputs** | status, layout_mode, map size, cause. | + sourceFileCount, graph.nodes.count (or equivalent) for coverage check; optional unresolved_import_count. |
| **CI** | Gate on status. | Gate also checks coverage (S ⊆ G) before accepting VALID; new INVALID causes. |

---

## 12. Why Partial Graph Validity Is Now Impossible

1. **INV-COV:** VALID requires S ⊆ G and graph.nodes >= sourceFileCount. Any implementation that emits VALID with fewer nodes than source files (or with a file in S missing from G) violates the contract. CI or post-run check can assert `|G| >= |S|` and fail otherwise. So **partial graph cannot be VALID**.

2. **INV-RES:** Every unresolved import must produce an event. If the implementation silently drops imports, it cannot claim to have no unresolved imports; either it logs them (and can still be VALID if policy treats them as external) or it has unresolved-without-log → INVALID. So **silent resolver gaps cannot be VALID**.

3. **INV-TREE:** Any directory not visited must be in the explicit ignore list and logged. So the set S is defined by a deterministic, exhaustive traversal minus only documented exclusions. No "we didn't look there" without it being explicit. So **unvisited subtrees without cause cannot be VALID**.

4. **INV-DIFF:** In diff mode, both base and head must satisfy INV-COV and INV-RES. So **partial base or head graph cannot be VALID**.

5. **Failure mode taxonomy:** PARTIAL_GRAPH, UNRESOLVED_IMPORTS_WITHOUT_LOG, UNVISITED_SUBTREE, INCOMPLETE_DIFF_GRAPH are all INVALID. There is no path where "we have a partial graph but we'll call it VALID anyway." DEGRADED is only with explicit cause and CI fail unless override. So **no silent omission can survive as VALID**.

6. **Operational lock:** VALID is only emitted after all invariants are evaluated (v7 S5). So the implementation must run the coverage checks (S ⊆ G, resolver events, traversal log) before setting status. No early return that skips coverage and still returns VALID.

**Summary:** The contract requires **completeness** (INV-COV), **resolver accountability** (INV-RES), **exhaustive traversal** (INV-TREE), and **diff completeness** (INV-DIFF). VALID is redefined to include these. Partial graph, silent skip of files, silent skip of imports, and partial diff graphs all map to INVALID or DEGRADED with cause. So representation either produces a **complete, coverage-verified graph** (VALID), **fails loudly** (INVALID with cause code), or **degrades explicitly** (DEGRADED with cause and CI fail unless override). **Partial graph validity is structurally impossible under v8.**

---

*End of Representation Contract v8 — Graph Completeness & Coverage.*
