import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildGraph } from "../src/graph/buildGraph.js";
const TEST_ROOT = join(tmpdir(), "anchr-graph-smoke-" + Date.now());
function setup() {
    mkdirSync(TEST_ROOT, { recursive: true });
    const pkgDir = join(TEST_ROOT, "packages", "pkg", "src");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(join(pkgDir, "c.ts"), "export const x = 1;\n", "utf8");
    writeFileSync(join(pkgDir, "b.ts"), 'export * from "./c";\n', "utf8");
    writeFileSync(join(pkgDir, "a.ts"), 'export * from "./b";\n', "utf8");
    writeFileSync(join(pkgDir, "d.ts"), 'import { x } from "./a";\nconsole.log(x);\n', "utf8");
    return TEST_ROOT;
}
function run() {
    const root = setup();
    const graph = buildGraph(root);
    const dToC = graph.edges.find((e) => e.from === "pkg:pkg:d" && e.to === "pkg:pkg:c" && e.kind === "public-surface");
    if (!dToC) {
        console.error("FAIL: expected public-surface edge d -> c");
        console.error("edges:", JSON.stringify(graph.edges, null, 2));
        process.exit(1);
    }
    console.log("PASS: public-surface dependency d -> c exists");
}
run();
