/**
 * Deterministic Share Block — Topology-stable, replay-verifiable, instance-aware.
 * Permanent architectural proof artifact. Same architecture → same Proof;
 * different commit → different Instance. Do not modify detection or formatLaw.
 */

import { createHash } from "crypto";
import { formatLaw } from "./law.js";
import type { ArcSightReportLike } from "./law.js";
import { getDiff, getTreeAtRef } from "../structural/git.js";
import { parseMinimalCut } from "../repair/parseReport.js";

export type ArcSightReport = ArcSightReportLike & {
  proofs?: Array<{ rule?: string }>;
};

export interface ShareBlockContext {
  base: string;
  head: string;
  repoRoot: string;
}

const SEVERITY_ORDER = [
  "deleted_public_api",
  "boundary_violation",
  "type_import_private_target",
  "relative_escape",
  "indeterminate",
  "verified",
] as const;

const CAUSE_LABELS: Record<string, string> = {
  deleted_public_api: "public API removed",
  boundary_violation: "crossed package boundary",
  type_import_private_target: "depended on private types",
  relative_escape: "escaped package boundary",
  indeterminate: "untraceable dependency",
  verified: "no behavioral impact",
};

function nfc(s: string): string {
  return s.normalize("NFC");
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** First 10 hex of SHA-256 of canonical lawset (severity order + cause mapping). */
export function computeLawsetFingerprint(): string {
  const payload = [
    SEVERITY_ORDER.join("\n"),
    ...Object.entries(CAUSE_LABELS)
      .sort((a, b) => a[0].localeCompare(b[0], "en"))
      .map(([k, v]) => `${k}: ${v}`),
  ].join("\n");
  const normalized = nfc(payload).replace(/\r\n?/g, "\n");
  return createHash("sha256").update(normalized, "utf8").digest("hex").slice(0, 10);
}

/** Pick highest cause from report; return frozen label. */
function frozenCause(report: ArcSightReport): string {
  const status = (report.status ?? "").trim();
  const level = (report.decision?.level ?? "warn").trim();
  const primaryCause = (report.classification?.primaryCause ?? null) as string | null;

  if (status === "VERIFIED" && level === "allow") return CAUSE_LABELS.verified ?? "no behavioral impact";
  if (status === "INDETERMINATE" || status === "INCOMPLETE" || level === "warn") {
    return CAUSE_LABELS.indeterminate ?? "untraceable dependency";
  }
  const cause = primaryCause && CAUSE_LABELS[primaryCause] ? CAUSE_LABELS[primaryCause] : CAUSE_LABELS.indeterminate;
  return cause ?? "untraceable dependency";
}

function normalizedPackageNames(minimalCut: string[]): string[] {
  if (!Array.isArray(minimalCut)) return [];
  const set = new Set<string>();
  for (const entry of minimalCut) {
    if (typeof entry !== "string") continue;
    const first = entry.split(":")[0]?.trim();
    if (first) set.add(first.replace(/^packages\/+/, "").trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b, "en"));
}

/** Extract target package from specifier (e.g. packages/foo/src/... -> foo). */
function targetPackageFromSpecifier(spec: string | undefined): string | null {
  if (!spec || typeof spec !== "string") return null;
  const t = spec.replace(/\\/g, "/").trim();
  const m = t.match(/^packages\/([^/]+)/);
  if (m) return m[1] ?? null;
  const first = t.split("/")[0];
  return first && first !== ".." && first !== "." ? first : null;
}

/** Build directed graph from minimalCut: node -> set of successors. */
function buildPackageGraph(minimalCut: string[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const parsed = parseMinimalCut(minimalCut);
  for (const v of parsed) {
    const from = v.package.replace(/^packages\/+/, "").trim();
    if (!from) continue;
    if (!graph.has(from)) graph.set(from, new Set());
    const to = targetPackageFromSpecifier(v.specifier) ?? from;
    graph.get(from)!.add(to);
    if (!graph.has(to)) graph.set(to, new Set());
  }
  return graph;
}

/** Tarjan SCC; returns array of SCCs (each SCC is array of nodes). */
function stronglyConnectedComponents(graph: Map<string, Set<string>>): string[][] {
  const nodes = [...new Set([...graph.keys(), ...[...graph.values()].flatMap((s) => [...s])])].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let idx = 0;

  function strong(v: string): void {
    index.set(v, idx);
    low.set(v, idx);
    idx += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      comp.sort((a, b) => a.localeCompare(b, "en"));
      sccs.push(comp);
    }
  }

  for (const v of nodes) {
    if (!index.has(v)) strong(v);
  }
  return sccs.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? "", "en"));
}

