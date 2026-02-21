/**
 * Inline PR Review Comments (Prompt 19 — Final Production).
 * Posts precise architectural comments on changed lines only. Survives rebases; never crashes CI.
 */

import * as fs from "fs";

type Finding = {
  cause: string;
  file?: string;
  line?: number;
  importer?: string;
  target?: string;
};

const REVIEW_MARKER_PREFIX = "<!-- arcsight-inline:";
const MAX_COMMENTS = 25;

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v != null && String(v).trim() !== "" ? String(v).trim() : undefined;
}

async function api(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });
  if (res.status === 403 || res.status === 404) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function message(f: Finding): string {
  switch (f.cause) {
    case "boundary_violation":
      return `ANCHR: Importing another package's internal file breaks architectural boundaries.
Import from the package entrypoint instead.`;
    case "deleted_public_api":
      return `ANCHR: This removes a public API used across packages.
Migrate dependents in the same PR.`;
    case "type_import_private_target":
      return `ANCHR: Private types cannot cross package boundaries.
Export the type publicly instead.`;
    case "relative_escape":
      return `ANCHR: Relative path escapes the package boundary.
Use a package import instead.`;
    default:
      return `ANCHR: Architectural violation detected.`;
  }
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.file}:${f.line}:${f.cause}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function clampLine(line?: number): number {
  if (line == null || line < 1) return 1;
  if (line > 10000) return 10000;
  return line;
}

async function existingReviewForCommit(
  repo: string,
  pr: string,
  sha: string,
  token: string,
): Promise<boolean> {
  const reviews = await api(
    `https://api.github.com/repos/${repo}/pulls/${pr}/reviews`,
    token,
  );
  if (!reviews || !Array.isArray(reviews)) return true;
  const marker = REVIEW_MARKER_PREFIX + sha + " -->";
  return (reviews as { body?: string }[]).some((r) => r.body?.includes(marker));
}

async function changedFiles(
  repo: string,
  pr: string,
  token: string,
): Promise<Set<string>> {
  const files = await api(
    `https://api.github.com/repos/${repo}/pulls/${pr}/files?per_page=100`,
    token,
  );
  if (!files || !Array.isArray(files)) return new Set();
  return new Set((files as { filename?: string }[]).map((f) => f.filename ?? ""));
}

async function run(): Promise<void> {
  const token = getEnv("GITHUB_TOKEN");
  const repo = getEnv("GITHUB_REPOSITORY");
  const pr = getEnv("PR_NUMBER");
  const sha = getEnv("HEAD_SHA") ?? getEnv("GITHUB_HEAD_SHA");

  if (!token || !repo || !pr || !sha) {
    process.exit(0);
  }

  if (!fs.existsSync("artifacts/anchr-report.json")) {
    process.exit(0);
  }

  let report: { decision?: { level?: string }; findings?: Finding[] };
  try {
    report = JSON.parse(fs.readFileSync("artifacts/anchr-report.json", "utf8"));
  } catch {
    process.exit(0);
  }

  if (report?.decision?.level === "allow") {
    process.exit(0);
  }

  if (await existingReviewForCommit(repo, pr, sha, token)) {
    process.exit(0);
  }

  let findings: Finding[] = Array.isArray(report?.findings) ? report.findings : [];
  findings = dedupe(findings).slice(0, MAX_COMMENTS);

  const changed = await changedFiles(repo, pr, token);

  const comments = findings
    .filter((f) => f.file && changed.has(f.file))
    .map((f) => ({
      path: f.file,
      line: clampLine(f.line),
      side: "RIGHT" as const,
      body: message(f),
    }));

  if (!comments.length) {
    process.exit(0);
  }

  const marker = REVIEW_MARKER_PREFIX + sha + " -->";
  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${pr}/reviews`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        commit_id: sha,
        event: "COMMENT",
        body: marker,
        comments,
      }),
    },
  );

  if (!res.ok && res.status !== 422) {
    process.exit(0);
  }
}

run().catch(() => process.exit(0));
