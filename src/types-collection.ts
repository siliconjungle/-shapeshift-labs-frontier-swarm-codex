import type {
  FrontierSwarmCoordinatorDashboard,
  FrontierSwarmEvidenceIndex,
  FrontierSwarmMergeAdmission,
  FrontierSwarmMergeBundle,
  FrontierSwarmMergeIndex,
  FrontierSwarmBacklog,
  FrontierSwarmQueueOutcomeModel,
  FrontierSwarmStrategyTournamentHistory,
  FrontierSwarmStrategyTournament,
  FrontierSwarmTerminalStateReconciliation,
  FrontierSwarmTournamentAdaptiveFeedback,
  FrontierSwarmQueueOverlay
} from '@shapeshift-labs/frontier-swarm';
import type {
  FRONTIER_SWARM_CODEX_ARTIFACT_STORE_KIND,
  FRONTIER_SWARM_CODEX_ARTIFACT_STORE_VERSION,
  FRONTIER_SWARM_CODEX_CLEANUP_PLAN_KIND,
  FRONTIER_SWARM_CODEX_CLEANUP_PLAN_VERSION,
  FRONTIER_SWARM_CODEX_COLLECTION_KIND,
  FRONTIER_SWARM_CODEX_COLLECTION_VERSION
} from './constants.js';
import type {
  FrontierCodexCollectQualitySignals,
  FrontierCodexCollectionNoiseBreakdown
} from './types-collection-quality.js';
import type { FrontierCodexApplyLedgerSummary } from './types-apply.js';
import type { FrontierCodexCompactDashboard } from './types-evidence.js';
import type { FrontierCodexSemanticPatchBundleOverlapSummary } from './types-semantic-bundle-overlap.js';
import type { FrontierCodexRunSyncOptions, FrontierCodexRunSyncResult } from './run-sync.js';
import type { FrontierCodexPlaywrightRuntimeProofArtifactIndex } from './types-proof-artifacts.js';
import type { FrontierCodexPlaywrightProofReadmission } from './proof-readmission.js';

export type * from './types-apply.js';
export type * from './types-collection-quality.js';
export type * from './types-collection-score.js';

export type FrontierCodexCollectBucket =
  | 'ready-to-apply'
  | 'research-complete'
  | 'needs-human-port'
  | 'rerun-work'
  | 'failed-evidence'
  | 'stale-against-head';

export interface FrontierCodexCollectInput {
  run: string;
  outDir?: string;
  cwd?: string;
  checkStale?: boolean;
  semanticImportExpected?: boolean;
  branchPrefix?: string;
  runEventsPath?: string | false;
  runDashboardPath?: string | false;
  runSyncPeers?: readonly string[]; runSyncDirection?: FrontierCodexRunSyncOptions['direction']; runSyncEvidencePath?: string | false; runSyncHistoryPath?: string | false;
  artifactStoreMode?: FrontierCodexArtifactStoreMode;
  artifactStoreTimeoutMs?: number;
}

export interface FrontierCodexCollectedBundle {
  bucket: FrontierCodexCollectBucket;
  jobId: string;
  mergePath: string;
  outputDir: string;
  generatedByCollector?: boolean;
  patchPath?: string;
  bundle: FrontierSwarmMergeBundle;
}

export interface FrontierCodexCollectResult {
  kind: typeof FRONTIER_SWARM_CODEX_COLLECTION_KIND;
  version: typeof FRONTIER_SWARM_CODEX_COLLECTION_VERSION;
  ok: boolean;
  runDir: string;
  outDir: string;
  generatedAt: number;
  buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>;
  mergeIndex: FrontierSwarmMergeIndex;
  queueOverlay: FrontierSwarmQueueOverlay;
  queueOutcomeModel?: FrontierSwarmQueueOutcomeModel;
  terminalState?: FrontierSwarmTerminalStateReconciliation;
  strategyTournament: FrontierSwarmStrategyTournament;
  strategyHistory: FrontierSwarmStrategyTournamentHistory;
  tournamentAdaptiveFeedback: FrontierSwarmTournamentAdaptiveFeedback;
  evidenceIndex: FrontierSwarmEvidenceIndex;
  admission: FrontierSwarmMergeAdmission;
  dashboard: FrontierSwarmCoordinatorDashboard;
  compactDashboard: FrontierCodexCompactDashboard;
  semanticImport: FrontierCodexCompactDashboard['semanticImport'];
  semanticEditAdmission: FrontierCodexCompactDashboard['semanticEditAdmission'];
  semanticEditScriptAdmission: FrontierCodexCompactDashboard['semanticEditScriptAdmission'];
  semanticPatchBundleOverlaps: FrontierCodexSemanticPatchBundleOverlapSummary;
  qualitySignals: FrontierCodexCollectQualitySignals;
  noiseBreakdown: FrontierCodexCollectionNoiseBreakdown;
  landedHealth?: FrontierCodexLandedHealthSummary;
  artifactStore?: FrontierCodexArtifactStoreResult;
  artifactStoreStatus?: FrontierCodexArtifactStoreStatus;
  proofRouteBacklog?: FrontierSwarmBacklog;
  proofRouteBacklogPath?: string;
  proofArtifacts?: FrontierCodexPlaywrightRuntimeProofArtifactIndex;
  proofArtifactsPath?: string;
  proofReadmission?: FrontierCodexPlaywrightProofReadmission;
  proofReadmissionPath?: string;
  runSync?: FrontierCodexRunSyncResult;
  metadata?: FrontierCodexCollectionMetadata;
  summary: FrontierCodexCollectSummary;
}

