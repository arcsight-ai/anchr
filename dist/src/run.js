import { createHash } from "crypto";
const RUN_PREFIX = "anchr:v1:";
const RUN_ID_LENGTH = 16;
/**
 * Derives a short run identifier from the repository fingerprint.
 * Same fingerprint → same run.id everywhere (local, CI, any machine).
 */
export function createRunId(fingerprint) {
    const input = RUN_PREFIX + fingerprint;
    const hash = createHash("sha256").update(input, "utf8").digest("hex");
    return hash.slice(0, RUN_ID_LENGTH);
}
