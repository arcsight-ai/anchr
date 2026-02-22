# ANCHR

**Structural Gate for TypeScript Monorepos**

ANCHR enforces architectural boundaries at merge time.

It analyzes your dependency graph and returns exactly one decision per pull request:

**VERIFIED**  
or  
**BLOCKED**

Deterministic by contract.  
Same input → same decision.

![ANCHR BLOCK — boundary violation with minimal cut](docs/media/screenshot-block-pr-comment.png)

Supported layout:

```
packages/<name>/src
```

Other layouts are out-of-scope by design.

---

## Why ANCHR Exists

Code review catches logic.  
ANCHR enforces structure.

Boundary violations, private imports, and deleted public APIs are not suggestions.

They are merge-time decisions.

---

## Install (60 seconds)

Add the ANCHR workflow to your repo.  
Open a PR.  
Require the ANCHR check in branch protection.

One decision per PR.

Create **`.github/workflows/anchr.yml`**. Paste:

```yaml
name: ANCHR

on:
  pull_request:

jobs:
  ANCHR:
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

Commit. Open a PR. You will see a check named **ANCHR**.  
To enforce: **Settings → Branch protection → Require status checks → Add "ANCHR"**.

**Local run:** `npx anchr audit`

[![CI](https://github.com/arcsight-ai/anchr/actions/workflows/anchr.yml/badge.svg)](https://github.com/arcsight-ai/anchr/actions/workflows/anchr.yml) [![Deterministic](https://img.shields.io/badge/deterministic-by__construction-2ea043)](.)

---

## Opinionated by Design

### Scope & Layout Contract

ANCHR enforces structural boundaries in monorepos organized under `packages/<name>/src`. Only this layout is supported. No heuristic module inference, no config-driven path guessing. If the layout does not match, ANCHR returns VERIFIED by contract (out-of-scope).

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

## Why Determinism Matters

Same repository snapshot and refs produce the same verdict. No flaky checks, no race-condition verdicts. The pipeline can rely on the result. Emission is structured and suitable for certification: identical inputs yield identical outputs across environments.

---

## Demo

**[anchr-demo-monorepo](anchr-demo-monorepo)** demonstrates the merge gate end-to-end:

- A **safe PR** example (VERIFIED) — changes that stay within boundaries.
- A **boundary violation** example (BLOCKED) — cross-package internal import.
- A **circular dependency** example (BLOCKED) — cycle in the dependency graph.

Use it to see ANCHR as a required check and to reproduce VERIFIED vs BLOCKED behavior.

---

## run.id — Repository State Identity

`run.id` is a deterministic architectural state identifier derived from repository content. If `run.id` matches between environments (local, CI, any machine), the codebase is identical in structure and content. Content-based; no timestamps or git metadata in the hash. Cross-platform.

---

## License

MIT.
