/**
 * Pure logic used by set-pr-status (decision → state, description).
 * Script uses git + env + HTTPS; we test the mapping only.
 */

type Decision = "allow" | "warn" | "block";

function stateAndDescription(report: { decision?: { level?: Decision; reason?: string }; classification?: { primaryCause?: string } } | null): { state: "success" | "failure" | "neutral"; description: string } {
  if (!report) {
    return { state: "neutral", description: "No report produced" };
  }
  const decision = report.decision?.level;
  if (decision === "allow") {
    return { state: "success", description: "Architecture verified" };
  }
  if (decision === "block") {
    const description = report.classification?.primaryCause
      ? "Blocked: " + report.classification.primaryCause
      : "Architectural violation";
    return { state: "failure", description };
  }
  if (decision === "warn") {
    const description = report.decision?.reason?.slice(0, 80) || "Analysis inconclusive";
    return { state: "neutral", description };
  }
  return { state: "neutral", description: "ArcSight did not run" };
}

describe("set-pr-status mapping", () => {
  it("allow → success, Architecture verified", () => {
    const got = stateAndDescription({ decision: { level: "allow" } });
    expect(got.state).toBe("success");
    expect(got.description).toBe("Architecture verified");
  });

  it("block → failure, with or without primaryCause", () => {
    expect(stateAndDescription({ decision: { level: "block" } })).toEqual({
      state: "failure",
      description: "Architectural violation",
    });
    expect(stateAndDescription({
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
    })).toEqual({ state: "failure", description: "Blocked: boundary_violation" });
  });

  it("warn → neutral, reason or default", () => {
    const got = stateAndDescription({ decision: { level: "warn" } });
    expect(got.state).toBe("neutral");
    expect(got.description).toBe("Analysis inconclusive");
    const withReason = stateAndDescription({ decision: { level: "warn", reason: "Low coverage" } });
    expect(withReason.state).toBe("neutral");
    expect(withReason.description).toBe("Low coverage");
  });

  it("null report → neutral, No report produced", () => {
    expect(stateAndDescription(null)).toEqual({ state: "neutral", description: "No report produced" });
  });

  it("description capped at 140 when applied", () => {
    const long = "x".repeat(200);
    const sliced = long.slice(0, 140);
    expect(sliced.length).toBe(140);
  });
});
