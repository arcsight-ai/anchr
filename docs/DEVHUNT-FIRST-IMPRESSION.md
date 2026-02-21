# DevHunt First Impression Simulation

First 10 seconds from a skeptical DevHunt user. Use to stress-test hero, CTA, and pinned comment.

---

## Scroll moment

**They see:** Code Review Catches Logic. ANCHR Enforces Structure.

**Reaction:** "Okay. That's opinionated."

**They read subheading:** Deterministic structural gate… VERIFIED or BLOCKED.

**Reaction:** "So it blocks PRs based on structure." Good.

---

## First internal questions (all armed)

1. "Is this just ESLint?" → Reply: ESLint is file-level; ANCHR is graph + minimal cut. Different layer.
2. "Why only packages/<name>/src?" → Reply: Determinism. One explicit layout; no heuristics.
3. "Why not dependency-cruiser?" → Reply: Reports vs one decision. We decide and enforce.
4. "Is this too strict?" → Reply: Strict by intent. Stops drift at merge time when cost is lowest.
5. "Does this actually work?" → Reply: Add workflow, require check. VERIFIED or BLOCKED per PR.

Canonical replies in `docs/DEVHUNT-REPLY-CANON.md`.

---

## What would kill it

- Install doesn’t work in under 60 seconds
- Workflow unclear or missing
- Site feels marketing-heavy
- Hero vague or exploratory
- GitHub repo looks experimental (failing tests, TODOs, "coming soon")

If none of these are true: strong.

---

## Perception score (install path fixed)

| Dimension      | Score |
|----------------|-------|
| Clarity        | 9/10  |
| Authority      | 9/10  |
| Infra energy   | 9/10  |
| Viral potential| 8/10  |

To push viral to 9: use the short launch pinned comment (in DEVHUNT-REPLY-CANON.md). Short. Declarative. No defense.
