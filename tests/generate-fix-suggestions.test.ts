import { generateFixSection, type Finding } from "../scripts/generate-fix-suggestions.js";

describe("generate-fix-suggestions", () => {
  it("returns empty string when no findings or no fix applies", () => {
    expect(generateFixSection([])).toBe("");
    expect(
      generateFixSection([{ cause: "boundary_violation" }]),
    ).toBe("");
  });

  it("deleted_public_api produces restore suggestion when package present", () => {
    const section = generateFixSection([
      { cause: "deleted_public_api", package: "core" },
    ]);
    expect(section).toContain("### How to fix");
    expect(section).toContain("Restore or replace removed export");
    expect(section).toContain("packages/core/src/index.ts");
  });

  it("relative_escape produces package import suggestion", () => {
    const section = generateFixSection([{ cause: "relative_escape" }]);
    expect(section).toContain("### How to fix");
    expect(section).toContain("Use package import instead of relative parent");
  });

  it("multiple findings produce numbered list", () => {
    const section = generateFixSection([
      { cause: "relative_escape" },
      { cause: "deleted_public_api", package: "utils" },
    ]);
    expect(section).toMatch(/1\. .+\n2\. .+/);
    expect(section).toContain("packages/utils");
  });

  it("boundary_violation without importer/target/package yields no fix line", () => {
    const section = generateFixSection([
      { cause: "boundary_violation" },
      { cause: "relative_escape" },
    ]);
    expect(section).toContain("### How to fix");
    expect(section).toContain("Use package import");
    expect(section.split("\n").filter((l) => l.includes("Replace with:")).length).toBe(0);
  });
});
