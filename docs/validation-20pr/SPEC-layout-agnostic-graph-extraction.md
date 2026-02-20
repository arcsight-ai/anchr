# Layout-agnostic graph extraction — structured specification

No code. No file modifications. Machine-checkable rules only.

---

============================================================
SECTION 1 — Current Failure Mechanism (Grounded in Code)
============================================================

Discovery_Logic:
- scripts/anchr-structural-audit.ts discoverPackages(repoRoot): packagesDir = join(repoRoot, "packages"). readdirSync(packagesDir). For each direct child directory e: if join(packagesDir, e.name, "src") is a directory, set pkgDirByName.set(e.name, join(packagesDir, e.name)). No other paths or directory names are considered. No fallback when packagesDir does not exist or throws.

Empty_Package_Condition:
- join(repoRoot, "packages") does not exist (readdirSync throws, caught, no entries added). OR join(repoRoot, "packages") exists but has no direct child directory d such that join(repoRoot, "packages", d, "src") is a directory. Result: pkgDirByName.size === 0.

Skip_Detection_Condition:
- if (pkgDirByName.size > 0) { ... boundaryViolations = detectViolations(...) }. When pkgDirByName.size === 0 the block is not executed; boundaryViolations remains []. detectViolations is never called.

Current_Node_Definition:
- buildGraph (src/graph/buildGraph.ts) uses buildPackageMaps(repoRoot, files). File path mapped to package: rel.match(/^packages\/([^/]+)\/src\//) -> pkg = match[1]; rel.startsWith("source/") -> pkg = "root". Else file has no pkg, skipped. Node = ModuleID: pkg:name or pkg:name:relPath (fileToModuleId). srcDir = pkgDir for root, else join(pkgDir, "src"); relPath from absFile relative to srcDir; index normalized to pkg:name.

Current_Edge_Recording_Behavior:
- For each file with pkg and pkgDir: parseModuleDeps(content); for each valueImports and reExports spec, resolveSpecifier(absFile, spec, ctx); if res.target, edge key = moduleId→res.target#value-import or #reexport; edgeSet.add(key); nodeSet.add(res.target). Edges only recorded between nodes that exist (files that received a pkg from buildPackageMaps). detectViolations (boundary/relative_escape) uses getPackageFromPath: PKG_SRC_RE = /^packages\/([^/]+)\/src\// only; paths under source/ return null and are skipped (if (!pkg) continue).

---

============================================================
SECTION 2 — Non-Negotiable Invariants
============================================================

Required_Invariants:
1. Full dependency graph (nodes and edges) must always be constructed for every repo; no code path may produce an empty graph when source files exist.
2. No structural detection (boundary, cycle, relative_escape) may be skipped solely because package discovery returned empty or layout did not match a single pattern.
3. Supported layouts: (a) repo root contains "packages/" with subdirs each having "src/"; (b) repo root contains "source/" (optionally with subdirs); (c) repo root contains "src/"; (d) flat root (source files at or under repo root). All must yield a non-empty node set when listSourceFiles (or equivalent) returns non-empty.
4. Existing behavior preserved: cycle detection (detectCycles, cyclesToViolations) unchanged; cross-package violation semantics (boundary_violation when target not in public surface) preserved for multi-package repos; Catastrophic_FN must remain 0 on 20-PR benchmark.
5. FP count on 20-PR benchmark must not increase (FP must remain 0).

---

============================================================
SECTION 3 — Deterministic Layout-Agnostic Discovery Algorithm
============================================================

Discovery_Mode_Detection:
- Step 1: If exists(repoRoot, "packages") AND for at least one direct child d of "packages", exists(repoRoot, "packages", d, "src") THEN monorepo mode. Package roots = { join(repoRoot, "packages", d) for each d such that exists(repoRoot, "packages", d, "src") }.
- Step 2: Else if exists(repoRoot, "packages") with workspace config (e.g. package.json workspaces or pnpm-workspace.yaml) THEN monorepo mode; package roots from workspace config or "packages" subdirs as above.
- Step 3: Else: fallback mode (single logical package or folder-based units).

Fallback_Mode_Behavior:
- When no monorepo packages detected: Do NOT treat as zero packages. Define at least one logical unit: e.g. unit = repo root (single package "root") OR unit = each top-level directory under repo that contains .ts/.tsx (e.g. source/core -> "core", source/utils -> "utils"). Enumerate all source files (same inclusion/exclusion as listSourceFiles). Build full file-level dependency graph. Run boundary/cross-folder evaluation using folder or logical unit as package boundary. Do NOT early-return; do NOT skip detectViolations when pkgDirByName is empty. When pkgDirByName is empty, derive pkgDirByName and pkgNameByAbsFile from fallback (e.g. map each file to "root" or to folder name under source/), then call detectViolations with that map and a compatible public-surface rule (or allow-all-public for single-package).

Canonical_Node_Spec:
- Node ID: canonical repo-relative path. Normalize: path separators to single form; resolve "index" to directory path (e.g. dir/index.ts -> dir); resolve path aliases (tsconfig paths) to physical path for storage/key; deduplicate so one node per canonical file. Format: repo-relative path, no leading slash, normalized separators, lowercase if case-insensitive FS.
- Alternative (preserve ModuleID): pkg:path where pkg is from discovery (monorepo name or "root" or folder name); path is relative to package root. Index resolution: directory path used as canonical (no separate index.ts node that duplicates directory).

Edge_Recording_Spec:
- Record every import edge (value, type-only, reexport) that resolves to a target within the repo. Source and target = canonical node IDs. No filtering by layout. No conditional skip when package map is empty. Edges stored as (fromNode, toNode, kind). kind in { value-import, reexport, type-import }.

---

============================================================
SECTION 4 — Directional Enforcement Model
============================================================

Layer_Model_Schema (optional):
- If used: ordered list of layer names (e.g. ["core", "utils", "app"]) or (layer_name, order_number). Config: file path or env; format: one layer name per line, order = line index, or JSON array of layer names.

Layer_Order_Definition:
- For folder-based fallback: layer = first path segment under "source/" or "src/" (e.g. source/utils/merge.ts -> "utils"). Order: configurable; default e.g. core=0, utils=1, types=0 (same as core), app=2. If no config: infer order from existing edges (e.g. topological order) or treat all same layer (no directional block).

Directional_Block_Rule:
- Machine-checkable: FOR each new edge (from, to) in diff: from_pkg = package_of(from), to_pkg = package_of(to). IF from_pkg !== to_pkg AND layer_order(from_pkg) > layer_order(to_pkg) THEN emit boundary_violation (directional). Same-layer (from_pkg === to_pkg) never block. Test-only: edge where from or to is under test dir (__tests__, tests, test) or *.test.*/*.spec.*: do not block (configurable). Must not require monorepo layout: rule must work when packages are derived from folder names (e.g. source/utils -> utils, source/core -> core).

---

============================================================
SECTION 5 — Mandatory Runtime Assertions
============================================================

Runtime_Assertions:
1. After graph build: nodeCount > 0 OR listSourceFiles returned empty. If listSourceFiles non-empty and nodeCount === 0 then abort or fallback; do not proceed with empty graph.
2. For every PR run: edge delta (or full graph) computed; no path may skip graph build or violation detection because "no packages found."
3. Assert: (pkgDirByName.size > 0) OR (fallback package map applied and detectViolations called). Violation: log "layout_fallback_used" and continue with fallback-derived map.
4. Log: layout_detection_mode in { "monorepo_packages", "workspace_packages", "fallback_single_root", "fallback_folder_units" }.
5. Structural evaluation (cycle detection + boundary/cross-unit detection) always executed; never skipped due to empty package map.

---

============================================================
SECTION 6 — Benchmark Regression Constraints
============================================================

Benchmark_Target:
- TP = 1, FP = 0, FN = 0, TN = 19, Catastrophic_FN = 0. Human ground truth and result JSONs unchanged; only engine behavior may change.

Regression_Guards:
- No new BLOCK decisions on the 19 current TN PRs. Only sindresorhus_ky_751 may change from ALLOW to BLOCK. Automated test: run 20-PR validation; assert evaluation-table.csv has exactly one FN (sindresorhus_ky_751) before fix and zero FNs after; FP count remains 0; TN count remains 19; TP count becomes 1.

---

============================================================
SECTION 7 — Complexity & Performance Bound
============================================================

Time_Complexity_Per_PR:
- O(files + edges). Same as current: listSourceFiles O(files), buildGraph O(files * avg_imports), detectViolations O(diff_files * avg_imports). Fallback adds at most one extra pass over files to assign folder-based package names.

Worst_Case_Scaling:
- Linear in number of source files and in number of import edges. No quadratic blow-up. Fallback must not do full graph diff base vs head (if currently only head is built, keep that).

Incremental_Caching_Needed: no
- Current implementation does not cache; single head graph. No requirement for incremental cache for this redesign.

---

============================================================
SECTION 8 — Failure Mode Containment
============================================================

Failure_Risks:
- Over-blocking flat layouts: single directory with many files treated as one package; any "cross-folder" rule could misclassify if folder boundaries are used as layer boundaries.
- Misclassification of folder boundaries: source/utils vs source/core is clear; source/core/foo vs source/core/bar may be same layer; must not treat every subfolder as a layer.
- Alias resolution mismatch: tsconfig paths (e.g. @utils/merge) must resolve to same canonical path as relative import; else duplicate nodes or missing edges.
- Duplicate node inflation: index resolution and path aliases must produce one node per canonical file; else edge count and violation reporting inflated.
- Cross-folder false positives: folder-based fallback may create packages "utils", "core"; must not block same-folder imports; must not block test->src edges if policy excludes test-only.

Mitigations:
- Folder-based package: use only first path segment under source/ or src/ (one level). Do not create a package per subfolder.
- Alias resolution: use same resolver as buildGraph (resolveSpecifier); canonicalPath for storage; single pkgNameByAbsFile and pkgDirByName derived from same discovery.
- Index: normalize to directory path for node ID when file is index.ts.
- Test-only: exclude edges that are entirely within test directories or mark test nodes and do not emit directional block for test->src (or configurable).

---

============================================================
SECTION 9 — Implementation Phases
============================================================

Implementation_Steps:
1. Refactor discovery: implement layout detection (monorepo vs fallback); populate pkgDirByName and pkgNameByAbsFile for fallback (e.g. source/ -> folder names as packages, or single "root").
2. Remove skip: remove or invert condition "if (pkgDirByName.size > 0)"; when size === 0, apply fallback package map and call detectViolations with it; ensure computePublicFiles (or fallback) accepts the map.
3. Add fallback graph mode: when discoverPackages returns empty, derive package map from buildPackageMaps (buildGraph) or from folder scan under source/ and src/; pass to detectViolations; ensure getPackageFromPath (or equivalent) returns consistent package for paths under source/ (e.g. source/utils/merge.ts -> "utils").
4. Add runtime assertions: assert nodeCount > 0 when files exist; assert detectViolations was called (or fallback path taken); log layout_detection_mode.
5. Re-run 20-PR benchmark: same SHAs, same human labels; assert TP=1, FP=0, FN=0, TN=19, Catastrophic_FN=0.
6. Add invariant test: lock metrics (e.g. snapshot or CI check); fail if FP>0 or FN>0 or Catastrophic_FN>0 on the frozen 20-PR set.

---
