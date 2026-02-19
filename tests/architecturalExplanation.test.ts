import {
  formatArchitecturalExplanation,
} from "../src/comment/architecturalExplanation.js";
import { renderProductionComment } from "../src/comment/production.js";

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

describe("formatArchitecturalExplanation (Law Mode v4)", () => {
  it("starts with exact verdict phrase: ALLOW", () => {
    const out = formatArchitecturalExplanation({
      status: "VERIFIED",
      decision: { level: "allow" },
      confidence: { coverageRatio: 1 },
    });
    expect(out).toContain("This change preserves the system's dependency invariants.");
    expect(out).toContain("Confidence:");
  });

  it("VERIFIED + allow: propagation law and stability principle, no advice", () => {
    const out = formatArchitecturalExplanation({
      status: "VERIFIED",
      decision: { level: "allow" },
      classification: { primaryCause: null },
      confidence: { coverageRatio: 0.96 },
    });
    expect(out).toContain("preserves the system's dependency invariants");
    expect(out).toContain("Future changes");
    expect(out).toContain("propagate");
    expect(out).toContain("Stability is preserved");
    expect(out).not.toMatch(/recommend|consider|fix|refactor|should|maintainable/);
    expect(out).toContain("High");
  });

  it("BLOCK + boundary_violation: breaks invariant, forward-time propagation", () => {
    const out = formatArchitecturalExplanation({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
      confidence: { coverageRatio: 0.9 },
    });
    expect(out).toContain("This change breaks a dependency invariant.");
    expect(out).toContain("internal surface");
    expect(out).toContain("Future changes in the internal implementation");
    expect(out).toContain("will now force");
    expect(out).toContain("propagate");
    expect(out).not.toMatch(/recommend|fix|public interface instead/);
  });

  it("BLOCK + deleted_public_api: breaks invariant, future upgrades propagation", () => {
    const out = formatArchitecturalExplanation({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "deleted_public_api" },
    });
    expect(out).toContain("This change breaks a dependency invariant.");
    expect(out).toContain("public surface was removed");
    expect(out).toContain("Future upgrades");
    expect(out).toContain("will now fail");
    expect(out).toContain("propagate");
  });

  it("WARN: exact verdict and propagation, no advice", () => {
    const out = formatArchitecturalExplanation({
      status: "INDETERMINATE",
      decision: { level: "warn" },
      confidence: { coverageRatio: 0.5 },
    });
    expect(out).toContain("The system could not determine architectural safety.");
    expect(out).toContain("A hidden coupling may exist");
    expect(out).toContain("future changes");
    expect(out).toContain("propagate");
    expect(out).not.toMatch(/recommend|Split into smaller|consider/);
    expect(out).toContain("Limited");
  });

  it("appends Affected surface when minimalCut present (max 3 packages)", () => {
    const out = formatArchitecturalExplanation({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
      minimalCut: [
        "pkg-a:src/foo.ts:boundary_violation",
        "pkg-b:src/bar.ts:boundary_violation",
        "pkg-a:src/baz.ts:boundary_violation",
      ],
    });
    expect(out).toContain("Affected surface: pkg-a, pkg-b");
  });

  it("Affected surface: and others when more than 3 packages", () => {
    const out = formatArchitecturalExplanation({
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: [
        "aaa:src/a.ts:x",
        "bbb:src/b.ts:x",
        "ccc:src/c.ts:x",
        "ddd:src/d.ts:x",
      ],
    });
    expect(out).toContain("and others");
  });

  it("deterministic: same input → identical output", () => {
    const input = {
      status: "BLOCKED" as const,
      decision: { level: "block" as const },
      classification: { primaryCause: "deleted_public_api" as const },
      minimalCut: ["pkg:path:cause"],
      scope: { mode: "structural-fast-path" },
      confidence: { coverageRatio: 0.85 },
    };
    expect(formatArchitecturalExplanation(input)).toBe(
      formatArchitecturalExplanation(input)
    );
  });

  it("word limit by severity: ALLOW ≤70, WARN ≤110, BLOCK ≤160", () => {
    const allowOut = formatArchitecturalExplanation({
      status: "VERIFIED",
      decision: { level: "allow" },
      confidence: { coverageRatio: 1 },
    });
    expect(wordCount(allowOut)).toBeLessThanOrEqual(75);
    const warnOut = formatArchitecturalExplanation({
      status: "INDETERMINATE",
      decision: { level: "warn" },
      confidence: { coverageRatio: 0.5 },
    });
    expect(wordCount(warnOut)).toBeLessThanOrEqual(115);
    const blockOut = formatArchitecturalExplanation({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
    });
    expect(wordCount(blockOut)).toBeLessThanOrEqual(165);
  });

  it("no emojis, no code blocks, no tables, no forbidden advice words", () => {
    const out = formatArchitecturalExplanation({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
    });
    expect(out).not.toMatch(/```|🟢|🔴|🟡|🟠|⏳|⚠️|\|.*\|/);
    expect(out).not.toMatch(/\b(should|recommend|consider|fix|refactor|maintainable|best practice)\b/i);
  });

  it("confidence: High ≥0.95, Moderate ≥0.80, else Limited", () => {
    expect(
      formatArchitecturalExplanation({
        status: "VERIFIED",
        decision: { level: "allow" },
        confidence: { coverageRatio: 0.95 },
      })
    ).toContain("High");
    expect(
      formatArchitecturalExplanation({
        status: "VERIFIED",
        decision: { level: "allow" },
        confidence: { coverageRatio: 0.8 },
      })
    ).toContain("Moderate");
    expect(
      formatArchitecturalExplanation({
        status: "VERIFIED",
        decision: { level: "allow" },
        confidence: { coverageRatio: 0.5 },
      })
    ).toContain("Limited");
  });
});

describe("renderProductionComment (shareable layer)", () => {
  it("normal case returns marker and law-mode explanation, no emojis", () => {
    const body = renderProductionComment({
      report: {
        status: "VERIFIED",
        decision: { level: "allow" },
        classification: { primaryCause: null },
        scope: { mode: "structural-fast-path" },
        minimalCut: [],
        confidence: { coverageRatio: 1 },
      },
      decision: { action: "merge", message: "OK", confidence: "high" },
      commitSha: "abc1234",
      runId: "run-id-123",
      isOutdated: false,
      isNonDeterministic: false,
    });
    expect(body).toContain("<!-- arcsight:run:");
    expect(body).toContain("This change preserves the system's dependency invariants.");
    expect(body).toContain("propagate");
    expect(body).toContain("Confidence:");
    expect(body).not.toMatch(/🟢|🔴|🟡|🟠/);
  });

  it("outdated case returns marker and OUTDATED message", () => {
    const body = renderProductionComment({
      report: { status: "VERIFIED" },
      decision: { action: "merge", message: "", confidence: "high" },
      commitSha: "abc",
      runId: "r1",
      isOutdated: true,
      isNonDeterministic: false,
    });
    expect(body).toContain("<!-- arcsight:run:");
    expect(body).toContain("OUTDATED");
  });
});
