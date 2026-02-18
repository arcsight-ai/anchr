import { explainResult } from "../scripts/explain-result.js";
import type { ExplanationInput, Violation } from "../scripts/explain-result.js";
import type { ReviewerAction } from "../scripts/recommend-action.js";

function action(overrides: Partial<ReviewerAction>): ReviewerAction {
  return {
    code: "ESCALATE",
    category: "UNCERTAIN_ANALYSIS",
    message: "Manual review recommended",
    ...overrides,
  };
}

describe("explain-result", () => {
  it("SAFE example: MERGE + SAFE_TRIVIAL", () => {
    const input: ExplanationInput = {
      action: action({ code: "MERGE", category: "SAFE_TRIVIAL" }),
    };
    const out = explainResult(input);
    expect(out).toBe(
      "ArcSight verified no architectural impact\nThe change does not alter package dependencies",
    );
    expect(out.endsWith("\n")).toBe(false);
    expect(out).not.toContain("\r");
  });

  it("BLOCK example: boundary violation with toPkg", () => {
    const input: ExplanationInput = {
      action: action({ code: "BLOCK", category: "ARCHITECTURE_VIOLATION" }),
      violations: [{ cause: "boundary_violation", toPkg: "epistemic-kernel" }],
    };
    const out = explainResult(input);
    expect(out).toContain("ArcSight detected an architectural boundary violation");
    expect(out).toContain("The change breaks a declared package boundary");
    expect(out).toContain("Import from epistemic-kernel internal module detected");
    expect(out.endsWith("\n")).toBe(false);
  });

  it("ESCALATE example: with downgradeReasons", () => {
    const input: ExplanationInput = {
      action: action({ code: "ESCALATE", category: "UNCERTAIN_ANALYSIS" }),
      downgradeReasons: ["certifier_script_missing"],
    };
    const out = explainResult(input);
    expect(out).toContain("ArcSight could not reach a reliable conclusion");
    expect(out).toContain("The analysis result is not deterministic");
    expect(out).toContain("Manual review is recommended");
    expect(out).not.toContain("certifier_script_missing");
  });

  it("does not end with newline", () => {
    const out = explainResult({ action: action({}) });
    expect(out.endsWith("\n")).toBe(false);
  });

  it("uses only \\n (no \\r\\n)", () => {
    const out = explainResult({ action: action({}) });
    expect(out).not.toContain("\r");
    expect(out.split("\n").length).toBeGreaterThanOrEqual(2);
  });

  it("output is at least 2 lines", () => {
    const out = explainResult({ action: action({ code: "MERGE", category: "SAFE_TRIVIAL" }) });
    expect(out.split("\n").length).toBeGreaterThanOrEqual(2);
  });

  it("output does not exceed 6 lines", () => {
    const input: ExplanationInput = {
      action: action({ code: "BLOCK", category: "ARCHITECTURE_VIOLATION" }),
      violations: [
        { cause: "boundary_violation", toPkg: "a" },
        { cause: "relative_escape" },
        { cause: "type_import_private_target" },
      ],
      downgradeReasons: ["x"],
    };
    const out = explainResult(input);
    expect(out.split("\n").length).toBeLessThanOrEqual(6);
  });

  it("output does not exceed 420 characters", () => {
    const input: ExplanationInput = {
      action: action({ code: "BLOCK", category: "ARCHITECTURE_VIOLATION" }),
      violations: [
        { cause: "boundary_violation", toPkg: "pkg-a" },
        { cause: "deleted_public_api", fromPkg: "pkg-b" },
        { cause: "relative_escape" },
      ],
      downgradeReasons: ["reason"],
    };
    const out = explainResult(input);
    expect(out.length).toBeLessThanOrEqual(420);
  });

  it("identical input produces byte-identical output", () => {
    const input: ExplanationInput = {
      action: action({ code: "REVIEW", category: "SAFE_COMPLEX" }),
      violations: [{ cause: "relative_escape" }],
    };
    expect(explainResult(input)).toBe(explainResult(input));
  });

  it("violations are deduped and sorted deterministically", () => {
    const input: ExplanationInput = {
      action: action({ code: "BLOCK", category: "ARCHITECTURE_VIOLATION" }),
      violations: [
        { cause: "relative_escape" },
        { cause: "relative_escape" },
        { cause: "boundary_violation", toPkg: "b" },
        { cause: "boundary_violation", toPkg: "a" },
      ],
    };
    const out = explainResult(input);
    expect(out).toContain("Relative import escapes package boundary");
    expect(out).toContain("Import from a internal module detected");
    expect(out).toContain("Import from b internal module detected");
    const relCount = (out.match(/Relative import escapes/g) ?? []).length;
    expect(relCount).toBe(1);
  });

  it("only first 3 violations after sort are used", () => {
    const input: ExplanationInput = {
      action: action({ code: "BLOCK", category: "ARCHITECTURE_VIOLATION" }),
      violations: [
        { cause: "relative_escape" },
        { cause: "relative_escape" },
        { cause: "type_import_private_target" },
        { cause: "boundary_violation", toPkg: "z" },
      ],
    };
    const out = explainResult(input);
    const lines = out.split("\n");
    const violationLines = lines.slice(2).filter((l) => l !== "Manual review is recommended");
    expect(violationLines.length).toBeLessThanOrEqual(3);
  });

  it("skips violation when required field empty (boundary_violation needs toPkg)", () => {
    const input: ExplanationInput = {
      action: action({ code: "BLOCK", category: "ARCHITECTURE_VIOLATION" }),
      violations: [{ cause: "boundary_violation", toPkg: "" }],
    };
    const out = explainResult(input);
    expect(out).not.toContain("Import from  internal module");
  });

  it("unknown cause is ignored safely", () => {
    const input: ExplanationInput = {
      action: action({ code: "BLOCK", category: "ARCHITECTURE_VIOLATION" }),
      violations: [{ cause: "future_cause", fromPkg: "x" }],
    };
    const out = explainResult(input);
    expect(out.split("\n").length).toBe(2);
  });

  it("null/undefined arrays normalized to empty", () => {
    expect(explainResult({ action: action({}), violations: null }).split("\n").length).toBeGreaterThanOrEqual(2);
    expect(explainResult({ action: action({}), downgradeReasons: undefined }).split("\n").length).toBeGreaterThanOrEqual(2);
  });

  it("unknown code/category fallback to ESCALATE / not deterministic", () => {
    const input: ExplanationInput = {
      action: { code: "UNKNOWN" as any, category: "UNKNOWN" as any, message: "x" },
    };
    const out = explainResult(input);
    expect(out).toContain("ArcSight could not reach a reliable conclusion");
    expect(out).toContain("The analysis result is not deterministic");
  });
});
