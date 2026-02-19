import {
  explainReport,
  getConfidenceLabel,
  renderAftermath,
} from "../src/cli/foresee.js";

describe("foresee (Aftermath + Dina)", () => {
  describe("getConfidenceLabel", () => {
    it("maps coverageRatio >= 0.95 to High", () => {
      expect(getConfidenceLabel({ confidence: { coverageRatio: 0.95 } }).label).toBe("High");
      expect(getConfidenceLabel({ confidence: { coverageRatio: 1 } }).label).toBe("High");
    });
    it("maps coverageRatio >= 0.8 to Moderate", () => {
      expect(getConfidenceLabel({ confidence: { coverageRatio: 0.8 } }).label).toBe("Moderate");
      expect(getConfidenceLabel({ confidence: { coverageRatio: 0.9 } }).label).toBe("Moderate");
    });
    it("maps 0 < ratio < 0.8 to Low", () => {
      expect(getConfidenceLabel({ confidence: { coverageRatio: 0.5 } }).label).toBe("Low");
    });
    it("maps 0 or missing to Unknown", () => {
      expect(getConfidenceLabel({ confidence: { coverageRatio: 0 } }).label).toBe("Unknown");
      expect(getConfidenceLabel({}).label).toBe("Unknown");
    });
    it("formats ratio to 2 decimals", () => {
      expect(getConfidenceLabel({ confidence: { coverageRatio: 0.956 } }).ratioFormatted).toBe("0.96");
    });
  });

  describe("explainReport", () => {
    it("VERIFIED + allow: no impact, safe to merge", () => {
      const out = explainReport({
        status: "VERIFIED",
        decision: { level: "allow" },
      });
      expect(out).toContain("No architectural impact detected");
      expect(out).toContain("Safe to merge");
    });
    it("BLOCK + boundary_violation: internal import, recommend entrypoint", () => {
      const out = explainReport({
        status: "BLOCKED",
        decision: { level: "block" },
        classification: { primaryCause: "boundary_violation" },
      });
      expect(out).toContain("internal module");
      expect(out).toContain("package entrypoint");
    });
    it("BLOCK + deleted_public_api: API removed, recommend restore", () => {
      const out = explainReport({
        status: "BLOCKED",
        decision: { level: "block" },
        classification: { primaryCause: "deleted_public_api" },
      });
      expect(out).toContain("public API was removed");
      expect(out).toContain("restore export");
    });
    it("WARN / INDETERMINATE: safety could not be proven, recommend manual review", () => {
      const out = explainReport({
        status: "INDETERMINATE",
        decision: { level: "warn" },
      });
      expect(out).toContain("Safety could not be proven");
      expect(out).toContain("manual review");
    });
    it("includes downgradeReasons when present", () => {
      const out = explainReport({
        status: "INCOMPLETE",
        decision: { level: "warn" },
        downgradeReasons: ["reason1", "reason2"],
      });
      expect(out).toContain("Downgrade reasons");
      expect(out).toContain("reason1");
    });
    it("max 5 sentences", () => {
      const out = explainReport({
        status: "INDETERMINATE",
        decision: { level: "warn" },
        downgradeReasons: ["a", "b", "c", "d", "e", "f"],
      });
      const sentences = out.split(/\.\s+/).filter(Boolean);
      expect(sentences.length).toBeLessThanOrEqual(5);
    });
  });

  describe("renderAftermath", () => {
    it("output contains required sections", () => {
      const out = renderAftermath({
        status: "VERIFIED",
        decision: { level: "allow" },
        confidence: { coverageRatio: 1 },
        scope: { mode: "structural-fast-path" },
        run: { id: "abc123456789" },
        classification: { primaryCause: null },
      });
      expect(out).toContain("Aftermath — Predicted Impact");
      expect(out).toContain("Decision: ALLOW");
      expect(out).toContain("Confidence: High (1.00)");
      expect(out).toContain("Scope: structural-fast-path");
      expect(out).toContain("Dina:");
      expect(out).toContain("Run id: abc12345678");
      expect(out).toContain("Primary cause: none");
    });
    it("no emojis or timestamps", () => {
      const out = renderAftermath({
        status: "BLOCKED",
        decision: { level: "block" },
        classification: { primaryCause: "boundary_violation" },
        confidence: { coverageRatio: 0.5 },
        scope: { mode: "packages" },
        run: { id: "x" },
      });
      expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}T|\d+ms|duration/i);
    });
    it("run id truncated to 12 chars", () => {
      const out = renderAftermath({
        status: "VERIFIED",
        decision: { level: "allow" },
        run: { id: "12345678901234567890" },
        confidence: { coverageRatio: 0 },
        scope: {},
        classification: {},
      });
      expect(out).toMatch(/Run id: 123456789012/);
    });
    it("deterministic: same report → same output", () => {
      const report = {
        status: "BLOCKED" as const,
        decision: { level: "block" as const },
        classification: { primaryCause: "deleted_public_api" as const },
        confidence: { coverageRatio: 0.8 },
        scope: { mode: "packages" },
        run: { id: "deterministic-run-id" },
      };
      expect(renderAftermath(report)).toBe(renderAftermath(report));
    });
  });
});
