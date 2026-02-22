# Ship-readiness audit for ANCHR

Quick pass against the audit criteria, plus the **paste bundle** for a line-by-line review (hero text, CTAs, structure). No screenshots — run locally or use DevTools device toolbar for iPhone viewport.

---

## 1) Positioning and clarity (desktop + mobile)

| Criterion | Status | Note |
|-----------|--------|------|
| In ≤3s: **What is it?** → merge-time structural gate | ✅ | H1: "The merge-time structural gate for TypeScript monorepos." |
| In ≤3s: **For who?** → TypeScript monorepos | ✅ | H1 + audience line: "For teams with layered or bounded architectures. Enforcement before merge." |
| In ≤3s: **What happens?** → VERIFIED/BLOCKED on PR with evidence | ✅ | Subheading: "posts one decision — VERIFIED or BLOCKED — on the PR." |
| "Not a linter" present and punchy | ✅ | Section: "Linters analyze. ANCHR decides. / Linters report. ANCHR gates. / One decision per PR." |
| Graph → Cut → Decide exists, doesn’t dominate | ✅ | Short section with mechanism line + one supporting line. |

**Common failure avoided:** Hero leads with outcome (gate, one decision) then mechanism in one sentence; no mechanism-first wall.

---

## 2) CTA and conversion path

| Criterion | Status | Note |
|-----------|--------|------|
| Primary CTA above the fold (desktop + mobile) | ✅ | Hero has primary + secondary; mobile nav shows hamburger, primary CTA in dropdown (still one tap). |
| Primary CTA repeated mid-page + footer | ✅ | One decision section, Install section, Footer. |
| Visually dominant every time | ✅ | `.btn-primary` padding 14px 24px, font-weight 600; secondary is outline. |
| Primary CTA → single obvious next step | ✅ | All primary CTAs link to `#install` (workflow + branch protection). |
| Friction line present | ✅ | "Installs in minutes. No configuration. No dashboard." under hero and under One decision CTA. |

**Common failure avoided:** Secondary "View on GitHub" is `.btn-secondary`; primary is solid and first in order.

---

## 3) "One decision per PR" visual anchor

| Criterion | Status | Note |
|-----------|--------|------|
| Mock reads at a glance: Status stands out | ✅ | `.check-mock-status` (BLOCKED) red + bold. |
| Reason short | ✅ | "Reason: boundary violation" |
| Minimal cut concrete | ✅ | "Minimal cut: packages/api → packages/internal" |
| Mobile: no horizontal overflow | ✅ | `.check-mock` max-width 420px, padding 16px at 768px; container has safe-area padding. |
| Mono font only where helpful | ✅ | Whole block is mono (check-style); edge line is one row. |

**Common failure avoided:** Block uses `.check-mock` card styling (title, rows), not a code snippet.

---

## 4) Narrow positioning

| Criterion | Status | Note |
|-----------|--------|------|
| Narrow in hero | ✅ | "TypeScript monorepos" in H1. |
| One subtle expandable line | ✅ | Scope section: "TypeScript monorepos first. More ecosystems later." (muted, small). |

---

## 5) Mobile UX

| Criterion | Status | Note |
|-----------|--------|------|
| Hero no awkward single-word wraps (e.g. 375px) | ⚠️ | H1 is long; at 480px h1 is 2rem. Suggest quick check at 375px — if "monorepos." wraps alone, consider minor tweak. |
| Tap targets ~44px | ✅ | `.nav-links .btn` and `.faq-trigger` min-height 44px/48px; nav-toggle 44px. |
| Section spacing intentional | ✅ | 48px section padding on mobile; dividers. |
| No sticky covering CTAs | ✅ | Nav is sticky; hero CTA is below nav. DevHunt banner is static HTML at top. |

---

## 6) Accessibility and semantics

| Criterion | Status | Note |
|-----------|--------|------|
| One `<h1>` | ✅ | Only in Hero. |
| Heading hierarchy (h2, h3) | ✅ | Sections use h2; cards use h3. |
| Buttons/links real and labeled | ✅ | Nav toggle has aria-label; CTAs are `<a href="#install">`. |
| Focus states visible | ✅ | `.btn:focus-visible`, `.nav-toggle:focus-visible` outline. |
| Color contrast | ✅ | CTA is accent on dark; subtle text uses --text-muted (audit previously improved). |

