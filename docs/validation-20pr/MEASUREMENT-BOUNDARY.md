# Measurement boundary — strict order

You are at the measurement boundary. Do not contaminate it.

## Strict order

### 1. Blind label first (if not already done)

- Open **human-ground-truth.csv**.
- For each of the 20 PRs: look **only** at the diff.
- Apply STRUCTURAL_SCOPE_LOCK (PROTOCOL.md).
- Apply SEVERITY_RULES (PROTOCOL.md).
- Mark: **Human_Decision** (ALLOW/BLOCK), **Severity**, **Catastrophic** (Y/N), **One-line structural rationale**.
- **Do not look at ANCHR output while labeling.**
- When done: **do not edit it again.** That file is frozen ground truth.

### 2. Fill evaluation-table.csv (mechanical only)

- Now you may look at ANCHR JSONs.
- For each PR: Human, ANCHR, TP/FP/FN/TN, Catastrophic_FN, Latency_ms.
- No interpretation. No commentary. Just classification.
- Or run: `npx tsx scripts/validation-20pr-metrics.ts` (reads human-ground-truth + JSONs, writes evaluation-table and metrics).

### 3. Compute raw metrics

- From the table: TP, FP, FN, TN.
- Precision = TP / (TP + FP). Recall = TP / (TP + FN).
- Catastrophic_FN count. Worst latency. Average latency.
- Two decimal places. **No rounding up.**

## Important

- Do not analyze while filling.
- Do not rationalize FNs mid-way.
- Do not adjust labels because something “feels unfair.”
- This phase is about signal purity.

## When you bring the numbers

Bring exactly:

- TP, FP, FN, TN
- Precision, Recall
- Catastrophic_FN count
- Worst latency, Average latency
- Run failure rate note: 5/20 initial → replaced; final sample size 20

Then we analyze: FNs clustered? Conservative or permissive? Catastrophic risk? Wedge sharp?
