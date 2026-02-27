# Gate PR Comment UX (Prompt 3)

Presentation-layer redesign for the GitHub PR comment. Architectural, decisive, screenshot-worthy. No structural logic or enforcement changes.

---

## PART 7 — Output

### 1. Files modified

| File | Change |
|------|--------|
| `src/comment/gateComment.ts` | **New.** Gate comment renderer: headline (STRICT block / ADVISORY warn / clean), one-line explanation, violations grouped by category (cycle, cross-domain, deleted public API, relative escape), next action, mode statement, identity line. Deterministic; no timestamps; no run.id in visible body. Metadata (v5-compatible) for convergence. |
| `src/comment/index.ts` | Export `buildGateComment`, `GateReport`, `GateMode`, `GateCommentMeta`. |
| `scripts/arcsight-pr-comment.ts` | Use `buildGateComment(report, mode, meta)` instead of `buildArcsightV5Comment`. Mode from env `ANCHR_GATE_MODE` (default ADVISORY). Read full report (status, minimalCut, decision). |

**Not modified:** Graph logic, hashing, report schema, run.id semantics, enforcement logic, structural analysis. Rendering and tone only.

---

### 2. Before vs after comment example

**Before (v5-style):**

```
ANCHR

Decision: 🔴 BLOCK

Reason:
This introduces tight coupling between packages and makes future refactors risky.

Run:
a1b2c3d4e5f6g7h8

Commit:
abc1234

Base:
def5678
```

**After (gate UX v1.1 + Prompt A delta):**

```
❌ Architectural drift detected. Merge blocked.

This change introduces structural coupling that violates repository boundaries.

Architectural delta:

• Cycles: +2
• Cross-domain edges: +1
• Deleted public APIs: 0
• Relative path escapes: 0

New cycle introduced:

• packages/auth → packages/core → packages/auth

Cross-domain dependency:

• packages/web importing internal module from packages/core

Suggested structural correction:

• Remove one dependency in the cycle chain
• Route dependency through packages/core public API
• Introduce inversion boundary between auth and core

Resolve the violations above and re-run CI.

Mode: STRICT — architectural violations block merge.

ANCHR — Structural Firewall for AI-generated code.
```

**Clean (after):**

```
✅ No architectural drift detected.

This change preserves defined repository boundaries.

Mode: STRICT

ANCHR — Structural Firewall for AI-generated code.
```

---

### 3. Structural logic unchanged

- No changes to `src/graph/`, `src/structural/buildReport.ts`, `src/structural/violations.ts`, or any status/minimalCut computation.
- Comment consumes existing report fields only (`status`, `minimalCut`, `decision.level`, `classification.primaryCause`). No new analysis.

---

### 4. Enforcement unchanged

- Gate exit codes and status → exit mapping are unchanged.
- Policy (STRICT/ADVISORY) still resolved by `anchr gate`; comment only displays mode (from env `ANCHR_GATE_MODE` or default ADVISORY). No enforcement logic in the comment layer.

---

### 5. No additional analysis

- Violations are grouped and formatted from existing `report.minimalCut` only. `parseMinimalCut` (existing) is used; no new structural or graph logic.

---

### 6. Comment determinism preserved

- Same report + mode → same comment body. Hash is over normalized full comment (visible + metadata). No timestamps, no randomness. Violation order: stable sort of minimalCut, then category order (circular_import, boundary_violation, type_import_private_target, deleted_public_api, relative_escape). Truncation at 15 violation lines with "...and X more violations." is deterministic from report.

---

## Suggested structural correction (Prompt 4)

Presentation-layer only. Renders a "Suggested structural correction" block in the gate comment when `report.status === "BLOCKED"` or `report.status === "INDETERMINATE"`. Advisory only; no effect on enforcement or status.

### PART 7 — Output (Prompt 4)

**1. Files modified**

