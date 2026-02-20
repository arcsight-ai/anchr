# Formal Falsification & Minimal-Safety Audit of Representation Contract

**Subject:** ANCHR representation / layout-agnostic graph extraction (SPEC + 20-PR regression lock).  
**Treated as:** Representation Integrity Contract v4 (spec + invariants).  
**Audit type:** Structural correctness / falsification. Not an editing task.

**Assumptions:**
- A layout-agnostic fallback previously caused 4 false positives (SWR).
- 20-PR regression lock is mandatory (TN=19, FP=0; only ky_751 may flip to BLOCK).
- Representation must not infer architectural intent.
- Folder count alone must never imply multi-package structure.
- Policy logic must not leak into representation.
- CI stability is critical.
- Fatal invariants must be mechanically enforceable in code.

---

## 1. Weaknesses Found (Precise, Technical)

| # | Weakness | Severity |
|---|----------|----------|
| W1 | **Fallback_Mode_Behavior** says "first-level folder under source/ or src/ as package" OR "root as single package". The choice is underspecified. Implementations that pick "first-level folders" for any repo with `source/` or `src/` will treat SWR's `src/core`, `src/index`, `src/immutable`, `src/infinite` as packages → relative imports like `../_internal` become relative_escape → FP. | High |
| W2 | **"Folder-based fallback"** is representation; **"boundary_violation when target not in public surface"** is policy. The SPEC couples them: fallback defines packages, then the same boundary rule runs. So representation (folder = package) directly drives policy outcome. Representation ≠ architecture is violated. | High |
| W3 | **Layer_Order_Definition** (Section 4): "If no config: infer order from existing edges or treat all same layer." Inferring from edges is nondeterministic (order of traversal, tie-breaking). "Treat all same layer" is underspecified for fallback (is "root" one layer or are utils/core two layers with undefined order?). | Medium |
| W4 | **Required_Invariants** "FP count must not increase" is a regression guard, not a representation invariant. It belongs in CI/benchmark contract, not in the representation spec. Mixing them makes the contract over-specified and conflates "what the graph is" with "what the benchmark allows." | Medium |
| W5 | **Canonical_Node_Spec** "lowercase if case-insensitive FS" is environment-dependent; not mechanically testable without FS abstraction. Introduces nondeterminism risk across OS. | Low |
| W6 | **Discovery_Mode_Detection** Step 2: "workspace config (package.json workspaces or pnpm-workspace.yaml)" — parsing these files is semantic (workspace globs, overrides). Ambiguous which keys/fields count; not purely syntactic. | Medium |
| W7 | **Runtime_Assertions** "layout_detection_mode in { ... }" — no assertion that the chosen mode is the *only* mode that could apply; so "fallback_single_root" vs "fallback_first_level" can be both plausible for same repo if we don't define precedence strictly. | Low |
| W8 | **Supported layouts (c) and (d):** "repo root contains src/" and "flat root". listSourceFiles (current code) only scans `packages/` and `source/`; it does not scan root-level `src/` or flat root. So the SPEC promises layouts the current implementation does not support. Contract is forward-looking but unenforceable without code. | High |
| W9 | **"Do NOT silently allow"** when pkgMap empty — good. But "ensure pkgMap never empty" by fallback can *create* packages (e.g. first-level folders). That creation is what caused SWR FP. So the invariant "non-empty map" is necessary but not sufficient; the *rule for* when to use single root vs folder-as-package is underspecified and led to FP. | High |
| W10 | **Topology vs architecture:** SPEC uses "layer" and "package" and "boundary" interchangeably in places. Graph topology (who imports whom) is representation; "layer order" and "directional block" are policy. Section 4 embeds policy in the same doc as representation. | High |

---

## 2. Scenario Simulation

