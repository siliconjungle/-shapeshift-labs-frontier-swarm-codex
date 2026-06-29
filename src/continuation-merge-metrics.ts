import {
  createSwarmModelRoutingFeedback,
  type FrontierSwarmBacklogEntryInput,
  type FrontierSwarmModelRoutingFeedback
} from '@shapeshift-labs/frontier-swarm';
import { isObject, readStringArray, uniqueStrings } from './common.js';
import type { FrontierCodexCollectResult } from './types-collection.js';

export interface FrontierCodexContinuationMergeMetricsFeedback {
  routingFeedback: FrontierSwarmModelRoutingFeedback[];
  backlogEntries: FrontierSwarmBacklogEntryInput[];
  summary: {
    eventCount: number;
    correlatedRegionCount: number;
    suggestionCount: number;
    highSeveritySuggestionCount: number;
    routingFeedbackCount: number;
    backlogEntryCount: number;
    semanticLeaseBacklogEntryCount: number;
    taskSplitBacklogEntryCount: number;
    preferredLeaseKeyCount: number;
    splitTaskRegionKeyCount: number;
  };
}

export function createContinuationMergeMetricsFeedback(input: {
  collection?: FrontierCodexCollectResult;
  repository: string;
  packageName?: string;
  generatedAt: number;
}): FrontierCodexContinuationMergeMetricsFeedback {
  const feedback = input.collection?.mergeMetricsFeedback;
  if (!feedback || feedback.summary.eventCount === 0 && feedback.summary.suggestionCount === 0) return emptyMergeMetricsFeedback();
  const regions = mergeMetricRegionsByKey(feedback);
  const semanticLeaseEntries = feedback.semanticLeaseHints.slice(0, 4).map((hint, index) => mergeMetricBacklogEntry({
    id: `lease-${index + 1}-${slug(hint.leaseKey)}`,
    title: `Claim semantic lease for ${mergeMetricHintLabel(hint.regionKeys, regions)}`,
    workKind: 'semantic-merge-lease',
    lane: mergeMetricHintLane(hint.regionKeys, regions),
    targetRefs: mergeMetricHintPaths(hint.regionKeys, regions),
    tags: ['merge-metrics', 'semantic-lease', hint.severity],
    objective: `Acquire or serialize the semantic lease ${hint.leaseKey} before scheduling more concurrent work in this region.`,
    acceptance: [`Required lease key is recorded: ${hint.leaseKey}`, 'Next work is routed through the narrowed semantic region.'],
    metadata: { hintKind: 'semantic-lease', leaseKey: hint.leaseKey, regionKeys: hint.regionKeys, severity: hint.severity, reason: hint.reason }
  }));
  const taskSplitEntries = feedback.taskSplitHints.slice(0, 4).map((hint, index) => mergeMetricBacklogEntry({
    id: `split-${index + 1}-${slug(hint.regionKeys.join('-'))}`,
    title: `Split correlated work for ${mergeMetricHintLabel(hint.regionKeys, regions)}`,
    workKind: 'semantic-merge-task-split',
    lane: mergeMetricHintLane(hint.regionKeys, regions),
    targetRefs: mergeMetricHintPaths(hint.regionKeys, regions),
    tags: ['merge-metrics', 'task-split', hint.severity],
    objective: hint.taskHint ?? `Split future work across ${hint.regionKeys.length} correlated semantic regions before launching another broad worker.`,
    acceptance: ['A narrower task plan exists for each correlated region.', 'Follow-up work declares the required semantic lease keys.'],
    metadata: { hintKind: 'task-split', regionKeys: hint.regionKeys, severity: hint.severity, reason: hint.reason, ...(hint.taskHint ? { taskHint: hint.taskHint } : {}) }
  }));
  const routingFeedback = feedback.routingHints.slice(0, 8).map((hint, index) => createSwarmModelRoutingFeedback({
    id: `swarm-model-routing-feedback:merge-metrics:${index + 1}:${slug(hint.regionKeys.join('-'))}`,
    scope: input.packageName ? 'package' : 'repository',
    repository: input.repository,
    package: input.packageName,
    runId: feedback.runId,
    lane: mergeMetricHintLane(hint.regionKeys, regions) ?? 'global',
    resultStatus: `merge-metrics:${hint.action}`,
    riskLevel: hint.severity,
    evidenceQuality: { band: 'adequate', score: hint.severity === 'high' ? 0.9 : hint.severity === 'medium' ? 0.65 : 0.4, confidence: hint.severity, deterministic: true, verifierKinds: ['merge-metrics'] },
    selected: false,
    tags: uniqueStrings(['merge-metrics', hint.action, hint.severity]),
    generatedAt: input.generatedAt,
    metadata: { source: 'frontier-swarm-codex.continuation-merge-metrics', action: hint.action, regionKeys: hint.regionKeys, reason: hint.reason, ...(hint.taskHint ? { taskHint: hint.taskHint } : {}) }
  }));
  const backlogEntries = [...semanticLeaseEntries, ...taskSplitEntries];
  return {
    routingFeedback,
    backlogEntries,
    summary: {
      eventCount: feedback.summary.eventCount,
      correlatedRegionCount: feedback.summary.correlatedRegionCount,
      suggestionCount: feedback.summary.suggestionCount,
      highSeveritySuggestionCount: feedback.summary.highSeveritySuggestionCount,
      routingFeedbackCount: routingFeedback.length,
      backlogEntryCount: backlogEntries.length,
      semanticLeaseBacklogEntryCount: semanticLeaseEntries.length,
      taskSplitBacklogEntryCount: taskSplitEntries.length,
      preferredLeaseKeyCount: feedback.summary.preferredLeaseKeyCount,
      splitTaskRegionKeyCount: feedback.summary.splitTaskRegionKeyCount
    }
  };
}

