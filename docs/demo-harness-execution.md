# ANCHR Demo Harness — Execution Checklist

Evidence-locked. No engine changes. No overwrites. Versioned copies if re-run.

## Strict rules

- Do NOT modify ANCHR engine logic, thresholds, or messaging.
- Do NOT refactor unrelated files.
- Only add isolated demo + artifact infrastructure.
- If any step unclear then stop and document assumption.
- If any artifact already exists then create versioned copy (never overwrite).

Reproducible by another engineer with zero context.

---

## Step 1 — Isolated demo harness

Created: labs/demo-structure/packages/core/src, packages/api/src, packages/app/src. Minimal package.json and tsconfig.json. Layer contract in labs/demo-structure/README.md: core <- api <- app. Does not affect engine build.

---

## Step 2 — Clean baseline state

From labs/demo-structure (as git repo): run ANCHR with BASE_SHA=main HEAD_SHA=main. Capture docs/demo-artifacts/baseline.json. Capture exact CLI command, ANCHR commit, Node version, timestamp, target path in docs/demo-artifacts/run-metadata.md. Store raw output. No summarising.

---

## Step 3 — Branch demo-cycle

Branch: demo-cycle. Introduce direct cycle: core imports api; api already imports core. No other changes. Run ANCHR 3 times. Save as demo-cycle-run1.json, demo-cycle-run2.json, demo-cycle-run3.json. Do not overwrite. Compute SHA256 of each; append to docs/demo-artifacts/demo-cycle-summary.md. Summary must include: Decision identical? Minimal cut identical? Impacted nodes identical? Output hash identical? Latency per run. Determinism PASS only if ALL identical. Any mismatch then FAIL.

---

## Step 4 — Branch demo-layer-violation

Branch: demo-layer-violation. Introduce app importing directly from core. Run ANCHR once. If layer rules supported then expect BLOCK or WARN. If unsupported then explicitly mark UNSUPPORTED in docs/demo-artifacts/demo-layer-summary.md. Do not silently treat unsupported as pass.

---

## Step 5 — Branch demo-neutral

Branch: demo-neutral. Safe refactor: rename or move file; no new imports. Expected: Decision ALLOW; minimal cut empty. Capture docs/demo-artifacts/demo-neutral.json.

---

## Step 6 — Canonical BLOCK comment

From demo-cycle-run1.json generate docs/demo-artifacts/canonical-block-comment.md. Include exactly: Decision, violation_count, minimal cut edges, impacted nodes, one-line structural explanation. No marketing. No paraphrasing. Exact structural representation.

---

## Step 7 — Determinism matrix

Create docs/demo-artifacts/determinism-matrix.md. Columns: PR, Run, Decision, Cut Identical, Nodes Identical, Hash Identical, Latency. Mark PASS only if 100% identical across all 3 runs per PR.

---

## Step 8 — Performance check

Record average and worst latency. If small PR > 30s or medium > 90s or large > 180s then mark PERFORMANCE FAIL.

---

## Step 9 — Launch Control v3 seed

Populate Launch Control v3 with: Baseline, demo-cycle, demo-neutral, layer-violation scenario. Fill TP/FP/FN, Catastrophic FN check, Determinism result, Demo lock partial TRUE. Do NOT finalise launch gate.

---

## Step 10 — Reproducibility doc

Created: docs/demo-artifacts/repro-instructions.md. Exact CLI commands, Node version, branch names, expected decisions, expected SHA256 hashes. Another engineer must reproduce identical results.

---

## Final output format (when complete)

FILES CREATED:
- labs/demo-structure/package.json, tsconfig.json, README.md
- labs/demo-structure/packages/core/package.json, src/types.ts, utils.ts, index.ts
- labs/demo-structure/packages/api/package.json, src/client.ts, handlers.ts, index.ts
- labs/demo-structure/packages/app/package.json, src/index.ts, App.tsx, components/Header.tsx
- docs/demo-artifacts/run-metadata.md, demo-cycle-summary.md, demo-layer-summary.md, determinism-matrix.md, canonical-block-comment.md, repro-instructions.md, README.md
- docs/demo-harness-execution.md (this file)
- (After run: baseline.json, demo-cycle-run1.json, demo-cycle-run2.json, demo-cycle-run3.json, demo-neutral.json)

BRANCHES CREATED:
- In labs/demo-structure after git init: main (baseline), demo-cycle, demo-layer-violation, demo-neutral

DETERMINISM:
PASS or FAIL

PERFORMANCE:
PASS or FAIL

LAYER RULE SUPPORT:
SUPPORTED or UNSUPPORTED

DEVIATIONS:
(list only if any)

No narrative. No marketing. No optimism. Facts only.
