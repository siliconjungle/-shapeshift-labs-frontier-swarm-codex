import path from 'node:path';
import {
  FRONTIER_SWARM_MERGE_BUNDLE_KIND,
  FRONTIER_SWARM_MERGE_BUNDLE_VERSION,
  type FrontierSwarmMergeBundle
} from '@shapeshift-labs/frontier-swarm';
import { isObject, uniqueStrings } from './common.js';
import {
  ignoredWorkspaceNoiseOnlyFailure,
  nonActionableFailedEvidence,
  ownershipReasonDetails
} from './collect-bundle-reasons.js';
import type { FrontierCodexPatchStaleness } from './collect-bundle-staleness.js';
import type { FrontierCodexCollectBucket } from './index.js';

export {
  bundlePatchStaleness
} from './collect-bundle-staleness.js';
export type {
  FrontierCodexPatchStaleness
} from './collect-bundle-staleness.js';
export {
  collectFailureReasonClasses,
  compactCollectFailureReasonClasses,
  ignoredWorkspaceNoiseOwnershipViolations,
  ignoredWorkspaceNoiseOwnershipViolationsForReasons,
  ignoredWorkspaceNoisePath,
  infrastructureNoiseFailureReasonClass,
  nonActionableFailedEvidence,
  sourceBlockerFailureReasonClass,
  sourceOwnershipViolations,
  sourceOwnershipViolationsForReasons
} from './collect-bundle-reasons.js';
export type {
  FrontierCodexCollectCompactReasonClass
} from './collect-bundle-reasons.js';

export function normalizeCollectedMergeBundle(value: unknown, mergePath: string): FrontierSwarmMergeBundle {
  const input = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const jobId = typeof input.jobId === 'string' && input.jobId ? input.jobId : path.basename(path.dirname(mergePath));
  const changedPaths = stringArray(input.changedPaths);
  const ownershipViolations = stringArray(input.ownershipViolations);
  const status = typeof input.status === 'string' ? input.status as FrontierSwarmMergeBundle['status'] : 'completed';
  const autoMergeable = Boolean(input.autoMergeable);
  const disposition = typeof input.disposition === 'string'
    ? input.disposition as FrontierSwarmMergeBundle['disposition']
    : autoMergeable ? 'auto-mergeable' : status === 'failed' ? 'rejected' : 'needs-port';
  const inputReasons = stringArray(input.reasons);
  const reasons = uniqueStrings([...inputReasons, ...ownershipReasonDetails(ownershipViolations, inputReasons)]);
  const bundle = {
    kind: typeof input.kind === 'string' ? input.kind as FrontierSwarmMergeBundle['kind'] : FRONTIER_SWARM_MERGE_BUNDLE_KIND,
    version: typeof input.version === 'number' ? input.version as FrontierSwarmMergeBundle['version'] : FRONTIER_SWARM_MERGE_BUNDLE_VERSION,
    id: typeof input.id === 'string' && input.id ? input.id : `swarm-merge-bundle:${jobId}`,
    ...(typeof input.runId === 'string' ? { runId: input.runId } : {}),
    ...(typeof input.planId === 'string' ? { planId: input.planId } : {}),
    jobId,
    ...(typeof input.taskId === 'string' ? { taskId: input.taskId } : {}),
    ...(typeof input.lane === 'string' ? { lane: input.lane } : {}),
    ...(typeof input.title === 'string' ? { title: input.title } : {}),
    generatedAt: typeof input.generatedAt === 'number' ? input.generatedAt : Date.now(),
    status,
    mergeReadiness: typeof input.mergeReadiness === 'string'
      ? input.mergeReadiness as FrontierSwarmMergeBundle['mergeReadiness']
      : changedPaths.length ? 'patch-candidate' : 'discovery-only',
    disposition,
    riskLevel: typeof input.riskLevel === 'string' ? input.riskLevel as FrontierSwarmMergeBundle['riskLevel'] : 'unknown',
    autoMergeable,
    changedPaths,
    changedRegions: stringArray(input.changedRegions),
    ownedFilesTouched: stringArray(input.ownedFilesTouched),
    allowedWrites: stringArray(input.allowedWrites),
    ownershipViolations,
    ...(typeof input.patchPath === 'string' ? { patchPath: input.patchPath } : {}),
    ...(typeof input.patchHash === 'string' ? { patchHash: input.patchHash } : {}),
    evidencePaths: stringArray(input.evidencePaths),
    commandsPassed: Array.isArray(input.commandsPassed) ? input.commandsPassed as FrontierSwarmMergeBundle['commandsPassed'] : [],
    commandsFailed: Array.isArray(input.commandsFailed) ? input.commandsFailed as FrontierSwarmMergeBundle['commandsFailed'] : [],
    traceShards: Array.isArray(input.traceShards) ? input.traceShards as FrontierSwarmMergeBundle['traceShards'] : [],
    queueItemIds: stringArray(input.queueItemIds),
    ...(typeof input.branchName === 'string' ? { branchName: input.branchName } : {}),
    ...(typeof input.commit === 'string' ? { commit: input.commit } : {}),
    staleAgainstHead: Boolean(input.staleAgainstHead),
    reasons,
    ...(isObject(input.semanticImport) ? { semanticImport: input.semanticImport as unknown as FrontierSwarmMergeBundle['semanticImport'] } : {}),
    ...(isObject(input.metadata) ? { metadata: input.metadata as FrontierSwarmMergeBundle['metadata'] } : {})
  } as FrontierSwarmMergeBundle;
  return bundle;
}