/** Collapse SCCs into supernodes; return DAG of representative node -> successors (representatives). */
function collapseSCCs(
  graph: Map<string, Set<string>>,
  sccs: string[][],
): Map<string, Set<string>> {
  const nodeToRep = new Map<string, string>();
  for (const comp of sccs) {
    const rep = comp[0] ?? "";
    for (const n of comp) nodeToRep.set(n, rep);
  }
  const dag = new Map<string, Set<string>>();
  for (const comp of sccs) {
    const rep = comp[0] ?? "";
    if (!dag.has(rep)) dag.set(rep, new Set());
    const out = graph.get(rep);
    if (out) {
      for (const w of out) {
        const wRep = nodeToRep.get(w) ?? w;
        if (wRep !== rep) dag.get(rep)!.add(wRep);
      }
    }
  }
  return dag;
}

/** Topological order of collapsed graph (sources first). Deterministic. */
function topoOrder(dag: Map<string, Set<string>>): string[] {
  const nodes = [...dag.keys()].sort((a, b) => a.localeCompare(b, "en"));
  const inDegree = new Map<string, number>();
  for (const n of nodes) inDegree.set(n, 0);
  for (const n of nodes) {
    for (const w of dag.get(n) ?? []) inDegree.set(w, (inDegree.get(w) ?? 0) + 1);
  }
  const queue: string[] = nodes.filter((n) => inDegree.get(n) === 0).sort((a, b) => a.localeCompare(b, "en"));
  const order: string[] = [];
  while (queue.length > 0) {
    const v = queue.shift()!;
    order.push(v);
    for (const w of dag.get(v) ?? []) {
      const d = (inDegree.get(w) ?? 1) - 1;
      inDegree.set(w, d);
      if (d === 0) queue.push(w);
    }
    queue.sort((a, b) => a.localeCompare(b, "en"));
  }
  return order;
}

/** Assign deterministic role labels: core, layer1, layer2, ... */
function assignRoles(minimalCut: string[]): Map<string, string> {
  const graph = buildPackageGraph(minimalCut);
  if (graph.size === 0) return new Map();
  const sccs = stronglyConnectedComponents(graph);
  const dag = collapseSCCs(graph, sccs);
  const order = topoOrder(dag);
  const roleNames = ["core", "layer1", "layer2", "layer3", "layer4", "layer5", "layer6", "layer7", "layer8", "layer9"];
  const repToRole = new Map<string, string>();
  order.forEach((rep, i) => {
    repToRole.set(rep, roleNames[i] ?? `layer${i}`);
  });
  const nodeToRep = new Map<string, string>();
  for (const comp of sccs) {
    const rep = comp[0] ?? "";
    for (const n of comp) nodeToRep.set(n, rep);
  }
  const packageToRole = new Map<string, string>();
  const allPackages = normalizedPackageNames(minimalCut);
  for (const pkg of allPackages) {
    const rep = nodeToRep.get(pkg) ?? pkg;
    packageToRole.set(pkg, repToRole.get(rep) ?? "core");
  }
  return packageToRole;
}

/** Human scope: package names. e.g. "kernel ↔ world-model (+2 more)". */
function scopeHuman(minimalCut: string[]): string {
  const pkgs = normalizedPackageNames(minimalCut);
  if (pkgs.length === 0) return "";
  if (pkgs.length === 1) return pkgs[0]!;
  if (pkgs.length === 2) return `${pkgs[0]} ↔ ${pkgs[1]}`;
  return `${pkgs[0]} ↔ ${pkgs[1]} (+${pkgs.length - 2} more)`;
}

/** Proof scope: role labels. e.g. "core ↔ layer1 (+2)". */
function scopeProof(minimalCut: string[], packageToRole: Map<string, string>): string {
  const pkgs = normalizedPackageNames(minimalCut);
  const roles = [...new Set(pkgs.map((p) => packageToRole.get(p) ?? "core"))].sort((a, b) =>
    a.localeCompare(b, "en"),
  );
  if (roles.length === 0) return "";
  if (roles.length === 1) return roles[0]!;
  if (roles.length === 2) return `${roles[0]} ↔ ${roles[1]}`;
  return `${roles[0]} ↔ ${roles[1]} (+${roles.length - 2})`;
}

