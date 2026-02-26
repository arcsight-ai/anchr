#!/usr/bin/env bash
# Apply a known boundary violation to the demo repo (api → core internal).
# Usage: ./scripts/demo-break.sh [path-to-demo-repo]
# Default: anchr-demo-monorepo (relative to repo root) or DEMO_REPO env.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO="${1:-${DEMO_REPO:-$ROOT/anchr-demo-monorepo}}"
API_INDEX="$DEMO/packages/api/src/index.ts"
if [ ! -f "$API_INDEX" ]; then
  echo "demo:break: demo repo not found at $DEMO (no packages/api/src/index.ts)"
  exit 1
fi
# Apply break: add import from core internal and use it
cat > "$API_INDEX" << 'DEMOBREAK'
/**
 * API package — depends only on @market-os/core public surface.
 * [DEMO BREAK] Intentionally imports core internal to trigger ANCHR BLOCKED.
 */
import { getVersion, formatMessage } from "@market-os/core";
import { internalHelper } from "../../core/src/internal.js";

export function apiVersion(): string {
  return getVersion();
}

export function greet(name: string): string {
  return formatMessage(`Hello, ${name}`);
}

export function useInternal(): string {
  return internalHelper();
}
DEMOBREAK
echo "demo:break: applied boundary violation to $API_INDEX (api → core internal)"
echo "Run gate to see BLOCKED; then demo:fix to restore."