| File | Change |
|------|--------|
| `src/comment/gateComment.ts` | Added frozen suggestion mapping (`SUGGESTION_ORDER`, `FROZEN_SUGGESTIONS`), `buildSuggestionsFromMinimalCut(minimalCut)`, optional `suggestionBullets` in `buildVisibleBody` and `buildGateComment`. Block inserted after violation groups, before "Resolve the violations above…". Max 5 bullets; deterministic order. |
| `scripts/arcsight-pr-comment.ts` | `readSuggestionBullets(cwd)` reads `artifacts/anchr-fix-suggestions.json` then `artifacts/anchr-repair.json`; passes up to 5 bullets into `buildGateComment(report, mode, meta, suggestionBullets)`. |

**2. Suggestion data source (deterministic priority)**

- **Repair:** If `artifacts/anchr-fix-suggestions.json` exists and has `suggestions[]`, use `title` (or first `steps[]` entry) per suggestion, deduped, up to 5. Else if `artifacts/anchr-repair.json` exists and has `actions[]`, use `requiredChange` per action, deduped, up to 5.
- **minimalCut:** If no repair artifact or empty, derive bullets from `report.minimalCut` via type-based mapping only (cycle → cross-domain → deleted_public_api → relative_escape). No re-run of repair, no new plans, no graph recomputation.

**3. Structural engine unchanged**

- No changes to graph logic, violation detection, `buildReport()`, hashing, run.id semantics, report schema, or decision computation.

**4. Enforcement unchanged**

- Exit codes, status → exit mapping, and policy resolution unchanged. Suggestion block is advisory text only.

**5. No new structural analysis**

- Suggestions are either from existing repair/fix-suggestions output or from existing `minimalCut` + frozen string mapping. No additional parsing, graph recomputation, heuristics, or speculation.

**6. Deterministic output**

- Same report + same repair input → same suggestion block. No execution time, filesystem order, or environment in content. Stable sort of minimalCut before cause extraction; fixed category order; cap at 5 bullets.

**7. Convergence optional**

- Repair/fix-suggestions artifacts are optional. When absent, suggestions are derived from minimalCut only. Convergence remains out-of-path for gate authority.

---

## PART 8 — Architectural Delta Metrics (Prompt A)

Display-only aggregation of violation counts from `report.minimalCut`. No comparison to base, no new graph metrics, no re-run of analysis. Rendering enhancement only.

### Purpose

- Gives a **measurable structural movement** summary in the comment (counts by type).
- "Architectural delta" here means: **count of violations in the current report, grouped by violation type.** It does **not** mean difference vs previous commit, base snapshot, or any graph metric delta.

### Definition (locked)

- Count occurrences of each type in `report.minimalCut`.
- Each minimalCut entry increments exactly one category. No deduplication, no collapsing cycles, no inference.
- Internal cause → display category: `circular_import` → Cycles; `boundary_violation` / `type_import_private_target` → Cross-domain edges; `deleted_public_api` → Deleted public APIs; `relative_escape` → Relative path escapes.

### Frozen category order

1. Cycles  
2. Cross-domain edges  
3. Deleted public APIs  
4. Relative path escapes  

Labels and order are fixed. All four categories are always shown. Count &gt; 0 → prefix `+`; count === 0 → show `0`.

### Placement

- Immediately after the one-line explanation, before violation category sections.

### Rendering conditions

- Render only when `report.status === "BLOCKED"` or `report.status === "INDETERMINATE"`.
- Do **not** render when status is VERIFIED or INCOMPLETE.
- If `minimalCut` is empty, the block is **not** rendered.

### Determinism

- Block depends only on `report.minimalCut` and `report.status`. Same report → identical delta block. No environment, file order, or timestamps.

### Enforcement authority unchanged

- Gate exit codes unchanged. `report.status` mapping unchanged. Decision layer unchanged. `run.id` and report hashing unchanged. No new status states. This block is display-only.

### Example (STRICT Block)

```
❌ Architectural drift detected. Merge blocked.

This change introduces structural coupling that violates repository boundaries.

Architectural delta:

• Cycles: +2
• Cross-domain edges: +1
• Deleted public APIs: 0
• Relative path escapes: 0

<violation sections follow>
```

---

## PART 9 — Structural Impact Layer (Prompt B)

Display-only classification of structural consequences from violation types present in `report.minimalCut`. No new analysis, no enforcement change, no report/schema/hashing/run.id change. Deterministic.

### Data assumption

