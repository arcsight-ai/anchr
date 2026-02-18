import {
  planRepairs,
  generateFixSuggestions,
  selectPrimarySuggestion,
} from "../src/repair/planner.js";
import type { PlannerInput, FixSuggestion } from "../src/repair/plannerTypes.js";

describe("planner", () => {
  it("returns fallback suggestion when violations are empty", () => {
    const input: PlannerInput = {
      decisionAction: "block",
      decisionReason: "test",
      violations: [],
    };
    const out = planRepairs(input);
    expect(out.primarySuggestion).toBe("architectural_refactor");
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0].strategy).toBe("architectural_refactor");
    expect(out.suggestions[0].confidenceReason).toBe(
      "No minimal safe repair exists within current boundaries",
    );
  });

  it("returns public_entry_import for boundary_violation", () => {
    const input: PlannerInput = {
      decisionAction: "block",
      decisionReason: "boundary",
      violations: [
        { kind: "boundary_violation", fromPackage: "pkg-a", targetPath: "src/foo.ts" },
      ],
    };
    const out = planRepairs(input);
    expect(out.suggestions.some((s) => s.strategy === "public_entry_import")).toBe(true);
    const suggestion = out.suggestions.find((s) => s.strategy === "public_entry_import");
    expect(suggestion?.confidenceReason).toBe(
      "Preserves package ownership and avoids internal coupling",
    );
    expect(out.primarySuggestion).toBe("public_entry_import");
  });

  it("selectPrimarySuggestion picks lowest priority then smallest affects", () => {
    const suggestions: FixSuggestion[] = [
      { title: "A", strategy: "x", priority: 2, affects: ["a", "b"], explanation: "", confidenceReason: "", steps: [], safeExample: "", unsafeExample: "" },
      { title: "B", strategy: "y", priority: 1, affects: ["a"], explanation: "", confidenceReason: "", steps: [], safeExample: "", unsafeExample: "" },
    ];
    expect(selectPrimarySuggestion(suggestions)).toBe("y");
  });

  it("generateFixSuggestions sorts suggestions by title", () => {
    const input: PlannerInput = {
      decisionAction: "review",
      decisionReason: "",
      violations: [
        { kind: "relative_escape", fromPackage: "pkg", targetPath: "x" },
        { kind: "boundary_violation", fromPackage: "pkg", targetPath: "y" },
      ],
    };
    const suggestions = generateFixSuggestions(input);
    const titles = suggestions.map((s) => s.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "en")));
  });
});
