import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmCoordinatorDashboard } from '@shapeshift-labs/frontier-swarm';
import { isObject, pathExists, uniqueStrings } from './common.js';
import type {
  FrontierCodexApplyLedgerSummary,
  FrontierCodexApplyResult,
  FrontierCodexCollectBucket,
  FrontierCodexCollectedBundle,
  FrontierCodexCollectQualitySignals,
  FrontierCodexLandedHealthSummary
} from './index.js';

const COLLECT_BUCKETS: readonly FrontierCodexCollectBucket[] = [
  'ready-to-apply',
  'needs-human-port',
  'rerun-work',
  'failed-evidence',
  'stale-against-head'
];

export async function readApplyLedgerSummary(collectionDir: string): Promise<FrontierCodexApplyLedgerSummary | undefined> {
  const candidates = [
    path.join(collectionDir, 'apply-ledger', 'apply-ledger.json'),
    path.join(collectionDir, 'apply-ledger.json')
  ];
  for (const candidate of candidates) {
    if (!await pathExists(candidate)) continue;
    const ledger = JSON.parse(await fs.readFile(candidate, 'utf8')) as FrontierCodexApplyResult;
    return summarizeApplyLedger(ledger, candidate);
  }
  return undefined;
}

export function attachApplyLedgerSummary(
  dashboard: FrontierSwarmCoordinatorDashboard,
  compactDashboard: unknown,
  applyLedger: FrontierCodexApplyLedgerSummary
): void {
  const mutableDashboard = dashboard as FrontierSwarmCoordinatorDashboard & { metadata?: Record<string, unknown> };
  const dashboardMetadata = mutableDashboard as unknown as { metadata?: Record<string, unknown> };
  (mutableDashboard.summary as Record<string, unknown>).applyLedger = applyLedger;
  (mutableDashboard.summary as Record<string, unknown>).applyLedgerLandedCount = applyLedger.landed;
  (mutableDashboard.summary as Record<string, unknown>).landedJobIds = applyLedger.landedJobIds;
  dashboardMetadata.metadata = { ...(dashboardMetadata.metadata ?? {}), applyLedger };
  const compact = compactDashboard as Record<string, unknown>;
  compact.applyLedger = applyLedger;
  compact.landedJobIds = applyLedger.landedJobIds;
  compact.landedCount = applyLedger.landed;
}

export function createLandedHealthSummary(
  applyLedger: FrontierCodexApplyLedgerSummary,
  buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>
): FrontierCodexLandedHealthSummary {
  const landedJobSet = new Set(applyLedger.landedJobIds);
  const bucketJobIds = collectBucketJobIds(buckets);
  const landedBucketJobIds = mapBucketJobIds(bucketJobIds, (jobId) => landedJobSet.has(jobId));
  const remainingBucketJobIds = mapBucketJobIds(bucketJobIds, (jobId) => !landedJobSet.has(jobId));
  const reviewPressureJobIds = uniqueStrings([
    ...remainingBucketJobIds['needs-human-port'],
    ...remainingBucketJobIds['rerun-work'],
    ...remainingBucketJobIds['failed-evidence'],
    ...remainingBucketJobIds['stale-against-head']
  ]);
  return {
    successfulOutputCount: applyLedger.landed,
    appliedJobCount: applyLedger.appliedJobIds.length,
    committedJobCount: applyLedger.committedJobIds.length,
    failedApplyJobCount: applyLedger.failedJobIds.length,
    landedJobIds: applyLedger.landedJobIds,
    appliedJobIds: applyLedger.appliedJobIds,
    committedJobIds: applyLedger.committedJobIds,
    failedApplyJobIds: applyLedger.failedJobIds,
    bucketCounts: countBucketJobIds(bucketJobIds),
    landedBucketCounts: countBucketJobIds(landedBucketJobIds),
    landedBucketJobIds,
    remainingBucketCounts: countBucketJobIds(remainingBucketJobIds),
    remainingBucketJobIds,
    landedNeedsHumanReviewCount: landedBucketJobIds['needs-human-port'].length,
    landedNeedsHumanReviewJobIds: landedBucketJobIds['needs-human-port'],
    remainingNeedsHumanReviewCount: remainingBucketJobIds['needs-human-port'].length,
    remainingNeedsHumanReviewJobIds: remainingBucketJobIds['needs-human-port'],
    remainingFailedEvidenceCount: remainingBucketJobIds['failed-evidence'].length,
    remainingFailedEvidenceJobIds: remainingBucketJobIds['failed-evidence'],
    remainingStaleCount: remainingBucketJobIds['stale-against-head'].length,
    remainingStaleJobIds: remainingBucketJobIds['stale-against-head'],
    remainingReadyToApplyCount: remainingBucketJobIds['ready-to-apply'].length,
    remainingReadyToApplyJobIds: remainingBucketJobIds['ready-to-apply'],
    reviewPressureCount: reviewPressureJobIds.length,
    reviewPressureJobIds
  };
}

