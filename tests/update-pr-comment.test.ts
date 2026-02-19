import { createHash } from "crypto";
import { renderComment } from "../scripts/render-comment.js";
import { recommendAction } from "../scripts/recommend-action.js";

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extract(body: string | undefined): { run?: string; hash?: string } {
  if (!body) return {};
  const run = body.match(/run:([a-z0-9]+)/)?.[1];
  const hash = body.match(/hash:([a-f0-9]+)/)?.[1];
  return { run, hash };
}

function safeBody(text: string): string {
  if (text.length < 60000) return text;
  return text.slice(0, 58000) + "\n\n…output truncated…";
}

describe("update-pr-comment logic", () => {
  const report = {
    decision: { level: "allow" },
    run: { id: "run-abc123" },
    scope: { mode: "structural-fast-path" },
    confidence: { coverageRatio: 1 },
    classification: { violations: [] },
  };

  it("recommendAction + renderComment produces body with v2 marker", () => {
    const action = recommendAction(report);
    const body = renderComment({
      action,
      runId: report.run.id,
      scopeMode: report.scope.mode,
      coverageRatio: report.confidence.coverageRatio,
      explanationViolations: report.classification?.violations ?? null,
      downgradeReasons: null,
    });
    expect(body).toContain("<!-- arcsight:v2:run:");
    expect(body).toContain("ArcSight Architectural Review");
  });

  it("normalize + hash is deterministic", () => {
    const action = recommendAction(report);
    const body = renderComment({
      action,
      runId: report.run.id,
      scopeMode: report.scope.mode,
      coverageRatio: report.confidence.coverageRatio,
      explanationViolations: null,
      downgradeReasons: null,
    });
    const hash1 = createHash("sha256").update(normalize(body)).digest("hex");
    const hash2 = createHash("sha256").update(normalize(body)).digest("hex");
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("extract parses run and hash from v3 marker", () => {
    const body = "some text\n\n<!-- arcsight:v3:run:abc123 hash:deadbeef -->";
    const got = extract(body);
    expect(got.run).toBe("abc123");
    expect(got.hash).toBe("deadbeef");
  });

  it("extract returns empty for missing body or no marker", () => {
    expect(extract(undefined)).toEqual({});
    expect(extract("no marker here")).toEqual({});
  });

  it("safeBody truncates at 60k with suffix", () => {
    const long = "x".repeat(65000);
    const out = safeBody(long);
    expect(out.length).toBeLessThanOrEqual(58000 + 30);
    expect(out).toContain("…output truncated…");
  });
});
