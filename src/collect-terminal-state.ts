import {
  createSwarmQueueOutcomeModel,
  reconcileSwarmTerminalState,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmQueueOutcomeDecisionInput,
  type FrontierSwarmQueueOutcomeModel,
  type FrontierSwarmTerminalStateCollectionsInput,
  type FrontierSwarmTerminalStateReconciliation
} from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_COLLECTION_KIND } from './constants.js';
import { uniqueStrings } from './common.js';
import { nonActionableFailedEvidence } from './collect-bundle-reasons.js';
import type {
  FrontierCodexCollectBucket,
  FrontierCodexCollectedBundle,
  FrontierCodexLandedHealthSummary
} from './types-collection.js';

export function createCodexCollectionQueueOutcomeModel(input: {
  runId: string;
  buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>;
  landedHealth?: FrontierCodexLandedHealthSummary;
  generatedAt: number;
}): FrontierSwarmQueueOutcomeModel {
  return createSwarmQueueOutcomeModel({
    decisions: createCodexCollectionQueueOutcomeDecisions(input),
    generatedAt: input.generatedAt,
    metadata: {
      source: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
      runId: input.runId
    }
  });
}

export function createCodexCollectionTerminalState(input: {
  buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>;
  queueOutcomeModel: FrontierSwarmQueueOutcomeModel;
  generatedAt: number;
}): FrontierSwarmTerminalStateReconciliation {
  return reconcileSwarmTerminalState({
    collections: createCodexCollectionTerminalStateCollections(input.buckets, input.generatedAt),
    outcomeModel: input.queueOutcomeModel,
    generatedAt: input.generatedAt,
    metadata: {
      source: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
      queueOutcomeModelId: input.queueOutcomeModel.id
    }
  });
}

function createCodexCollectionQueueOutcomeDecisions(input: {
  buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>;
  landedHealth?: FrontierCodexLandedHealthSummary;
  generatedAt: number;
}): FrontierSwarmQueueOutcomeDecisionInput[] {
  const landed = new Set(input.landedHealth?.landedJobIds ?? []);
  const committed = new Set(input.landedHealth?.committedJobIds ?? []);
  const applied = new Set(input.landedHealth?.appliedJobIds ?? []);
  const decisions: FrontierSwarmQueueOutcomeDecisionInput[] = [];
  for (const [bucket, entries] of Object.entries(input.buckets) as Array<[FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]]>) {
    for (const entry of entries) {
      const bundle = entry.bundle;
      const base = createCodexCollectionQueueOutcomeBase(bundle, entry, bucket, input.generatedAt);
      if (landed.has(bundle.jobId)) {
        const outcome = committed.has(bundle.jobId) ? 'committed' : applied.has(bundle.jobId) ? 'applied' : 'checked';
        decisions.push({ ...base, decision: outcome, category: 'terminal', outcome, terminal: true, reasons: ['landed by apply ledger'] });
      } else if (bucket === 'research-complete') {
        decisions.push({ ...base, decision: 'research-complete', category: 'terminal', outcome: 'research-complete', terminal: true, reasons: uniqueStrings(['research-complete', 'discovery-only', ...bundle.reasons]) });
      } else if (bucket === 'ready-to-apply') {
        decisions.push({ ...base, decision: 'ready', category: 'continuation', outcome: 'ready', terminal: false, reasons: bundle.reasons });
      } else if (bucket === 'needs-human-port') {
        if (codexCollectionBundleHasConflictSignal(bundle)) {
          decisions.push({
            ...base,
            decision: 'conflict-blocked',
            category: 'conflict',
            outcome: 'conflict-blocked',
            terminal: false,
            reasons: uniqueStrings(['conflict-blocked', ...bundle.reasons])
          });
        } else {
          decisions.push({ ...base, decision: 'needs-port', category: 'coordinator-review', outcome: 'needs-port', terminal: false, reasons: bundle.reasons });
        }
      } else if (bucket === 'rerun-work' || bucket === 'stale-against-head') {
        decisions.push({ ...base, decision: 'rerun', category: 'stale-rerun', outcome: 'rerun', terminal: true, reasons: bundle.reasons });
      } else if (bucket === 'failed-evidence' && codexCollectionBundleIsNoChange(bundle)) {
        decisions.push({ ...base, decision: 'no-change', category: 'terminal', outcome: 'no-change', terminal: true, reasons: uniqueStrings(['no-change', ...bundle.reasons]) });
      } else {
        decisions.push({ ...base, decision: 'rejected', category: 'terminal', outcome: 'rejected', terminal: true, reasons: bundle.reasons });
      }
    }
  }
  return decisions;
}

