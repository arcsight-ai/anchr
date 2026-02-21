import { renderComment } from "../scripts/render-comment.js";
import type { RenderInput } from "../scripts/render-comment.js";
import type { ReviewerAction } from "../scripts/recommend-action.js";

function action(overrides: Partial<ReviewerAction>): ReviewerAction {
  return {
    code: "ESCALATE",
    category: "UNCERTAIN_ANALYSIS",
    message: "Manual review recommended",
    ...overrides,
  };
}

function baseInput(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    action: action({}),
    runId: "test-run-1",
    scopeMode: "full",
    coverageRatio: 0.95,
    ...overrides,
  };
}

describe("render-comment", () => {
  it("starts with versioned identity marker", () => {
    const out = renderComment(baseInput({ runId: "abc" }));
    expect(out).toContain("<!-- arcsight:v2:run:");
    expect(out.startsWith("<!-- arcsight:v2:run:")).toBe(true);
    expect(out).toContain("abc");
  });

  it("contains title and result line", () => {
    const out = renderComment(baseInput({ action: action({ code: "MERGE" }) }));
    expect(out).toContain("ANCHR");
    expect(out).toContain("Result: ");
    expect(out).toContain("🟢 Safe to merge");
  });

  it("maps MERGE/REVIEW/BLOCK/ESCALATE to correct result lines", () => {
    expect(renderComment(baseInput({ action: action({ code: "MERGE" }) }))).toContain("🟢 Safe to merge");
    expect(renderComment(baseInput({ action: action({ code: "REVIEW" }) }))).toContain("🟡 Needs review");
    expect(renderComment(baseInput({ action: action({ code: "BLOCK" }) }))).toContain("🔴 Must fix before merge");
    expect(renderComment(baseInput({ action: action({ code: "ESCALATE" }) }))).toContain("🟠 Unable to verify");
  });

  it("sandboxes explanation with blockquote prefix", () => {
    const out = renderComment(baseInput({ action: action({ code: "MERGE", category: "SAFE_TRIVIAL" }) }));
    expect(out).toContain("Explanation");
    expect(out).toContain("> ANCHR verified no architectural impact");
    expect(out).toContain("> The change does not alter package dependencies");
  });

  it("contains Technical Details with runId, scope, coverage", () => {
    const out = renderComment(baseInput({ runId: "run-42", scopeMode: "diff", coverageRatio: 0.5 }));
    expect(out).toContain("<details>");
    expect(out).toContain("<summary>Technical Details</summary>");
    expect(out).toContain("Run ID: run-42");
    expect(out).toContain("Scope: diff");
    expect(out).toContain("Coverage: 0.50");
    expect(out).toContain("</details>");
  });

  it("does not end with newline", () => {
    const out = renderComment(baseInput());
    expect(out.endsWith("\n")).toBe(false);
  });

  it("uses only \\n (no \\r)", () => {
    const out = renderComment(baseInput());
    expect(out).not.toContain("\r");
  });

  it("identical input produces identical output", () => {
    const input = baseInput({ runId: "idem" });
    expect(renderComment(input)).toBe(renderComment(input));
  });

  it("output is under 60000 characters", () => {
    const out = renderComment(baseInput());
    expect(out.length).toBeLessThan(60000);
  });

  it("stableFloat: non-finite coverage becomes 0.00", () => {
    const out = renderComment(baseInput({ coverageRatio: NaN }));
    expect(out).toContain("Coverage: 0.00");
  });

  it("sanitizes runId in marker and details", () => {
    const out = renderComment(baseInput({ runId: "x<y&z" }));
    expect(out).toContain("&lt;");
    expect(out).toContain("&amp;");
    expect(out).not.toContain("x<y&z");
  });

  it("explanation is blockquoted (sandboxed)", () => {
    const out = renderComment(baseInput({ action: action({ code: "MERGE", category: "SAFE_TRIVIAL" }) }));
    expect(out).toContain("> ");
    expect(out).toContain("> ANCHR verified no architectural impact");
  });
});