function emptyMergeMetricsFeedback(): FrontierCodexContinuationMergeMetricsFeedback {
  return { routingFeedback: [], backlogEntries: [], summary: { eventCount: 0, correlatedRegionCount: 0, suggestionCount: 0, highSeveritySuggestionCount: 0, routingFeedbackCount: 0, backlogEntryCount: 0, semanticLeaseBacklogEntryCount: 0, taskSplitBacklogEntryCount: 0, preferredLeaseKeyCount: 0, splitTaskRegionKeyCount: 0 } };
}

function mergeMetricBacklogEntry(input: Omit<FrontierSwarmBacklogEntryInput, 'id' | 'entryKind' | 'status' | 'priority'> & { id: string; metadata: Record<string, unknown>; tags: string[] }): FrontierSwarmBacklogEntryInput {
  const severity = String(input.metadata.severity ?? 'low');
  return { ...input, id: `merge-metrics-${input.id}`, entryKind: 'chore', status: 'ready', priority: severity === 'high' ? 90 : severity === 'medium' ? 60 : 30, metadata: { ...input.metadata, source: 'frontier-swarm-codex.continuation-merge-metrics' } };
}

function mergeMetricRegionsByKey(feedback: FrontierCodexCollectResult['mergeMetricsFeedback']): Map<string, Record<string, unknown>> {
  const rows = Array.isArray(feedback.report.regions) ? feedback.report.regions : [];
  return new Map(rows.map((region) => [String(region.key), region as unknown as Record<string, unknown>]));
}

function mergeMetricHintLabel(regionKeys: readonly string[], regions: Map<string, Record<string, unknown>>): string {
  const labels = regionKeys.map((key) => String(regions.get(key)?.label ?? regions.get(key)?.symbol ?? key)).filter(Boolean);
  return labels.slice(0, 2).join(', ') || 'semantic region';
}

function mergeMetricHintLane(regionKeys: readonly string[], regions: Map<string, Record<string, unknown>>): string | undefined {
  for (const key of regionKeys) {
    const lanes = readStringArray(regions.get(key)?.lanes);
    if (lanes[0]) return lanes[0];
  }
  return undefined;
}

function mergeMetricHintPaths(regionKeys: readonly string[], regions: Map<string, Record<string, unknown>>): string[] {
  return uniqueStrings(regionKeys.flatMap((key) => {
    const region = regions.get(key);
    return isObject(region) ? [...readStringArray(region.paths), String(region.file ?? '')] : [];
  }));
}

function slug(value: string): string {
  const clean = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return clean.slice(0, 48) || 'region';
}
