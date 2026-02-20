# Wedge / Anchr boundaries and FN adjudication

**Summary:** Replay identity lives in anchr. Evaluation identity is the structural input + emission. FN adjudication must use artifacts from the anchr run, not replay labels in wedge.

- **Anchr produces adjudication artifacts; wedge consumes them.**
- **FN adjudication is artifact-based: input.json + emission.json.**

---

## Three layers

| Layer | Role | Owns |
|-------|------|------|
| **1. Wedge** | Pure evaluation engine. Stateless. | Structural input → v10 (or current) emission JSON. No replay labels. |
| **2. Anchr** | Projection + replay harness. | 20-repo manifest, replay pipeline, case identifiers (e.g. ky_751), execution context. |
| **3. Ledger / other repos** | Out of scope for FN adjudication here. | — |

Wedge does not look up replay cases. Anchr owns replay state. That separation is intentional.

---

## Where FN adjudication belongs

If an FN was observed in an anchr run (e.g. 20-PR validation), adjudication must be anchored to:

- The **emission** produced during that run, and/or  
- The **structural input** that was used in that run.

So:

- You do **not** re-run wedge by identifier (e.g. “re-run wedge on ky_751”). Wedge does not know `ky_751`.
- You **do** either:
  - **A)** Use the exact emission JSON from anchr’s replay for that case, or  
  - **B)** Use the exact structural input (repo + base_sha + head_sha, and optionally the derived graph/diff) and feed that into wedge for deterministic verification.

FN classification (true FN vs out-of-scope vs borderline) must be based on structural facts, invariant surface, and the emitted report — not on replay identifiers.

---

## Artifact-based workflow

1. **In anchr:** For the FN case (e.g. `sindresorhus_ky_751`), export:
   - The **structural input** used in that run → `<pr_id>.input.json`
   - The **emission** from that run → `<pr_id>.emission.json`
2. **Adjudication:** Use those artifacts (and optionally re-run wedge on the same input) with the invariant registry. No identifier lookup; no cross-repo guessing.

Artifacts live under `docs/validation-20pr/adjudication/` and are produced by the `validation-20pr-export-fn-artifact` script.

---

## Reproduce wedge run from input

Given `<pr_id>.input.json` with `repo`, `base_sha`, `head_sha`:

- Clone `repo`, checkout `head_sha`, run anchr audit with `--base base_sha --head head_sha` from that directory.  
- The emission from that run is the deterministic wedge output for that structural input.
