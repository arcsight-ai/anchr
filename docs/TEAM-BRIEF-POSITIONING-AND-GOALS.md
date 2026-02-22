# Team brief: ANCHR positioning & goals (for improvement roadmap)

Use this to align the team and to feed a prioritized improvement roadmap (messaging, conversion, trust, etc.). **Correct any of this** so it matches reality; then you can hand the three answers to whoever is driving the roadmap.

---

## 1. Exactly what ANCHR does

**One sentence (current canon):**  
ANCHR is the merge-time structural gate: it builds the dependency graph from a PR, computes minimal cut for structural risk, and posts one decision per PR (VERIFIED or BLOCKED) with evidence on the PR. Not a linter—package-level structure. Runs as GitHub App or CI.

**Slightly longer (for roadmap/positioning):**  
ANCHR enforces structural boundaries at merge time. One decision per PR: VERIFIED or BLOCKED. It builds the dependency graph from the diff, computes the minimal cut when there’s a boundary violation or cycle, and runs as a GitHub Check. Deterministic. For TypeScript monorepos with `packages/<name>/src`. No config, no dashboard, one YAML file.

**Mechanism (trust/positioning):**  
Graph → Cut → Decide. Same input → same output. Evidence (minimal cut) in every comment.

---

## 2. Your ideal user

**From canon (messaging canon + FAQ):**  
Teams with **monorepos**, **layered architectures**, or **strict dependency boundaries**. Validated on real repositories.

**More concrete:**  
- TypeScript monorepos (layout: `packages/<name>/src`).  
- Teams that care about structural discipline and want a gate, not “analyze and interpret.”  
- People who’ve hit boundary drift, cross-package internal imports, or cycles and want merge-time enforcement without adopting Nx/Turborepo.

**One-line for the site:**  
*Built for teams with TypeScript monorepos who need one clear structural decision before merge.*

(Adjust “teams,” “TypeScript,” “monorepos” if you want to broaden or narrow.)

---

## 3. Your goal (pick/confirm so the roadmap can be tailored)

The site doesn’t state a single goal explicitly. Below are **options**—choose what you’re optimizing for so improvements can be prioritized (e.g. headline, CTA, proof, DevHunt).

| Goal | What “success” looks like | Levers to prioritize |
|------|----------------------------|----------------------|
| **Adoption** | More repos adding the ANCHR workflow / GitHub App | Strong CTA, “Add to my repo,” friction reduction (60 seconds, no signup), clear install path |
| **GitHub stars / visibility** | Stars, forks, “View on GitHub” traffic | Social proof, “Open source · MIT,” technical depth, comparison vs ESLint/dependency-cruiser |
| **DevHunt / launch** | Strong launch week, upvotes, comments | Sharp headline, one visual anchor, proof line, category-defining (“merge-time structural gate”) |
| **Credibility / trust** | Seen as serious, deterministic, production-ready | One proof element, “Why we built this,” mechanism (Graph. Cut. Decide.), technical depth |
| **Lead gen / waitlist** | Emails or signups (if you add that later) | Primary CTA, friction reduction, trust signals |

**Suggested default for “optimize the product surface” right now:**  
**Adoption + DevHunt launch.** So: sharpen headline and audience line, strengthen and repeat the primary CTA (“Add ANCHR to my repo”), add one proof element and one visual anchor, keep meta/social sharp. Then iterate based on launch feedback.

---

## Quick copy-paste for the team

**What ANCHR does:**  
Merge-time structural gate. One decision per PR (VERIFIED or BLOCKED). Builds dependency graph, minimal cut, posts evidence on the PR. GitHub App or CI. For TypeScript monorepos (`packages/<name>/src`). Deterministic; not a linter.

**Ideal user:**  
Teams with TypeScript monorepos (or strict dependency boundaries) who want one clear structural decision before merge—no manual structure review, no “analyze and interpret.”

**Goal (confirm/edit):**  
[ ] Adoption (repos adding workflow)  
[ ] GitHub stars / visibility  
[ ] DevHunt launch (votes, awareness)  
[ ] Credibility / trust  
[ ] Other: ___

Once you confirm or edit the goal(s), the improvement list (messaging, conversion, trust, technical polish) can be turned into a **prioritized roadmap** tailored to that outcome instead of generic best practices.
