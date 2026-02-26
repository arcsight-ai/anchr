/**
 * Prompt B — Impact section in gate comment.
 * Tests: rendering conditions, bullet count, order, unknown type ignored, determinism.
 */

import { buildGateComment, type GateReport, type GateMode, type GateCommentMeta } from "../src/comment/gateComment.js";

const meta: GateCommentMeta = {
  repo: "owner/repo",
  prNumber: 1,
  headSha: "abc",
  baseSha: "def",
  runId: "run-1",
  decisionLevel: "block",
};

function visibleBody(comment: string): string {
  const idx = comment.indexOf("\n\n");
  if (idx < 0) return comment;
  return comment.slice(idx + 2).replace(/\n<!--[\s\S]*$/, "").trim();
}

describe("Gate comment Impact section (Prompt B)", () => {
  it("single cycle violation → one impact bullet", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["pkg:path:circular_import:spec"],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).toContain("Impact:");
    expect(body).toContain("• Hidden coupling introduced");
    expect(body).not.toContain("Repository boundary erosion");
    expect(body).not.toContain("Public contract instability");
    expect(body).not.toContain("Layer boundary bypass");
  });

  it("multiple cycles → still one bullet", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: [
        "pkg1:path1:circular_import:s1",
        "pkg2:path2:circular_import:s2",
      ],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    const impactStart = body.indexOf("Impact:");
    const nextSection = body.indexOf("New cycle introduced", impactStart);
    const impactBlock = nextSection > 0 ? body.slice(impactStart, nextSection) : body.slice(impactStart);
    const bullets = (impactBlock.match(/• Hidden coupling introduced/g) || []).length;
    expect(bullets).toBe(1);
  });

  it("all types present → four bullets in correct order", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: [
        "a:x:relative_escape:r",
        "b:y:deleted_public_api:d",
        "c:z:boundary_violation:p",
        "d:w:circular_import:s",
      ],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).toContain("Impact:");
    const impactIdx = body.indexOf("Impact:");
    const afterImpact = body.slice(impactIdx);
    const order = [
      "Hidden coupling introduced",
      "Repository boundary erosion",
      "Public contract instability",
      "Layer boundary bypass",
    ];
    let pos = 0;
    for (const phrase of order) {
      const i = afterImpact.indexOf(phrase, pos);
      expect(i).toBeGreaterThanOrEqual(0);
      pos = i + phrase.length;
    }
  });

  it("VERIFIED status → no Impact section", () => {
    const report: GateReport = {
      status: "VERIFIED",
      decision: { level: "allow" },
      minimalCut: ["pkg:path:boundary_violation:spec"],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).not.toContain("Impact:");
    expect(body).toContain("No architectural drift detected");
  });

  it("INCOMPLETE status → no Impact section", () => {
    const report: GateReport = {
      status: "INCOMPLETE",
      decision: { level: "warn" },
      minimalCut: ["pkg:path:boundary_violation:spec"],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).not.toContain("Impact:");
  });

  it("unknown type → ignored", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["pkg:path:unknown_cause:spec"],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).not.toContain("Impact:");
  });

  it("identical report input → identical rendered comment", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["a:x:circular_import:s", "b:y:boundary_violation:p"],
    };
    const one = buildGateComment(report, "STRICT" as GateMode, meta);
    const two = buildGateComment(report, "STRICT" as GateMode, meta);
    expect(one).toBe(two);
  });

  it("empty minimalCut → no Impact section", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: [],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).not.toContain("Impact:");
  });
});

