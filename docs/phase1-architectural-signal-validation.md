# PHASE 1 — ARCHITECTURAL SIGNAL VALIDATION (HARDENED)

**Goal:** Determine whether ANCHR / Dina certification produces meaningful architectural risk signal on real-world pull requests. We validate signal quality, not workflow mechanics. **No tuning during this phase.**

---

## STEP 0 — Lock Configuration

Before running:

- Fix **certify runs = 8**
- Fix **coverage thresholds**
- **Disable** merge-stage logic
- **Disable** suppression logic
- **Disable** PR timing logic

This phase evaluates **raw certification output only**. If you change parameters mid-run → invalidate results.

---

## STEP 1 — Repo Selection Rules

Select **5–10 repos** meeting **ALL** criteria:

- \> 100 merged PRs
- ≥ 3 contributors
- Not your own repos
- Non-trivial architecture (services, layers, modules)
- ≥ 5k lines of code

**Avoid:** Templates, boilerplate starters, pure UI libraries, forks with no original history.

**Target variety:** Backend-heavy, fullstack, CLI/tooling, modular monorepo, job/event-driven system.

**Document selection criteria.**

---

## STEP 2 — PR Sampling Protocol

For each repo: **Randomly** select **50 merged PRs**.

**Randomization method:** Sort PRs by number → select every Nth PR. No manual picking. This avoids cherry-picking.

**Total target sample size:** 300–500 PRs minimum.

---

## STEP 3 — Historical Replay Execution

For each PR:

1. Checkout base SHA
2. Run certification base → head
3. Capture raw JSON
4. Store result

**Stored record (per PR):**

- repo, pr_number, base_sha, head_sha
- lines_changed, files_changed
- decision.level, confidence.coverageRatio, classification.primaryCause, minimalCut.length
- timestamp

No filtering. No interpretation.

---

## STEP 4 — Complexity Normalization

For each PR compute:

- **diff_size** = lines_changed
- **file_count** = files_changed
- **complexity_bucket:** SMALL (≤50), MEDIUM (51–300), LARGE (>300)

**Tags:** single-file, multi-file, cross-directory, public API touched (heuristic: exported/public keyword change).

Use this to analyze signal quality relative to complexity.

---

## STEP 5 — Distribution Analysis

Calculate:

- Block %, Warn %, Allow %
- High / Medium / Low confidence %
- Average coverageRatio by: complexity_bucket, file_count, repo

**Look for:** Does signal scale with diff size? Does coverage increase with complexity? Does it stay mostly silent on small PRs? Signal should correlate with architectural surface area.

---

## STEP 6 — Blind Precision Evaluation

Randomly sample: **20 BLOCK**, **20 WARN**, **20 ALLOW**.

**Blind review protocol:** Reviewer must **not** see coverage ratio, minimalCut count, classification.primaryCause. Only inspect the PR. Mark: **TRUE_POSITIVE**, **PLAUSIBLE**, **FALSE_POSITIVE**.

**Precision** = TRUE_POSITIVE / (TRUE_POSITIVE + FALSE_POSITIVE)

- \< 60% → needs core tuning  
- 60–75% → promising  
- 75–85% → strong  
- \> 85% → exceptional  

---

## STEP 7 — Weak Recall Proxy

From all PRs with: \> 300 lines changed, cross-directory changes, public API touched → check **% flagged as warn/block**.

- \< 20% → likely under-sensitive  
- 20–60% → reasonable  
- \> 60% → potentially over-sensitive  

Not full recall — directional signal only.

---

## STEP 8 — Silence Quality Test

From **20 random ALLOW** PRs: Were these trivial? Docs? Cosmetic? Safe refactors? If yes → silence quality good. If obvious risk missed → inspect minimalCut behavior.

---

## STEP 9 — Confidence Calibration Check

Plot **coverageRatio vs decision.level**. High coverage should strongly correlate with block; low with allow. If no clear separation → calibration tuning required.

---

## STEP 10 — Statistical Confidence

For precision sample (n ≈ 40): **CI ≈ ± sqrt(p(1-p)/n)**. Report precision with CI. Prevents false certainty.

---

## STEP 11 — Internal Report

Summary:

- Repos tested, Total PRs
- Block %, Warn %, Allow %
- High/Med/Low confidence %
- Precision (with CI), Weak recall proxy
- Observed patterns, Failure patterns

**Do not adjust engine until report is complete.**

---

## STEP 12 — Interpretation Rules

- **Signal correlates with diff complexity + Precision ≥ 70% + Silence mostly on trivial PRs** → The brain works.
- **No correlation, random distribution, Precision \< 60%** → Core wedge logic review required.

---

## CRITICAL RULE

**Do not tune during Phase 1.** No threshold changes. No coverage changes. No minimalCut adjustments. Run clean experiment first.

---

## Scripts reference

| Step | Script | Purpose |
|------|--------|--------|
| 0 | `scripts/phase1/config.ts` | Locked config (runs, thresholds); `getComplexityBucket` |
| 2 | `scripts/phase1/sample-prs.ts` | Sample every Nth merged PR per repo |
| 3–4 | `scripts/phase1/replay-capture.ts` | Run certification, diff stats, complexity tags; write `Phase1Record` |
| 5 | `scripts/phase1/distribution.ts` | Load records, compute Block/Warn/Allow %, confidence %, avg coverage by bucket/repo/file_count |
| 6 | `scripts/phase1/blind-sample.ts` | Sample 20 BLOCK / 20 WARN / 20 ALLOW (no coverage/minimalCut/primaryCause in output) |
| 7 | `scripts/phase1/weak-recall.ts` | % of high-complexity PRs flagged as warn/block |
| 10 | `scripts/phase1/statistical-ci.ts` | Precision CI ≈ ±√(p(1−p)/n) |
| 11 | `scripts/phase1/report-template.md` | Internal report template |
| — | `scripts/phase1/run-analysis.ts` | Run distribution + weak recall + blind sample → `artifacts/phase1/analysis/` |
| — | `scripts/phase1/generate-report.ts` | Fill report from analysis + optional precision (TP, FP) → `artifacts/phase1/phase1-internal-report.md` |

### Option A — Hardened pilot (small-batch)

| Script | Purpose |
|--------|--------|
| `scripts/phase1/run-pilot.ts` | Deterministic pilot: `--repos owner/name owner/name [--seed 42] [--max-prs 20]`. Fetches merged PRs (API, rate-limit safe), deterministic bucket sample (5 SMALL, 10 MEDIUM, 5 LARGE), clone in `.tmp/phase1/<repo>/<pr>`, run structural audit, write `artifacts/phase1/pilot/<repo_slug>/<pr>.json`. Resume-capable; idempotent. |
| `scripts/phase1/generate-pilot-summary.ts` | Reads pilot artifacts; writes `artifacts/phase1/pilot-summary.md` and `artifacts/phase1/blind-review.json` (5 BLOCK, 5 WARN, 5 ALLOW, blinded). |
| `scripts/phase1/pilot-types.ts` | `PilotRecord` type (summary metrics only; no diff content). |
