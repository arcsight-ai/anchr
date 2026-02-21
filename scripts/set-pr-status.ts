/**
 * GitHub Status Publisher (Prompt 16 — Race-Safe Final).
 * Only publishes if SHA still matches current HEAD. Retries on network failure.
 * Description trimmed to 140 chars (GitHub limit).
 */

import fs from "fs";
import process from "process";
import https from "https";
import { execSync } from "child_process";

type Decision = "allow" | "warn" | "block";

type Report = {
  decision?: { level?: Decision; reason?: string };
  classification?: { primaryCause?: string };
  run?: { id?: string };
};

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const sha = process.env.GITHUB_HEAD_SHA;
const runId = process.env.GITHUB_RUN_ID;
const reportPath = process.env.ANCHR_REPORT_PATH;

if (!token || !repo || !sha) {
  console.log("Skipping status publish (not GitHub env)");
  process.exit(0);
}

try {
  const current = execSync("git rev-parse HEAD").toString().trim();
  if (current !== sha) {
    console.log("Skipping stale workflow run");
    process.exit(0);
  }
} catch {}

function loadReport(): Report | null {
  if (!reportPath || !fs.existsSync(reportPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(reportPath, "utf8"));
  } catch {
    return null;
  }
}

const report = loadReport();

let state: "success" | "failure" | "neutral" = "neutral";
let description = "ANCHR did not run";

if (!report) {
  description = "No report produced";
} else {
  const decision = report.decision?.level;
  if (decision === "allow") {
    state = "success";
    description = "Architecture verified";
  } else if (decision === "block") {
    state = "failure";
    description = report.classification?.primaryCause
      ? "Blocked: " + report.classification.primaryCause
      : "Architectural violation";
  } else if (decision === "warn") {
    state = "neutral";
    description = report.decision?.reason?.slice(0, 80) || "Analysis inconclusive";
  }
}

description = description.slice(0, 140);

let targetUrl: string | undefined;
if (process.env.GITHUB_SERVER_URL && runId) {
  targetUrl = process.env.GITHUB_SERVER_URL + "/" + repo + "/actions/runs/" + runId;
}

const context = "ANCHR";

const payloadObj: { state: string; context: string; description: string; target_url?: string } = {
  state,
  context,
  description,
};
if (targetUrl) payloadObj.target_url = targetUrl;
const payload = JSON.stringify(payloadObj);

function postStatus(retry = 0): void {
  const req = https.request(
    {
      hostname: "api.github.com",
      path: "/repos/" + repo + "/statuses/" + sha,
      method: "POST",
      headers: {
        "User-Agent": "anchr",
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    },
    (res) => {
      if (res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300) {
        console.log("ANCHR status:", state);
      } else if (retry < 3) {
        setTimeout(() => postStatus(retry + 1), 1500);
      } else {
        console.log("ANCHR status publish skipped");
      }
    },
  );
  req.on("error", () => {
    if (retry < 3) setTimeout(() => postStatus(retry + 1), 1500);
    else console.log("ANCHR status publish failed (non-fatal)");
  });
  req.write(payload);
  req.end();
}

postStatus();
