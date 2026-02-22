# Media assets for launch

Use these in README, DevHunt listing, and website as needed.

---

## 3 screenshots (Blueprint)

| File | Use |
|------|-----|
| `screenshot-block-pr-comment.png` | BLOCK case — PR comment with minimal cut visible. DevHunt + README. |
| `screenshot-verified-green.png` | VERIFIED case — green check / success state. DevHunt + README. |
| `screenshot-branch-protection-anchr.png` | Branch protection — ANCHR required check. DevHunt + README. |

**Website:** Copies of these three files live in `website/public/` and are used in the site (Demo section grid + Install workflow tab). Edit the originals here; refresh the copies in `website/public/` when you replace with real screenshots.

These are placeholder/mockup assets. Replace with real screenshots from your repo (anchr-demo-monorepo or main repo) when you have them; crop tightly, no scrolling.

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
