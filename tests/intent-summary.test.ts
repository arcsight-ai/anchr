import { summarizeIntent } from "../scripts/intent-summary.js";

describe("intent-summary", () => {
  it("empty violations returns no impact", () => {
    expect(summarizeIntent([])).toBe("No architectural impact detected.");
  });

  it("selectPrimary order: deleted_public_api first", () => {
    expect(
      summarizeIntent([{ cause: "deleted_public_api" }, { cause: "boundary_violation" }]),
    ).toBe("The system expects this contract to remain stable across components.");
  });

  it("boundary_violation sentence", () => {
    expect(summarizeIntent([{ cause: "boundary_violation" }])).toBe(
      "This assumes internal behavior can be depended on across component boundaries.",
    );
  });

  it("type_import_private_target sentence", () => {
    expect(summarizeIntent([{ cause: "type_import_private_target" }])).toBe(
      "Type knowledge is crossing boundaries meant to share only stable interfaces.",
    );
  });

  it("relative_escape sentence", () => {
    expect(summarizeIntent([{ cause: "relative_escape" }])).toBe(
      "The change reaches across components instead of extending through intended structure.",
    );
  });

  it("unknown cause fallback", () => {
    expect(summarizeIntent([{ cause: "unknown" }])).toBe(
      "Architectural relationships between components are being altered.",
    );
  });

  it("deterministic: same causes same sentence", () => {
    const v = [{ cause: "boundary_violation" }];
    expect(summarizeIntent(v)).toBe(summarizeIntent(v));
  });

  it("sentences under 16 words", () => {
    const sentences = [
      summarizeIntent([{ cause: "deleted_public_api" }]),
      summarizeIntent([{ cause: "boundary_violation" }]),
      summarizeIntent([{ cause: "type_import_private_target" }]),
      summarizeIntent([{ cause: "relative_escape" }]),
      summarizeIntent([{ cause: "other" }]),
    ];
    for (const s of sentences) {
      const words = s.split(/\s+/).length;
      expect(words).toBeLessThanOrEqual(16);
    }
  });
});
