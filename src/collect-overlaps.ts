import type { FrontierSwarmCoordinatorDashboard } from '@shapeshift-labs/frontier-swarm';

export function attachSemanticPatchBundleOverlaps(
  dashboard: FrontierSwarmCoordinatorDashboard,
  compactDashboard: unknown,
  semanticPatchBundleOverlaps: unknown
): void {
  const mutableDashboard = dashboard as FrontierSwarmCoordinatorDashboard & { metadata?: Record<string, unknown> };
  const dashboardMetadata = mutableDashboard as unknown as { metadata?: Record<string, unknown> };
  (mutableDashboard.summary as Record<string, unknown>).semanticPatchBundleOverlaps = semanticPatchBundleOverlaps;
  dashboardMetadata.metadata = { ...(dashboardMetadata.metadata ?? {}), semanticPatchBundleOverlaps };
  (compactDashboard as Record<string, unknown>).semanticPatchBundleOverlaps = semanticPatchBundleOverlaps;
}
