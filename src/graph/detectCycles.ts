import type { Edge, GraphResult, ModuleID } from "./types.js";

/**
 * Finds strongly connected components (SCCs) with more than one node.
 * Each such SCC represents at least one cycle in the dependency graph.
 * Deterministic: same graph produces same order of cycles and same node order within each cycle.
 */
export function detectCycles(graph: GraphResult): ModuleID[][] {
  const edges = graph.edges.filter(
    (e) => e.kind === "value-import" || e.kind === "reexport",
  );
  const nodeSet = new Set<ModuleID>();
  for (const e of edges) {
    nodeSet.add(e.from);
    nodeSet.add(e.to);
  }
  const nodes = [...nodeSet].sort((a, b) => a.localeCompare(b, "en"));

  const indexByNode = new Map<ModuleID, number>();
  nodes.forEach((n, i) => indexByNode.set(n, i));

  const outEdges = nodes.map(() => [] as number[]);
  for (const e of edges) {
    const fromIdx = indexByNode.get(e.from);
    const toIdx = indexByNode.get(e.to);
    if (fromIdx != null && toIdx != null && fromIdx !== toIdx) {
      outEdges[fromIdx].push(toIdx);
    }
  }

  let indexCounter = 0;
  const index = new Array<number>(nodes.length).fill(-1);
  const lowlink = new Array<number>(nodes.length).fill(-1);
  const onStack = new Array<boolean>(nodes.length).fill(false);
  const stack: number[] = [];
  const sccs: number[][] = [];

  function strongConnect(v: number): void {
    index[v] = indexCounter;
    lowlink[v] = indexCounter;
    indexCounter++;
    stack.push(v);
    onStack[v] = true;

    for (const w of outEdges[v]) {
      if (index[w] === -1) {
        strongConnect(w);
        lowlink[v] = Math.min(lowlink[v], lowlink[w]);
      } else if (onStack[w]) {
        lowlink[v] = Math.min(lowlink[v], index[w]);
      }
    }

    if (lowlink[v] === index[v]) {
      const scc: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack[w] = false;
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) {
        scc.sort((a, b) => a - b);
        sccs.push(scc);
      }
    }
  }

  for (let v = 0; v < nodes.length; v++) {
    if (index[v] === -1) strongConnect(v);
  }

  sccs.sort((a, b) => {
    const a0 = nodes[a[0]!] ?? "";
    const b0 = nodes[b[0]!] ?? "";
    return a0.localeCompare(b0, "en");
  });

  return sccs.map((scc) => scc.map((i) => nodes[i]!));
}
