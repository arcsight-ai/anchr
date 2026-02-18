import { sortStrings } from "../util/stableSort.js";
function buildReexportAdjacency(edges) {
    const adj = new Map();
    for (const e of edges) {
        if (e.kind !== "reexport")
            continue;
        const arr = adj.get(e.from) ?? [];
        arr.push(e.to);
        adj.set(e.from, arr);
    }
    for (const [k, v] of adj) {
        adj.set(k, sortStrings([...new Set(v)]));
    }
    return adj;
}
const closureCache = new Map();
function publicClosure(start, adj) {
    const cached = closureCache.get(start);
    if (cached)
        return cached;
    const visited = new Set();
    const stack = [start];
    while (stack.length > 0) {
        const node = stack.pop();
        if (visited.has(node))
            continue;
        visited.add(node);
        const next = adj.get(node) ?? [];
        for (const n of next) {
            stack.push(n);
        }
    }
    const result = sortStrings(Array.from(visited));
    closureCache.set(start, result);
    return result;
}
export function propagatePublicSurface(edges) {
    closureCache.clear();
    const adj = buildReexportAdjacency(edges);
    const result = [...edges];
    const added = new Set();
    for (const e of edges) {
        if (e.kind !== "value-import")
            continue;
        const closure = publicClosure(e.to, adj);
        for (const c of closure) {
            if (c === e.to)
                continue;
            const key = `${e.from}→${c}#public-surface`;
            if (!added.has(key)) {
                added.add(key);
                result.push({ from: e.from, to: c, kind: "public-surface" });
            }
        }
    }
    return result.sort((a, b) => {
        const x = `${a.from} ${a.to} ${a.kind}`;
        const y = `${b.from} ${b.to} ${b.kind}`;
        return x.localeCompare(y, "en");
    });
}
