import {
  formatShareMessage,
  shareFromPath,
  shortRefFromMinimalCut,
} from "../src/cli/share.js";

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

describe("share (DINA future incident report)", () => {
  const requiredSections = [
    "Title —",
    "System Context —",
    "Prediction —",
    "Observable Symptom —",
    "Diagnostic Clue —",
    "Trigger —",
    "Impact —",
    "First Wrong Assumption —",
    "Moment of Realization —",
    "Confidence Tone —",
  ];

  it("verified / allow → incident format, no cross-boundary risk", () => {
    const msg = formatShareMessage({
      status: "VERIFIED",
      decision: { level: "allow" },
      scope: { mode: "structural-audit" },
    });
    requiredSections.forEach((label) => expect(msg).toContain(label));
    expect(msg).toContain("No cross-boundary risk");
    expect(msg).toContain("Diagnostic Clue — None observed.");
    expect(msg).toContain("Safe today fragile tomorrow");
    expect(msg.split("\n").length).toBe(10);
  });

  it("verified / allow + structural-fast-path → same incident structure", () => {
    const msg = formatShareMessage({
      status: "VERIFIED",
      decision: { level: "allow" },
      scope: { mode: "structural-fast-path" },
    });
    requiredSections.forEach((label) => expect(msg).toContain(label));
    expect(msg).toContain("No cross-boundary risk");
    expect(msg.split("\n").length).toBe(10);
  });

  it("block / boundary_violation → hidden dependency incident with concrete diagnostic clue", () => {
    const msg = formatShareMessage({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
      minimalCut: [],
    });
    requiredSections.forEach((label) => expect(msg).toContain(label));
    expect(msg).toContain("Hidden dependency breaks after reorg");
    expect(msg).toContain("hidden dependency");
    expect(msg).toContain("renames or reorganizes");
    expect(msg).toMatch(/Diagnostic Clue — .*flaky test/i);
    expect(msg).toContain("Likely");
  });

  it("block / deleted_public_api → consumer break with retry/5xx clue", () => {
    const msg = formatShareMessage({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "deleted_public_api" },
    });
    requiredSections.forEach((label) => expect(msg).toContain(label));
    expect(msg).toContain("Consumer break after API removal");
    expect(msg).toMatch(/Diagnostic Clue — .+(retry|5xx)/i);
    expect(msg).toContain("far from the deletion");
    expect(msg).toContain("Eventually");
  });

  it("block / relative_escape → stale/cache clue and mentionable risk", () => {
    const msg = formatShareMessage({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "relative_escape" },
    });
    requiredSections.forEach((label) => expect(msg).toContain(label));
    expect(msg).toContain("Stale behavior after code move");
    expect(msg).toMatch(/Diagnostic Clue — .+(stale read|cache miss)/i);
    expect(msg).toMatch(/split|reorganiz/);
    expect(msg).toContain("Mentionable risk");
  });

  it("block / type_import_private_target → build/CI or duplicate symbol clue", () => {
    const msg = formatShareMessage({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "type_import_private_target" },
    });
    requiredSections.forEach((label) => expect(msg).toContain(label));
    expect(msg).toContain("Runtime failure after build change");
    expect(msg).toMatch(/Diagnostic Clue — .+(Build passes locally|duplicate symbol|missing type)/i);
    expect(msg).toContain("Rare but catastrophic");
  });

  it("warn / indeterminate → intermittent timeout or flaky test clue", () => {
    const msg = formatShareMessage({
      status: "INCOMPLETE",
      decision: { level: "warn" },
    });
    requiredSections.forEach((label) => expect(msg).toContain(label));
    expect(msg).toContain("Unresolved dependency risk");
    expect(msg).toMatch(/Diagnostic Clue — .+(timeout|flaky)/i);
    expect(msg).toContain("Mentionable risk");
  });

  it("indeterminate → same incident template with diagnostic clue", () => {
    const msg = formatShareMessage({
      status: "INDETERMINATE",
      decision: { level: "warn" },
    });
    requiredSections.forEach((label) => expect(msg).toContain(label));
    expect(msg).toMatch(/Diagnostic Clue — .+/);
    expect(msg.split("\n").length).toBe(10);
  });

  it("shortRefFromMinimalCut strips packages/ and never invents", () => {
    expect(shortRefFromMinimalCut(undefined)).toBeNull();
    expect(shortRefFromMinimalCut([])).toBeNull();
    expect(
      shortRefFromMinimalCut(["packages/billing-domain:src/invoice.ts:boundary_violation"])
    ).toBe("billing-domain");
    expect(shortRefFromMinimalCut(["user-domain:src/profile.ts:boundary_violation"])).toBe(
      "user-domain"
    );
  });

  it("snapshot determinism: same input → identical output", () => {
    const report = {
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
      minimalCut: ["api-gateway:src/routes/billing.ts:boundary_violation"],
    };
    const a = formatShareMessage(report);
    const b = formatShareMessage(report);
    expect(a).toBe(b);
    expect(a).toContain("Diagnostic Clue —");
  });

  it("output under 150 words", () => {
    const msg = formatShareMessage({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "deleted_public_api" },
    });
    expect(wordCount(msg)).toBeLessThanOrEqual(150);
  });

  it("output has no package names or file paths", () => {
    const msg = formatShareMessage({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
      minimalCut: ["billing-domain:src/invoice.ts:boundary_violation"],
    });
    expect(msg).not.toMatch(/billing-domain|invoice\.ts|src\//);
  });

  it("output has no tool or analysis branding", () => {
    const msg = formatShareMessage({
      status: "BLOCKED",
      decision: { level: "block" },
      classification: { primaryCause: "boundary_violation" },
    });
    expect(msg).not.toMatch(/\b(ArcSight|Dina|analysis|AST|static analysis|code scanning)\b/i);
  });
});

describe("shareFromPath", () => {
  it("missing report → fallback message", () => {
    const result = shareFromPath("/nonexistent/path/report.json");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("No structural report available for this change.");
  });

  it("invalid JSON → fallback message", () => {
    const fs = require("fs");
    const path = require("path");
    const tmp = path.join(__dirname, "share-invalid-tmp.json");
    try {
      fs.writeFileSync(tmp, "not valid json {", "utf8");
      const result = shareFromPath(tmp);
      expect(result.ok).toBe(false);
      expect(result.message).toBe("The structural report is unreadable.");
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });
});
