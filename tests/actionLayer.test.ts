import { decide, normalizeReport } from "../src/decision/actionLayer.js";

describe("actionLayer", () => {
  it("normalizes missing input without throwing", () => {
    const norm = normalizeReport(null);
    expect(norm.status).toBe("INCOMPLETE");
    expect(norm.decisionLevel).toBe("block");
    expect(norm.coverageRatio).toBe(0);
    expect(norm.causes).toEqual([]);
  });

  it("snaps coverage >= 0.999 to 1", () => {
    const norm = normalizeReport({
      status: "VERIFIED",
      decision: { level: "allow" },
      confidence: { coverageRatio: 0.9999 },
    });
    expect(norm.coverageRatio).toBe(1);
  });

  it("proceed for VERIFIED + allow + coverage=1 + no causes", () => {
    const d = decide({
      status: "VERIFIED",
      decision: { level: "allow" },
      confidence: { coverageRatio: 1 },
      classification: { primaryCause: null },
    });
    expect(d.action).toBe("proceed");
    expect(d.reasonCode).toBe("safe_structural");
  });

  it("rerun-analysis for INCOMPLETE", () => {
    const d = decide({ status: "INCOMPLETE" });
    expect(d.action).toBe("rerun-analysis");
    expect(d.reasonCode).toBe("analysis_incomplete");
  });

  it("fix-architecture for boundary_violation or relative_escape", () => {
    expect(decide({
      status: "UNSAFE",
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
      confidence: { coverageRatio: 0 },
    }).action).toBe("fix-architecture");
    expect(decide({
      status: "UNSAFE",
      decision: { level: "block" },
      classification: { primaryCause: "relative_escape" },
      confidence: { coverageRatio: 0 },
    }).action).toBe("fix-architecture");
  });

  it("require-migration for deleted_public_api", () => {
    const d = decide({
      status: "UNSAFE",
      decision: { level: "block" },
      classification: { primaryCause: "deleted_public_api" },
      confidence: { coverageRatio: 0 },
    });
    expect(d.action).toBe("require-migration");
    expect(d.reasonCode).toBe("public_api_break");
  });

  it("require-adapter for type_import_private_target", () => {
    const d = decide({
      status: "UNSAFE",
      decision: { level: "block" },
      classification: { primaryCause: "type_import_private_target" },
      confidence: { coverageRatio: 0 },
    });
    expect(d.action).toBe("require-adapter");
  });

  it("stronger action wins when multiple causes", () => {
    const d = decide({
      status: "UNSAFE",
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
      violations: [{ cause: "deleted_public_api" }],
      confidence: { coverageRatio: 0 },
    });
    expect(d.action).toBe("fix-architecture");
  });

  it("warn/block never produce proceed", () => {
    const d = decide({
      status: "VERIFIED",
      decision: { level: "warn" },
      confidence: { coverageRatio: 1 },
      classification: { primaryCause: null },
    });
    expect(d.action).not.toBe("proceed");
    expect(d.action).toBe("require-review");
  });

  it("coverage < 1 raises minimum to require-review", () => {
    const d = decide({
      status: "VERIFIED",
      decision: { level: "allow" },
      confidence: { coverageRatio: 0.8 },
      classification: { primaryCause: null },
    });
    expect(d.action).toBe("require-review");
  });

  it("same inputs produce same signature", () => {
    const report = {
      status: "VERIFIED",
      decision: { level: "allow" },
      confidence: { coverageRatio: 1 },
      classification: { primaryCause: null },
    };
    expect(decide(report).signature).toBe(decide(report).signature);
    expect(decide({ ...report, scope: { mode: "structural-fast-path" } }).signature).toBe(
      decide({ ...report, scope: { mode: "structural-fast-path" } }).signature,
    );
  });

  it("explanation is at most 160 chars", () => {
    const d = decide({ status: "INCOMPLETE" });
    expect(d.explanation.length).toBeLessThanOrEqual(160);
  });
});
