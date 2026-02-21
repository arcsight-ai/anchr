import { planRemediation } from "../src/remediation/index.js";

describe("remediation planner", () => {
  it("proceed produces exact template wording", () => {
    const plan = planRemediation({
      action: "proceed",
      reasonCode: "safe_structural",
      severity: "info",
      explanation: "No architectural impact detected.",
      semanticCauses: [],
    });
    expect(plan.summary).toBe("This change is architecturally safe.");
    expect(plan.steps).toEqual(["No action required."]);
    expect(plan.commitGuidance).toEqual(["Merge normally."]);
    expect(plan.verification).toEqual(["ANCHR verified structural integrity."]);
    expect(plan.education).toBe("No boundary rules were violated.");
    expect(plan.metadata.version).toBe("1");
    expect(plan.metadata.primaryCause).toBe("unknown");
    expect(plan.metadata.messageId).toMatch(/^[a-f0-9]{16}$/);
  });

  it("same decision produces identical messageId and text", () => {
    const input = {
      action: "fix-architecture" as const,
      reasonCode: "architectural_violation",
      severity: "critical",
      explanation: "Change violates package architectural boundaries.",
      semanticCauses: ["boundary_violation"],
    };
    const a = planRemediation(input);
    const b = planRemediation(input);
    expect(a.metadata.messageId).toBe(b.metadata.messageId);
    expect(a.summary).toBe(b.summary);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("primaryCause is first matching in priority order", () => {
    const plan = planRemediation({
      action: "require-migration",
      reasonCode: "public_api_break",
      severity: "critical",
      explanation: "Public API removal requires coordinated migration.",
      semanticCauses: ["deleted_public_api", "boundary_violation"],
    });
    expect(plan.metadata.primaryCause).toBe("boundary_violation");
  });

  it("semanticCauses normalized: lowercased, deduplicated, sorted", () => {
    const plan = planRemediation({
      action: "require-review",
      reasonCode: "manual_review_required",
      severity: "caution",
      explanation: "Change cannot be fully proven safe.",
      semanticCauses: ["BOUNDARY_VIOLATION", "boundary_violation", "deleted_public_api"],
    });
    expect(plan.metadata.primaryCause).toBe("boundary_violation");
  });

  it("fix-architecture has max 5 steps, 3 commitGuidance, 3 verification", () => {
    const plan = planRemediation({
      action: "fix-architecture",
      reasonCode: "architectural_violation",
      severity: "critical",
      explanation: "Change violates package architectural boundaries.",
      semanticCauses: ["boundary_violation"],
    });
    expect(plan.steps.length).toBeLessThanOrEqual(5);
    expect(plan.commitGuidance.length).toBeLessThanOrEqual(3);
    expect(plan.verification.length).toBeLessThanOrEqual(3);
  });

  it("rerun-analysis template", () => {
    const plan = planRemediation({
      action: "rerun-analysis",
      reasonCode: "analysis_incomplete",
      severity: "caution",
      explanation: "Analysis could not confidently complete; rerun required.",
      semanticCauses: ["certifier_script_missing"],
    });
    expect(plan.summary).toBe("Analysis incomplete.");
    expect(plan.steps).toContain("Re-run CI.");
    expect(plan.metadata.primaryCause).toBe("unknown");
  });
});
