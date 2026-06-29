import {
  analyzeCorrelatedWork,
  type FrontierMergeMetricCorrelatedWorkReport,
  type FrontierMergeMetricWorkEvent,
  type FrontierMergeMetricWorkOutcome,
  type FrontierMergeMetricWorkRegion,
  type FrontierMergeMetricWorkRegionKind
} from '@shapeshift-labs/frontier-merge-metrics';
import type {
  FrontierSwarmMergeBundle,
  FrontierSwarmMergeIndex,
  FrontierSwarmMergeIndexEntry
} from '@shapeshift-labs/frontier-swarm';

export const FRONTIER_SWARM_CODEX_MERGE_METRICS_FEEDBACK_FILE = 'merge-metrics-feedback.json';
export const FRONTIER_SWARM_CODEX_MERGE_METRICS_FEEDBACK_KIND = 'frontier.swarm-codex.merge-metrics-feedback';
export const FRONTIER_SWARM_CODEX_MERGE_METRICS_FEEDBACK_VERSION = 1;

export interface FrontierCodexMergeMetricsFeedback {
  kind: typeof FRONTIER_SWARM_CODEX_MERGE_METRICS_FEEDBACK_KIND;
  version: typeof FRONTIER_SWARM_CODEX_MERGE_METRICS_FEEDBACK_VERSION;
  generatedAt: number;
  runId: string;
  eventCount: number;
  events: FrontierMergeMetricWorkEvent[];
  report: FrontierMergeMetricCorrelatedWorkReport;
  semanticLeaseHints: Array<{ leaseKey: string; regionKeys: string[]; severity: 'low' | 'medium' | 'high'; reason: string }>;
  taskSplitHints: Array<{ regionKeys: string[]; severity: 'low' | 'medium' | 'high'; reason: string; taskHint?: string }>;
  routingHints: Array<{ action: string; severity: 'low' | 'medium' | 'high'; regionKeys: string[]; reason: string; taskHint?: string }>;
  feedback: FrontierMergeMetricCorrelatedWorkReport['feedback'];
  summary: {
    eventCount: number;
    correlatedRegionCount: number;
    correlatedPairCount: number;
    suggestionCount: number;
    highSeveritySuggestionCount: number;
    preferredLeaseKeyCount: number;
    avoidConcurrentRegionKeyCount: number;
    splitTaskRegionKeyCount: number;
    refactorCandidateRegionKeyCount: number;
  };
}

export function createCodexMergeMetricsFeedback(input: {
  runId: string;
  bundles: readonly FrontierSwarmMergeBundle[];
  mergeIndex: FrontierSwarmMergeIndex;
  generatedAt: number;
}): FrontierCodexMergeMetricsFeedback {
  const events = createCodexMergeMetricWorkEvents(input);
  const report = analyzeCorrelatedWork({ events }, { generatedAt: new Date(input.generatedAt).toISOString() });
  const semanticLeaseHints = report.suggestions
    .filter((suggestion) => suggestion.action === 'lease' || suggestion.leaseKeys?.length)
    .flatMap((suggestion) => {
      const leaseKeys = suggestion.leaseKeys?.length ? suggestion.leaseKeys : suggestion.regionKeys;
      return leaseKeys.map((leaseKey) => ({
        leaseKey,
        regionKeys: [...suggestion.regionKeys],
        severity: suggestion.severity,
        reason: suggestion.reason
      }));
    });
  const taskSplitHints = report.suggestions
    .filter((suggestion) => suggestion.action === 'split-task' || suggestion.action === 'route')
    .map((suggestion) => ({
      regionKeys: [...suggestion.regionKeys],
      severity: suggestion.severity,
      reason: suggestion.reason,
      ...(suggestion.taskHint ? { taskHint: suggestion.taskHint } : {})
    }));
  const routingHints = report.suggestions.map((suggestion) => ({
    action: suggestion.action,
    severity: suggestion.severity,
    regionKeys: [...suggestion.regionKeys],
    reason: suggestion.reason,
    ...(suggestion.taskHint ? { taskHint: suggestion.taskHint } : {})
  }));
  return {
    kind: FRONTIER_SWARM_CODEX_MERGE_METRICS_FEEDBACK_KIND,
    version: FRONTIER_SWARM_CODEX_MERGE_METRICS_FEEDBACK_VERSION,
    generatedAt: input.generatedAt,
    runId: input.runId,
    eventCount: events.length,
    events,
    report,
    semanticLeaseHints,
    taskSplitHints,
    routingHints,
    feedback: report.feedback,
    summary: {
      eventCount: report.summary.eventCount,
      correlatedRegionCount: report.summary.correlatedRegionCount,
      correlatedPairCount: report.summary.correlatedPairCount,
      suggestionCount: report.summary.suggestionCount,
      highSeveritySuggestionCount: report.summary.highSeveritySuggestionCount,
      preferredLeaseKeyCount: report.feedback.preferredLeaseKeys.length,
      avoidConcurrentRegionKeyCount: report.feedback.avoidConcurrentRegionKeys.length,
      splitTaskRegionKeyCount: report.feedback.splitTaskRegionKeys.length,
      refactorCandidateRegionKeyCount: report.feedback.refactorCandidateRegionKeys.length
    }
  };
}

