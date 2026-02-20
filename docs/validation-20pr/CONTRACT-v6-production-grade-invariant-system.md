# Production-Grade Invariant System — Representation v6, Policy v1, Regression v1

Structural hardening pass. Not an improvement pass.

---

## 1. System Decomposition

Three independent contracts. No overlap.

### A. Representation Contract (Graph Extraction Only)

| Field | Definition |
|-------|------------|
| **Scope** | Layout classification, package discovery, graph construction (nodes + edges), package map. No policy. No regression metrics. |
| **Inputs** | `repoRoot` (absolute path), file system read of repo (list dirs, read files, stat). |
| **Outputs** | `layout_mode`, `pkgDirByName`, graph (nodes, edges), `sourceRoot` when single_package. |
| **Hard invariants** | See Representation Contract v6 below. |
| **Non-goals** | Layer order; direction rules; FP/FN/TN; "allow" vs "block"; any human decision. |

### B. Policy Contract (Layer / Direction Rules)

| Field | Definition |
|-------|------------|
| **Scope** | When to emit boundary_violation, relative_escape, directional block. Depends on representation outputs; does not define them. |
| **Inputs** | Graph, `pkgDirByName`, `layout_mode`, diff entries, optional layer config (external). |
| **Outputs** | Violations (list), decision signal (block/allow) for downstream. |
| **Hard invariants** | When `layout_mode === "single_package"`, policy MUST NOT emit boundary_violation or relative_escape between any two files in the repo. Cross-package rules apply only when `layout_mode === "monorepo_packages"`. |
| **Non-goals** | Defining packages; defining layout; graph construction; regression metrics. |

### C. Regression Contract (20-PR Lock)

| Field | Definition |
|-------|------------|
| **Scope** | Acceptance criteria for the 20-PR benchmark. External to representation and policy. |
| **Inputs** | Human ground truth (CSV), ANCHR result JSONs per PR, metrics script output. |
| **Outputs** | TP, FP, FN, TN, Catastrophic_FN; pass/fail vs locked targets. |
| **Hard invariants** | Target: TP=1, FP=0, FN=0, TN=19, Catastrophic_FN=0. Any TN flip or FP>0 → rollback. |
| **Non-goals** | Defining how the graph is built; defining layout; defining policy rules. |

**Separation rule:** Representation Contract never references FP/FN/TN or "must not increase". Policy Contract never references 20-PR counts. Regression Contract never embeds representation or policy logic; it only consumes outputs and compares to lock.

---

## 2. Representation Contract v6

### 2.1 Scope (v6)

Graph extraction only. Layout classification. Package map. No layer semantics. No direction rules. No regression expectations.

### 2.2 Layout Classification Rules (Explicit, No Heuristics)

- **Rule L1.** Let `P = join(repoRoot, "packages")`. If `P` is a directory and there exists at least one direct child `d` of `P` such that `join(P, d, "src")` is a directory, then **layout_mode = "monorepo_packages"**. No other condition may set monorepo_packages.
- **Rule L2.** If Rule L1 does not apply, then **layout_mode = "single_package"**. No inference from folder count, folder names, or file contents.

### 2.3 Package Discovery Algorithm (Formal Pseudocode)

```
DISCOVER_PACKAGES(repoRoot):
  P := repoRoot / "packages"
  if P is directory:
    for each direct child d of P (d is directory, d not symlink):
      S := P / d / "src"
      if S is directory:
        pkgDirByName[d] := P / d
    if pkgDirByName non-empty:
      return (layout_mode := "monorepo_packages", pkgDirByName)

  // single_package
  primaryRoot := null
  for candidate in [repoRoot / "source", repoRoot / "src", repoRoot]:
    if candidate is directory:
      primaryRoot := candidate
      break
  if primaryRoot is null:
    primaryRoot := repoRoot

  pkgDirByName := {"root" -> primaryRoot}
  return (layout_mode := "single_package", pkgDirByName)
```

- No other keys may be added to `pkgDirByName` in single_package mode. No first-level subdirectory of `source` or `src` may be treated as a package name.

### 2.4 Single-Package Invariant

**INV-S:** When `layout_mode === "single_package"`, `pkgDirByName.size === 1` and the only key is `"root"`. No other package name may be derived from path structure.

### 2.5 Monorepo Invariant

**INV-M:** When `layout_mode === "monorepo_packages"`, every entry in `pkgDirByName` is of the form `(name, join(repoRoot, "packages", name))` where `join(repoRoot, "packages", name, "src")` is a directory. No entry may be derived from `source/` or `src/` first-level folders.

### 2.6 Boundary Detection Invariant

