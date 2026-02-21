import {
  formatExplainOutput,
  RULE_TO_FIX,
  RULE_TO_INTENT,
  type ExplainReportInput,
} from "../src/explain/index.js";

const repoRoot = "/repo";

describe("formatExplainOutput", () => {
  it("ALLOW: summary only, next step, ANCHR_DATA with empty violations", () => {
    const input: ExplainReportInput = {
      status: "VERIFIED",
      decision: { level: "allow", reason: "" },
      classification: { primaryCause: null },
    };
    const { lines, structured } = formatExplainOutput(input, repoRoot);
    expect(lines.join("\n")).toContain("ANCHR Architectural Guidance");
    expect(lines.join("\n")).toContain("Result: ALLOW");
    expect(lines.join("\n")).toContain("Confidence: High");
    expect(lines.join("\n")).toContain("Primary issue:");
    expect(lines.join("\n")).toContain("None");
    expect(lines.join("\n")).toContain("Next step:");
    expect(lines.join("\n")).toContain("Run: anchr fix --apply");
    expect(lines.join("\n")).toContain("<!-- ANCHR_DATA");
    expect(structured.result).toBe("ALLOW");
    expect(structured.confidence).toBe("High");
    expect(structured.violations).toHaveLength(0);
  });

  it("UNCERTAIN: suggests anchr check --deep and exit-friendly message", () => {
    const input: ExplainReportInput = {
      status: "INDETERMINATE",
      decision: { level: "warn", reason: "" },
      classification: { primaryCause: null },
    };
    const { lines, structured } = formatExplainOutput(input, repoRoot);
    expect(lines.join("\n")).toContain("Result: UNCERTAIN");
    expect(lines.join("\n")).toContain("Confidence: Low");
    expect(lines.join("\n")).toContain("Proof incomplete.");
    expect(lines.join("\n")).toContain("Run: anchr check --deep");
    expect(lines.join("\n")).toContain("ANCHR cannot determine architectural safety.");
    expect(structured.result).toBe("UNCERTAIN");
  });

  it("BLOCK: grouped by source→target, boundary why, intent and fix in ANCHR_DATA", () => {
    const input: ExplainReportInput = {
      status: "BLOCKED",
      decision: { level: "block", reason: "boundary_violation" },
      classification: { primaryCause: "boundary_violation" },
      proofs: [
        {
          type: "import_path",
          source: "/repo/packages/foo/src/a.ts",
          target: "/repo/packages/bar/src/b.ts",
          rule: "boundary_violation",
        },
      ],
    };
    const { lines, structured } = formatExplainOutput(input, repoRoot);
    expect(lines.join("\n")).toContain("Result: BLOCK");
    expect(lines.join("\n")).toContain("foo → bar");
    expect(lines.join("\n")).toContain("Why this boundary exists:");
    expect(lines.join("\n")).toContain(
      "The target package exposes a stable public contract only through its entrypoint.",
    );
    expect(lines.join("\n")).toContain("packages/foo/src/a.ts");
    expect(lines.join("\n")).toContain(RULE_TO_FIX.boundary_violation);
    expect(structured.result).toBe("BLOCK");
    expect(structured.violations).toHaveLength(1);
    expect(structured.violations[0]).toMatchObject({
      source: "foo",
      target: "bar",
      type: "boundary_violation",
      intent: RULE_TO_INTENT.boundary_violation,
      fix: RULE_TO_FIX.boundary_violation,
    });
    expect(structured.violations[0]!.files).toContain("packages/foo/src/a.ts");
  });

  it("ANCHR_DATA JSON has sorted keys", () => {
    const input: ExplainReportInput = {
      status: "VERIFIED",
      decision: { level: "allow", reason: "" },
    };
    const { lines } = formatExplainOutput(input, repoRoot);
    const dataLine = lines.find((l) => l.startsWith("{") && l.endsWith("}"));
    expect(dataLine).toBeDefined();
    const parsed = JSON.parse(dataLine!);
    expect(Object.keys(parsed)).toEqual(["confidence", "result", "violations"]);
  });
});
