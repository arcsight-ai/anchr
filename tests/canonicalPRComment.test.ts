import { renderPRComment } from "../src/comment/canonicalPRComment.js";
import type { RemediationPlan } from "../src/remediation/types.js";

function plan(overrides: Partial<RemediationPlan> = {}): RemediationPlan {
  return {
    summary: "This change is architecturally safe.",
    steps: ["No action required."],
    commitGuidance: ["Merge normally."],
    verification: ["ArcSight verified structural integrity."],
    education: "No boundary rules were violated.",
    metadata: {
      version: "1",
      action: "proceed",
      primaryCause: "unknown",
      messageId: "a1b2c3d4e5f67890",
    },
    ...overrides,
  };
}

describe("canonicalPRComment", () => {
  it("produces exact structure with status VERIFIED for proceed", () => {
    const r = renderPRComment(plan());
    expect(r.body).toContain("ANCHR Result: VERIFIED");
    expect(r.body).toContain("This change is architecturally safe.");
    expect(r.body).toContain("Required Actions:");
    expect(r.body).toContain("• No action required.");
    expect(r.body).toContain("Commit Guidance:");
    expect(r.body).toContain("Verification:");
    expect(r.body).toContain("Why this happened:");
    expect(r.shortBody).toMatch(/^ANCHR: VERIFIED — /);
    expect(r.shortBody).not.toContain("\n");
    expect(r.fingerprint).toMatch(/^[a-f0-9]{40}$/);
  });

  it("same plan produces identical body and fingerprint", () => {
    const p = plan({ metadata: { ...plan().metadata, messageId: "fixed" } });
    expect(renderPRComment(p).body).toBe(renderPRComment(p).body);
    expect(renderPRComment(p).fingerprint).toBe(renderPRComment(p).fingerprint);
  });

  it("education change does not change fingerprint", () => {
    const a = renderPRComment(plan({ education: "Original education." }));
    const b = renderPRComment(plan({ education: "Improved education text." }));
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.body).not.toBe(b.body);
  });

  it("empty arrays render as • None", () => {
    const r = renderPRComment(
      plan({ steps: [], commitGuidance: [], verification: [] }),
    );
    expect(r.body).toContain("Required Actions:\n• None");
    expect(r.body).toContain("Commit Guidance:\n• None");
    expect(r.body).toContain("Verification:\n• None");
  });

  it("status mapping for fix-architecture", () => {
    const r = renderPRComment(
      plan({
        summary: "Architectural boundary violation detected.",
        steps: ["Move shared logic to owning package."],
        commitGuidance: ["Do not merge until dependency direction is corrected."],
        verification: ["ArcSight must return VERIFIED."],
        education: "Dependencies must follow layer direction.",
        metadata: {
          version: "1",
          action: "fix-architecture",
          primaryCause: "boundary_violation",
          messageId: "f1f1f1f1f1f1f1f1",
        },
      }),
    );
    expect(r.body).toContain("ANCHR Result: ARCHITECTURE BLOCKED");
  });

  it("canonicalizes and dedupes list items", () => {
    const r = renderPRComment(
      plan({
        steps: ["  Same step  ", "Same step", "Other step"],
        commitGuidance: [],
        verification: [],
      }),
    );
    const requiredSection = r.body.slice(
      r.body.indexOf("Required Actions:"),
      r.body.indexOf("Commit Guidance:"),
    );
    expect(requiredSection).toContain("• Same step");
    expect(requiredSection).toContain("• Other step");
    const countSame = (requiredSection.match(/Same step/g) ?? []).length;
    expect(countSame).toBe(1);
  });
});
