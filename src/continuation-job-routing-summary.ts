import type { FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexContinuationResult } from './types-continuation.js';

export function summarizeNextJobRouting(jobs: readonly FrontierSwarmJob[]): FrontierCodexContinuationResult['summary']['nextJobRouting'] {
  const routed = jobs
    .map((job) => ({ job, route: readModelRouteMetadata(job) }))
    .filter((entry): entry is { job: FrontierSwarmJob; route: Record<string, unknown> } => !!entry.route);
  const changed = routed.filter((entry) => {
    const fallback = stringValue(entry.route.fallbackComputeId);
    const selected = stringValue(entry.route.selectedComputeId);
    return !!fallback && !!selected && fallback !== selected;
  });
  return {
    routedJobCount: routed.length,
    changedComputeCount: changed.length,
    policyFeedbackMatchCount: routed.reduce((sum, entry) => sum + numberValue(readRouteSummaryValue(entry.route, 'routingPolicyFeedbackCount')), 0),
    policyCostSignalCount: routed.reduce((sum, entry) => sum + numberValue(readRouteSummaryValue(entry.route, 'routingPolicyCostSignalCount')), 0),
    policyPreferenceMatchCount: routed.reduce((sum, entry) => sum + numberValue(readRouteSummaryValue(entry.route, 'routingPolicyPreferenceCount')), 0),
    selectedComputeCounts: countByString(routed.map((entry) => stringValue(entry.route.selectedComputeId)).filter((entry): entry is string => !!entry)),
    fallbackComputeCounts: countByString(routed.map((entry) => stringValue(entry.route.fallbackComputeId)).filter((entry): entry is string => !!entry)),
    routedJobIds: routed.map((entry) => entry.job.id),
    changedComputeJobIds: changed.map((entry) => entry.job.id)
  };
}

function readModelRouteMetadata(job: FrontierSwarmJob): Record<string, unknown> | undefined {
  const metadata = job.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const route = (metadata as Record<string, unknown>).modelRoute;
  return route && typeof route === 'object' && !Array.isArray(route) ? route as Record<string, unknown> : undefined;
}

function readRouteSummaryValue(route: Record<string, unknown>, key: string): unknown {
  const summary = route.summary;
  return summary && typeof summary === 'object' && !Array.isArray(summary)
    ? (summary as Record<string, unknown>)[key]
    : undefined;
}

function countByString(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
