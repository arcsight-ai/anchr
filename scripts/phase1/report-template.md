# Phase 1 — Internal Report (Step 11)

Do not adjust engine until this report is complete.

---

## Summary

| Field | Value |
|-------|--------|
| Repos tested | |
| Total PRs | |
| Block % | |
| Warn % | |
| Allow % | |
| High confidence % | |
| Medium confidence % | |
| Low confidence % | |
| Precision (with CI) | |
| Weak recall proxy | |

---

## Distribution by complexity

| Bucket | Avg coverageRatio |
|--------|-------------------|
| SMALL | |
| MEDIUM | |
| LARGE | |

---

## Weak recall

- Subset (lines>300 / cross-dir / public API): N
- Flagged (warn/block): N
- %: N
- Interpretation: under-sensitive | reasonable | over-sensitive

---

## Observed patterns

(Describe: Does signal scale with diff size? Does coverage increase with complexity? Mostly silent on small PRs?)

---

## Failure patterns

(Describe: False positives, missed risks, calibration issues.)

---

## Interpretation (Step 12)

- [ ] Signal correlates with diff complexity
- [ ] Precision ≥ 70%
- [ ] Silence mostly on trivial PRs  
→ **The brain works.**

- [ ] No correlation with complexity
- [ ] Random decision distribution
- [ ] Precision < 60%  
→ **Core wedge logic review required.**
