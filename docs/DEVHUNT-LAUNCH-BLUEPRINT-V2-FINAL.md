# ANCHR — 10/10 DevHunt Launch Blueprint (V2 Final)

Founder-grade launch execution document. Not just a checklist.

---

## 🎯 Launch Objective

Launch only when ANCHR feels like:

- **Infrastructure**
- **Deterministic**
- **Strict**
- **Install-and-block**
- **Objection-proof**

Not a tool. Not a research project. Not a side project.

---

## 📊 Scoring Framework (So 10/10 Is Measurable)

Before launch, ANCHR must score:

| Category | Target |
|----------|--------|
| Determinism | 10/10 |
| Precision (FP/FN) | 10/10 |
| Enforcement Strength | 10/10 |
| Install Experience | 10/10 |
| Visual Authority | 10/10 |
| Clarity of Positioning | 10/10 |

**Gate:** If any category &lt; 9 → do not launch.

---

## PHASE 1 — Signal Perfection (Technical Authority)

### 1️⃣ Resolve the FN Completely

You must choose:

**A) Fix the FN**  
Improve discovery logic.

**B) Formally Bound It**  
Document explicitly:

- In-scope detection
- Out-of-scope detection
- Structural reasoning

No silent edge cases.

**Definition of Done:** No “we think” language. Only deterministic scope definition.

---

**Status (FN):** Formally bounded. See `docs/SCOPE-DETECTION-CONTRACT.md` — in-scope = `packages/<name>/src` only; ky_751 out-of-scope.

---

### 2️⃣ Determinism as a Public Claim

README must include:

- Determinism certification summary
- 10-run byte-identical test
- Stable sorting enforced
- No time-based logic
- Deterministic verdict mapping

**Framing:** *Deterministic by construction.* This is your moat.

---

### 3️⃣ Strict Verdict Policy (Launch Mode)

For DevHunt:

- MERGE_BLOCKED → failure
- REVIEW_REQUIRED → failure
- VERIFIED → success

No soft neutrality. No partial enforcement. **Strict &gt; nuanced.**

---

### 4️⃣ External Repo Validation

Before launch, run ANCHR on:

- 3 real open-source repos
- 1 messy monorepo
- 1 small repo
- 1 medium repo

**Measure:** False positives, false negatives, output clarity.

**Goal:** Confidence that behavior generalizes.

---

## PHASE 2 — Demo Authority Layer

This is what converts skeptics instantly.

### 5️⃣ Build Public Demo Repo (anchr-demo-monorepo)

Must include:

- Module boundaries defined
- Branch protection enabled
- Required ANCHR check enforced
- 1 clean PR (VERIFIED)
- 1 boundary violation PR (BLOCKED)
- 1 circular dependency PR (BLOCKED)

Everything visible. This is your proof anchor.

---

### 6️⃣ Screenshot Optimization

You need exactly 3 screenshots:

1. **BLOCK case** — minimal cut visible
2. **VERIFIED case** — clean green
3. **Branch protection page** — ANCHR required

No scrolling. No clutter. Cropped tightly. Visual authority matters more than extra features.

---

## PHASE 3 — Install Experience 10/10

Your weakest layer today.

### 7️⃣ Zero-Config Default

On install:

- No YAML required
- No config file required
- Sensible default boundary logic

If config exists: it must be **optional**.

---

### 8️⃣ 2-Minute First Value Test

**Cold test:** Fresh repo → install → open PR → verdict. Time it.

**Target:** Under 2 minutes. If not: simplify.

---

### 9️⃣ Remove Friction Signals

Remove words like: *experimental*, *beta*, *prototype*, *research*.

Replace with: *enforce*, *block*, *prevent*, *deterministic*.

You are infrastructure.

---

## PHASE 4 — Positioning Precision

This is where DevHunt traction lives or dies.

### 🔟 One-Sentence Positioning

**Example:**  
*ANCHR is a GitHub App that blocks architectural drift by enforcing module boundaries as a required status check.*

Concrete. Enforcement-driven. Not abstract.

---

### 11️⃣ README Rewrite (Above-the-Fold Optimization)

Top must include:

1. Positioning sentence
2. Install button
3. 3-step usage
4. BLOCK screenshot
5. Deterministic claim

Nothing else above fold. No theory essays.

---

### 12️⃣ DevHunt Listing Structure

Structure must be:

- Headline
- Problem
- Solution
- How it works (3 bullets)
- Why it matters
- Demo link

Short. Confident. Non-defensive.

---

## PHASE 5 — Psychological Authority Layer

This separates 8/10 launches from 10/10 launches.

### 13️⃣ Language Audit

Replace: *analyze*, *detect*, *suggest*  
With: *enforce*, *block*, *prevent*

You are not advisory. You are enforcement.

---

### 14️⃣ Remove Ambiguity Everywhere

If something might confuse: simplify it. **Authority = clarity.**

---

## PHASE 6 — Launch Gate Checklist (Non-Negotiable)

You do **NOT** launch until:

| # | Gate |
|---|------|
| ✔ | Determinism certified |
| ✔ | FN resolved or formally bounded |
| ✔ | Hard merge gate validated |
| ✔ | Demo repo public |
| ✔ | Required status check visible |
| ✔ | Install &lt; 2 minutes |
| ✔ | Screenshots polished |
| ✔ | README optimized |
| ✔ | Language authority consistent |
| ✔ | No experimental signals |

**If any missing → no launch.**

---

## PHASE 7 — Launch Sequence

**Day 0:**

- DevHunt
- X thread
- LinkedIn builder post

**Day 1:**

- Show HN
- r/programming
- r/typescript
- r/javascript

**Angle:** “Deterministic structural merge gate that blocks architectural drift.”  
**Not:** “Launching a startup.”

---

## PHASE 8 — Post-Launch Containment

During first 7 days:

**Do NOT:**

- Add features
- Pivot positioning
- Add SaaS
- Add dashboards

**Only:**

- Fix crashes
- Fix false positives
- Improve clarity

**Track:**

- Install count
- % enabling required check
- Block frequency
- False positive reports

---

## Kill Criteria (Be Ruthless)

Kill or pivot if:

- FP &gt; 15%
- Structural violations rare
- No one enables required check
- Install friction complaints persist
- Install count flat after exposure

No ego.

---

## Anti-Overbuild Guardrails

Until validation:

- No billing
- No dashboards
- No analytics
- No enterprise features
- No CLI expansion

**Enforcement first. Expansion later.**

---

## Honest Assessment

Right now:

| Area | Score |
|------|--------|
| Engine | 9/10 |
| Enforcement | 9/10 |
| Install Experience | ~6/10 |
| Visual Authority | ~5/10 |

This blueprint gets everything to 10/10.

---

## Execute in Order

**Next move — choose one:**

1. **Fix/resolve FN** — Improve discovery or formally bound scope (ky_751).
2. **Build demo repo** — Public anchr-demo-monorepo with boundaries, branch protection, VERIFIED + 2× BLOCKED PRs.
3. **Rewrite README + positioning** — One-sentence positioning, above-the-fold install + screenshots + deterministic claim.

We execute in order. Your move.
