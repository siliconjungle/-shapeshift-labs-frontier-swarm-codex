import type {
  FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_KIND,
  FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_VERSION,
  FRONTIER_SWARM_CODEX_STEERING_INTENT_KIND,
  FRONTIER_SWARM_CODEX_STEERING_INTENT_VERSION
} from './constants.js';
import type { FrontierCodexApplyLedgerSummary, FrontierCodexCollectBucket, FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexContinuationResult } from './types-continuation.js';
import type { FrontierCodexSwarmRunResult } from './types-run.js';

export type FrontierCodexDashboardRoutingMode = 'fill' | 'override' | 'observe';
export type FrontierCodexDashboardModelTier = 'fast' | 'deep' | 'small' | 'medium' | 'large' | string;
export type FrontierCodexDashboardHealthStatus = 'healthy' | 'warning' | 'failed' | 'blocked' | 'running' | 'unknown';
export type FrontierCodexDashboardSemanticReadiness = 'clean' | 'candidate' | 'needs-port' | 'stale' | 'blocked' | 'unknown';
export type FrontierCodexDashboardHumanActionType = 'question' | 'concern' | 'review' | 'approval' | string;
export type FrontierCodexDashboardHumanActionPriority = 'blocking' | 'important' | 'info' | string;
export type FrontierCodexDashboardHumanActionStatus = 'open' | 'answered' | 'resolved' | 'dismissed' | 'cancelled' | string;

export interface FrontierCodexDashboardSnapshotInput {
  cwd?: string;
  run?: string;
  collection?: string;
  continuation?: string;
}

export interface FrontierCodexDashboardJob {
  id: string;
  taskId?: string;
  title?: string;
  lane?: string;
  status?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs: number;
  generatedAt?: number;
  health: FrontierCodexDashboardHealthStatus;
  computeId?: string;
  model?: string;
  modelTier?: string;
  workKind?: string;
  bucket?: FrontierCodexCollectBucket;
  mergeReadiness?: string;
  disposition?: string;
  changedPaths: string[];
  ownershipViolations: string[];
  sourceOwnershipViolations: string[];
  ignoredOwnershipViolations: string[];
  quarantinedChangedPaths: string[];
  ignoredChangedPathSamples: string[];
  ignoredChangedPathReasonSamples: FrontierCodexDashboardIgnoredChangedPathReason[];
  changedPathCount: number;
  ownershipViolationCount: number;
  sourceOwnershipViolationCount: number;
  ignoredOwnershipViolationCount: number;
  quarantinedChangedPathCount: number;
  ignoredChangedPathCount: number;
  ignoredChangedPathReasonCounts: Record<string, number>;
  observedChangedPathCount: number;
  reportedChangedPathCount: number;
  contextBudgetStatus?: string;
  contextBudgetWarningCount: number;
  contextBudgetErrorCount: number;
  contextBudgetWarnings: string[];
  contextBudgetErrors: string[];
  evidencePathCount: number;
  promptBytes: number;
  estimatedInputTokens: number;
  actualInputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  semanticAdmissionStatus?: string;
  semanticAutoMergeCandidate: boolean;
  semanticCleanEligible: boolean;
  semanticReadiness: FrontierCodexDashboardSemanticReadiness;
  semanticReadinessReasons: string[];
  eventBytes: number;
  eventBytesTruncated: number;
  stderrBytes: number;
  stderrBytesTruncated: number;
  collectReasonClasses: string[];
  reasons: string[];
}

export interface FrontierCodexDashboardIgnoredChangedPathReason {
  path: string;
  reasonCode: string;
}

export interface FrontierCodexDashboardHumanActionOption {
  label: string;
  detail?: string;
}

