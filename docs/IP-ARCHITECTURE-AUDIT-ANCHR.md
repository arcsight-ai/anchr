# IP & Architecture Audit — ANCHR (single repo)

Audit framework v3: Technical structure, layering correctness, commercial leverage, ownership clarity.  
**Scope:** This repo only. Repeat for other repos (e.g. wedge) separately.

---

## SECTION 1 — Identity & Precision

### 1️⃣ Core Purpose (one sentence)

**ANCHR is the merge-time structural gate: it builds the dependency graph from a PR, computes minimal cut for structural risk, and posts one decision per PR (VERIFIED or BLOCKED) with evidence on the PR.**

*(Canon: README, TEAM-BRIEF-POSITIONING-AND-GOALS.md, anchr-messaging-canon.md.)*

### 2️⃣ Problem Type (one only)

**Integrity/verification** — with structural modelling as the mechanism.  
ANCHR verifies that a PR does not introduce boundary violations or cycles; it does so by modelling the dependency graph and public surface. Primary classification: integrity/verification at merge time.

### 3️⃣ Layer Position

- **Core engine (graph + structural + report):** **Layer 0** — Raw deterministic engine. Graph build, public-surface propagation, SCC-based cycle detection, minimal-cut violation set, deterministic report (run.id, status, proofs). No heuristics, no timestamps, stable sorts and hashes.
- **Parsing/schema:** **Layer 1** — TypeScript/TSX import/reexport parsing, specifier resolution, canonical paths.
- **Orchestration:** **Layer 3** — CLI, GitHub adapter, PR comment lifecycle, convergence, repair suggestions.
- **UI/reporting:** **Layer 4** — Comment rendering, formatters, share output.

**Verdict:** The repo contains a **Layer 0 core** (graph + structural + deterministic report) with Layer 1 parsing and Layer 3/4 orchestration/UI on top. The Layer 0 core is the leverage.

---

## SECTION 2 — Determinism & Depth

### 4️⃣ Determinism Level

**Fully deterministic logic** for the core path.  
- Same repo snapshot + refs → same graph, same violations, same run.id, same report.  
- Explicit: `stableStringify`, `sortStrings`, `sha256` for analysisId/runId, canonical ordering of paths/violations, causal proof contract (no BLOCKED without proof).  
- No timestamps or randomness in verdict (per README and code).  
- Runtime-signals and optional heuristics exist in adjacent code paths but do not break the core structural verdict determinism.

### 5️⃣ Depth of Original Thinking

**Clean engineering with a clear, productised architecture.**  
- **Novel packaging:** Public surface derived from entry (`index.ts`/`index.tsx`) + reexports; `internal/`, `private/`, `impl/` excluded; frozen resolver for diff-only resolution.  
- **Causal proof contract:** BLOCKED only when every violation has a proof; otherwise INDETERMINATE.  
- **Deterministic identity:** run.id = f(baseSha, headSha, graphHash, violationsHash).  
- **Algorithm choice:** Tarjan SCC for cycles (standard); the value is the full pipeline and the contract, not a new algorithm.  
**Verdict:** Not commodity; not “genuinely novel algorithm.” Novel architecture and product contract.

### 6️⃣ Rebuild Difficulty (honest)

- **Graph + public surface + violations + cycle detection + deterministic report:** 2–3 months for a strong engineer.  
- **Full product:** CLI, GitHub App/CI, PR comment lifecycle, reconciliation, repair suggestions, convergence, pressure, formatters, demos, website: **6+ months**.  
Core is rebuildable in months; the integrated product and discipline (determinism, proof contract, run.id) are the real barrier.

---

## SECTION 3 — Portability & Separation

### 7️⃣ Surface-Agnostic?

**Some contextual assumptions.**  
- Assumes layout: `packages/<name>/src`; TypeScript/TSX; entry via `index.ts`/`index.tsx`.  
- Explicitly out-of-scope for other layouts (returns VERIFIED by contract).  
- No firm-specific naming or Schillings use-case; generalised for “TypeScript monorepos with this layout.”

### 8️⃣ Coupling Risk

- **Firm naming:** “arcsight” appears in comment markers (`<!-- arcsight:run:... -->`), artifact filenames (`arcsight-convergence.json`, `arcsight-pressure.json`), and script names (`arcsight-pr-comment.ts`). Renameable; no dependency on a separate “wedge” package in this repo.  
- **Firm data models:** Report schema and violation/proof types are owned here; no import from external firm schemas.  
- **Infrastructure:** GitHub API (Octokit); generic.  
- **Internal workflows:** Scripts reference `WEDGE_ROOT` for copying adjudication artifacts into another repo; ANCHR remains the source of truth for replay/export.

### 9️⃣ Repo Purity

**Single repo; multiple concerns.**  
- Contains: core (graph, structural, parse, resolve, determinism), audit pipeline, decision/lifecycle/comment/reconciliation, repair, convergence, pressure, CLI, scripts, demos (anchr-demo-monorepo, anchr-demo-world), labs, website, simulations.  
- **Verdict:** One product repo. Core is isolatable conceptually (graph/, structural/, parse/, resolve/, determinism/); the rest is enhancer/orchestration/UI. Not fragmented across repos; some “optional” layers could be modularised later.

---

## SECTION 4 — Redundancy & Drift

