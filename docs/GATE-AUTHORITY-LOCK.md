# Gate Authority Lock (Prompt 1 — Final)

Single canonical **Gate Mode** in ANCHR: the only supported enforcement path for CI and GitHub integration. Product-surface extraction; no engine rewrite.

---

## PART 1 — Canonical Gate Command

**CLI command:** `anchr gate`

**Documented CI entrypoint:** This is the only supported enforcement entrypoint for CI.

**Behavior:**
- **Input:** `--base <sha>` and `--head <sha>`, or env `GITHUB_BASE_SHA` / `GITHUB_HEAD_SHA`
- Runs structural audit only (no convergence in path)
- Writes `anchr-report.json` (unchanged schema)
- Enforcement derived strictly from structural report
- Exit codes: 0 (clean / advisory-warn), 1 (blocked), 2 (internal error)

---

## PART 2 — Enforcement Rules (Authoritative)

Gate enforcement is driven **only by `report.status`** (structural authority). The decision layer is derived and may evolve; the gate does not depend on `decision.level`.

### Report status → gate exit (constitutional contract)

| Report status   | Meaning                          | Gate exit |
|-----------------|----------------------------------|-----------|
| **VERIFIED**    | Clean; no structural violation   | 0         |
| **BLOCKED**     | Proven structural violation      | 1         |
| **INDETERMINATE** | Violation but proof missing    | STRICT → 1, ADVISORY → 0 (warn) |
| **INCOMPLETE**  | Execution failure / partial run  | 2         |

**Explicit mapping:**

- **VERIFIED:** exit 0.
- **BLOCKED:** exit 1.
- **INDETERMINATE:** STRICT → exit 1; ADVISORY → exit 0 (output WARN).
- **INCOMPLETE:** exit 2 (internal error). Never exit 1 or 0.

INDETERMINATE is **not** exit 2; INCOMPLETE is **not** exit 1. This table is the contract.

**Frozen exit codes:**
- **0** — clean or advisory-warn
- **1** — blocked (BLOCKED or INDETERMINATE in STRICT)
- **2** — internal execution error (refs missing, too_large, INCOMPLETE)

No other exit codes are used by gate.

### no_files behavior (locked)

When the diff has no relevant TypeScript files:

- The report **is still written** to `anchr-report.json` (minimal VERIFIED report).
- **run.id** is deterministic (minimal report includes `run.id`).
- Gate exits 0 (VERIFIED).
- Downstream tooling can always read a report; nothing is skipped.

---

## PART 3 — Isolation

- Convergence may run **after** report generation (e.g. in a separate workflow step).
- Convergence must **never** affect: exit code, enforcement decision, report identity, run.id.
- Gate works with convergence fully disabled.
- Other CLI paths (e.g. `audit`, `check`) do not override gate enforcement; they are marked non-canonical for enforcement.

---

## Policy Layer (v1 — Minimal & Frozen)

Policy is a **governance layer only**. It does not alter structural authority: graph, hashing, `buildReport()`, report schema, run.id, or status computation are unchanged.

**Schema (frozen v1):**

- `enforcement`: `STRICT` | `ADVISORY` (default ADVISORY)
- `ignore`: array of glob patterns (default `[]`)

**Resolution:** (1) CLI `--strict` → STRICT. (2) `.anchr.yml` `enforcement`. (3) Default ADVISORY.

**Ignore:** Applied only to changed file paths; filter runs before structural analysis. Stable ordering of remaining files. If all changed files are ignored, the audit still runs, report is written, and `report.status` is VERIFIED.

**Enforcement remains status-driven.** Policy does not reinterpret status and does not introduce new exit states. Gate exit is still: VERIFIED → 0, BLOCKED → 1, INDETERMINATE → STRICT→1 / ADVISORY→0, INCOMPLETE → 2.

Only `anchr gate` reads `.anchr.yml`. Unknown keys or invalid values → exit 2 with a clear error.

---

## PART 4 — Determinism

- Same base SHA + head SHA + same config (including ignore) → identical report.
- No timestamps in report output.
- No randomness.
- No non-deterministic ordering.
- Structural engine (graph, buildReport, run.id, proof contract) is unchanged.

**Ignore and run.id:** Ignore changes which paths are in the structural surface. So changing `.anchr.yml` ignore patterns legitimately changes run.id (fewer paths → different graph hash / report). Determinism is preserved: same inputs (base, head, config) → same report.

---

## PART 5 — Deliverables

### 1. Files touched

| File | Change |
|------|--------|
| `scripts/cli.ts` | Added `gate` command; enforcement from report only; exit 0/1/2. Updated `--help`; noted audit as non-canonical for enforcement. |
| `README.md` | CI step: `npx @arcsight-ai/anchr@1 gate`; added strict and local-run examples. |
| `docs/GATE-AUTHORITY-LOCK.md` | This document. |

**Not modified:** Graph logic, structural hashing, `buildReport()`, run.id semantics, proof contract, convergence internals. No new abstraction layers, no duplicated enforcement logic.

---

### 2. CLI usage

**CI (recommended):**
```bash
npx @arcsight-ai/anchr@1 gate
```
With env: `GITHUB_BASE_SHA`, `GITHUB_HEAD_SHA` (e.g. from `github.event.pull_request.base.sha` / `head.sha`).

