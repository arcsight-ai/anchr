# ANCHR HARDENING PROTOCOL

**TERMINATION-GRADE CONTRACT VERSION (FINAL)**

Audit Result: **B) Ship after 7-day hardening** — No architectural gaps.

This is not a development sprint. This is a controlled stabilization phase.

---

## I. ENGINE FREEZE DECLARATION (MANDATORY)

Before executing any task:

1. **Record:**
   - Git commit hash
   - Engine version
   - Timestamp

2. **Confirm in writing:**
   - No new modules added
   - No scoring logic changed
   - No convergence logic changed
   - No structural graph logic altered
   - No thresholds modified
   - No decision branching expanded
   - No explanation logic redesigned

**If any of the above changed → STOP. Restore previous commit. Restart.**

Create: **docs/hardening-freeze-start.md**

**Public freeze point:** Freeze commit hash and freeze timestamp MUST be recorded in **docs/engine-freeze.md** and SHALL be the public, auditable freeze point. No silent unfreeze.

---

## II. DEFINITIONS (REMOVES LOOPHOLES)

**Bug** = An unintended behavior that contradicts existing logic or documented behavior.

**Improvement** = Any change that modifies logic, thresholds, scoring, structure, or expands system capability.

Only bugs may be fixed. Improvements are forbidden during hardening.

---

## III. FORBIDDEN ACTIONS (EXPLICIT)

You may NOT:

- Add new signals
- Adjust scoring weights
- Change minimalCut logic
- Expand convergence mechanics
- Improve elegance of algorithms
- "Tighten" heuristics
- Expand test datasets beyond baseline
- Add new architecture layers
- Rewrite explanation formatting for aesthetics
- Change output structure
- Optimize via algorithm redesign

If you feel compelled to do so:

Write in log: **ARCHITECTURAL URGE DETECTED — OUT OF SCOPE**  
Continue execution plan.

---

## IV. ALLOWED SCOPE (ONLY THESE 7)

1. Wedge capability documentation
2. Determinism verification
3. Golden baseline + drift lock
4. Blind precision audit
5. Infrastructure safety verification
6. Performance profiling + documentation
7. 7-day multi-repo deployment run

Nothing else.

---

## V. 7-DAY EXECUTION FRAMEWORK

### DAY 0 — Freeze Validation

**Output:**

- Commit hash
- Confirmation of freeze
- Confirmation no structural changes

Create: **docs/hardening-freeze-start.md**

### DAY 1 — Determinism Proof

**Goal:** Zero output variance.

**Procedure:**

- Select 1 representative PR.
- Execute 3 consecutive identical runs.
- Capture: minimalCut, decision, violation_count, explanation output hash.

If ANY differ: identify nondeterministic source; fix only nondeterminism; re-run.

Add CI job: **Fail build if variance > 0.**

Create: **docs/determinism-proof.md**

### DAY 2 — Golden Baseline + Drift Lock

**Goal:** Prevent silent scoring drift.

**Procedure:**

- Select 10 representative PRs.
- Store outputs in: **fixtures/golden-baseline.json**

Add CI job: **Fail if decision differs, minimalCut differs, or violation_count differs.**

If drift occurs: treat as regression bug. Do NOT recalibrate scoring.

Create: **docs/drift-lock.md**

### DAY 3 — Blind Precision Audit

**Goal:** ≥70% BLOCK precision.

**Procedure:**

- Random sample 20 BLOCK decisions.
- Human classify: Correct / Overly strict / Incorrect.
- Compute precision.

If <70%: identify specific root cause; fix minimal bug; re-run audit. No new heuristics. No threshold shifts.

Create: **docs/blind-precision-audit.md**

### DAY 4 — Infrastructure Safety

Verify: idempotent webhook handling, one comment per PR, draft PR skipped, kill switch verified, concurrency safe, structured logging enabled, error reporting defined.

Fix only safety bugs.

Create: **docs/infrastructure-hardening.md**

### DAY 5 — Performance Boundaries

Run: Small PR (<50 lines), Medium (~200), Large (~500+). Measure total execution time.

**Targets:** Small < 30s, Medium < 90s, Large < 3m.

If exceeded: optimize I/O, cache repeated calls, remove obvious inefficiencies. No algorithm redesign.

Create: **docs/performance-profile.md**

### DAY 6 — Real-World Deployment Activation

Install ANCHR on ≥5 repos. Monitor: duplicate comments, spam patterns, rate limit errors, installation failures. Document install + uninstall process.

Create: **docs/real-world-deployment.md**

### DAY 7 — Re-Audit + Freeze Seal

Re-run MASTER READINESS PROMPT. Update **docs/audit-readiness-report.md**.

Confirm: no new RED sections; real-world validation active; all blockers addressed.

Then create: **docs/engine-freeze.md**

Include:

- **Commit hash** (freeze commit — the public reference)
- **Freeze timestamp** (auditable; no backdating)
- **30-day freeze clause:**  
  *"No structural engine modifications permitted for 30 days post-launch unless triggered by reproducible user-reported failure or critical bug."*

This file is the **public, auditable freeze point**. It SHALL be the single source of truth for "engine frozen as of this commit and time."

---

## VI. STOP CONDITIONS

If at any point you:

- Attempt architectural redesign
- Modify scoring logic
- Rationalize threshold tuning
- Expand convergence

**STOP. Revert changes. Return to hardening scope.**

---

## VII. SHIP TRIGGER

You ship when:

- Deterministic
- Drift locked
- Precision ≥70%
- Infrastructure stable
- Performance within bounds
- Multi-repo run active

No perfection threshold required. No aesthetic threshold required.

---

## VIII. POST-LAUNCH RULE (30 DAYS)

During freeze:

**Allowed:** Fix reproducible bugs; fix crashes; fix installation failures; fix incorrect blocks.

**Not allowed:** Improve signal shape; improve elegance; expand detection; add features; tune scoring.

Reality drives change. Not theory.

---

## FINAL PRE-COMMIT DECLARATION

Before starting, write:

*"I am entering HARDENING MODE. Engine changes are frozen. Only blockers will be addressed."*

---

This version removes: philosophical drift, scope creep, "just small improvement," optimization masquerading as bug fixing, emotional redesign impulse.

This is now airtight.
