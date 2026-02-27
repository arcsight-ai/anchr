# ANCHR Identity System (Locked)

Single source for brand casing, check name, CLI behavior, and vocabulary. No drift.

---

## 1. Brand vs CLI Casing

| Context | Casing | Example |
|--------|--------|---------|
| **Brand** (site, copy, docs, headers) | **ANCHR** (all caps) | "ANCHR enforces structure." |
| **CLI** (command, binary, repo name) | **anchr** (lowercase) | `npx @arcsight-ai/anchr@1 gate` (after install: `npx anchr gate`) |
| **GitHub Check** (workflow name, required status) | **ANCHR** | Require status checks: ☑ ANCHR |
| **Workflow file** | `anchr.yml` | `.github/workflows/anchr.yml` |
| **Domain** | anchr.sh | Footer, OG |

**Never use:** Anchr • anchr (as brand header)

**Rationale:** All caps = infrastructural, atomic. Lowercase CLI = Unix-native. Same pattern as ESLint (brand) / eslint (CLI), Docker / docker.

---

## 2. GitHub Check Display Name

Use exactly:

**name: ANCHR**

Not: ANCHR Check, ANCHR Gate, ANCHR CI.

In branch protection it appears as:

**Require status checks:** ☑ ANCHR

Minimal. Atomic. Infra.

---

## 3. CLI Output Brand Stamp

Every human-readable CLI run (audit, and where applicable check/fix) must start with:

```
ANCHR — Structural Gate
run.id: <hash>
```

Then the decision (VERIFIED / BLOCKED / etc.).

This header appears in local runs, workflow logs, and reinforces system identity. No "Fail", "Error", or "Warning" — ANCHR makes **decisions**, not complaints.

---

## 4. Visual Decision Terms

Use consistently:

- **VERIFIED** (green) — safe to merge
- **BLOCKED** (red) — structural violation

Never: Fail, Error, Warning (in user-facing decision copy).

---

## 5. Locked Phrases (Repeat Everywhere)

- **Structural Gate**
- **Deterministic**
- **One Decision Per PR**
- **Opinionated by Design**

Repetition builds authority.

---

## 6. Final Locked State

| Item | Value |
|------|--------|
| Brand | ANCHR |
| CLI | anchr |
| GitHub Check | ANCHR |
| Domain | anchr.sh |
| Workflow name | ANCHR |
| Workflow file | anchr.yml |

Single brand. Single system. Single check.