export function mergeRecordScore(record: { mergePath: string; bundle: FrontierSwarmMergeBundle }): number {
  return (record.mergePath.includes('/evidence/') ? 100 : 0)
    + record.bundle.changedPaths.length
    + record.bundle.evidencePaths.length
    + record.bundle.commandsPassed.length
    + record.bundle.commandsFailed.length;
}

export function classifyCodexCollectBucket(
  bundle: FrontierSwarmMergeBundle,
  staleAgainstHead: boolean,
  hasActionablePatch = Boolean(bundle.patchPath)
): FrontierCodexCollectBucket {
  if (staleAgainstHead) return 'stale-against-head';
  if (bundle.changedPaths.length > 0 && hasActionablePatch && (bundle.disposition === 'rejected' || bundle.commandsFailed.length > 0 || bundle.status === 'failed')) {
    return 'rerun-work';
  }
  if (bundle.ownershipViolations.length > 0 && bundle.changedPaths.length > 0 && hasActionablePatch) return 'rerun-work';
  if (nonActionableFailedEvidence(bundle, { staleAgainstHead, hasActionablePatch })) return 'needs-human-port';
  if (bundle.disposition === 'rejected' || bundle.disposition === 'blocked' || bundle.commandsFailed.length > 0 || bundle.status === 'failed') {
    if (ignoredWorkspaceNoiseOnlyFailure(bundle)) return 'needs-human-port';
    return 'failed-evidence';
  }
  if (bundle.disposition === 'auto-mergeable' && bundle.autoMergeable) return 'ready-to-apply';
  return 'needs-human-port';
}

export function normalizeCollectedStaleAgainstHead(
  bundle: FrontierSwarmMergeBundle,
  staleness: FrontierCodexPatchStaleness,
  checkStale: boolean
): boolean {
  const inheritedStale = bundle.staleAgainstHead || bundle.disposition === 'stale-against-head';
  if (!checkStale) return inheritedStale;
  if (staleness.stale) return true;
  if (staleness.fresh) return false;
  return inheritedStale;
}

export function normalizeCollectedDisposition(
  bundle: FrontierSwarmMergeBundle,
  staleAgainstHead: boolean,
  patchExists = Boolean(bundle.patchPath)
): FrontierSwarmMergeBundle['disposition'] {
  if (staleAgainstHead) return 'stale-against-head';
  if (nonActionableFailedEvidence(bundle, { staleAgainstHead, hasActionablePatch: patchExists })) return 'needs-port';
  if (ignoredWorkspaceNoiseOnlyFailure(bundle)) return 'needs-port';
  if (bundle.disposition === 'stale-against-head') return 'needs-port';
  return bundle.disposition;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}