export function attachLandedHealthSummary(
  dashboard: FrontierSwarmCoordinatorDashboard,
  compactDashboard: unknown,
  qualitySignals: FrontierCodexCollectQualitySignals,
  landedHealth: FrontierCodexLandedHealthSummary
): void {
  const mutableDashboard = dashboard as FrontierSwarmCoordinatorDashboard & { metadata?: Record<string, unknown> };
  const dashboardMetadata = mutableDashboard as unknown as { metadata?: Record<string, unknown> };
  qualitySignals.landed = landedHealth;
  qualitySignals.needsPort = { ...qualitySignals.needsPort, landedJobCount: landedHealth.landedNeedsHumanReviewCount, landedJobIds: landedHealth.landedNeedsHumanReviewJobIds, remainingJobCount: landedHealth.remainingNeedsHumanReviewCount, remainingJobIds: landedHealth.remainingNeedsHumanReviewJobIds };
  qualitySignals.failure = { ...qualitySignals.failure, landedJobCount: landedHealth.landedBucketCounts['failed-evidence'], landedJobIds: landedHealth.landedBucketJobIds['failed-evidence'], remainingJobCount: landedHealth.remainingFailedEvidenceCount, remainingJobIds: landedHealth.remainingFailedEvidenceJobIds };
  qualitySignals.stale = { ...qualitySignals.stale, landedJobCount: landedHealth.landedBucketCounts['stale-against-head'], landedJobIds: landedHealth.landedBucketJobIds['stale-against-head'], remainingJobCount: landedHealth.remainingStaleCount, remainingJobIds: landedHealth.remainingStaleJobIds };
  const summary = mutableDashboard.summary as Record<string, unknown>;
  summary.collectionQualitySignals = qualitySignals;
  summary.collectionLandedSuccessCount = landedHealth.successfulOutputCount;
  summary.collectionLandedAppliedCount = landedHealth.appliedJobCount;
  summary.collectionLandedCommittedCount = landedHealth.committedJobCount;
  summary.collectionFailedApplyCount = landedHealth.failedApplyJobCount;
  summary.collectionLandedNeedsHumanReviewCount = landedHealth.landedNeedsHumanReviewCount;
  summary.collectionRemainingNeedsHumanReviewCount = landedHealth.remainingNeedsHumanReviewCount;
  summary.collectionRemainingFailedEvidenceCount = landedHealth.remainingFailedEvidenceCount;
  summary.collectionRemainingStaleCount = landedHealth.remainingStaleCount;
  summary.collectionRemainingReadyToApplyCount = landedHealth.remainingReadyToApplyCount;
  summary.collectionReviewPressureCount = landedHealth.reviewPressureCount;
  summary.collectionReviewPressureJobIds = landedHealth.reviewPressureJobIds;
  dashboardMetadata.metadata = { ...(dashboardMetadata.metadata ?? {}), landedHealth };
  Object.assign(compactDashboard as Record<string, unknown>, {
    landedHealth,
    successfulOutputCount: landedHealth.successfulOutputCount,
    landedNeedsHumanReviewCount: landedHealth.landedNeedsHumanReviewCount,
    remainingNeedsHumanReviewCount: landedHealth.remainingNeedsHumanReviewCount,
    remainingFailedEvidenceCount: landedHealth.remainingFailedEvidenceCount,
    remainingStaleCount: landedHealth.remainingStaleCount,
    remainingReadyToApplyCount: landedHealth.remainingReadyToApplyCount,
    reviewPressureCount: landedHealth.reviewPressureCount,
    reviewPressureJobIds: landedHealth.reviewPressureJobIds
  });
}

