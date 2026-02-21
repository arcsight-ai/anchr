# ANCHR Launch Copy (V6 — Canonical)

Single source of truth for landing page and DevHunt. This document defines the public positioning for ANCHR.

**Copy is frozen for launch unless a critical issue is discovered.**

---

## Hero

**ANCHR**

Deterministic architecture guard for TypeScript monorepos.

Stops boundary violations and public API breaks before merge.

[ Install GitHub App ]  [ View on GitHub ]  (See demo PR)

**Trust line:** Diff-based analysis. Deterministic output. Merge-gate ready.

Architecture is policy — not convention.

---

## What ANCHR Is

ANCHR is a structural merge gate.

It analyzes pull request diffs, builds a package-level dependency model, and emits one decision:

**VERIFIED** or **BLOCKED**

No scoring. No heuristics. No "maybe." Just a clear structural verdict.

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

ANCHR enforces a single explicit layout:

`packages/<name>/src`

Public surface is inferred from:

`packages/<name>/src/index.ts` (and barrel re-exports)

It does not guess layout. It does not infer boundaries heuristically.

If the repository does not match the contract, ANCHR reports out-of-scope instead of pretending.

Determinism requires an explicit boundary model.

---

## Install in Under 60 Seconds

1. Install the GitHub App
2. Add the workflow file
3. Require the ANCHR status check in branch protection

That's it.

**Optional local run:** `npx anchr audit`

ANCHR comments only when structural risk is detected.

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
Yes, when configured as a required status check. Comment-only mode is also supported.

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
