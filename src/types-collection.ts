import type {
  FrontierSwarmCommand,
  FrontierSwarmCoordinatorDashboard,
  FrontierSwarmEvidenceIndex,
  FrontierSwarmMergeAdmission,
  FrontierSwarmMergeBundle,
  FrontierSwarmMergeIndex,
  FrontierSwarmStrategyTournamentHistory,
  FrontierSwarmStrategyTournament,
  FrontierSwarmTournamentAdaptiveFeedback,
  FrontierSwarmQueueOverlay
} from '@shapeshift-labs/frontier-swarm';
import type {
  FRONTIER_SWARM_CODEX_APPLY_LEDGER_KIND,
  FRONTIER_SWARM_CODEX_APPLY_LEDGER_VERSION,
  FRONTIER_SWARM_CODEX_ARTIFACT_STORE_KIND,
  FRONTIER_SWARM_CODEX_ARTIFACT_STORE_VERSION,
  FRONTIER_SWARM_CODEX_CLEANUP_PLAN_KIND,
  FRONTIER_SWARM_CODEX_CLEANUP_PLAN_VERSION,
  FRONTIER_SWARM_CODEX_COLLECTION_KIND,
  FRONTIER_SWARM_CODEX_COLLECTION_VERSION,
  FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND,
  FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION
} from './constants.js';
import type { FrontierCodexCompactDashboard, FrontierCodexContextBudgetReport } from './types-evidence.js';
import type { FrontierCodexPatchScoreCalibration } from './types-score-calibration.js';
import type { FrontierCodexSemanticPatchBundleOverlapSummary } from './types-semantic-bundle-overlap.js';
import type {
  FrontierCodexSemanticEditAdmissionDecision,
  FrontierCodexSemanticEditScriptSummary
} from './types-semantic-edit.js';
import type { FrontierCodexSemanticEditProjectionSummary } from './types-semantic-edit-projection.js';
import type { FrontierCodexSemanticEditReplaySummary } from './types-semantic-edit-replay.js';

export type FrontierCodexCollectBucket =
  | 'ready-to-apply'
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
  artifactStoreMode?: FrontierCodexArtifactStoreMode;
  artifactStoreTimeoutMs?: number;
}

export interface FrontierCodexCollectedBundle {
  bucket: FrontierCodexCollectBucket;
  jobId: string;
  mergePath: string;
  outputDir: string;
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
  metadata?: FrontierCodexCollectionMetadata;
  summary: FrontierCodexCollectSummary;
}

export type FrontierCodexCollectSummary = Record<FrontierCodexCollectBucket, number> & {
  total: number;
  landed?: number;
  landedJobIds?: string[];
  applyLedger?: FrontierCodexApplyLedgerSummary;
  landedHealth?: FrontierCodexLandedHealthSummary;
};

export interface FrontierCodexApplyLedgerLandedEntry {
  jobId: string;
  status: Extract<FrontierCodexApplyStatus, 'applied' | 'committed'>;
  bundlePath: string;
  patchPath?: string;
  branchName?: string;
  commit?: string;
}

export interface FrontierCodexApplyLedgerSummary {
  path: string;
  generatedAt?: number;
  dryRun?: boolean;
  total: number;
  checked: number;
  applied: number;
  committed: number;
  skipped: number;
  failed: number;
  landed: number;
  appliedJobIds: string[];
  committedJobIds: string[];
  landedJobIds: string[];
  failedJobIds: string[];
  landedEntries: FrontierCodexApplyLedgerLandedEntry[];
}

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

