# Pre-Public Audit — Launch-Ready Repo

Brutally honest checklist. Repo should feel like a **small, serious infra primitive**, not a weekend experiment.

---

## ✅ Done (this pass)

### 1. README first impression
- **Top:** ANCHR, one-sentence definition, VERIFIED/BLOCKED, deterministic claim, Install (60 seconds) visible.
- **No** WIP, experimental, TODO, coming soon, or "might support" in README.

### 2. Dead files removed from tracking
- **Removed from git (still in .gitignore):** `dist/`, `artifacts/`, `c` (empty file), `anchr-report.md` (generated report). These no longer appear in the repo; build/output dirs stay local.

### 3. package.json
- **name:** anchr  
- **version:** 1.0.0  
- **description:** Structural gate for TypeScript monorepos. One decision per PR: VERIFIED or BLOCKED.  
- **license:** MIT  
- **repository:** https://github.com/arcsight-ai/anchr.git  
- No empty or placeholder fields.

### 4. LICENSE
- **MIT** added at repo root. Copyright (c) 2025 arcsight-ai.

### 5. .gitignore
- **Added:** `.tmp-event/`, `.anchr/`, `.env`, `anchr-report.md`, `data/` so they never get committed.  
- **Already present:** `node_modules/`, `dist/`, `artifacts/`, `.tmp/`.

### 6. Demo
- **anchr-demo-monorepo/** (not literally `demo/`) contains example layout, VERIFIED + BLOCKED scenarios, README. Intentional and linked from main README.

### 7. Website
- **website/** has its own README and .gitignore; no `node_modules` or `dist` committed. Clean.

---

## ⚠️ Optional (your call)

### Internal strategy docs in docs/
These are **polished launch/brand docs**; a few read like internal playbooks. Fine to keep; if you want the repo to show only “shipping” content, consider moving to a private doc or dropping from the repo:

- `DEVHUNT-LAUNCH-BLUEPRINT-V2-FINAL.md` — scoring, phases, “Are we ready?”
- `ANCHR-LAUNCH-AUDIT.md` — launch readiness checklist
- `DEVHUNT-FIRST-IMPRESSION.md` — scroll moment, perception score
- `DEVHUNT-HOSTILE-THREAD-SIMULATION.md` — comment thread rehearsal
- `anchr-launch-control-v3.md`, `anchr-launch-readiness-audit.md`

**Recommendation:** Keep them. They don’t say “we might add” or “planning to”; they’re execution docs. Only remove if you want zero internal framing visible.

### Root structure vs “ideal”
Ideal was: `src/`, `website/`, `demo/`, `docs/`, README, LICENSE, package.json, tsconfig.json, `.github/workflows/`.

**Actual:** You have `anchr-demo-monorepo/` (demo), plus `bin/`, `scripts/`, `tests/`, `labs/`, `.freeze-*`, multiple workflows. This is **intentional** for a real CLI + CI repo. No need to delete `scripts/` or `tests/` to match a minimal template. Only **anchr-demo-world/** and **data/** are untracked/local; they’re ignored and don’t appear on GitHub.

---

## 🔲 You do (before or right after public)

### Tag the release
```bash
git tag v1.0.0
git push --tags
```
Infra tools have versions. This changes perception.

### GitHub settings (if not already)
- Default branch = **main**
- Clean recent history (no “asdf”, “test”, “fix again” spam)

### Final ritual
1. Open repo in **incognito**.
2. Pretend you discovered it randomly.
3. Ask: *Is it clear what this does in 5 seconds? Is install obvious? Does this feel intentional? Would I star this?*  
If yes → you’re good.

---

## Summary

| Item                    | Status |
|-------------------------|--------|
| README first impression | ✅     |
| No dead files in repo   | ✅ (c, dist, artifacts, anchr-report removed from tracking) |
| package.json complete  | ✅ (description, license, repository, version 1.0.0) |
| LICENSE (MIT)           | ✅     |
| .gitignore              | ✅ (tightened) |
| Demo intentional        | ✅ (anchr-demo-monorepo) |
| Website not dominating  | ✅     |
| Tag v1.0.0              | 🔲 Run when ready |

Repo is in good shape for a small, serious infra primitive. Tag and push when you’re ready.
