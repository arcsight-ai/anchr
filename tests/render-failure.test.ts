/**
 * Semantic stability tests for Predictive Failure Rendering.
 * Determinism, vocabulary ban, grammar pattern, chain length, classification stability,
 * unknown fallback, vividness enforcement.
 */

import {
  renderFailurePrediction,
  type FailurePrediction,
  type StructuralViolation,
} from "../src/prediction/render-failure.js";

function violation(overrides: Partial<StructuralViolation> = {}): StructuralViolation {
  return {
    package: "pkg-a",
    path: "packages/pkg-a/src/checkout.ts",
    cause: "boundary_violation",
    specifier: "packages/pkg-b/internal/hash",
    proof: {
      type: "import_path",
      source: "packages/pkg-a/src/checkout.ts",
      target: "packages/pkg-b/internal/hash.ts",
      rule: "boundary_violation",
    },
    ...overrides,
  };
}

describe("renderFailurePrediction", () => {
  describe("Determinism", () => {
    it("same input produces identical output", () => {
      const v = violation();
      const a = renderFailurePrediction(v);
      const b = renderFailurePrediction(v);
      expect(a).toEqual(b);
    });

    it("sorted evidence order is stable", () => {
      const v = violation({
        path: "z/file.ts",
        package: "a-pkg",
        specifier: "m/spec",
        proof: { type: "import_path", source: "z/file.ts", target: "m/spec.ts", rule: "boundary_violation" },
      });
      const out = renderFailurePrediction(v);
      const sorted = [...out.evidence].sort((x, y) => x.localeCompare(y, "en"));
      expect(out.evidence).toEqual(sorted);
    });
  });

  describe("Vocabulary ban", () => {
    it("output contains no architecture/layer/boundary/dependency/module/graph/violation/import", () => {
      const causes: Array<import("../src/structural/types.js").ViolationKind> = [
        "boundary_violation",
        "type_import_private_target",
        "relative_escape",
        "deleted_public_api",
        "circular_import",
      ];
      const banned = ["architecture", "layer", "boundary", "dependency", "module", "graph", "violation", "import"];
      for (const cause of causes) {
        const v = violation({ cause, specifier: "x/y", path: "a/b.ts" });
        const out = renderFailurePrediction(v);
        const text = [
          out.short_sentence,
          out.runtime_symptom,
          out.when_it_happens,
          ...out.causal_chain,
          ...out.evidence,
        ].join(" ");
        const lower = text.toLowerCase();
        for (const word of banned) {
          expect(lower).not.toContain(word);
        }
      }
    });
  });

  describe("Grammar pattern", () => {
    it("short_sentence is ≤140 characters (v12 max cognitive load)", () => {
      const v = violation();
      const out = renderFailurePrediction(v);
      expect(out.short_sentence.length).toBeLessThanOrEqual(140);
    });

    it("short_sentence has may-condition or If-this-will shape for known kind", () => {
      const v = violation({ cause: "boundary_violation" });
      const out = renderFailurePrediction(v);
      if (out.failure_kind !== "unknown") {
        const hasMay = /\bmay\b/.test(out.short_sentence);
        const hasIfThisWill = /If .+, this will .+\./.test(out.short_sentence);
        expect(hasMay || hasIfThisWill).toBe(true);
        expect(out.short_sentence.length).toBeGreaterThan(10);
      }
    });
  });

  describe("Chain length 2–4", () => {
    it("causal_chain has 2 to 4 steps for known failure kind", () => {
      const causes: Array<import("../src/structural/types.js").ViolationKind> = [
        "boundary_violation",
        "type_import_private_target",
        "relative_escape",
        "deleted_public_api",
        "circular_import",
      ];
      for (const cause of causes) {
        const v = violation({ cause, path: "a.ts", specifier: "b", proof: { type: "import_path", source: "a.ts", target: "b.ts", rule: cause } });
        const out = renderFailurePrediction(v);
        if (out.failure_kind !== "unknown") {
          expect(out.causal_chain.length).toBeGreaterThanOrEqual(2);
          expect(out.causal_chain.length).toBeLessThanOrEqual(4);
        }
      }
    });

    it("unknown fallback has empty causal_chain when evidence < 2", () => {
      const v = violation({ path: "", package: "", cause: "boundary_violation", specifier: undefined, proof: undefined });
      const out = renderFailurePrediction(v);
      expect(out.failure_kind).toBe("unknown");
      expect(out.causal_chain).toEqual([]);
    });
  });

  describe("Classification stability", () => {
    it("boundary_violation → timeout_cascade", () => {
      const v = violation({ cause: "boundary_violation" });
      const out = renderFailurePrediction(v);
      expect(out.failure_kind).toBe("timeout_cascade");
    });

    it("type_import_private_target → silent_corruption", () => {
      const v = violation({ cause: "type_import_private_target", path: "a.ts", specifier: "b" });
      const out = renderFailurePrediction(v);
      expect(out.failure_kind).toBe("silent_corruption");
    });

    it("relative_escape → partial_initialization", () => {
      const v = violation({ cause: "relative_escape", path: "a.ts", specifier: "../b" });
      const out = renderFailurePrediction(v);
      expect(out.failure_kind).toBe("partial_initialization");
    });

    it("deleted_public_api → version_mismatch_crash", () => {
      const v = violation({ cause: "deleted_public_api", path: "a.ts", specifier: "pkg/api" });
      const out = renderFailurePrediction(v);
      expect(out.failure_kind).toBe("version_mismatch_crash");
    });

    it("circular_import → circular_responsibility", () => {
      const v = violation({ cause: "circular_import", path: "a.ts", specifier: "b" });
      const out = renderFailurePrediction(v);
      expect(out.failure_kind).toBe("circular_responsibility");
    });
  });

  describe("Unknown fallback", () => {
    it("returns unknown + low confidence when evidence < 2", () => {
      const v = violation({ path: "", package: "", specifier: undefined, proof: undefined });
      const out = renderFailurePrediction(v);
      expect(out.failure_kind).toBe("unknown");
      expect(out.confidence).toBe("low");
      expect(out.short_sentence).toBe(
        "This change may introduce a runtime bug, but the failure mode is unclear.",
      );
    });

    it("unknown has empty causal_chain", () => {
      const v = violation({ path: "", package: "", specifier: undefined, proof: undefined });
      const out = renderFailurePrediction(v);
      expect(out.failure_kind).toBe("unknown");
      expect(out.causal_chain).toEqual([]);
    });
  });

  describe("Vividness enforcement", () => {
    it("output contains no vague words: issue, problem, unexpected, inconsistent, may fail, edge case", () => {
      const vague = ["issue", "problem", "unexpected", "inconsistent", "may fail", "might behave incorrectly", "edge case"];
      const v = violation();
      const out = renderFailurePrediction(v);
      const text = [out.short_sentence, ...out.causal_chain].join(" ").toLowerCase();
      for (const word of vague) {
        expect(text).not.toContain(word);
      }
    });

    it("vivid wording yields high or medium confidence when evidence ≥ 2 and known kind", () => {
      const v = violation({
        path: "a.ts",
        package: "pkg",
        specifier: "target",
        proof: { type: "import_path", source: "a.ts", target: "target.ts", rule: "boundary_violation" },
      });
      const out = renderFailurePrediction(v);
      expect(out.failure_kind).not.toBe("unknown");
      expect(["high", "medium"]).toContain(out.confidence);
    });
  });

  describe("Evidence requirement", () => {
    it("returns 2–4 evidence items for known failure with enough violation data", () => {
      const v = violation({
        path: "pkg/src/a.ts",
        package: "pkg",
        specifier: "other/internal",
        proof: { type: "import_path", source: "pkg/src/a.ts", target: "other/internal.ts", rule: "boundary_violation" },
      });
      const out = renderFailurePrediction(v);
      expect(out.evidence.length).toBeGreaterThanOrEqual(2);
      expect(out.evidence.length).toBeLessThanOrEqual(4);
    });
  });
});