function summarizeApplyLedger(ledger: FrontierCodexApplyResult, ledgerPath: string): FrontierCodexApplyLedgerSummary {
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const summary = isObject(ledger.summary) ? ledger.summary : {};
  const appliedJobIds = uniqueStrings(entries.filter((entry) => entry.status === 'applied').map((entry) => entry.jobId));
  const committedJobIds = uniqueStrings(entries.filter((entry) => entry.status === 'committed').map((entry) => entry.jobId));
  const landedJobIds = uniqueStrings([...appliedJobIds, ...committedJobIds]);
  const failedJobIds = uniqueStrings(entries.filter((entry) => entry.status === 'failed').map((entry) => entry.jobId));
  const statusCount = (status: FrontierCodexApplyLedgerSummary['landedEntries'][number]['status'] | 'checked' | 'skipped' | 'failed') => entries.filter((entry) => entry.status === status).length;
  return {
    path: ledgerPath,
    ...(typeof ledger.generatedAt === 'number' ? { generatedAt: ledger.generatedAt } : {}),
    ...(typeof ledger.dryRun === 'boolean' ? { dryRun: ledger.dryRun } : {}),
    total: ledgerSummaryCount(summary, 'total', entries.length),
    checked: ledgerSummaryCount(summary, 'checked', statusCount('checked')),
    applied: ledgerSummaryCount(summary, 'applied', statusCount('applied')),
    committed: ledgerSummaryCount(summary, 'committed', statusCount('committed')),
    skipped: ledgerSummaryCount(summary, 'skipped', statusCount('skipped')),
    failed: ledgerSummaryCount(summary, 'failed', statusCount('failed')),
    landed: landedJobIds.length,
    appliedJobIds,
    committedJobIds,
    landedJobIds,
    failedJobIds,
    landedEntries: entries.filter((entry) => entry.status === 'applied' || entry.status === 'committed').map((entry) => ({
      jobId: entry.jobId,
      status: entry.status as 'applied' | 'committed',
      bundlePath: entry.bundlePath,
      ...(entry.patchPath ? { patchPath: entry.patchPath } : {}),
      ...(entry.branchName ? { branchName: entry.branchName } : {}),
      ...(entry.commit ? { commit: entry.commit } : {})
    }))
  };
}

function collectBucketJobIds(buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>): Record<FrontierCodexCollectBucket, string[]> {
  return {
    'ready-to-apply': buckets['ready-to-apply'].map((entry) => entry.jobId),
    'needs-human-port': buckets['needs-human-port'].map((entry) => entry.jobId),
    'rerun-work': buckets['rerun-work'].map((entry) => entry.jobId),
    'failed-evidence': buckets['failed-evidence'].map((entry) => entry.jobId),
    'stale-against-head': buckets['stale-against-head'].map((entry) => entry.jobId)
  };
}

function mapBucketJobIds(jobIds: Record<FrontierCodexCollectBucket, string[]>, include: (jobId: string, bucket: FrontierCodexCollectBucket) => boolean): Record<FrontierCodexCollectBucket, string[]> {
  const out = { 'ready-to-apply': [], 'needs-human-port': [], 'rerun-work': [], 'failed-evidence': [], 'stale-against-head': [] } as Record<FrontierCodexCollectBucket, string[]>;
  for (const bucket of COLLECT_BUCKETS) out[bucket] = jobIds[bucket].filter((jobId) => include(jobId, bucket));
  return out;
}

function countBucketJobIds(jobIds: Record<FrontierCodexCollectBucket, string[]>): Record<FrontierCodexCollectBucket, number> {
  return {
    'ready-to-apply': jobIds['ready-to-apply'].length,
    'needs-human-port': jobIds['needs-human-port'].length,
    'rerun-work': jobIds['rerun-work'].length,
    'failed-evidence': jobIds['failed-evidence'].length,
    'stale-against-head': jobIds['stale-against-head'].length
  };
}

function ledgerSummaryCount(summary: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(summary[key]);
  if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  return fallback;
}
