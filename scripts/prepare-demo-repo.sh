#!/usr/bin/env bash
# Prepare a standalone copy of anchr-demo-monorepo with two branches:
#   - verified-demo: trivial safe change (VERIFIED PR)
#   - blocked-demo: imports core internal (BLOCKED PR)
# You then create the GitHub repo, push, and open the two PRs.
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_SRC="${REPO_ROOT}/anchr-demo-monorepo"
OUTPUT_DIR="${1:-${REPO_ROOT}/../anchr-demo-monorepo-standalone}"

if [ ! -d "$DEMO_SRC" ]; then
  echo "Missing $DEMO_SRC"
  exit 1
fi

PARENT="$(dirname "$OUTPUT_DIR")"
if [ ! -d "$OUTPUT_DIR" ]; then
  if [ ! -d "$PARENT" ]; then
    echo "Error: parent directory $PARENT does not exist. Use a writable path, e.g.:"
    echo "  $0 ./anchr-demo-standalone"
    echo "  $0 \$HOME/anchr-demo-monorepo-standalone"
    exit 1
  fi
  if [ ! -w "$PARENT" ]; then
    echo "Error: parent directory $PARENT is not writable."
    exit 1
  fi
  mkdir -p "$OUTPUT_DIR"
fi

echo "Copying demo monorepo to $OUTPUT_DIR (excluding .git, node_modules)..."
rsync -a --exclude='.git' --exclude='node_modules' "$DEMO_SRC/" "$OUTPUT_DIR/"

cd "$OUTPUT_DIR"
rm -rf .git 2>/dev/null || true
git init
git add .
git commit -m "Initial commit: ANCHR demo monorepo"

# VERIFIED branch: trivial safe change
git checkout -b verified-demo
cat > packages/api/src/index.ts << 'VERIFIED_EOF'
/**
 * API package — depends only on @market-os/core public surface.
 * VERIFIED: this PR only adds a comment; no boundary change.
 */
import { getVersion, formatMessage } from "@market-os/core";

export function apiVersion(): string {
  return getVersion();
}

export function greet(name: string): string {
  return formatMessage(`Hello, ${name}`);
}
VERIFIED_EOF
git add packages/api/src/index.ts
git commit -m "docs: clarify public-surface-only (VERIFIED demo)"

# BLOCKED branch: import from core internal
git checkout main
git checkout -b blocked-demo
cat > packages/api/src/index.ts << 'BLOCKED_EOF'
/**
 * API package — depends only on @market-os/core public surface.
 */
import { getVersion, formatMessage } from "@market-os/core";
import { internalHelper } from "@market-os/core/internal";

export function apiVersion(): string {
  return getVersion();
}

export function greet(name: string): string {
  return formatMessage(`Hello, ${name}`);
}

export function internalInfo(): string {
  return internalHelper();
}
BLOCKED_EOF
git add packages/api/src/index.ts
git commit -m "chore: use core internal (BLOCKED demo — boundary violation)"

git checkout main

echo ""
echo "Done. Standalone repo at: $OUTPUT_DIR"
echo ""
echo "Next steps (steps 1 and 6–7 need GitHub in the browser or gh CLI):"
echo "  1. Create a new GitHub repo (e.g. arcsight-ai/anchr-demo-monorepo)."
echo "  2. cd $OUTPUT_DIR"
echo "  3. git remote add origin https://github.com/arcsight-ai/anchr-demo-monorepo.git"
echo "  4. git push -u origin main"
echo "  5. git push origin verified-demo blocked-demo"
echo "  6. Open PR: verified-demo → main (VERIFIED; use this URL as DEMO_VERIFIED_PR_URL)."
echo "  7. Open PR: blocked-demo → main (BLOCKED; use this URL as DEMO_BLOCKED_PR_URL)."
echo "  8. If your PR numbers are not 1 and 2, set DEMO_VERIFIED_PR_URL and DEMO_BLOCKED_PR_URL in website/src/App.jsx."
echo ""
