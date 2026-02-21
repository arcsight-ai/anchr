# ANCHR Launch Copy (V6 — Canonical)

Single source of truth for landing page and DevHunt. This document defines the public positioning for ANCHR.

**Copy is frozen for launch unless a critical issue is discovered.**

---

## Hero

**ANCHR**

One decision per PR: VERIFIED or BLOCKED. Deterministic structural gate for TypeScript monorepos.

[ Add ANCHR to Your Repo ]  [ View on GitHub ]  (See demo PR)

**Trust line:** Diff-based analysis. Deterministic output. Merge-gate ready.

Architecture is policy — not convention.

---

## What ANCHR Is

ANCHR is a merge-time structural gate for TypeScript monorepos.

It analyzes your dependency graph and returns one deterministic decision per PR. It runs as a GitHub Check via workflow.

---

## What It Is Not

Not a linter. Not a style rule engine. Not a report you interpret.

It makes the decision.

---

## What It Enforces

ANCHR detects:

- Cross-package boundary violations
- Imports into another package's internal modules
- Deleted public API (removing files reachable from a public entrypoint)
- Relative imports escaping package boundaries

Structural drift compounds quietly. ANCHR enforces discipline at merge time.

---

## What a PR Looks Like

**SAFE**

VERIFIED — structural-fast-path  
No architectural impact detected.

**UNSAFE**

BLOCK — boundary_violation  
world-model → @market-os/epistemic-kernel/src/types

**DELETED PUBLIC API**

BLOCK — deleted_public_api  
epistemic-kernel: removed publicly exported file

One comment. Clear evidence. Deterministic verdict.

(Insert short GIF or screenshot here.)

---

## The Contract

Layout supported: `packages/<name>/src`.

Out-of-scope layouts are verified by contract. Opinionated by design.

---

## Install

Add the ANCHR workflow to your repo. It runs on pull requests and produces a required GitHub Check.

No SaaS. No dashboard. No heuristics. No config guessing.

Just one deterministic decision per PR. **VERIFIED** or **BLOCKED**.

---

## Design Principles

**Deterministic** — Same input → same output.

**Explicit** — Structure must be declared, not inferred.

**Merge-Time Enforcement** — Architecture discipline happens where cost is lowest.

---

## Who This Is For

Teams that:

- Use monorepos with defined package boundaries
- Treat architecture as a long-term asset
- Prefer deterministic tools over heuristic analysis
- Want structural enforcement without adopting a build framework

If your repository is intentionally boundary-less, ANCHR is not designed for that model.

---

## FAQ

**Does it block merges?**  
Yes. Add the ANCHR workflow, then require the **ANCHR** status check in branch protection. The check fails on BLOCKED/REVIEW_REQUIRED and passes on VERIFIED.

**Does it require installing dependencies?**  
No. It runs in a bounded runtime and reads source files directly.

**Does it support arbitrary layouts?**  
No. It enforces one explicit contract for deterministic behavior.

**Is it AI?**  
No. Deterministic structural analysis.

---

## Footer

Open source • MIT License • GitHub • Issues

Built to prevent architecture drift before it becomes a rewrite.
