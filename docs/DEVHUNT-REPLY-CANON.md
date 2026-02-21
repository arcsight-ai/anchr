# DevHunt Reply Canon

Copy-paste ready. Use as-is. No edits day-of.

---

## Pinned comment (post first)

**ANCHR in one line**

ANCHR is the merge-time structural gate for TypeScript monorepos: one decision per PR (VERIFIED or BLOCKED), backed by a dependency graph and a minimal cut.

**What it is not:** a linter (we don’t do style or syntax), a report you interpret (we decide), or tied to a build system (no Nx/Turborepo required). We support one layout—`packages/<name>/src`—so the contract is explicit and deterministic.

**Why it exists:** Code review catches logic; ANCHR enforces structure. Architecture is too important to leave to convention. If that’s your problem, this is the gate.

---

## Comment 1 — "Why not just use ESLint?"

ESLint operates at the file level.
ANCHR builds a full package-level dependency graph and computes structural violations as graph problems (cycles, cross-boundary imports, minimal cuts).

This isn’t a stylistic rule — it’s a merge-time architectural decision with evidence.

Different layer. Different job.

---

## Comment 2 — "Why only packages/<name>/src?"

Because determinism matters.

ANCHR supports one explicit layout: packages/<name>/src.
No heuristics. No config guessing. Same repo → same result every time.

It’s opinionated by design. If you want layout-agnostic tooling, there are options. If you want deterministic structural enforcement, this contract makes it possible.

---

## Comment 3 — "How is this different from dependency-cruiser?"

dependency-cruiser generates reports.

ANCHR produces one required merge-time decision: VERIFIED or BLOCKED — backed by a minimal cut and a GitHub Check that can gate merges.

Same input, same output, enforceable in CI.

It’s not "analyze and interpret."
It’s "decide and enforce."

---

## Comment 4 — "Why not Nx or Turborepo constraints?"

Nx and Turborepo enforce rules inside their ecosystems.

ANCHR is build-agnostic. It works in any repo that follows the layout contract — no framework adoption required.

If you’re already on Nx, great. If you’re not, ANCHR gives you structural enforcement without coupling to a build system.

---

## Comment 5 — "Isn’t this too strict?"

It’s strict by intent.

Architecture drift is expensive because it compounds quietly. ANCHR stops violations at merge time — when they’re cheapest to fix.

One clear decision per PR: merge or fix.

Teams that care about structural discipline use gates. ANCHR is that gate.
