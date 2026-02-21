# DevHunt Listing Copy

Copy-paste ready. Short. Confident. Non-defensive.

---

## Headline

**ANCHR — Deterministic Structural Merge Gate for TypeScript Monorepos**

---

## Tagline / One-liner

Review sees the diff. ANCHR sees the structure. One decision per PR.

---

## Problem

Large monorepos decay. Internal APIs get imported across package boundaries. Cycles creep in. Code review cannot reliably catch structural violations. CI rarely enforces architecture. ANCHR is the merge-time structural gate that blocks boundary violations and drift before merge.

---

## Solution

ANCHR enforces structural boundaries between packages. It detects cross-package internal imports and circular dependencies, runs as a GitHub Check, and blocks merges when violations occur. Output is deterministic. It is not a linter—it enforces structure at the package level.

---

## How it works (3 bullets)

- **Graph.** Builds the dependency graph from the PR diff and repo.
- **Cut.** Computes minimal cut (the set of edges that evidence the violation).
- **Decide.** Posts one verdict per PR: VERIFIED, BLOCKED, or REVIEW REQUIRED. Same input → same output.

---

## Why it matters

Architecture is too important to rely on convention. Code review catches logic errors; ANCHR enforces structural discipline. Deterministic by construction. No flaky checks. Required status check → merge blocked when the check fails.

---

## Demo link

[anchr-demo-monorepo](https://github.com/arcsight-ai/anchr/tree/main/anchr-demo-monorepo) — safe PR (VERIFIED), boundary violation (BLOCKED), circular dependency (BLOCKED). Branch protection + ANCHR required check.

---

## Optional: 3 benefit bullets (if field allows)

- One graph per PR. Dependency graph + minimal cut. No manual structure review.
- One comment. BLOCK / WARN / VERIFIED with evidence. Deterministic. No black box.
- One decision before merge. Add the ANCHR workflow; require the check. Built for monorepos and strict dependency boundaries.
