# ANCHR ENGINE READINESS AUDIT REPORT

Run date: 2025-02-19 (single run against repo state).  
Contract: Termination-Grade Completion (docs/anchr-engine-completion-checklist-reality-contract.md).  
Prompt: docs/master-anchr-engine-readiness-prompt.md.

---

## 1. Section Status Table

| Section | Status | Evidence | Missing |
|--------|--------|----------|---------|
| **0 — Wedge Ground Truth** | **RED** | No `docs/wedge-capability-map.md`. No `docs/wedge-vs-anchr-gap.md`. No single end-to-end trace doc. Phase 1a protocol exists: `docs/phase1a-forced-violation-test.md`. | Capability map; wedge vs ANCHR gap doc; one-PR trace doc. |
| **1 — Structural Dominance** | **AMBER** | **Minimal cut → decision:** `src/structural/buildReport.ts` builds minimalCut from violations, sets decisionLevel block when status BLOCKED (lines 37–52). **Invariants:** violations drive status. **Convergence:** `src/decision/index.ts` uses `convergence?.impact` in `deriveChangeType` (lines 69–73). **No heuristic-only block:** block only when effectiveStatus === "BLOCKED" and allHaveProof. **Determinism:** No `ANCHR_DETERMINISTIC` flag. No CI that runs same PR 3x and asserts identical decision. **Golden baseline:** No stored 10-PR golden file in repo. **CI drift:** No workflow that compares current decision to stored baseline. | Determinism proof (flag + 3-run CI); stored 10-PR baseline; CI drift detection. |
| **2 — Signal Validity** | **AMBER** | **Correlation & buckets:** `artifacts/phase1b_extended/results.json` (273 PRs). `scripts/phase1/phase1b-extended-metrics.ts` computes Pearson(diff_size, minimalCut); bucket breakdown. Prior run: correlation > 0, LARGE violation rate > 2x SMALL, variance > 0. **Blind precision:** `scripts/phase1/blind-sample.ts` exists (20/20/20 sample, strips evidence). No artifact or doc showing precision ≥ 70% or catastrophic FP = 0. **Adversarial:** Phase 1a describes inject-violation test; no formal add/remove-dependency adversarial run doc. | Blind precision result ≥ 70%; catastrophic FP = 0; adversarial test run documented. |
| **3 — Explainability** | **GREEN** | **Paths & minimal cut:** `src/formatters/explain.ts` (files, dependency pairs, affected packages, GUARANTEE_MAP, FORMAL_REASONING, MINIMAL_REPAIR). **Debug:** `scripts/cli.ts` has `args[0] === "explain"` (line 652), reads report, calls `formatExplainOutput`; main TTY flow calls `formatExplanation` (line 804–805). **Containment/consequence:** `containmentExplanation.ts`, `architecturalComment.ts`, `predictiveConsequence.ts`. | None. |
| **4 — Infrastructure Safety** | **AMBER** | **Idempotent:** `.github/workflows/anchr-pr.yml` concurrency group `anchr-pr-${{ github.event.pull_request.number }}`, cancel-in-progress. **One comment:** `scripts/anchr-pr-comment-clean.ts` finds existing comment by `<!-- anchr:comment -->`, updates if hash same else posts (lines 284–331). **Draft skipped:** workflow step "Skip if draft" (lines 25–32). **Kill switch:** `vars.ANCHR_DISABLED` (lines 40–41). **Rate limits:** No explicit backoff/retry in comment script. **Performance:** Checklist asks <30s/90s/3m; `scripts/cli.ts` TIMEOUT_MS 8000; workflow timeout-minutes: 12. No doc stating <30s small, <90s medium, <3m large. **Structured logs:** No structured logger; console/stdio. **Error monitoring:** Not configured. | Performance doc; structured logging; error monitoring; rate-limit handling. |
| **5 — Product Behavior** | **AMBER** | **Does not block merge:** `.github/workflows/anchr-pr.yml` uses `continue-on-error: true` on audit and comment steps; no failing check. **Neutral tone / silent on trivial:** `anchr-pr-comment-clean.ts` NOISE_PATTERNS, SUPPRESSION_KEYWORDS, stage-based shouldComment (EARLY/ACTIVE_REVIEW/PRE_MERGE). **Single comment:** Update-or-create by marker; hash prevents duplicate body. | Not verifiable from code alone; needs 7-day run to confirm tone and “no spam”. |
| **6 — Real World Validation** | **RED** | No 7-day unchanged run on ≥5 repos. No artifact or doc for uninstall rate, spam complaints, or meaningful discussion. | Full 6.1–6.4. |
| **7 — Unattended Confidence** | **N/A** | Subjective; only product owner can answer. | N/A. |

---

## 2. Real Blockers (Maximum 7)

