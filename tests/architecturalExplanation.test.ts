import {
  formatArchitecturalExplanation,
} from "../src/comment/architecturalExplanation.js";
import {
  renderProductionComment,
  parseInitialHeadFromComment,
  parseConsequenceFromComment,
} from "../src/comment/production.js";
import { formatOneScreenSummary, ONE_SCREEN_MAX_LINES } from "../src/formatters/oneScreenSummary.js";

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
  it("normal case: one-screen summary first, then supporting evidence, no emojis", () => {
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
    expect(body).toContain("Decision: ALLOW");
    expect(body).toContain("Primary cause:");
    expect(body).toContain("Affected packages:");
    expect(body).toContain("Developer action:");
    expect(body).toContain("Supporting evidence:");
    expect(body).toContain("ArcSight Architectural Check");
    expect(body).toContain("No architectural boundary changes detected.");
    expect(body).toContain("Technical details");
    expect(body).not.toMatch(/🟢|🔴|🟡|🟠/);
  });

  it("one-screen summary is ≤12 lines and includes required fields", () => {
    const summary = formatOneScreenSummary({
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
      minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
    });
    const lines = summary.split("\n");
    expect(lines.length).toBeLessThanOrEqual(ONE_SCREEN_MAX_LINES);
    expect(summary).toContain("Decision: BLOCK");
    expect(summary).toContain("Primary cause:");
    expect(summary).toContain("Affected packages:");
    expect(summary).toContain("Developer action:");
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

  it("BLOCK with causality: includes containment explanation when changedFiles include violating file", () => {
    const body = renderProductionComment({
      report: {
        status: "BLOCKED",
        decision: { level: "block" },
        run: { id: "run-1" },
        confidence: { coverageRatio: 0.95 },
        classification: { primaryCause: "boundary_violation" },
        minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
      },
      decision: { action: "block", message: "", confidence: "high" },
      commitSha: "abc1234",
      runId: "run-1",
      isOutdated: false,
      isNonDeterministic: false,
      changedFiles: ["src/file.ts"],
    });
    expect(body).toContain("This change crosses a package's internal boundary.");
    expect(body).toContain("dependency-stable surfaces");
  });

  it("BLOCK without causality: omits containment explanation when changedFiles empty", () => {
    const body = renderProductionComment({
      report: {
        status: "BLOCKED",
        decision: { level: "block" },
        run: { id: "run-1" },
        confidence: { coverageRatio: 0.95 },
        classification: { primaryCause: "boundary_violation" },
        minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
      },
      decision: { action: "block", message: "", confidence: "high" },
      commitSha: "abc1234",
      runId: "run-1",
      isOutdated: false,
      isNonDeterministic: false,
      changedFiles: [],
    });
    expect(body).not.toContain("This change crosses a package's internal boundary.");
  });

  it("BLOCK + coverage 1 + causality: includes predictive consequence and persistence markers", () => {
    const body = renderProductionComment({
      report: {
        status: "BLOCKED",
        decision: { level: "block" },
        run: { id: "run-1" },
        confidence: { coverageRatio: 1 },
        classification: { primaryCause: "boundary_violation" },
        minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
      },
      decision: { action: "block", message: "", confidence: "high" },
      commitSha: "abc1234",
      runId: "run-1",
      isOutdated: false,
      isNonDeterministic: false,
      changedFiles: ["src/file.ts"],
      initialHeadShaForPR: "abc1234",
    });
    expect(body).toContain("internal components of the target package");
    expect(body).toContain("<!-- arcsight:consequence:");
    expect(body).toContain("<!-- arcsight:initial_head:abc1234 -->");
  });

  it("parseInitialHeadFromComment and parseConsequenceFromComment round-trip", () => {
    const body = renderProductionComment({
      report: {
        status: "BLOCKED",
        decision: { level: "block" },
        run: { id: "run-1" },
        confidence: { coverageRatio: 1 },
        classification: { primaryCause: "boundary_violation" },
        minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
      },
      decision: { action: "block", message: "", confidence: "high" },
      commitSha: "abc1234",
      runId: "run-1",
      isOutdated: false,
      isNonDeterministic: false,
      changedFiles: ["src/file.ts"],
      initialHeadShaForPR: "deadbeef",
    });
    expect(parseInitialHeadFromComment(body)).toBe("deadbeef");
    const consequence = parseConsequenceFromComment(body);
    expect(consequence).not.toBeNull();
    expect(consequence!.structuralKey).toBeTruthy();
    expect(consequence!.relationKey).toBeTruthy();
    expect(consequence!.text).toContain("internal components of the target package");
  });

  it("preserves previous consequence on update when predictive returns null (monotonic)", () => {
    const firstBody = renderProductionComment({
      report: {
        status: "BLOCKED",
        decision: { level: "block" },
        run: { id: "run-1" },
        confidence: { coverageRatio: 1 },
        classification: { primaryCause: "boundary_violation" },
        minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
      },
      decision: { action: "block", message: "", confidence: "high" },
      commitSha: "abc1234",
      runId: "run-1",
      isOutdated: false,
      isNonDeterministic: false,
      changedFiles: ["src/file.ts"],
      initialHeadShaForPR: "deadbeef",
    });
    const parsed = parseConsequenceFromComment(firstBody);
    expect(parsed?.text).toBeTruthy();
    const updatedBody = renderProductionComment({
      report: {
        status: "BLOCKED",
        decision: { level: "block" },
        run: { id: "run-2" },
        confidence: { coverageRatio: 1 },
        classification: { primaryCause: "boundary_violation" },
        minimalCut: ["pkg-a:src/file.ts:boundary_violation:packages/pkg-b"],
      },
      decision: { action: "block", message: "", confidence: "high" },
      commitSha: "abc1234",
      runId: "run-2",
      isOutdated: false,
      isNonDeterministic: false,
      changedFiles: ["src/file.ts"],
      initialHeadShaForPR: "deadbeef",
      previouslyEmittedStructuralKey: parsed!.structuralKey,
      previouslyEmittedRelationKey: parsed!.relationKey,
      previousConsequenceText: parsed!.text,
    });
    expect(updatedBody).toContain("internal components of the target package");
    expect(updatedBody).toContain("<!-- arcsight:consequence:");
  });
});
