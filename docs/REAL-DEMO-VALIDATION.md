# Real Demo Validation

**Goal:** Prove ANCHR on a real repo with a real AI-generated structural change. No synthetic patch, no staged break, no fake cycle. Real AI change → detect drift → block (STRICT) → surface minimal cut + suggestion → apply correction → green check.

That’s the difference between “Nice demo” and “Holy shit, this actually works.”

---

## Step 1 — Pick the Right Repo

**Avoid:**

- React boilerplate / single-purpose app
- Huge monorepo (e.g. 10k files)
- Random personal project with no boundaries
- Single-package or flat-file repos
- Framework core repos

**Want:**

- Clear package boundaries
- Layout like `packages/*` or `src/domains/*`
- Internal vs public surfaces
- Not enormous

**Good candidates:**

- Small open-source monorepo (e.g. tRPC example, Remix example, Turborepo example)
- Real internal project with multiple packages
- Next.js + shared lib setup

### One recommended repo: **anchr-demo-monorepo**

In this repo, the folder **`anchr-demo-monorepo`** is a ready-made candidate:

- **Layout:** `packages/core/src`, `packages/api/src` — ANCHR’s `packages/<name>/src` contract.
- **Boundaries:** `core` has a public surface (`index.ts`, `format.ts`) and an internal one (`internal.ts`). `api` is allowed to depend only on `core`’s public surface. No `api` → `core` internal, no `core` → `api` (cycle).
- **Size:** Two packages, small file count. Easy to fork, install ANCHR, and run the demo.

Use it as a **standalone repo**: copy or clone that folder into its own Git repo (e.g. `arcsight-ai/anchr-demo-monorepo`) so ANCHR runs against that monorepo’s root. Then follow Step 2–5 below.

**Guaranteed live plan (zero surprises):** [LIVE-DEMO-PLAN.md](LIVE-DEMO-PLAN.md) — Phase 1 baseline → Phase 2 boundary violation → Phase 3 cycle → correction loop → pre-flight checklist.

---

## Step 2 — Install ANCHR in That Repo

1. Add **`.anchr.yml`** at repo root:
   ```yaml
   enforcement: STRICT
   ```
2. Add workflow: copy **`.github/workflows/anchr-gate.yml`** from this repo (or the minimal gate workflow from the README).
3. Pin to **`npx anchr@1.0.0 gate`** in the workflow.
4. Push to `main`. Confirm **green baseline** (no drift on current state).

No fumbling on stage.

---

## Step 3 — Let Cursor Break It

Prompt Cursor (or Copilot) to do a **broad refactor**. Do not guide it structurally. Let it optimize locally. That’s realistic.

**Example prompts that often cause drift:**

- “Extract shared utility directly from package X into package Y and wire it quickly.”
- “Refactor auth logic to reuse core’s internal validation helpers.”
- “Move this feature into the web package and reuse internal core implementation.”

These often produce:

- Cross-domain internal imports  
- Cycles  
- Public API erosion  

**For a specific repo or structure,** the exact prompt can be tuned to maximize the chance of structural drift while staying realistic (e.g. one prompt per repo layout).

---

## Step 4 — Open PR and Watch ANCHR

**Case A — BLOCKED (ideal)**  
Cycle or cross-domain import detected. Comment shows minimal cut + suggested correction. That’s the moment.

**Case B — INDETERMINATE**  
Proof missing; STRICT still fails. Comment explains. Acceptable.

**Case C — VERIFIED**  
Either boundaries aren’t strict enough, or the change didn’t actually break structure. Escalate (Step 5).

---

## Step 5 — If It Passes, Push Harder

Ask Cursor:

> “Speed this up by directly importing the internal implementation instead of the public interface.”

That almost always breaks boundaries.

---

## Why This Matters

You built: graph, cut, determinism, enforcement, repair surfacing.  
This validates: real AI refactors cause real drift → real drift is detected → real minimal cut is useful.

If that works live on a real repo, that’s your product.

---

## Recommended Plan

1. Pick **one** public monorepo that fits the criteria above.
2. **Fork** it.
3. **Install ANCHR** (Step 2). Confirm green baseline.
4. **Let Cursor do a big refactor** (Step 3). Open PR.
5. **Capture screen.** Ship the clip.

---

## Cursor Prompts for anchr-demo-monorepo

Use these in the **api** or **core** package so Cursor produces a real structural break (internal import or cycle). Do not guide it structurally.

**To trigger a boundary violation (api → core internal):**

- “Refactor the api package to reuse core’s internal helper for formatting instead of the public formatMessage.”
- “In api, use the same formatting logic as core by importing from core’s internal implementation so we don’t duplicate code.”

**To trigger a cycle (core → api):**

- “Have core use the api package’s version string so we have a single source of truth for version.”
- “Wire core to depend on api for the version; refactor so api and core share one version export.”

**If the first refactor still passes (VERIFIED):**

- “Speed this up by directly importing core’s internal implementation in api instead of the public interface.”

---

## Cursor Prompt for Another Repo

If you use a different repo or your own structure, share it and the exact Cursor prompt can be designed to maximize drift while staying realistic. Same for the “push harder” follow-up.

---

**Delivery:** Once the real demo is validated, use [60-SECOND-DEMO-SCRIPT.md](60-SECOND-DEMO-SCRIPT.md) to run it on stage or record it.
