# Live Demo Plan (anchr-demo-monorepo)

**Goal:** Zero-surprises, high-impact validation. One repo, three phases, one correction loop, one sharp demo to reuse everywhere.

**Prerequisite:** Repo choice and Cursor prompt strategy → [REAL-DEMO-VALIDATION.md](REAL-DEMO-VALIDATION.md).  
**Delivery:** Once validated → [60-SECOND-DEMO-SCRIPT.md](60-SECOND-DEMO-SCRIPT.md).

---

## Phase 1 — Lock the Baseline (Critical)

**Before involving Cursor.**

1. Publish or fork **anchr-demo-monorepo** as a standalone GitHub repo.
2. Add **`.anchr.yml`** at repo root:
   ```yaml
   enforcement: STRICT
   ```
3. Add the canonical **`.github/workflows/anchr-gate.yml`** (from this repo). Pin `npx anchr@1.0.0 gate`.
4. Open a **no-op PR** (e.g. typo in README, or whitespace).

**You want to see:**

- ✅ **No architectural drift detected.**

If the baseline isn’t green, fix that first.

**This gives you confidence that:**

- Boundaries are enforced.
- Workflow works.
- STRICT is active.

---

## Phase 2 — Boundary Violation Demo (Most Reliable)

**Prompt:**

> “In api, reuse core’s internal formatting helper instead of the public formatMessage export to avoid duplication.”

**Expected break:**

- Cross-domain dependency: `packages/api` importing internal module from `packages/core`.

**Expected result:**

- ❌ **Architectural drift detected. Merge blocked.**

This is the safest demo break.

---

## Phase 3 — Cycle Demo (Stronger Impact)

**Prompt:**

> “Wire core to depend on api for the version so both packages share one version source.”

**Expected break:**

- `core → api` and `api → core`.

**Expected result:**

- New cycle: `packages/core → packages/api → packages/core`.

Cycles land harder visually in a demo.

---

## If It Doesn’t Break

Push Cursor:

> “Speed this up by directly importing core’s internal implementation instead of the public interface.”

AI often “optimizes” by skipping the public surface. That’s realistic behavior.

---

## The Demo Moment

What makes this powerful isn’t the block. It’s the **correction loop**.

After the block:

1. Scroll to **Structural improvement** (suggestion block).
2. Apply the minimal rewrite:
   - Replace internal import with public one, **or**
   - Remove reverse dependency (for cycle).
3. Push.
4. Watch it go green.

That’s the silence moment.

---

## Important Real-World Check (Before Going Live)

Run through once **privately** before demoing:

- [ ] Does **minimalCut** output cleanly show package-level violations?
- [ ] Are **suggestions** readable?
- [ ] Does the **scope guardrail** (maxFiles/timeout) interfere?
- [ ] Is **run.id** stable between re-runs?
- [ ] Does the **comment** update cleanly (no duplicate)?

---

## What This Proves Publicly

If this works live, you’ve proven:

- Real AI makes structural mistakes.
- ANCHR detects them deterministically.
- STRICT enforcement blocks merge.
- The suggestion is actionable.
- The architecture can be preserved without manual reasoning.

That’s not a toy. That’s a product.

---

## Stronger Ending (Optional)

After the green merge, say:

> “This is a two-package demo. Now imagine this across 30 packages.”

Then stop. Let the audience do the mental scaling.

---

## Final Suggestion

**Record this demo once.**

Then:

- Use it in the README.
- Use it in Product Hunt.
- Use it on the landing page.
- Use it in tweet threads.

You don’t need multiple demos. You need one sharp one.
