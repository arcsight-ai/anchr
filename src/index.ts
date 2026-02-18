import { createFingerprint } from "./fingerprint.js";
import { listSourceFiles } from "./fs.js";
import { createRunId } from "./run.js";

const root = process.cwd();
const files = listSourceFiles(root);
const fingerprint = createFingerprint(root, files);
const runId = createRunId(fingerprint);

console.log("ANCHR RUN");
console.log("files:", files.length);
console.log("fingerprint:", fingerprint);
console.log("run.id:", runId);