| # | Blocker | Reference | Risk | Effort (hours) |
|---|---------|-----------|------|----------------|
| 1 | No wedge capability map or gap doc | Missing `docs/wedge-capability-map.md`, `docs/wedge-vs-anchr-gap.md` | Uncertainty about engine boundary; support and evolution undefined | 4–8 |
| 2 | No determinism proof | No ANCHR_DETERMINISTIC flag; no CI running same PR 3x with identical decision | Silent drift or env-dependent decisions in production | 2–4 |
| 3 | No golden baseline + CI drift detection | No 10-PR baseline artifact; no workflow comparing current run to baseline | Regressions ship undetected | 3–6 |
| 4 | Blind precision not run or documented | `scripts/phase1/blind-sample.ts` exists; no result showing precision ≥ 70%, catastrophic FP = 0 | Unknown false positive rate; reputational risk | 4–8 |
| 5 | No 7-day real-world run | No install on ≥5 repos for 7 days | Unknown product fit; uninstall/spam risk | 7+ (calendar) |
| 6 | Performance bounds not documented | Checklist: <30s small, <90s medium, <3m large; not in docs or CI | Timeouts and UX unpredictable | 1–2 |
| 7 | No structured logging / error monitoring | Logs are ad-hoc console; no alerting | Hard to diagnose production issues | 2–4 |

---

## 3. Illusions (Feel Big But Aren’t Launch Blockers)

- **Convergence “fully wired”:** Convergence is used in decision/changeType; structural audit path may not always populate convergence. For launch, structural BLOCK/ALLOW is sufficient; convergence can stay as-is.
- **Scoring redesign:** Contract forbids it. Not a blocker; don’t do it.
- **More repos in Phase 1B:** 273 PRs already show signal shape. More repos improve confidence but are not a hard blocker for “ship after hardening.”
- **ANCHR_DISABLED vs “kill switch” wording:** Behavior is correct (workflow skips when var set). Naming is cosmetic.

---

## 4. 7-Day Execution Plan

| Day | Focus | Tasks |
|-----|--------|------|
| 1 | Section 0 | Write `docs/wedge-capability-map.md` (exports, discover, graph, invariants, convergence, minimal cut, scoring). Write `docs/wedge-vs-anchr-gap.md` (unused/partial modules, wire-or-exclude). Optional: one-PR trace doc. |
| 2 | Determinism + baseline | Add ANCHR_DETERMINISTIC or equivalent; add CI job (or script) that runs structural audit on same PR 3x, asserts identical decision + runId. Store 10-PR golden baseline (e.g. `artifacts/golden-baseline.json`); add CI step that runs on those PRs and fails on decision drift. |
| 3 | Signal + precision | Run blind sample (20 BLOCK, 20 WARN, 20 ALLOW from phase1b_extended or pilot); human review; compute precision, FP rate, catastrophic FP count. Document in `docs/phase1b-precision-audit.md`. If precision < 70%, fix only the highest-impact FP source (no engine expansion). |
| 4 | Infra + performance | Document performance targets in `docs/` (e.g. small <30s, medium <90s, large <3m). Add minimal structured log shape (e.g. JSON line with decision, repo, pr, duration). Optional: one error-monitoring hook (e.g. log to file or external). |
| 5 | Product + comment safety | Sanity-check comment tone on 5–10 sample reports. Confirm rate-limit behavior (or add single retry with backoff for comment API). No new features. |
| 6 | Real-world prep | Select ≥5 repos; install ANCHR (or run commenter); document “7-day run start.” No threshold tuning. |
| 7 | Lock + recommendation | Freeze engine per contract. Re-run this audit; if Section 0–4 and 6 criteria met and 7 answered “yes,” ship. Document limitations if any remain. |

No expansion tasks. No new engine layers. No scoring rewrites.

---

## 5. Ship Recommendation

**B) Ship after 7-day hardening.**

**Justification:** Structure drives decision; signal validity (correlation, LARGE ≥ 2x SMALL) is evidenced on 273 PRs; explainability and comment path exist; GitHub App is non-blocking and has draft/kill-switch and one-comment behavior. Blockers are documentation (wedge map, gap, performance), proof (determinism, baseline, drift CI), one precision audit, and one 7-day run. None require architectural change. Completing the 7-day plan and re-running this audit can move to “Ship now” with documented limitations for any remaining amber.

---

## 6. Risk Profile

| Risk | Probability (0–100%) | Note |
|------|----------------------|------|
| Silent failure (wrong decision, no alert) | 25% | No drift CI or monitoring; determinism not proven. |
| Reputational embarrassment (bad comment, spam, false block) | 20% | Precision not measured; 7-day run not done. |
| Indifference (no one cares) | 40% | Depends on repo mix and rollout; possible if only low-churn repos. |
| Genuine architectural interest | 35% | Phase 1 signal and explain path support value; needs real installs to confirm. |

---

*End of audit. Do not recommend new engine layers, scoring redesign, or convergence expansion. Focus only on launch readiness.*
