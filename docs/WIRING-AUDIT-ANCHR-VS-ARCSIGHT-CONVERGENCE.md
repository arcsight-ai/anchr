# Wiring Audit: ANCHR ↔ ArcSight / Wedge / Convergence

**Purpose:** Verify the product foundation is solid before building the GitHub App.  
**Goal:** Single source of structural truth, one enforcement policy layer, convergence cleanly optional.  
**Scope:** No feature additions, no new abstractions, no refactors “because cleaner.” Only: remove duplication, clarify ownership, establish single source of truth.

---

## Checklist Results

### A. Does anchr import canonical graph from ArcSight directly?

**No — and there is no such package in this repo.**

- **Finding:** There is no dependency on `@arcsight-ai/wedge` or any `arcsight-*` package. `package.json` has one runtime dependency: `@octokit/rest`.
- **Graph ownership:** The canonical graph is built **only** in anchr: `src/graph/buildGraph.ts`. It is not imported from elsewhere.
- **Wedge relationship:** Scripts (e.g. `scripts/copy-adjudication-to-wedge.ts`) state: *“ANCHR owns replay and exports; wedge only consumes artifacts at tests/adjudication/.”* Wedge is a **consumer** of ANCHR outputs (adjudication artifacts), not a provider of graph logic.

**Verdict:** No duplicate graph builder from “ArcSight” — because the only graph builder is in anchr. There is no parallel graph to unify. **Single source of structural truth = anchr’s graph + report.**

---

### B. Does drift reconciliation use the same structural-hash kernel?

**Yes, for the structural report.**

- **Structural run.id:** Computed in one place: `src/structural/buildReport.ts`.  
  - `graphHash = sha256(sortedPaths.join("\n"))`  
  - `violationsHash = sha256(...sortedViolations...)`  
  - `analysisId = runId = sha256(baseSha + headSha + graphHash + violationsHash)`  
- **Hash implementation:** `sha256()` is from `src/structural/report.ts` (single implementation). Other modules that need the same structural identity import it (e.g. `src/repair/runRepairSimulation.ts`, `src/repair/repoHash.ts`, `src/repair/planFixCore.ts` use `sha256` from `../structural/report.js`).
- **Other hashes:** Comment fingerprints (v5, production, share), pressure fingerprints, and determinism certificates use `createHash("sha256")` or local helpers for **different purposes** (comment identity, pressure keys, cert IDs). They are not the structural run.id. No second “structural” hash kernel for drift vs “ArcSight.”

**Verdict:** Drift reconciliation and report identity use one structural-hash kernel (report.ts + buildReport.ts). **No unification needed for structural identity.**

---

### C. Is convergence-engine modifying structural truth?

**No. Convergence does not mutate graph, hashing, or report.**

- **What convergence does:** `src/convergence/run.ts` calls `analyzeAtRef(repoRoot, ref)` for baseline and head. `analyzeAtRef` (`src/convergence/analyzer.ts`) uses `listFilesAtRef`, `getFileAtRevision`, `parseDeps`, and `extractPressuresFromFile` → returns a `Map<string, number>` (pressure weights). It does **not** call `buildGraph`, `buildReport`, or any structural report code.
- **Output:** Writes `arcsight-convergence.json` (impact, deltas). It does not write or modify `anchr-report.json`.
- **How it’s used:** `anchr-decision.ts` reads both `anchr-report.json` and `arcsight-convergence.json`. `buildDecisionFromReportWithContext(report, convergence)` uses convergence only to compute **changeType** (e.g. IMPROVED, REGRESSED, SHIFTED, UNCHANGED) for narrative/display. The **decision** (REWORK, REVIEW, ALLOW, etc.) comes from `buildDecisionFromAnchRReport(report)` — report only. Policy (`evaluatePolicy`) uses `currentReport` and `previousDecision`, not convergence.

**Verdict:** Convergence is **cleanly optional**. It wraps drift (runs after structural audit in the workflow) and adds a layer of commentary; it does not modify canonical graph logic, hashing, or enforcement. **No decoupling required** for v1 gate; gate path can ignore convergence file and use report-only.

---

### D. Is proof signing coupled to drift evaluation?

**Proof is coupled to report status, but drift blocking can still work without “BLOCKED” status.**

- **Contract:** In `src/structural/buildReport.ts`: *“Causal Proof Contract: no BLOCKED without every violation having a proof.”* If any violation lacks a proof, `effectiveStatus` becomes `INDETERMINATE` (not `BLOCKED`).
- **Enforcement:** `decision.level` can be `allow` | `block` | `warn`.  
  - `block` → exit 1 (CLI).  
  - `warn` + `--strict` → exit 2.  
  - So when status is `INDETERMINATE` (e.g. proof missing), decision is `warn`; with `--strict` the check still **fails** (exit 2). So “drift blocking” (failing the gate) does **not** require report status to be `BLOCKED` — it can be INDETERMINATE + strict.