export interface FrontierCodexDashboardHumanAction {
  id: string;
  code: string;
  status: FrontierCodexDashboardHumanActionStatus;
  priority: FrontierCodexDashboardHumanActionPriority;
  type: FrontierCodexDashboardHumanActionType;
  title: string;
  question: string;
  scope: string;
  detail: string;
  why?: string;
  requestedAnswer?: string;
  defaultAction: string;
  askedBy?: string;
  source: 'board' | 'job' | 'workspace' | string;
  jobId?: string;
  taskId?: string;
  lane?: string;
  options: FrontierCodexDashboardHumanActionOption[];
  createdAt?: number;
  answeredAt?: number;
  resolvedAt?: number;
  answer?: string;
  resolution?: string;
  evidencePaths: string[];
  changedPaths: string[];
}

export type FrontierCodexDashboardQualityMetricSeriesId =
  | 'source-ownership'
  | 'ignored-changed-paths'
  | 'generated-changed-paths'
  | 'quarantines'
  | 'failures'
  | 'needs-port'
  | 'stale'
  | 'semantic-admissions'
  | 'context-budget';

export interface FrontierCodexDashboardQualityMetricPoint {
  id: string;
  label: string;
  value: number;
  jobCount?: number;
  pathCount?: number;
  jobIds?: string[];
  paths?: string[];
  warnings?: string[];
  errors?: string[];
}

export interface FrontierCodexDashboardQualityMetricSeries {
  id: FrontierCodexDashboardQualityMetricSeriesId;
  label: string;
  total: number;
  points: FrontierCodexDashboardQualityMetricPoint[];
}

export interface FrontierCodexDashboardQualityMetrics {
  summary: {
    jobCount: number;
    sourceOwnershipViolationCount: number;
    sourceOwnershipJobCount: number;
    ignoredOwnershipViolationCount: number;
    ignoredChangedPathCount: number;
    ignoredChangedPathJobCount: number;
    generatedChangedPathCount: number;
    quarantinedChangedPathCount: number;
    quarantinedJobCount: number;
    failureJobCount: number;
    failedEvidenceJobCount: number;
    failedStatusJobCount: number;
    blockedJobCount: number;
    rejectedJobCount: number;
    needsPortJobCount: number;
    staleJobCount: number;
    semanticAdmissionAutoMergeCandidateCount: number;
    semanticAdmissionCleanEligibleCount: number;
    semanticAdmissionScriptAutoMergeCandidateCount: number;
    semanticAdmissionScriptCleanEligibleCandidateCount: number;
    contextBudgetJobCount: number;
    contextBudgetWarningCount: number;
    contextBudgetFailedCount: number;
    contextBudgetMaxPromptBytes: number;
    contextBudgetMaxEstimatedInputTokens: number;
    contextBudgetMaxActualInputTokens: number;
    contextBudgetMaxCachedInputTokens: number;
    contextBudgetMaxUncachedInputTokens: number;
  };
  series: {
    sourceOwnership: FrontierCodexDashboardQualityMetricSeries;
    ignoredChangedPaths: FrontierCodexDashboardQualityMetricSeries;
    generatedChangedPaths: FrontierCodexDashboardQualityMetricSeries;
    quarantines: FrontierCodexDashboardQualityMetricSeries;
    failures: FrontierCodexDashboardQualityMetricSeries;
    needsPort: FrontierCodexDashboardQualityMetricSeries;
    stale: FrontierCodexDashboardQualityMetricSeries;
    semanticAdmissions: FrontierCodexDashboardQualityMetricSeries;
    contextBudget: FrontierCodexDashboardQualityMetricSeries;
  };
}

export interface FrontierCodexDashboardHealthMetrics {
  status: FrontierCodexDashboardHealthStatus;
  summary: {
    jobCount: number;
    healthyJobCount: number;
    warningJobCount: number;
    failedJobCount: number;
    blockedJobCount: number;
    runningJobCount: number;
    unknownJobCount: number;
    terminalJobCount: number;
    readyToApplyJobCount: number;
    notReadyToApplyJobCount: number;
    contextWarningJobCount: number;
    contextFailedJobCount: number;
    semanticCleanJobCount: number;
    semanticCandidateJobCount: number;
    semanticBlockedJobCount: number;
    semanticUnknownJobCount: number;
    durationMs: number;
    averageDurationMs: number;
    maxDurationMs: number;
    actualInputTokens: number;
    cachedInputTokens: number;
    uncachedInputTokens: number;
    failureRatio: number;
    completionRatio: number;
  };
  points: FrontierCodexDashboardQualityMetricPoint[];
}

