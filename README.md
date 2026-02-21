# ANCHR — Deterministic Structural Merge Gate for TypeScript Monorepos

[![CI](https://github.com/arcsight-ai/anchr/actions/workflows/arcsight.yml/badge.svg)](https://github.com/arcsight-ai/anchr/actions/workflows/arcsight.yml) [![Deterministic](https://img.shields.io/badge/deterministic-by__construction-2ea043)](.)

Prevents boundary violations and architectural drift at pull request time.

**Review sees the diff. ANCHR sees the structure.** One decision per PR.

Code review catches logic errors. ANCHR enforces structural discipline. Architecture is too important to rely on convention.

ANCHR is not a stylistic linter. It enforces structural boundaries at the package level.

---

## The Problem

Large monorepos decay. Internal APIs get imported across package boundaries. Cycles creep in. Code review cannot reliably catch structural violations—reviewers focus on logic and style, not dependency direction. CI rarely enforces architecture; most pipelines run tests and lint, not "did this PR introduce a cross-package internal import?"

Review sees the diff. ANCHR sees the structure: cycles, layering, and critical edges. The result is gradual coupling, hidden dependencies, and merge-time decisions that later prove expensive to undo.

---

## What ANCHR Does

ANCHR is the merge-time structural gate. It enforces structural boundaries between packages: cross-package internal imports, deleted public API usage, and circular dependencies. It runs as a GitHub Check and blocks merges when violations occur. Output is deterministic: same repository snapshot and refs produce the same verdict every time.

ANCHR is not a linter. It does not analyze syntax or style. It analyzes the dependency graph and blocks structural risk. One graph per PR; one comment with BLOCK, WARN, or VERIFIED and the minimal cut. Merge or fix.

---

## Opinionated by Design

### Scope & Layout Contract

ANCHR enforces structural boundaries in monorepos organized under:

```
packages/<name>/src
```

Only this layout is supported. There is no heuristic module inference and no config-driven path guessing. Discovery is explicit: only `<repoRoot>/packages/<name>/src` directories are treated as modules. If the layout does not match, ANCHR returns VERIFIED by contract and surfaces that boundary enforcement was not applied (see runtime output).

Explicit structure enables deterministic enforcement. The contract is intentional.

---

## Why ANCHR

- **Not a linter.** ANCHR does not analyze syntax or style. It analyzes the dependency graph and blocks structural risk.
- **Not guesswork.** Deterministic. Same input → same output. Evidence (minimal cut) in every BLOCKED run.
- **Not manual review.** Review sees the diff. ANCHR sees the structure—cycles, layering, and critical edges.
- **Not random blocking.** One graph per PR. Minimal cut explains why. Resolve or override.

---

## Example Verdicts

| Verdict | Meaning |
|--------|---------|
| **VERIFIED** | Safe change. No boundary violations, no new cycles. |
| **BLOCKED** | Cross-package internal import. A file in package A imports from package B's non-public surface. |
| **BLOCKED** | Circular dependency. The dependency graph contains a cycle. |

Short, realistic outcomes. BLOCKED runs include a minimal cut (the set of edges that evidence the violation) and a cause label.

---

## How It Works

**Graph. Cut. Decide.**

1. **Discovers packages** — Scans `packages/<name>/src`; only these directories define modules.
2. **Builds dependency graph** — From import statements in the diff and existing code; value imports and re-exports.
3. **Computes public surface** — Per package, from entry (`index.ts`/`index.tsx`) and re-exports; paths under `internal/`, `private/`, `impl/` are excluded.
4. **Detects violations** — Cross-package imports that resolve to non-public files; deleted public API usage; relative path escape; cycles.
5. **Computes minimal cut** — Canonical set of edges that evidence the violation.
6. **Emits deterministic result** — Structured report (status, minimal cut, proofs); same inputs yield byte-consistent output.

No heuristics. No timestamps or randomness in the verdict.

---

## Install (60 seconds)

Add the ArcSight check to your repo.

Create **`.github/workflows/arcsight.yml`**. Paste:

```yaml
name: ArcSight

on:
  pull_request:

jobs:
  ArcSight:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      checks: write

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npx anchr@latest audit
        env:
          GITHUB_BASE_SHA: ${{ github.event.pull_request.base.sha }}
          GITHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha }}
```

Commit. Open a PR.

You will see a check named **ArcSight**.

To enforce: **Settings → Branch protection → Require status checks → Add "ArcSight"**.

From that point forward, each PR receives exactly one decision: **VERIFIED** or **BLOCKED**. Same input → same decision.

**Local run:** `npx anchr audit`

---

## Why Determinism Matters

Same repository snapshot and refs produce the same verdict. No flaky checks, no race-condition verdicts. The pipeline can rely on the result. Emission is structured and suitable for certification: identical inputs yield identical outputs across environments.

---

## Demo

**[anchr-demo-monorepo](anchr-demo-monorepo)** demonstrates the merge gate end-to-end:

- A **safe PR** example (VERIFIED) — changes that stay within boundaries.
- A **boundary violation** example (BLOCKED) — cross-package internal import.
- A **circular dependency** example (BLOCKED) — cycle in the dependency graph.

Use it to see ArcSight as a required check and to reproduce VERIFIED vs BLOCKED behavior.

---

## run.id — Repository State Identity

`run.id` is a deterministic architectural state identifier derived from repository content. If `run.id` matches between environments (local, CI, any machine), the codebase is identical in structure and content. Content-based; no timestamps or git metadata in the hash. Cross-platform.

---

## License

MIT.
