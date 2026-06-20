import type { FrontierCodexDashboardHealthStatus } from './types-dashboard.js';

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
  lossCount: number;
  lossSeverityCounts: Record<string, number>;
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
    blockedCount: number;
    needsPortCount: number;
    reviewRequiredCount: number;
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
  evidenceOnlyCount: number;
  reasonCodes: string[];
}

export interface FrontierCodexDashboardSemanticAdmissionMetrics {
  statusCounts: Record<string, number>;
  statuses: string[];
  autoMergeCandidateCount: number;
  cleanEligibleCount: number;
  portableCount: number;
  cleanEligibleCandidateCount: number;
}

export type FrontierCodexDashboardSemanticGateStatus = 'pass' | 'review' | 'blocked' | 'unknown';

export interface FrontierCodexDashboardSemanticHealthMetrics {
  parser: {
    lossCount: number;
    lossSeverityCounts: Record<string, number>;
    warningCount: number;
    expectedMissingReasonCodes: string[];
  };
  ledger: {
    totalCount: number;
    landedCount: number;
    skippedCount: number;
    failedCount: number;
  };
  merge: {
    autoMergeCandidateCount: number;
    reviewRequiredCount: number;
    conflictCount: number;
    staleCount: number;
    blockedCount: number;
    needsPortCount: number;
    reasonCodes: string[];
  };
  gates: {
    status: FrontierCodexDashboardSemanticGateStatus;
    passedCount: number;
    warningCount: number;
    failedCount: number;
    reasonCodes: string[];
  };
  outcomes: {
    openCoordinatorReviewCount: number;
    synthesizedResearchCompleteCount: number;
  };
}

export interface FrontierCodexDashboardSemanticMetrics {
  import: FrontierCodexDashboardSemanticImportMetrics;
  edit: FrontierCodexDashboardSemanticEditMetrics;
  replay: FrontierCodexDashboardSemanticReplayMetrics;
  admission: {
    jobs: FrontierCodexDashboardSemanticAdmissionMetrics;
    scripts: FrontierCodexDashboardSemanticAdmissionMetrics;
  };
  health: FrontierCodexDashboardSemanticHealthMetrics;
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
