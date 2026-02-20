/**
 * Execution envelope manifest and hashing for determinism certification.
 */

import { createHash } from "crypto";
import { stableStringify } from "./StableJson.js";

export interface EnvelopeManifest {
  runtime: {
    node_version: string;
    platform: string;
    timezone: string;
    locale: string;
    utf_normalization: string;
  };
  repo_identity: {
    repo_root_resolution: string;
    baseSha: string;
    headSha: string;
    staged_flag: boolean;
    diffEntries_source: string;
  };
  configuration_inputs: {
    argv_used: string[];
    env_vars_used: string[];
    cwd: string;
    report_path: string;
  };
  filesystem_bounds: {
    read_paths_allowlist: string[];
    write_paths_allowlist: string[];
    forbidden_reads: string[];
  };
  forbidden_io: {
    network: boolean;
    clock: boolean;
    randomness: boolean;
  };
}

export interface BuildEnvelopeParams {
  repoRoot: string;
  baseSha: string;
  headSha: string;
  staged: boolean;
  argvUsed: string[];
  envVarsUsed: Record<string, string>;
  cwd: string;
  reportPath: string;
}

export function buildEnvelopeManifest(params: BuildEnvelopeParams): EnvelopeManifest {
  const {
    repoRoot,
    baseSha,
    headSha,
    staged,
    argvUsed,
    envVarsUsed,
    cwd,
    reportPath,
  } = params;

  const envKeys = Object.keys(envVarsUsed).sort();
  const envList = envKeys.map((k) => `${k}=${envVarsUsed[k] ?? ""}`);

  return {
    runtime: {
      node_version: process.version,
      platform: process.platform + "/" + process.arch,
      timezone: "UTC",
      locale: "C",
      utf_normalization: "none",
    },
    repo_identity: {
      repo_root_resolution: repoRoot,
      baseSha,
      headSha,
      staged_flag: staged,
      diffEntries_source: staged ? "git diff --cached --name-status" : "git diff --name-status base..head",
    },
    configuration_inputs: {
      argv_used: [...argvUsed].sort(),
      env_vars_used: envList,
      cwd,
      report_path: reportPath,
    },
    filesystem_bounds: {
      read_paths_allowlist: ["repo_root", "packages/"],
      write_paths_allowlist: [reportPath || "artifacts/determinism-report.json"],
      forbidden_reads: ["previously written report outputs"],
    },
    forbidden_io: {
      network: true,
      clock: true,
      randomness: true,
    },
  };
}

/** SHA256 of stable stringify of manifest. */
export function hashEnvelopeManifest(manifest: EnvelopeManifest): string {
  const str = stableStringify(manifest);
  return createHash("sha256").update(str, "utf8").digest("hex");
}
