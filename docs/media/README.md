# Media assets for launch

Use these in README, DevHunt listing, and website as needed.

---

## Hero + social

| File | Use |
|------|-----|
| `website/public/og.png` | Open Graph / Twitter card (1200×630). Headline: "Architectural authority for AI-generated code." Subline: "Move at AI speed. Keep architectural control." Uses repo logo (anchor A). |
| `website/public/og.svg` | Source for OG card (exact logo from `logo.svg`). To regenerate PNG: `rsvg-convert -w 1200 -h 630 website/public/og.svg -o website/public/og.png` (requires `librsvg`). |
| `website/public/hero-comment.svg` | Hero + Demo BLOCK card: PR comment mockup using **repo logo** (exact anchor path from `logo.svg`). Copy: Architectural drift detected. Merge blocked.; Repository boundary violation; Suggested structural correction. Correct spelling. |
| `website/public/screenshot-block-pr-comment.png` | Optional PNG fallback; hero uses SVG for crisp logo. |

---

## 3 screenshots (Blueprint)

| File | Use |
|------|-----|
| `screenshot-block-pr-comment.png` | BLOCK case — PR comment with minimal cut visible. DevHunt + README. Live in `website/public/` (mockup aligned to current product copy). |
| `screenshot-verified-green.png` | VERIFIED case — green check / success state. DevHunt + README. |
| `screenshot-branch-protection-anchr.png` | Branch protection — ANCHR required check. DevHunt + README. |

**Website:** Hero and og.png in `website/public/` are updated to match current positioning. For the BLOCK screenshot, replace with a real screenshot from anchr-demo-monorepo when you have one; crop tightly, no scrolling. Comment should show: "Architectural drift detected. Merge blocked.", "violates repository boundaries", "Repository boundary violation", "Suggested structural correction".

---

## Demo GIF (recommended)

**File:** `demo-merge-blocked.gif` (create and add here)

Record 10–15 seconds:

1. Open clean PR in anchr-demo-monorepo → ANCHR check = VERIFIED.
2. Add internal import (e.g. `@market-os/core/internal`) → ANCHR = BLOCKED.
3. Attempt merge → blocked by required check.

Crop tightly. No scrolling. Use for README and DevHunt.

---

## Determinism proof (3 PRs)

Launch audit recommends zero variance on **3 PRs** (e.g. small, medium, large). Current script `scripts/hardening/day1-determinism.ts` runs **one PR** (ky#796) three times and asserts identical output. To complete the 3-PR proof:

1. Pick two more PRs (e.g. different repos or same repo, different PRs).
2. For each: get `base_sha` and `head_sha`, run ANCHR 3 times, confirm same decision and same explanation hash.
3. Document in `docs/determinism-proof.md` or a short note: "Zero variance on PR A, B, C."

No script change required; run the same 3-run comparison manually for the other two PRs, or extend the script with two more `PR` configs and a loop.
