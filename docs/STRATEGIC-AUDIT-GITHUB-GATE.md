# Strategic Audit: Can ANCHR Become the GitHub Structural Gate Without Rewriting the Core?

**Target product (v1):**  
ANCHR = GitHub structural firewall for AI-generated code.

**Must:** Run on PR • Compare base vs head • Detect structural drift • Fail status check if STRICT • Post readable PR comment • Optionally repair suggestions later • Fast • Deterministic.

**Nothing else matters for v1.**

---

## Step 1 — Target Product (Already Defined Above)

- Run on PR ✓ (design target)
- Compare base branch vs PR branch ✓ (design target)
- Detect structural drift ✓ (see audit below)
- Fail status check if STRICT ✓ (see below)
- Post readable PR comment ✓ (see below)
- Optionally run repair suggestions later ✓ (exists)
- Fast ✓ (timeout budget; see below)
- Deterministic ✓ (by construction)

---

## Step 2 — Audit ANCHR Against That

### A. Does ANCHR already do this?

| Requirement | Yes/No | Evidence |
|-------------|--------|----------|
| **Build canonical graph snapshots** | **Yes** | `src/graph/buildGraph.ts`: builds graph from `packages/<name>/src`, stable node/edge order, public-surface propagation. |
| **Compare two snapshots** | **Yes** | Diff is base↔head (`git diff --name-status base head`). Analysis is on **head** tree; violations are boundary/cycle in that tree, scoped to changed files. Effectively “structure at head vs allowed by layout + public surface.” |
| **Detect cycles** | **Yes** | `src/graph/detectCycles.ts`: Tarjan SCC; deterministic. `cyclesToViolations` → report. |
| **Detect cross-domain edges** | **Yes** | `src/structural/violations.ts`: cross-package imports to non-public files; `computePublicFiles` + frozen resolver. |
| **Output drift deltas** | **Yes** | Report has `minimalCut` (canonical violation set), `proofs`, `status` (VERIFIED/BLOCKED/INCOMPLETE). Machine-readable. |
| **Enforce STRICT vs ADVISORY** | **Yes** | CLI `--strict`: `decisionLevel === "block" → exit 1`; `decisionLevel === "warn" && isStrict → exit 2`; else 0. No config file yet; STRICT = flag. |
| **Exit non-zero on violation** | **Yes** | `block` → exit 1; `warn` + strict → exit 2. `anchr check`: BLOCK → exit 2. |

**Conclusion A:** The core engine is reusable. Graph, compare (base/head diff + head graph), cycles, cross-domain edges, drift output, strict enforcement, and exit codes are already there.

### B. What does it NOT currently do? (Wrappers, not engine)

| Gap | Notes |
|-----|--------|
| **GitHub App install flow** | Not a GitHub App; runs as Action + scripts. Action exists (`.github/workflows/anchr.yml`). |
| **PR comment formatting** | **Exists.** `scripts/arcsight-pr-comment.ts`, `src/comment/`, formatters. Comment is posted/updated by workflow. |
| **Required status check integration** | **Exists.** Workflow creates/updates Check Run “ANCHR”; conclusion = success/failure from report. Branch protection can require “ANCHR.” |
| **Repo baseline caching** | No separate “baseline” cache; each run is base+head. Optional later. |
| **Config file per repo** | No `.anchr.yml` yet. STRICT is CLI `--strict`. Adding `enforcement: STRICT` + `ignore` is a small addition. |
| **Performance optimization** | Timeout 8s, MAX_FILES 400. Scale to 1k+ and &lt;60s may need tuning (see Step 4). |

**Conclusion B:** Most “wrappers” exist. Missing: optional config file (`.anchr.yml`), possible perf tuning for very large repos.

---

## Step 3 — Reality Check

ANCHR already has:

- Drift detection (boundary + cycles, minimal cut)
- Strict enforcement (--strict → warn fails as exit 2)
- Proof refusal (no BLOCK without proofs; INDETERMINATE otherwise)
- Canonical hashing (run.id, stableStringify)
- Deterministic CI logic (same refs → same report)
- Demo mode (anchr-demo-monorepo)
- Repair loop (repair/fix commands, suggestions in comment)

So you are **not** building a new product. You are **extracting the “gate layer”** from an existing system. That’s a much smaller job.

---

## Step 4 — Specific Audit Questions (Answers)