export type FrontierCodexCollectSummary = Record<FrontierCodexCollectBucket, number> & {
  total: number;
  collectorGeneratedPatchCount?: number;
  proofRouteTaskCount?: number;
  proofRouteBacklogPath?: string;
  proofArtifactCount?: number;
  proofArtifactPassedCount?: number;
  proofArtifactFailedCount?: number;
  proofArtifactValidatorCandidateCount?: number;
  proofArtifactsPath?: string;
  proofReadmissionCount?: number;
  proofReadmissionAdmittedCount?: number;
  proofReadmissionBlockedCount?: number;
  proofReadmissionPath?: string;
  landed?: number;
  landedJobIds?: string[];
  applyLedger?: FrontierCodexApplyLedgerSummary;
  landedHealth?: FrontierCodexLandedHealthSummary;
};

export interface FrontierCodexLandedHealthSummary {
  successfulOutputCount: number;
  appliedJobCount: number;
  committedJobCount: number;
  failedApplyJobCount: number;
  landedJobIds: string[];
  appliedJobIds: string[];
  committedJobIds: string[];
  failedApplyJobIds: string[];
  bucketCounts: Record<FrontierCodexCollectBucket, number>;
  landedBucketCounts: Record<FrontierCodexCollectBucket, number>;
  landedBucketJobIds: Record<FrontierCodexCollectBucket, string[]>;
  remainingBucketCounts: Record<FrontierCodexCollectBucket, number>;
  remainingBucketJobIds: Record<FrontierCodexCollectBucket, string[]>;
  landedNeedsHumanReviewCount: number;
  landedNeedsHumanReviewJobIds: string[];
  remainingNeedsHumanReviewCount: number;
  remainingNeedsHumanReviewJobIds: string[];
  remainingFailedEvidenceCount: number;
  remainingFailedEvidenceJobIds: string[];
  remainingStaleCount: number;
  remainingStaleJobIds: string[];
  remainingReadyToApplyCount: number;
  remainingReadyToApplyJobIds: string[];
  reviewPressureCount: number;
  reviewPressureJobIds: string[];
}

export type FrontierCodexArtifactStoreMode = 'full' | 'compact';

export interface FrontierCodexCollectionMetadata {
  collectExitGuard?: FrontierCodexArtifactStoreGuardStatus;
  [key: string]: unknown;
}

export interface FrontierCodexArtifactStoreGuardStatus {
  ok: boolean;
  complete: boolean;
  outcome: 'completed' | 'fallback-completed' | 'incomplete';
  attemptedModes: FrontierCodexArtifactStoreMode[];
  incompleteModes?: FrontierCodexArtifactStoreMode[];
  fallbackUsed: boolean;
  fallbackReason?: string;
  timedOut: boolean;
  timeoutMs: number;
  durationMs: number;
  reason?: string;
}

export interface FrontierCodexArtifactStoreStatus {
  ok: boolean;
  mode: FrontierCodexArtifactStoreMode;
  timedOut: boolean;
  timeoutMs: number;
  durationMs: number;
  guard: FrontierCodexArtifactStoreGuardStatus;
  reason?: string;
  error?: string;
}

export interface FrontierCodexArtifactRecord {
  id: string;
  runDir: string;
  collectionDir: string;
  path: string;
  relativePath: string;
  kind: string;
  jobId?: string;
  bucket?: string;
  bytes: number;
  sha256: string;
  blobPath: string;
  compression: 'gzip' | 'none' | string;
  compressedBytes?: number;
  mtimeMs: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface FrontierCodexArtifactStoreResult {
  kind: typeof FRONTIER_SWARM_CODEX_ARTIFACT_STORE_KIND;
  version: typeof FRONTIER_SWARM_CODEX_ARTIFACT_STORE_VERSION;
  generatedAt: number;
  runDir: string;
  collectionDir: string;
  storeDir: string;
  jsonlPath: string;
  sqlPath: string;
  sqlitePath?: string;
  records: FrontierCodexArtifactRecord[];
  summary: {
    artifactCount: number;
    totalBytes: number;
    compressedBytes: number;
    blobCount: number;
    zstdCount?: number;
    gzipCount: number;
    sqliteWritten: boolean;
  };
}

export interface FrontierCodexCleanupInput {
  run: string;
  collection?: string;
  cwd?: string;
  maxAgeHours?: number;
  keepFailed?: boolean;
  keepActive?: boolean;
  pruneArtifacts?: boolean;
  dryRun?: boolean;
}

export interface FrontierCodexCleanupPlan {
  kind: typeof FRONTIER_SWARM_CODEX_CLEANUP_PLAN_KIND;
  version: typeof FRONTIER_SWARM_CODEX_CLEANUP_PLAN_VERSION;
  ok: boolean;
  dryRun: boolean;
  runDir: string;
  collectionDir?: string;
  generatedAt: number;
  indexed: boolean;
  candidates: Array<{ path: string; reason: string; bytes: number; active: boolean; failed: boolean; kind?: 'workspace' | 'artifact-source'; deleted?: boolean }>;
  blockedReasons: string[];
  summary: { candidateCount: number; deletedCount: number; reclaimableBytes: number; workspaceCount?: number; artifactSourceCount?: number };
}
