import {
  normaliseFindings,
  generateExplanationSection,
  type Finding,
} from "../scripts/generate-explanations.js";

describe("generate-explanations", () => {
  it("normaliseFindings: findings[] format", () => {
    const report = {
      findings: [
        { cause: "boundary_violation", importer: "a.ts", target: "b.ts" },
        { cause: "relative_escape" },
      ],
    };
    const out = normaliseFindings(report);
    expect(out).toHaveLength(2);
    expect(out[0].cause).toBe("boundary_violation");
    expect(out[0].importer).toBe("a.ts");
    expect(out[1].cause).toBe("relative_escape");
  });

  it("normaliseFindings: minimalCut string format", () => {
    const report = {
      minimalCut: ["boundary_violation:world-model:@market-os/foo/src/types"],
    };
    const out = normaliseFindings(report);
    expect(out).toHaveLength(1);
    expect(out[0].cause).toBe("boundary_violation");
    expect(out[0].importer).toBe("world-model");
    expect(out[0].target).toBe("@market-os/foo/src/types");
  });

  it("normaliseFindings: violations[] format", () => {
    const report = {
      violations: [
        { cause: "deleted_public_api", package: "core" },
        "type_import_private_target:pkg:target",
      ],
    };
    const out = normaliseFindings(report);
    expect(out).toHaveLength(2);
    expect(out[0].cause).toBe("deleted_public_api");
    expect(out[0].package).toBe("core");
    expect(out[1].cause).toBe("type_import_private_target");
    expect(out[1].importer).toBe("pkg");
  });

  it("normaliseFindings: fallback classification.primaryCause", () => {
    const report = { classification: { primaryCause: "relative_escape" } };
    const out = normaliseFindings(report);
    expect(out).toHaveLength(1);
    expect(out[0].cause).toBe("relative_escape");
  });

  it("normaliseFindings: invalid cause skipped", () => {
    const report = { findings: [{ cause: "unknown_cause" }], minimalCut: ["not:a:valid:cause"] };
    const out = normaliseFindings(report);
    expect(out).toHaveLength(0);
  });

  it("generateExplanationSection: empty when no findings", () => {
    expect(generateExplanationSection({})).toBe("");
    expect(generateExplanationSection(null)).toBe("");
  });

  it("generateExplanationSection: produces Why this matters with blockquote", () => {
    const report = { findings: [{ cause: "relative_escape" }] };
    const out = generateExplanationSection(report);
    expect(out).toContain("### Why this matters");
    expect(out).toContain("> ");
    expect(out).toContain("Relative paths bypass");
  });

  it("generateExplanationSection: groups by cause", () => {
    const report = {
      findings: [
        { cause: "boundary_violation", importer: "a", target: "b" },
        { cause: "boundary_violation", importer: "c", target: "d" },
        { cause: "deleted_public_api" },
      ],
    };
    const out = generateExplanationSection(report);
    expect(out).toContain("### Why this matters");
    expect((out.match(/### Why this matters/g) ?? []).length).toBe(2);
  });
});
