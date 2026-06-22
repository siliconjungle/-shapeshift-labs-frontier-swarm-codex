import type {
  FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_KIND,
  FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_VERSION,
  FRONTIER_SWARM_CODEX_STEERING_INTENT_KIND,
  FRONTIER_SWARM_CODEX_STEERING_INTENT_VERSION
} from './constants.js';
import type { FrontierCodexApplyLedgerSummary, FrontierCodexCollectBucket, FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexContinuationResult } from './types-continuation.js';
import type {
  FrontierCodexDashboardHealthMetrics,
  FrontierCodexDashboardQualityMetrics,
  FrontierCodexDashboardSemanticMetrics,
  FrontierCodexDashboardTimeSeries
} from './types-dashboard-metrics.js';
import type { FrontierCodexSwarmRunResult } from './types-run.js';

export type * from './types-dashboard-metrics.js';

export type FrontierCodexDashboardRoutingMode = 'fill' | 'override' | 'observe';
export type FrontierCodexDashboardModelTier = 'fast' | 'deep' | 'small' | 'medium' | 'large' | string;
export type FrontierCodexDashboardHealthStatus = 'healthy' | 'warning' | 'failed' | 'blocked' | 'running' | 'unknown';
export type FrontierCodexDashboardSemanticReadiness = 'clean' | 'candidate' | 'needs-port' | 'stale' | 'blocked' | 'unknown';
export type FrontierCodexDashboardHumanActionType = 'question' | 'concern' | 'review' | 'approval' | string;
export type FrontierCodexDashboardHumanActionPriority = 'blocking' | 'important' | 'info' | string;
export type FrontierCodexDashboardHumanActionStatus = 'open' | 'answered' | 'resolved' | 'dismissed' | 'cancelled' | string;
export type FrontierCodexDashboardRunSourceMode = 'frontier-run-events' | 'disabled';

export interface FrontierCodexDashboardArtifactPaths {
  coordinatorDashboard?: string;
  runEvents?: string;
  runDashboard?: string;
  queueState?: string;
  queueEvents?: string;
  queueSummary?: string; modelTelemetry?: string;
  modelTelemetrySummary?: string;
  humanActionEvents?: string; humanActionState?: string;
  liveRoutingPolicy?: string; liveRoutingController?: string; liveRoutingHistory?: string;
}

export interface FrontierCodexDashboardRunSourceMetadata {
  mode: FrontierCodexDashboardRunSourceMode;
  format?: 'jsonl';
  runEventsPath?: string;
  runDashboardPath?: string;
}

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
  outputTokens: number;
  billableInputTokens: number;
  priceKnown: boolean;
  pricingModel?: string;
  pricingMatchedModel?: string;
  pricingSource?: string;
  pricingUpdatedAt?: string;
  estimatedCostUsd: number;
  estimatedInputCostUsd: number;
  estimatedCachedInputCostUsd: number;
  estimatedUncachedInputCostUsd: number;
  estimatedOutputCostUsd: number;
  estimatedCostMicroUsd: number;
  costEstimateInputOnly: boolean;
  costEstimateEstimatedInput: boolean;
  costEstimateMissingOutputTokens: boolean;
  costEstimateLongContext: boolean;
  unknownPricingReason?: string;
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
    outputTokens: number;
    billableInputTokens: number;
    priceKnownJobCount: number;
    unknownPriceJobCount: number;
    inputOnlyCostJobCount: number;
    estimatedInputCostJobCount: number;
    estimatedCostUsd: number;
    estimatedInputCostUsd: number;
    estimatedOutputCostUsd: number;
    estimatedCostMicroUsd: number;
    bucketCounts?: FrontierCodexCollectResult['summary'];
    landed?: number;
    landedJobIds?: string[];
    applyLedgerLandedCount?: number;
    applyLedger?: FrontierCodexApplyLedgerSummary;
    childBacklogEntryCount?: number;
    routingFeedbackCount?: number;
    routingPreferenceCount?: number;
    nextJobCount?: number;
    nextJobRoutedCount?: number;
    nextJobChangedComputeCount?: number;
    nextJobRoutingFeedbackMatchCount?: number;
    nextJobRoutingCostSignalCount?: number;
    modelTelemetryRecordCount?: number;
    modelTelemetryJobCount?: number;
    modelTelemetryPriceKnownRecordCount?: number;
    modelTelemetryUnknownPriceRecordCount?: number;
    modelTelemetryEstimatedCostUsd?: number;
    modelTelemetryEstimatedInputCostUsd?: number;
    modelTelemetryEstimatedOutputCostUsd?: number;
    modelTelemetryEstimatedCostMicroUsd?: number;
    modelTelemetryBillableInputTokens?: number;
    modelTelemetryOutputTokens?: number;
    modelTelemetryVerificationRequiredFailed?: number;
    humanActionBrokerActionCount?: number;
    humanActionBrokerOpenCount?: number;
    humanActionBrokerDismissedCount?: number;
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
