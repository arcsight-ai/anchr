/**
 * Demo: read artifacts/anchr-report.json and print classify + recommend + intent.
 * Run: npx tsx scripts/demo-report.ts
 */
import * as fs from "fs";
import { classifyImpact } from "./classify-impact.js";
import { recommendAction } from "./recommend-action.js";
import { summarizeIntent } from "./intent-summary.js";

const path = "artifacts/anchr-report.json";
if (!fs.existsSync(path)) {
  console.log("No report at " + path + ". Run: npm run structural");
  process.exit(0);
}
const report = JSON.parse(fs.readFileSync(path, "utf8"));
const action = recommendAction(report);
console.log("Classify:", classifyImpact(report));
console.log("Recommend:", action.code, "—", action.message);
const findings = (report.minimalCut ?? []).map((c: string) => ({
  cause: String(c).split(":")[0] ?? "unknown",
}));
console.log("Intent:", summarizeIntent(findings.length ? findings : []));
