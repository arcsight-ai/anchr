# ANCHR — Precision & False-Positive Stress Test Report

**Objective:** Validate that ANCHR blocks only real structural violations and does not create developer fatigue.

**Scope:** Audit + simulate + evaluate signal quality. No engine logic changes unless a real precision flaw is discovered.

---

## 1. Clean PR Test (No Structural Change)

| Scenario | Engine behavior | Expected | Match |
|----------|------------------|----------|--------|
| Comments only | Diff has no new/changed imports; no files trigger violation detection. Only `.ts`/`.tsx` in diff under `packages/<name>/src` are analyzed; comment-only changes may change file content but `parseDeps` yields no new cross-boundary imports. | MERGE_VERIFIED, success | **YES** |
| Rename variables (same module) | No import/export boundary change. `detectViolations` only considers imports and public API; variable renames do not add violations. | MERGE_VERIFIED | **YES** |
| Reformat (whitespace) | Same; dependency graph unchanged. | MERGE_VERIFIED | **YES** |
| Add non-exported helper in same module | No new cross-package or public-surface change. Violations require cross-boundary import, deleted public API, or cycle. | MERGE_VERIFIED | **YES** |

**Evidence:** 20-PR validation: 19/20 human ALLOW PRs received ANCHR ALLOW (TN=19). No false positives. Clean PRs (e.g. docs, internal refactor, single-module change) consistently VERIFIED in human ground truth.

**Zero unnecessary warnings:** Report level is binary for structural audit — VERIFIED or BLOCKED. WARN (REVIEW_REQUIRED) only from INCOMPLETE (git unavailable), INDETERMINATE (missing proof), or policy nondeterminism guard. Clean PRs with full analysis do not produce REVIEW_REQUIRED.

---

## 2. Boundary-Safe Refactor

| Scenario | Engine behavior | Expected | Match |
|----------|------------------|----------|--------|
| Move logic within same bounded module | No new imports from other packages; no public API deletion; no cycles introduced. `detectViolations` only fires on cross-package resolution to forbidden/internal paths, deleted public files, or (in graph) cycles. | MERGE_VERIFIED | **YES** |
| Refactor function bodies, same package | Same; dependency edges unchanged. | MERGE_VERIFIED | **YES** |

Package boundary is `packages/<name>/src`; discovery is from `packages/` only. Internal moves within one package do not create violations.

---

## 3. Legitimate Violation

| Scenario | Engine behavior | Expected | Match |
|----------|------------------|----------|--------|
| Import internal module across package boundary | `resolveSpecifierFrozen` marks forbidden/internal; `detectViolations` adds `boundary_violation` or `relative_escape`. Report status BLOCKED, decision block, minimal cut from sorted violations. | MERGE_BLOCKED, minimal cut, high confidence | **YES** |
| Circular dependency between packages | `detectCycles` + `cyclesToViolations` add `circular_import` violations. `hasBlock` is true; status BLOCKED. | MERGE_BLOCKED | **YES** |

Minimal cut: built from all violations (sorted), format `package:path:cause[:specifier]`, displayed up to 12 edges in CLI. Confidence: HIGH when BLOCKED with full proofs (coverage 1 in VERIFIED only; BLOCKED uses 0 in current buildReport, but action layer still produces fix-architecture/require-migration etc. with high severity). Policy: block → conclusion failure.

---

## 4. Grey Area (Coupling Increase, No Boundary Breach)

| Scenario | Engine behavior | Expected | Match |
|----------|------------------|----------|--------|
| Coupling increase but not boundary breach | No violation type for “coupling only.” Violations are: `boundary_violation`, `deleted_public_api`, `relative_escape`, `type_import_private_target`, `circular_import`. So either no violation → VERIFIED, or violation → BLOCK. | REVIEW_REQUIRED preferred; not BLOCK unless clearly structural | **PARTIAL** |

**Finding:** REVIEW_REQUIRED is rare. It occurs when: (1) report status INCOMPLETE (no report / git unavailable), (2) report status INDETERMINATE (not all violations have proof), (3) policy nondeterminism guard (same run.id, different action). There is no dedicated “warn” path for “coupling increase but no boundary breach.” So grey area today either gets MERGE_VERIFIED (no violation) or MERGE_BLOCKED (violation). That avoids over-aggressive BLOCK for pure coupling-without-boundary only if such changes do not trigger any of the current violation kinds. If they do (e.g. new type import from private target), they correctly BLOCK. So: ANCHR does not over-use REVIEW_REQUIRED; it tends to VERIFIED or BLOCK. Grey area that does not cross boundaries → VERIFIED (acceptable).