**INV-B:** Boundary evaluation (the code path that computes cross-package or relative-escape violations) is **executed** if and only if the graph has at least one node. It is **never skipped** because `pkgDirByName` is empty when source files exist. When `layout_mode === "single_package"`, the representation exposes exactly one package; whether policy emits violations is defined by the Policy Contract, not by representation.

### 2.7 Graph Completeness Invariant

**INV-G:** If `listSourceFiles(repoRoot)` returns a non-empty list, then the graph must have `nodes.size > 0`. No code path may produce an empty graph when source files exist. (Graph is built from the same source root(s) that discovery uses; for single_package, from primary source root.)

### 2.8 Determinism Invariant

**INV-D:** For a fixed `repoRoot` and fixed filesystem state, `DISCOVER_PACKAGES(repoRoot)` and the resulting graph (node set, edge set) are deterministic. No randomness, no timestamps in graph keys, no environment-dependent node identity beyond the defined primary-root order (source, src, repoRoot).

### 2.9 Failure Mode Definitions

| Mode | Condition | Meaning |
|------|-----------|---------|
| **VALID** | layout_mode in {"monorepo_packages", "single_package"} and INV-S or INV-M holds and INV-G holds | Representation succeeded; policy may run. |
| **DEGRADED** | layout_mode === "single_package" but graph has zero nodes although source files exist under primary root | Implementation bug; must not skip boundary evaluation; must log and treat as single package. |
| **INVALID** | layout_mode not in the two allowed values; or pkgDirByName.size !== 1 when single_package; or graph empty when source files exist with no fallback | Representation contract violated; abort or fail CI. |

### 2.10 What v6 Must NOT Include

- Layer semantics, layer order, directional block.
- Any reference to FP, FN, TN, TP, "must not increase", or regression metrics.
- Policy decisions (allow/block).
- Inference of package structure from folder names or count.

---

## 3. Mechanical Assertions

Implementable in code. Every invariant must be machine-verifiable.

| # | Assertion | Enforceable |
|---|-----------|-------------|
| A1 | `layout_mode === "single_package" || layout_mode === "monorepo_packages"` | Yes: log and assert after discovery. |
| A2 | `layout_mode === "single_package" → pkgDirByName.size === 1` | Yes: assert after discovery. |
| A3 | `layout_mode === "single_package" → pkgDirByName.has("root") && pkgDirByName.size === 1` | Yes: assert. |
| A4 | `layout_mode === "monorepo_packages" → every key k in pkgDirByName satisfies path(pkgDirByName.get(k)) === join(repoRoot, "packages", k)` | Yes: assert structure. |
| A5 | No key in pkgDirByName is derived from a first-level child of "source" or "src" when layout_mode === "single_package" | Yes: single_package implies only "root"; no other keys. |
| A6 | `sourceFileCount > 0 → graph.nodes.size > 0` (where sourceFileCount from listSourceFiles) | Yes: assert after graph build. |
| A7 | Boundary evaluation was run if `graph.nodes.size > 0` (no silent skip when pkgDirByName.size === 0 in an implementation that incorrectly returned empty map) | Yes: when layout_mode is single_package, map is never empty; when monorepo_packages, map non-empty by definition. Assert that boundary code path is entered whenever graph has nodes. |
| A8 | `layout_mode` and `pkgDirByName.size` logged in structured output for CI | Yes: CI can grep or parse. |

**Note:** "every package has package.json" is not required by v6. Monorepo is defined only by directory structure (packages/<d>/src/). Adding package.json would be a policy or tooling choice, not representation.

---

## 4. Adversarial Safety Review

### 4.1 Why v6 Would Not Produce the 4 SWR FPs

- **Cause of SWR FPs:** First-level folders under `src/` (e.g. `src/core`, `src/index`, `src/immutable`, `src/infinite`) were used as package names. Relative imports like `../_internal` crossed that artificial boundary → relative_escape → BLOCK.
- **v6:** Layout classification does not use first-level folders under `src/` or `source/` as packages. Only L1 (packages/<d>/src/) can produce multiple packages. SWR has no `packages/` with that structure → layout_mode = single_package, pkgDirByName = {"root" -> primaryRoot}. One package only. No cross-package boundary. Policy Contract v1 forbids emitting boundary_violation or relative_escape between files in the same repo when layout_mode === single_package. So the 4 FPs cannot occur.

### 4.2 Why v6 Would Not Silently Skip the ky FN

- **Cause of ky FN:** Package map was empty (discovery only looked at `/packages`); boundary evaluation was skipped; utils→core edge never evaluated.
- **v6:** INV-B and INV-G require that boundary evaluation runs whenever the graph has nodes. Discovery never returns an empty map when the repo has source files: either monorepo_packages (non-empty) or single_package (exactly one entry "root"). So boundary evaluation is never skipped for "empty map". For ky, layout_mode = single_package, map size 1; boundary runs. The *policy* in single_package mode does not emit cross-package violations (because there is only one package in representation). So v6 representation does not *by itself* fix the ky FN (utils→core would not be "cross-package" in representation). Fixing the FN requires Policy Contract to support an optional layer model (e.g. config-driven) for single_package repos; that is outside Representation Contract. So: v6 prevents *silent skip*; it does not conflate representation with policy. Ky FN fix = policy extension (config), not representation relaxation (no folder-as-package).

