import {
  generateGuidance,
  hashGuidance,
  GUIDANCE_SCHEMA_VERSION,
  type StructuralViolation,
  type GuidanceOutput,
} from "../scripts/guidance/generate-guidance.js";

describe("generateGuidance (Prompt 1 v2.0)", () => {
  it("exports schema version 1", () => {
    expect(GUIDANCE_SCHEMA_VERSION).toBe(1);
  });

  it("returns empty array for no violations", () => {
    expect(generateGuidance([])).toEqual([]);
    expect(hashGuidance([])).toBeTruthy();
  });

  it("one violation produces one guidance with id, law, cause, title, explanation, why, safeRepairs, preserves", () => {
    const violations: StructuralViolation[] = [
      { cause: "boundary_violation", fromPackage: "foo", toPackage: "bar" },
    ];
    const out = generateGuidance(violations);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("G001");
    expect(out[0]!.law).toBe("dependency_boundary");
    expect(out[0]!.cause).toBe("boundary_violation");
    expect(out[0]!.title).toBe("Internal module dependency detected");
    expect(out[0]!.explanation).toContain("foo");
    expect(out[0]!.explanation).toContain("bar");
    expect(out[0]!.why).toBeTruthy();
    expect(out[0]!.safeRepairs.length).toBeGreaterThan(0);
    expect(out[0]!.preserves.length).toBeGreaterThan(0);
    expect(out[0]!.fromPackage).toBe("foo");
    expect(out[0]!.toPackage).toBe("bar");
  });

  it("collapses same collapseKey to one guidance", () => {
    const violations: StructuralViolation[] = [
      { cause: "boundary_violation", fromPackage: "a", toPackage: "b" },
      { cause: "boundary_violation", fromPackage: "a", toPackage: "b" },
    ];
    const out = generateGuidance(violations);
    expect(out).toHaveLength(1);
  });

  it("different collapseKeys produce multiple guidance, sorted by id", () => {
    const violations: StructuralViolation[] = [
      { cause: "boundary_violation", fromPackage: "a", toPackage: "b" },
      { cause: "deleted_public_api", fromPackage: "c" },
    ];
    const out = generateGuidance(violations);
    expect(out).toHaveLength(2);
    expect(out[0]!.id).toBe("G001");
    expect(out[1]!.id).toBe("G002");
  });

  it("unknown cause gets GX- + stable hash and unknown_law", () => {
    const violations: StructuralViolation[] = [
      { cause: "custom_cause", fromPackage: "x", toPackage: "y" },
    ];
    const out = generateGuidance(violations);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toMatch(/^GX-[a-f0-9]+$/);
    expect(out[0]!.law).toBe("unknown_law");
  });

  it("same violations produce byte-identical output (determinism)", () => {
    const violations: StructuralViolation[] = [
      { cause: "boundary_violation", fromPackage: "pkg-a", toPackage: "pkg-b" },
    ];
    const a = generateGuidance(violations);
    const b = generateGuidance(violations);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("hash depends only on meaning (schema, id, law, cause, from, to) — NOT on wording", () => {
    const violations: StructuralViolation[] = [
      { cause: "boundary_violation", fromPackage: "foo", toPackage: "bar" },
    ];
    const guidance = generateGuidance(violations);
    const hash1 = hashGuidance(guidance);

    const alteredWording: GuidanceOutput[] = guidance.map((g) => ({
      ...g,
      title: "Different title",
      explanation: "Different explanation",
      why: "Different why",
      safeRepairs: ["Other repair"],
      preserves: ["Other preserve"],
    }));
    const hash2 = hashGuidance(alteredWording);
    expect(hash1).toBe(hash2);
  });

  it("hash changes when semantic meaning changes (different cause or packages)", () => {
    const g1 = generateGuidance([
      { cause: "boundary_violation", fromPackage: "a", toPackage: "b" },
    ]);
    const g2 = generateGuidance([
      { cause: "deleted_public_api", fromPackage: "a" },
    ]);
    expect(hashGuidance(g1)).not.toBe(hashGuidance(g2));
  });
});
