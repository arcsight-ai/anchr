# ANCHR ENGINE COMPLETION CHECKLIST — FINAL TERMINATION VERSION

Definition of Done:

Engineering ends when all REQUIRED sections are true AND the Unattended Confidence Test passes.

No architectural expansion allowed after completion.
Only real-world failures justify changes.

Maximum build window: 14 days.
If incomplete at 14 days → ship with documented limitations.

---

## SECTION 0 — WEDGE GROUND TRUTH (REQUIRED)

Time limit: 1 day.

- All ArcSight-wedge exports documented
- discover layer confirmed
- graph construction confirmed
- invariant engine confirmed
- convergence engine confirmed
- minimal cut logic confirmed
- scoring logic confirmed
- multi-repo features evaluated

Deliverable: docs/wedge-capability-map.md

- Unused modules identified
- Explicit decision: wire or exclude

Deliverable: docs/wedge-vs-anchr-gap.md

No silent unused power.

---

## SECTION 1 — STRUCTURAL DOMINANCE (REQUIRED)

- Minimal cut influences decision
- Invariants influence decision
- Convergence influences decision
- No heuristic-only path to BLOCK

Determinism:

- Same PR → identical decision (3 runs)
- Variance < 10%
- No randomness
- No time-based drift

Directional tests (at least 4/5 must behave correctly):

- Refactor → ALLOW
- Local feature → ALLOW or WARN
- Cross-module injection → WARN
- Circular dependency → BLOCK
- Broken invariant → BLOCK

Regression guard:

- 10 PR golden baseline stored
- CI drift detection enabled

---

## SECTION 2 — SIGNAL VALIDITY (REQUIRED)

Diff-size sample (≥ 40 PRs):

- Correlation(diff_size, coverage) > 0
- LARGE WARN/BLOCK rate ≥ 2x SMALL
- Coverage variance > 0

Precision audit (20 PR blind review):

- Precision ≥ 70%
- False positive rate ≤ 30%
- Catastrophic false positives = 0

Adversarial proof:

- Removing dependency lowers coverage
- Adding dependency increases coverage
- Artificial entanglement triggers

---

## SECTION 3 — EXPLAINABILITY (REQUIRED)

For every WARN/BLOCK:

- Files listed
- Dependency path shown
- Minimal cut explained
- Architectural consequence explained
- Readable in < 30 seconds

Debug mode:

- –explain-decision prints full reasoning tree

If you cannot defend a decision calmly → not done.

---

## SECTION 4 — INFRASTRUCTURE SAFETY (REQUIRED)

GitHub App:

- Idempotent webhook handling
- No duplicate comments
- Draft PR ignored
- Rate limits handled
- Kill switch works
- Max 1 comment per PR

Performance:

- Small PR < 30s
- Medium PR < 90s
- Large PR < 3 min
- Timeout rate < 10%

Observability:

- Structured logs
- Decision + coverage logged
- Error monitoring active

---

## SECTION 5 — PRODUCT BEHAVIOR (REQUIRED)

- Comment tone neutral
- Does not block merge
- Silent on trivial PRs
- No repeated identical comments
- Feels intentional, not spammy

If it would annoy you on your own repo → not ready.

---

## SECTION 6 — REAL WORLD VALIDATION (REQUIRED)

7-day unchanged run:

- Installed on ≥ 5 repos
- Different sizes
- No threshold tuning
- No uninstall wave
- No spam complaints
- ≥ 1 meaningful discussion triggered

---

## SECTION 7 — UNATTENDED CONFIDENCE TEST (MANDATORY)

This is the final lock.

Answer honestly:

- I would install this on a client's production repo
- I would leave it running for 30 days
- I would not monitor it daily
- I would not fear reputational damage from its comments

If any answer is "no" → you are not done.

Fix that reason only.

Nothing else.

---

## FINAL STOP RULE

When all REQUIRED sections AND the Unattended Confidence Test pass:

Engine is frozen.
No new layers.
No scoring rewrites.
No convergence expansion.
No architecture upgrades.

Only respond to reality.

This is the version that actually ends the loop.

You don't need more checklist iterations after this.
