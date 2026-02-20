# PHASE 1 — ARCHITECTURAL SIGNAL VALIDATION (FINAL HARDENED)

**Goal:** Determine whether ANCHR produces statistically meaningful architectural signal on historical pull requests. This phase validates signal quality only. No product expansion. No marketing. No tuning before measurement.

---

## SECTION 1 — INFRASTRUCTURE VALIDATION

**Purpose:** Confirm bounded, deterministic, resumable execution.

### Step 1A — Dry Run

Run:

```bash
npx tsx scripts/phase1/run-pilot.ts --repos owner/repo --max-prs 10 --since-months 12 --dry-run
```

**Success criteria:**

- Pagination stops correctly
- Bucket distribution printed
- Runtime < 30 seconds
- No rate limit warnings
- No infinite scanning
- No hanging processes

If any fail → fix infra only. Do not continue.

### Step 1B — Small Execution (10 PRs)

Remove `--dry-run`.

**Success criteria:**

- Clone succeeds
- Certification executes
- Artifacts generated
- Timeout rate < 20%
- Avg PR runtime < 2 minutes
- No unbounded memory growth

If timeout ≥ 20% → stabilize engine before scaling.

### Step 1C — Reproducibility Check

Re-run same 10 PR sample. Decision distribution must not vary > 10%. If unstable → investigate nondeterminism. Only proceed when stable.

---

## SECTION 2 — CONTROLLED PILOT (40 PRs)

**Purpose:** Test for directional signal.

Run 2 repos. Per repo:

- 5 SMALL PRs
- 10 MEDIUM PRs
- 5 LARGE PRs

Total: 40 PRs. Ensure bucket sampling is balanced.

---

## SECTION 3 — METRICS TO COLLECT

**Per PR:** Diff size, coverage ratio, decision (ALLOW/WARN/BLOCK), minimalCut size, execution time.

**Aggregate:** Decision distribution, coverage avg per bucket, BLOCK %, WARN %, ALLOW %, coverage variance.

---

## SECTION 4 — HEALTH CHECKS

**Healthy pattern:**

- SMALL → ≥ 60% ALLOW
- MEDIUM → mixed
- LARGE → ≥ 2× BLOCK rate vs SMALL
- Coverage increases monotonically with bucket
- BLOCK between 10%–40%
- Coverage variance > 0

**Unhealthy pattern:**

- Flat coverage across buckets
- ALLOW > 90%
- BLOCK > 60%
- MinimalCut empty frequently
- No difference between SMALL and LARGE
- Coverage variance near zero

If unhealthy → inspect engine.

---

## SECTION 5 — CORRELATION TEST

Compute: **correlation(diff_size, coverage_ratio)**. Must be positive. Weak positive acceptable. Zero or negative → no structural sensitivity.

Also: **avg coverage SMALL < MEDIUM < LARGE**. If not monotonic → signal weak.

---

## SECTION 6 — BLIND REVIEW

From `blind-review.json`: select 5 highest coverage, 5 random medium, 5 random allow. Classify each: TRUE_POSITIVE, PLAUSIBLE, FALSE_POSITIVE.

**Precision** = TP / (TP + FP).

- ≥ 75% = strong
- 65–74% = promising
- 55–64% = weak
- < 55% = unreliable

Document reasoning per case.

---

## SECTION 7 — STABILITY CHECK

Ensure: no runaway execution, no repeated crashes, no increasing timeout trend, no memory spike. If instability present → infra must be hardened before scaling.

---

## SECTION 8 — STOP-LOSS CONDITIONS

Abort scaling if:

- Precision < 55%
- No diff-size correlation
- Decision distribution random
- High instability

Do not rationalize results. Fix core logic first.

---

## SECTION 9 — SUCCESS CRITERIA

Phase 1 passes only if:

- Precision ≥ 70%
- Positive diff-size correlation
- SMALL mostly ALLOW
- LARGE materially higher WARN/BLOCK
- BLOCK between 10%–40%
- Infrastructure stable
- Reproducibility confirmed

Only then proceed to scale.

---

## SECTION 10 — SCALE READINESS

If Phase 1 passes: move to 300–500 PR sample across 5–10 repos. Collect: confidence intervals, precision variance, coverage slope consistency, false positive clustering. That becomes publishable validation.

---

## FINAL RULE

You are not validating vibes. You are validating correlation and precision. Phase 1 answers one binary question: **Does ANCHR behave like architectural reasoning under measurement?** If yes → scale. If no → refine engine. No middle ground.

---

## Scripts reference

| Step | Script | Purpose |
|------|--------|--------|
| 1A–1B | `scripts/phase1/run-pilot.ts` | Dry-run or full pilot; `--dry-run`, `--repos`, `--max-prs`, `--since-months` |
| 1C | Re-run same `run-pilot` with same `--repos` and `--seed` | Compare decision distribution; variance must be &lt; 10% |
| Summary | `scripts/phase1/generate-pilot-summary.ts` | Writes `pilot-summary.md`, `blind-review.json` |
| 4–5, 8 | `scripts/phase1/health-and-correlation.ts` | Correlation(diff_size, coverage), health checks, stop-loss; writes `phase1-health-report.md` |
