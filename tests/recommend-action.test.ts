import {
  recommendAction,
  type ReviewerAction,
  type Report,
} from "../scripts/recommend-action.js";

describe("recommend-action", () => {
  it("never throws on null or undefined", () => {
    expect(() => recommendAction(null)).not.toThrow();
    expect(() => recommendAction(undefined)).not.toThrow();
  });

  it("never throws on empty or malformed input", () => {
    expect(() => recommendAction({})).not.toThrow();
    expect(() => recommendAction({ decision: null })).not.toThrow();
    expect(() => recommendAction({ decision: {} })).not.toThrow();
    expect(() => recommendAction({ decision: { level: null } })).not.toThrow();
    expect(() => recommendAction({ decision: { level: "invalid" } })).not.toThrow();
    expect(() => recommendAction("not an object")).not.toThrow();
    expect(() => recommendAction(42)).not.toThrow();
  });

  it("always returns valid ReviewerAction", () => {
    const out = recommendAction(null);
    expect(out).toMatchObject({
      code: expect.stringMatching(/^(MERGE|REVIEW|BLOCK|ESCALATE)$/),
      category: expect.any(String),
      message: expect.any(String),
    });
    expect(typeof out.code).toBe("string");
    expect(typeof out.category).toBe("string");
    expect(typeof out.message).toBe("string");
  });

  it("null/undefined/unknown level → ESCALATE SYSTEM_FALLBACK or UNCERTAIN", () => {
    expect(recommendAction(null).code).toBe("ESCALATE");
    expect(recommendAction(undefined).code).toBe("ESCALATE");
    expect(recommendAction({}).code).toBe("ESCALATE");
    expect(recommendAction({ decision: { level: "unknown" } }).code).toBe("ESCALATE");
  });

  it("1 — uncertain → ESCALATE UNCERTAIN_ANALYSIS", () => {
    const r = recommendAction({
      decision: { level: "indeterminate" },
    } as Report);
    expect(r).toEqual({
      code: "ESCALATE",
      category: "UNCERTAIN_ANALYSIS",
      message: "Request manual architectural review",
    });
    const r2 = recommendAction({
      decision: { level: "allow" },
      downgradeReasons: ["certifier_script_missing"],
    } as Report);
    expect(r2.code).toBe("ESCALATE");
    expect(r2.category).toBe("UNCERTAIN_ANALYSIS");
  });

  it("2 — block → BLOCK ARCHITECTURE_VIOLATION", () => {
    const r = recommendAction({ decision: { level: "block" } } as Report);
    expect(r).toEqual({
      code: "BLOCK",
      category: "ARCHITECTURE_VIOLATION",
      message: "Do not merge this change",
    });
  });

  it("3 — warn → REVIEW RISKY_CHANGE", () => {
    const r = recommendAction({ decision: { level: "warn" } } as Report);
    expect(r).toEqual({
      code: "REVIEW",
      category: "RISKY_CHANGE",
      message: "Review architectural impact before merging",
    });
  });

  it("4 — allow + structuralFastPath → MERGE SAFE_TRIVIAL", () => {
    const r = recommendAction({
      decision: { level: "allow" },
      structuralFastPath: true,
    } as Report);
    expect(r).toEqual({
      code: "MERGE",
      category: "SAFE_TRIVIAL",
      message: "Merge normally",
    });
  });

  it("5 — allow, no fast path, no violations → REVIEW SAFE_COMPLEX", () => {
    const r = recommendAction({
      decision: { level: "allow" },
      structuralFastPath: false,
    } as Report);
    expect(r).toEqual({
      code: "REVIEW",
      category: "SAFE_COMPLEX",
      message: "Merge after reviewing dependency change",
    });
  });

  it("6 — allow + violations falls through to fallback", () => {
    const r = recommendAction({
      decision: { level: "allow" },
      structuralFastPath: false,
      violations: [{ cause: "boundary_violation" }],
    } as Report);
    expect(r.code).toBe("ESCALATE");
    expect(r.category).toBe("SYSTEM_FALLBACK");
    expect(r.message).toBe("Manual review recommended");
  });

  it("message rules: one sentence, no trailing punctuation, ≤80 chars", () => {
    const inputs: (Report | unknown)[] = [
      null,
      { decision: { level: "block" } },
      { decision: { level: "allow" }, structuralFastPath: true },
    ];
    for (const input of inputs) {
      const out = recommendAction(input);
      expect(out.message.length).toBeLessThanOrEqual(80);
      expect(out.message[0]).toMatch(/[A-Z]/);
      expect(out.message.endsWith(".")).toBe(false);
    }
  });
});
