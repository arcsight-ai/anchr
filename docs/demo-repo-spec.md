# ANCHR Demo Repo — Exact File Graph & PR Spec

Controlled structural scenarios for determinism, demo lock, and evaluation table. Proof > polish.

---

## 1. Repo Layout

```
demo-anchr/
├── package.json          # workspace root
├── packages/
│   ├── core/             # Layer 0 — no deps on api or app
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── utils.ts
│   │       └── types.ts
│   ├── api/              # Layer 1 — may import core only
│   │   ├── package.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── client.ts
│   │       └── handlers.ts
│   └── app/              # Layer 2 — may import api and core
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── App.tsx
│           └── components/
│               └── Header.tsx
└── tsconfig.json
```

**Layer rule:** core ← api ← app. No cycle. No app → core direct. No api → app.

---

## 2. Clean Baseline State (main)

**File graph (who imports whom):**

| File | Imports |
|------|--------|
| `packages/core/src/index.ts` | ./utils, ./types |
| `packages/core/src/utils.ts` | ./types |
| `packages/core/src/types.ts` | (none) |
| `packages/api/src/index.ts` | ./client, ./handlers |
| `packages/api/src/client.ts` | @demo/core (or ../core) |
| `packages/api/src/handlers.ts` | @demo/core |
| `packages/app/src/index.ts` | ./App |
| `packages/app/src/App.tsx` | @demo/api, ./components/Header |
| `packages/app/src/components/Header.tsx` | (none or app-local) |

**No cycles. No layer violations.** Expected ANCHR: ALLOW, minimal cut [], violation_count 0.

---

## 3. PR #1 — Direct Cycle (core ↔ api)

**Intent:** Introduce a cycle between core and api so ANCHR must BLOCK.

**Change:**

- In `packages/core/src/utils.ts`: add `import { getClient } from '@demo/api';` (or relative to api).
- In `packages/api/src/client.ts`: already imports core; no change needed for cycle.

**Resulting cycle:** core/utils → api (e.g. client) → core (utils or types). Two edges in cycle.

**Expected ANCHR:**

- Decision: **BLOCK**
- violation_count: ≥ 1
- Minimal cut: contains the cycle edges (e.g. core/utils ↔ api/client or equivalent)
- Impacted nodes: packages/core/src/utils.ts, packages/api/src/client.ts (or the two nodes that close the cycle)

**Capture for Launch Control v3:** Decision, minimal cut, impacted nodes. Use for determinism (run 3×), demo lock (1 cycle PR ✓), evaluation table (Human BLOCK, ANCHR BLOCK → TP if minimal cut correct).

---

## 4. PR #2 — Layer Violation (app → core bypass)

**Intent:** app imports core directly, bypassing api. Layer rule: app may import api and core; in many setups “app → core” is allowed but “app → core” while “api → core” can create confusion or we define “app must not import core” for demo. **Pick one rule and stick to it.**

**Option A — Strict:** app may import api only; app must not import core.  
**Option B — Common:** app may import api and core; api may import core only. Then “layer violation” = core importing api (reverse).  

For a clear **layer violation** demo, use **Option A**: app must not import core.

**Change:**

- In `packages/app/src/App.tsx`: add `import { something } from '@demo/core';` (direct app → core).

**Expected ANCHR (if engine has layer rules):**

