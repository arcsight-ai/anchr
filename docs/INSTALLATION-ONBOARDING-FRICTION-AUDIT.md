# ANCHR — Installation & Onboarding Friction Audit

**Objective:** Determine whether a new repository can install ANCHR and get value in under 5 minutes.

**Scope:** Audit install flow only. No new features.

---

## 1. Fresh Repo Simulation

**Finding:** There is **no documented path** for a brand-new **customer** repository to “install ANCHR” and get GitHub Check Runs on PRs without manual wiring.

| Scenario | What exists | Gap |
|----------|-------------|-----|
| **New repo + “install ANCHR GitHub App”** | Messaging canon and 7-day plan refer to “GitHub App or CI workflow.” There is **no** in-repo GitHub App definition (e.g. `.github/app.yml` or separate app repo) or doc that says “install this app from the Marketplace.” | Unclear what “Install ANCHR GitHub App” means in practice (which app, which repo). |
| **New repo + add workflow** | `.github/workflows/anchr.yml` runs `npx -y tsx@4 scripts/anchr-structural-audit.ts` and other **local scripts**. It assumes the workflow runs in a repo that **contains the ANCHR source** (scripts/, package.json, etc.). | A new empty repo cannot run this workflow as-is; it has no `scripts/` or ANCHR code. |
| **New repo + npm install @arcsight-ai/anchr** | README says “In your repo: npx @arcsight-ai/anchr@1 gate” (local). That implies `npm install -D @arcsight-ai/anchr` (or global install) and then run from the repo. **No** workflow file is documented that uses `npx @arcsight-ai/anchr@1 gate` in CI and then creates a Check Run. | Local path is clear; CI path for a repo that only adds a workflow + anchr as dependency is **not** documented. |

**Conclusion:** Fresh-repo simulation cannot reach “first meaningful check result” without defining how the customer repo gets the workflow and the runner (e.g. “copy this workflow that uses npx @arcsight-ai/anchr@1” + publish check). Today, the only self-contained flow is **this repo (ANCHR)** running its own workflow on its own PRs.

---

## 2. First Run Experience (When Workflow Exists)

For a repo that **has** the ANCHR workflow and ANCHR source (e.g. the ANCHR repo itself):

| Criterion | Assessment |
|-----------|------------|
| **Does the check run?** | **Yes.** Workflow triggers on `pull_request_target` (opened, synchronize, reopened, ready_for_review); draft PRs skipped. Steps: checkout, fetch head, setup Node, run structural audit + decision + fix-suggestions, publish status, then create/update Check Run. |
| **Is output understandable without prior knowledge?** | **Yes.** Check Run uses conclusion (success/failure) and summary (reason from policy). CLI/output format is structured (ANCHR — MERGE BLOCKED / VERIFIED, cause, minimal cut). No prerequisite docs required to interpret pass/fail. |
| **Are errors actionable?** | **Mostly.** On BLOCK, minimal cut and cause are shown; fix guidance is “Expose via public API OR move logic.” On missing report, workflow publishes neutral status / retry conclusion; no cryptic stack traces in the check summary. |

---

## 3. Required Configuration Audit

| Question | Answer |
|----------|--------|
| **Is any config file required?** | **No.** No `.anchr` or `anchr.json` (or similar) is required. Engine uses repo layout (e.g. `packages/`), refs (base/head), and env for CI. |
| **If no config file, is absence handled gracefully?** | N/A. |
| **If no config file, is error messaging clear?** | N/A. |
| **Zero-config works?** | **Local:** Yes. `npx @arcsight-ai/anchr@1 gate` with no env uses git merge-base; no config file. **CI:** Workflow expects env from GitHub Actions; these are provided by the workflow. No user-supplied config file. |

**CI env:** Steps pass `GITHUB_BASE_SHA`, `HEAD_SHA`, `ANCHR_REPORT_PATH`, etc. If `set-pr-status` runs without `GITHUB_TOKEN`/`GITHUB_REPOSITORY`/`GITHUB_HEAD_SHA`, it logs “Skipping status publish (not GitHub env)” and exits 0. So absence of GitHub env is handled gracefully (no crash).

---

## 4. Time to First Value

| Measure | Current state |
|---------|----------------|
| **Minutes from install → first meaningful check result** | **Not measurable for a new customer repo** — no documented “install” that results in a check. For the **ANCHR repo itself**: install = clone + npm ci; first value = open a PR and wait for workflow (~2–5 min). So **~5–10 min** including clone/setup if we count “developer clones ANCHR, opens PR on ANCHR.” |
| **Steps required** | **Local:** (1) In repo, run `npx @arcsight-ai/anchr@1 gate`. Optional: `npm install -D @arcsight-ai/anchr` then `npx anchr gate`. **CI:** Add workflow with `npx @arcsight-ai/anchr@1 gate`; require ANCHR check. |
| **Manual wiring needed** | **For customer repo:** Add one workflow file with `npx @arcsight-ai/anchr@1 gate`; require ANCHR in branch protection. Documented. **For ANCHR repo:** No manual wiring; workflow is in repo. |

---

## 5. Failure Modes

