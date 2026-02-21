# ANCHR Launch Control v3 — Evidence Locked Mode

This file determines GO / DELAY. No messaging edits. No product ideas. No narrative persuasion. If evidence incomplete → automatic DELAY.

---

## 1. Locked Definitions (Immutable)

| Term | Definition |
|------|------------|
| **True Positive (TP)** | ANCHR BLOCK + Human BLOCK |
| **False Positive (FP)** | ANCHR BLOCK + Human ALLOW |
| **False Negative (FN)** | ANCHR ALLOW + Human BLOCK |
| **True Negative (TN)** | ANCHR ALLOW + Human ALLOW |

**WARN rule (locked):** WARN blocks merge → treat as BLOCK for all metrics. (If WARN does not block merge, change to: treat as ALLOW.)

**Catastrophic FN:** (a) Missed cycle. (b) Missed layer violation. (c) Missed critical edge.

**Deterministic:** Identical decision, identical minimal cut, identical impacted node set across repeated runs on same (repo, base, head).

**Precision** = TP / (TP + FP)  
**Recall** = TP / (TP + FN)

Definitions cannot change later.

---

## 2. Human Ground Truth (Blind First)

Fill this table **before** viewing ANCHR output. No retroactive edits. No blank cells. No "maybe". If <20 PRs → DELAY.

| Repo | PR ID | Scenario | Human Verdict (BLOCK / ALLOW) | Severity (Low / Medium / High / Critical) | Structural rationale |
|------|-------|----------|-------------------------------|-------------------------------------------|----------------------|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

**Count:** _____ (must be ≥ 20)

---

## 3. ANCHR Evaluation Table

No empty fields. Root cause (if FN) must be one of: Graph construction | Cut computation | Rule threshold | Unsupported scenario | Parser issue | Other (explicit).

| PR ID | ANCHR Verdict | Minimal Cut Correct? (Y/N) | TP / FP / FN / TN | Catastrophic? (Y/N) | Root Cause (if FN) |
|-------|---------------|----------------------------|-------------------|---------------------|---------------------|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

---

## 4. Metrics Auto-Summary (Derived Only)

**From tables above, compute. No rounding up.**

| Metric | Value |
|--------|--------|
| Total TP | |
| Total FP | |
| Total FN | |
| Total TN | |
| Precision % | TP / (TP + FP) × 100 |
| Recall % | TP / (TP + FN) × 100 |
| Catastrophic FN count | |

**Gates:**
- Catastrophic FN > 0 → **DELAY**
- Precision < 70% → **DELAY**
- Recall < 70% → **DELAY**

---

## 5. Determinism Test

| PR size | Repo | PR ID | Run 1 decision | Run 2 decision | Run 3 decision | Decision identical? (Y/N) | Minimal cut identical? (Y/N) | Node set identical? (Y/N) |
|---------|------|-------|-----------------|-----------------|-----------------|----------------------------|------------------------------|---------------------------|
| Small | | | | | | | | |
| Small | | | | | | | | |
| Small | | | | | | | | |
| Medium | | | | | | | | |
| Medium | | | | | | | | |
| Large | | | | | | | | |

**Requirement:** 3 small, 2 medium, 1 large PR; each run 3×. Any "N" above → **DELAY**.

---

## 6. Performance Envelope

| Metric | Value |
|--------|--------|
| Avg latency (small repo) | _____ ms |
| Avg latency (medium repo) | _____ ms |
| Avg latency (large repo) | _____ ms |
| Worst latency observed | _____ ms |
| CI runtime delta estimate | _____ s added per PR |

**Threshold (explicit):** Small < 30s, medium < 90s, large < 180s. CI delta < 60s per PR. If any exceeded → **DELAY**.

---

## 7. Demo Lock (Binary)

| Check | TRUE / FALSE |
|-------|--------------|
| Demo repo created | |
| 1 cycle PR | |
| 1 layer violation PR | |
| 1 neutral PR | |
| Copy-ready PR comment block | |
| Screenshot captured | |
| Install tested end-to-end | |

If any FALSE → **DELAY**.

---

## 8. Security Lock (Binary)

| Item | Documented (Y/N) |
|------|------------------|
| App scopes | |
| Data read | |
| Data stored | |
| External calls | |
| Override path | |
| Failure behavior | |

If unclear or incomplete → **DELAY**.

**Documentation location:** _________________________________

---

## 9. Hostile Review Test

| # | Objection | Severity (1–5) | Mitigation exists? (Y/N) |
|---|-----------|----------------|--------------------------|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
| 6 | | | |
| 7 | | | |
| 8 | | | |
| 9 | | | |
| 10 | | | |

If Severity ≥ 4 and Mitigation = N → **DELAY**.

---

## 10. Binary Launch Gate

GO only if **all** are true:

| # | Condition | Met? (Y/N) |
|---|-----------|------------|
| 1 | ≥ 20 PRs validated (table 2 count ≥ 20) | |
| 2 | Precision ≥ 70% | |
| 3 | Recall ≥ 70% | |
| 4 | 0 catastrophic FN | |
| 5 | Determinism PASS (all Y in section 5) | |
| 6 | Demo PASS (all TRUE in section 7) | |
| 7 | Security PASS (all documented in section 8) | |
| 8 | No fatal hostile objections (no Severity ≥4 with N in section 9) | |

---

## LAUNCH DECISION

**LAUNCH DECISION:** GO / DELAY

**Reason:** (max 5 lines, factual only)

---

Launch authority bound to evidence.