**Quick test:** Tab from address bar → Skip link first, then nav, then main content and primary CTA.

---

## 7) Performance + stability

| Criterion | Status | Note |
|-----------|--------|------|
| CLS effectively zero | ✅ | Critical CSS matches full CSS (typography, spacing); no webfonts; no DevHunt script. |
| No third-party layout shift | ✅ | DevHunt script removed; custom static banner. |
| Lighthouse Performance ~95+ (mobile target) | ⚠️ | Run locally/production once to confirm; no new scripts or fonts added. |

---

## 8) SEO + social (Prompt 4)

| Criterion | Status | Note |
|-----------|--------|------|
| `<title>` specific | ✅ | "ANCHR — Merge-Time Structural Gate for TypeScript Monorepos" |
| Meta description includes VERIFIED/BLOCKED | ✅ | "…one deterministic decision — VERIFIED or BLOCKED." |
| OG/Twitter intentional | ✅ | og:title, og:description, twitter:card summary_large_image, og:image 1200×630. |
| OG image exists and readable | ✅ | `website/public/og.png` with ANCHR, subtitle, one decision line. |

---

## 9) Trust signals

| Criterion | Status | Note |
|-----------|--------|------|
| At least one credibility line | ✅ | Determinism: "Same input → same output. Enforcement at merge time." FAQ: "minimal cut as evidence", "Same input → same output." |
| No undefensible claims | ✅ | No "enterprise-grade"; "deterministic" and "evidence" are accurate. |

---

## Paste bundle for line-by-line audit

**Hero (exact copy)**

- **H1:** The merge-time structural gate for TypeScript monorepos.
- **Subheading:** ANCHR builds the graph from each PR, computes the minimal cut, posts one decision — VERIFIED or BLOCKED — on the PR.
- **Audience:** For teams with layered or bounded architectures. Enforcement before merge.
- **Primary CTA:** Add ANCHR to my repo → `#install`
- **Secondary CTA:** View on GitHub → `https://github.com/arcsight-ai/anchr`
- **Friction line:** Installs in minutes. No configuration. No dashboard.

**CTAs and links**

| CTA | Wording | Destination | Where |
|-----|---------|-------------|------|
| Primary | Add ANCHR to my repo | `#install` | Nav (desktop + mobile menu), Hero, One decision section, Install section (under workflow), Footer |
| Secondary | View on GitHub | `https://github.com/arcsight-ai/anchr` | Hero only (nav has "GitHub" text link, not button) |

**One decision mock (check block)**

- Title: ANCHR Check  
- Status: BLOCKED (red, bold)  
- Reason: boundary violation  
- Minimal cut: packages/api → packages/internal  

**Desktop vs mobile (structure only; no screenshot)**

- **Desktop:** Nav bar (logo + Docs, Install, GitHub, primary CTA). Hero: two-column (text left, screenshot right); primary then secondary CTA; friction line. Sections: One decision (check mock + CTA), Not a linter, Graph → Cut → Decide, What it catches, How it works, Scope (with "TypeScript monorepos first. More ecosystems later."), Install, Demo, FAQ, Footer (logo, primary CTA, friction line, links).
- **Mobile:** Same content. Nav: logo + hamburger; primary CTA and links in dropdown. Hero stacks (text then image). Section padding 48px; check-mock and cards stay within container (no horizontal scroll). Tap targets 44px+.

**Suggested 10-minute checks**

1. Open at 375px (e.g. iPhone SE), hard refresh: hero + first section readable?  
2. Click "Add ANCHR to my repo": lands on Install with workflow + copy and branch protection.  
3. Share URL in Slack/DM: preview shows og:title, og:description, og.png.  
4. Run Lighthouse mobile once: note CLS and Performance score.

---

## Change made for this audit

- **Scope section:** Added one line: "TypeScript monorepos first. More ecosystems later." (muted, 14px) so narrow positioning is explicit in the hero and expandable in one place without broadening the main message.
