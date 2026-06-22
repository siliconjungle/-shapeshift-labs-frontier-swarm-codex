import { createSwarmCoordinatorDashboard } from '@shapeshift-labs/frontier-swarm';
import { isObject } from './common.js';
import {
  mergeHumanActionsForProjection,
  modelTelemetrySummaryDashboardFields,
  readCodexRuntimeProjectionArtifacts
} from './runtime-projections.js';

export function attachRuntimeProjectionMetadata(
  dashboard: ReturnType<typeof createSwarmCoordinatorDashboard>,
  runtimeProjections: Awaited<ReturnType<typeof readCodexRuntimeProjectionArtifacts>>
): void {
  const mutable = dashboard as ReturnType<typeof createSwarmCoordinatorDashboard> & {
    summary: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
  const metadata = isObject(mutable.metadata) ? mutable.metadata : {};
  const existingHumanActions: Record<string, unknown>[] = Array.isArray(metadata.humanActions)
    ? metadata.humanActions.filter(isObject) as Record<string, unknown>[]
    : [];
  const brokerHumanActions = runtimeProjections.humanActionState?.actions ?? [];
  mutable.summary = {
    ...mutable.summary,
    ...modelTelemetrySummaryDashboardFields(runtimeProjections.modelTelemetrySummary),
    ...(runtimeProjections.humanActionState ? {
      humanActionBrokerActionCount: runtimeProjections.humanActionState.actionCount,
      humanActionBrokerOpenCount: runtimeProjections.humanActionState.openActionCount,
      humanActionBrokerDismissedCount: runtimeProjections.humanActionState.dismissedActionCount
    } : {})
  };
  const nextMetadata: Record<string, unknown> = {
    ...metadata,
    runtimeProjectionPaths: { ...runtimeProjections.paths },
    artifactPaths: {
      ...(isObject(metadata.artifactPaths) ? metadata.artifactPaths : {}),
      ...(runtimeProjections.paths.modelTelemetryPath ? { modelTelemetry: runtimeProjections.paths.modelTelemetryPath } : {}),
      ...(runtimeProjections.paths.modelTelemetrySummaryPath ? { modelTelemetrySummary: runtimeProjections.paths.modelTelemetrySummaryPath } : {}),
      ...(runtimeProjections.paths.humanActionEventsPath ? { humanActionEvents: runtimeProjections.paths.humanActionEventsPath } : {}),
      ...(runtimeProjections.paths.humanActionStatePath ? { humanActionState: runtimeProjections.paths.humanActionStatePath } : {})
    },
    ...(runtimeProjections.modelTelemetrySummary ? { modelTelemetrySummary: runtimeProjections.modelTelemetrySummary } : {}),
    ...(runtimeProjections.humanActionState ? {
      humanActionState: runtimeProjections.humanActionState,
      humanActions: mergeHumanActionsForProjection(existingHumanActions, brokerHumanActions)
    } : {})
  };
  mutable.metadata = nextMetadata as typeof mutable.metadata;
}
