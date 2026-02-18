/**
 * Determine correct ownership from dependency direction.
 */

export function inferOwner(
  sourcePkg: string,
  targetPkg: string,
  allBoundaries: { sourcePkg: string; targetPkg: string }[],
): "target" | "source" | "mutual" {
  const hasSourceToTarget = allBoundaries.some(
    (b) => b.sourcePkg === sourcePkg && b.targetPkg === targetPkg,
  );
  const hasTargetToSource = allBoundaries.some(
    (b) => b.sourcePkg === targetPkg && b.targetPkg === sourcePkg,
  );

  if (hasSourceToTarget && hasTargetToSource) return "mutual";
  if (hasSourceToTarget) return "target";
  if (hasTargetToSource) return "source";

  return "target";
}