- **For GitHub Gate v1:** You can run drift-only; if violations exist but proofs are missing you get INDETERMINATE + warn; with STRICT the gate fails. You do **not** need to implement separate “proof signing” to have a working gate. If you want true BLOCKED (exit 1) on violations, you need proofs for every violation (current contract). No need to abstract enforcement for v1; current behavior is sufficient.

**Verdict:** Proof is coupled to the **semantic** status (BLOCKED vs INDETERMINATE), not to whether the gate can fail. **Gate v1 can ship without changing proof contract.**

---

## What You Want After Audit (Target Hierarchy)

**Target:**

```
ArcSight (canonical graph + drift)   ← in this repo, this IS anchr’s graph + report
        ↑
        │
     anchr (policy layer + CLI + GitHub wrapper)
        ↑
        │
 Convergence (optional repair / narrative wrapper)
```

**Actual layout in repo:**

- **Canonical graph + drift:** Implemented entirely inside anchr (`src/graph/`, `src/structural/`, `src/audit/`, `scripts/anchr-structural-audit.ts`). No separate “ArcSight” package; “ArcSight” here is product/brand and comment markers.
- **anchr:** CLI, decision (report → action), policy, comment rendering, status. Reads report; optionally reads convergence for changeType only.
- **Convergence:** Optional script; produces a separate artifact; decision layer uses it only for narrative. Does not modify report or graph.

So the hierarchy is **already** “drift = single source of truth; convergence = optional wrapper.” The only nuance is naming: “ArcSight” as the canonical layer is **this repo’s structural core**, not a second repo.

---

## Honest Answer: A vs B

**Is anchr currently:**

- **A) A thin wrapper around ArcSight?**  
- **B) A mixed orchestration of ArcSight + Convergence + drift + proof?**

**Answer: B — but with a clear clarification.**

- There is **no separate ArcSight/wedge package** that owns the graph. The graph and drift **are** anchr. So it’s not “anchr wraps ArcSight”; it’s “anchr contains both the structural engine and the orchestration.”
- The “mixed” part is: **one repo** contains (1) structural engine (graph + report), (2) convergence (separate analysis, optional), (3) decision (report + optional convergence for changeType), (4) policy, (5) comment/status scripts. So it’s “mixed” in the sense of **multiple layers in one repo**, not “multiple graph builders.”
- **Risks that could make it feel messy:**  
  - **Demo vs CI:** If demo runs drift-only and CI runs structural + convergence + decision, behavior is the same for **pass/fail** (decision comes from report); only narrative (changeType) can differ. So no drift-only vs full-pipeline **enforcement** split.  
  - **Multiple entrypoints:** Many scripts (anchr-structural-audit, anchr-decision, arcsight-pr-comment, set-pr-status, etc.) and several hashing sites for non-structural purposes. For productization, you want **one clear gate path** (e.g. structural audit → report → decision → status + comment) and to treat the rest as optional or tooling.

**So: simplify first?**

- You don’t need to “unify” with an external ArcSight — there isn’t one. You **do** want to:
  1. **Treat the gate path as report-only.** Decision for block/allow comes from report; convergence is optional narrative. Document that.
  2. **Avoid “drift-only mode” vs “full pipeline mode” with different enforcement.** Today they’re already the same (decision from report); keep it that way and don’t add modes that change enforcement.
  3. **Optionally** reduce surface: one canonical way to run the gate (e.g. `anchr audit` or `anchr check` with env), one report path, one decision path. No new abstractions — just clarity and, if needed, stripping optional steps from the minimal gate path.

**Verdict:** Foundation is **solid enough to build the GitHub App**. The wiring is not a knot (convergence doesn’t mutate structural truth; one graph, one run.id). The main follow-up is **clarity and discipline**: one gate path, report = authority, convergence = optional wrapper. That’s a 1–2 week clarification and doc/script discipline, not a 3-month rewrite.

---

## Summary Table

| Check | Result | Action |
|-------|--------|--------|
| A. Canonical graph from ArcSight? | N/A — no such package; anchr owns graph | None. Single source of truth = anchr. |
| B. Same structural-hash kernel? | Yes — run.id in buildReport.ts, sha256 in report.ts | None. |
| C. Convergence modifying structural truth? | No — convergence is separate analysis; decision from report | None. Optional: document “gate path = report-only.” |
| D. Proof coupled to drift blocking? | Proof coupled to BLOCKED status; gate can still fail on warn+strict | None for v1. |

**Do not:** Add new integration, refactor “for cleanliness,” or add abstractions.  
**Do:** Document gate path (report → decision → status/comment), and optionally ensure minimal CI path runs report-only and treats convergence as optional.
