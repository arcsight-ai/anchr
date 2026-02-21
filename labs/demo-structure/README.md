# Demo structure — ANCHR validation harness

Layer contract: core <- api <- app

Rules:
- core must NOT import api or app
- api may import core
- app may import api (and core only if layer rules allow; for strict demo, app must NOT import core)

If layer rules are not enforced yet in ANCHR, state that clearly in docs/demo-artifacts/demo-layer-summary.md.

This folder must not affect engine build. Analyzable via running ANCHR from this directory (git repo required).