### 🔟 Overlap Type

**Internal only.**  
- No other repos in this workspace to compare.  
- Within repo: determinism/, graph/, structural/ are the single core; multiple formatters and comment versions (v1, v2, v5, production) exist for evolution, not conceptual duplication.  
- **Verdict:** None / minimal. No branding or conceptual duplication across repos.

### 1️⃣1️⃣ Could This Be a Module Instead?

**No.** This is a **standalone product** (merge-time structural gate). It could be consumed as a library (“run audit, get report”), but it is not a module inside another engine; it is the engine for this product.  
Wedge (if present elsewhere) consumes ANCHR outputs (e.g. adjudication artifacts); ANCHR does not live inside wedge.

---

## SECTION 5 — Strategic Leverage

### 1️⃣2️⃣ Commercial Differentiation

For teams with TypeScript monorepos and boundary discipline: **“We need this.”**  
- One decision per PR, deterministic, evidence (minimal cut) on the PR.  
- Clear category: merge-time structural gate, not linter, not “analyze and interpret.”  
- Niche but defensible; long-term relevance for adoption and possible licensing if the core stays clean.

### 1️⃣3️⃣ Institutional Dependency Score

**If you removed ANCHR tomorrow:**  
- The “merge-time structural gate” product disappears.  
- No other component in this repo provides the graph → cut → decide pipeline.  
**Verdict:** **Firm capability collapses** for this product. Foundational within this repo.

### 1️⃣4️⃣ Influence vs Ownership Value

Owning the core (graph + structural + report) matters: it defines the contract (run.id, proofs, VERIFIED/BLOCKED). Controlling its evolution (what counts as public surface, what counts as a violation) is the main leverage. **Ownership and control align** for the core.

---

## SECTION 6 — Legal & Ownership Risk

### 1️⃣5️⃣ Origin

*Assess externally.*  
- Codebase is in arcsight-ai/anchr; built for this product.  
- No indication in code of “during paid engagement for third party” or “using firm systems” in a way that would blur ownership; details depend on employment/contract context.

### 1️⃣6️⃣ Employment Risk Exposure

*Assess externally.*  
- Core is productised, open (MIT), and documented as “structural gate for TypeScript monorepos.”  
- “arcsight” naming is brand/organisation; does not by itself imply “in course of employment” without context.  
- **Verdict:** Context-dependent; recommend explicit classification with legal/HR where relevant.

---

## SECTION 7 — Elimination Test

| If you deleted… | Verdict |
|-----------------|--------|
| **graph/, structural/ (core), determinism/ (report hashing), parse/, resolve/** | **Never** — architecture collapses. |
| **audit/, run.ts (run.id)** | **Never** — no pipeline. |
| **comment/, decision/, lifecycle/, reconciliation/** | **Possibly consolidate** — needed for product but could be simplified. |
| **repair/, convergence/, pressure/, direction/, advisor/** | **Possibly consolidate** — enhancers; valuable but not the single core. |
| **website/, demos, labs, simulations/** | **Possibly consolidate** — adoption and proof; not the engine. |
| **Scripts (copy-adjudication, validation, replay, etc.)** | **Possibly consolidate** — ops and validation; not core. |

**Ruthless test:** You would **never** delete the core (graph + structural + deterministic report + audit pipeline). Everything else justifiable only as enhancer, UI, or ops.

---

## SECTION 8 — Final Strategic Classification

**ANCHR repo: A) Core Engine (Protect aggressively)**

- The **core** is the single deterministic engine: graph build, public surface, violations, cycles (SCC), minimal cut, deterministic report.  
- One sentence: **“Dependency graph builder plus public-surface resolver and SCC-based cycle detection that produces a minimal-cut violation set and a deterministic report (run.id, status, proofs).”**  
- Rest is Layer 3/4 (orchestration, UI, formatters, repair, convergence).  
- Recommendation: **Protect the core.** Keep contracts (run.id, proof, no timestamps) frozen; evolve only in versioned, backward-considered ways. Optional: extract core into a minimal “anchr-core” package for reuse/licensing while keeping the rest as the product layer.

---

## Meta-Audit (single lowest-level deterministic engine)

**What is the single lowest-level deterministic engine in this repo?**

**Answer:**  
The deterministic engine that, given a repo root and two refs (base, head), builds the dependency graph (from `packages/<name>/src`), computes public surface per package, detects boundary violations and cycles (SCC), and emits a minimal-cut violation set and a deterministic report (run.id, status, decision, proofs). Same inputs → same outputs; no timestamps or randomness in the verdict.

If you have other repos (e.g. wedge), repeat this audit for each and then ask: “What is the single lowest-level deterministic engine in my **entire** stack?” You should have 1–2 “A” items across all repos; if you have many, you have fragmentation.

---

## Discipline Rule (from framework)

Reduce the stack to no more than:

- **1 Core Engine** — In this repo: the graph + structural + report pipeline above.
- **1 Evidence Structuring Layer** — Here: violations + proofs + minimal cut.
- **1 Correlation Layer (future)** — Not in this repo.
- **1 Structural Layer (ArcSight)** — This product is that layer.

Everything else in this repo (comment lifecycle, repair, convergence, website, demos) must justify existence as enhancer, UI, or ops. This audit treats the core as the only “A” within ANCHR.
