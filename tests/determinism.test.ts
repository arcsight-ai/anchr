/**
 * Determinism platform tests: stableStringify, envelope hash, certifyMultiRun, permutation invariance.
 */

import { stableStringify } from "../src/determinism/StableJson.js";
import { stringCompareBinary, sortDiffEntries, sortViolations } from "../src/determinism/CanonicalOrder.js";
import { buildEnvelopeManifest, hashEnvelopeManifest } from "../src/determinism/EnvelopeManifest.js";
import { buildReport, hashReport, serializeReport } from "../src/determinism/Report.js";

describe("StableJson", () => {
  it("stableStringify is deterministic for same input", () => {
    const obj = { z: 1, a: 2, m: { b: 3, a: 4 } };
    const a = stableStringify(obj);
    const b = stableStringify(obj);
    expect(a).toBe(b);
  });

  it("stableStringify orders keys deterministically (binary)", () => {
    const obj = { a: 1, z: 2, m: 3 };
    const s = stableStringify(obj);
    expect(s).toContain('"a":1');
    expect(s).toContain('"m":3');
    expect(s).toContain('"z":2');
    const keysOrder = s.match(/"([^"]+)":/g);
    expect(keysOrder).toEqual(['"a":', '"m":', '"z":']);
  });

  it("stableStringify preserves array order", () => {
    const arr = [3, 1, 2];
    expect(stableStringify(arr)).toBe("[3,1,2]");
  });
});

describe("CanonicalOrder", () => {
  it("stringCompareBinary is deterministic", () => {
    expect(stringCompareBinary("a", "b")).toBe(-1);
    expect(stringCompareBinary("b", "a")).toBe(1);
    expect(stringCompareBinary("a", "a")).toBe(0);
  });

  it("sortDiffEntries produces stable order", () => {
    const entries = [
      { status: "M", path: "src/b.ts" },
      { status: "A", path: "src/a.ts" },
    ];
    const sorted = sortDiffEntries(entries);
    expect(sorted[0].path).toBe("src/a.ts");
    expect(sorted[1].path).toBe("src/b.ts");
  });

  it("sortViolations produces stable order", () => {
    const violations = [
      { path: "pkg/b", cause: "boundary_violation" },
      { path: "pkg/a", cause: "boundary_violation" },
    ];
    const sorted = sortViolations(violations);
    expect(sorted[0].path).toBe("pkg/a");
    expect(sorted[1].path).toBe("pkg/b");
  });
});

describe("EnvelopeManifest", () => {
  it("hashEnvelopeManifest is deterministic for same manifest", () => {
    const params = {
      repoRoot: "/repo",
      baseSha: "abc",
      headSha: "def",
      staged: false,
      argvUsed: ["--base", "abc", "--head", "def"],
      envVarsUsed: {},
      cwd: "/repo",
      reportPath: "artifacts/report.json",
    };
    const m1 = buildEnvelopeManifest(params);
    const m2 = buildEnvelopeManifest(params);
    expect(hashEnvelopeManifest(m1)).toBe(hashEnvelopeManifest(m2));
  });
});

describe("Report", () => {
  it("buildReport produces byte-identical serialization for identical inputs", () => {
    const params = {
      violations: [],
      envelopeHash: "abc123",
      confidence: 1,
      attackVectors: [],
      certificationStatus: "PASS" as const,
      determinismViolationDetected: false,
    };
    const r1 = buildReport(params);
    const r2 = buildReport(params);
    const s1 = serializeReport(r1);
    const s2 = serializeReport(r2);
    expect(s1).toBe(s2);
    expect(hashReport(r1)).toBe(hashReport(r2));
  });
});

describe("Permutation invariance", () => {
  it("randomized internal arrays before canonical sort yield same sorted output", () => {
    const entries = [
      { status: "M", path: "c.ts" },
      { status: "A", path: "a.ts" },
      { status: "D", path: "b.ts" },
    ];
    const sorted1 = sortDiffEntries(entries);
    const shuffled = [entries[1], entries[2], entries[0]];
    const sorted2 = sortDiffEntries(shuffled);
    expect(sorted1.map((e) => e.path)).toEqual(sorted2.map((e) => e.path));
    expect(sorted1.map((e) => e.status)).toEqual(sorted2.map((e) => e.status));
  });
});
