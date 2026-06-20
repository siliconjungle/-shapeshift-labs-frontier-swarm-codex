import {
  hasDashboardCostSignal,
  isDashboardContextBudgetFailedJob,
  isDashboardContextBudgetWarningJob,
  isDashboardFailureJob,
  isDashboardTerminalJob
} from './dashboard-ui-health.js';
import { averageJobMetric, maxJobMetric } from './dashboard-ui-metric-utils.js';
import { numberValue, roundDashboardUsd } from './dashboard-ui-values.js';
import type { FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexContinuationResult } from './types-continuation.js';
import type { FrontierCodexDashboardJob, FrontierCodexDashboardSnapshot } from './types-dashboard.js';
import type { FrontierCodexSwarmRunResult } from './types-run.js';

export function createDashboardSummary(
  run: FrontierCodexSwarmRunResult | undefined,
  collection: FrontierCodexCollectResult | undefined,
  continuation: FrontierCodexContinuationResult | undefined,
  jobs: readonly FrontierCodexDashboardJob[]
): FrontierCodexDashboardSnapshot['summary'] {
  const terminalJobs = jobs.filter(isDashboardTerminalJob);
  const failureJobs = jobs.filter(isDashboardFailureJob);
  const warningJobs = jobs.filter((job) => job.health === 'warning');
  const contextWarningJobs = jobs.filter(isDashboardContextBudgetWarningJob);
  const contextFailedJobs = jobs.filter(isDashboardContextBudgetFailedJob);
  const durationJobs = jobs.filter((job) => job.durationMs > 0);
  const costSignalJobs = jobs.filter(hasDashboardCostSignal);
  const applyLedger = collection?.summary.applyLedger;
  const landed = applyLedger?.landed ?? collection?.summary.landed;
  const landedJobIds = applyLedger?.landedJobIds ?? collection?.summary.landedJobIds;
  return {
    jobCount: jobs.length,
    completedCount: jobs.filter((job) => job.status === 'completed').length,
    failedCount: jobs.filter((job) => job.status === 'failed').length,
    runningCount: jobs.filter((job) => job.status === 'running').length,
    blockedCount: jobs.filter((job) => job.status === 'blocked').length,
    changedPathCount: jobs.reduce((sum, job) => sum + job.changedPathCount, 0),
    ownershipViolationCount: jobs.reduce((sum, job) => sum + job.ownershipViolationCount, 0),
    sourceOwnershipViolationCount: jobs.reduce((sum, job) => sum + job.sourceOwnershipViolationCount, 0),
    ignoredOwnershipViolationCount: jobs.reduce((sum, job) => sum + job.ignoredOwnershipViolationCount, 0),
    quarantinedChangedPathCount: jobs.reduce((sum, job) => sum + job.quarantinedChangedPathCount, 0),
    ignoredChangedPathCount: jobs.reduce((sum, job) => sum + job.ignoredChangedPathCount, 0),
    terminalCount: terminalJobs.length,
    failureCount: failureJobs.length,
    warningCount: warningJobs.length,
    contextWarningCount: contextWarningJobs.length,
    contextFailedCount: contextFailedJobs.length,
    semanticCleanCount: jobs.filter((job) => job.semanticReadiness === 'clean').length,
    semanticCandidateCount: jobs.filter((job) => job.semanticReadiness === 'candidate').length,
    semanticBlockedCount: jobs.filter((job) => job.semanticReadiness === 'blocked').length,
    durationMs: durationJobs.reduce((sum, job) => sum + job.durationMs, 0),
    averageDurationMs: averageJobMetric(durationJobs, (job) => job.durationMs),
    maxDurationMs: maxJobMetric(durationJobs, (job) => job.durationMs),
    actualInputTokens: jobs.reduce((sum, job) => sum + job.actualInputTokens, 0),
    cachedInputTokens: jobs.reduce((sum, job) => sum + job.cachedInputTokens, 0),
    uncachedInputTokens: jobs.reduce((sum, job) => sum + job.uncachedInputTokens, 0),
    outputTokens: jobs.reduce((sum, job) => sum + job.outputTokens, 0),
    billableInputTokens: jobs.reduce((sum, job) => sum + job.billableInputTokens, 0),
    priceKnownJobCount: costSignalJobs.filter((job) => job.priceKnown).length,
    unknownPriceJobCount: costSignalJobs.filter((job) => !job.priceKnown).length,
    inputOnlyCostJobCount: costSignalJobs.filter((job) => job.costEstimateInputOnly).length,
    estimatedInputCostJobCount: costSignalJobs.filter((job) => job.costEstimateEstimatedInput).length,
    estimatedCostUsd: roundDashboardUsd(jobs.reduce((sum, job) => sum + job.estimatedCostUsd, 0)),
    estimatedInputCostUsd: roundDashboardUsd(jobs.reduce((sum, job) => sum + job.estimatedInputCostUsd, 0)),
    estimatedOutputCostUsd: roundDashboardUsd(jobs.reduce((sum, job) => sum + job.estimatedOutputCostUsd, 0)),
    estimatedCostMicroUsd: jobs.reduce((sum, job) => sum + job.estimatedCostMicroUsd, 0),
    ...(collection ? { bucketCounts: collection.summary } : {}),
    ...(landed !== undefined ? { landed } : {}),
    ...(landedJobIds ? { landedJobIds } : {}),
    ...(applyLedger ? { applyLedgerLandedCount: applyLedger.landed, applyLedger } : {}),
    ...(continuation ? dashboardContinuationSummaryMetrics(continuation) : {}),
    ...(run && jobs.length === 0 ? { jobCount: run.run.jobs.length } : {})
  };
}

function dashboardContinuationSummaryMetrics(continuation: FrontierCodexContinuationResult): Record<string, number> {
  const summary = continuation.summary;
  const routing = summary.nextJobRouting;
  return { childBacklogEntryCount: summary.childBacklogEntryCount, routingFeedbackCount: summary.totalRoutingFeedbackCount, routingPreferenceCount: summary.routingPreferenceCount, nextJobCount: summary.nextJobCount, nextJobRoutedCount: numberValue(routing?.routedJobCount), nextJobChangedComputeCount: numberValue(routing?.changedComputeCount), nextJobRoutingFeedbackMatchCount: numberValue(routing?.policyFeedbackMatchCount), nextJobRoutingCostSignalCount: numberValue(routing?.policyCostSignalCount) };
}
