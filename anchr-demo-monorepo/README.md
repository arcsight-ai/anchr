# anchr-demo-monorepo

Public demo repo for [ANCHR](https://github.com/arcsight-ai/anchr) : module boundaries, branch protection, and required merge check. Use this as a proof anchor for DevHunt and onboarding.

**Use as a standalone repo:** Copy or clone this folder into its own Git repository (e.g. `arcsight-ai/anchr-demo-monorepo`) so that ANCHR runs against this monorepo’s `packages/` only.

## Boundaries

- **`packages/core`** — Public surface: `src/index.ts` (and anything re-exported from it). `src/format.ts` is public; `src/internal.ts` is **not** (do not import from other packages).
- **`packages/api`** — Depends only on `@market-os/core` public surface. Must not import `core`’s internals or create cycles.

Allowed: `api` → `core` (public).  
Blocked: `api` → `core` internal; `core` → `api` (cycle).

## Run ANCHR locally

From this repo root:

```bash
npx anchr audit
```

If ANCHR is not yet published, run from the anchr repo: `node /path/to/anchr/bin/anchr.cjs audit` (or `npm run anchr -- audit` from the anchr repo root).

For PR-style diff (base vs head), set `GITHUB_BASE_SHA` and `GITHUB_HEAD_SHA` to two commit SHAs, or use `--base` / `--head` if supported.

## Branch protection and required check

1. **Settings → Branches → Add rule** for `main` (or default branch).
2. Enable **Require status checks to pass before merging**.
3. Add status check: **ANCHR** (the workflow name appears as this check).
4. Save. Merges to `main` are then blocked unless the ANCHR check passes.

## Three PR scenarios (proof anchor)

### 1. VERIFIED — clean PR

- Change that respects boundaries (e.g. edit a comment in `packages/api/src/index.ts`, or add a new public export in `packages/core/src/format.ts` and use it from `api`).
- Open PR → ANCHR runs → **MERGE VERIFIED** → Check passes → merge allowed.

### 2. BLOCKED — boundary violation

- In `packages/api/src/index.ts`, add an import of `core`’s **internal** surface, e.g.:
  - `import { internalHelper } from "@market-os/core/internal";` (if your resolver allows that subpath), or
  - In a file under `api`, add a relative import that resolves to `../core/src/internal.ts`.
- Open PR → ANCHR runs → **MERGE BLOCKED** (boundary violation) → Check fails → merge blocked.

**Concrete step:** In `packages/api/src/index.ts`, add:
`import { internalHelper } from "@market-os/core/internal";`  
and use `internalHelper()` somewhere. ANCHR treats `@market-os/core/internal` as forbidden; if not, use a relative path from `api` into `core/src/internal.ts` to force a boundary violation.

### 3. BLOCKED — circular dependency

- Make `core` depend on `api` (e.g. add `"@market-os/api": "workspace:*"` to `packages/core/package.json` and in `packages/core/src/index.ts` add `import { apiVersion } from "@market-os/api";` and re-export or use it).
- Open PR → ANCHR runs → **MERGE BLOCKED** (circular dependency) → Check fails → merge blocked.

**Concrete steps:**
1. In `packages/core/package.json`, add `"@market-os/api": "workspace:*"` to `dependencies`.
2. In `packages/core/src/index.ts`, add `import { apiVersion } from "@market-os/api";` and e.g. `export { apiVersion };`.
3. Open PR from that branch → ANCHR should report cycle and block merge.

## Screenshots (optional for DevHunt)

- PR with **MERGE BLOCKED** (boundary violation).
- PR with **MERGE VERIFIED** (clean change).
- Branch protection page showing **ANCHR** as a required check.

## License

MIT (or match parent repo).
