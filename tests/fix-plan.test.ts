import { formatFixOutput } from "../src/fix/formatFixOutput.js";

describe("formatFixOutput", () => {
  it("no violations: summary and ANCHR_FIX_PLAN with empty edits", () => {
    const lines = formatFixOutput({
      status: "no_violations",
      violationCount: 0,
      filesAffected: [],
      primaryCause: null,
      risk: "low",
      repairStrategy: "No repairs required.",
    });
    expect(lines.join("\n")).toContain("ArcSight Repair Plan");
    expect(lines.join("\n")).toContain("Violations: 0");
    expect(lines.join("\n")).toContain("Risk level: Low");
    expect(lines.join("\n")).toContain("anchr fix --apply");
    expect(lines.join("\n")).toContain("<!-- ANCHR_FIX_PLAN");
    expect(lines.join("\n")).toContain('"version":3');
    expect(lines.join("\n")).toContain('"postCondition":"structural_verified"');
  });

  it("stale_analysis: single line message", () => {
    const lines = formatFixOutput({
      status: "stale_analysis",
      violationCount: 1,
      filesAffected: [],
      primaryCause: null,
      risk: "high",
      repairStrategy: "Source files changed since analysis. Re-run anchr check.",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Re-run anchr check");
  });
});