function createCodexCollectionQueueOutcomeBase(
  bundle: FrontierSwarmMergeBundle,
  entry: FrontierCodexCollectedBundle,
  bucket: FrontierCodexCollectBucket,
  generatedAt: number
): Partial<FrontierSwarmQueueOutcomeDecisionInput> {
  return {
    subjectId: codexCollectionSubjectId(bundle),
    subjectAliases: codexCollectionSubjectAliases(bundle),
    jobId: bundle.jobId,
    ...(bundle.taskId ? { taskId: bundle.taskId } : {}),
    queueItemIds: [...bundle.queueItemIds],
    ...(bundle.lane ? { lane: bundle.lane } : {}),
    disposition: bundle.disposition,
    mergeReadiness: bundle.mergeReadiness,
    status: bundle.status,
    generatedAt,
    metadata: {
      source: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
      bucket,
      generatedByCollector: entry.generatedByCollector === true,
      patchPath: entry.patchPath ?? bundle.patchPath
    }
  };
}

function createCodexCollectionTerminalStateCollections(
  buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>,
  generatedAt: number
): FrontierSwarmTerminalStateCollectionsInput {
  const collections: Record<string, Array<{
    id: string;
    subjectId: string;
    subjectAliases: string[];
    jobId: string;
    taskId?: string;
    queueItemIds: string[];
    bucket: FrontierCodexCollectBucket;
    status: string;
    generatedAt: number;
    metadata: Record<string, unknown>;
  }>> = {};
  for (const [bucket, entries] of Object.entries(buckets) as Array<[FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]]>) {
    collections[bucket] = entries.map((entry) => {
      const bundle = entry.bundle;
      return {
        id: `codex-collection:${bucket}:${bundle.jobId}`,
        subjectId: codexCollectionSubjectId(bundle),
        subjectAliases: codexCollectionSubjectAliases(bundle),
        jobId: bundle.jobId,
        ...(bundle.taskId ? { taskId: bundle.taskId } : {}),
        queueItemIds: [...bundle.queueItemIds],
        bucket,
        status: bundle.status,
        generatedAt: bundle.generatedAt ?? generatedAt,
        metadata: {
          disposition: bundle.disposition,
          mergeReadiness: bundle.mergeReadiness,
          staleAgainstHead: bundle.staleAgainstHead,
          generatedByCollector: entry.generatedByCollector === true,
          patchPath: entry.patchPath ?? bundle.patchPath
        }
      };
    });
  }
  return collections;
}

function codexCollectionSubjectId(bundle: FrontierSwarmMergeBundle): string {
  return bundle.taskId ?? bundle.queueItemIds[0] ?? bundle.jobId;
}

function codexCollectionSubjectAliases(bundle: FrontierSwarmMergeBundle): string[] {
  return uniqueStrings([
    bundle.jobId,
    `job:${bundle.jobId}`,
    ...(bundle.taskId ? [bundle.taskId, `task:${bundle.taskId}`] : []),
    ...bundle.queueItemIds,
    ...bundle.queueItemIds.map((id) => `queue:${id}`)
  ]);
}

function codexCollectionBundleIsNoChange(bundle: FrontierSwarmMergeBundle): boolean {
  return nonActionableFailedEvidence(bundle, {
    staleAgainstHead: bundle.staleAgainstHead,
    hasActionablePatch: Boolean(bundle.patchPath)
  });
}

function codexCollectionBundleHasConflictSignal(bundle: FrontierSwarmMergeBundle): boolean {
  return [
    bundle.disposition,
    bundle.mergeReadiness,
    bundle.status,
    ...bundle.reasons,
    ...bundle.ownershipViolations
  ].some((signal) => typeof signal === 'string' && normalizedTerminalSignal(signal).includes('conflict'));
}

function normalizedTerminalSignal(signal: string): string {
  return signal.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
