/**
 * Unit tests for runtime structural signal detectors.
 * One test per signal kind using small inline code samples.
 */

import {
  detectHiddenSharedState,
  detectInitOrderDependency,
  detectTemporalCoupling,
  detectFanoutSideEffects,
  detectCircularResponsibility,
  runRuntimeSignals,
} from "../src/detection/runtime-signals.js";
import { resolve } from "path";

describe("Runtime Structural Signals", () => {
  describe("hidden_shared_state", () => {
    it("detects exported mutable object with property mutation", () => {
      const code = `
        export const state = { count: 0 };
        export function inc() {
          state.count++;
        }
      `;
      const importers = new Map<string, string[]>();
      importers.set("/repo/src/state.ts:state", ["/repo/src/a.ts", "/repo/src/b.ts"]);
      const r = detectHiddenSharedState("/repo/src/state.ts", code, importers);
      expect(r).not.toBeNull();
      expect(r!.kind).toBe("hidden_shared_state");
      expect(r!.confidence).toBe("high");
      expect(r!.evidence.some((e) => e.includes("exported mutable"))).toBe(true);
    });

    it("returns null when no mutation of exported binding", () => {
      const code = `export const x = 1;`;
      const r = detectHiddenSharedState("/repo/src/a.ts", code, new Map());
      expect(r).toBeNull();
    });
  });

  describe("init_order_dependency", () => {
    it("detects top-level call expression", () => {
      const code = `
        initConfig();
        export function foo() {}
      `;
      const r = detectInitOrderDependency("/repo/src/config.ts", code);
      expect(r).not.toBeNull();
      expect(r!.kind).toBe("init_order_dependency");
      expect(r!.confidence).toBe("high");
      expect(r!.evidence.some((e) => e.includes("top-level call"))).toBe(true);
    });

    it("detects top-level assignment from call", () => {
      const code = `
        const config = loadConfig();
        export { config };
      `;
      const r = detectInitOrderDependency("/repo/src/config.ts", code);
      expect(r).not.toBeNull();
      expect(r!.kind).toBe("init_order_dependency");
      expect(r!.evidence.some((e) => e.includes("top-level assignment"))).toBe(true);
    });

    it("returns null when no top-level side effects", () => {
      const code = `export function foo() { bar(); }`;
      const r = detectInitOrderDependency("/repo/src/a.ts", code);
      expect(r).toBeNull();
    });
  });

  describe("temporal_coupling", () => {
    it("detects guard variable plus setter and reader functions", () => {
      const code = `
        let initialized = false;
        export function init() { initialized = true; }
        export function run() { return initialized ? "ok" : "no"; }
      `;
      const r = detectTemporalCoupling("/repo/src/api.ts", code);
      expect(r).not.toBeNull();
      expect(r!.kind).toBe("temporal_coupling");
      expect(r!.confidence).toBe("high");
      expect(r!.evidence.some((e) => e.includes("guard variable"))).toBe(true);
    });

    it("returns null when no guard pattern", () => {
      const code = `export function a() {} export function b() {}`;
      const r = detectTemporalCoupling("/repo/src/api.ts", code);
      expect(r).toBeNull();
    });
  });

  describe("fanout_side_effects", () => {
    it("detects function mutating 3+ distinct targets", () => {
      const code = `
        export function dispatch() {
          writeA("x");
          writeB(1);
          writeC(true);
        }
      `;
      const r = detectFanoutSideEffects("/repo/src/trigger.ts", code);
      expect(r).not.toBeNull();
      expect(r!.kind).toBe("fanout_side_effects");
      expect(r!.confidence).toBe("high");
      expect(r!.evidence.some((e) => e.includes("3") && e.includes("targets"))).toBe(true);
    });

    it("returns null when fewer than 3 mutation targets", () => {
      const code = `export function foo() { a = 1; b = 2; }`;
      const r = detectFanoutSideEffects("/repo/src/a.ts", code);
      expect(r).toBeNull();
    });
  });

  describe("circular_responsibility", () => {
    it("detects mutual import between two files", () => {
      const paths = [
        resolve("/repo/src/a.ts"),
        resolve("/repo/src/b.ts"),
      ];
      const readFile = (p: string) => {
        if (p.endsWith("a.ts")) return `import { b } from "./b"; export const a = 1;`;
        if (p.endsWith("b.ts")) return `import { a } from "./a"; export const b = 2;`;
        return null;
      };
      const resolveImport = (from: string, spec: string) => {
        const dir = from.replace(/\/[^/]+$/, "");
        const full = resolve(dir, spec + ".ts");
        return paths.includes(full) ? full : null;
      };
      const signals = detectCircularResponsibility(paths, readFile, resolveImport);
      expect(signals.length).toBeGreaterThanOrEqual(1);
      expect(signals.some((s) => s.kind === "circular_responsibility")).toBe(true);
    });
  });

  describe("runRuntimeSignals", () => {
    it("runs all detectors and returns deterministic list", () => {
      const repoRoot = resolve("/tmp/repo");
      const diffEntries = [{ path: "src/api.ts" }];
      const code = `
        let ready = false;
        export function init() { ready = true; }
        export function run() { return ready ? "ok" : "no"; }
      `;
      const readFile = (p: string) => (p.includes("api.ts") ? code : null);
      const results = runRuntimeSignals({ repoRoot, diffEntries, readFile });
      expect(Array.isArray(results)).toBe(true);
      const temporal = results.find((r) => r.kind === "temporal_coupling");
      expect(temporal).toBeDefined();
    });
  });
});
