import {
  formatPredictiveConsequence,
  anchorKeyForPR,
  PREDICTIVE_CONSEQUENCE_VERSION,
} from "../src/formatters/predictiveConsequence.js";

const blockReportBase = {
  decision: { level: "block" as const },
  run: { id: "run-1" },
  classification: { primaryCause: "boundary_violation" as const },
  minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
};

describe("formatPredictiveConsequence (Prompt 6 v2.1.0)", () => {
  it("locks version at 2.1.0", () => {
    expect(PREDICTIVE_CONSEQUENCE_VERSION).toBe("2.1.0");
  });

  it("returns null when decision is not block", () => {
    expect(
      formatPredictiveConsequence(
        { ...blockReportBase, decision: { level: "allow" }, confidence: { coverageRatio: 1 } },
        { changedFiles: ["src/file.ts"] },
      ),
    ).toBeNull();
  });

  it("returns null when coverageRatio is not exactly 1", () => {
    expect(
      formatPredictiveConsequence(
        { ...blockReportBase, confidence: { coverageRatio: 0.95 } },
        { changedFiles: ["src/file.ts"] },
      ),
    ).toBeNull();
  });

  it("returns null when causal explanation failed (no changedFiles)", () => {
    expect(
      formatPredictiveConsequence({
        ...blockReportBase,
        confidence: { coverageRatio: 1 },
      }),
    ).toBeNull();
  });

  it("returns null when violating file not in changedFiles", () => {
    expect(
      formatPredictiveConsequence(
        { ...blockReportBase, confidence: { coverageRatio: 1 } },
        { changedFiles: ["src/other.ts"] },
      ),
    ).toBeNull();
  });

  it("emits HIDDEN_COUPLING_BREAK when block + boundary_violation + coverage 1 + causality", () => {
    const result = formatPredictiveConsequence(
      { ...blockReportBase, confidence: { coverageRatio: 1 } },
      { changedFiles: ["src/file.ts"] },
    );
    expect(result).not.toBeNull();
    expect(result!.text).toContain("internal components of the target package");
    expect(result!.structuralKey).toBeTruthy();
    expect(result!.relationKey).toBeTruthy();
  });

  it("emits TYPE_PROPAGATION_BREAK for type_import_private_target when causality holds", () => {
    const result = formatPredictiveConsequence(
      {
        ...blockReportBase,
        classification: { primaryCause: "type_import_private_target" },
        minimalCut: ["pkg-a:src/types.ts:type_import_private_target:packages/pkg-b"],
        confidence: { coverageRatio: 1 },
      },
      { changedFiles: ["src/types.ts"] },
    );
    expect(result).not.toBeNull();
    expect(result!.text).toContain("private type change in the target package");
  });

  it("returns null for deleted_public_api because causal explanation does not succeed (containment fallback)", () => {
    const result = formatPredictiveConsequence(
      {
        ...blockReportBase,
        classification: { primaryCause: "deleted_public_api" },
        minimalCut: ["pkg-a:src/file.ts:deleted_public_api:packages/pkg-b"],
        confidence: { coverageRatio: 1 },
      },
      { changedFiles: ["src/file.ts"] },
    );
    expect(result).toBeNull();
  });

  it("returns null when previouslyEmittedStructuralKey equals current", () => {
    const ctx = { changedFiles: ["src/file.ts"] };
    const first = formatPredictiveConsequence(
      { ...blockReportBase, confidence: { coverageRatio: 1 } },
      ctx,
    );
    expect(first).not.toBeNull();
    const again = formatPredictiveConsequence(
      { ...blockReportBase, confidence: { coverageRatio: 1 } },
      { ...ctx, previouslyEmittedStructuralKey: first!.structuralKey, previouslyEmittedRelationKey: first!.relationKey },
    );
    expect(again).toBeNull();
  });

  it("returns null when previouslyEmittedRelationKey differs (monotonic: keep original)", () => {
    const first = formatPredictiveConsequence(
      { ...blockReportBase, confidence: { coverageRatio: 1 } },
      { changedFiles: ["src/file.ts"] },
    );
    expect(first).not.toBeNull();
    const differentRelation = formatPredictiveConsequence(
      { ...blockReportBase, confidence: { coverageRatio: 1 }, minimalCut: ["pkg-c:src/other.ts:boundary_violation:packages/pkg-d"] },
      { changedFiles: ["src/other.ts"], previouslyEmittedStructuralKey: "old", previouslyEmittedRelationKey: "other-key" },
    );
    expect(differentRelation).toBeNull();
  });

  it("returns null when downgradeReasons present", () => {
    expect(
      formatPredictiveConsequence(
        { ...blockReportBase, confidence: { coverageRatio: 1 }, downgradeReasons: ["resolver_uncertain"] },
        { changedFiles: ["src/file.ts"] },
      ),
    ).toBeNull();
  });
});

describe("anchorKeyForPR", () => {
  it("is deterministic for same PR and initial head", () => {
    expect(anchorKeyForPR(1, "abc123")).toBe(anchorKeyForPR(1, "abc123"));
    expect(anchorKeyForPR(2, "abc123")).not.toBe(anchorKeyForPR(1, "abc123"));
    expect(anchorKeyForPR(1, "def456")).not.toBe(anchorKeyForPR(1, "abc123"));
  });
});
