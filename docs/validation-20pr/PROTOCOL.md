# ANCHR — 20 PR blind validation (scrutiny-resistant)

Purpose: Defensible structural validation under frozen engine with audit traceability and bias control.

Validation conclusions apply only to the tested repos and PR distribution; external generalization requires additional sampling.

## Non-negotiables

- Engine frozen (tagged) before validation.
- No code changes during validation.
- Human labels completed before running ANCHR.
- No relabeling after seeing ANCHR output.
- No overwriting artifacts.
- Real SHAs only.
- PR selection must not be curated to favor ANCHR.
- If something breaks during validation — log it. Do not fix mid-run. Signal over polished demo.

---

## STRUCTURAL_SCOPE_LOCK

Human labeling must consider ONLY:

- New dependency edges introduced
- Removed dependency edges
- Cycles (direct or transitive)
- Layer boundary violations
- Cross-package structural shifts

Explicitly OUT OF SCOPE:

- Refactors that preserve graph structure
- Performance changes
- Naming changes
- Business logic correctness
- Test failures
- Build failures unrelated to structure

If a PR has no graph delta then default Human_Decision = ALLOW.

This prevents human overreach, soft blocking for non-structural reasons, and retrospective reinterpretation.

---

## SEVERITY_RULES

Low: Local structural issue, limited blast radius.

Medium: Cross-package impact or multi-node minimal cut.

High: Cycle or violation that corrupts structural guarantees or spreads transitively.

Catastrophic = High AND silently mergeable without detection.

---

## Step 0 — Freeze engine state

From repo root: git tag validation-freeze-20pr

Record Tag SHA, Date, Node version, CLI version. Save to docs/validation-20pr/engine-freeze.md. All runs must match this SHA.

---

## Step 1 — PR selection (anti-cherry-picking)

Use Option A or B. Document in docs/validation-20pr/pr-selection-method.md. List PR_ID, Repo, BASE_SHA, HEAD_SHA, Size (S/M/L), Cross-package? (Y/N). Exactly 20 PRs.

Option A: Last 30 PRs chronologically; exclude merge commits, pure dep bumps, docs-only; take first 20 remaining.

Option B: Randomize list; take first 20.

---

## Step 2 — Human blind labeling (structural only)

Before running ANCHR. For each PR inspect diff. Label only: cycles introduced? layer violations? critical dependency regression? graph-level structural instability? Ignore business logic, tests, style, performance, refactors without graph impact.

Create docs/validation-20pr/human-ground-truth.csv. Columns: PR_ID, Human_Decision (ALLOW/BLOCK), Severity (Low/Medium/High), Catastrophic (Y/N), One-line structural rationale. Exactly 20 rows. No blanks. No edits after ANCHR run. Optional: wait 12–24h before running ANCHR.

Catastrophic = would silently introduce structural corruption in production.

---

## Step 3 — Run ANCHR (no interpretation until complete)

For each PR run with BASE_SHA, HEAD_SHA from repo root using frozen tag commit. Save raw JSON to docs/validation-20pr/results/<PR_ID>.json. Do not inspect results mid-run. Complete all 20 first.

---

## Step 4 — Classification (mechanical only)

Create docs/validation-20pr/evaluation-table.csv. Columns: PR_ID, Human, ANCHR, TP_FP_FN_TN, Catastrophic_FN, Latency_ms.

TP = Human BLOCK & ANCHR BLOCK. TN = Human ALLOW & ANCHR ALLOW. FP = Human ALLOW & ANCHR BLOCK. FN = Human BLOCK & ANCHR ALLOW. Catastrophic FN = Human Catastrophic=Y AND FN. No interpretation. Pure rule mapping.

---

## Step 5 — Metrics

Compute TP, FP, FN, TN. Precision = TP / (TP + FP). Recall = TP / (TP + FN). Do not round up. Two decimal precision. Create docs/validation-20pr/metrics-summary.md. Include Precision, Recall, Catastrophic FN, average and worst latency. Optional: confusion matrix.

---

## Step 6 — Binary launch gate

If Catastrophic FN > 0 then DELAY. If Precision < 0.70 then DELAY. If Recall < 0.70 then DELAY. Else PROVISIONAL GO. Create docs/validation-20pr/validation-decision.md. Format: LAUNCH_DECISION, Precision, Recall, Catastrophic_FN, Engine_SHA, Reason (max 5 lines). No narrative. No optimism.

---

## Step 7 — Result integrity hash (tamper-evident)

After all 20 runs and evaluation-table.csv: generate a single SHA256 over (in deterministic order):

- All 20 result JSONs (docs/validation-20pr/results/<PR_ID>.json)
- human-ground-truth.csv
- evaluation-table.csv

Save to docs/validation-20pr/result-bundle-hash.txt. Format:

RESULT_BUNDLE_SHA256:
ENGINE_SHA:
DATE:

Any change to results or labels invalidates the bundle hash.

---

## Step 8 — Audit confirmation

Confirm: engine SHA matches freeze tag; no engine files changed; all 20 JSON artifacts present; no human labels modified post-run; result-bundle-hash.txt generated. Append to docs/validation-20pr/audit-confirmation.md.

---

## Optional — inter-rater check

Pick 5 PRs. Second human labels them. Compare agreement rate. If >80% agreement then strong. If low then structural criteria need refinement.
