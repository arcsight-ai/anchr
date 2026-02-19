/**
 * anchr share — Entry point for npm run share.
 * Delegates to src/cli/share (DINA). Plain text only. Always exit 0.
 */

import { runShare } from "../src/cli/share.js";

runShare(process.cwd());
process.exit(0);
