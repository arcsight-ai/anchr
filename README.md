# ANCHR

**Move at AI speed. Keep architectural control.**

ANCHR enforces repository boundaries in CI.

If a pull request introduces architectural drift, ANCHR blocks the merge and shows the exact structural correction.

Deterministic. One decision per PR.

**Architecture is no longer a code review opinion. It's enforced.**

---

## One decision per PR

**VERIFIED** — Safe. No boundary violations.  
**BLOCKED** — Violation. Minimal cut + suggested structural fix (including copy-paste snippet) in the comment.

Deterministic: same base + head → same result. Every time.

![ANCHR BLOCK — boundary violation with minimal cut](docs/media/screenshot-block-pr-comment.png)

---

## Quick Start (3 steps)

1. **Add the workflow** — Copy [.github/workflows/anchr-gate.yml](.github/workflows/anchr-gate.yml) into your repo as `.github/workflows/anchr-gate.yml` (or use the minimal `anchr.yml` below).

2. **Add `.anchr.yml`** at repo root:
   ```yaml
   enforcement: STRICT
   ```

3. **Open a PR** — See the ANCHR comment and the **ANCHR — Architectural Firewall** check.

For stability pin to `npx @arcsight-ai/anchr@1.0.0 gate`; or use `@arcsight-ai/anchr@1` for latest 1.x.

---

## Install (60 seconds)

Create **`.github/workflows/anchr.yml`**:

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
      - run: npx @arcsight-ai/anchr@latest gate
        env:
          GITHUB_BASE_SHA: ${{ github.event.pull_request.base.sha }}
          GITHUB_HEAD_SHA: ${{ github.event.pull_request.head.sha }}
```

Commit. Open a PR. You get a check named **ANCHR**.  
To enforce: **Settings → Branch protection → Require status checks → Add "ANCHR"**.

**Strict mode (block on any violation):** `enforcement: STRICT` in `.anchr.yml` or `npx @arcsight-ai/anchr gate --strict`

**Local run:** `npx @arcsight-ai/anchr gate` or `npx @arcsight-ai/anchr gate --base <base-sha> --head <head-sha>`

[![CI](https://github.com/arcsight-ai/anchr/actions/workflows/anchr.yml/badge.svg)](https://github.com/arcsight-ai/anchr/actions/workflows/anchr.yml) [![Deterministic](https://img.shields.io/badge/deterministic-by__construction-2ea043)](.)

---

## Configuration

Optional `.anchr.yml` at repo root:

```yaml
enforcement: STRICT   # or ADVISORY (warn only)
ignore:
  - "tests/**"
  - "**/*.test.ts"
maxFiles: 500         # optional; default 400 (large repos)
timeoutMs: 10000      # optional; default 8000
```

**Enforcement:** `--strict` overrides → STRICT. Else `.anchr.yml` `enforcement`. Default ADVISORY. With STRICT, any violation or indeterminate result fails the check.

**Large repos:** If a PR exceeds `maxFiles` or analysis times out, the comment shows “Analysis scope exceeded” (e.g. “Changed files: 732 (max 500). Structural analysis skipped.”). No silent neutral.

---

## What ANCHR enforces

| Verdict   | Meaning |
|----------|--------|
| **VERIFIED** | No boundary violations, no new cycles. |
| **BLOCKED**  | Cross-package internal import, or circular dependency. Comment includes minimal cut and cause. |

Layout: `packages/<name>/src` only. Other layouts are out-of-scope by design.

---

## How it works

1. **Packages** — From `packages/<name>/src`.
2. **Graph** — Dependencies from imports in the diff and codebase.
3. **Public surface** — Per package (entry + re-exports; `internal/`, `private/`, `impl/` excluded).
4. **Violations** — Cross-package non-public imports, deleted public API use, path escape, cycles.
5. **Minimal cut** — Canonical set of edges that prove the violation.
6. **Result** — One status, same inputs → same output. No timestamps, no randomness.

---

## Why determinism

Same repo snapshot and refs → same verdict. No flaky checks. The pipeline can rely on it. Identical inputs → identical outputs across environments.

---

## Demo

**See ANCHR block structural drift in real time.**

[Screenshot: BLOCK with minimal cut and suggested fix](docs/media/screenshot-block-pr-comment.png).

Flow: open a PR with a messy AI change → ANCHR blocks → show comment and suggestion → apply minimal rewrite (or copy-paste fix) → push → green check.

**60-second live script** (meetups, DevRel, Product Hunt, Loom): [docs/60-SECOND-DEMO-SCRIPT.md](docs/60-SECOND-DEMO-SCRIPT.md).

---

## run.id — Repository state identity

Deterministic architectural state ID from repo content. Same `run.id` across machines ⇒ same structure and content. Content-based; no timestamps or git metadata in the hash.

---

## License

MIT.