- Decision: **BLOCK** or **WARN**
- Minimal cut: edge(s) from app to core
- Impacted nodes: packages/app/src/App.tsx, packages/core/src/*

**If ANCHR does not yet enforce layers:** This PR may ALLOW. Then document as “Unsupported scenario” in evaluation table until layer rules exist. Still create the PR for future use and for “Minimal cut correct? N/A (layer not implemented).”

**Capture:** Decision, minimal cut, impacted nodes. Demo lock: 1 layer violation PR (TRUE when engine supports it or explicitly N/A).

---

## 5. PR #3 — Neutral Refactor (rename / move safe)

**Intent:** No new edges, no cycles, no layer breaks. Rename or move files without changing the graph shape.

**Change:**

- Rename `packages/core/src/utils.ts` → `packages/core/src/helpers.ts`. Update internal imports (core/index.ts, etc.) to use `./helpers`.
- Or move `packages/api/src/handlers.ts` → `packages/api/src/http/handlers.ts` and fix imports.

**Resulting graph:** Same set of edges (same deps between packages and files). No new cycles, no new layer violations.

**Expected ANCHR:**

- Decision: **ALLOW**
- violation_count: 0
- Minimal cut: []

**Capture:** Decision, minimal cut, impacted nodes. Demo lock: 1 neutral PR ✓. Evaluation: Human ALLOW, ANCHR ALLOW → TN.

---

## 6. What to Run and Capture

| PR | Branch | Run ANCHR (3× for determinism) | Record |
|----|--------|--------------------------------|--------|
| Baseline (main) | main | 1× or 3× | Decision ALLOW, minimal cut [], nodes — |
| PR #1 cycle | e.g. `pr1-cycle-core-api` | 3× | Decision, minimal cut, impacted nodes; 3× identical → determinism PASS for this PR |
| PR #2 layer | e.g. `pr2-layer-app-core` | 3× | Same. If engine has no layer rules, still record and mark “Unsupported” |
| PR #3 neutral | e.g. `pr3-neutral-refactor` | 3× | Same |

**Outputs to populate:**

- **Determinism tests:** For PR #1, #2, #3 (and 3 more from other repos if needed to hit 3 small + 2 medium + 1 large), table: Decision identical? Minimal cut identical? Node set identical?
- **Demo lock:** Demo repo created ✓, 1 cycle PR ✓, 1 layer violation PR ✓ (or N/A), 1 neutral PR ✓, copy-ready comment block ✓, screenshot ✓, install E2E ✓.
- **Evaluation table:** Each of the 3 PRs is one row: Human Verdict (BLOCK for #1, BLOCK for #2 if layer supported, ALLOW for #3), ANCHR Verdict, TP/FP/FN/TN, Catastrophic?, Root Cause if FN.
- **Screenshots:** One per PR (comment + minimal cut in UI or log).

---

## 7. Canonical BLOCK Comment Template (Copy-Ready)

Use this shape for PR #1 (cycle). Replace repo-specific paths with your actual nodes.

```
ANCHR · BLOCK

Structural risk: minimal cut indicates dependency cycle.

Decision: BLOCK
violation_count: 1

Minimal cut:
  - root:packages/core/src/utils.ts:circular_import
  - root:packages/api/src/client.ts:circular_import

Impacted nodes: packages/core/src/utils.ts, packages/api/src/client.ts
Critical edges: core/utils.ts → api/client.ts, api/client.ts → core/utils.ts (cycle)

Explanation: Cycle detected between core and api. Resolve cycle or request review override.
```

---

## 8. 20 PR Validation Mix (Optimal)

| Source | Count | Description |
|-------|--------|-------------|
| Demo repo (controlled) | 5 | Baseline + PR #1, #2, #3 + 2 more (e.g. second cycle variant, or second neutral). |
| One other repo (e.g. ky) | 5 | Small, known structure. Blind label first. |
| Medium complexity | 5 | e.g. trpc or similar. Mixed PRs. Blind label first. |
| Real-world (if possible) | 5 | From validation repos (swr, axios, pino, etc.). Blind label first. |

**Order:** Fill Human Ground Truth table (20 rows) before viewing ANCHR output. Then run ANCHR, fill Evaluation table, compute metrics. Let the math speak.

---

## 9. Determinism Pass (6 PRs × 3 runs)

| Size | Source | PR | Run 1 | Run 2 | Run 3 | Identical? |
|------|--------|-----|-------|-------|-------|------------|
| Small | demo | Baseline or #3 | | | | Y/N |
| Small | demo | #1 cycle | | | | Y/N |
| Small | demo | #2 layer | | | | Y/N |
| Medium | other | e.g. ky #632 | | | | Y/N |
| Medium | other | e.g. ky #779 | | | | Y/N |
| Large | other | e.g. trpc PR | | | | Y/N |

Log latency each run. If any output differs → engine tuning. If all identical → confidence up.

---

**Next steps:** Create `demo-anchr` repo from section 1–2, implement PR #1–#3 branches, run ANCHR, capture into Launch Control v3. No messaging refinement until validation is done.
