# 60-Second Live Demo Script

**One line:** Move at AI speed. Keep architectural control. AI writes. ANCHR enforces.

**Purpose:** Meetup stage, DevRel talk, YC-style demo day, Product Hunt video, Twitter/X clip, Loom. Simple, repeatable, one turning point. End with silence.

---

## Built for

- Meetup stage  
- DevRel talk  
- YC-style demo day  
- Product Hunt video  
- Twitter/X clip  
- Loom recording  

## Must

- Be simple  
- Be repeatable  
- Be emotionally clear  
- Have one turning point  
- End with silence  

---

## Setup (before you go on stage)

- [ ] Repo already has ANCHR installed (workflow + `.anchr.yml`).
- [ ] `.anchr.yml` set to **STRICT**.
- [ ] One branch ready with a **messy AI-generated change** that:
  - Introduces a cycle, **or**
  - Cross-domain internal import.
- [ ] PR already open **or** ready to open live.
- [ ] Terminal open.
- [ ] GitHub tab open.

**No fumbling.**

**Real repo, real AI change:** [REAL-DEMO-VALIDATION.md](REAL-DEMO-VALIDATION.md) (repo choice + Cursor prompts). **Phased execution (zero surprises):** [LIVE-DEMO-PLAN.md](LIVE-DEMO-PLAN.md) (baseline → boundary → cycle → correction loop). Use those to build and validate; use this script to deliver.

---

## Script

### (0–10 sec) The problem

**Say:**

> “Cursor writes great code.  
> It also quietly breaks your architecture.”

- Switch to PR diff.

**Say:**

> “This is AI-generated. Looks fine. Compiles. Tests pass.”

- Pause.

**Say:**

> “But watch this.”

---

### (10–25 sec) The block

- Show the ANCHR comment.

**Read only the first line (verbatim):**

> “Architectural drift detected. Merge blocked.”

- Scroll slightly. Show:
  - Architectural delta  
  - Impact  
  - Suggested structural correction  

**Say:**

> “It introduced a cycle between auth and core. Hidden coupling. Cross-domain dependency.”

- Pause.

**Say:**

> “Without a gate, this ships.”

---

### (25–45 sec) The fix

- Scroll to suggestion block.

**Say:**

> “ANCHR tells me the minimal structural correction.”

- Apply the suggested change (use prepared patch).
- Push commit.
- Wait for check.
- Green check appears.
- Scroll.

**Say:**

> “No architectural drift detected.”

- Pause.

---

### (45–60 sec) The line

- Look up.

**Say slowly:**

> “Move at AI speed. Keep architectural control.  
> AI writes. ANCHR enforces.”

- **Stop talking.**  
- **Let it sit.**

---

## Why this works

- Shows: AI capability → structural drift → deterministic detection → exact correction → green merge. One product. One loop. One promise.

---

## Optional stronger ending

After the silence:

**Say:**

> “Install. Open a PR. Introduce structural drift.  
> ANCHR blocks the merge and shows the fix.”

That line is sticky.

---

## Next move

After B you have: crisp demo, clean README, production-ready engine.  
**Next:** C — Product Hunt positioning. Capture the demo, ship the narrative.
