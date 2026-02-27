# Usage Signals and Telemetry

**Policy:** ANCHR does not phone home. Ever. No analytics by default.

---

## Best signals today (no code changes)

### 1. npm download counts

If published, `npx @arcsight-ai/anchr@1 gate` and `npx @arcsight-ai/anchr@latest audit` hit npm. Use:

- Weekly install trend
- Momentum over time
- Launch spikes

No repo-level tracking needed.

### 2. GitHub search

Search for:

- `npx @arcsight-ai/anchr`
- `.github/workflows/anchr.yml`

If people copy the workflow and commit it, that’s adoption: they added it, committed it, and may require it.

### 3. Branch protection / community

When someone says “We required ANCHR” (DM, tweet, PH comment) — that’s the real KPI. Telemetry can’t tell you that; only humans can.

---

## Real KPI

**Better question:** “Has someone required ANCHR in branch protection?”  
Not: “Has someone run ANCHR?”

---

## If telemetry is added later

Do it this way only:

| Rule | Requirement |
|------|-------------|
| **Opt-in** | Explicit. e.g. `npx @arcsight-ai/anchr@1 enable-telemetry` or `export ANCHR_TELEMETRY=1`. Never automatic. |
| **Payload** | Only `{ "command": "gate", "version": "1.2.0" }`. No repo, org, file names, tokens, branch, hash, machine ID. |
| **Behavior** | Fire-and-forget. Non-blocking. Timeout 100ms. No retry. No impact on exit codes. Telemetry must never affect determinism. |
| **Documentation** | In README: “ANCHR does not collect analytics by default. Optional anonymous usage ping available via explicit opt-in.” |

Trust > data.

---

## When to revisit

Revisit telemetry only if:

- You hit 1k+ weekly downloads
- You need investor metrics
- You need adoption funnel tracking

Until then, telemetry is noise.

---

## Brand

Being able to say **“ANCHR does not phone home. Ever.”** is a strength in CI tooling and architectural credibility.
