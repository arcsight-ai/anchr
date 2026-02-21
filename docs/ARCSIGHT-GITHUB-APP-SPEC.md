# GitHub App: ArcSight (Post-Launch Spec)

Build this in v1.1. Do not block launch on it. Launch with workflow-based install.

---

## Purpose

Provide merge-time structural decision as a required GitHub Check **without** a workflow file in the user's repo. User installs App → enables repo → requires "ArcSight" in branch protection. No YAML.

---

## Permissions

**Repository permissions:**

| Permission   | Level | Reason                |
|-------------|-------|------------------------|
| Contents    | Read  | Clone / read diff      |
| Pull requests | Write | Optional comment       |
| Checks      | Write | Create/update Check Run |
| Metadata    | Read  | Default                |

No: Issues. Secrets. Admin. Minimal.

---

## Events

Subscribe to:

- `pull_request` (opened, synchronize, reopened, ready_for_review)
- `pull_request_target` (optional)

---

## Flow

1. PR opened or synchronized.
2. Fetch PR diff (base vs head).
3. Clone repo at head SHA (or use API contents).
4. Run structural audit (same logic as CLI: discover packages, build graph, detect violations, minimal cut).
5. Create or update Check Run:
   - **Name:** ArcSight
   - **Status:** completed
   - **Conclusion:** success (VERIFIED) or failure (BLOCKED / REVIEW_REQUIRED)
   - **Output:** summary, violating edges, minimal cut, clear explanation

---

## Determinism rule

The App must:

- Never depend on external APIs for the verdict.
- Never use randomness.
- Never use time-based logic in the decision.

Same commit SHA + same repo state → same result.

---

## Required check setup (user)

1. Install App on org or repo.
2. Grant repository access.
3. **Settings → Branches → Branch protection → Require status checks → Add "ArcSight".**

No workflow file required.

---

## Infra constraint

**Stateless.** All state derived from repo contents and PR diff. No database required.

---

## Recommendation

Launch with workflow-based install. Build this App in v1.1.
