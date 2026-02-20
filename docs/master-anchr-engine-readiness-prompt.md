# MASTER ANCHR ENGINE READINESS PROMPT (FINAL VERSION)

Copy. Paste. Run this against the ANCHR repo. No philosophy. No fluff.

---

You are auditing the ANCHR codebase for launch readiness under the "Termination-Grade Completion Contract".

You must:

1. Inspect the repository.
2. Compare implementation against the checklist requirements.
3. Mark each section RED / AMBER / GREEN.
4. Provide objective evidence (file paths, functions, CI configs).
5. Identify only real blockers.
6. Output a 7-day execution plan.
7. Make a ship / no-ship recommendation.

Do NOT speculate.
Do NOT invent missing structure.
Only judge based on actual code and artifacts.

---

## CONTRACT CRITERIA

Evaluate against the following REQUIRED sections:

**SECTION 0 — Wedge Ground Truth**

- Capability map exists
- End-to-end trace doc exists
- Wedge vs ANCHR gap documented
- No undocumented structural modules

**SECTION 1 — Structural Dominance**

- Minimal cut influences decision
- Invariants influence decision
- Convergence influences decision
- No heuristic-only block path
- Deterministic runs (3 identical results)
- Golden baseline stored
- CI decision drift detection

**SECTION 2 — Signal Validity**

- Positive correlation(diff_size, coverage)
- Large violation rate ≥ 2x small
- Coverage variance > 0
- Blind precision ≥ 70%
- Catastrophic FP = 0
- Adversarial add/remove dependency test run

**SECTION 3 — Explainability**

- Decision explanation includes file paths
- Dependency path shown
- Minimal cut shown
- Architectural consequence explained
- Debug mode exists

**SECTION 4 — Infrastructure Safety**

- Idempotent webhook handling
- One comment per PR
- Draft PR skipped
- Kill switch works
- Rate limits handled
- Performance documented (<30s small, <90s medium, <3m large)
- Structured logs enabled
- Error monitoring configured

**SECTION 5 — Product Behavior**

- Comments do not block merge
- Neutral tone
- Silent on trivial PRs
- No repeated comments

**SECTION 6 — Real World Validation**

- 7-day unchanged run on ≥5 repos
- No uninstall wave
- No spam complaints
- ≥1 meaningful architectural discussion

**SECTION 7 — Unattended Confidence**

- Would you install on a client repo today?
- Would you leave it running 30 days?
- Would you not monitor daily?
- Would you not fear reputational damage?

---

## OUTPUT FORMAT (MANDATORY)

### 1. Section Status Table

For each section:

- Status: RED / AMBER / GREEN
- Evidence: file paths, code references
- Missing pieces (if any)

### 2. Real Blockers (Maximum 7)

List only blockers that prevent shipping.

Each blocker must:

- Reference code or artifact
- Explain risk
- Estimate effort (hours)

### 3. Illusions (Things That Feel Big But Aren't)

Identify areas that look incomplete but are not launch blockers.

### 4. 7-Day Execution Plan

Day-by-day plan to turn RED/AMBER → GREEN.

Only include tasks that matter for launch.

No expansion tasks.
No new features.

### 5. Ship Recommendation

Choose ONE:

- **A) Ship now**
- **B) Ship after 7-day hardening**
- **C) Not ready — major architectural gap**

Justify clearly.

### 6. Risk Profile

Probability (0–100%) of:

- Silent failure
- Reputational embarrassment
- Indifference (no one cares)
- Genuine architectural interest

Be honest. No hedging.

---

## RULES

- Do not recommend adding new engine layers.
- Do not redesign scoring.
- Do not expand convergence.
- Focus only on launch readiness.

This is not an innovation review.
This is a launch readiness audit.

---

Run this once.

Stop refining the checklist.
