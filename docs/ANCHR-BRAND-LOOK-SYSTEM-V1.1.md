# ANCHR Brand + Look System (v1.1)

Goal: Make ANCHR instantly legible (in 5 seconds), trusted (deterministic, scoped), and shareable (PR comment visual + "quiet until pre-merge").

**Core thesis:** People don't share tools that interrupt them. They share tools that feel like a senior reviewer who waited.

---

## 1. BRAND POSITIONING (CRISP + DEFENSIBLE)

**One-liner:**  
ANCHR is an opinionated structural boundary detector for monorepos organized as `packages/<name>/src` — designed to surface architectural risk pre-merge without blocking merges.

**Short subline:**  
Deterministic signal. Minimal noise. Clear scope.

**Tagline options (pick ONE):**
- A) Architectural risk, caught pre-merge.
- B) Structural boundaries. Deterministic signal.
- C) Quiet early. Loud when it matters.

---

## 2. VOICE + COPY RULES (UPGRADED)

**Principles:**
- Speak like tooling/docs, not marketing.
- Use contracts and constraints as confidence.
- Admit out-of-scope early (build trust).

**Word choices:**  
Use: deterministic, signal, boundary, contract, pre-merge, minimal cut  
Avoid: AI, smart, magic, agent, revolutionary, "never miss a bug", "works everywhere"

**Copy structure everywhere:**  
Status → Reason → MinimalCut → Evidence → Next Step

---

## 3. VISUAL IDENTITY (DARK INFRA, NOT TERMINAL COSPLAY)

### 3.1 Color Palette
| Role | Hex |
|------|-----|
| Background base | #0B0F14 |
| Background alt | #0D1117 |
| Surface | #111821 |
| Surface hover | #151F2B |
| Border | #233041 |
| Text primary | #E6EDF3 |
| Text secondary | #9AA7B2 |
| Text muted | #6B7684 |
| Accent | #2F81F7 |
| Accent hover | #5AA2FF |
| Success | #2EA043 |
| Warning | #D29922 |
| Danger | #F85149 |

Optional: subtle radial gradient background #0B0F14 → #0D1117.

### 3.2 Typography
- **Inter** for UI
- **JetBrains Mono** for code only

Sizing: H1 44–52, H2 28–34, Body 16–18, Label 13–14, Mono 13–14.

### 3.3 Shape + layout
- Radius: cards 16px, buttons 12px, pills 999px
- Max width: 1120–1200px
- Spacing: 24–32px section gaps

---

## 4. CORE PRODUCT MOMENTS (VIRAL MECHANICS)

- **PR Stage badge:** EARLY / ACTIVE_REVIEW / PRE_MERGE — "ANCHR stays quiet early and speaks when the signal is strong."
- **Deterministic run.id** visible in PR comment example.
- **MinimalCut** always shown (shareable screenshot).
- **"No blocking merges"** explicit in hero and install.

---

## 5. SITE STRUCTURE (ONE PAGE, DEVHUNT-OPTIMIZED)

- **NAV (sticky):** ANCHR wordmark left; Docs, GitHub, Install right; CTA "Install GitHub Action"
- **HERO:** Headline + subhead + 2 CTAs + PR-comment card visual (PRE_MERGE badge, BLOCK, reason, MinimalCut, Evidence, run.id, "Does not block merges")
- **What it catches:** 3 cards (boundary_violation, deleted_public_api, relative_escape + type_import_private_target)
- **How it works:** 4 steps
- **Opinionated by design:** Scope contract (packages/<name>/src, out-of-scope by contract)
- **Install:** GitHub Action + CLI tabs; safe defaults note
- **Demo:** Links to 2 PRs (VERIFIED + BLOCK) or run benchmark
- **FAQ:** Does it block merges? Deterministic? Scope? Languages? Tune?
- **Footer:** GitHub, License, "Built for pre-merge signal."

Optional **Trust row** under hero:  
Deterministic run.id • MinimalCut evidence • Quiet until pre-merge • No merge blocking

---

## 6. DESIGN RULES (ANTI-CRINGE)

- No neon green
- No terminal typing animation
- No "AI agent" language
- No "catches all bugs"
- Minimal gradients only
- Everything must screenshot well

---

## 7. ASSETS (MINIMUM VIABLE)

- Wordmark: ANCHR (text)
- Simple icon: anchor glyph or "A"
- OpenGraph image: dark card with "BLOCK — boundary_violation" + "Architectural risk, caught pre-merge."

---

## 8. WEBSITE (LAUNCH-LOCKED)

**Repo:** Main anchr repo is Node/TS CLI only. No website today.

**Site:** `/website` at repo root. **Vite + React.** Single page. Dark infra aesthetic. No blog. No CMS. No marketing sections. Install + explanation only.

**Cursor prompt:** `docs/ANCHR-LANDING-CURSOR-PROMPT.md` — paste as-is. No stack choice; implementation is decided.