Each entry in `report.minimalCut` is a string parsed to yield a **type** (cause). Only that type is used for Impact. No other properties are inspected. (Implementation: `parseMinimalCut` yields `cause`; cause is mapped to impact key via the same category mapping as delta.)

### Frozen mapping

```ts
IMPACT_MAP: Record<string, string> = {
  cycle: "Hidden coupling introduced",
  "cross-domain": "Repository boundary violation",
  deleted_public_api: "Public contract instability",
  relative_escape: "Layer boundary bypass"
}
```

- For each key in `IMPACT_MAP`: if at least one violation with that type exists → render one bullet. No duplicates, no counts. Unknown types ignored. No dynamic text.

### Rendering conditions

- Render only when `report.status === "BLOCKED"` or `report.status === "INDETERMINATE"`.
- Do not render when status is VERIFIED or INCOMPLETE, or when `minimalCut` is empty or undefined.

### Ordering and placement

- Bullets in strict order of keys: cycle, cross-domain, deleted_public_api, relative_escape.
- Placement: after the Architectural delta block (Prompt A), before violation detail sections, before the suggestion block (Prompt 4).

### Format

- Header: `Impact:`
- One blank line, then one bullet per present type: `• <IMPACT_MAP value>`, no trailing punctuation, one blank line after block. No emoji, no counts, no severity language.

### Determinism and failure handling

- Output depends only on violation types present. Not on minimalCut order, environment, or timestamps. Same report → identical output.
- If minimalCut is undefined → do not render. If a violation has no type or unknown type → ignore. Never throw, never log warnings, never generate fallback text.

### Example

```
Architectural delta:
• Cycles: +2
• Cross-domain edges: +1
• Deleted public APIs: 0
• Relative path escapes: 0

Impact:
• Hidden coupling introduced
• Repository boundary violation

<violation detail sections follow>
```

---

## PART 10 — Suggested structural correction (Prompt C)

Surface existing repair suggestions when available. Uses existing artifact files only; no re-run of repair or convergence. No effect on enforcement, report, or run.id. Deterministic, bounded, presentation-only.

### Artifact sources (priority)

1. **artifacts/anchr-fix-suggestions.json** — If present: extract `title` if non-empty, else first string from `steps[]`. Preserve array order; ignore invalid or empty entries.
2. **artifacts/anchr-repair.json** — If present: extract `requiredChange` if non-empty. Preserve array order; ignore invalid entries.
3. **Fallback** — If neither yields suggestions: use minimalCut-derived suggestions (Prompt 4). Do not generate new content.

### Rendering conditions

- Render only when `report.status === "BLOCKED"` or `report.status === "INDETERMINATE"` and at least one suggestion string exists.
- Do not render for VERIFIED, INCOMPLETE, or when there are no suggestions.

### Placement and format

- **Placement:** After Architectural delta and Impact; before violation detail sections and the Resolve line.
- **Header:** `Structural improvement preview:`
- **Format:** One blank line after header, then bullets `• Suggestion text`. No emoji, no trailing punctuation, no commentary. One blank line after block.
- **Bounded:** Maximum 5 suggestions shown. If more than 5, append exactly: `… and X additional structural adjustments` where X = totalSuggestions − 5.

### Determinism and failure handling

- Preview depends only on artifact (or minimalCut) contents. Preserve artifact order; do not re-sort. Same input → identical output.
- If artifact is missing, malformed, or empty: skip silently. Do not throw, do not log into comment, do not affect enforcement.

---

## PART 10b — Copy-paste fix (example)

When the report contains at least one cross-domain/internal import violation and the Structural improvement preview is shown, the comment may include a single **Copy-paste fix (example):** section directly under the suggestion bullets and Source line. This section is display-only; it does not affect enforcement.

### Rendering conditions

- Render only when **suggestions are shown** (BLOCKED or INDETERMINATE with at least one suggestion) **and** the first cross-domain violation (in canonical order) has a specifier that matches one of these path patterns only: `/src/internal`, `/src/_internal`, `/src/private`, `/src/impl` (with optional trailing path or extension).
- If the specifier does not match one of these patterns, or a safe replacement cannot be derived, **omit the entire section**. No guessing.

