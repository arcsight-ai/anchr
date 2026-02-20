# PHASE 1A — FORCED VIOLATION DISCRIMINATION TEST (INSTITUTION-GRADE PROTOCOL)

**Goal:** Prove ANCHR has a functioning structural detection boundary. Binary outcome. No scaling allowed.

---

## SECTION 0 — ENVIRONMENT LOCK

Run:

```bash
npx tsx scripts/phase1/run-single.ts --lock
```

Record: engine_version, rules_hash, config_hash, seed. All baseline and post runs must use identical values. **If mismatch → stop.**

---

## SECTION 1 — BASELINE VALIDATION

Select 1 MEDIUM or LARGE PR. Confirm:

- Decision = ALLOW
- Coverage = 100%
- minimalCut = 0
- Violation trace absent
- Re-run produces byte-identical JSON

**If not → stop.** Save: `artifacts/phase1a/baseline-<repo_slug>-<pr>.json`

---

## SECTION 2 — INVARIANT DECLARATION

Declare explicitly: Invariant, Rule ID, Rule file, Detection mechanism, Expected decision (WARN/BLOCK), Expected minimalCut > 0 (Y/N). **If cannot map to rule → stop.**

---

## SECTION 3 — REACHABILITY CHECK

Confirm: Rule applies to this repo; rule not disabled; module exists; code path reachable. **If not → choose another PR.**

---

## SECTION 4 — SINGLE VIOLATION INJECTION

Inject exactly one structural violation. Constraints: Minimal diff, no syntax errors, no unrelated edits, commit locally, **record commit SHA.**

---

## SECTION 5 — CONTROL REPLAY

Re-run baseline (no `--use-current-head`). Must match saved baseline JSON byte-for-byte. **If not → log BASELINE_DRIFT → stop.**

---

## SECTION 6 — POST-VIOLATION EXECUTION

Run:

```bash
npx tsx scripts/phase1/run-single.ts --repo X --pr N --use-current-head
```

Save: `artifacts/phase1a/post-violation-<repo_slug>-<pr>.json`

---

## SECTION 7 — RULE EXECUTION ASSERTION

Confirm:

- Violated Rule ID appears in evaluation trace (`rule_evaluation_trace` in output)
- Rule was evaluated (not skipped)
- Rule not filtered upstream

**If not true → ENGINE_ROUTING_FAILURE → Exit 1.**

Pass expected rule ID to the differential script so it can assert:

```bash
PHASE1A_EXPECTED_RULE_ID=<rule_id> npx tsx scripts/phase1/phase1a-differential.ts artifacts/phase1a/baseline-<repo_slug>-<pr>.json artifacts/phase1a/post-violation-<repo_slug>-<pr>.json
```

Or as third argument: `phase1a-differential.ts baseline.json post.json <rule_id>`

If the engine does not emit `rule_evaluation_trace`, the assertion is skipped (no routing failure inferred from absent trace).

---

## SECTION 8 — DIFFERENTIAL (FACTS ONLY)

Run:

```bash
npx tsx scripts/phase1/phase1a-differential.ts baseline.json post-violation.json [expected_rule_id]
```

Output exactly:

- Decision changed? (Y/N)
- Coverage delta (number)
- minimalCut delta (number)
- Violation trace present? (Y/N)
- Primary cause populated? (Y/N)
- Detection strength (minimalCut size) — numeric
- Detection strength (calibration) — weak (1) / medium (2–3) / strong (>3); internal calibration only
- If expected rule set: Rule in evaluation trace? (Y/N)

Then exactly one of: **CASE_A** | **CASE_B** | **CASE_C** | **ENGINE_ROUTING_FAILURE**

**Exit codes:** Exit 0 → CASE_B only. Exit 1 → all others. No prose allowed.

---

## SECTION 9 — INTERPRETATION MATRIX

**CASE_A** — ALLOW, 100% coverage, minimalCut = 0, no violation trace. → Engine blindness. Redesign detection logic. **Exit 1.**

**CASE_B** — WARN/BLOCK, minimalCut > 0, violation trace present. → Engine discriminates. Proceed to Phase 1B Dataset Sensitivity. **Exit 0.**

**CASE_C** — Coverage changed, minimalCut > 0, decision still ALLOW. → Threshold misconfiguration. Adjust mapping only. **Exit 1.**

**ENGINE_ROUTING_FAILURE** — Rule never evaluated (not in trace). → Inspect matcher pipeline. **Exit 1.**

No other interpretations permitted.

---

## SECTION 10 — ROLLBACK NEGATIVE CONTROL

Revert violation commit. Re-run baseline. Must match original baseline exactly. **If mismatch → ROLLBACK_MISMATCH → stop.**

---

## FINAL PRINCIPLE

A structural reasoning engine must: pass valid structure; fail invalid structure; be deterministic under both; **execute the violated rule.**

If it cannot fail under forced violation, it does not reason architecturally. **Scaling forbidden until CASE_B.**

---

## Summary

- Determinism enforcement (baseline + control replay + rollback)
- Routing enforcement (rule execution assertion)
- Boundary discrimination test (differential + matrix)
- Binary exit discipline (0 = CASE_B only)
- Rollback control (negative control)
- Explicit escalation path (Section 9)
- Signal strength metric (detection strength, calibration only)

This is a falsification harness. Run it. Then report which case fires — that determines whether to redesign logic or move to dataset sensitivity.