| Question | Answer | Evidence |
|----------|--------|----------|
| **Can it take two commit SHAs and compare structure?** | **Yes** | `--base <sha> --head <sha>` or `GITHUB_BASE_SHA` / `GITHUB_HEAD_SHA`. `scripts/cli.ts` `getRefs()`, `runStructuralAuditWithTimeout(cwd, refs.base, refs.head, false)`. `anchr-structural-audit.ts` uses `getBaseHead()` / env for base/head, `getDiff(repoRoot, base, head)`. |
| **Can it run headless in CI?** | **Yes** | CI uses env vars; no TTY. `anchr audit --all --json` or workflow runs `anchr-structural-audit.ts` then `anchr-decision.ts`, `set-pr-status`. README: `npx anchr@latest audit` with `GITHUB_BASE_SHA` / `GITHUB_HEAD_SHA`. |
| **Does it already output machine-readable JSON?** | **Yes** | Report written to `artifacts/anchr-report.json` (or `ANCHR_REPORT_PATH`). `anchr audit --json` prints report to stdout. Schema: status, decision, minimalCut, proofs, run.id, baseSha, headSha, etc. |
| **Does it support repo path injection cleanly?** | **Partial** | Repo = git root from `getRepoRoot()` (or cwd). No `--repo-root` flag. In CI, checkout sets cwd to repo; injection = “run from repo root.” Clean for CI; add `--repo-root` if needed for other hosts. |
| **Is drift detection deterministic across machines?** | **Yes** | Stable sorts, sha256 for run.id, no timestamps in report. Same base+head → same report. |
| **Does it scale to 1k+ files?** | **Unclear / likely needs tuning** | Current: `MAX_FILES = 400` (skip analysis if diff &gt; 400), `TIMEOUT_MS = 8000`. Graph builds over **all** source under `packages/*/src`, not just diff. 1k+ files may hit timeout or need incremental/scope limits. |
| **Can it finish under 60 seconds?** | **Yes for typical PRs** | Timeout is 8s today. Under 60s is achievable; 8s is a conservative default. Can raise or make configurable. |

**Summary:** 5.5/7 fully yes (two SHAs, headless CI, JSON, determinism, &lt;60s). Repo path = cwd today (clean for CI). Scale to 1k+ = only open question (tuning, not engine rewrite).

---

## Step 5 — High-Level Summary (What to Keep / Strip / Expose / Wrap)

### Folders (high level)

| Area | Role |
|------|------|
| `src/graph/` | Core: build graph, public surface, detect cycles. **Keep.** |
| `src/structural/` | Core: violations, public surface, buildReport, git, canonicalPath, cycleViolations. **Keep.** |
| `src/parse/`, `src/resolve/` | Layer 1: parsing and resolution. **Keep.** |
| `src/audit/` | Runs violations + runtime signals; feeds report. **Keep.** |
| `src/decision/` | Maps report → action (merge/block/review). **Keep for gate.** |
| `scripts/anchr-structural-audit.ts` | Entry that writes report. **Keep.** |
| `scripts/cli.ts` | CLI: audit, check, foresee, fix, repair, explain, history, install, uninstall. **Keep audit + check;** rest optional for v1. |
| `scripts/arcsight-pr-comment.ts`, `scripts/set-pr-status.ts` | PR comment + status. **Keep.** |
| `src/comment/`, `src/formatters/` | Comment body and formatting. **Keep (readable comment).** |
| `src/convergence/`, `src/pressure/`, `src/direction/`, `src/advisor/` | Enhancers. **Strip from v1 gate** or leave unused. |
| `src/repair/`, `src/fix/` | Repair suggestions. **Optional later.** |
| `src/lifecycle/`, `src/reconciliation/` | Comment lifecycle. **Keep if you want one convergent comment.** |
| Demos, labs, website, simulations | **Strip from “gate product”** (separate repos or clearly optional). |

### Entrypoints

- **CI gate:** `npx anchr audit` (or `anchr check`) with `GITHUB_BASE_SHA` / `GITHUB_HEAD_SHA` (or `--base` / `--head`).  
- **Report generation:** `scripts/anchr-structural-audit.ts` (invoked by CLI or by workflow).  
- **Status + comment:** workflow runs `set-pr-status`, `arcsight-pr-comment.ts` after report.

### How drift is computed

