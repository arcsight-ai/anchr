import {
  formatContainmentExplanation,
  EXPLANATION_VERSION,
} from "../src/formatters/containmentExplanation.js";

const FALLBACK = "No refactor suggestion.";

describe("formatContainmentExplanation (Prompt 5 v1.3.0)", () => {
  it("locks version at 1.3.0", () => {
    expect(EXPLANATION_VERSION).toBe("1.3.0");
  });

  it("returns fallback when decision is not block", () => {
    expect(
      formatContainmentExplanation(
        {
          decision: { level: "allow" },
          run: { id: "x" },
          confidence: { coverageRatio: 1 },
          classification: { primaryCause: "boundary_violation" },
          minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
        },
        { changedFiles: ["src/file.ts"] },
      ),
    ).toBe(FALLBACK);
  });

  it("returns fallback when no changedFiles (causality unprovable)", () => {
    expect(
      formatContainmentExplanation(
        {
          decision: { level: "block" },
          run: { id: "x" },
          confidence: { coverageRatio: 0.95 },
          classification: { primaryCause: "boundary_violation" },
          minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
        },
      ),
    ).toBe(FALLBACK);
    expect(
      formatContainmentExplanation(
        {
          decision: { level: "block" },
          run: { id: "x" },
          confidence: { coverageRatio: 0.95 },
          classification: { primaryCause: "boundary_violation" },
          minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
        },
        { changedFiles: [] },
      ),
    ).toBe(FALLBACK);
  });

  it("returns fallback when violating file not in changed files", () => {
    expect(
      formatContainmentExplanation(
        {
          decision: { level: "block" },
          run: { id: "x" },
          confidence: { coverageRatio: 0.95 },
          classification: { primaryCause: "boundary_violation" },
          minimalCut: ["pkg-a:src/violating.ts:boundary_violation:packages/pkg-b"],
        },
        { changedFiles: ["src/other.ts"] },
      ),
    ).toBe(FALLBACK);
  });

  it("returns INTERNAL_MODULE_ACCESS when block + boundary_violation + causality", () => {
    const out = formatContainmentExplanation(
      {
        decision: { level: "block" },
        run: { id: "run-1" },
        confidence: { coverageRatio: 0.95 },
        classification: { primaryCause: "boundary_violation" },
        minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
      },
      { changedFiles: ["src/file.ts"] },
    );
    expect(out).not.toBe(FALLBACK);
    expect(out).toContain("internal boundary");
    expect(out).toContain("dependency-stable");
    expect(out).toContain("public boundary");
  });

  it("returns PRIVATE_TYPE_USAGE when block + type_import_private_target + causality", () => {
    const out = formatContainmentExplanation(
      {
        decision: { level: "block" },
        run: { id: "run-1" },
        confidence: { coverageRatio: 0.95 },
        classification: { primaryCause: "type_import_private_target" },
        minimalCut: ["pkg-a:src/types.ts:type_import_private_target:packages/pkg-b"],
      },
      { changedFiles: ["src/types.ts"] },
    );
    expect(out).not.toBe(FALLBACK);
    expect(out).toContain("non-public type");
    expect(out).toContain("public interface boundary");
  });

  it("returns fallback when primaryCause is deleted_public_api", () => {
    expect(
      formatContainmentExplanation(
        {
          decision: { level: "block" },
          run: { id: "x" },
          confidence: { coverageRatio: 0.95 },
          classification: { primaryCause: "deleted_public_api" },
          minimalCut: ["pkg:path:deleted_public_api"],
        },
        { changedFiles: ["path"] },
      ),
    ).toBe(FALLBACK);
  });

  it("returns fallback when sourcePackage === targetPackage", () => {
    expect(
      formatContainmentExplanation(
        {
          decision: { level: "block" },
          run: { id: "x" },
          confidence: { coverageRatio: 0.95 },
          classification: { primaryCause: "boundary_violation" },
          minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-a"],
        },
        { changedFiles: ["src/file.ts"] },
      ),
    ).toBe(FALLBACK);
  });

  it("returns fallback when only test files changed", () => {
    expect(
      formatContainmentExplanation(
        {
          decision: { level: "block" },
          run: { id: "x" },
          confidence: { coverageRatio: 0.95 },
          classification: { primaryCause: "boundary_violation" },
          minimalCut: ["pkg-a:src/file.spec.ts:boundary_violation:packages/pkg-b"],
        },
        { changedFiles: ["src/file.spec.ts"] },
      ),
    ).toBe(FALLBACK);
  });

  it("returns fallback when coverageRatio < 0.9", () => {
    expect(
      formatContainmentExplanation(
        {
          decision: { level: "block" },
          run: { id: "x" },
          confidence: { coverageRatio: 0.8 },
          classification: { primaryCause: "boundary_violation" },
          minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
        },
        { changedFiles: ["src/file.ts"] },
      ),
    ).toBe(FALLBACK);
  });

  it("returns fallback when downgradeReasons present", () => {
    expect(
      formatContainmentExplanation(
        {
          decision: { level: "block" },
          run: { id: "x" },
          confidence: { coverageRatio: 0.95 },
          downgradeReasons: ["resolver_uncertain"],
          classification: { primaryCause: "boundary_violation" },
          minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
        },
        { changedFiles: ["src/file.ts"] },
      ),
    ).toBe(FALLBACK);
  });

  it("matches path with packages/ prefix for causality", () => {
    const out = formatContainmentExplanation(
      {
        decision: { level: "block" },
        run: { id: "x" },
        confidence: { coverageRatio: 0.95 },
        classification: { primaryCause: "boundary_violation" },
        minimalCut: ["packages/foo:packages/foo/src/a.ts:boundary_violation:packages/bar"],
      },
      { changedFiles: ["packages/foo/src/a.ts"] },
    );
    expect(out).not.toBe(FALLBACK);
    expect(out).toContain("internal boundary");
  });
});
