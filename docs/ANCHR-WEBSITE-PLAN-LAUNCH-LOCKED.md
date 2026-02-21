# ANCHR — Website Plan (Launch Locked)

Decisions made. No open loops. This is the authoritative website plan.

---

## 1. Repo Status

The main anchr repo is Node/TypeScript CLI only. There is no website.

We will create:

- **Path:** `/website`
- **Type:** Static site
- **Stack:** Vite + React
- **Aesthetic:** Dark infra
- **Scope:** Single-page only

No blog. No CMS. No marketing sections. This is an install + explanation page.

---

## 2. Brand Spec (Finalized)

**Saved:** `docs/ANCHR-BRAND-LOOK-SYSTEM-V1.1.md`

Defines: positioning, voice rules, visual identity, color tokens, typography, layout, component design, product moments (PR comment visual), scope contract language, design guardrails, OpenGraph strategy.

This is the authoritative brand reference. No deviation unless intentional.

---

## 3. Cursor Implementation Prompt (Final)

**Saved:** `docs/ANCHR-LANDING-CURSOR-PROMPT.md`

Assumes Vite + React in `/website`. Defines theme tokens, layout hierarchy, hero PR-comment visual, copy structure, scope contract section, install tabs, demo section, FAQ, OpenGraph + metadata. Enforces no-gimmicks rules. Paste into Cursor as-is.

---

## 4. Launch Copy (Canonical)

**Saved:** `docs/ANCHR-LAUNCH-COPY-V6.md`

Single source of truth for landing and DevHunt. Copy is frozen for launch unless a critical issue is discovered. Public CLI: `npx anchr audit`.

---

## 5. Site Structure (Final)

Single page, in order:

- Nav
- Hero (PR comment visual)
- What it catches
- How it works
- Scope is a feature
- Install
- Demo (2 PR links placeholder)
- FAQ
- Footer

Nothing else.

---

## 6. Visual Contract

Dark only. Base `#0B0F14`, surface `#111821`, accent `#2F81F7`. No terminal cosplay, no neon green, no animated typing, no gradient hero explosions. Everything must screenshot well.

---

## 7. Product Visual (Critical)

Hero includes: Badge PRE_MERGE, Status BLOCK — boundary_violation, reason line, MinimalCut (2 bullets), Evidence (2 bullets), run.id hash, footer "Does not block merges." This is the viral screenshot.

---

## 8. Determinism Messaging (Must Appear)

Explicit line on page:

"ANCHR enforces structural boundaries in monorepos organized under packages/<name>/src. Other layouts are out-of-scope by contract."

---

## 9. Launch Checklist

Before DevHunt:

- [ ] anchr.sh domain purchased
- [ ] DNS pointed
- [ ] OG image created
- [ ] Demo repo with 2 PRs live
- [ ] Install flow tested
- [ ] GitHub Action link correct
- [ ] Lighthouse 90+
- [ ] Mobile responsive verified

---

## 10. Status

Launch copy: locked. Brand system: defined. Website: ready for implementation. CLI: `npx anchr audit`. Stack: Vite + React in `/website`.