### 4.3 Why Fallback Cannot Infer Structure from Folders

- **v6:** Fallback is defined only as: primaryRoot = first of (source, src, repoRoot) that exists; pkgDirByName = {"root" -> primaryRoot}. No iteration over first-level children. No map key other than "root". So no folder-as-package inference is possible in the contract.

### 4.4 Why Single-Package Repos Remain Single-Package

- **v6:** INV-S and L2. The only way to get multiple packages is L1 (packages/<d>/src/). Any repo that does not satisfy L1 gets single_package and size 1. No heuristic can add keys.

### 4.5 Why Monorepos Remain Isolated

- **v6:** INV-M. Monorepo packages are only those under `repoRoot/packages/<d>/src/`. No entry from `source/` or `src/`. So SWR (which uses `src/` only) can never be classified as monorepo_packages.

---

## 5. Representation Blind Spot Detection Matrix

For each risk: who is responsible (Representation / Policy / Regression) or explicitly out-of-scope.

| Risk | Representation | Policy | Regression | Out-of-scope |
|------|----------------|--------|------------|--------------|
| **Alias resolution failures** | Representation: use same resolver for graph and violations; no duplicate node identity. | Policy: does not define aliases. | Regression: 20-PR may expose missing edges. | — |
| **TS path mapping drift** | Representation: tsconfig paths used for resolution; drift produces wrong edges/nodes. | — | — | Out-of-scope: no contract for tsconfig versioning. |
| **Barrel exports** | Representation: re-exports are edges; follow same resolution. | Policy: may treat re-export targets. | — | — |
| **Dynamic imports** | Out-of-scope: static analysis only; dynamic edges not represented. | Policy: may choose to ignore or warn. | — | Representation: explicit OOS. |
| **Case-insensitive FS** | Representation: node identity must be deterministic; contract does not mandate lowercase; implementation may normalize for same FS. | — | — | Out-of-scope: no cross-OS identity guarantee in v6. |
| **Partial diff, base graph incomplete** | Representation: graph is over current tree (head); no "base graph" in contract. | — | Regression: benchmark runs on full PR. | — |
| **Incomplete dependency graph** | Representation: INV-G (non-empty when source files exist); no guarantee all possible edges present (e.g. dynamic). | Policy: acts on provided graph. | — | — |
| **Workspace misclassification** | Representation: v6 does not parse workspace configs; only L1/L2. Workspace repos not matching L1 are single_package. | — | — | Out-of-scope: workspace config in v6. |
| **Mixed CJS/ESM** | Representation: scope is .ts/.tsx; CJS/ESM is out-of-scope unless explicitly in file list. | — | — | Out-of-scope for v6. |
| **Generated files** | Representation: listSourceFiles defines what is "source"; generated can be excluded. | — | — | Out-of-scope: no contract for generated. |

No gray zones: each cell is either responsible or out-of-scope.

---

## 6. Minimal Contract (Smallest Set)

The smallest set of invariants that:

- Prevent SWR-style over-blocking: **INV-S + L2** (single_package, no folder-as-package).
- Prevent silent package-map emptiness: **INV-B + INV-G** (boundary runs when nodes > 0; graph non-empty when source files exist).
- Preserve CI determinism: **INV-D** (deterministic discovery and graph).
- Keep policy out of representation: **Scope of Representation v6** (no layer/direction/regression).

**Minimal set:**

1. **L1, L2** — Layout classification (two modes only; no inference).
2. **INV-S** — single_package ⇒ size 1, key "root".
3. **INV-M** — monorepo_packages ⇒ only packages/<d>/src/.
4. **INV-B** — Boundary evaluation not skipped when graph has nodes.
5. **INV-G** — source files exist ⇒ graph nodes > 0.
6. **INV-D** — Deterministic output for fixed inputs.

Plus **Failure modes** (VALID / DEGRADED / INVALID) and **Mechanical assertions A1–A8** as the enforceable surface.

---

## 7. Confidence & Risk Table