export interface FrontierCodexCollectQualitySignals {
  failure: {
    jobCount: number;
    failedEvidenceCount: number;
    statusFailedCount: number;
    blockedCount: number;
    rejectedCount: number;
    failedCommandCount: number;
    requiredFailedCommandCount: number;
    reasonClasses: string[];
    reasonClassCounts: Record<string, number>;
    compactReasonClasses: string[];
    compactReasonClassCounts: Record<string, number>;
    sourceBlockerJobCount: number;
    sourceBlockerJobIds: string[];
    infrastructureNoiseJobCount: number;
    infrastructureNoiseJobIds: string[];
    ignoredWorkspaceNoiseJobCount: number;
    ignoredWorkspaceNoiseJobIds: string[];
    ignoredWorkspaceNoiseReasonClasses: string[];
    ignoredWorkspaceNoiseReasonClassCounts: Record<string, number>;
    jobIds: string[];
    landedJobCount?: number;
    landedJobIds?: string[];
    remainingJobCount?: number;
    remainingJobIds?: string[];
  };
  needsPort: {
    jobCount: number;
    jobIds: string[];
    landedJobCount?: number;
    landedJobIds?: string[];
    remainingJobCount?: number;
    remainingJobIds?: string[];
  };
  stale: {
    jobCount: number;
    jobIds: string[];
    landedJobCount?: number;
    landedJobIds?: string[];
    remainingJobCount?: number;
    remainingJobIds?: string[];
  };
  landed?: FrontierCodexLandedHealthSummary;
  ownership: {
    jobCount: number;
    violationCount: number;
    sourceViolationCount: number;
    ignoredWorkspaceNoiseViolationCount: number;
    paths: string[];
    sourcePaths: string[];
    ignoredWorkspaceNoisePaths: string[];
    jobIds: string[];
    sourceJobIds: string[];
    ignoredWorkspaceNoiseJobIds: string[];
  };
  quarantine: {
    jobCount: number;
    pathCount: number;
    sourcePathCount: number;
    ignoredWorkspaceNoisePathCount: number;
    paths: string[];
    sourcePaths: string[];
    ignoredWorkspaceNoisePaths: string[];
    jobIds: string[];
    sourceJobIds: string[];
    ignoredWorkspaceNoiseJobIds: string[];
  };
  contextBudget: {
    jobCount: number;
    warningCount: number;
    failedCount: number;
    jobsWithActualUsage: number;
    maxPromptBytes: number;
    maxEstimatedInputTokens: number;
    maxActualInputTokens: number;
    maxCachedInputTokens: number;
    maxUncachedInputTokens: number;
    warnings: string[];
    errors: string[];
    warningJobIds: string[];
    failedJobIds: string[];
  };
  logTruncation: {
    jobCount: number;
    truncatedJobCount: number;
    eventBytes: number;
    stderrBytes: number;
    eventBytesTruncated: number;
    stderrBytesTruncated: number;
    bytesTruncated: number;
    jobIds: string[];
  };
  noiseBreakdown?: FrontierCodexCollectionNoiseBreakdown;
}

export interface FrontierCodexCollectionNoiseBreakdown {
  restored: FrontierCodexCollectionNoiseSignal;
  quarantined: FrontierCodexCollectionNoiseSignal;
  generatedNoise: FrontierCodexCollectionNoiseSignal;
  ignoredWorkspaceNoise: FrontierCodexCollectionNoiseSignal;
  sourceOwnershipViolations: FrontierCodexCollectionNoiseSignal;
}

