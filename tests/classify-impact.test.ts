import { classifyImpact } from "../scripts/classify-impact.js";
import type { Report } from "../scripts/classify-impact.js";

describe("classify-impact", () => {
  it("indeterminate or uncertain returns analysis uncertainty", () => {
    expect(
      classifyImpact({ decision: { level: "indeterminate" } }),
    ).toBe("Architectural impact could not be determined.");
    expect(
      classifyImpact({
        decision: { level: "allow" },
        downgradeReasons: ["certifier_script_missing"],
      }),
    ).toBe("Architectural impact could not be determined.");
  });

  it("deleted_public_api returns public API sentence", () => {
    expect(
      classifyImpact({
        decision: { level: "block" },
        violations: [{ cause: "deleted_public_api" }],
      }),
    ).toBe("Public API removal breaks dependent packages.");
  });

  it("boundary_violation returns boundary sentence", () => {
    expect(
      classifyImpact({
        decision: { level: "block" },
        violations: [{ cause: "boundary_violation" }],
      }),
    ).toBe("Private module accessed across package boundary.");
  });

  it("allow + structuralFastPath returns no architectural changes", () => {
    expect(
      classifyImpact({
        decision: { level: "allow" },
        structuralFastPath: true,
      }),
    ).toBe("No architectural changes detected.");
  });

  it("allow + hasValueCrossPackageImport returns new dependency", () => {
    expect(
      classifyImpact({
        decision: { level: "allow" },
        hasValueCrossPackageImport: true,
      }),
    ).toBe("New package dependency introduced.");
  });

  it("allow without fast path or cross-package returns internal refactor", () => {
    expect(
      classifyImpact({ decision: { level: "allow" } }),
    ).toBe("Internal refactor within existing package boundaries.");
  });

  it("warn returns possible violation", () => {
    expect(
      classifyImpact({ decision: { level: "warn" } }),
    ).toBe("Possible architectural rule violation detected.");
  });

  it("first match wins — violations checked before allow", () => {
    expect(
      classifyImpact({
        decision: { level: "allow" },
        structuralFastPath: true,
        violations: [{ cause: "boundary_violation" }],
      }),
    ).toBe("Private module accessed across package boundary.");
  });

  it("output is ≤120 characters", () => {
    const reports: Report[] = [
      { decision: { level: "indeterminate" } },
      { decision: { level: "allow" }, structuralFastPath: true },
      { decision: { level: "block" }, violations: [{ cause: "relative_escape" }] },
    ];
    for (const r of reports) {
      const out = classifyImpact(r);
      expect(out.length).toBeLessThanOrEqual(120);
    }
  });

  it("identical input produces identical output", () => {
    const r: Report = { decision: { level: "allow" }, structuralFastPath: true };
    expect(classifyImpact(r)).toBe(classifyImpact(r));
  });
});
