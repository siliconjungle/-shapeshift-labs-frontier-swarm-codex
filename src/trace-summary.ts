import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexTraceSummary } from './index.js';
import { isObject, nonNegativeNumber } from './common.js';


export function codexJobTraceSummary(job: unknown): FrontierCodexTraceSummary | undefined {
  if (!isObject(job) || !isObject(job.traceSummary)) return undefined;
  return normalizeCodexTraceSummary(job.traceSummary);
}


export function codexBundleTraceSummary(bundle: FrontierSwarmMergeBundle): FrontierCodexTraceSummary {
  const traceShards = isObject(bundle) && Array.isArray((bundle as Record<string, unknown>).traceShards)
    ? (bundle as Record<string, unknown>).traceShards as unknown[]
    : [];
  return summarizeCodexTraceShards(traceShards);
}


export function summarizeCodexTraceSummaries(summaries: readonly FrontierCodexTraceSummary[]): FrontierCodexTraceSummary {
  return {
    shardCount: summaries.reduce((sum, entry) => sum + entry.shardCount, 0),
    rowWindowCount: summaries.reduce((sum, entry) => sum + entry.rowWindowCount, 0),
    hypothesisCount: summaries.reduce((sum, entry) => sum + entry.hypothesisCount, 0),
    executableOwnershipRegionCount: summaries.reduce((sum, entry) => sum + entry.executableOwnershipRegionCount, 0),
    focusedTestCount: summaries.reduce((sum, entry) => sum + entry.focusedTestCount, 0),
    referenceEvidenceCount: summaries.reduce((sum, entry) => sum + entry.referenceEvidenceCount, 0),
    divergenceCount: summaries.reduce((sum, entry) => sum + entry.divergenceCount, 0),
    openDivergenceCount: summaries.reduce((sum, entry) => sum + entry.openDivergenceCount, 0)
  };
}


function normalizeCodexTraceSummary(input: Record<string, unknown>): FrontierCodexTraceSummary {
  return {
    shardCount: nonNegativeNumber(input.shardCount),
    rowWindowCount: nonNegativeNumber(input.rowWindowCount),
    hypothesisCount: nonNegativeNumber(input.hypothesisCount),
    executableOwnershipRegionCount: nonNegativeNumber(input.executableOwnershipRegionCount),
    focusedTestCount: nonNegativeNumber(input.focusedTestCount),
    referenceEvidenceCount: nonNegativeNumber(input.referenceEvidenceCount),
    divergenceCount: nonNegativeNumber(input.divergenceCount),
    openDivergenceCount: nonNegativeNumber(input.openDivergenceCount)
  };
}


function summarizeCodexTraceShards(shards: readonly unknown[]): FrontierCodexTraceSummary {
  return {
    shardCount: shards.length,
    rowWindowCount: shards.reduce<number>((sum, shard) => sum + traceArrayLength(shard, 'rowWindows'), 0),
    hypothesisCount: shards.reduce<number>((sum, shard) => sum + traceArrayLength(shard, 'hypotheses'), 0),
    executableOwnershipRegionCount: shards.reduce<number>((sum, shard) => sum + traceArrayLength(shard, 'executableOwnershipRegions'), 0),
    focusedTestCount: shards.reduce<number>((sum, shard) => sum + traceArrayLength(shard, 'focusedTests'), 0),
    referenceEvidenceCount: shards.reduce<number>((sum, shard) => sum + traceArrayLength(shard, 'referenceEvidence'), 0),
    divergenceCount: shards.filter((shard) => isObject(shard) && Boolean(shard.divergence)).length,
    openDivergenceCount: shards.filter(traceShardHasOpenDivergence).length
  };
}


function traceArrayLength(shard: unknown, key: string): number {
  return isObject(shard) && Array.isArray(shard[key]) ? (shard[key] as unknown[]).length : 0;
}


function traceShardHasOpenDivergence(shard: unknown): boolean {
  if (!isObject(shard)) return false;
  const divergence = isObject(shard.divergence) ? shard.divergence : undefined;
  return shard.status === 'failed'
    || divergence?.status === 'failed'
    || divergence?.severity === 'error'
    || divergence?.severity === 'critical';
}
