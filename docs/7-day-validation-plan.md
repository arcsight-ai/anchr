# 7-Day Real-World Validation Plan (Day 5)

**Freeze commit:** 6597d00c1cf47a86fa6c1e8a0db5d987e9c3232f  
**Objective:** Unattended validation on ≥5 repos. No engine changes during the 7-day window.

---

## 1. Repo list (5 active public repos, diverse sizes)

| # | Repo | Size (approx) | Purpose |
|---|------|----------------|---------|
| 1 | sindresorhus/ky | Small (~24 src files) | Single-package, high activity |
| 2 | vercel/swr | Small–medium | React hooks, active |
| 3 | axios/axios | Medium | HTTP client, broad use |
| 4 | pinojs/pino | Medium | Logger, Node ecosystem |
| 5 | trpc/trpc | Large (monorepo) | Full-stack, many packages |

**Alternative options** (if any repo is unsuitable): vitest-dev/vitest, lodash/lodash.

---

## 2. Install confirmation

**You must install the ANCHR GitHub App on each of the 5 repos.**

- [ ] Repo 1: _____________________
- [ ] Repo 2: _____________________
- [ ] Repo 3: _____________________
- [ ] Repo 4: _____________________
- [ ] Repo 5: _____________________

**Validation start timestamp (UTC):** 2026-02-20T12:27:36Z

*Clock starts when the 5th repo install is confirmed and tag `engine-validation-start` is pushed. No engine changes allowed for 7 days.*

**Install method:** Use the same workflow that runs on this repo (`.github/workflows/anchr-pr.yml`). Each target repo needs the workflow in its default branch and (if using GitHub App) the app installed, or use a single App that has access to all 5 repos.

---

## 3. Pre-validation checks (ensure before start)

| Check | Status | Where verified |
|-------|--------|----------------|
| One comment per PR | ✓ | `scripts/anchr-pr-comment-clean.ts`: find by marker, update or create one |
| Draft PR skip | ✓ | `.github/workflows/anchr-pr.yml`: "Skip if draft" step |
| Kill switch | ✓ | `vars.ANCHR_DISABLED` = "true" skips all steps |
| anchr-ignore label | ✓ | Label "anchr-ignore" skips comment |
| Idempotent re-runs | ✓ | Concurrency group per PR; hash check avoids duplicate body |

---

## 4. Monitoring plan

| What | How |
|------|-----|
| **Workflow runs** | GitHub Actions tab per repo: ANCHR PR workflow success/failure, duration |
| **Comments posted** | Per PR: at most one comment with `<!-- anchr:comment -->`; no duplicate bodies |
| **BLOCK rate** | Optional: scrape or log decisions (e.g. from workflow artifacts) to compute BLOCK % |
| **Performance** | Workflow run duration; no step timeouts (timeout-minutes: 12) |
| **User reactions** | Qualitative: issues, discussions, negative feedback, uninstalls |

**Monitoring method:** Manual daily spot-check (e.g. 5 min): open each repo’s Actions, confirm recent PRs ran and no spike of failures. No automated dashboard required; the rule is “no engine changes,” so monitoring is observational only.

---

## 5. Metrics to collect (during or after 7 days)

| Metric | How |
|--------|-----|
| Total PRs analyzed | Count of workflow runs that reached “Run structural audit” (or count PRs with ANCHR comment) |
| BLOCK rate | Count BLOCK vs ALLOW/WARN from report or comment text |
| False-positive reports | User-reported “this BLOCK was wrong”; log and triage only after 7 days |
| Performance issues | Workflow timeouts, OOM, or runs > 3 min |
| User reactions | Qualitative: complaints, thanks, “remove this bot,” discussions |

---

## 6. Failure protocol

- **Workflow consistently failing on one repo:** Note repo and error; do not change engine. If cause is env/config (e.g. token), fix only that.
- **Duplicate comments observed:** Note PR and repo; treat as bug, fix only comment-idempotency logic after 7 days if confirmed.
- **Spam or tone complaint:** Pause (kill switch) on that repo; no engine change during window.
- **Catastrophic misclassification (e.g. clearly wrong BLOCK):** Log; no threshold or scoring change during 7 days. Triage after.

---

## 7. Rule: no engine changes during 7-day window

- **Allowed:** Bug fixes for *confirmed* failures (e.g. crash, wrong comment count, kill switch not working).
- **Not allowed:** New features, logic tuning, threshold changes, scoring changes, structural/graph changes, “improvements.”

Freeze means freeze.

---

## 8. Success vs stop-the-test criteria

**What counts as success (after 7 days)?**

- No catastrophic misclassification (no widely agreed “this BLOCK was obviously wrong”).
- No performance breakdown (no sustained timeouts or OOM).
- No major user backlash (no “remove this bot” wave, no uninstall spike).
- At least one meaningful architectural discussion or neutral/positive reaction (optional but desired).

**What counts as stop-the-test failure (hard stop)?**

- **Catastrophic misclassification:** A BLOCK that the repo maintainers or community agree was clearly wrong and harmful.
- **Performance breakdown:** Repeated timeouts or failures on multiple repos so the App is effectively unusable.
- **Major user backlash:** Multiple repos or users asking to remove or disable ANCHR; uninstall rate or complaints suggest the tool is net-negative.