| Score | Value | Explanation |
|-------|--------|-------------|
| **Over-block risk** | Low (1/10) | No folder-as-package; single_package = one package; Policy v1 forbids boundary/relative_escape between same-repo files in single_package. SWR-class FPs cannot occur under contract. |
| **Under-detection risk** | Medium (4/10) | Ky-style FN (utils→core) is not fixed by representation alone; requires policy extension (e.g. config-driven layers). Representation does not silently skip (INV-B, INV-G). |
| **Drift resistance** | High (8/10) | No inference, no heuristics, two modes, six invariants. Easy to grep and assert. Policy and regression are separate docs. |
| **CI stability** | High (8/10) | Deterministic; assertions A1–A8 implementable; Regression Contract external; no FP/FN language in representation. |
| **Long-term maintenance** | Low complexity (7/10) | Small surface; adding a new layout (e.g. workspace) would be an explicit contract change, not hidden behavior. |

---

## 8. Final Output

### 8.1 Representation Contract v6 (Clean Version)

**Scope:** Graph extraction. Layout classification. Package map. No policy. No regression.

**Layout:**
- **L1.** If `repoRoot/packages` is a directory and for some direct child `d`, `repoRoot/packages/d/src` is a directory → `layout_mode = "monorepo_packages"`, `pkgDirByName` = map of such `d` → `repoRoot/packages/d`.
- **L2.** Else → `layout_mode = "single_package"`, `pkgDirByName = {"root" -> primaryRoot}`, where primaryRoot = first of `repoRoot/source`, `repoRoot/src`, `repoRoot` that is a directory (else repoRoot).

**Invariants:**
- **INV-S:** single_package ⇒ pkgDirByName.size === 1 and only key is "root".
- **INV-M:** monorepo_packages ⇒ every key is from packages/<d>/src/ structure only.
- **INV-B:** Boundary evaluation runs whenever graph has at least one node; never skipped for empty package map when source files exist.
- **INV-G:** listSourceFiles(repoRoot) non-empty ⇒ graph.nodes.size > 0.
- **INV-D:** Output deterministic for fixed repoRoot and filesystem.

**Failure modes:** VALID (invariants hold); DEGRADED (single_package but zero nodes with source files — implementation bug); INVALID (layout_mode invalid or invariant violation).

**Non-goals:** Layer order, direction rules, FP/FN/TN, policy decisions.

---

### 8.2 Policy Contract v1 (Clean Version)

**Scope:** When to emit boundary_violation, relative_escape, or directional block. Consumes representation outputs; does not define packages or layout.

**Inputs:** Graph, pkgDirByName, layout_mode, diff entries, optional external layer config.

**Hard invariant:** When `layout_mode === "single_package"`, policy MUST NOT emit boundary_violation or relative_escape between any two files in the same repository. All files are in one package; no cross-package rule applies.

**When layout_mode === "monorepo_packages":** Cross-package and public-surface rules may apply as defined elsewhere (not in Representation Contract).

**Non-goals:** Defining packages; defining layout; graph construction; regression metrics.

---

### 8.3 Regression Contract v1 (Clean Version)

**Scope:** 20-PR benchmark acceptance. External to representation and policy.

**Inputs:** Human ground truth (CSV), ANCHR result JSONs, metrics script.

**Invariants:** TP = 1, FP = 0, FN = 0, TN = 19, Catastrophic_FN = 0. Any TN flip or FP > 0 → rollback. No embedding of representation or policy logic in this contract.

**Non-goals:** How graph is built; how layout is chosen; how policy decides.

---

### 8.4 Risk Analysis Summary

- **Over-block:** Mitigated by INV-S and Policy v1 (no cross-package in single_package).
- **Under-detection:** Ky FN requires policy-layer extension (config-driven layers); representation does not silently skip.
- **Drift:** Three separate contracts; representation is boring (two modes, six invariants).
- **CI:** Assertions A1–A8; Regression Contract as external gate.

---

### 8.5 What Changed from v5 → v6

| Change | v5 | v6 |
|--------|-----|-----|
| **Structure** | Single spec with policy/regression mixed out-of-scope | Three contracts: Representation, Policy, Regression. No overlap. |
| **Invariants** | Single-package size 1; boundary runs | + INV-M, INV-G, INV-D; failure modes VALID/DEGRADED/INVALID. |
| **Assertions** | Informal "log and assert" | Eight mechanical assertions A1–A8. |
| **Policy** | "Do not emit in single_package" in narrative | Policy Contract v1 with hard invariant. |
| **Regression** | "Separate doc" | Regression Contract v1 with explicit non-goals. |
| **Blind spots** | Not systematized | Blind Spot Detection Matrix; responsibility or OOS per risk. |
| **Minimal set** | Summary | Explicit minimal invariant set (L1, L2, INV-S, INV-M, INV-B, INV-G, INV-D). |
| **Risk** | Confidence score only | Risk table (over-block, under-detection, drift, CI, maintenance). |

**Ruthless reductions:** No "every package has package.json"; no workspace parsing; no layer/direction in representation; no FP/FN language in representation. Representation is boring. Policy is explicit. Regression is separate.

---

*End of Production-Grade Invariant System (v6).*
