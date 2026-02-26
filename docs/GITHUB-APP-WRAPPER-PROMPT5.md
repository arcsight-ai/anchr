# GitHub App Wrapper — Prompt 5 Deliverables

Production-safe orchestration around `anchr gate`. No engine mutation. No new structural logic.

---

## PART 7 — Required Deliverables

### 1. Folder structure for App wrapper

All wrapper logic lives inside the anchr repo. No separate server or webhook handler.

```
anchr/
├── .github/
│   └── workflows/
│       └── anchr-gate.yml      # Canonical gate workflow (trigger, gate, comment, check)
├── scripts/
│   ├── cli.ts                  # gate + comment commands
│   └── arcsight-pr-comment.ts # Comment upsert (invoked by anchr comment or directly)
├── src/
│   └── comment/
│       └── gateComment.ts      # buildGateComment + ANCHR:GATE:V1 marker
└── docs/
    └── GITHUB-APP-WRAPPER-PROMPT5.md
```

No new top-level folder. No backend, no dashboard, no database.

---

### 2. Production-ready GitHub Action YAML

**File:** `.github/workflows/anchr-gate.yml`

- **Trigger:** `pull_request_target` with `opened`, `synchronize`, `reopened`, `ready_for_review`. No push, no schedule.
- **Refs:** `GITHUB_BASE_SHA` and `GITHUB_HEAD_SHA` (and `HEAD_SHA`, `BASE_SHA`) set from the PR event; never computed manually.
- **Gate step:** Runs `npx anchr@latest gate` with 1-minute timeout; `continue-on-error: true` so the job continues; exit code and `has_report` written to step outputs.
- **Comment step:** If report exists, runs local `npx tsx scripts/arcsight-pr-comment.ts` when script exists, else `npx anchr@latest comment`.
- **Internal error:** If no report, posts a single comment with body `<!-- ANCHR:GATE:V1 -->` + "ANCHR internal error. No report produced."
- **Check run:** Name `"ANCHR — Architectural Firewall"`. Find by name and PATCH if present, else POST. Conclusion: 0 → success, 1 → failure, 2 → neutral.
- **Version:** Workflow comment notes `anchr@latest`; pin to e.g. `anchr@1.0.0` in repo if desired.

---

### 3. Comment upsert logic (idempotent)

- Implemented in `scripts/arcsight-pr-comment.ts`: list PR comments, find by `isArcsightComment` (body starts with `<!-- arcsight:comment -->`). If found with same (head, base, hash): leave unchanged. If found with different hash: update in place. If none: create. One comment per PR.
- Gate comment metadata includes `<!-- ANCHR:GATE:V1 -->` for identification. No duplicate comments.

---

### 4. Check run creation logic

- Step "Find existing check run" lists check runs for the head SHA, selects by name `"ANCHR — Architectural Firewall"`, outputs `check_id`.
- Step "Create or update Check Run" uses that ID to PATCH, or POSTs a new run. Conclusion from gate exit code only: 0 → success, 1 → failure, 2 (or missing) → neutral.

---

### 5. STRICT configuration flow

- **App/workflow does not interpret policy.** It does not read `.anchr.yml` or override enforcement.
- Gate is invoked as `npx anchr@latest gate` (no `--strict` in the workflow). STRICT resolution is entirely inside the gate: 1) CLI `--strict` if present, 2) `.anchr.yml` enforcement, 3) default ADVISORY.
- To force STRICT from the workflow, the repo can add a step that runs gate with `--strict` or set an env that the workflow passes through; the current workflow leaves that to gate and `.anchr.yml`.

---

### 6. Failure-mode handling

- **Gate exit 2:** Check conclusion set to neutral; comment still posted if report exists.
- **Gate exit 1:** Check conclusion failure; comment posted from report.
- **Missing report:** Check conclusion neutral; "Post ANCHR internal error comment" step posts a single comment with "ANCHR internal error. No report produced."
- No silent retries. No swallowing of failure (exit code captured and reflected in check conclusion). stderr from gate is visible in workflow logs (no redirect of stderr).

---

### 7. Structural engine untouched

- No changes to graph logic, `buildReport()`, hashing, run.id, report schema, violation detection, or any structural analysis.
- The wrapper only: runs `anchr gate`, reads `artifacts/anchr-report.json`, runs comment script, creates/updates check run from gate exit code.

---

### 8. Enforcement single-source (anchr gate)

- Check conclusion is derived only from the gate exit code (0/1/2). No re-evaluation of report in the workflow. No policy logic in the workflow. Gate remains the single source of architectural authority.

---

### 9. No new interpretation layer

- The App wrapper does not reinterpret structural logic, duplicate enforcement, or add structural behavior. It runs gate, captures exit code, posts the comment built from the existing report, and sets the check conclusion. No new analysis, no recomputation, no override of STRICT vs ADVISORY beyond what gate does.

---

## PART 8 — Explicit non-goals (locked)

- No backend server, webhook handler, dashboard, database, convergence execution in the App layer, artifact persistence outside the workflow, async job queue, or cross-repo coordination.
- This is a deterministic structural firewall. Nothing more.

---

## Final hardening (pre–public launch)

1. **pull_request_target safety** — Documented in `docs/PULL_REQUEST_TARGET_SAFETY.md`: gate only parses/reads source; no `require()`, dynamic `import()`, `eval()`, or execution of project code. Safe to use `pull_request_target` with checkout of PR head.

2. **Comment command standalone** — `anchr comment` runs in-process via `src/comment/runGateComment.ts` (no spawn of tsx). Bin uses `dist/scripts/cli.js` when present so published package works with `node` only; no tsx dependency for consumers. Publish with `npm run build` so `dist/` is included. Build outputs ESM (`module: node16`); all dist imports use `.js` (no `.ts` in emitted code). Node 20 runs dist end-to-end.

3. **Workflow** — Node locked to 20 in `setup-node`. anchr pinned to `@1` (latest 1.x). **Recommended pin for absolute stability:** `npx anchr@1.0.0 gate` (and same for `comment`). Package deps use strict semver ranges (no `*`).
