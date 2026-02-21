# Reproducibility instructions

Another engineer must be able to reproduce identical results.

Do not create nested git inside labs/demo-structure. One repo. Real branches. Real SHAs. Run ANCHR from repo root.

## Prerequisites

- Node >= 20
- Git
- ANCHR repo at <ANCHR_ROOT>. Replace <ANCHR_ROOT> with absolute path.

## Execution context

Current engine discovers packages only at repo root under "packages/". So either:

Option A — Separate demo clone: Clone or copy labs/demo-structure into a dedicated repo whose root contains packages/core, packages/api, packages/app. That repo has no nested git inside ANCHR. Run all commands from that clone root. BASE_SHA and HEAD_SHA are real commits from git log in that clone.

Option B — Main repo with demo on main: Commit labs/demo-structure on main. Create branches demo-cycle, demo-layer-violation, demo-neutral from main. Run ANCHR from anchr root. Note: engine only looks at <repo_root>/packages; if anchr has no top-level packages/ then use Option A.

## Baseline (no manual SHA override)

Commit clean demo structure (if using main repo: ensure demo is under a path the engine can use, or use Option A). Record baseline commit: BASELINE_SHA=$(git rev-parse HEAD) from the repo you run in. Do not hardcode arbitrary SHAs.

From repo root (of the repo that has packages at root):

BASE_SHA=BASELINE_SHA HEAD_SHA=BASELINE_SHA ANCHR_REPORT_PATH=<ANCHR_ROOT>/docs/demo-artifacts/baseline.json npx tsx <ANCHR_ROOT>/scripts/anchr-structural-audit.ts

Expected: decision allow or equivalent; minimal cut empty; violation_count 0.

## demo-cycle branch (real commits)

From repo root: git checkout main && git checkout -b demo-cycle. Introduce cycle: in packages/core/src/utils.ts add import from @demo/api. Commit. Get real SHAs: MAIN_SHA=$(git rev-parse main) CYCLE_SHA=$(git rev-parse HEAD).

Run 3 times. Do not overwrite.

Run 1: BASE_SHA=MAIN_SHA HEAD_SHA=CYCLE_SHA ANCHR_REPORT_PATH=<ANCHR_ROOT>/docs/demo-artifacts/demo-cycle-run1.json npx tsx <ANCHR_ROOT>/scripts/anchr-structural-audit.ts

Run 2: same with demo-cycle-run2.json
Run 3: same with demo-cycle-run3.json

Compute SHA256 of each output; append to docs/demo-artifacts/demo-cycle-summary.md. All three hashes must match for determinism PASS. Expected: decision block; minimal cut non-empty.

## demo-layer-violation branch

git checkout main && git checkout -b demo-layer-violation. In packages/app/src/App.tsx add import from @demo/core. Commit. Run ANCHR once. If engine does not enforce layer rules, mark UNSUPPORTED in docs/demo-artifacts/demo-layer-summary.md.

## demo-neutral branch

git checkout main && git checkout -b demo-neutral. Rename packages/core/src/utils.ts to helpers.ts; update imports. No new imports. Commit. Run ANCHR once. ANCHR_REPORT_PATH=<ANCHR_ROOT>/docs/demo-artifacts/demo-neutral.json. Expected: decision allow; minimal cut empty.

## Expected SHA256 hashes

After first successful run, record SHA256 of baseline.json and demo-cycle-run1.json here so another engineer can verify.

baseline.json:

demo-cycle-run1.json:

demo-cycle-run2.json:

demo-cycle-run3.json:

(All three demo-cycle hashes must match.)

## Performance check

Record average and worst latency. If small PR > 30s or medium > 90s or large > 180s then PERFORMANCE FAIL.

## If artifact already exists

Create versioned copy. Never overwrite. Example: baseline-20260219.json.
