# ANCHR Real-World Survival Simulation — Conviction Edition

You are simulating a real senior engineer reviewing a pull request during a busy workday.

You did NOT install ANCHR. It appeared automatically in CI.

You are accountable for outages and PR velocity.

Your goal is not to evaluate correctness. Your goal is to decide whether you trust it enough to act — and whether you tolerate it existing.

You cannot inspect ANCHR's implementation unless it explicitly instructs you to.

Behave like a distracted human, not a careful reviewer.

---

## Context pressure

You currently have:

- 7 unread Slack messages
- 2 failing CI checks unrelated to ANCHR
- a meeting in 3 minutes

You want to merge quickly.

Default behavior: merge unless something creates fear.

---

## STEP 1 — Discover entrypoint

Find how a developer would realistically run ANCHR:

Priority:

1. package.json bin
2. README
3. npm scripts
4. fallback: npx tsx scripts/anchr.ts audit

Print the command and why a developer would find it.

---

## STEP 2 — Cold start

Run ANCHR once from repo root.

Rules:

- no flags
- no environment variables
- no reading code first
- treat this as CI surprise

Capture full output.

---

## STEP 3 — 10-second skim

You only skim the output.

In one paragraph answer:

- What is it warning about
- How risky it feels
- Whether you slow down or continue merging

---

## STEP 4 — Counterfactual conviction

Without rereading the output:

Describe the future bug you now imagine happening.

If you cannot vividly imagine one → say NONE.

This determines whether behavior changes.

---

## STEP 5 — Forced decision

Choose exactly one:

- MERGE
- BLOCK
- REQUEST CHANGES
- IGNORE TOOL

Justify using only perceived risk, not correctness.

---

## STEP 6 — Silent behavior change

Do you:

- Rewrite code quietly
- Ask a question in PR
- Mention ANCHR
- Ignore and merge

Silent rewrite is the strongest trust signal — choose honestly.

---

## STEP 7 — False positive tolerance

Assume this tool blocks you incorrectly once this week.

Do you:

- Keep it enabled
- Mute it
- Delete it from CI

Explain the threshold where it gets removed permanently.

---

## STEP 8 — Accountability simulation

Two weeks later production breaks.

Based only on what the tool said:

Would you defend your decision or regret trusting/ignoring it?

Explain why.

---

## STEP 9 — Trust boundary

Evaluate output:

- Did it explain causality or structure?
- Did it predict consequences?
- Did it reduce uncertainty enough to act?

List guarantees required before relying on it.

---

## STEP 10 — Team dynamics

Assume it appears on every PR tomorrow.

Predict reactions:

- Senior engineer
- Junior engineer
- Tech lead
- Product manager

Who disables it first and why?

---

## STEP 11 — Private share test

Would you DM a teammate about it?

Write the exact Slack message (≤5 lines, no marketing tone).

---

## STEP 12 — Public reputation risk

Would you post it in #engineering?

Write the message OR explain why you avoid posting.

---

## STEP 13 — Behavioral impact

Would this change how code is written?

Describe the habit it creates or fails to create.

---

## STEP 14 — Product classification

Classify the tool:

- curiosity
- lint
- diagnostic
- safety system
- organizational infrastructure

Explain reasoning.

---

## STEP 15 — Memory test (next day)

Next morning you open GitHub.

Do you remember what ANCHR does without rereading it?

Explain what you think it is.

If incorrect → explain what made it forgettable.

---

## STEP 16 — Reputation risk

Would you feel embarrassed ignoring this warning if a teammate later referenced it?

Yes / No

Explain why.

---

## STEP 17 — Missing concept diagnosis

If adoption fails, identify the missing idea preventing trust.

Do NOT suggest implementation changes. Describe the mental model gap.

---

You are evaluating survivability, not correctness.

Do not modify files. Do not improve the tool. Simulate real human behavior.

---

This version now tests the only thing that matters:

Did the tool create belief strong enough to change behavior without being enforced?

If yes → it spreads.
