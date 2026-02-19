import {
  formatCheckOutput,
  resultAndConfidence,
  RULE_TO_FIX,
  type CheckReportInput,
} from "../src/check/index.js";

const repoRoot = "/repo";

describe("resultAndConfidence", () => {
  it("VERIFIED → ALLOW, PROVEN_SAFE", () => {
    const { result, confidence } = resultAndConfidence({
      status: "VERIFIED",
      decision: { level: "allow", reason: "" },
    });
    expect(result).toBe("ALLOW");
    expect(confidence).toBe("PROVEN_SAFE");
  });

  it("BLOCKED → BLOCK, PROVEN_VIOLATION", () => {
    const { result, confidence } = resultAndConfidence({
      status: "BLOCKED",
      decision: { level: "block", reason: "boundary_violation" },
      proofs: [],
    });
    expect(result).toBe("BLOCK");
    expect(confidence).toBe("PROVEN_VIOLATION");
  });

  it("INDETERMINATE → UNCERTAIN, INCOMPLETE_PROOF", () => {
    const { result, confidence } = resultAndConfidence({
      status: "INDETERMINATE",
      decision: { level: "warn", reason: "" },
    });
    expect(result).toBe("UNCERTAIN");
    expect(confidence).toBe("INCOMPLETE_PROOF");
  });

  it("INCOMPLETE → UNCERTAIN, INCOMPLETE_PROOF", () => {
    const { result } = resultAndConfidence({
      status: "INCOMPLETE",
      decision: { level: "warn", reason: "git_unavailable" },
    });
    expect(result).toBe("UNCERTAIN");
  });
});

describe("formatCheckOutput", () => {
  it("ALLOW and not verbose: minimal output", () => {
    const lines = formatCheckOutput(
      { status: "VERIFIED", decision: { level: "allow", reason: "" } },
      repoRoot,
      false,
    );
    expect(lines[0]).toBe("RESULT: ALLOW");
    expect(lines[1]).toBe("Confidence: PROVEN_SAFE");
    expect(lines[2]).toBe("");
    expect(lines[3]).toBe("No architectural impact detected.");
  });

  it("UNCERTAIN: suggests --deep", () => {
    const lines = formatCheckOutput(
      {
        status: "INDETERMINATE",
        decision: { level: "warn", reason: "" },
      },
      repoRoot,
      false,
    );
    expect(lines.join("\n")).toContain("Proof incomplete");
    expect(lines.join("\n")).toContain("anchr check --deep");
  });

  it("BLOCK: boundary context From/To and rule→fix", () => {
    const input: CheckReportInput = {
      status: "BLOCKED",
      decision: { level: "block", reason: "boundary_violation" },
      proofs: [
        {
          type: "import_path",
          source: "/repo/packages/foo/src/a.ts",
          target: "/repo/packages/bar/src/b.ts",
          rule: "boundary_violation",
        },
      ],
    };
    const lines = formatCheckOutput(input, repoRoot, false);
    expect(lines[0]).toBe("RESULT: BLOCK");
    expect(lines[1]).toBe("Confidence: PROVEN_VIOLATION");
    expect(lines).toContain("packages/foo/src/a.ts");
    expect(lines).toContain("From: foo");
    expect(lines).toContain("To: bar");
    expect(lines).toContain("Rule: boundary_violation");
    expect(lines).toContain(RULE_TO_FIX.boundary_violation);
  });

  it("violations sorted by file path", () => {
    const input: CheckReportInput = {
      status: "BLOCKED",
      decision: { level: "block", reason: "boundary_violation" },
      proofs: [
        {
          type: "import_path",
          source: "/repo/packages/z/src/z.ts",
          target: "/repo/packages/a/src/a.ts",
          rule: "boundary_violation",
        },
        {
          type: "import_path",
          source: "/repo/packages/a/src/a.ts",
          target: "/repo/packages/z/src/z.ts",
          rule: "boundary_violation",
        },
      ],
    };
    const lines = formatCheckOutput(input, repoRoot, false);
    const pathLines = lines.filter((l) => l.startsWith("packages/"));
    expect(pathLines[0]).toBe("packages/a/src/a.ts");
    expect(pathLines[1]).toBe("packages/z/src/z.ts");
  });
});