**Strict (block on any violation):**
```bash
npx @arcsight-ai/anchr@1 gate --strict
```

**Explicit refs:**
```bash
npx @arcsight-ai/anchr@1 gate --base <base-sha> --head <head-sha>
npx @arcsight-ai/anchr@1 gate --strict --base <base-sha> --head <head-sha>
```

**Advisory (default):** Omit `--strict`. Violations produce WARN output but exit 0.

---

### 3. Gate execution flow (ASCII)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    anchr gate                           │
                    │  --base / --head   OR   GITHUB_BASE_SHA, GITHUB_HEAD_SHA │
                    └───────────────────────────────┬─────────────────────────┘
                                                    │
                                    refs missing? ──┼── yes ──► exit 2
                                                    │
                                                    ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │  runAnalysisAndWriteReport(cwd, { refs, mode: "branch" }) │
                    │  (structural audit only; no convergence)                  │
                    │  → artifacts/anchr-report.json (always written)         │
                    └───────────────────────────────┬─────────────────────────┘
                                                    │
                         no_files? ─────────────────┼── yes ──► report written; VERIFIED, exit 0
                         too_large? ────────────────┼── yes ──► exit 2
                                                    │
                                                    ▼
                    ┌─────────────────────────────────────────────────────────┐
                    │  Enforcement from report.status only (not decision.*)   │
                    └───────────────────────────────┬─────────────────────────┘
                                                    │
                         status === INCOMPLETE? ─────┼── yes ──► exit 2
                                                    │
                         status === BLOCKED? ────────┼── yes ──► exit 1
                                                    │
                         status === INDETERMINATE? ──┼── STRICT → exit 1
                                                    │          ADVISORY → WARN, exit 0
                                                    │
                                                    ▼
                         status === VERIFIED ────────► exit 0
```

**Convergence:** Not in this path. Optional later step can run convergence after report; it never changes exit code or run.id.

---

### 4. Confirmation

| Requirement | Status |
|-------------|--------|
| Structural engine unchanged | Yes. No changes to `src/graph/`, `src/structural/buildReport.ts`, run.id, or proof contract. |
| Convergence optional | Yes. Gate does not invoke convergence. Convergence does not affect exit or report. |
| Enforcement logic single-source | Yes. Gate derives exit only from `report.status` (structural authority). |
| Status-driven; no decision.level | Yes. Gate does not rely on `decision.level`; decision layer may evolve independently. |
| No duplicated policy logic | Yes. Gate uses one block in `cli.ts`; no second implementation of STRICT/ADVISORY. |
| no_files: report always written | Yes. Minimal report written; run.id set; downstream tooling unchanged. |

---

## Policy Layer (Prompt 2) — Deliverables

### Files touched

| File | Change |
|------|--------|
| `src/config/anchrYaml.ts` | New: load and validate `.anchr.yml` (v1 schema); unknown keys or invalid values throw. |
| `scripts/anchr-structural-audit.ts` | Read `ANCHR_IGNORE` env; filter diff entries by globs before analysis; if all ignored → write VERIFIED report and exit. |
| `scripts/cli.ts` | Gate: load config from repo root; resolve enforcement (CLI > .anchr.yml > ADVISORY); pass `ignorePatterns` to `runAnalysisAndWriteReport`; exit 2 on config error. `runAnalysisAndWriteReport` / `runStructuralAuditWithTimeout`: optional `ignorePatterns` / `extraEnv` (ANCHR_IGNORE). |
| `package.json` | Added dependencies: `minimatch`, `yaml`. |
| `README.md` | Added "Configuration (v1)" with example, resolution order, default ADVISORY, STRICT warning. |
| `docs/GATE-AUTHORITY-LOCK.md` | Policy Layer section; determinism note (ignore → run.id); deliverables (files, example, diagram, checklist). |

**Not modified:** Graph logic, hashing, `buildReport()`, report schema, run.id semantics, structural status computation.

### Example `.anchr.yml`

```yaml
enforcement: ADVISORY
ignore:
  - "tests/**"
  - "**/*.test.ts"
```

### Enforcement resolution diagram

```
  anchr gate [--strict?]
        │
        ▼
  Load .anchr.yml from repo root (if present)
        │
        ├── Unknown key or invalid value ──► exit 2, clear error
        │
        ▼
  Resolve enforcement:
        1) CLI --strict present?     ──► STRICT
        2) .anchr.yml enforcement?  ──► use it (STRICT | ADVISORY)
        3) Default                  ──► ADVISORY
        │
        ▼
  Run structural audit (with optional ignore filter)
        │
        ▼
  Apply status → exit (unchanged; policy does not reinterpret status)
```

### Confirmation checklist (policy layer)

| Requirement | Status |
|-------------|--------|
| Structural engine unchanged | Yes. No changes to graph, hashing, buildReport(), report schema, run.id, or status computation. |
| Determinism preserved | Yes. Same base + head + config → same report. Ignore changes surface and thus run.id by design. |
| No enforcement duplication | Yes. Policy only sets STRICT vs ADVISORY; gate still derives exit from report.status only. |
| Schema frozen (v1) | Yes. Only `enforcement` and `ignore`; unknown keys / invalid values → exit 2. |
