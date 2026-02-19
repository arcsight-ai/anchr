#!/usr/bin/env bash
# ArcSight/anchr demo — run locally to verify the pipeline.
set -e
cd "$(dirname "$0")/.."

echo "=== 1. Tests ==="
npm test -- --silent 2>/dev/null || npm test 2>&1 | tail -6
echo ""

echo "=== 2. Structural audit (writes artifacts/anchr-report.json) ==="
mkdir -p artifacts
npm run structural 2>&1
echo ""

echo "=== 3. Decision (reads report, writes policy) ==="
npm run decision 2>&1
echo ""

echo "=== 4. Local explain (file outside packages/) ==="
npx tsx scripts/cli.ts explain scripts/cli.ts 2>&1
echo ""

echo "=== 5. Classify + recommend + intent from report ==="
npx tsx scripts/demo-report.ts 2>&1
echo ""

echo "Demo done."
echo "  - Full audit on your changes: npx anchr   (or: npx anchr --all for branch)"
echo "  - Explain a file:             npx anchr explain <file> [--full]"
echo "  - PR flow runs in GitHub Actions (status, comment, inline review)."