/** Canonical scope role string for Proof ID (sorted role pairs from minimalCut). */
function scopeRoleCanonical(minimalCut: string[], packageToRole: Map<string, string>): string {
  const parsed = parseMinimalCut(minimalCut);
  const pairs = new Set<string>();
  for (const v of parsed) {
    const from = v.package.replace(/^packages\/+/, "").trim();
    const to = targetPackageFromSpecifier(v.specifier) ?? from;
    const rFrom = packageToRole.get(from) ?? "core";
    const rTo = packageToRole.get(to) ?? "core";
    const pair = rFrom <= rTo ? `${rFrom}\n${rTo}` : `${rTo}\n${rFrom}`;
    pairs.add(pair);
  }
  return [...pairs].sort().join("\n");
}

/** Evidence hash: sorted changed paths, sorted role labels in cut, sorted violation types, decision.level. */
function computeEvidenceHash(
  report: ArcSightReport,
  context: ShareBlockContext | undefined,
  packageToRole: Map<string, string>,
): string {
  const parts: string[] = [];
  if (context) {
    const entries = getDiff(context.repoRoot, context.base, context.head);
    const paths = [...new Set(entries.map((e) => e.path))].map((p) => nfc(p).toLowerCase()).sort((a, b) => a.localeCompare(b, "en"));
    parts.push(paths.join("\n"));
  }
  const pkgs = normalizedPackageNames(report.minimalCut ?? []);
  const roles = [...new Set(pkgs.map((p) => packageToRole.get(p) ?? "core"))].sort((a, b) => a.localeCompare(b, "en"));
  parts.push(roles.join("\n"));
  const causes = (report.minimalCut ?? []).map((e) => {
    const p = e.split(":");
    return (p[2] ?? "").toLowerCase();
  }).filter(Boolean);
  parts.push([...new Set(causes)].sort((a, b) => a.localeCompare(b, "en")).join("\n"));
  const level = (report.decision?.level ?? "warn").toLowerCase();
  parts.push(level);
  const payload = nfc(parts.join("\n")).replace(/\r\n?/g, "\n");
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 12);
}

/** Stable Proof ID: must not change across rebases or renames. */
function stableProofId(
  report: ArcSightReport,
  lawsetFingerprint: string,
  scopeRoleCanon: string,
): string {
  const level = (report.decision?.level ?? "warn").toLowerCase();
  const cause = frozenCause(report).toLowerCase();
  const payload = nfc(`v1|${lawsetFingerprint}|${scopeRoleCanon}|${level}|${cause}`).replace(/\r\n?/g, "\n");
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 12);
}

/** Instance ID from tree SHA (topology-stable; distinguishes commits without breaking proof). */
export function computeInstanceId(treeSha: string): string {
  const payload = nfc(`v1-instance|${treeSha}`);
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 12);
}

function decisionLabel(level: string): "ALLOW" | "BLOCK" | "WARN" {
  const l = (level ?? "warn").toLowerCase();
  if (l === "allow") return "ALLOW";
  if (l === "block") return "BLOCK";
  return "WARN";
}

/**
 * Format the deterministic share block. Plain text, Unix newlines, no trailing spaces, NFC.
 * When context is provided, Instance and Evidence use commit-scoped data; otherwise placeholders.
 */
export function formatShareBlock(report: ArcSightReport, context?: ShareBlockContext): string {
  const law = formatLaw(report);
  const level = (report.decision?.level ?? "warn").trim();
  const cause = frozenCause(report);
  const minimalCut = report.minimalCut ?? [];
  const packageToRole = assignRoles(minimalCut);
  const scopeHumanStr = scopeHuman(minimalCut);
  const scopeProofStr = scopeProof(minimalCut, packageToRole);
  const scopeRoleCanon = scopeRoleCanonical(minimalCut, packageToRole);
  const lawsetFp = computeLawsetFingerprint();
  const proofId = stableProofId(report, lawsetFp, scopeRoleCanon);
  const evidenceHash = computeEvidenceHash(report, context, packageToRole);

  let instanceId = "";
  if (context) {
    const treeSha = getTreeAtRef(context.repoRoot, context.head);
    instanceId = treeSha ? computeInstanceId(treeSha) : "";
  }

  const lines = [
    "ArcSight Result",
    "",
    law,
    "",
    `Decision: ${decisionLabel(level)}`,
    `Cause: ${collapseWhitespace(cause)}`,
    `Scope: ${collapseWhitespace(scopeHumanStr)}`,
    `Proof: ${collapseWhitespace(scopeProofStr)}`,
    `Instance: ${instanceId || "(no commit context)"}`,
    `Evidence: ${evidenceHash}`,
  ];

  const out = lines.join("\n").replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  return nfc(out.split("\n").map((l) => l.replace(/\s+$/, "")).join("\n"));
}
