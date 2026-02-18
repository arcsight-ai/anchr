import { mkdirSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { buildGraph } from "../src/graph/buildGraph.js";
import type { Edge } from "../src/graph/types.js";

function parseArgs(): { root: string; out: string } {
  let root = ".";
  let out = "artifacts/anchr-graph.json";

  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      root = args[++i];
    } else if (args[i] === "--out" && args[i + 1]) {
      out = args[++i];
    }
  }

  return { root: resolve(root), out: resolve(root, out) };
}

function topPackagesByOutEdges(
  edges: Edge[],
  topN: number,
): { package: string; count: number }[] {
  const byPkg = new Map<string, number>();

  for (const e of edges) {
    if (e.kind !== "public-surface") continue;
    const pkg = e.from.startsWith("pkg:") ? e.from.split(":")[1] : "?";
    byPkg.set(pkg, (byPkg.get(pkg) ?? 0) + 1);
  }

  return Array.from(byPkg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([pkg, count]) => ({ package: pkg, count }));
}

function main(): void {
  const { root, out } = parseArgs();
  const graph = buildGraph(root);

  const outDir = dirname(out);
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    // may exist
  }

  const metadataObj: Record<string, { filePath: string; package: string; isEntry: boolean }> = {};
  for (const [k, v] of graph.metadata) {
    metadataObj[k] = {
      filePath: v.filePath,
      package: v.package,
      isEntry: v.isEntry,
    };
  }

  const artifact = {
    repoRoot: root,
    nodes: graph.nodes,
    edges: graph.edges,
    metadata: metadataObj,
    stats: graph.stats,
  };

  writeFileSync(out, JSON.stringify(artifact, null, 2), "utf8");

  const top = topPackagesByOutEdges(graph.edges, 10);

  console.log("ANCHR Graph");
  console.log("nodes:", graph.stats.nodeCount);
  console.log("edges:", graph.stats.edgeCount);
  console.log("kinds:", JSON.stringify(graph.stats.kindsBreakdown));
  console.log("top 10 packages by public-surface outdegree:");
  for (const t of top) {
    console.log(`  ${t.package}: ${t.count}`);
  }
}

main();
