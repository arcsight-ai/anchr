# Demo harness normalization — single repo, no nested git

## Step 1 — Nested git check

From repo root: find . -name ".git" -type d

If labs/demo-structure/.git exists: rm -rf labs/demo-structure/.git. Do not delete any other files.

Result: NESTED_GIT_PRESENT was NO. No removal needed.

## Step 2 — Single repo root

From root: git status. Confirm you are in main anchr repo; demo files (labs/) appear as normal tracked or untracked files. No nested repo warnings.

## Step 3 — BASE_SHA / HEAD_SHA usage

Do not fake BASE_SHA/HEAD_SHA. Use real commit SHAs from git log.

Baseline: Commit clean demo structure on main. Run ANCHR with BASE_SHA and HEAD_SHA both pointing at that commit (or main). No manual override with arbitrary SHAs.

Cycle test: On main, git checkout -b demo-cycle. Introduce cycle in labs/demo-structure. Commit. Run ANCHR with BASE_SHA = main branch commit, HEAD_SHA = demo-cycle commit. Use real SHAs from git log.

## Step 4 — Engine purity

From repo root: git diff main --name-status

If any engine files (src/, scripts/anchr-structural-audit.ts, etc.) modified: revert them. Keep demo + docs only.

## Step 5 — Execution context

Run ANCHR from repo root, not from inside labs/demo-structure.

Current engine discovers packages only at repo root under "packages/". So repo root must be the tree that contains packages/core, packages/api, packages/app. That implies either:

- Use a separate clone whose root is the demo layout (packages at root). Run ANCHR from that clone root. Real branches, real SHAs. No nested git inside anchr. Or
- Run from anchr root only when demo is the only packages/ tree (e.g. temporary symlink or copy at root); not recommended.

Do not cd into labs/demo-structure and run ANCHR from there as if it were repo root. Do not create nested .git in labs/demo-structure.

## Step 6 — Artifact policy

All outputs go to docs/demo-artifacts/. Never inside labs/demo-structure. Never inside engine folders. If rerunning: append timestamp to filename; never overwrite.

## Step 7 — Structural sanity (after normalization run)

NESTED_GIT_PRESENT: NO
NESTED_GIT_REMOVED: N/A (none found; no nested .git in labs/demo-structure)
ENGINE_FILES_MODIFIED: NO
BASELINE_COMMIT_VALID: (fill after first baseline commit on main or in demo clone)
CYCLE_BRANCH_VALID: (fill after demo-cycle branch and run)
ANCHR_RUN_FROM_ROOT: YES (run from repo root of the repo that contains packages at root)

If all YES except NESTED_GIT_PRESENT then safe.
