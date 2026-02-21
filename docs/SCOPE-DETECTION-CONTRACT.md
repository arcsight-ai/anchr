# ANCHR — Scope & Detection Contract

Deterministic definition of in-scope and out-of-scope detection. No silent edge cases. No "we think" language.

---

## 1. Package discovery (source of truth)

Boundary violation detection runs **only** when the repository contains at least one **discovered package**.

**Discovery rule (deterministic):**

- Scan exactly one directory: `<repoRoot>/packages/`.
- For each immediate subdirectory `D` of `packages/` that is a directory (not a symlink):
  - If `<repoRoot>/packages/D/src` exists and is a directory → **discovered package** with name `D` and root `<repoRoot>/packages/D`.
- No other paths are scanned. No environment variables or config files alter this rule in the default engine.

**Result:**

- If zero packages are discovered → boundary violation detection is **not performed**. Cycle detection may still run over files under `packages/` if present; if `packages/` is missing or empty of valid packages, no boundary violations are ever emitted.
- If one or more packages are discovered → boundary violation detection runs over those packages only (public surface, import resolution, and minimal cut are defined relative to this set).

---

## 2. In-scope (detection applies)

**In-scope** = repositories for which the discovery rule yields at least one package.

- Boundary violations (cross-package internal import, relative escape, deleted public API, type-import private target) are reported **only** for files under `packages/<name>/src/` of a discovered package.
- Circular dependency detection applies to the graph built from those packages.
- Verdict (VERIFIED / BLOCKED) is determined by the presence or absence of violations in this set.

**Structural reasoning:** The engine enforces boundaries between discovered packages. It does not infer or assume any other module layout.

---

## 3. Out-of-scope (detection not applied)

**Out-of-scope** = repositories for which the discovery rule yields zero packages.

- Repositories that do **not** have a `packages/` directory, or for which no subdirectory of `packages/` has a `src` child directory, are **out-of-scope** for boundary violation detection.
- Examples (deterministic, not exhaustive):
  - Monorepos that use a top-level `source/` (or similar) instead of `packages/` and do not also have `packages/<name>/src`.
  - Single-package repos with no `packages/` layout.
  - Repositories where the only code lives under paths other than `packages/<name>/src/`.

**Behavior:** For such repositories, the engine will not report boundary violations. The report may be VERIFIED with empty minimal cut because no boundaries were defined. This is **not** a defect; it is the defined behavior for out-of-scope layouts.

---

## 4. Known FN under current contract: sindresorhus_ky_751

| Item | Value |
|------|--------|
| **PR** | sindresorhus/ky#751 |
| **Human ground truth** | BLOCK — "Introduces new in-repo dependency edge (utils → core), potentially violating architectural layering." |
| **Engine output** | ALLOW (VERIFIED), empty minimal cut. |
| **Classification** | **Out-of-scope under current contract.** The repository (ky) does not use the `packages/<name>/src` layout that the discovery rule scans. Therefore boundary violation detection is not performed; the engine correctly reports no boundary violations for the defined scope. The human verdict applies to a different structural model (utils vs core) that the engine does not currently define. |

**Conclusion:** This is a **scope boundary**, not a precision defect. The FN is formally **bounded**: the engine’s scope is explicitly defined; ky_751 lies outside that scope. Resolving it would require either (A) extending the discovery rule (e.g. adding another scanned path) under a new contract, or (B) leaving the contract as-is and treating this case as out-of-scope. Current state: **(B) — formally bounded.**

---

## 5. Definition of Done (FN resolution)

- [x] In-scope detection defined deterministically (Section 1–2).
- [x] Out-of-scope detection defined deterministically (Section 3).
- [x] Structural reasoning stated (no inference of other layouts).
- [x] Known FN (ky_751) classified and explained (Section 4).
- [x] No "we think" language; only deterministic scope definition.

---

## 6. Contract stability

- Changes to the discovery rule (e.g. additional paths, or config-driven discovery) require a **new contract version** and explicit documentation of the new rule.
- The default engine behavior is fixed to the rule in Section 1 unless such a change is versioned and documented here or in a successor contract.