describe("Gate comment Structural improvement preview (Prompt C)", () => {
  it("suggestionBullets from fix-suggestions style renders preview", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["pkg:path:boundary_violation:spec"],
    };
    const bullets = ["Break cycle between packages/auth and packages/core"];
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta, bullets));
    expect(body).toContain("Structural improvement preview:");
    expect(body).toContain("• Break cycle between packages/auth and packages/core");
  });

  it("suggestionBullets from repair style renders preview", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["pkg:path:deleted_public_api:spec"],
    };
    const bullets = ["Add export in packages/foo/src/index.ts"];
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta, bullets));
    expect(body).toContain("Structural improvement preview:");
    expect(body).toContain("• Add export in packages/foo/src/index.ts");
  });

  it("more than 5 suggestions truncates with overflow line", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["pkg:path:boundary_violation:spec"],
    };
    const bullets = ["A", "B", "C", "D", "E", "F", "G"];
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta, bullets));
    expect(body).toContain("Structural improvement preview:");
    expect(body).toContain("• A");
    expect(body).toContain("• E");
    expect(body).not.toContain("• F");
    expect(body).toContain("… and 2 additional structural adjustments");
  });

  it("VERIFIED → no preview", () => {
    const report: GateReport = {
      status: "VERIFIED",
      decision: { level: "allow" },
      minimalCut: [],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta, ["Fix something"]));
    expect(body).not.toContain("Structural improvement preview:");
  });

  it("no suggestions → no preview", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: [],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).not.toContain("Structural improvement preview:");
  });

  it("identical artifact input → identical output", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["pkg:path:circular_import:spec"],
    };
    const bullets = ["Break cycle", "Add interface"];
    const one = buildGateComment(report, "STRICT" as GateMode, meta, bullets);
    const two = buildGateComment(report, "STRICT" as GateMode, meta, bullets);
    expect(one).toBe(two);
  });

  it("no suggestionBullets uses minimalCut-derived fallback", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["pkg:path:circular_import:spec", "pkg2:path2:boundary_violation:spec2"],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).toContain("Structural improvement preview:");
    expect(body).toContain("Remove one dependency in the cycle chain");
    expect(body).toContain("Route dependency through target package public API");
  });
});

describe("Gate comment Structural signature (Prompt D)", () => {
  it("signature renders when run.id exists", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["pkg:path:boundary_violation:spec"],
      run: { id: "7a9f3e12abcd" },
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).toContain("Structural signature:");
    expect(body).toContain("7a9f3e12");
  });

  it("signature truncates to 8 characters", () => {
    const report: GateReport = {
      status: "VERIFIED",
      decision: { level: "allow" },
      minimalCut: [],
      run: { id: "deadbeef12345678" },
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).toContain("Structural signature: deadbeef");
    expect(body).not.toMatch(/Structural signature: deadbeef12345678/);
  });

  it("missing run.id → no signature", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["pkg:path:boundary_violation:spec"],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).not.toContain("Structural signature:");
  });

  it("run.id shorter than 8 → no signature", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: [],
      run: { id: "short" },
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).not.toContain("Structural signature:");
  });

  it("identical report → identical signature", () => {
    const report: GateReport = {
      status: "BLOCKED",
      decision: { level: "block" },
      minimalCut: ["pkg:path:circular_import:spec"],
      run: { id: "a1b2c3d4e5f6" },
    };
    const one = buildGateComment(report, "STRICT" as GateMode, meta);
    const two = buildGateComment(report, "STRICT" as GateMode, meta);
    expect(one).toBe(two);
    expect(visibleBody(one)).toContain("Structural signature: a1b2c3d4");
  });

  it("signature is lowercase", () => {
    const report: GateReport = {
      status: "VERIFIED",
      decision: { level: "allow" },
      minimalCut: [],
      run: { id: "7A9F3E12ABCD" },
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).toContain("Structural signature: 7a9f3e12");
  });
});

describe("Gate comment Analysis scope exceeded (Prompt E)", () => {
  it("INCOMPLETE + scopeExceeded max_files renders scope block", () => {
    const report: GateReport = {
      status: "INCOMPLETE",
      decision: { level: "warn" },
      minimalCut: [],
      scopeExceeded: { reason: "max_files", changedFiles: 732, maxFiles: 500 },
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).toContain("Analysis scope exceeded:");
    expect(body).toContain("Changed files: 732 (max 500)");
    expect(body).toContain("Structural analysis skipped");
  });

  it("INCOMPLETE + scopeExceeded timeout renders scope block", () => {
    const report: GateReport = {
      status: "INCOMPLETE",
      decision: { level: "warn" },
      minimalCut: [],
      scopeExceeded: { reason: "timeout" },
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).toContain("Analysis scope exceeded:");
    expect(body).toContain("Analysis timed out");
    expect(body).toContain("Structural analysis skipped");
  });

  it("INCOMPLETE without scopeExceeded does not render scope block", () => {
    const report: GateReport = {
      status: "INCOMPLETE",
      decision: { level: "warn" },
      minimalCut: [],
    };
    const body = visibleBody(buildGateComment(report, "STRICT" as GateMode, meta));
    expect(body).not.toContain("Analysis scope exceeded:");
  });
});
