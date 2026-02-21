# ANCHR Launch Readiness Audit

Infra product audit. No feature suggestions; only gaps that reduce infra-grade perception.

**Outcome (after install fix):** LAUNCH READY: YES.

---

## 1. GitHub App / Install readiness

| Question | Status |
|----------|--------|
| Install flow production-ready? | **YES.** README has "Add ArcSight to your repo" with copy-paste workflow. No GitHub App required; workflow-based install is explicit. |
| Can it be required as a GitHub Check? | **YES.** Job name `ArcSight`; branch protection can require it. |
| Does it block a real PR? | **YES.** `npx anchr@latest audit` exits 1 on BLOCKED; job fails; check fails. |
| Permissions minimal? | **YES.** Workflow uses `contents: read`, `pull-requests: read`. |

**Public language:** "Add the ArcSight workflow" (not "Install GitHub App"). Launch copy and README aligned.

---

## 2. Determinism

Same input → same decision. No randomness on verdict path. Determinism tests green. No critical gaps.

---

## 3. Launch credibility

No exploratory language. No "coming soon." Stack locked (Vite + React, /website). Copy frozen. No critical gaps.

---

## 4. Website

Plan locked. Not built yet; implementation follows Cursor prompt. No critical gaps.

---

## 5. DevHunt risk

Canonical replies in `docs/DEVHUNT-REPLY-CANON.md`. Pinned comment + 5 objections covered. No critical gaps.

---

## Blocking issue (resolved)

**Was:** Install path undefined. Copy said "Install GitHub App" with no App link or workflow snippet.

**Fix:** Option A — workflow-based install. README section "Add ArcSight to your repo" with full workflow YAML. Launch copy and DevHunt listing updated to "Add ArcSight workflow." Install is copy-paste, explicit, production-ready.

---

## LAUNCH READY: YES

- Determinism: solid  
- CLI: works  
- Workflow: blocks PR when BLOCKED  
- Install path: defined (workflow in README)  
- No ambiguity
