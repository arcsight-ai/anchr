# Cursor Prompt: Build ANCHR Landing Page

**Stack (locked):** `website/` at repo root. **Vite + React.** Single page only. Commands: `cd website && npm create vite@latest . -- --template react`, then implement.

---

## Copy/paste this into Cursor

Build the ANCHR landing page as a single-page site in **`website/`** at the repo root. Use **Vite + React**. Dark infra aesthetic (GitHub-dark inspired, not terminal cosplay). **Inter** for UI, **JetBrains Mono** only for code snippets.

**Theme tokens (CSS variables or Tailwind):**
- bg `#0B0F14`, alt `#0D1117`, surface `#111821`, border `#233041`
- text primary `#E6EDF3`, secondary `#9AA7B2`, muted `#6B7684`
- accent `#2F81F7`, success `#2EA043`, warn `#D29922`, danger `#F85149`
- radius: cards 16px, buttons 12px, pills 999px
- max width 1120–1200px, section gaps 24–32px

**Layout:**
- Sticky top nav: ANCHR left; Docs / GitHub / Install right; CTA "Add ANCHR workflow"
- Hero: headline, subhead, 2 CTAs (Add ANCHR workflow, Run locally), and a **PR-comment style card** visual
- Sections in order: What it catches (3 cards), How it works (4 steps), Scope contract, Install (GitHub Action + CLI tabs), Demo (links to 2 PRs placeholder), FAQ, Footer
- Responsive: 1 col mobile, 2–3 col desktop

**Hero PR-comment visual (must include):**
- Badge: PRE_MERGE
- Status: BLOCK — boundary_violation
- One-sentence reason
- MinimalCut: 2 bullets
- Evidence: 2 bullets
- run.id: short hash line
- Footer note: "Does not block merges"

Design the card like a GitHub comment: subtle borders, no glow, no heavy shadows.

**Copy (must include):**
- Scope: "ANCHR enforces structural boundaries in monorepos organized under packages/<name>/src. Other layouts are out-of-scope by contract."
- Hero headline (pick one): "Architectural risk, caught pre-merge." or "Structural boundaries. Deterministic signal."
- Subhead: "Opinionated boundary detection for monorepos under packages/<name>/src. Deterministic signal. Quiet early, confident before merge."

**No gimmicks:** No typing animation, no neon green, no cyberpunk.

**Deliverables:**
- Production-ready page in `website/` (Vite build, `npm run build` / `npm run dev`)
- Clean component structure (e.g. Nav, Hero, PRCommentCard, WhatItCatches, HowItWorks, ScopeContract, Install, Demo, FAQ, Footer)
- OpenGraph meta tags (title, description, image placeholder)
- Semantic HTML, Lighthouse-friendly

**Optional:** Trust row under hero: "Deterministic run.id • MinimalCut evidence • Quiet until pre-merge • No merge blocking"

Reference full spec: `docs/ANCHR-BRAND-LOOK-SYSTEM-V1.1.md`.
