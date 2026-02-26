# 1-hour launch audit checklist

Run this in order. Prep once; then A → B → C. Binary outcomes only. If any section FAILs, **stop and fix before recording.** If all pass, do the re-run reliability check, then ship and record.

---

## 0) Prep

- **Demo repo:** `arcsight-ai/anchr-demo-monorepo` (or your chosen repo).
- **`.anchr.yml`** exists with `enforcement: STRICT` for the main demo loop.
- **Workflow** in the demo repo is the canonical `.github/workflows/anchr-gate.yml` and uses:
  - `npx anchr@1 gate`
  - `npx anchr@1 comment` (when no local `scripts/arcsight-pr-comment.ts`)
  - Runs `npx anchr@1 suggest` **only when** `BLOCKED` or `INDETERMINATE` (report status).

---

## A) Golden demo loop (15–20 min)

### Baseline PR green

1. Create a PR that changes something harmless (e.g. README).
2. Confirm:
   - [ ] Check run: **ANCHR — Architectural Firewall** = ✅ success
   - [ ] PR comment: ✅ **"No architectural drift detected."**
   - [ ] Only one ANCHR comment exists (updates in place).

**Evidence capture:** Screenshot of PR checks list (green). Screenshot of the single ANCHR comment (clean state).

### Break

3. On a new branch:
   - Run `npm run demo:break`
   - Commit + push, open PR (or push to same branch).
