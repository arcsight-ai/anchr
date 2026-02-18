import { explainViolation, formatFixBlock } from "../scripts/explain-violation.js";
import type { Violation } from "../scripts/explain-violation.js";

describe("explain-violation", () => {
  it("boundary_violation includes source, forbidden, replacement", () => {
    const v: Violation = {
      source: "pkg-a/src/foo.ts",
      target: "pkg-b",
      specifier: "@market-os/pkg-b/src/internal",
      symbols: ["helper"],
      cause: "boundary_violation",
      sourcePkg: "pkg-a",
      targetPkg: "pkg-b",
    };
    const out = explainViolation(v);
    expect(out).toContain("You imported a private module across a package boundary.");
    expect(out).toContain("pkg-a/src/foo.ts");
    expect(out).toContain("import { helper } from ");
    expect(out).toContain("@market-os/pkg-b");
    expect(out).toContain("Direct /src/ imports are not allowed.");
  });

  it("same violation produces identical output", () => {
    const v: Violation = {
      source: "x",
      target: "y",
      cause: "relative_escape",
      sourcePkg: "a",
      targetPkg: "b",
    };
    expect(explainViolation(v)).toBe(explainViolation(v));
  });

  it("stableSymbols sorts symbols", () => {
    const v: Violation = {
      source: "s",
      target: "t",
      symbols: ["z", "a"],
      cause: "boundary_violation",
      sourcePkg: "p",
      targetPkg: "q",
    };
    const out = explainViolation(v);
    expect(out).toContain("{ a, z }");
  });

  it("formatFixBlock includes header and explanation", () => {
    const v: Violation = {
      source: "s",
      target: "t",
      cause: "boundary_violation",
      sourcePkg: "p",
      targetPkg: "q",
    };
    const block = formatFixBlock(v);
    expect(block).toMatch(/^ARC SIGHT FIX/);
    expect(block).toContain("———––");
    expect(block).toContain(explainViolation(v));
  });

  it("fallback for unknown cause", () => {
    const v: Violation = {
      source: "s",
      target: "t",
      cause: "boundary_violation",
      sourcePkg: "p",
    };
    const out = explainViolation({ ...v, cause: "unknown" as Violation["cause"] });
    expect(out).toContain("This change violates a module boundary.");
    expect(out).toContain("package public API");
  });
});
