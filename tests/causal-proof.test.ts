import { buildDeterministicReport } from "../src/structural/buildReport.js";
import type { Proof, Violation } from "../src/structural/types.js";

const baseSha = "abc";
const headSha = "def";
const paths = ["packages/pkg/src/a.ts"];

function proof(rule: Proof["rule"], source: string, target: string): Proof {
  return {
    type: rule === "deleted_public_api" ? "deleted_file" : "import_path",
    source,
    target,
    rule,
  };
}

describe("Causal Proof Contract", () => {
  it("BLOCKED with all violations having proof → status BLOCKED, proofs in report", () => {
    const violations: Violation[] = [
      {
        package: "pkg",
        path: "packages/pkg/src/a.ts",
        cause: "boundary_violation",
        specifier: "@market-os/other/src/hash",
        proof: proof("boundary_violation", "/repo/packages/pkg/src/a.ts", "@market-os/other/src/hash"),
      },
    ];
    const report = buildDeterministicReport("BLOCKED", violations, baseSha, headSha, paths);
    expect(report.status).toBe("BLOCKED");
    expect(report.decision.level).toBe("block");
    expect(report.proofs).toBeDefined();
    expect(report.proofs).toHaveLength(1);
    expect(report.proofs![0]).toMatchObject({
      rule: "boundary_violation",
      source: "/repo/packages/pkg/src/a.ts",
      target: "@market-os/other/src/hash",
    });
  });

  it("BLOCKED with one violation missing proof → status INDETERMINATE, decision.level warn", () => {
    const violations: Violation[] = [
      {
        package: "pkg",
        path: "packages/pkg/src/a.ts",
        cause: "boundary_violation",
        specifier: "@market-os/other/src/hash",
        proof: proof("boundary_violation", "/repo/packages/pkg/src/a.ts", "@market-os/other/src/hash"),
      },
      {
        package: "pkg",
        path: "packages/pkg/src/b.ts",
        cause: "relative_escape",
        specifier: "../other/foo",
        // no proof
      },
    ];
    const report = buildDeterministicReport("BLOCKED", violations, baseSha, headSha, paths);
    expect(report.status).toBe("INDETERMINATE");
    expect(report.decision.level).toBe("warn");
    expect(report.decision.reason).toContain("Proof");
    expect(report.proofs).toBeUndefined();
  });

  it("VERIFIED has no proofs", () => {
    const report = buildDeterministicReport("VERIFIED", [], baseSha, headSha, paths);
    expect(report.status).toBe("VERIFIED");
    expect(report.proofs).toBeUndefined();
  });
});
