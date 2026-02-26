#!/usr/bin/env bash
# Restore demo repo to clean state (remove boundary violation).
# Usage: ./scripts/demo-fix.sh [path-to-demo-repo]
# Default: anchr-demo-monorepo (relative to repo root) or DEMO_REPO env.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="${1:-${DEMO_REPO:-$ROOT/anchr-demo-monorepo}}"
API_INDEX="$DEMO/packages/api/src/index.ts"
if [ ! -f "$API_INDEX" ]; then
  echo "demo:fix: demo repo not found at $DEMO (no packages/api/src/index.ts)"
  exit 1
fi
# Restore clean: public surface only
cat > "$API_INDEX" << 'DEMOFIX'
/**
 * API package — depends only on @market-os/core public surface.
 */
import { getVersion, formatMessage } from "@market-os/core";

export function apiVersion(): string {
  return getVersion();
}

export function greet(name: string): string {
  return formatMessage(`Hello, ${name}`);
}
DEMOFIX
echo "demo:fix: restored $API_INDEX to public-surface-only (no internal import)"
echo "Run gate to see VERIFIED."
