#!/usr/bin/env npx tsx
/**
 * Phase 1A — Differential (Section 8) and interpretation matrix (Section 9).
 * Facts only. No prose. Exit 0 = CASE_B only; Exit 1 = all others.
 * Optional rule execution assertion: PHASE1A_EXPECTED_RULE_ID or 4th arg.
 *
 * Usage: npx tsx scripts/phase1/phase1a-differential.ts baseline.json post-violation.json [expected_rule_id]
 */

import { readFileSync } from "fs";

interface RunSingleOutput {
  decision_level?: string;
  coverage_ratio?: number;
  minimal_cut_size?: number;
  primary_cause?: string | null;
  execution_ms?: number;
  rule_evaluation_trace?: string[];
}

function load(path: string): RunSingleOutput {
  try {
    const raw = readFileSync(path, "utf8");
    return JSON.parse(raw) as RunSingleOutput;
  } catch {
    return {};
  }
}

function main(): void {
  const baselinePath = process.argv[2];
  const postPath = process.argv[3];
  const expectedRuleId = process.env.PHASE1A_EXPECTED_RULE_ID ?? process.argv[4] ?? "";
  if (!baselinePath || !postPath) {
    console.error("Usage: npx tsx scripts/phase1/phase1a-differential.ts baseline.json post-violation.json [expected_rule_id]");
    process.exit(2);
  }
  const baseline = load(baselinePath);
  const post = load(postPath);

  const baseDecision = (baseline.decision_level ?? "allow").toLowerCase();
  const postDecision = (post.decision_level ?? "allow").toLowerCase();
  const baseCoverage = typeof baseline.coverage_ratio === "number" ? baseline.coverage_ratio : 0;
  const postCoverage = typeof post.coverage_ratio === "number" ? post.coverage_ratio : 0;
  const baseCut = typeof baseline.minimal_cut_size === "number" ? baseline.minimal_cut_size : 0;
  const postCut = typeof post.minimal_cut_size === "number" ? post.minimal_cut_size : 0;
  const postPrimaryCause = post.primary_cause != null && String(post.primary_cause).trim() !== "";
  const trace = Array.isArray(post.rule_evaluation_trace) ? post.rule_evaluation_trace : [];

  const decisionChanged = baseDecision !== postDecision;
  const coverageDelta = postCoverage - baseCoverage;
  const minimalCutDelta = postCut - baseCut;
  const violationTracePresent = postCut > 0 || postPrimaryCause;
  const primaryCausePopulated = postPrimaryCause;

  const ruleInTrace =
    trace.length > 0 &&
    trace.some((id) => String(id).trim().toLowerCase() === String(expectedRuleId).trim().toLowerCase());
  const ruleRoutingFailure = expectedRuleId !== "" && trace.length > 0 && !ruleInTrace;

  const detectionStrength =
    postCut <= 0 ? "N/A" : postCut === 1 ? "weak" : postCut > 3 ? "strong" : "medium";

  console.log("Decision changed? (Y/N)");
  console.log(decisionChanged ? "Y" : "N");
  console.log("Coverage delta (number)");
  console.log(coverageDelta);
  console.log("minimalCut delta (number)");
  console.log(minimalCutDelta);
  console.log("Violation trace present? (Y/N)");
  console.log(violationTracePresent ? "Y" : "N");
  console.log("Primary cause populated? (Y/N)");
  console.log(primaryCausePopulated ? "Y" : "N");
  console.log("Detection strength (minimalCut size)");
  console.log(postCut);
  console.log("Detection strength (calibration)");
  console.log(detectionStrength);
  if (expectedRuleId !== "") {
    console.log("Rule in evaluation trace? (Y/N)");
    console.log(ruleRoutingFailure ? "N" : "Y");
  }

  if (expectedRuleId !== "" && ruleRoutingFailure) {
    console.log("ENGINE_ROUTING_FAILURE");
    process.exit(1);
  }

  const stillAllow = postDecision === "allow";
  const still100 = postCoverage >= 0.99;
  const warnOrBlock = postDecision === "warn" || postDecision === "block";

  if (stillAllow && still100 && postCut === 0 && !violationTracePresent) {
    console.log("CASE_A");
    process.exit(1);
  }
  if (warnOrBlock && postCut > 0 && violationTracePresent) {
    console.log("CASE_B");
    process.exit(0);
  }
  if (stillAllow && (coverageDelta !== 0 || postCut > 0)) {
    console.log("CASE_C");
    process.exit(1);
  }
  console.log("CASE_A");
  process.exit(1);
}

main();
