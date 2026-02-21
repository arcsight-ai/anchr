# ANCHR — Full System Launch Readiness Audit

Board-level audit. No marketing tone. Measurable criteria only.

---

## PART 1 — ICP & WEDGE CLARITY

| Item | Definition |
|------|------------|
| **Primary ICP** | Engineering teams owning a TypeScript/JavaScript monorepo or multi-package repo with explicit or implicit dependency layers (e.g. core → api → app). Team size: 2–15. Ship frequency: multiple PRs per week. Pain: structural violations (cycles, layer breaks) have shipped and caused incidents or required costly reverts. |
| **Secondary ICP** | OSS maintainers of medium-to-large repos (100+ source files) who want a gate against dependency and import-structure regressions without manual review of every PR. |
| **Narrowest wedge** | "Block PRs that introduce circular dependencies or layer violations before merge." One decision, one comment, no config beyond install. |
| **Why this wedge first** | Cycles and boundary violations are (a) not caught by ESLint/TypeScript, (b) often missed in code review because reviewers focus on diff, not graph, (c) binary (either introduced or not). Clear signal, clear action. |
| **Why now** | Monorepos and layered architectures are standard. Tooling for "structure at merge time" is underprovided; linters and type checkers do not model dependency graphs or minimal cut. |
| **Urgent vs optional** | Urgent: teams that have already shipped a cycle or layer violation and had to fix in production. Optional: teams with no prior structural incident; ANCHR is preventive. |

**Risk:** Wedge is clear. Secondary ICP is broader; messaging must not dilute to "we do structure" without "merge-time gate, minimal cut, BLOCK/WARN/ALLOW."

---

## PART 2 — Structural Scenario Stress Matrix

| # | Scenario | Expected decision | Minimal cut expectation | Should BLOCK? | ESLint catches? | TypeScript catches? | Manual review catches? | Risk if ANCHR misfires | Severity |
|---|----------|-------------------|-------------------------|---------------|-----------------|--------------------|------------------------|-------------------------|----------|
| 1 | Direct cycle: A→B, B→A introduced in one PR | BLOCK | 2 edges (A↔B) | Yes | No | No (if types valid) | Unlikely without graph view | High: cycle in prod | High |
| 2 | Transitive cycle: A→B→C→A | BLOCK | Edges in cycle | Yes | No | No | Unlikely | High | High |
| 3 | Layer violation: app imports core; core must not depend on app | BLOCK or WARN | Edge(s) crossing layer | Depends on rules | No | No | Only if reviewer knows layers | Medium: architecture drift | Medium |
| 4 | Cross-boundary import: package P imports from Q where boundary forbids | BLOCK or WARN | Boundary edge(s) | Depends on config | No | No | Only if documented | Medium | Medium |
| 5 | Dependency bump only (no new edges, version change) | ALLOW | [] | No | No | Maybe (types) | N/A | Low: wrong BLOCK = friction | Low |
| 6 | Package extraction: move files to new package, same graph shape | ALLOW or WARN | Possibly new package nodes, no cycle | No | No | No | Maybe | Low | Low |
| 7 | Large refactor: many files moved/renamed, no new cycles | ALLOW | [] or existing only | No | No | Maybe | Unlikely to check graph | Medium: FP would block refactor | Medium |
| 8 | Rename-only change (paths change, graph isomorphic) | ALLOW | [] | No | No | No | No | Low | Low |
| 9 | Feature PR, no new imports or structural change | ALLOW | [] | No | No | No | No | Low | Low |
| 10 | Massive PR: mix of structural (new cycle) + non-structural | BLOCK | Cycle edges | Yes | No | No | Unlikely | High: FN = cycle ships | High |

**Gaps:** Layer and boundary scenarios assume ANCHR has or will have layer/boundary config. If not, rows 3–4 are "WARN or future." Clarify in product facts.

---

## PART 3 — Determinism & Stability Audit