export interface FrontierCodexDashboardSemanticImportMetrics {
  expectedCount: number;
  expectedSatisfiedCount: number;
  expectedUnsatisfiedCount: number;
  candidateCount: number;
  selectedCount: number;
  eligibleCount: number;
  importedCount: number;
  warningCount: number;
  factCount: number;
  factPredicates: string[];
  warnings: string[];
  lineageEventCount: number;
  lineageMovedCount: number;
  lineageRenamedCount: number;
  lineageDeletedCount: number;
  lineageBlockedCount: number;
  expectedMissingReasonCodes: string[];
}

export interface FrontierCodexDashboardSemanticEditMetrics {
  script: {
    autoMergeCandidateCount: number;
    conflictCount: number;
    staleCount: number;
    needsPortCount: number;
    portableCount: number;
  };
  projection: {
    projectedCount: number;
    blockedCount: number;
    editCount: number;
    appliedEditCount: number;
    alreadyAppliedEditCount: number;
    deletedBytes: number;
    replacementBytes: number;
    matchesWorkerCount: number;
    mismatchesWorkerCount: number;
    matchUnknownCount: number;
  };
}

export interface FrontierCodexDashboardSemanticReplayMetrics {
  totalCount: number;
  acceptedCleanCount: number;
  alreadyAppliedCount: number;
  conflictCount: number;
  staleCount: number;
  blockedCount: number;
  needsPortCount: number;
}

export interface FrontierCodexDashboardSemanticAdmissionMetrics {
  statusCounts: Record<string, number>;
  statuses: string[];
  autoMergeCandidateCount: number;
  cleanEligibleCount: number;
  portableCount: number;
  cleanEligibleCandidateCount: number;
}

export interface FrontierCodexDashboardSemanticMetrics {
  import: FrontierCodexDashboardSemanticImportMetrics;
  edit: FrontierCodexDashboardSemanticEditMetrics;
  replay: FrontierCodexDashboardSemanticReplayMetrics;
  admission: {
    jobs: FrontierCodexDashboardSemanticAdmissionMetrics;
    scripts: FrontierCodexDashboardSemanticAdmissionMetrics;
  };
}

export interface FrontierCodexDashboardTimeSeriesPoint {
  at: number;
  label: string;
  eventCount: number;
  terminalJobCount: number;
  failureJobCount: number;
  blockedJobCount: number;
  runningJobCount: number;
  warningJobCount: number;
  semanticCleanJobCount: number;
  semanticCandidateJobCount: number;
  semanticBlockedJobCount: number;
  promptBytes: number;
  estimatedInputTokens: number;
  actualInputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  durationMs: number;
  averageDurationMs: number;
  eventBytes: number;
  eventBytesTruncated: number;
  stderrBytes: number;
  stderrBytesTruncated: number;
  logBytes: number;
  logBytesTruncated: number;
  jobIds: string[];
}

export interface FrontierCodexDashboardTimeSeries {
  bucketMs: number;
  summary: {
    pointCount: number;
    eventCount: number;
    terminalJobCount: number;
    failureJobCount: number;
    blockedJobCount: number;
    runningJobCount: number;
    warningJobCount: number;
    semanticCleanJobCount: number;
    semanticCandidateJobCount: number;
    semanticBlockedJobCount: number;
    contextLoadJobCount: number;
    logVolumeJobCount: number;
    missingTimestampJobCount: number;
    earliestAt?: number;
    latestAt?: number;
    promptBytes: number;
    estimatedInputTokens: number;
    actualInputTokens: number;
    cachedInputTokens: number;
    uncachedInputTokens: number;
    durationMs: number;
    averageDurationMs: number;
    maxDurationMs: number;
    eventBytes: number;
    eventBytesTruncated: number;
    stderrBytes: number;
    stderrBytesTruncated: number;
    logBytes: number;
    logBytesTruncated: number;
  };
  points: FrontierCodexDashboardTimeSeriesPoint[];
}

