# CURSOR PROMPT — BLIND LABEL PHASE

We are in BLIND LABEL phase.

Rules (non-negotiable):

- Do NOT read any files under docs/validation-20pr/results/
- Do NOT open any ANCHR JSON
- Do NOT run metrics
- Do NOT modify any script
- Only help me inspect diffs

---

## Task

We will go PR by PR.

For each PR in:

docs/validation-20pr/human-ground-truth.csv

Do the following:

1. Checkout the PR base/head diff.
2. Show only the structural diff.
3. Highlight:
   - New dependency edges
   - Removed edges
   - Cycles (direct or transitive)
   - Layer violations
   - Cross-package structural shifts
4. Do NOT suggest a decision.
5. Do NOT classify.
6. Do NOT mention ANCHR.

I will decide:

Human_Decision  
Severity  
Catastrophic  
One-line rationale  

After I give the label, update only that row in human-ground-truth.csv.

Then move to the next PR.

---

We proceed sequentially.  
One PR at a time.  
No batching.

Start with the first PR_ID in human-ground-truth.csv.

---

After all 20 are filled, switch to the MEASUREMENT phase prompt (run metrics script, print numbers).