export interface FrontierCodexCollectionNoiseSignal {
  jobCount: number;
  pathCount: number;
  paths: string[];
  jobIds: string[];
  reasonClasses: string[];
  reasonClassCounts: Record<string, number>;
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

export type FrontierCodexApplyStatus = 'checked' | 'applied' | 'committed' | 'skipped' | 'failed';

export interface FrontierCodexApplyInput {
  collection?: string;
  run?: string;
  outDir?: string;
  cwd?: string;
  bucket?: FrontierCodexCollectBucket | 'all';
  jobIds?: readonly string[];
  dryRun?: boolean;
  allowDirty?: boolean;
  commit?: boolean;
  branchPrefix?: string;
  limit?: number;
}

export interface FrontierCodexApplyEntry {
  jobId: string;
  status: FrontierCodexApplyStatus;
  bundlePath: string;
  patchPath?: string;
  branchName?: string;
  commit?: string;
  dryRun: boolean;
  commands: Array<{ command: string[]; status: number; stdoutTail: string[]; stderrTail: string[] }>;
  error?: string;
}

export interface FrontierCodexApplyResult {
  kind: typeof FRONTIER_SWARM_CODEX_APPLY_LEDGER_KIND;
  version: typeof FRONTIER_SWARM_CODEX_APPLY_LEDGER_VERSION;
  ok: boolean;
  cwd: string;
  collectionDir: string;
  outDir: string;
  generatedAt: number;
  dryRun: boolean;
  entries: FrontierCodexApplyEntry[];
  summary: {
    total: number;
    checked: number;
    applied: number;
    committed: number;
    skipped: number;
    failed: number;
  };
}

export type FrontierCodexPatchScoreStatus =
  | 'accepted-clean'
  | 'accepted-needs-port'
  | 'conflict'
  | 'test-fail'
  | 'stale'
  | 'evidence-only';

export interface FrontierCodexPatchScoreInput {
  collection?: string;
  run?: string;
  outDir?: string;
  cwd?: string;
  bucket?: FrontierCodexCollectBucket | 'all';
  jobIds?: readonly string[];
  workspaceIncludes?: readonly string[];
  workspaceExcludes?: readonly string[];
  focusedCommands?: readonly (string | FrontierSwarmCommand)[];
  globalCommands?: readonly (string | FrontierSwarmCommand)[];
  globalGlobs?: readonly string[];
  limit?: number;
  keepWorkspaces?: boolean;
}

export interface FrontierCodexPatchScoreSemanticEvidence {
  present: boolean;
  total: number;
  imported: number;
  errors: number;
  sourceMapMappings: number;
  semanticSymbols: number;
  ownershipRegions: number;
  patchHints: number;
  semanticFacts: number;
  semanticFactPredicates: string[];
  semanticFactSummary: Record<string, number>;
  dependencyRelations: number;
  dependencyPredicates: string[];
  dependencyEdges: string[];
  universalAstLayers: number;
  universalAstLayerNames: string[];
  proofSpecObligations: number;
  proofSpecFailedObligations: number;
  paradigmSemanticsRecords: number;
  paradigmSemanticsGroups: number;
  paradigmSemanticsLoweringRecords: number;
  semanticLineageEvents: number;
  semanticLineageMoved: number;
  semanticLineageRenamed: number;
  semanticLineageDeleted: number;
  semanticLineageAmbiguous: number;
  semanticLineageBlocked: number;
  semanticLineageNeedsReview: number;
  semanticLineageEventKinds: string[];
  semanticLineageReasonCodes: string[];
  semanticEditScript: FrontierCodexSemanticEditScriptSummary;
  semanticEditProjection: FrontierCodexSemanticEditProjectionSummary;
  semanticEditReplay: FrontierCodexSemanticEditReplaySummary;
  semanticEditAdmission: FrontierCodexSemanticEditAdmissionDecision;
  semanticEditOperationAutoMergeCandidate: boolean;
  semanticEditOperationCleanEligible: boolean;
  readiness: Record<string, number>;
  lossesBySeverity: Record<string, number>;
  scoreAdjustment: number;
  cleanEligible: boolean;
  reasons: string[];
}

export interface FrontierCodexPatchScoreEntry {
  jobId: string;
  status: FrontierCodexPatchScoreStatus;
  score: number;
  bundlePath: string;
  patchPath?: string;
  workspacePath?: string;
  changedPaths: string[];
  reasons: string[];
  semanticEvidence: FrontierCodexPatchScoreSemanticEvidence;
  contextBudget?: FrontierCodexContextBudgetReport;
  commands: Array<{ command: string[]; status: number; stdoutTail: string[]; stderrTail: string[] }>;
}

export interface FrontierCodexPatchScoreResult {
  kind: typeof FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND;
  version: typeof FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION;
  ok: boolean;
  cwd: string;
  collectionDir: string;
  outDir: string;
  generatedAt: number;
  entries: FrontierCodexPatchScoreEntry[];
  summary: Record<FrontierCodexPatchScoreStatus, number> & { total: number };
  calibration: FrontierCodexPatchScoreCalibration;
}

export type FrontierCodexHandoffArtifactKind =
  | 'debug-handoff'
  | 'replay'
  | 'watchpoint'
  | 'trace'
  | 'diagnostic'
  | 'log'
  | 'last-message'
  | 'evidence'
  | string;

export interface FrontierCodexHandoffArtifact {
  path: string;
  kind: FrontierCodexHandoffArtifactKind;
  bytes?: number;
}

export interface FrontierCodexHandoffDiscoveryInput {
  root: string;
  maxDepth?: number;
  maxArtifacts?: number;
}
