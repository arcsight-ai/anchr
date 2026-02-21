# BLIND SPOT CONTRACT — Formal Adversarial Audit (v2 – Hardened)

Governance-grade blind spot audit for ArcSight. Representation v10 is frozen; no modification or redesign of representation. Falsification under hostile conditions.

**Question under audit:** Can ArcSight guarantee that meaningful architectural violations cannot silently escape detection?

---

## Audit Order and Blind Spot Taxonomy

**Order is mandatory.** Do not reverse.

### Two Layers, Two Audits

| Layer | Role | Audit question | If it fails |
|-------|------|----------------|-------------|
| **ArcSight-wedge** | Truth layer (engine) | Can the engine structurally detect and emit every meaningful architectural violation? | Fix engine. |
| **anchr** | Projection layer (wiring) | Does anchr faithfully surface everything the engine emits? | Fix wiring. |

**Phase 1 — ArcSight-wedge first.** Verify: representation completeness, resolver determinism, policy exhaustiveness, CI enforcement guarantees, no silent passes, no nondeterminism, no structural blind spots. Only once this layer is structurally sound, proceed to Phase 2.

**Phase 2 — anchr second.** Verify: all engine outputs captured, no filtering hiding warnings, no aggregation collapsing signals, no scoring masking structural severity, no truncation hiding failures.

### Two Blind Spot Types (Not the Same Risk)

| Type | Definition | Risk class |
|------|------------|------------|
| **Structural blind spot** | Engine fails to detect a violation (never emits). | Existential. |
| **Projection blind spot** | Engine emits correctly; anchr fails to surface it (filter, misclassify, truncate). | Product bug. |

If anchr “can’t produce X,” either (1) the engine never emitted X, or (2) the engine emitted X and anchr hid or distorted it. Auditing anchr first does not distinguish these. Auditing the engine first removes the ambiguity: first prove the engine can detect and emit; then prove anchr does not hide or distort those emissions.

### Mental Model

- **ArcSight-wedge = physics.** Audit whether the engine can detect and emit. Foundation first.
- **anchr = telescope.** Audit whether the projection layer faithfully exposes what the engine emits. Projection second.

**Strategic flow:** (1) Harden ArcSight-wedge; (2) lock guarantees; (3) then audit anchr wiring; (4) then validate statistically; (5) then go public.

The phases below (0–8) apply **first** to the engine (wedge). A separate pass audits anchr for projection blind spots **after** wedge is structurally sound.

---

## Phase 0 — Coverage Proof

### 0.1 Major Subsystems