| Scenario | Contract outcome (current SPEC) | FP risk? | Miss violations? | Block CI? |
|---------|---------------------------------|----------|-------------------|-----------|
| 1. Explicit monorepo (/packages) | VALID; monorepo_packages; boundary runs. | No | No | No |
| 2. Workspace monorepo (pnpm/yarn) | Ambiguous; Step 2 depends on parsing workspace config. | Low | Possible if workspace roots not discovered | Possible if misparse |
| 3. Single-package layered (/src/core, /src/utils) | Fallback: if first-level folders → "core", "utils" as packages → boundary runs; cross-folder = cross-package. **FP risk: yes** (SWR case). If single "root" → no FP, but ky-style utils→core not represented as cross-package. | **Yes** (folder-as-package) | Yes (if single root for ky) |
| 4. Flat repo (no folders) | Fallback_single_root; one package. No cross-package edges. | No | Only if flat has no "layers" by design | No |
| 5. Alias-heavy repo | Canonical_Node_Spec says "resolve path aliases to physical path". If alias resolution incomplete, duplicate nodes or missing edges. | Possible | Yes (missing edges) | Unclear |
| 6. Barrel-heavy repo | Re-exports propagate; more edges. "Re-export amplification" in SPEC. Deterministic; FP only if boundary rule mislabels. | Low | Low | No |
| 7. Dynamic-import-heavy repo | Edges from static analysis only; dynamic imports not represented. Blind spot allowed by current design. | No | Yes (by design) | No |
| 8. Mixed JS/TS | listSourceFiles is .ts/.tsx only. JS files not nodes. Underspecified whether JS is in scope. | No | Yes (JS edges missed) | No |
| 9. Case-insensitive FS | Canonical_Node_Spec "lowercase if case-insensitive FS" — behavior differs from case-sensitive. Same repo, different OS → different node IDs? | Possible | Possible | Possible |
| 10. Partial diff, base graph incomplete | SPEC says "edge delta (or full graph) computed". Doesn't require base graph; "incomplete" not defined. Could allow skipping. | No | Yes | Unclear |

---

## 3. What Must Be Removed

- **Remove** Layer_Model_Schema and Directional_Block_Rule from the *representation* contract. They are policy. Keep them in a separate "Policy / Enforcement" doc if needed.
- **Remove** "FP count must not increase" from Required_Invariants in the representation spec. Move to a separate "20-PR Regression Lock" or CI contract.
- **Remove** "Infer order from existing edges" from Layer_Order_Definition (nondeterministic).
- **Remove** any requirement that "first-level folders under source/ or src/ be treated as packages" as a *default*. That rule caused SWR FP.

---

## 4. What Must Be Simplified

- **Simplify** Fallback_Mode_Behavior to a single rule: when not monorepo (`/packages` with subdirs+src), treat the *entire* repo as **one** logical package for representation (single package map entry, e.g. "root"). No folder-as-package in the representation layer.
- **Simplify** Discovery_Mode_Detection to two modes only: (1) monorepo_packages when `packages/` exists and has at least one `packages/<d>/src/`; (2) single_package otherwise (map size 1, key e.g. "root", value repo root or primary source root).
- **Simplify** Runtime_Assertions to: (a) layout_mode in { "monorepo_packages", "single_package" }; (b) boundary evaluation runs iff graph node count > 0 (no "skip because map empty" when source files exist).

---

## 5. What Must Be Clarified

- **Clarify** "Primary source root" for single_package: fixed ordered check — e.g. `source/` if directory, else `src/` if directory, else repo root. No heuristics.
- **Clarify** that "boundary" evaluation in single_package mode does *not* create artificial boundaries: no relative_escape or boundary_violation between files in the same logical package (entire repo). So directional or cross-package rules only apply when layout_mode = monorepo_packages.
- **Clarify** that representation does not define "layer order". Layer order is policy input (config or explicit), not inferred from folder names.
- **Clarify** that the 20-PR benchmark is the *regression lock*: any change to representation must be validated by that benchmark; the representation spec itself does not list FP/FN counts.

---

## 6. What Must Be Added (Only If Strictly Necessary)

- **Add** one fatal invariant, mechanically checkable: **"When layout_mode = single_package, pkgDirByName.size === 1."** Enforce in code and in CI (log layout_mode; assert size === 1 when not monorepo).
- **Add** one regression guard document (separate from representation spec): **"20-PR Regression Lock"** — run 20-PR validation; accept only TP=1, FP=0, FN=0, TN=19; any TN flip → rollback. Referenced by CI, not embedded in representation contract.

---

## 7. Revised Sections Only (Minimal Safe Contract v5)

### 7.1 Discovery (v5)

**Discovery_Mode:**
- If `exists(repoRoot, "packages")` and for at least one direct child `d`, `exists(repoRoot, "packages", d, "src")` → **monorepo_packages**. Package roots = { `join(repoRoot, "packages", d)` for each such `d` }.
- Else → **single_package**. One entry: key `"root"`, value = primary source root. Primary source root = first that exists: `join(repoRoot, "source")`, else `join(repoRoot, "src")`, else `repoRoot`.

**Invariant (mechanical):** `layout_mode === "single_package" ⇒ pkgDirByName.size === 1`.

No folder-as-package. No first-level subdirs under source/src as separate packages in representation.

