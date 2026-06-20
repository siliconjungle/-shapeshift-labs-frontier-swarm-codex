import type { FrontierCodexCollectBucket, FrontierCodexLandedHealthSummary } from './types-collection.js';

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