export interface FrontierCodexDashboardSnapshot {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_VERSION;
  ok: boolean;
  generatedAt: number;
  cwd: string;
  sources: {
    runFile?: string;
    runDir?: string;
    collectionFile?: string;
    collectionDir?: string;
    continuationFile?: string;
    continuationDir?: string;
  };
  summary: {
    jobCount: number;
    completedCount: number;
    failedCount: number;
    runningCount: number;
    blockedCount: number;
    changedPathCount: number;
    ownershipViolationCount: number;
    sourceOwnershipViolationCount: number;
    ignoredOwnershipViolationCount: number;
    quarantinedChangedPathCount: number;
    ignoredChangedPathCount: number;
    terminalCount: number;
    failureCount: number;
    warningCount: number;
    contextWarningCount: number;
    contextFailedCount: number;
    semanticCleanCount: number;
    semanticCandidateCount: number;
    semanticBlockedCount: number;
    durationMs: number;
    averageDurationMs: number;
    maxDurationMs: number;
    actualInputTokens: number;
    cachedInputTokens: number;
    uncachedInputTokens: number;
    bucketCounts?: FrontierCodexCollectResult['summary'];
    landed?: number;
    landedJobIds?: string[];
    applyLedgerLandedCount?: number;
    applyLedger?: FrontierCodexApplyLedgerSummary;
    childBacklogEntryCount?: number;
    routingFeedbackCount?: number;
    routingPreferenceCount?: number;
    nextJobCount?: number;
  };
  semantic: FrontierCodexDashboardSemanticMetrics;
  health: FrontierCodexDashboardHealthMetrics;
  quality: FrontierCodexDashboardQualityMetrics;
  timeSeries: FrontierCodexDashboardTimeSeries;
  lanes: Array<{ id: string; jobCount: number; completedCount: number; failedCount: number; runningCount: number }>;
  jobs: FrontierCodexDashboardJob[];
  humanActions: FrontierCodexDashboardHumanAction[];
  events: Array<{ type: string; at?: number; jobId?: string; lane?: string; message?: string }>;
  routing?: {
    policyId?: string;
    defaultMode?: string;
    preferenceCount?: number;
    preferCount?: number;
    avoidCount?: number;
    tournamentObservationCount?: number;
    tournamentRecommendationCount?: number;
  };
  backlog?: {
    id?: string;
    entryCount: number;
    readyCount?: number;
    childBacklogPaths: string[];
  };
  raw: {
    run?: FrontierCodexSwarmRunResult;
    collection?: FrontierCodexCollectResult;
    continuation?: FrontierCodexContinuationResult;
  };
}

export interface FrontierCodexDashboardSteeringIntentInput {
  cwd?: string;
  run?: string;
  collection?: string;
  continuation?: string;
  routingMode?: FrontierCodexDashboardRoutingMode;
  maxConcurrency?: number;
  laneFocus?: readonly string[];
  modelTierPreference?: FrontierCodexDashboardModelTier;
  nextWaveNote?: string;
  tags?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface FrontierCodexDashboardSteeringIntent {
  kind: typeof FRONTIER_SWARM_CODEX_STEERING_INTENT_KIND;
  version: typeof FRONTIER_SWARM_CODEX_STEERING_INTENT_VERSION;
  id: string;
  generatedAt: number;
  target: {
    run?: string;
    collection?: string;
    continuation?: string;
  };
  routingMode?: FrontierCodexDashboardRoutingMode;
  maxConcurrency?: number;
  laneFocus: string[];
  modelTierPreference?: FrontierCodexDashboardModelTier;
  nextWaveNote?: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface FrontierCodexDashboardSteeringWriteInput {
  cwd?: string;
  outDir?: string;
  file?: string;
  intent: FrontierCodexDashboardSteeringIntentInput | FrontierCodexDashboardSteeringIntent;
}

export interface FrontierCodexDashboardSteeringWriteResult {
  ok: boolean;
  file: string;
  intent: FrontierCodexDashboardSteeringIntent;
}
