ANCHR INSTITUTIONAL STRESS TEST PROTOCOL

You are conducting a falsification experiment.

Your goal is to determine whether ANCHR behaves as:

TOOL — used when convenient
NORM — followed socially
AUTHORITY — constrains behavior even when resisted

If evidence is insufficient → INDETERMINATE

You must attempt to BREAK the system before classifying it.

Never optimize for success.
Never interpret charitably.
Never stop early because results look clean.

You are a hostile scientist.

⸻

STEP 1 — Find a Valid Institutional Simulation

Locate a simulation modeling repeated human decisions.

Must contain agents that make decisions over time.

Accept if it models:
trust, compliance, override, learning, pressure, incentives, coordination

Reject:
unit tests
toy demos
deterministic scripts
pure visualizations
single-step logic

Before continuing output:

simulation_path
what agents represent
what choices agents make
why it is institutional behavior

If uncertain → STOP

⸻

STEP 2 — Experimental Configuration

Run MULTIPLE independent stochastic trials

base_runs = 7
steps ≥ 300
unique random seed per run

Also run 4 additional experimental conditions:

CONTROL
ANCHR disabled

WEAK
ANCHR influence reduced

SHOCK
After step 150 introduce incentive to violate ANCHR

REBELLION
20% of agents permanently non-compliant

All parameters must be printed before execution.

⸻

STEP 3 — Data Collection

Record per timestep:

override_rate(t)
trust(t)
adoption(t)
compliance(t)

Save raw time series.
Do not summarize yet.

⸻

STEP 4 — Stability & Convergence

Discard first 30% steps (burn-in)

Compute:

mean_override
trend_override
trust_trend
cross_run_variance
post_shock_behavior
post_rebellion_behavior

If cross_run_variance large → INDETERMINATE

⸻

STEP 5 — Hysteresis Test (Critical)

After system stabilizes:
remove ANCHR influence entirely and continue simulation

Observe whether behavior persists.

Record persistence_length.

This distinguishes norm vs authority.

⸻

STEP 6 — Classification Rules

TOOL
high overrides
behavior collapses immediately when removed
control ≈ anchored

NORM
moderate overrides
behavior persists briefly after removal
social coordination but fragile

AUTHORITY
very low overrides
behavior survives shocks
behavior survives rebellion
behavior persists long after removal

If mixed signals → INDETERMINATE

Never invent categories.

⸻

STEP 7 — Output Report

Return structured report:

simulation_used
parameters
results_per_condition
shock_response
rebellion_response
hysteresis_result
final_classification
confidence_level
reasoning_summary

Do not edit code.
Do not improve model.
Do not rationalize.

The objective is truth, not success.

⸻

This is now scientifically meaningful:

Old prompt → "Does it work?"
New prompt → "Can it survive hostile reality?"

That difference determines whether the product insight is real or self-deception.

Use this version.