| Vector | Description | Test design | PASS / FAIL |
|--------|-------------|-------------|-------------|
| **1. Same input → same output** | Hash of inputs (repo, base, head) → same decision, same minimalCut, same explanation hash | Run 3× on same PR; compare decision, violation_count, explanationHash | PASS if zero variance. Evidence: Day 1 determinism proof (ky#796). |
| **2. Order sensitivity** | File or edge iteration order could change minimal cut or decision | Run with different filesystem/TS compiler order if exposed; or shuffle internal order in test harness | FAIL if output differs. Not yet tested; recommend adding. |
| **3. Parallel CI stability** | Two CI runs on same commit produce same result | Trigger 2 workflows on same SHA; compare artifacts | PASS if identical. Assumed by determinism proof. |
| **4. Large PR performance** | Very large diff (e.g. 500+ files) completes within budget and does not OOM | Run on PR with max expected file count; measure time and memory | PASS: Day 4 vitest 475 files, 0.41s, within budget. No 500+ file test yet. |
| **5. Protected path enforcement** | No engine change during validation window | CI reads .freeze-engine-hash, .freeze-protected-paths; fails if HEAD ≠ hash or protected paths changed | PASS: freeze-enforcement.yml. |

**Reproducibility test:** Run day1-determinism script on 3 distinct PRs (small, medium, large). PASS if all 3 show zero variance.

**Memory / scaling limits:** No unbounded recursion observed (Day 4). No explicit memory cap in CI; recommend documenting max RSS or timeout.

**Explicit FAIL:** Any run that produces different decision or explanationHash for same (repo, base, head). Any run that exceeds performance budget or OOMs.

---

## PART 4 — Precision & Error Budget

| Term | Definition |
|------|------------|
| **True positive BLOCK** | PR introduced structural risk; ANCHR said BLOCK. Correct. |
| **False positive BLOCK** | PR did not introduce structural risk; ANCHR said BLOCK. Incorrect; blocks valid merge. |
| **False negative** | PR introduced structural risk; ANCHR said ALLOW or WARN only. Incorrect; risk ships. |
| **Acceptable FP rate before launch** | ≤ 10% of BLOCK decisions (i.e. precision ≥ 90% on BLOCK) for conservative launch; contract allows ≥ 70% as minimum. |
| **Acceptable FN rate** | Zero catastrophic (obvious cycle/layer violation allowed). Non-catastrophic FN: document and triage; target 0 for known scenarios in stress matrix. |
| **Minimum validation sample size** | 20 PRs with human verdicts (BLOCK vs not); prefer 50+ for confidence. Current: 20 PRs, 2 BLOCK with verdict (both correct); 8 BLOCK UNCERTAIN (title heuristics). |
| **Confidence threshold** | Precision (BLOCK) ≥ 70% (contract); recommend ≥ 90% for launch. Catastrophic = 0. |

**Readiness score rubric (0–100):**

| Criterion | Weight | Score 0 | Score 100 |
|-----------|--------|---------|-----------|
| Precision (BLOCK) ≥ 70% | 25 | < 70% | ≥ 90% |
| Catastrophic FN = 0 | 25 | Any | 0 |
| Determinism proven | 20 | Variance observed | Zero variance on 3+ PRs |
| Stress matrix coverage | 15 | Not run | All 10 scenarios tested |
| Performance within budget | 15 | Over budget or OOM | All sizes within budget |

**Current:** Precision 100% on 2 BLOCK with verdict; 8 BLOCK UNCERTAIN. Determinism and performance PASS. Stress matrix: only cycle injection/removal formally tested (Day 3). **Computed readiness: ~65–70** until (a) human verdicts for all 20 PRs and (b) more stress scenarios run.

---

## PART 5 — Competitive Differentiation Map

| Comparator | Clear ANCHR win | Overlap risk | Confusion risk | Redundancy risk |
|------------|-----------------|--------------|----------------|-----------------|
| **ESLint** | No graph, no minimal cut, no cycle detection across modules. ANCHR: structural gate. | None. | "Another linter" — must state "not a linter" everywhere. | Low. |
| **TypeScript** | Types and build order, not dependency graph or cycles. ANCHR: graph + cut. | TypeScript can fail on some circular imports at compile; not consistent. | "TypeScript already catches cycles" — only sometimes. Clarify: ANCHR is merge-time, whole-graph. | Low. |
| **Static analyzers (e.g. Madge, dependency-cruiser)** | Often run locally or in CI as "report only"; not BLOCK at merge. ANCHR: single BLOCK/WARN/ALLOW decision and PR comment. | Some tools do cycle detection. Overlap: cycle detection. Win: minimal cut, single decision, PR integration. | "We already use Madge" — ANCHR is integrated gate, not just report. | Medium: if team already runs Madge in CI and blocks, ANCHR must add minimal cut + clarity. |
| **Architectural review tools** | Most are design-time or docs; not per-PR. ANCHR: per-PR, automated. | N/A. | N/A. | Low. |
| **Manual review** | Review sees diff; ANCHR sees graph. Review is inconsistent; ANCHR is deterministic. | Reviewer might notice obvious cycle. | "We review carefully" — ANCHR is evidence, not replacement for judgment. | Low. |

**Differentiation strength:** Strong vs ESLint/TypeScript. Clear vs manual review. Must articulate vs Madge/dependency-cruiser: "one decision, one comment, minimal cut, BLOCK at merge."

---

## PART 6 — Canonical Demo Artifact

**Canonical demo repo structure:**

- Monorepo: `packages/core`, `packages/api`, `packages/app`.
- Rule: `app` may import `api` and `core`; `api` may import `core`; `core` must not import `api` or `app`.

**Canonical "bad PR":**

- Branch adds `core/utils.ts` that imports from `api/client.ts` (layer violation) or adds two files in `core` that import each other (cycle).
- Expected: BLOCK. Minimal cut shows the violating edge(s).

**Canonical "neutral PR":**

- Branch adds a new function in `core/utils.ts` with no new imports, or only imports from `core`.
- Expected: ALLOW. Minimal cut [].

**Fully realistic PR comment block (bad PR — cycle):**

```
ANCHR · BLOCK

Structural risk: minimal cut indicates dependency cycle.

Decision: BLOCK
violation_count: 1

Minimal cut:
  - root:packages/core/feature-a.ts:circular_import
  - root:packages/core/feature-b.ts:circular_import

Impacted nodes: packages/core/feature-a.ts, packages/core/feature-b.ts
Critical edges: feature-a.ts → feature-b.ts, feature-b.ts → feature-a.ts

Explanation: Cycle detected in packages/core. Resolve cycle or request review override.
```

**Copy-ready for landing/DevHunt:** Use the block above; replace repo-specific paths with your canonical demo paths.

---

## PART 7 — Installation & Security Friction Audit

| Risk | Description | Severity |
|------|-------------|----------|
| **GitHub App permission scope** | App needs read repo content, write PR comments. Broader scope = more enterprise hesitation. | Medium. Document minimum required scopes. |
| **CI setup complexity** | User must add workflow, set token, possibly configure base branch. | Low–medium. One-time. |
| **Config requirements** | If layer/boundary config is added, misconfig could cause FP/FN. | Future. Low if defaults are safe. |
| **Enterprise objections** | Code access: App or CI reads repo. Data: PR diff and graph stay in runner or App; clarify no external storage. | Medium. Security review may ask "where does code go?" |
| **Data leakage** | Code and graph must not be sent to third parties. State explicitly: all processing in GitHub / runner. | High if unclear. Document. |
| **Legal review triggers** | Automated decision that blocks merge could be seen as "automated employment decision" in some jurisdictions; low likelihood for dev tool. | Low. |

**Friction ranking:** (1) Security/data — document clearly. (2) GitHub App scope — document minimum. (3) CI setup — keep to one workflow file. (4) Config — keep optional or simple.

---

## PART 8 — Hostile Review Simulation

| # | Objection | Fatal / Fixable / Perception |
|---|-----------|------------------------------|
| 1 | "Precision is based on 2 BLOCK verdicts; 8 UNCERTAIN. Not statistically significant." | Fixable: Run human verdicts on full 20 PRs; add more PRs. |
| 2 | "You don't support layer/boundary rules, only cycles." | Fixable or Perception: If only cycles, say so. If layers later, clarify roadmap. |
| 3 | "Determinism tested on one PR only." | Fixable: Run determinism on 3+ PRs (small, medium, large). |
| 4 | "GitHub App has access to our code." | Perception: Document scope and no external storage. |
| 5 | "We already use Madge/dependency-cruiser." | Perception: Differentiate (one decision, PR comment, minimal cut, merge gate). |
| 6 | "False positive blocked a valid refactor." | Fatal if frequent. Mitigate: precision ≥90%, WARN option, override. |
| 7 | "No way to override BLOCK." | Fixable: Document override (e.g. re-run with label or maintainer approve). |
| 8 | "Runs only on TypeScript/JavaScript." | Perception: State clearly; no claim of other languages. |
| 9 | "Performance on 500+ file repo unknown." | Fixable: Run Day 4-style test on larger repo. |
| 10 | "Documentation says 'precision ≥70%' — is that good enough?" | Perception: Raise bar to ≥90% for launch or explain why 70% is acceptable. |
| 11 | "What if ANCHR is down? Blocks all PRs?" | Fixable: Fail-open vs fail-closed; document. Kill switch. |
| 12 | "Minimal cut is jargon; maintainers won't understand." | Perception: One-sentence explanation in comment + link to docs. |

**Fatal count:** 1 (FP blocking valid refactor at scale). **Fixable:** 8. **Perception:** 3.

---

## PART 9 — Launch Gate Definition

**GO TO DEVHUNT** — all must hold:

| Criterion | Threshold |
|-----------|-----------|
| Precision (BLOCK) | ≥ 70% (contract); recommend ≥ 90% on 20+ PRs with human verdicts. |
| Catastrophic FN | 0. |
| Determinism | Zero variance on ≥ 1 PR (current: 1). Recommend ≥ 3 PRs. |
| Demo clarity | Canonical bad PR + neutral PR; one copy-ready comment block. |
| Installation friction | Documented. One workflow or App install; no undocumented steps. |
| Differentiation clarity | "Not a linter" + "minimal cut" + "merge-time gate" in messaging canon. |
| ICP clarity | Primary ICP and wedge in writing (this audit Part 1). |

**DELAY LAUNCH** — if any:

- Precision < 70% or catastrophic FN > 0.
- Determinism variance on any tested PR.
- No canonical demo (bad PR + comment block).
- Security or data handling unclear to a staff engineer.
- Messaging claims "AI" or "revolutionary" or unbacked numbers.

**Binary:** Score Part 4 readiness ≥ 70 and all GO criteria met → GO. Else → DELAY.

---

## PART 10 — 30-Day Post-Launch Monitoring Plan

| Item | Definition |
|------|------------|
| **Metrics to track** | (1) PRs analyzed per day/repo. (2) BLOCK rate. (3) Override rate (if applicable). (4) User-reported FP (issue or comment). (5) User-reported FN. (6) Workflow run failure rate. (7) P95 latency per repo size. |
| **Failure signals** | Run failure rate > 5%. Latency > 2× budget. Spike in "ANCHR is wrong" issues. Uninstall or disable rate. |
| **False positive alerts** | Triage every user-reported FP within 48h. Log: repo, PR, decision, minimal cut. If pattern (e.g. one repo), consider config or fix. |
| **Feedback loop** | Single place (issue template or form): "ANCHR said BLOCK/WARN/ALLOW on [link]. Verdict: FP / FN / Correct. Optional comment." Weekly review. |
| **Kill-switch criteria** | (1) Catastrophic FN (obvious cycle allowed) in production. (2) FP rate > 20% of BLOCKs and no fix in 7 days. (3) Security incident (code or data leak). (4) Run failure rate > 50% for 24h. Action: Disable App or CI; post status; fix or rollback. |

---

## Summary

| Part | Status |
|------|--------|
| 1. ICP & wedge | Wedge clear. Document primary ICP and "why now" in canon. |
| 2. Stress matrix | Table complete. Layer/boundary rows depend on product support. |
| 3. Determinism | PASS on 1 PR. Recommend 3+ PRs and order-sensitivity test. |
| 4. Precision | 70%+ possible; 8 BLOCK UNCERTAIN. Get human verdicts; target 90%. |
| 5. Differentiation | Strong vs ESLint/TS; clarify vs Madge. |
| 6. Demo artifact | Canonical bad/neutral PR and comment block defined. |
| 7. Install & security | Document scope and data; no external storage. |
| 8. Hostile review | 1 fatal, 8 fixable, 3 perception. Address fatal with precision + override. |
| 9. Launch gate | Binary criteria defined. Current: DELAY until human verdicts and demo assets. |
| 10. 30-day plan | Metrics, failure signals, FP process, kill-switch defined. |

**Recommendation:** Complete human verdicts on 20 PRs, add determinism runs on 2 more PRs, publish canonical demo and comment block, and document security/data. Then re-score Part 4 and re-evaluate launch gate.
