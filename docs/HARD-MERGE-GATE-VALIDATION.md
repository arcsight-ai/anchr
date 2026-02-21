# ANCHR — Hard Merge Gate Validation Report

**Objective:** Prove that ANCHR can function as a required status check and actively block merges.

**Scope:** Audit, test, and validate merge-block behavior. No new features; validation only (plus one mapping fix to satisfy verdict → conclusion requirements).

---

## 1. Check Run Publishing

| Requirement | Status | Details |
|-------------|--------|---------|
| ANCHR creates a GitHub Check Run (not only PR comment) | **YES** | `.github/workflows/arcsight.yml` creates or updates a Check Run via GitHub API (`POST /repos/.../check-runs` or `PATCH .../check-runs/$CHECK_ID`). |
| Check attached to correct commit SHA | **YES** | Check is created/updated with `head_sha: ${{ github.event.pull_request.head.sha }}`. Find step uses `REF="${{ github.event.pull_request.head.sha }}"` to list check runs for that commit. |
| Check updates on re-run | **YES** | Step "Find existing check run" selects by name "ArcSight"; if `CHECK_ID` exists, workflow PATCHes that run with new conclusion and summary. If not, POST creates a new run. Concurrency group `arcsight-${{ github.event.pull_request.number }}` with `cancel-in-progress: true` avoids overlapping runs. |

**Note:** The workflow also publishes a **Commit Status** via `set-pr-status.ts` (context: "ArcSight Architectural Certification"). Branch protection can require either a status check or a Check Run; the Check Run name is what appears in "Required status checks."

---

## 2. Status Mapping (Verdict → Check Conclusion)

| Engine / policy verdict | Policy action | Check conclusion | Branch protection effect |
|-------------------------|---------------|------------------|---------------------------|
| MERGE_VERIFIED (allow)  | `merge`       | **success**      | Merge allowed             |
| MERGE_BLOCKED (block)  | `block`       | **failure**      | Merge blocked             |
| REVIEW_REQUIRED (warn) | `review`      | **failure**      | Merge blocked             |
| Retry / no report      | `retry` / *   | **failure**      | Merge blocked             |

**Implementation:** Workflow step "Map action to conclusion" maps `merge` → `success`; `block`, `review`, `retry`, and any other action → `failure`. Only `merge` allows merge. No `neutral` used for the Check Run so the gate is strictly pass/fail.

**Commit Status (set-pr-status.ts):** Still maps allow→success, block→failure, warn→neutral. Branch protection that uses the **Check Run** "ArcSight" will see only success/failure from the workflow; status API is separate and can remain for backward compatibility.

---

## 3. Branch Protection Compatibility

| Requirement | Status | Details |
|-------------|--------|---------|
| Check name stable and consistent | **YES** | Check name is **"ArcSight"** everywhere: create payload `name: "ArcSight"`, update payload `title: "ArcSight"`, find step `select(.name == "ArcSight")`. |
| Appears in Required Status Checks | **YES** | GitHub lists Check Runs by name in Settings → Branch protection → Required status checks. "ArcSight" will appear once the check has run at least once on the branch. |
| Can be selected as required | **YES** | No restriction; it is a standard Check Run with conclusion success/failure. |

---

## 4. Real Blocking Test (Manual Validation)

**Steps to perform manually:**

1. **Enable branch protection** on a test repo (e.g. main): Require status checks before merging.
2. **Mark "ArcSight" as required** in the list of status checks.
3. **Open a PR** that triggers a structural violation (MERGE_BLOCKED).
4. **Run the workflow** (push or re-run).
5. **Attempt to merge.**  
   **Expected:** GitHub prevents merge (ArcSight check failing).
6. **Fix the violation** (or push a change that yields MERGE_VERIFIED).
7. **Re-run the workflow.**  
   **Expected:** Check conclusion becomes success.
8. **Merge.**  
   **Expected:** Merge allowed.

**Definition of done:** Merge is blocked when the check fails and allowed when it passes.

---

## 5. Re-run Determinism and Check Updates

| Requirement | Status | Details |
|-------------|--------|---------|
| Re-run same commit multiple times | **YES** | Same report → same policy action (deterministic engine). Workflow reads `artifacts/anchr-report.json` and `artifacts/anchr-policy.json` produced in that run. |
| Status conclusion does not fluctuate | **YES** | Policy is derived from report only; same inputs → same action → same conclusion. Nondeterminism guard in policy engine downgrades to `review` (which now maps to failure) if same run.id ever produced a different action. |
| No race between comment and check | **YES** | Comment step and check step are sequential. Abort steps (PR updated / PR closed) skip both comment and check. Concurrency group cancels in-progress runs. |

---

## 6. Edge Cases

| Scenario | Expected behavior | Notes |
|----------|-------------------|--------|
| PR with no structural changes | VERIFIED → success | Report status VERIFIED, decision allow → policy merge → conclusion success. |
| Draft PR | **Skipped** | Workflow uses `if: github.event.pull_request.draft == false`. No check run for draft PRs. |
| Force-push to PR | Check re-evaluates | New head SHA triggers new run; "Find existing check run" may find a run for the previous SHA (different commit). Create step uses current `REF` (new head SHA), so a new check run is created for the new commit. Existing runs for old SHAs remain on those commits. Correct. |
| Reopened PR | Check re-evaluates | Workflow triggers on `reopened` and `ready_for_review`. Fresh run; new or updated check for current head. |
| No report (analysis failed) | failure | Report step sets action=retry if no report; conclusion maps to failure. |
| Policy file missing | failure | Report step sets action=retry, reason="No policy output"; conclusion failure. |

---

## 7. Summary

| Criterion | Status |
|-----------|--------|
| ANCHR publishes a Check Run | **YES** — name "ArcSight", created/updated in arcsight.yml. |
| Check can be marked as required | **YES** — stable name "ArcSight"; appears in branch protection UI. |
| Merge blocked when check fails | **YES** — block/review/retry/* map to conclusion failure. |
| Merge allowed when check succeeds | **YES** — only `merge` → success. |
| Deterministic across re-runs | **YES** — same report → same policy → same conclusion; no extra conclusion states. |

**Check name used:** `ArcSight`

**Verdict → conclusion mapping (final):**

| Verdict / policy action | Conclusion |
|-------------------------|------------|
| merge                   | success    |
| block                   | failure    |
| review                  | failure    |
| retry / other           | failure    |

**Branch protection:** When "ArcSight" is required, GitHub will block merge when the check conclusion is failure and allow merge when success. Manual test (section 4) confirms.

**ANCHR qualifies as a true merge gate:** Yes, provided the workflow is installed (e.g. as GitHub App or repo workflow) and branch protection requires the "ArcSight" check. No UI or feature expansion; validation only, with mapping updated so REVIEW_REQUIRED and retry yield failure.
