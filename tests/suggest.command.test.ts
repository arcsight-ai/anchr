/**
 * anchr suggest command: VERIFIED → empty suggestions exit 0; BLOCKED → deterministic output; INCOMPLETE → exit 2.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { runSuggest } from "../src/suggest/runSuggest.js";
import { suggestionsFromMinimalCut } from "../src/suggest/minimalCutSuggestions.js";

describe("anchr suggest", () => {
  let tmpDir: string;
  let prevReportPath: string | undefined;
  let prevSuggestionsPath: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "anchr-suggest-"));
    prevReportPath = process.env.ANCHR_REPORT_PATH;
    prevSuggestionsPath = process.env.ANCHR_SUGGESTIONS_PATH;
    process.env.ANCHR_REPORT_PATH = join(tmpDir, "anchr-report.json");
    process.env.ANCHR_SUGGESTIONS_PATH = join(tmpDir, "anchr-fix-suggestions.json");
  });

  afterEach(() => {
    if (prevReportPath !== undefined) process.env.ANCHR_REPORT_PATH = prevReportPath;
    else delete process.env.ANCHR_REPORT_PATH;
    if (prevSuggestionsPath !== undefined) process.env.ANCHR_SUGGESTIONS_PATH = prevSuggestionsPath;
    else delete process.env.ANCHR_SUGGESTIONS_PATH;
  });

  it("VERIFIED report → writes suggestions file with empty array, exit 0", async () => {
    const report = {
      status: "VERIFIED",
      baseSha: "aaa",
      headSha: "bbb",
      run: { id: "run1" },
    };
    writeFileSync(join(tmpDir, "anchr-report.json"), JSON.stringify(report), "utf8");
    const code = await runSuggest(tmpDir);
    expect(code).toBe(0);
    const raw = readFileSync(join(tmpDir, "anchr-fix-suggestions.json"), "utf8");
    const data = JSON.parse(raw);
    expect(data.version).toBe("v1");
    expect(data.source).toBe("minimalCut");
    expect(data.run).toEqual({ base: "aaa", head: "bbb", run_id: "run1" });
    expect(Array.isArray(data.suggestions)).toBe(true);
    expect(data.suggestions).toHaveLength(0);
  });

  it("BLOCKED report with minimalCut → deterministic suggestions output", async () => {
    const report = {
      status: "BLOCKED",
      baseSha: "base",
      headSha: "head",
      run: { id: "rid" },
      minimalCut: [
        "api:packages/api/src/index.ts:boundary_violation:@market-os/core/internal",
        "core:packages/core/src/index.ts:circular_import:pkg:api",
      ],
    };
    writeFileSync(join(tmpDir, "anchr-report.json"), JSON.stringify(report), "utf8");
    const code = await runSuggest(tmpDir);
    expect(code).toBe(0);
    const raw = readFileSync(join(tmpDir, "anchr-fix-suggestions.json"), "utf8");
    const data = JSON.parse(raw);
    expect(data.version).toBe("v1");
    expect(data.source).toBe("minimalCut");
    expect(data.run.run_id).toBe("rid");
    expect(data.suggestions.length).toBeGreaterThan(0);
    const categories = data.suggestions.map((s: { category: string }) => s.category);
    expect(categories).toContain("cycle");
    expect(categories).toContain("cross-domain");
    expect(data.suggestions.every((s: { title: string; steps: string[] }) => typeof s.title === "string" && Array.isArray(s.steps))).toBe(true);
  });

  it("INCOMPLETE report → exit 2", async () => {
    const report = { status: "INCOMPLETE", run: { id: "" } };
    writeFileSync(join(tmpDir, "anchr-report.json"), JSON.stringify(report), "utf8");
    const code = await runSuggest(tmpDir);
    expect(code).toBe(2);
  });

  it("missing report → exit 2", async () => {
    const code = await runSuggest(tmpDir);
    expect(code).toBe(2);
  });
});

describe("suggestionsFromMinimalCut", () => {
  it("deterministic: same minimalCut → same suggestions sorted by category then title", () => {
    const minimalCut = [
      "api:packages/api/src/index.ts:boundary_violation:spec",
      "core:packages/core/src/index.ts:circular_import",
    ];
    const a = suggestionsFromMinimalCut(minimalCut);
    const b = suggestionsFromMinimalCut(minimalCut);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    const sorted = [...a].sort((x, y) => {
      const c = x.category.localeCompare(y.category, "en");
      return c !== 0 ? c : x.title.localeCompare(y.title, "en");
    });
    expect(a).toEqual(sorted);
  });

  it("produces category cycle for circular_import", () => {
    const out = suggestionsFromMinimalCut(["pkg:path:circular_import"]);
    expect(out.some((s) => s.category === "cycle")).toBe(true);
    expect(out.some((s) => s.title.includes("cycle"))).toBe(true);
  });

  it("produces category cross-domain for boundary_violation", () => {
    const out = suggestionsFromMinimalCut(["pkg:path:boundary_violation:spec"]);
    expect(out.some((s) => s.category === "cross-domain")).toBe(true);
  });
});
