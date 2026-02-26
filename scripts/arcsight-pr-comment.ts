/**
 * ArcSight Causally-Correct Convergent PR Comment Controller (Final).
 * Authority = (HEAD_SHA, BASE_SHA). Single Node script; never exit non-zero.
 * Converges to exactly one authoritative comment per (head, base) pair.
 * Delegates to src/comment/runGateComment.ts so CLI can run same logic in-process (no tsx).
 */

import { runGateComment } from "../src/comment/runGateComment.js";

runGateComment(process.cwd(), process.env)
  .then(() => process.exit(0))
  .catch(() => {
    console.log("API_FAILED");
    process.exit(0);
  });