1. **Refs:** base and head SHAs (CLI args or env).  
2. **Diff:** `git diff --name-status base head` → changed files (filter .ts/.tsx).  
3. **Packages:** discover `packages/<name>/src`.  
4. **Graph:** build full graph on **head** tree (all under packages/*/src).  
5. **Public surface:** per package from index + reexports; exclude internal/private/impl.  
6. **Violations:** (a) cross-package imports to non-public files (frozen resolver on diff files), (b) deleted public API, (c) cycles (Tarjan SCC).  
7. **Report:** status VERIFIED/BLOCKED/INCOMPLETE, minimalCut, proofs, run.id, decision (allow/block/warn).

### How STRICT is handled

- **Today:** CLI flag `--strict`.  
  - `decision.level === "block"` → exit 1.  
  - `decision.level === "warn"` and `--strict` → exit 2; otherwise exit 0.  
- **Check run:** Workflow maps report + policy to conclusion (success/failure); policy can be “block on BLOCK, fail on warn if strict.”  
- **Config (not yet):** Add `.anchr.yml` with `enforcement: STRICT | ADVISORY` and optional `ignore: [ "tests/**" ]`; CLI and Action read it. No engine change.

### How CI is wired

- **README (simple):** One job: checkout, setup-node, `npx anchr@latest audit` with `GITHUB_BASE_SHA` / `GITHUB_HEAD_SHA`. Require “ANCHR” in branch protection.  
- **Repo’s own workflow (full):** `.github/workflows/anchr.yml`: checkout base, fetch head, run `anchr-structural-audit.ts`, `anchr-decision.ts`, `anchr-fix-suggestions.ts`, then publish status, post/update comment (arcsight-pr-comment), create/update Check Run “ANCHR.”  
- **Status:** `set-pr-status` uses Checks API; conclusion = success/failure from report/policy.

---

## Step 5 (Continued) — Adaptation Plan (If Audit Looks Good)

You **don’t rewrite**. You:

1. **Extract CLI entry:**  
   - `anchr check --base <sha> --head <sha>` (already exists).  
   - Or `anchr audit --all --base <sha> --head <sha> --json` for CI.  
   - Ensure one canonical “gate” command (e.g. `anchr audit` with env or `anchr check`).

2. **Wrap in GitHub Action (optional).**  
   - Already runnable via `npx anchr@latest audit` in a single step.  
   - Optional: publish a dedicated `anchr/action` that sets env and runs that.

3. **PR comment:** Already there; keep `arcsight-pr-comment.ts` (or thin wrapper). No rewrite.

4. **Status check:** Already there; workflow creates/updates “ANCHR” check. Branch protection = require “ANCHR.”

5. **Minimal config:**  
   - Add `.anchr.yml` (or similar):  
     - `enforcement: STRICT | ADVISORY`  
     - `ignore: [ "tests/**" ]` (optional)  
   - CLI and/or decision script read it; no change to graph or report.

That’s the product. Not the entire convergence ecosystem.

---

## Step 6 — What You Do NOT Do

- **Do not** rebuild the engine.  
- **Do not** rework convergence for v1.  
- **Do not** add new invariant layers for v1.  
- **Do not** add builder mode or UI dashboards for v1.  

That’s distraction. The market wants “stop structural drift in my PR”—a thin wrapper around the existing core.

---

## Verdict: 2-Week Wrapper vs 3-Month Rebuild

**Verdict: This is a ~2–4 week wrapper and config job, not a 3-month rebuild.**

- **Core:** Already compares two SHAs, builds graph, detects drift (boundary + cycles), outputs deterministic report, exits non-zero on violation, supports STRICT via flag.  
- **CI:** Already runs headless, writes JSON, posts comment, updates Check Run.  
- **Gaps:** (1) Optional `.anchr.yml` (enforcement + ignore), (2) possibly `--repo-root` if needed, (3) perf/tuning if you need 1k+ files or stricter SLAs.  
- **Strip for v1:** Don’t remove code; just don’t *rely* on convergence/pressure/direction/advisor for the gate. One clear path: `anchr audit` (or `anchr check`) → report → status + comment.

**Single lowest-level engine (recap):** Build dependency graph and public surface, compute violations (boundary + cycles), emit deterministic report (run.id, status, minimalCut, proofs). Same refs → same result. Everything else is orchestration and presentation.

---

## What to Keep / Strip / Expose / Wrap (Summary)

| Action | What |
|--------|------|
| **Keep** | graph/, structural/, parse/, resolve/, audit/, report schema, decision (report → action), anchr-structural-audit.ts, CLI audit + check, PR comment + status workflow, determinism contract. |
| **Strip from v1 scope** | Convergence, pressure, direction, advisor as *requirements* for the gate. (Code can remain; don’t depend on it for “pass/fail.”) |
| **Expose** | Single canonical command: `anchr audit` (or `anchr check`) with `--base`/`--head` or env, `--json`, `--strict`. Document as “the gate.” |
| **Wrap** | Optional: GitHub Action that sets env and runs that command. Optional: `.anchr.yml` for enforcement + ignore. |
| **Do not** | Rewrite engine, add dashboards, add new invariant layers for v1. |

You’re ~80% there. The right move is to **audit first** (done), then **expose and optionally thin the surface**, not rebuild.
