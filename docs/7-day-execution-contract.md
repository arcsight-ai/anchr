# 7-DAY DISTRIBUTION EXECUTION CONTRACT

Technical validation rules: **docs/7-day-validation-plan.md**. Do not duplicate technical content here.

**System state:**

ENGINE: FROZEN  
VALIDATION: ACTIVE  
DISTRIBUTION: IN PROGRESS  
ARCHITECTURAL CHANGES: DISABLED

---

## SECTION 0 — CONTROL PANEL

Engine commit (frozen): from .freeze-engine-hash  
Validation start (UTC): from .freeze-validation-window line 1  
Validation end (UTC): from .freeze-validation-window line 2  
Current validation day: derived from (now − validation start) in UTC. Validation day is informational; freeze enforcement is time-window based only.  
Launch decision: PENDING / APPROVED / DELAYED (manual)  
Engine modification count during validation: derived in CI by counting commits touching protected paths (see .freeze-protected-paths) during validation window. Must equal 0 or validation invalid.  
Freeze integrity (CI): PASS / FAIL  
Last CI verification (UTC): from last successful run

Control panel values are authoritative only when CI = PASS.

Rule: If engine modification count > 0 or freeze integrity FAIL → validation invalid → re-freeze and restart 7-day clock.

---

## DAILY VALIDATION RITUAL

Technical discipline (freeze, ritual, forbidden edits): see docs/7-day-validation-plan.md.

---

## WEEK OBJECTIVE

By end of Day 7:

- [ ] Positioning locked
- [ ] Claims mapped to real evidence
- [ ] Landing page copy complete
- [ ] Real demo assets captured
- [ ] DevHunt draft ready
- [ ] Beta intake operational
- [ ] Launch narrative written

All deliverables documented. No hypotheticals.

---

## DRIFT DETECTION

Drift is defined as (machine-detectable only):

- Engine commit changes (HEAD != .freeze-engine-hash)
- Protected path modification (any path in .freeze-protected-paths changed since frozen commit)
- .freeze-validation-window file change
- .freeze-engine-hash file change

If any occur during validation window without a commit containing [validation-restart] and updated .freeze-engine-hash in same commit:

Validation invalid. Pause distribution. Re-freeze. Restart 7-day clock.

No exception path.

---

## DAY 1 — POSITIONING LOCK

**Time cap:** 90 min.

- [ ] 3 one-line pitches (≤15 words)
- [ ] Select one
- [ ] 3 sentences: Problem. Mechanism. Outcome.
- [ ] ICP: repo size, team size, language, trigger pain
- [ ] ANCHR is / ANCHR is NOT

**Pass:** Senior developer understands in one read. **Deliverable:** `docs/positioning-lock.md`

---

## DAY 2 — CLAIMS → PROOF MAPPING

**Time cap:** 90 min.

- [ ] Plain-English definition of structural risk
- [ ] 5 real risks caught; evidence mapping (validation log ref) for each
- [ ] 3 clean PR examples
- [ ] Short write-up: "Why review misses structural risk"

**Pass:** Every claim has validation evidence. **Deliverable:** `docs/evidence-framework.md`

---

## DAY 3 — LANDING PAGE COPY

**Time cap:** 2 hours.

- [ ] Headline, subheading
- [ ] Problem section, mechanism, example output block
- [ ] 3-step explanation
- [ ] Install CTA, Beta CTA

No hype, no AI buzzwords, no unvalidated claims. **Pass:** Reader knows what happens before merge. **Deliverable:** `docs/landing-page-copy.md`

---

## DAY 4 — REAL DEMO ASSETS

**Time cap:** 2 hours.

- [ ] WARN example
- [ ] BLOCK example
- [ ] ALLOW example
- [ ] MinimalCut screenshot
- [ ] Coverage output screenshot

Real runs only. Traceable to commit. No staging. **Deliverable:** `media/` complete.

---

## DAY 5 — DEVHUNT DRAFT

**Time cap:** 90 min.

- [ ] Title, tagline, 3 benefits
- [ ] Origin story paragraph, "How it's different"
- [ ] Screenshots attached, install link validated

Do not submit. **Deliverable:** `docs/devhunt-draft.md`

---

## DAY 6 — BETA INFRASTRUCTURE

**Time cap:** 90 min.

- [ ] Intake form (minimal fields)
- [ ] Tracking sheet
- [ ] Auto-response email

**Pass:** Submit → logged → confirmation sent. **Deliverable:** Operational beta pipeline.

---

## DAY 7 — LAUNCH NARRATIVE

**Time cap:** 2 hours.

- [ ] Why engine was frozen
- [ ] What was measured; what passed; what failed
- [ ] What was not changed; what happens next

Tone: calm, transparent, data-based. **Deliverable:** `docs/launch-narrative.md`

---

## WEEK OUTCOME DEFINITION

This week validates:

- Engine unchanged (HEAD == .freeze-engine-hash; no protected path changes)
- Metrics stable (precision, stability, no systemic false positives)
- Evidence aligned (messaging matches validation evidence)
- Freeze respected (CI = PASS; engine modification count = 0)

Success = A) Launch-ready or B) Disciplined delay with documented cause.  
Undisciplined launch = failure.

---

## LAUNCH DECISION GATE

Launch only if:

- [ ] Precision ≥ 70%
- [ ] Positive diff-size correlation
- [ ] Stability confirmed
- [ ] No systemic false positives
- [ ] Messaging aligns with evidence

If any fail: delay launch, return to engineering, re-freeze, restart validation. No override.

---

## ESCALATION PROTOCOL

If validation degrades mid-week:

1. Pause distribution.
2. Document issue.
3. Diagnose wiring (not wedge core).
4. Fix.
5. Re-freeze.
6. Restart 7-day clock.

No patch-and-launch.

---

## DAY 7 DECISION RECORD

Precision:  
Stability:  
False positive count:  
Diff-size correlation:  
User reaction summary:  
Distribution assets complete? (Y/N):

Decision: SHIP / ITERATE

If SHIP: tag commit with validation-complete.  
If ITERATE: tag commit with validation-restart. Do not delete these tags once created.

Rationale:

Next action:

---

Freeze integrity is determined exclusively by CI status. Manual edits to control panel do not override CI result.

**Structural invariants.** System is valid only if: CI PASS; HEAD == .freeze-engine-hash (inside window); no protected path modifications; .freeze-validation-window properly formatted; engine modification count == 0. Any violation: validation invalid, restart required. No exception path.
