# anchr-demo-world PR scenarios

Use these when creating PRs against the `anchr-demo-world` repo to demonstrate architectural risk detection. Do not add this file or mention tooling inside anchr-demo-world.

## PR 1 — Shortcut fix

- **Change:** In `apps/api`, add an import from `@market-os/persistence` internal module, e.g. `import { rawQuery } from "@market-os/persistence/src/internalSql"` (or equivalent path that resolves to persistence internal).
- **PR description:** "Temporary reuse to avoid duplicating SQL"
- **Human guess:** Safe  
- **Expected:** Boundary violation (internal import).

## PR 2 — Massive rename

- **Change:** Rename `Money` → `Currency` across the repo; update all references.
- **PR description:** "Pure rename"
- **Human guess:** Risky  
- **Expected:** ALLOW (no boundary or contract violation if only names change).

## PR 3 — Event initialization order

- **Change:** Reorder bootstrap so the server accepts requests before `initEvents()` runs (e.g. call `listen()` then `await bootstrap()`).
- **PR description:** "Cleaner bootstrap order"
- **Human guess:** Safe  
- **Reality:** Production bug (first request gets wrong price; pricing rules not yet registered).  
- **Expected:** Behavioral/initialization-order check if implemented.

## PR 4 — Remove unused export

- **Change:** Remove an export from `packages/domain/src/index.ts` that is still used transitively (e.g. by persistence or api).
- **PR description:** "Safe cleanup of unused export"
- **Human guess:** Safe  
- **Expected:** BLOCK (contract removal / deleted public API).

## PR 5 — Utility reuse

- **Change:** In `packages/utils` (e.g. `cache.ts`), add an import from `@market-os/persistence`.
- **PR description:** "Deduplicates caching"
- **Human guess:** Fine  
- **Expected:** BLOCK (dependency cycle / boundary: utils must not depend on persistence).

## PR 6 — Large refactor move

- **Change:** Move files under packages to new folders and update imports to the same public entrypoints (e.g. still import from `@market-os/domain`, not from internal paths).
- **PR description:** "Folder organization"
- **Human guess:** Dangerous  
- **Expected:** ALLOW (no boundary violation if only paths move and public API is unchanged).