| Failure mode | Behavior | Actionable? |
|--------------|----------|-------------|
| **App/workflow lacks permissions** | Workflow requests `contents: read`, `pull-requests: write`, `checks: write`. If permissions are reduced or missing, Check Run POST/PATCH or status POST can fail. Steps use `|| true` / `continue-on-error: true`, so workflow job may still succeed while check/comment do not appear. | **Partially.** User sees workflow green but no ANCHR check; they must infer permissions. No explicit “ArcSight needs checks: write” message in UI. |
| **Repo is private** | `secrets.GITHUB_TOKEN` has permissions in private repos; workflow and Check Run work the same. | No special handling needed. |
| **Workflow YAML missing** | If the repo has no workflow that runs ANCHR and creates a check, no check runs. No “install” to speak of. | User must add a workflow; no error message. |
| **No report produced** | If `artifacts/anchr-report.json` is missing (e.g. audit step failed), “Read report and policy” sets action=retry; conclusion=failure; status publish uses “No ANCHR report found — publishing neutral status” and runs set-pr-status anyway. Check Run still created/updated with failure. | Acceptable; user sees a failing check and can re-run or inspect logs. |

---

## 6. Install Surface Evaluation

| Question | Answer |
|----------|--------|
| **Can a non-architect install this?** | **Local:** Yes — “npx @arcsight-ai/anchr@1 gate” is one command; README is short. **CI on a new repo:** No — no documented “add this workflow” that works for an arbitrary repo without ANCHR source. |
| **Is README clear?** | **Yes** for local: Get Started (3 min), one command, optional env, what to expect (VERIFIED/WARN/BLOCK), trust line. **No** for GitHub/CI: README does not say how to get Check Runs on PRs in another repo (no workflow snippet, no “copy this file,” no GitHub App link). |
| **Any step that feels fragile?** | **Yes.** (1) The production workflow assumes it runs inside a repo that contains ANCHR scripts (not “npm install -D @arcsight-ai/anchr” + one workflow file). (2) If a customer copies the workflow into their repo, it will fail unless they also have the scripts and package. (3) No single “install and block” path is documented for a greenfield repo. |

---

## 7. Report Summary

### Steps required (current state)

**Path A — Local only (documented)**  
1. In the repo, run `npx @arcsight-ai/anchr@1 gate` (or install with `npm install -D @arcsight-ai/anchr` and run `npx anchr gate`).  
2. Interpret VERIFIED / WARN / BLOCK from stdout.  
No config file. No steps for “GitHub Check on every PR.”

**Path B — CI in ANCHR repo (actual)**  
1. Clone ANCHR (or have it as the repo).  
2. Ensure default branch has `.github/workflows/anchr.yml`.  
3. Open a PR.  
4. Workflow runs; Check Run “ArcSight” appears.  
No config file. Not applicable to a random new repo.

**Path C — CI in another repo (not documented)**  
1. Add a workflow that runs ANCHR (e.g. `npx @arcsight-ai/anchr@1 gate` + require ANCHR check in branch protection).  
2. Ensure permissions include `checks: write`.  
3. Open a PR.  
Steps are not documented; would require custom workflow authoring.

### Total minutes to first value

- **Local:** &lt; 5 minutes (one command after Node is available).  
- **CI (this repo):** ~5–10 minutes (clone/setup + open PR + run).  
- **CI (new customer repo):** Not defined — no documented install.

### Friction rating (1–10; 10 = seamless)

- **Local:** **8** — Clear README, one command, optional env, deterministic message.  
- **CI (new repo):** **2** — No documented “add to your repo” flow; workflow is self-referential.

### Top 3 friction points

1. **No documented “add to your repo” CI path.** A new repository cannot get “install ANCHR and get a check on every PR” from the README or a single workflow file. The only CI flow that works out of the box is the ANCHR repo’s own workflow.  
2. **Workflow uses scoped package.** Copy-paste workflow runs `npx @arcsight-ai/anchr@1 gate`; no in-repo ANCHR source required. Works in any repo.  
3. **“GitHub App” is referenced but not defined.** Canon says “Runs as GitHub App or CI workflow.” There is no link or instruction for which GitHub App to install or how it would run ANCHR for a customer repo.

### Is ANCHR “install-and-block” ready?

**No**, for a **new repository** that wants GitHub Check Runs on PRs.

- **Installs without manual wiring:** **No** — For CI on a new repo, there is no documented install; manual wiring (custom workflow and runner) is required.  
- **Runs on first PR:** **Yes**, only when the workflow and ANCHR runner already exist (e.g. in ANCHR repo).  
- **No confusing configuration errors:** **Yes** — No config file; missing env is handled (skip publish).  
- **Clear README:** **Yes** for local; **no** for CI/customer install.  
- **Feels production-ready:** **Yes** for the repo that already has the workflow and code; **no** for “any repo can add ANCHR in 5 minutes.”

---

## Definition of Done Checklist

| Criterion | Status |
|-----------|--------|
| Installs without manual wiring | **No** — Customer repo has no documented zero-wiring CI install. |
| Runs on first PR | **Yes** — When workflow and runner exist (e.g. ANCHR repo). |
| No confusing configuration errors | **Yes** — No required config file; env absence handled. |
| Clear README | **Partial** — Clear for local; CI/customer install not documented. |
| Feels production-ready | **Partial** — Production-ready for self-repo; not for arbitrary new repo. |

---

**Conclusion:** The installation and onboarding audit shows that **local** use is low-friction and README-clear. **CI / GitHub Check** use on a **new repository** is not documented and depends on workflow design that assumes in-repo ANCHR source. To be “install-and-block” ready for new repos, ANCHR would need a documented path (e.g. “add this workflow file” that uses `npx @arcsight-ai/anchr@1` or a reusable workflow, plus how to create the Check Run) and, if applicable, a defined GitHub App install flow. No new features were added in this audit; findings are documentation and install-path only.