4. Confirm on PR:
   - [ ] Check run fails (STRICT): ❌
   - [ ] Comment headline: **❌ Architectural drift detected. Merge blocked.**
   - [ ] Shows violations
   - [ ] Shows **Suggested structural correction**
   - [ ] Shows **Source:** minimalCut or convergence
   - [ ] Shows **Copy-paste fix (example):** with a diff block (including ```diff fence)

**Evidence capture:** Screenshot of PR checks list (failed). Screenshot of the ANCHR comment (blocked state, scroll to show violations → suggestions → Source → copy-paste block). Optional: paste `run.id` from `artifacts/anchr-report.json` into a private note to tie the demo to artifacts.

### Fix

5. Apply either the copy-paste diff from the comment **or** `npm run demo:fix`; push to the same PR.
6. Confirm:
   - [ ] Same ANCHR comment **updated** (no new comment, no duplicate)
   - [ ] Check run goes ✅ success
   - [ ] Comment becomes ✅ clean

**Evidence capture:** Screenshot after fix (green check, comment updated in place).

### A — PASS if

- **Baseline PR:** check ✅ + exactly one comment ✅ with “No architectural drift detected.”
- **Break PR:** check ❌ (STRICT) + comment contains all four: “Suggested structural correction”, “Source: …”, “Copy-paste fix (example):”, and a ```diff fence.
- **Fix:** check ✅ + comment updated in place (no duplicate).

### A — FAIL if

- Comment duplicates at any step.
- Suggest runs when status is VERIFIED (e.g. Actions logs show suggest step when report is VERIFIED).
- Check conclusion doesn’t match status→exit contract (VERIFIED→success, BLOCKED→failure, INCOMPLETE→neutral).
- Any of the four break-phase elements missing from the comment.

**Next action:** Stop and fix before recording.

---

## B) Consumer install test (20–25 min)

**Goal:** A stranger can install this without local scripts/tsx.

1. Create a **fresh empty repo** (private is fine).
2. Add **only**:
   - `.github/workflows/anchr-gate.yml` (canonical)
   - `.anchr.yml` (e.g. `enforcement: STRICT`)
3. Create a trivial PR.
4. Confirm:
   - [ ] Workflow runs successfully using only `npx anchr@1 …`
   - [ ] Comment posts
   - [ ] Check run appears with correct conclusion
   - [ ] No extra permissions beyond: `contents: read`, `pull-requests: write`, `checks: write`

**Evidence capture:** Screenshot of workflow run (success). Screenshot of PR with ANCHR comment and check.

### B — PASS if

- Workflow completes using only `npx anchr@1` (no local scripts, no tsx in repo).
- Comment posts and check run appears with correct conclusion.
- Permissions are exactly: `contents: read`, `pull-requests: write`, `checks: write`.

### B — FAIL if

- Workflow fails (e.g. anchr not found, missing artifact, permission error).
- Comment doesn’t post or check doesn’t appear.
- Extra permissions were added.

**Next action:** Fix packaging/CLI exposure before anything else. Do not record.

---

## C) Large-repo guardrail smoke (10–15 min)

1. In `.anchr.yml` set:
   ```yaml
   enforcement: STRICT
   maxFiles: 1
   ```
2. Make a PR that changes **2+ files**.
3. Confirm:
   - [ ] Report status = INCOMPLETE with `scopeExceeded`
   - [ ] Comment shows **Analysis scope exceeded** block
   - [ ] Check conclusion is **neutral** (exit 2 path)
4. Revert `maxFiles` back.

**Evidence capture:** Screenshot of comment showing “Analysis scope exceeded” and neutral check.

### C — PASS if

- Comment shows “Analysis scope exceeded” block.
- Check conclusion is neutral (exit 2).

### C — FAIL if

- Comment doesn’t show scope-exceeded block when maxFiles is exceeded.
- Check conclusion is not neutral (e.g. failure instead of neutral).

**Next action:** Fix scope-exceeded handling and check mapping before recording.

---

## Re-run reliability (before recording)

**Repeat A once more on a fresh branch.** Same steps: baseline green → break → fix. If it fails on the second run (duplicate comment, wrong check conclusion, missing snippet, etc.), do not record. Fix flakiness first.

---

## Final sanity check before you record (3 failure modes)

Run these once before hitting record. They catch what tests can’t: GitHub timing and rendering.

### 1) Comment duplication under race

Even if tests pass, GitHub timing can create duplicate comments if the workflow runs twice quickly or the comment step runs before check status settles.

**Guard:** On a demo branch, manually push **two commits back-to-back**. Confirm:
- [ ] Only one ANCHR comment exists
- [ ] It updates in place (no second comment)

If duplicates appear, fix comment upsert/race before recording.

### 2) Suggest step not running on VERIFIED

Suggest must run **only** when status is BLOCKED or INDETERMINATE.

**Guard:** On a **clean PR** (no violations), open the workflow run logs. Confirm:
- [ ] Logs do **not** show `# suggestions: …` (suggest step should be skipped when VERIFIED)

If suggest runs on VERIFIED even once, tighten the workflow condition before recording.

### 3) Copy-paste snippet renders correctly in GitHub Markdown

The ```diff block must render properly so the demo looks good.

**Guard:** Open the **blocked** PR (after demo:break) in:
- [ ] Desktop browser: ```diff block present; minus line red, plus line green; no escaping issues
- [ ] Mobile (optional): same check

If the diff doesn’t render cleanly, fix fence or escaping before recording.

---

## If all A/B/C pass + re-run reliable + sanity checks clean

You’re done. Ship. Record. Launch.

---

## Recording sequence (5 minutes — camera choreography)

Use this as the script for screen recording. Run only after A/B/C pass, re-run reliability, and final sanity checks.

1. **Start on PR — baseline green.** Show the PR checks list with ANCHR — Architectural Firewall ✅. Show the single ANCHR comment: “No architectural drift detected.”
2. **Switch to terminal.** Run `npm run demo:break`. Commit, push to the same branch (or open PR).
3. **Back to PR, refresh.** Watch the check fail (❌). Let the comment load.
4. **Scroll the comment.** Point at: headline (“Architectural drift detected. Merge blocked.”) → violations → **Suggested structural correction** → **Source: …** → **Copy-paste fix (example):** and the ```diff block.
5. **Apply the fix.** Either paste the diff from the comment into the file, or in terminal run `npm run demo:fix`. Commit and push.
6. **Back to PR, refresh.** Show ✅ green check. Show that the same ANCHR comment updated in place (no duplicate). Comment now shows clean state.

That’s the meetup/Product Hunt loop on camera.

---

## Dead-code sweep (only after)

If you still want it, do it as a **separate branch** with one rule:

- No behavior changes, no public API changes, no workflow changes.
- Just a conservative “unused exports/files” cleanup with a diff you can revert instantly.

See **What not to touch before launch** (below) for the critical path.

---

## What not to touch before launch

These are on the “fuck-yes” path. Don’t change behavior, exports, or contracts here until after the audit and launch. (Dead-code sweep: avoid deleting or “cleaning” these unless clearly unused and reversible.)

### Gate / comment / suggest (authority + UX)

| Path | Role |
|------|------|
| `bin/anchr.cjs` | Entrypoint; gate/suggest/comment run from source when dist stale |
| `scripts/cli.ts` | Commands: gate, suggest, comment; config (maxFiles, timeoutMs) |
| `src/comment/gateComment.ts` | Gate comment body, copy-paste snippet, delta, impact, suggestions |
| `src/comment/runGateComment.ts` | Reads report + fix-suggestions, builds comment, posts/updates |
| `src/config/anchrYaml.ts` | .anchr.yml loader (enforcement, ignore, maxFiles, timeoutMs) |
| `src/suggest/runSuggest.ts` | Reads report; VERIFIED → empty; BLOCKED/INDETERMINATE → convergence or minimalCut |
| `src/suggest/minimalCutSuggestions.ts` | Suggestions from minimalCut |
| `src/suggest/convergenceAdapter.ts` | Convergence suggestions when CONVERGENCE_PATH set |
| `src/suggest/types.ts` | Suggest output types |
| `src/repair/parseReport.ts` | parseMinimalCut (used by gate comment + suggest) |

### Structural engine (report authority)

| Path | Role |
|------|------|
| `src/structural/buildReport.ts` | Builds report, status, minimalCut |
| `src/structural/violations.ts` | Violation detection |
| `src/structural/types.ts` | ReportStatus, ViolationKind, ProofType, Report |
| `src/structural/report.ts` | run.id, hashing |
| `scripts/anchr-structural-audit.ts` | Gate’s analysis script (refs, writes report) |

### Demo scripts

| Path | Role |
|------|------|
| `scripts/demo-break.sh` | Applies boundary violation (internal import) |
| `scripts/demo-fix.sh` | Restores public-surface-only |

### Workflow

| Path | Role |
|------|------|
| `.github/workflows/anchr-gate.yml` | Canonical workflow: gate → suggest (when BLOCKED/INDETERMINATE) → comment; check run |

### Tests to keep green

- `tests/gateComment.impact.test.ts` — Gate comment, suggestions, Source, copy-paste snippet
- `tests/suggest.command.test.ts` — suggest VERIFIED/BLOCKED/INCOMPLETE/missing

Everything else (phase1, simulations, validation-*, other scripts, advisor, convergence run, etc.) is off the critical install/demo/comment path. Safe to leave as-is for launch; sweep later on a separate branch if desired.
