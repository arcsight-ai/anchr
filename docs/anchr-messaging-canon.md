# ANCHR Messaging Canon

Single source of truth for positioning. Reuse exact phrasing everywhere. No variation.

**Category lock:** ANCHR is **the merge-time structural gate.**

---

## Core Definitions (Master Copy Blocks)

| Slot | Canonical copy |
|------|-----------------|
| **Problem** | Review sees the diff. ANCHR sees the structure. |
| **Mechanism** | We build the dependency graph, compute minimal cut, and post BLOCK / WARN / ALLOW with evidence on the PR. |
| **Outcome** | One decision per PR before merge. No manual structure review. |
| **Three-beat rhythm** | Graph. Cut. Decide. |
| **CTA** | Add to your repo. |
| **Linter contrast** | ANCHR is not a linter. It does not analyze syntax or style. It analyzes the dependency graph and blocks structural risk. |
| **Manual review contrast** | Review sees the diff. ANCHR sees the structure—cycles, layering, and critical edges. |
| **PR comment example** | See block below. |

**Canonical PR comment example:**

```
ANCHR · BLOCK

Structural risk: minimal cut indicates high-impact dependency change.

Minimal cut:
  - src/api/client.ts → src/core/auth.ts
  - src/core/auth.ts → src/api/client.ts

Decision: BLOCK. Resolve or request review override.
```

---

## 1. Landing Page Hero

**Headline:** The merge-time structural gate.

**Problem:** Review sees the diff. ANCHR sees the structure.

**Mechanism:** We build the dependency graph, compute minimal cut, and post BLOCK / WARN / ALLOW with evidence on the PR.

**Three-beat rhythm:** Graph. Cut. Decide.

**CTA:** Add to your repo.

---

## 2. DevHunt Submission

**Title:** The merge-time structural gate.

**Tagline:** Review sees the diff. ANCHR sees the structure. One decision per PR.

**3 benefit bullets:**
- One graph per PR. Dependency graph + minimal cut. No manual structure review.
- One comment. BLOCK / WARN / ALLOW with evidence. Deterministic. No black box.
- One decision before merge. GitHub App or CI. Built for monorepos and strict dependency boundaries.

**How it works (≤50 words):** ANCHR analyzes the PR, builds the dependency graph, and computes minimal cut for structural risk. It posts a single PR comment with BLOCK, WARN, or ALLOW and the minimal cut. Same input → same output. Not a linter. Runs as GitHub App or CI workflow.

**Canonical PR comment example:**

```
ANCHR · BLOCK

Structural risk: minimal cut indicates high-impact dependency change.

Minimal cut:
  - src/api/client.ts → src/core/auth.ts
  - src/core/auth.ts → src/api/client.ts

Decision: BLOCK. Resolve or request review override.
```

---

## 3. README Intro

**Category line:** ANCHR is the merge-time structural gate.

**Problem:** Review sees the diff. ANCHR sees the structure.

**Mechanism:** We build the dependency graph, compute minimal cut, and post BLOCK / WARN / ALLOW with evidence on the PR.

**Linter contrast:** ANCHR is not a linter. It does not analyze syntax or style. It analyzes the dependency graph and blocks structural risk.

**Numbered flow:**
1. PR opened.
2. ANCHR runs (GitHub App or CI).
3. Dependency graph built from the PR.
4. Minimal cut computed. Decision: BLOCK / WARN / ALLOW.
5. One comment posted with decision and minimal cut. Merge or fix.

---

## 4. Why Choose ANCHR

- **Not a linter.** ANCHR does not analyze syntax or style. It analyzes the dependency graph and blocks structural risk.
- **Not AI guesswork.** Deterministic. Same input → same output. Evidence (minimal cut) in every comment.
- **Not manual review.** Review sees the diff. ANCHR sees the structure—cycles, layering, and critical edges.
- **Not random blocking.** One graph per PR. Minimal cut explains why. Resolve or override.

---

## 5. FAQ

**What is ANCHR?**  
The merge-time structural gate. It builds the dependency graph for a PR, computes minimal cut, and posts BLOCK / WARN / ALLOW with evidence.

**How is ANCHR different from a linter?**  
ANCHR is not a linter. It does not analyze syntax or style. It analyzes the dependency graph and blocks structural risk.

**How is ANCHR different from manual code review?**  
Review sees the diff. ANCHR sees the structure—cycles, layering, and critical edges.

**What does ANCHR output?**  
One comment per PR: BLOCK, WARN, or ALLOW, plus the minimal cut. Same input → same output.

**Where does ANCHR run?**  
GitHub App or CI workflow. One decision before merge.

**What repos is ANCHR for?**  
Teams with monorepos, layered architectures, or strict dependency boundaries. Validated on real repositories.