---

## 5. Diff Sensitivity

| Scenario | Behavior | Output clarity |
|----------|----------|----------------|
| Very small PR (one file) | Normal analysis; one or zero violations. Minimal cut empty or 1–2 edges. | Concise; no verbosity explosion. |
| Large PR (many files) | `MAX_FILES = 400`; above that, minimal report (no full analysis), reason `too_large`, decision warn. `LARGE_CHANGE_THRESHOLD = 120` affects staged path. | Large PRs may get “analysis skipped” (warn) rather than full BLOCK/VERIFIED. |
| Minimal cut length | CLI caps at 12 edges. Report stores full minimal cut. | Always concise in UI; no unbounded list. |

Output format is fixed: header, trust line, cause, minimal cut (N edges), fix, confidence. No per-file commentary explosion.

---

## 6. Developer Experience Audit

| Criterion | Assessment |
|-----------|------------|
| Readable in GitHub UI? | Check Run summary uses `reason` from policy; comment uses convergent format. CLI output is structured (ANCHR — MERGE BLOCKED / VERIFIED / REVIEW REQUIRED, cause, minimal cut, fix). Designed for scannable consumption. |
| Minimal cut understandable? | Format `path → specifier` (or `package:path:cause:specifier`); cause labels (e.g. internal module access, boundary_violation). Senior engineer can map to “which edge broke the rule.” |
| Does it feel fair? | 20-PR: 0 FP after hardening; 1 FN (ky_751). No spurious blocks on clean refactors (docs, internal-only, single-module). Block only on real violations (boundary, API break, cycle). |
| Would a senior engineer respect this gate? | Deterministic, evidence-based (minimal cut + cause), no coverage % or health scores in gate output. Strict but interpretable. Respect depends on team’s appetite for structural enforcement; the gate is consistent and explainable. |

---

## 7. Summary Report

| Question | Answer |
|----------|--------|
| **Any false positives?** | **No** in current 20-PR run (FP=0). Historical 4 FPs (SWR folder-as-package) removed by revert; no new FPs introduced. |
| **Any missed violations?** | **One known FN:** sindresorhus_ky_751 (utils→core layering). Root cause: package discovery limited to `packages/`; ky uses `source/` (or similar). Not a precision flaw in classification logic; a discovery-scope gap. |
| **Any over-aggressive REVIEW_REQUIRED?** | **No.** REVIEW_REQUIRED is rare (INCOMPLETE, INDETERMINATE, or nondeterminism guard). Most runs are VERIFIED or BLOCKED. No evidence of noisy REVIEW. |
| **Signal-to-noise rating (1–10)** | **8.** High signal: blocks only on real violation types; allows clean refactors and comments-only; minimal cut is concrete. Noise: one FN; no “coupling only” warn tier (grey area is VERIFIED or BLOCK). |
| **Does ANCHR feel strict but fair?** | **Yes.** Strict: boundary, API break, and cycle violations block merge; check conclusion is failure for block/review/retry. Fair: no FPs on 19 allowed PRs; output is deterministic and evidence-based; fix guidance is short and consistent. |

---

## Definition of Done Checklist

| Criterion | Status |
|-----------|--------|
| Blocks real violations | **YES** — boundary_violation, deleted_public_api, relative_escape, type_import_private_target, circular_import → BLOCKED. |
| Allows safe refactors | **YES** — 19 TN; clean PRs (comments, internal refactor, same-module) → VERIFIED. |
| Rarely produces REVIEW_REQUIRED | **YES** — Only on INCOMPLETE, INDETERMINATE, or policy guard; not on normal clean/block paths. |
| No noisy failures | **YES** — 0 FP; no spurious blocks. |
| Feels trustworthy | **YES** — Deterministic, proof-backed minimal cut, stable check name, no extra scoring in gate output. |

---

**Conclusion:** ANCHR passes precision and false-positive stress at the level of this audit. No engine logic changes recommended for precision; the only known gap is the single FN (ky_751) due to package discovery scope, which is a configuration/discovery concern, not a classification flaw. Signal quality is suitable for use as a strict-but-fair merge gate.