If a hard-stop condition is met, pause (kill switch) and triage. Do not change engine logic during the 7 days; decide after whether to fix a bug or document a limitation.

---

## 9. Hard stop criteria (summary)

| Condition | Action |
|-----------|--------|
| Catastrophic misclassification confirmed | Pause; document; no engine change during window |
| Performance breakdown (sustained failures/timeouts) | Pause; investigate env/infra only |
| Major user backlash (uninstall wave, spam complaints) | Pause; kill switch on affected repos |

---

## 10. 7-Day Validation Discipline (ACTIVE VALIDATION MODE)

**Validation window started:** 2026-02-20T12:27:36Z  
**Freeze tag:** engine-validation-start  
**Engine commit locked.** No structural changes allowed.

For the next 7 days, behavior must follow this contract.

### 1. You are NOT allowed to

- Modify scoring logic
- Tune thresholds
- Adjust risk weights
- Change structural graph logic
- Refactor detection code
- “Improve” precision heuristics
- Quietly fix edge-case behavior unless it is: idempotency, infra failure, or logging only

**If it changes decision output → it is forbidden.**

### 2. Daily protocol (~5 minutes)

For each repo:

- Open GitHub Actions
- Confirm runs are triggering
- Confirm no sustained failures
- Confirm no duplicate comments
- Spot check 1–2 PRs
- Note: BLOCK rate, any confusion, any user reaction

Log findings under **Daily Observations** (section 11). No interpretation. Just record.

### 3. Hard stop triggers (immediate pause)

- **Catastrophic misclassification** (e.g. obvious harmless PR blocked as structural)
- **Sustained timeouts/failures**
- **Major backlash** (“remove this bot”)

If triggered: disable app, document incident, do not patch logic mid-stream. Treat as validation failure.

### 4. What this week proves

If nothing breaks: determinism holds in production; precision holds under real traffic; no catastrophic structural false positives; performance stable under real CI; engine is behaviorally stable. That’s stronger than another 20 internal tests.

### 5. The real temptation

You will want to tweak something. Don’t. The credibility comes from restraint. Most systems fail here because founders “just improve one thing.” You froze. Now you observe.

### 6. On Day 7

Generate: BLOCK rate across repos; false positive count; catastrophic count; performance stats; user reaction summary; **Decision: Ship / Iterate.**

Only then may the freeze be lifted.

---

## 11. Daily Observations

*Log daily using the **Automated Daily Validation Check Prompt** (section 11b). Append each day’s structured report below. No interpretation.*

| Date (UTC) | Repo | Runs OK | Failures | Duplicates | Spot-check | BLOCK rate | Notes |
|------------|------|---------|----------|------------|------------|------------|-------|
| | | | | | | | |

---

## 11b. Automated Daily Validation Check Prompt

*Use once per day. Copy/paste the block below to force a complete sweep. If any repo is skipped, the check is incomplete.*

```
You are in ACTIVE 7-DAY VALIDATION MODE.

Validation start: 2026-02-20T12:27:36Z
Freeze tag: engine-validation-start
Engine commit locked.

You must complete a full validation sweep. If any repo is skipped, the check is incomplete.

--- Step 1 — Enumerate repos (no skipping) ---

Repos under validation:
1. sindresorhus/ky
2. vercel/swr
3. axios/axios
4. pinojs/pino
5. trpc/trpc

You must process all 5.

--- Step 2 — For EACH repo, verify (last 24h or since last check) ---

- PR workflows triggered
- No sustained GitHub Action failures
- No duplicate bot comments
- No infinite reruns
- No timeouts
- No unusual latency spikes
- Spot-check up to 2 PRs: decision reasonable? any obvious structural false positive?
- Approx BLOCK rate observed

If a repo has zero PRs, record "No PR activity". Produce structured output.

--- Step 3 — Structured output (required format, repeat for all 5) ---

Repo:
Runs OK (Y/N):
Failures:
Duplicates:
Spot check summary:
Approx BLOCK rate:
Notes (factual only):

--- Step 4 — Hard stop evaluation ---

Catastrophic misclassification detected? (Y/N)
Sustained failures? (Y/N)
Major user backlash/uninstall? (Y/N)

If any = YES: stop immediately, disable app, document, no engine patches allowed.

--- Step 5 — Contract confirmation ---

Engine logic modified today? (Y/N)
If yes → validation invalid.

Append today's structured report to docs/7-day-validation-plan.md Section 11 — Daily Observations.

--- Final required output ---

Validation date (UTC):
All 5 repos reviewed? (Y/N)
Any hard stop triggered? (Y/N)
Engine unchanged? (Y/N)

No skipping fields. Observation only. No interpretation, optimization, or improvements.
```

---

## 12. Output summary

| Field | Value |
|-------|--------|
| **Repo list** | sindresorhus/ky, vercel/swr, axios/axios, pinojs/pino, trpc/trpc |
| **Validation start timestamp (UTC)** | 2026-02-20T12:27:36Z |
| **Monitoring method** | Daily spot-check of Actions per repo; qualitative note of BLOCK rate and user reaction |
| **Hard stop criteria** | Catastrophic misclassification; performance breakdown; major user backlash |

---

*After 7 days without hard stop: engine is production-ready. Ship or explicitly document why not.*

*Generated for Day 5 — 7-day real-world validation prep.*
