# Convergence suggest (Stage 3)

**anchr suggest** generates `artifacts/anchr-fix-suggestions.json` from the structural report. The PR comment step reads this file and shows "Suggested structural correction" when present. **Suggestions never affect PASS/FAIL;** gate authority comes only from the report.

---

## What anchr suggest does

1. Reads **artifacts/anchr-report.json** (or `ANCHR_REPORT_PATH`).
2. **VERIFIED** → Writes a canonical suggestions file with `suggestions: []`. Exit 0.
3. **BLOCKED** or **INDETERMINATE** → Generates suggestions (convergence if available, else minimalCut fallback), writes **artifacts/anchr-fix-suggestions.json**. Exit 0.
4. **INCOMPLETE** or missing report → Exit 2 with a clear message (no guess).

Output shape (canonical JSON, sorted keys):

```json
{
  "version": "v1",
  "source": "convergence" | "minimalCut",
  "run": { "base": "<sha>", "head": "<sha>", "run_id": "<run.id from report>" },
  "suggestions": [
    { "title": "…", "steps": ["…"], "category": "cycle|cross-domain|deleted-public-api|relative-escape|other" }
  ]
}
```

---

## Authority contract

- **Convergence is suggestions-only.** It may write the suggestions file; it must **never** change report status, run.id, or gate exit codes.
- Gate PASS/FAIL is determined **only** by `anchr gate` (report.status). The suggest step does not affect job conclusion.

---

## Determinism contract

- Suggestions are canonical JSON (sorted keys). Same report + same inputs ⇒ same file content.
- No timestamps, no confidence fields, no model metadata, no tokens. Suggestions sorted by (category, title).

---

## Env overrides

| Variable | Meaning |
|----------|--------|
| **ANCHR_REPORT_PATH** | Path to report JSON (default: `artifacts/anchr-report.json`). |
| **ANCHR_SUGGESTIONS_PATH** | Path to write suggestions (default: `artifacts/anchr-fix-suggestions.json`). |
| **CONVERGENCE_PATH** | Optional. Path to convergence-engine repo root. If set, suggest tries to load `getSuggestions(input)` from convergence; otherwise uses minimalCut fallback. |

---

## Workflow

In CI, **anchr gate** runs first. If a report exists, **anchr suggest** runs next (and may write the suggestions file). Then **anchr comment** runs; it reads the suggestions file if present and shows "Structural improvement preview" in the PR comment. Job conclusion is derived from the gate exit code only.