### 7.2 Boundary Evaluation (v5)

- When **monorepo_packages**: run boundary and relative_escape logic as today (cross-package, public surface).
- When **single_package**: do *not* emit boundary_violation or relative_escape between files in the same repo (all files are same package). Cycle detection still runs. So: representation exposes one package; policy does not create artificial boundaries.

### 7.3 Runtime Assertions (v5)

1. Log `layout_mode` in { "monorepo_packages", "single_package" }.
2. Log `Package_Map_Size` and `Boundary_Evaluation_Executed`.
3. Assert: if `listSourceFiles` non-empty then graph node count > 0.
4. Assert: when `layout_mode === "single_package"`, `pkgDirByName.size === 1`.

### 7.4 What Is Out of Scope (v5)

- Layer order and directional block rule → policy doc, not representation.
- 20-PR metrics (TP/FP/FN/TN) → regression lock doc + CI.
- Workspace config parsing (pnpm/yarn) → future; not in v5.
- Alias resolution and barrel normalization → unchanged from current; no new spec.

---

## 8. Minimal Safe Contract v5 — Summary

- **Two layout modes only:** monorepo_packages (current `/packages` behavior) and single_package (one map entry "root", primary source root).
- **No folder-as-package** in representation. Single-package repos are one package; no artificial boundaries.
- **Policy separated:** boundary_violation / relative_escape / layer order live in policy; representation only provides graph and package map.
- **Mechanically enforceable:** layout_mode and pkgDirByName.size assertions; no "infer from edges" or workspace heuristics in v5.

---

## 9. Why v5 Would Not Have Caused the SWR False Positives

- **Root cause of SWR FP:** First-level folders under `src/` (e.g. `src/core`, `src/index`, `src/immutable`, `src/infinite`) were treated as separate packages. Imports like `../_internal` or `../index` crossed "package" boundaries → relative_escape → BLOCK.
- **v5 rule:** For any repo that does not have `packages/<d>/src/`, layout_mode = **single_package**, and **pkgDirByName.size === 1**. There are no multiple packages; the whole repo is one package. So no cross-package relative_escape; `../_internal` and `../index` are within the same logical package. No BLOCK.
- **Trade-off:** Under v5, ky (source/utils, source/core) is also single_package until we add a *policy* or *optional* layer model (e.g. config that says "source/utils and source/core are layers with order"). So the *representation* would not by itself fix the ky FN (utils→core would not be a "cross-package" edge in representation). Fixing the FN would require a separate, explicit mechanism (e.g. config-driven layer names and order for single_package repos), not default folder-as-package. So: v5 prevents SWR FP; ky FN fix is deferred to a minimal, explicit policy layer (config-driven), not to representation guessing.

---

## 10. CI Stability Assessment

- **v5:** Fewer code paths (two modes, one invariant). No workspace parsing, no folder-as-package. Less branching → fewer regressions from layout classification. CI can assert layout_mode and map size from structured log.
- **Risk:** If primary source root (source vs src vs root) is wrong for a repo, we could get zero nodes. Mitigation: fixed order (source, then src, then root); same as listSourceFiles so graph build and discovery stay aligned.

---

## 11. Drift Resistance Assessment

- **v5:** No "infer", no "heuristics", no "if no config then…" for layer order. Removal of policy from representation reduces drift from someone "improving" boundary rules and accidentally coupling to folder structure. Explicit layout_mode and single invariant (size === 1 for single_package) are easy to test and to grep for in code.
- **Weakness:** "Primary source root" is still a small set of path names (source, src). If a new layout becomes common, the contract would need one more explicit path, not a generic "discover anything" rule.

---

## 12. Confidence Score

**Confidence that v5 prevents representation blind spots without over-blocking: 72%.**

- **Prevents over-blocking (SWR-style FP):** High (95%): no folder-as-package, single_package = one package, no artificial boundaries.
- **Prevents blind spots (ky-style FN):** Medium (50%): under v5 alone, ky stays single_package so utils→core is not represented as cross-package; fixing FN requires an explicit, config-driven layer model, not baked into representation.
- **Mechanical enforceability:** High (90%): two modes, one numeric invariant, no inference.
- **CI and drift:** Good (80%): smaller, deterministic contract; regression lock in separate doc.

Overall: v5 is **minimal and safe** for not reintroducing SWR FPs and for CI/drift. It does **not** by itself fix the ky FN; that is intentionally left to a separate, explicit policy step (config-driven layers) so representation stays representation.

---

*End of Formal Falsification Audit.*