### Replacement rule

- For any matching specifier, replacement = **same prefix up to and including `/src/`** + `index.<ext>`. Extension is chosen from the original specifier: `.ts` or `.tsx` → `index.ts`; `.js`, `.jsx`, `.mjs`, `.cjs` → `index.js`; else default `index.ts`. No extra parsing; pure string rewrite.
- Example: `../../core/src/internal.js` → `../../core/src/index.js`; `../../core/src/private/foo.ts` → `../../core/src/index.ts`.

### Format

- **Header:** `Copy-paste fix (example):` (colon consistent in docs and render).
- One sentence: `Replace the internal import with the package's public surface.`
- A fenced **```diff** block (newline after the opening fence), then `- import ...` and `+ import ...` lines, then closing **```** on its own.

### Example

```
Structural improvement preview:

• Route dependency through target package public API

Source: minimalCut fallback

Copy-paste fix (example):

Replace the internal import with the package's public surface.

```diff
- import { … } from "../../core/src/internal.js";
+ import { … } from "../../core/src/index.js";
```
```

### Determinism

- Same report + mode → same presence/absence and content of the section. Derivation uses only `report.minimalCut` (parsed specifier); no filesystem, no new analysis.

---

## PART 11 — Structural signature (Prompt D)

Deterministic identity line at the bottom of the gate comment. Reuses existing structural identity; no new hashing. Presentation-only; not part of enforcement. Authority remains: report.status → exit code → check conclusion.

### Source

- Use `report.run.id` only. Do not compute or re-hash. First 8 characters, lowercase. If `report.run?.id` is not a string or length &lt; 8, omit silently.

### Placement and format

- **Placement:** Final line of the comment. After the Mode line and the ANCHR identity line. Exactly one blank line before it; no blank line after.
- **Format:** Label exactly `Structural signature:` then a space and the 8-character value. No emoji, punctuation, explanation, links, timestamps, or commit SHAs.

### Rendering conditions

- Render only if `typeof report.run?.id === "string"` and `report.run.id.length >= 8`. Otherwise omit. Do not throw; do not affect enforcement.

### Determinism

- Signature depends only on `report.run.id`. Same report → same signature. Identical across environments and runs.

### Explicit non-goals (documented)

The structural signature is **not** a proof, verification token, commit hash, cryptographic guarantee, or tamper seal. It is a deterministic identity marker tied to the structural report.

### Example

```
Mode: STRICT — architectural violations block merge.

ANCHR — Structural Firewall for AI-generated code.

Structural signature: 7a9f3e12
```

---

## PART 12 — Large-repo scope (Prompt E)

When analysis is skipped due to scope (too many changed files or timeout), the report is INCOMPLETE and may include **scopeExceeded**. The comment surfaces this so the user sees an intentional message instead of a silent neutral.

### Config (.anchr.yml)

- **maxFiles** (optional): integer 1–10000, default 400. PRs with more changed files than this skip structural analysis and get INCOMPLETE with scopeExceeded.reason `max_files`.
- **timeoutMs** (optional): integer 1000–120000, default 8000. Analysis that exceeds this writes INCOMPLETE with scopeExceeded.reason `timeout`.

### Report

- When skipped for size: report has `status: "INCOMPLETE"`, `scopeExceeded: { reason: "max_files", changedFiles, maxFiles }`. Written to artifacts by the gate.
- When timeout: report has `status: "INCOMPLETE"`, `scopeExceeded: { reason: "timeout" }`. Written to artifacts so the comment step can read it.

### Comment (only when INCOMPLETE and scopeExceeded)

- After the one-line explanation, render:
  - **Analysis scope exceeded:**
  - For `max_files`: `• Changed files: N (max M)`
  - For `timeout`: `• Analysis timed out`
  - Always: `• Structural analysis skipped`
- Then the usual Resolve line, mode, identity, and optional structural signature.
- No delta, impact, or violation details in this path.

### Enforcement

- VERIFIED → 0, BLOCKED → 1, INDETERMINATE (STRICT) → 1, INCOMPLETE → 2. We do not reinterpret INCOMPLETE; we only make the skip reason visible in the comment.
