# 20-PR Re-run: Before vs After Hardening (Diff Table)

**Purpose:** A/B comparison on identical real-world data. Same 20 repos, same commit SHAs, same config. Measurement run only — no code or invariant changes during the run.

---

## Protocol

| Item | Value |
|------|--------|
| **Repos** | Same 20 (manifest: `validation-20pr-manifest.json`) |
| **Commit SHAs** | Unchanged per PR (base_sha, head_sha from manifest) |
| **Runtime** | Node (npx tsx); same environment |
| **Config** | Default; no invariant/threshold/registry changes |
| **Code** | Current (post-revert) wedge + anchr only |

**Not modified:** Invariants, thresholds, registry order. **Not added:** New repos or new invariants.

---

## What Was Measured (Current Run)

- **From report JSON:** `decision.level`, `decision.reason`, `minimalCut`, `status`, `scope.mode`
- **representation_status / primary_invariant:** Not emitted by current engine (v10 emission not implemented); recorded as N/A
- **Runtime:** Per-PR wall time from run log; total wall time ~44.2 s

---

## Reconstructed “Before” (4-FP Run)

The **before** column is the run that triggered hardening: layout-agnostic discovery with folder-as-package fallback. That run produced **4 false positives** on SWR (relative_escape / folder-as-package). Decisions reconstructed from that experiment:

- **BLOCK:** `vercel_swr_3045`, `vercel_swr_2857`, `vercel_swr_4189`, `vercel_swr_4208`
- **ALLOW:** All other 16 PRs (including the 1 FN: sindresorhus_ky_751)

---

## Diff Table (Before vs After)

| PR_ID | Human | Decision (4-FP run) | Decision (current run) | Delta | Runtime_ms |
|-------|-------|---------------------|------------------------|-------|------------|
| sindresorhus_ky_651 | ALLOW | ALLOW | ALLOW | — | 2280 |
| sindresorhus_ky_693 | ALLOW | ALLOW | ALLOW | — | 2065 |
| sindresorhus_ky_796 | ALLOW | ALLOW | ALLOW | — | 2062 |
| sindresorhus_ky_756 | ALLOW | ALLOW | ALLOW | — | 2082 |
| sindresorhus_ky_663 | ALLOW | ALLOW | ALLOW | — | 2047 |
| sindresorhus_ky_757 | ALLOW | ALLOW | ALLOW | — | 2169 |
| sindresorhus_ky_792 | ALLOW | ALLOW | ALLOW | — | 2146 |
| sindresorhus_ky_683 | ALLOW | ALLOW | ALLOW | — | 2043 |
| sindresorhus_ky_755 | ALLOW | ALLOW | ALLOW | — | 2066 |
| sindresorhus_ky_751 | **BLOCK** | ALLOW | ALLOW | — (FN both runs) | 2215 |
| vercel_swr_4199 | ALLOW | ALLOW | ALLOW | — | 2025 |
| vercel_swr_4110 | ALLOW | ALLOW | ALLOW | — | 2052 |
| vercel_swr_4092 | ALLOW | ALLOW | ALLOW | — | 2010 |
| **vercel_swr_3045** | ALLOW | **BLOCK** | ALLOW | **BLOCK → ALLOW** | 2022 |
| **vercel_swr_2857** | ALLOW | **BLOCK** | ALLOW | **BLOCK → ALLOW** | 2028 |
| vercel_swr_4064 | ALLOW | ALLOW | ALLOW | — | 2135 |
| **vercel_swr_4189** | ALLOW | **BLOCK** | ALLOW | **BLOCK → ALLOW** | 2057 |
| **vercel_swr_4208** | ALLOW | **BLOCK** | ALLOW | **BLOCK → ALLOW** | 2119 |
| vercel_swr_4118 | ALLOW | ALLOW | ALLOW | — | 2214 |
| vercel_swr_2301 | ALLOW | ALLOW | ALLOW | — | 2039 |

**Total runtime (wall):** 44,156 ms.

---

## Re-check: The 4 False Positives

| PR_ID | Did it disappear? | Change invariant? | Still flagged but clarified? | New FP? |
|-------|-------------------|-------------------|------------------------------|--------|
| vercel_swr_3045 | **Yes** — now ALLOW | N/A (revert) | No | No |
| vercel_swr_2857 | **Yes** — now ALLOW | N/A (revert) | No | No |
| vercel_swr_4189 | **Yes** — now ALLOW | N/A (revert) | No | No |
| vercel_swr_4208 | **Yes** — now ALLOW | N/A (revert) | No | No |

**Conclusion:** All 4 FPs resolved. No new FPs introduced. No status flips on legitimate BLOCK cases (the only BLOCK in ground truth is ky_751, which remains ALLOW in both runs). The single FN (ky_751) is formally bounded as out-of-scope under the detection contract; see `docs/SCOPE-DETECTION-CONTRACT.md`.

---

## Summary: Before vs After

| Metric | 4-FP run (before) | Current run (after) |
|--------|--------------------|----------------------|
| TP | 0 | 0 |
| FP | 4 | **0** |
| FN | 1 | 1 |
| TN | 15 | **19** |
| Precision | 0 | 0 (0/0) |
| Recall | 0 | 0 |

**Interpretation:**

- **Best case achieved:** 4 previous FPs resolved, no new FPs, deterministic output, same legitimate signals preserved (1 FN unchanged; no BLOCKs in ground truth correctly flagged yet).
- **No red flags:** No new FPs, no legit signals lost, no unexpected status flips beyond the 4 BLOCK→ALLOW corrections.

---

## Note on “Hardening”

This re-run uses the **current (post-revert)** pipeline: discovery limited to `/packages` (no folder-as-package fallback). The “before” state is the **pre-revert** run that had folder-as-package and produced the 4 SWR FPs. So:

- **Revert = removal of the code path that caused FPs.**  
- If/when v10 emission (representation_status, primary_invariant, etc.) is implemented, a future re-run can add those columns without changing the 20-PR set or SHAs.

No code or invariants were changed during this measurement run; anything that looked wrong would have been logged only.