function createCodexMergeMetricWorkEvents(input: {
  runId: string;
  bundles: readonly FrontierSwarmMergeBundle[];
  mergeIndex: FrontierSwarmMergeIndex;
  generatedAt: number;
}): FrontierMergeMetricWorkEvent[] {
  const completedAt = new Date(input.generatedAt).toISOString();
  const entriesByJob = new Map(input.mergeIndex.entries.map((entry) => [entry.jobId, entry]));
  return input.bundles.map((bundle) => {
    const entry = entriesByJob.get(bundle.jobId);
    const metadata = {
      mergeBundleId: bundle.id,
      disposition: entry?.disposition ?? bundle.disposition,
      mergeReadiness: entry?.mergeReadiness ?? bundle.mergeReadiness,
      riskLevel: entry?.riskLevel ?? bundle.riskLevel,
      staleAgainstHead: entry?.staleAgainstHead ?? bundle.staleAgainstHead,
      autoMergeable: entry?.autoMergeable ?? bundle.autoMergeable,
      conflictingJobIds: entry?.conflictingJobIds ?? []
    };
    return {
      id: `codex-merge-metric-event:${bundle.jobId}`,
      runId: input.runId,
      ...(bundle.taskId ? { taskId: bundle.taskId } : {}),
      jobId: bundle.jobId,
      ...(bundle.branchName ? { agentId: bundle.branchName } : {}),
      ...(bundle.lane ? { lane: bundle.lane } : {}),
      ...(bundle.commit ? { headRef: bundle.commit } : {}),
      completedAt,
      changedPaths: [...bundle.changedPaths],
      changedRegions: codexMergeMetricRegions(bundle.changedRegions, bundle.changedPaths),
      outcome: entry ? codexMergeMetricOutcomeFromEntry(entry) : codexMergeMetricOutcomeFromBundle(bundle),
      evidenceRefs: [...bundle.evidencePaths],
      metadata
    };
  });
}

function codexMergeMetricOutcomeFromBundle(bundle: FrontierSwarmMergeBundle): FrontierMergeMetricWorkOutcome {
  if (bundle.staleAgainstHead || bundle.disposition === 'stale-against-head') return 'stale';
  if (bundle.commandsFailed.length > 0) return 'gate-failed';
  if (bundle.ownershipViolations.length > 0) return 'rejected';
  if (bundle.disposition === 'rejected' || bundle.disposition === 'blocked') return 'rejected';
  if (bundle.disposition === 'needs-port') return 'human-needed';
  if (bundle.disposition === 'discovery-only') return 'research-complete';
  if (bundle.patchPath === undefined && bundle.changedPaths.length === 0 && bundle.changedRegions.length === 0) return 'no-change';
  if (bundle.autoMergeable) return 'clean-apply';
  return 'unknown';
}

function codexMergeMetricOutcomeFromEntry(entry: FrontierSwarmMergeIndexEntry): FrontierMergeMetricWorkOutcome {
  if (entry.staleAgainstHead || entry.disposition === 'stale-against-head' || entry.patchStatus === 'stale') return 'stale';
  if (entry.conflictingJobIds.length > 0) return 'conflict';
  if (entry.ownershipViolations.length > 0 || entry.disposition === 'rejected' || entry.disposition === 'blocked') return 'rejected';
  if (entry.disposition === 'needs-port') return 'human-needed';
  if (entry.disposition === 'discovery-only') return 'research-complete';
  if (entry.patchStatus === 'failed-check') return 'gate-failed';
  if (entry.autoMergeable) return 'clean-apply';
  return 'unknown';
}

function codexMergeMetricRegions(regions: readonly string[], paths: readonly string[]): FrontierMergeMetricWorkRegion[] {
  const semanticRegions = regions.map((region) => codexMergeMetricRegionFromSwarmRegion(region));
  const fileRegions = paths.map((file) => ({ kind: 'file' as const, file, key: `file|file=${file}` }));
  const byKey = new Map<string, FrontierMergeMetricWorkRegion>();
  for (const region of [...semanticRegions, ...fileRegions]) byKey.set(region.key ?? JSON.stringify(region), region);
  return Array.from(byKey.values()).sort((left, right) => String(left.key ?? '').localeCompare(String(right.key ?? '')));
}

function codexMergeMetricRegionFromSwarmRegion(region: string): FrontierMergeMetricWorkRegion {
  const marker = '#semanticOwnershipRegion:';
  const markerIndex = region.indexOf(marker);
  const file = markerIndex >= 0 ? region.slice(0, markerIndex) : undefined;
  const stableKey = markerIndex >= 0 ? region.slice(markerIndex + marker.length) : region;
  const kind = codexMergeMetricRegionKind(stableKey);
  const symbol = codexMergeMetricRegionSymbol(stableKey);
  return {
    key: region,
    kind,
    ...(file ? { file } : {}),
    ...(symbol ? { symbol } : {}),
    leaseKey: `merge:semantic:${region}`
  };
}

function codexMergeMetricRegionKind(stableKey: string): FrontierMergeMetricWorkRegionKind {
  const normalized = stableKey.toLowerCase();
  if (normalized.includes('css-selector') || normalized.includes('selector')) return 'css-selector';
  if (normalized.includes('custom-property')) return 'css-custom-property';
  if (normalized.includes('html') || normalized.includes('element')) return 'html-element';
  if (normalized.startsWith('export') || normalized.includes(':export:')) return 'export';
  if (normalized.startsWith('type') || normalized.includes(':type:') || normalized.includes('interface')) return 'type';
  if (normalized.includes('class')) return 'class';
  if (normalized.includes('method')) return 'method';
  if (normalized.includes('function')) return 'function';
  if (normalized.includes('test')) return 'test';
  if (normalized.includes('fixture')) return 'fixture-family';
  if (normalized.includes('public') || normalized.includes('api')) return 'public-api';
  if (normalized.includes('package')) return 'package';
  return 'semantic-region';
}

function codexMergeMetricRegionSymbol(stableKey: string): string | undefined {
  const parts = stableKey.split(':').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) return undefined;
  return parts[parts.length - 1];
}