| ID | Subsystem | Description |
|----|-----------|-------------|
| S1 | Git / repo discovery | getRepoRoot, getBaseHead, getDiff, getDiffCached |
| S2 | Layout / package discovery | discoverPackages (packages/ or fallback); primary source root |
| S3 | Source file enumeration | listSourceFiles (packages/*/src, source/); excludes node_modules, dist, test dirs |
| S4 | Graph construction | buildGraph; buildPackageMaps; parseModuleDeps; resolveSpecifier |
| S5 | Cycle detection | detectCycles; cyclesToViolations |
| S6 | Boundary / violation detection | detectViolations; getPackageFromPath; resolveSpecifierFrozen; computePublicFiles |
| S7 | Report / output | buildDeterministicReport; stableStringify; ANCHR_REPORT_PATH |
| S8 | CI / runner | validation-20pr-run; spawn structural audit; read result JSONs |
| S9 | Regression / metrics | validation-20pr-metrics; human-ground-truth.csv; evaluation-table |

### 0.2 Execution Stages

| Stage | Description |
|-------|-------------|
| E1 | ENTER: resolve cwd, getRepoRoot, getBaseHead; obtain diff (staged or base..head) |
| E2 | EXTRACT: discoverPackages → pkgDirByName; listSourceFiles → S; buildGraph → G; boundary path (if pkgDirByName.size > 0) |
| E3 | VALIDATE: (Contract v10) evaluate invariants; collect failures; select primary by priority; emit terminal state. (Current implementation does not yet implement full VALIDATE phase or representation_status.) |
| E4 | Policy: hasBlock from violations; decision level (allow/block); minimalCut |
| E5 | Output: write report JSON; CI consumes status and decision |

### 0.3 External Dependencies

| Dep | Description |
|-----|-------------|
| D1 | File system (Node fs): readdirSync, statSync, readFileSync, existsSync |
| D2 | Git CLI or git binary: rev-parse, diff, fetch (in run scripts) |
| D3 | Repository layout: presence of packages/, source/, src/; directory structure |
| D4 | File content: .ts/.tsx parsing; import specifiers; tsconfig (if resolver uses it) |
| D5 | Environment: process.cwd(), ANCHR_REPORT_PATH, GITHUB_BASE_SHA, ANCHR_STAGED |
| D6 | Human ground truth: human-ground-truth.csv for regression |

### 0.4 State Transitions (Contract v10)

| From | To |
|------|-----|
| ENTER | EXTRACT |
| EXTRACT | VALIDATE |
| VALIDATE | VALID \| DEGRADED \| INVALID (terminal) |

No transition out of terminal states.

### 0.5 Trust Boundaries

| Boundary | Description |
|----------|-------------|
| T1 | Repo root vs. host filesystem (paths under repo only) |
| T2 | Representation output vs. policy input (graph, pkgDirByName, layout_mode) |
| T3 | Policy output vs. CI/regression (decision, minimalCut) |
| T4 | Human ground truth vs. engine output (comparison in metrics) |
| T5 | Config/env vs. engine (ANCHR_*, GITHUB_*; no untrusted path injection assumed) |

### 0.6 Coverage Confirmation

All failure classes enumerated in Phase 1 and Phase 2 map to at least one of: S1–S9, E1–E5, D1–D6, state transitions (ENTER→EXTRACT→VALIDATE→terminal), or T1–T5. Coverage is complete for the enumerated surfaces. Any failure class that does not map is marked OPEN until mapped.

---

## Phase 1 — Failure Surface Enumeration

All plausible architectural failure surfaces:

1. **Representation correctness** — Layout misclassification; empty package map when source exists; wrong S or G; graph missing nodes/edges.
2. **Policy execution** — Policy runs on invalid representation; policy emits boundary_violation in single_package; wrong decision from correct graph.
3. **Regression corpus integrity** — Human ground truth wrong or stale; CSV missing rows; PR set changed without lock update.
4. **CI enforcement** — Representation INVALID but CI passes; DEGRADED without override but CI passes; regression runs on INVALID.
5. **Diff mode** — Base/head refs wrong; partial base graph; diff entries missing or incorrect.
6. **Resolver behavior** — Import silently dropped; unresolved without UNRESOLVED_IMPORT; alias mismatch; wrong target path.
7. **Platform variance** — Windows vs Unix paths; case-sensitive vs case-insensitive FS; line endings.
8. **Performance & scaling** — Timeout; OOM; incomplete run; truncated output.
9. **Caching / incremental runs** — Stale cache; cache key collision; partial reuse producing inconsistent state.
10. **Concurrency / race conditions** — Parallel runs sharing state; FS mutation during run.
11. **Config misconfiguration** — Wrong ANCHR_REPORT_PATH; wrong base/head; override flags set unintentionally.
12. **Output schema consumers** — Consumers assume fields that are optional; schema drift; version stamp missing.
13. **Version drift** — Representation contract v10 not implemented; priority table or invariant list out of sync with code.
14. **Partial repo states** — Shallow clone; missing refs; worktree not clean.
15. **Monorepo edge cases** — packages/ with symlinks; workspace roots not under packages/; mixed layouts.
16. **Generated files** — Generated .ts in S but not in G; or excluded without explicit pattern.
17. **Dynamic import patterns** — Dynamic imports not represented; static analysis incomplete.
18. **Mixed module systems** — CJS/ESM interop; require() not parsed.
19. **Dependency graph explosion** — Very large graph; resolver or graph build fails or truncates.
20. **Human misuse** — Running against wrong dir; wrong refs; mislabeling ground truth.
21. **Combinatorial cross-layer interaction** — Representation correct but policy wrong; policy correct but CI misconfigured; regression lock satisfied but representation bug in untested layout.
22. **State desynchronization** — Report written but process exits 0; status INVALID but decision "allow" in JSON.
23. **Unexpected toolchain mutation** — Git version; Node version; fs behavior change.
24. **Path canonicalization variance** — Relative vs absolute; symlinks; .. resolution differs.
25. **File system edge cases** — Symlinks; mount points; read-only; permission errors.

No surface omitted.

---

## Phase 2 — Structured Failure Matrix

(Abbreviated: full matrix would repeat for ~25+ classes. Sample rows; pattern applies.)

| Failure Class | Concrete Attack | Trigger | Responsible Layer | Detection | Deterministic? | Silent Pass? | Eval-Order Dep? | Cross-Layer? | CI Outcome | Observability | Severity | Likelihood | Risk Score | Status | Evidence of Closure / Fix |
|---------------|-----------------|---------|--------------------|-----------|----------------|--------------|-----------------|--------------|------------|---------------|----------|------------|------------|--------|----------------------------|
| Empty package map when source exists | Repo has source/ only; discoverPackages only scans packages/ | Layout = source/ or src/; no packages/ | Representation (S2) | pkgDirByName.size === 0; boundary skipped | Y | Y (historical FN) | N | N | CI may pass (no representation_status yet) | LOW | HIGH | HIGH | HIGH | PARTIAL | Contract v10 INV-NSS, INV-B require non-empty map and boundary run; **implementation** still uses discoverPackages that only scans packages/ — not yet aligned with v10. Fix: implement v10 discovery (single_package fallback). |
| First-level folder as package (SWR FP) | Treat src/core, src/utils as packages; relative_escape on ../_internal | Fallback used folder-as-package | Representation (S2) + Policy (S6) | 4 FPs on SWR | Y | N (FP, not silent pass) | N | Y | CI fails (FP) | HIGH | — | HIGH | HIGH | CLOSED | Contract v10: single_package only; no folder-as-package. Policy v1: no boundary/relative_escape in single_package. Revert to single_package-only fallback. |
| Partial graph VALID | Emit VALID when graph.nodes < sourceFileCount | Implementation bug or missing check | Representation (S4, E3) | INV-COV check | Y | Y if unchecked | N | N | CI could pass | LOW | MEDIUM | CRITICAL | CRITICAL | PARTIAL | Contract v10 INV-COV forbids; **implementation** does not yet emit representation_status or run INV-COV. Add post-build assert and status. |
| Unresolved import without log | Resolver returns null; no UNRESOLVED_IMPORT event | Alias or path resolution failure | Representation (S4 resolver) | INV-RES | Y | Y | N | N | Unknown | LOW | HIGH | HIGH | HIGH | PARTIAL | Contract v10 INV-RES requires event; **implementation** may not emit. Add resolver event path. |
| Policy runs on INVALID | Representation INVALID but policy still invoked | CI gate not implemented or bypassed | CI (S8) | Gate order | Y | Y | N | Y | CI passes incorrectly | MEDIUM | HIGH | CRITICAL | CRITICAL | PARTIAL | Contract v7/v10: exit before policy on INVALID. **Implementation**: CLI may not check representation_status before policy. Add gate. |
| Nondeterministic failure ordering | Same failures, different primary cause across runs | Evaluation order or unstable sort | Representation (E3) | Priority + tie-breaker | N if bug | N | Y if bug | N | CI flaky | MEDIUM | LOW | MEDIUM | LOW | CLOSED | Contract v10: collect all, sort by (priority, invariant_id); same set → same primary. |
| Diff mode partial base | Base graph incomplete; delta wrong | Base ref missing or shallow clone | Representation (S4) + Diff (D2) | INV-DIFF | Y | Y | N | Y | False negative possible | LOW | MEDIUM | HIGH | MEDIUM | PARTIAL | Contract v10 INV-DIFF; **implementation** builds single head graph only — no base graph. Diff mode not fully implemented. |
| Platform path variance | Windows backslash vs Unix slash; different node IDs | Different FS | Representation (S4), D1 | INV-D | N if not normalized | Y | N | N | Different output same repo | MEDIUM | MEDIUM | MEDIUM | MEDIUM | PARTIAL | Contract INV-D; implementation uses path ops that may vary. Normalize to single form. |
| Regression corpus stale | Human ground truth wrong; PR set changed | Human error; manifest change | Regression (S9), D6 | Metrics script | Y | Y (wrong TN/FP) | N | Y | False confidence | HIGH | LOW | HIGH | LOW | OPEN | Process: re-label on change; lock manifest. No automated closure. |
| Config override masking violation | CI_ALLOW_REPRESENTATION_DEGRADED=1 set by default | Env/config | CI (S8), D5 | Audit config | Y | Y | N | Y | CI passes with DEGRADED | MEDIUM | LOW | MEDIUM | LOW | PARTIAL | Governance: override only for one-off; production CI must not set. |
| Version drift (contract not implemented) | Code does not implement v10 phases or status | Contract vs code | Implementation | Audit code vs contract | Y | Y | N | Y | Silent drift | LOW | HIGH | HIGH | HIGH | PARTIAL | Contract v10 and governance B.1–B.4; **implementation** has no representation_status, no priority-based selection, no ENTER/EXTRACT/VALIDATE. Implement or document delta. |
| Resolver fallback masking drift | Optional resolver disabled; DEGRADED; over time more repos need it | Resolver coverage | Representation (S4) | INV-RES, DEGRADED cause | Y | N | N | N | DEGRADED | MEDIUM | MEDIUM | MEDIUM | MEDIUM | CLOSED | Contract: DEGRADED with cause; CI fails unless override. |
| Performance cliff incomplete analysis | Timeout or OOM mid-graph build; partial G | Large repo | S4, D1 | INV-COV, INV-G | Y | Y | N | N | Partial VALID possible | LOW | MEDIUM | HIGH | MEDIUM | PARTIAL | Contract: INV-G, INV-COV. Implementation: no timeout/OOM handling in contract; could exit with partial state. |
| Cross-layer cascading failure | Representation INVALID; CI doesn't gate; policy runs; report says allow | Gate missing | S8, S6 | Gate order | Y | Y | N | Y | CI passes | MEDIUM | MEDIUM | CRITICAL | HIGH | PARTIAL | Implement gate: if representation_status === INVALID then exit before policy. |
| State desynchronization | representation_status INVALID but decision.level "allow" in JSON | Two sources of truth | S7, E5 | Single source of truth | Y | Y | N | Y | Consumer confusion | MEDIUM | LOW | HIGH | LOW | PARTIAL | Contract: emit single status. Implementation: report shape may not include representation_status; decision from policy. Align schema. |
| Caching / incremental | Stale cache; cache key omits config; reuse produces wrong status | Cache key design | S4, S8 | Cache invalidation | Y | Y | N | Y | Wrong result | MEDIUM | LOW | HIGH | LOW | CLOSED | Contract: no caching in v10. If added, key must include full repo state + config; CI must not reuse across refs. |
| Concurrency / race | Parallel runs; shared FS or report path; overwrite | Parallel CI jobs | S8, D1 | Isolate workdir/report path | Y | Y | N | N | Corrupt output | LOW | LOW | MEDIUM | LOW | PARTIAL | Single-process assumption; parallel runs need distinct ANCHR_REPORT_PATH and workdir. |
| Config misconfiguration | Wrong base/head; wrong path; override set by default | Env/config | D5, S8 | Audit config | Y | Y | N | Y | False pass | MEDIUM | LOW | MEDIUM | LOW | PARTIAL | Governance: document required env; production must not set override. |
| Output schema consumers | Consumer assumes representation_status; field missing | Schema drift | S7, S8 | Schema versioning | Y | N | N | Y | Consumer crash or wrong branch | MEDIUM | MEDIUM | MEDIUM | MEDIUM | PARTIAL | Contract B.2: version stamp and status in output. Implementation: add schema; version it. |
| Version drift | Code path does not match contract (e.g. no VALIDATE phase) | Contract vs code | Implementation | Diff contract vs code | Y | Y | N | Y | Silent drift | LOW | HIGH | HIGH | HIGH | PARTIAL | Governance B.1–B.4; implement v10 or document delta. |
| Partial repo states | Shallow clone; base ref missing; getDiff fails | Clone/refs | D2, S1 | getBaseHead/getDiff fail | Y | Y | N | N | runIncomplete or wrong diff | HIGH | MEDIUM | HIGH | MEDIUM | PARTIAL | Current: runIncomplete on git failure. Refetch or fail CI on shallow. |
| Monorepo edge cases | Symlinks under packages/; workspace roots elsewhere | Layout | S2, S3 | L1/L2 only | Y | Y | N | N | Wrong S or map | MEDIUM | LOW | MEDIUM | LOW | CLOSED | Contract: only packages/<d>/src/ or single_package. Symlinks: listSourceFiles skips symlink dirs. |
| Generated files | Generated .ts in tree; in or out of S inconsistently | S definition | S3, INV-TREE | Explicit include/exclude | Y | Y | N | N | S ⊄ G or wrong S | MEDIUM | LOW | MEDIUM | LOW | PARTIAL | Contract INV-TREE: explicit ignore + log. Implementation: listSourceFiles has fixed excludes; generated not explicitly defined. |
| Dynamic imports | Dynamic import(); not in graph; violation in dynamic edge | Static analysis limit | S4, INV-RES | Out-of-scope | Y | N | N | N | FN on dynamic edge | MEDIUM | LOW | MEDIUM | LOW | CLOSED | Contract: static only; dynamic OOS. Document as limitation. |
| Mixed module systems | require() or CJS; not parsed | Parser scope | S4 | .ts/.tsx only | Y | N | N | N | Missing edges | MEDIUM | LOW | MEDIUM | LOW | CLOSED | listSourceFiles is .ts/.tsx; CJS out of scope unless added. |
| Graph explosion | Huge repo; OOM or timeout; partial G or no report | Scale | S4, D1 | INV-G, timeout | Y | Y | N | N | Partial or crash | LOW | MEDIUM | HIGH | MEDIUM | PARTIAL | Contract: no VALID if partial. Implementation: add timeout/OOM handling; emit INVALID on abort. |
| Human misuse | Wrong cwd; wrong refs; mislabeled ground truth | Operator | D5, D6 | Process | Y | Y | N | Y | Wrong metrics | HIGH | MEDIUM | HIGH | MEDIUM | OPEN | Training and checklist; no code closure. |
| Combinatorial cross-layer | Rep correct, policy wrong → FP; policy correct, CI wrong → pass on INVALID | Multiple layers | S2–S9 | Per-layer verification | Y | Y | N | Y | Depends | MEDIUM | MEDIUM | HIGH | MEDIUM | PARTIAL | Each layer tested; integration tests for gate + policy + regression. |
| State desync (report vs process) | Exit 0 but report INVALID or missing | Error handling | S7, E5 | Exit code = f(status) | Y | Y | N | Y | CI green despite INVALID | MEDIUM | LOW | HIGH | LOW | PARTIAL | CLI must exit non-zero when representation_status is INVALID. |
| Toolchain mutation | New Node/Git version changes behavior | External | D2, D1 | Pin versions | Y | Y | N | N | Nondeterminism | LOW | LOW | MEDIUM | LOW | PARTIAL | CI pins Node/Git; document. |
| Path canonicalization | Symlinks; .. ; relative vs absolute | Path ops | S3, S4, D1 | Normalize everywhere | Y | Y | N | N | S or G differs | MEDIUM | MEDIUM | MEDIUM | MEDIUM | PARTIAL | resolve/normalize in discovery and graph; document. |
| FS edge cases | Symlinks, read-only, permissions | D1 | readdir/stat/readFile | Y | Y | N | N | Partial read | LOW | LOW | MEDIUM | LOW | PARTIAL | Errors may throw; contract requires no VALID on partial. |

**Coverage completeness:** All 25 Phase 1 surfaces have a corresponding matrix row above. Status CLOSED only where mechanism (contract + implementation) guarantees closure; otherwise PARTIAL or OPEN.

---

## Phase 3 — Mandatory Attack Simulation

### 3.1 False VALID (should fail but passes)

**Scenario:** Repo with only `source/` (no `packages/`). Source files exist. discoverPackages returns empty map; boundary skipped; report status VERIFIED, decision allow.

**Expected correct outcome:** INVALID (or at least boundary evaluation run; if single_package then boundary runs with one package). For ky-style utils→core edge: policy should emit boundary_violation if layer model applies.

**Actual modeled outcome:** Today: VERIFIED, allow. Boundary not run; utils→core not evaluated.

**Classification:** **Possible.** Contract v10 forbids silent skip; implementation has not been updated to v10 discovery + status. Attack succeeds against **current implementation**. Contract closes it; implementation gap remains.

### 3.2 Silent DEGRADE

**Scenario:** Resolver intentionally disabled; partial graph; implementation returns DEGRADED but does not set degradation_cause or log; CI has override set.

**Expected:** DEGRADED with cause code; CI fails unless override; override auditable.

**Actual modeled:** If implementation does not emit cause or version stamp, DEGRADED is observable only by status; cause unknown. Override could mask.

**Classification:** **Partial.** Contract requires cause code and CI fail without override. Implementation may not emit cause. Observability: PARTIAL.

### 3.3 Policy bypass with CI success

**Scenario:** Representation produces INVALID (e.g. empty graph with source files). CI script does not check representation_status; runs policy anyway; policy sees empty graph, emits allow; CI exits 0.

**Expected:** CI fails; policy never runs on INVALID.

**Actual modeled:** If gate not implemented, CI can pass. Attack succeeds.

**Classification:** **Possible.** Contract v7/v10: gate order. Implementation: gate may be missing. Fix: enforce gate in runner.

### 3.4 Platform divergence

**Scenario:** Same repo cloned on Windows and Linux; path separators differ; node IDs or S differ; different primary cause or VALID vs INVALID.

**Expected:** Same terminal state and cause (INV-D).

**Actual modeled:** Path handling may differ; normalization not guaranteed everywhere.

**Classification:** **Partial.** Contract INV-D; implementation may have platform-dependent paths. Risk: MEDIUM.

### 3.5 Nondeterministic failure ordering

**Scenario:** INV-COV and INV-RES both fail; run A emits PARTIAL_GRAPH, run B emits UNRESOLVED_IMPORTS_WITHOUT_LOG.

**Expected:** Same primary (priority order: INV-COV before INV-RES).

**Actual modeled:** Contract v10: collect all, sort (priority, invariant_id) → same primary. If implementation uses "first failure" or unstable sort, attack succeeds.

**Classification:** **Closed** by contract. **Partial** if implementation not updated (no collect-then-select).

### 3.6 Diff-mode false negative

**Scenario:** Diff mode; base graph not built; only head graph; delta computed incorrectly; violation in diff missed.

**Expected:** INV-DIFF: base and head each satisfy INV-COV/INV-RES.

**Actual modeled:** Current implementation builds single (head) graph; no base graph. Diff mode in contract not fully implemented.

**Classification:** **Possible.** Contract closes; implementation PARTIAL.

### 3.7 Resolver fallback masking drift

**Scenario:** Alias resolver fails for some imports; implementation logs UNRESOLVED_IMPORT; over time more projects use aliases; DEGRADED rate increases.

**Expected:** Deterministic; cause logged; no silent drift of meaning.

**Actual modeled:** Contract INV-RES + cause code. If implementation always logs, no masking. Drift is observable (more DEGRADED). Classification: **Closed** (observable).

### 3.8 Performance cliff causing incomplete analysis

**Scenario:** Very large monorepo; graph build or resolver times out or OOMs; process exits or returns partial graph; report written with VALID or no status.

**Expected:** INVALID or DEGRADED; no VALID with partial graph.

**Actual modeled:** If no timeout handling, process might exit with partial state and no clear INVALID. Contract forbids VALID; implementation may not enforce.

**Classification:** **Partial.** Contract INV-G, INV-COV; implementation may not assert on timeout/OOM.

### 3.9 Config override masking violation

**Scenario:** CI_ALLOW_REPRESENTATION_DEGRADED=1 set in default CI config; DEGRADED runs pass; regression over time.

**Expected:** Override only for one-off; production must not set.

**Actual modeled:** Process/governance; no code enforcement. Classification: **Partial** (governance).

### 3.10 Cross-layer cascading failure

**Scenario:** Representation INVALID → gate missing → policy runs → decision allow → regression compares to ground truth → TN (if human said allow). Structural violation not detected but CI green.

**Expected:** Gate prevents policy run on INVALID.

**Actual modeled:** Same as 3.3. **Possible** if gate not implemented.

### 3.11 Partial execution state producing valid output

**Scenario:** Graph build throws mid-way; catch block writes report with status VERIFIED and empty minimalCut; exit 0.

**Expected:** INVALID; no VALID with incomplete execution.

**Actual modeled:** Depends on error handling. If errors are caught and report still written with success-like content, attack succeeds. Classification: **Partial.** Contract: no VALID unless all invariants pass; implementation must not write VERIFIED on thrown path.

---

## Phase 4 — Cross-Layer Interaction Audit

| Interaction | Risk | Circular / Hidden Assumption |
|-------------|------|------------------------------|
| Representation → Policy | Policy assumes graph and pkgDirByName are complete and layout_mode correct. If representation wrong, policy can still "succeed" (allow) with wrong semantics. | Policy does not re-validate representation; trusts output. |
| Policy → CI | CI uses decision (allow/block) and possibly minimalCut. If CI does not also check representation_status, INVALID can be masked by policy output. | CI may assume "if report exists, representation ran correctly." |
| Diff mode → Resolver | Diff entries drive which files are checked; resolver runs on those files. If base/head refs wrong, diff wrong, resolver sees wrong set. | Resolver assumes diff is correct. |
| Caching → Determinism | No caching specified in contract. If caching added, cache key must include repo state + config; otherwise stale cache → nondeterminism. | No hidden assumption today; future cache must be keyed. |
| Platform → Path resolution | Path canonicalization (slash, case) affects S and G. If not normalized, platform variance breaks INV-D. | Implementation may rely on Node path behavior. |
| Regression corpus → False confidence | 20-PR lock gives confidence only over those 20 PRs. New layout or new repo may hit unimplemented or buggy path; regression does not detect. | Regression is sample; not full coverage. |

**Coupling unclear:** Policy does not re-check layout_mode against graph; it trusts representation. If representation lies (wrong layout_mode), policy can misbehave. Mitigation: representation contract forbids emitting wrong layout_mode; implementation must align.

---

## Phase 5 — Determinism & Reproducibility Verification

| Check | Status | Risk if failed |
|-------|--------|----------------|
| Same repo state → identical byte output | **Partial.** Contract requires it (INV-D). Implementation uses stableStringify; graph build and traversal order may be deterministic. Not stress-tested 100×. | MEDIUM: CI flakiness; forensic mismatch. |
| Same failure set → identical root cause | **Closed** by contract (priority + tie-breaker). Implementation: PARTIAL until collect-then-select implemented. | LOW if contract implemented. |
| No nondeterministic ordering | Contract: fixed priority and lexical tie-break. Implementation: sort order of files/dirs must be fixed (e.g. localeCompare). | LOW. |
| No environment-dependent branching | **Partial.** cwd, env (GITHUB_BASE_SHA, etc.) are inputs; if they change, output may change by design. Path normalization and FS case-sensitivity are env-dependent. | MEDIUM on Windows/case-insensitive. |
| No time-based logic | No timestamp in contract output. Implementation: run id may include time or random; contract B.2 version stamp is date/version, not wall clock. | LOW. |
| No dependency on locale or FS behavior | **Partial.** listSourceFiles uses localeCompare for sort; FS case-sensitivity affects path equality. | MEDIUM. |

**Classification:** Determinism is contractually required; implementation has minor platform/locale risks. Full byte-for-byte reproducibility should be stress-tested and documented.

---

## Phase 6 — Closure Validation

For each CLOSED classification we require: explicit reasoning, mechanism that guarantees closure, no reliance on convention or documentation or developer behavior alone.

| Claimed CLOSED | Mechanism | Reliance on behavior? | Verdict |
|----------------|-----------|------------------------|---------|
| No folder-as-package (SWR) | Contract: single_package only; Policy: no boundary in single_package. Code: revert to single_package fallback. | Implementation must implement contract. | CLOSED **if** implementation matches contract. |
| Nondeterministic failure ordering | Contract: collect all, sort (priority, invariant_id). | Implementation must implement collect-then-select. | CLOSED by contract; PARTIAL until code has it. |
| Resolver fallback masking | Contract: DEGRADED with cause; CI fails without override. | Implementation must emit cause. | CLOSED by contract; PARTIAL until code emits. |

**Downgrade rule:** If closure depends on "developers will not do X" or "documentation says Y" without a mechanical check (assert, CI, or invariant), status is PARTIAL. No downgrade applied above for contract-level guarantees; implementation gaps are explicitly marked PARTIAL.

---

## Phase 7 — Risk Synthesis

1. **Total failure classes evaluated:** 25 (Phase 1) + matrix rows (Phase 2) + 11 attack simulations (Phase 3).
2. **Coverage completeness confirmation:** All enumerated failure classes map to subsystems S1–S9, stages E1–E5, dependencies D1–D6, state transitions, or trust boundaries T1–T5. Coverage is complete for the enumerated set.
3. **OPEN count:** 1 (Regression corpus integrity — human process; no automated closure).
4. **PARTIAL count:** 12+ (implementation not yet aligned with v10: discovery, status, gate, INV-COV/INV-RES checks, diff mode, platform normalization, error handling, config governance).
5. **HIGH/CRITICAL count:** 4 CRITICAL (partial graph VALID, policy on INVALID, cross-layer cascading, state desync); 5+ HIGH (empty map silent pass, unresolved without log, version drift, performance cliff, etc.).
6. **Highest systemic risk:** **Representation contract v10 not implemented in code.** Status, gate, priority-based failure selection, and coverage invariants are specified but not enforced in the runner. This allows silent success, partial graph VALID, and policy running on INVALID.
7. **CRITICAL silent-pass remaining:** Yes. (1) Empty package map with source files can still produce VERIFIED/allow (historical FN). (2) If gate is missing, INVALID + policy allow can pass CI. (3) Partial graph could be emitted as VALID if INV-COV not asserted.
8. **Overall Structural Confidence Score:** **52/100.** Contract is strong (v10 + governance). Implementation gap is large (no representation_status, no gate, no single_package fallback in current code, no collect-then-select). Confidence is high for "contract design" and low for "current system as deployed."
9. **Safe for public release?** **No.** Silent escape is still possible (empty map + no boundary; or gate missing + INVALID). Until v10 discovery and status and gate are implemented and tested, the system cannot guarantee that meaningful architectural violations cannot silently escape.
10. **Recommended next hardening priority:** Implement representation v10 in code: (a) discovery with single_package fallback and layout_mode; (b) representation_status (VALID/DEGRADED/INVALID) and cause code in report; (c) CI gate: if status INVALID, exit before policy; (d) INV-COV and INV-RES checks (or explicit logging of unresolved); (e) stress-test determinism (same repo 100×, byte-identical output).

---

## Phase 8 — Red Team Reflection

**If a hostile senior engineer attempted to break this system in production, where would they try first?**

1. **Layout that current code does not handle.** Use a repo with only `source/` or only `src/` (no `packages/`). Trigger empty package map; boundary skipped; submit PR that adds a clear architectural violation (e.g. utils→core). Expect: VERIFIED, allow. **First try:** layout-based silent skip.
2. **CI without gate.** Ensure the runner does not check representation_status. Ship representation change that sometimes returns INVALID (e.g. flaky resolver). Policy runs anyway; report may say allow. CI green. **Second try:** run policy on invalid representation.
3. **Partial graph.** Introduce a code path where graph build fails after adding some nodes but before full S coverage (e.g. throw in resolver for one file). If error is caught and report still written with decision and no representation_status, consumer sees "allow" with incomplete graph. **Third try:** partial execution reported as success.
4. **Override abuse.** Set CI_ALLOW_REPRESENTATION_DEGRADED=1 in production CI. DEGRADED runs pass; over time relax resolver or coverage and rely on DEGRADED. **Fourth try:** config masking.
5. **Regression lock bypass.** Change 20-PR set or ground truth without re-running full audit; or run only on PRs that are known TN. Metrics look good; untested layouts remain vulnerable. **Fifth try:** corpus and process.

**Most effective single attack:** Layout-based silent skip (1). One-line change in discovery (single_package fallback) closes it contractually; current code does not have it. Red team would hit that first.

---

## Constraints Compliance

- Representation v10 was not modified or redesigned.
- No architecture expansion beyond enumeration and audit.
- No feature brainstorming; only failure and risk classification.
- Severity not softened (CRITICAL and HIGH retained where applicable).
- No generic reassurance; structural confidence 52/100 and "not safe for public release" stated.

---

## Answer to Audit Question

**Can ArcSight guarantee that meaningful architectural violations cannot silently escape detection?**

- **Under the contract (v10 + Policy v1 + Regression v1 + CI gate):** The design, if fully implemented, can support that guarantee: no silent success (INV-NSS), no partial graph VALID (INV-COV), no policy on INVALID (gate), deterministic failure selection (priority + tie-breaker).
- **Under the current implementation:** **No.** Empty package map can still cause boundary skip (FN). No representation_status or gate in place; partial graph and INVALID can coexist with policy "allow" and CI pass. Risk remains until v10 discovery, status, gate, and coverage checks are implemented and verified.

**Precise classification of remaining risk:** Implementation gap (contract vs code), not contract design gap. Closure evidence exists at contract level; evidence at implementation level is partial or open.

---

*End of BLIND SPOT CONTRACT v2 — Formal Adversarial Audit.*
