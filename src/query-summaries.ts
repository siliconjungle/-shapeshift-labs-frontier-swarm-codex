import { nonNegativeNumber, readStringArray, uniqueStrings } from './common.js';
import {
  safeMergeApplyDecisionSummary,
  semanticEditAdmissionSummary,
  semanticEditProjectionSummary,
  semanticEditScriptAdmissionSummary,
  semanticMergeAdmissionSummary
} from './query-semantic-edit.js';
import { semanticEditReplaySummary } from './query-semantic-edit-replay.js';
import { queryLandedSummary } from './query-landed.js';
import {
  evidenceCleanupSignal,
  evidenceContextBudget,
  evidenceOwnershipSignal,
  jobCleanupSignal,
  jobContextBudget,
  jobHealth,
  jobOwnershipSignal,
  jobSemanticReadinessStatus
} from './query-signals.js';
import { aggregateCleanupStatus, aggregateHealthStatus, aggregateOwnershipStatus } from './query-status.js';
import { incrementCount, jobIds, maxMetric, mergeCountRecords, ratio, sumMetric, testsPassed } from './query-values.js';

export function queryHealthSummary(jobs: Record<string, unknown>[]) {
  const statusCounts = jobs.reduce<Record<string, number>>((out, job) => {
    incrementCount(out, jobHealth(job));
    return out;
  }, {});
  const readyToApplyJobs = jobs.filter((job) => job.disposition === 'auto-mergeable' || job.admissionStatus === 'ready-to-apply');
  const terminalJobs = jobs.filter((job) => job.liveness === 'finished' || ['completed', 'failed', 'blocked'].includes(String(job.status ?? '')));
  const failedJobs = jobs.filter((job) => jobHealth(job) === 'failed');
  const blockedJobs = jobs.filter((job) => jobHealth(job) === 'blocked');
  const warningJobs = jobs.filter((job) => jobHealth(job) === 'warning');
  const runningJobs = jobs.filter((job) => jobHealth(job) === 'running');
  return {
    status: aggregateHealthStatus(statusCounts, jobs.length),
    jobCount: jobs.length,
    statusCounts,
    healthyJobCount: statusCounts.healthy ?? 0,
    warningJobCount: warningJobs.length,
    failedJobCount: failedJobs.length,
    blockedJobCount: blockedJobs.length,
    runningJobCount: runningJobs.length,
    unknownJobCount: statusCounts.unknown ?? 0,
    readyToApplyJobCount: readyToApplyJobs.length,
    needsHumanPortJobCount: jobs.filter((job) => job.disposition === 'needs-port').length,
    staleJobCount: jobs.filter((job) => Boolean(job.staleAgainstHead) || job.disposition === 'stale-against-head').length,
    failedEvidenceJobCount: jobs.filter((job) => job.disposition === 'failed-evidence').length,
    testsFailedJobCount: jobs.filter((job) => !testsPassed(job)).length,
    contextWarningJobCount: jobs.filter((job) => jobContextBudget(job).status === 'warning').length,
    contextFailedJobCount: jobs.filter((job) => jobContextBudget(job).status === 'failed').length,
    semanticBlockedJobCount: jobs.filter((job) => jobSemanticReadinessStatus(job) === 'blocked').length,
    terminalJobCount: terminalJobs.length,
    completionRatio: ratio(terminalJobs.length, jobs.length),
    failureRatio: ratio(failedJobs.length + blockedJobs.length, jobs.length),
    warningJobIds: jobIds(warningJobs),
    failedJobIds: jobIds(failedJobs),
    blockedJobIds: jobIds(blockedJobs),
    runningJobIds: jobIds(runningJobs)
  };
}

export function queryPressureSummary(jobs: Record<string, unknown>[], evidenceRows: Record<string, unknown>[]) {
  const budgets = jobs.map((job) => jobContextBudget(job));
  const contextBudgets = budgets.filter((budget) => budget.hasBudget);
  const warningBudgets = budgets.filter((budget) => budget.status === 'warning' || budget.warnings.length > 0);
  const failedBudgets = budgets.filter((budget) => budget.status === 'failed' || budget.errors.length > 0);
  const generatedAt = jobs.map((job) => nonNegativeNumber(job.generatedAt)).filter((value) => value > 0);
  const evidenceBudgets = evidenceRows.map((entry) => evidenceContextBudget(entry)).filter((budget) => budget.hasBudget);
  const actualInputTokens = sumMetric(budgets, (budget) => budget.actualInputTokens);
  const cachedInputTokens = sumMetric(budgets, (budget) => budget.cachedInputTokens);
  const uncachedInputTokens = sumMetric(budgets, (budget) => budget.uncachedInputTokens);
  return {
    jobCount: jobs.length,
    contextBudgetJobCount: contextBudgets.length,
    contextWarningJobCount: warningBudgets.length,
    contextFailedJobCount: failedBudgets.length,
    actualUsageJobCount: budgets.filter((budget) => budget.actualInputTokens > 0).length,
    tokenTotals: {
      promptBytes: sumMetric(budgets, (budget) => budget.promptBytes),
      estimatedInputTokens: sumMetric(budgets, (budget) => budget.estimatedInputTokens),
      actualInputTokens,
      cachedInputTokens,
      uncachedInputTokens,
      outputTokens: sumMetric(budgets, (budget) => budget.outputTokens),
      cacheHitRatio: ratio(cachedInputTokens, actualInputTokens),
      uncachedRatio: ratio(uncachedInputTokens, actualInputTokens)
    },
    tokenMax: {
      promptBytes: maxMetric(budgets, (budget) => budget.promptBytes),
      estimatedInputTokens: maxMetric(budgets, (budget) => budget.estimatedInputTokens),
      actualInputTokens: maxMetric(budgets, (budget) => budget.actualInputTokens),
      cachedInputTokens: maxMetric(budgets, (budget) => budget.cachedInputTokens),
      uncachedInputTokens: maxMetric(budgets, (budget) => budget.uncachedInputTokens),
      outputTokens: maxMetric(budgets, (budget) => budget.outputTokens)
    },
    time: {
      runningJobCount: jobs.filter((job) => job.liveness === 'running' || job.status === 'running').length,
      finishedJobCount: jobs.filter((job) => job.liveness === 'finished' || job.status === 'completed').length,
      generatedAtCount: generatedAt.length,
      ...(generatedAt.length ? { oldestGeneratedAt: Math.min(...generatedAt), newestGeneratedAt: Math.max(...generatedAt), generatedAtSpanMs: Math.max(...generatedAt) - Math.min(...generatedAt) } : {})
    },
    evidence: {
      contextBudgetEntryCount: evidenceBudgets.length,
      contextWarningEntryCount: evidenceBudgets.filter((budget) => budget.status === 'warning' || budget.warnings.length > 0).length,
      contextFailedEntryCount: evidenceBudgets.filter((budget) => budget.status === 'failed' || budget.errors.length > 0).length,
      actualUsageEntryCount: evidenceBudgets.filter((budget) => budget.actualInputTokens > 0).length
    },
    warnings: uniqueStrings(budgets.flatMap((budget) => budget.warnings)),
    errors: uniqueStrings(budgets.flatMap((budget) => budget.errors))
  };
}

export function querySemanticReadinessSummary(jobs: Record<string, unknown>[]) {
  const statusCounts = jobs.reduce<Record<string, number>>((out, job) => {
    incrementCount(out, jobSemanticReadinessStatus(job));
    return out;
  }, {});
  const qualities = jobs.map((job) => isRecord(job.semanticImportQuality) ? job.semanticImportQuality : {});
  return {
    jobCount: jobs.length,
    statusCounts,
    statuses: Object.keys(statusCounts).sort(),
    cleanJobCount: statusCounts.clean ?? 0,
    candidateJobCount: statusCounts.candidate ?? 0,
    reviewRequiredJobCount: statusCounts['review-required'] ?? 0,
    needsPortJobCount: statusCounts['needs-port'] ?? 0,
    staleJobCount: statusCounts.stale ?? 0,
    blockedJobCount: statusCounts.blocked ?? 0,
    unknownJobCount: statusCounts.unknown ?? 0,
    expectedSatisfiedJobCount: qualities.filter((quality) => quality.expected === true && quality.expectedSatisfied === true).length,
    expectedUnsatisfiedJobCount: qualities.filter((quality) => quality.expected === true && quality.expectedSatisfied === false).length,
    universalAstReadyJobCount: qualities.filter((quality) => nonNegativeNumber(quality.universalAstLayers) > 0).length,
    proofSpecReadyJobCount: qualities.filter((quality) => nonNegativeNumber(quality.proofSpecObligations) > 0 && nonNegativeNumber(quality.proofSpecFailedObligations) === 0).length,
    lineageReviewJobCount: qualities.filter((quality) => nonNegativeNumber(quality.semanticLineageNeedsReview) > 0).length,
    warningJobCount: qualities.filter((quality) => readStringArray(quality.warnings).length > 0).length,
    warnings: uniqueStrings(qualities.flatMap((quality) => readStringArray(quality.warnings))),
    reasonCodes: uniqueStrings(qualities.flatMap((quality) => readStringArray(quality.semanticLineageReasonCodes)))
  };
}

export function queryCleanupSummary(jobs: Record<string, unknown>[], evidenceRows: Record<string, unknown>[]) {
  const signals = jobs.map((job) => jobCleanupSignal(job));
  const evidenceSignals = evidenceRows.map((entry) => evidenceCleanupSignal(entry));
  const statusCounts = signals.reduce<Record<string, number>>((out, signal) => {
    incrementCount(out, signal.status);
    return out;
  }, {});
  return {
    jobCount: jobs.length,
    status: aggregateCleanupStatus(statusCounts, jobs.length),
    statusCounts,
    statuses: Object.keys(statusCounts).sort(),
    cleanupJobCount: signals.filter((signal) => signal.status !== 'clean').length,
    ignoredChangedPathJobCount: signals.filter((signal) => signal.ignoredChangedPathCount > 0).length,
    ignoredChangedPathCount: sumMetric(signals, (signal) => signal.ignoredChangedPathCount),
    generatedChangedPathJobCount: signals.filter((signal) => signal.generatedChangedPathCount > 0).length,
    generatedChangedPathCount: sumMetric(signals, (signal) => signal.generatedChangedPathCount),
    quarantinedJobCount: signals.filter((signal) => signal.quarantinedChangedPathCount > 0).length,
    quarantinedChangedPathCount: sumMetric(signals, (signal) => signal.quarantinedChangedPathCount),
    observedChangedPathCount: sumMetric(signals, (signal) => signal.observedChangedPathCount),
    reportedChangedPathCount: sumMetric(signals, (signal) => signal.reportedChangedPathCount),
    evidenceCleanupEntryCount: evidenceSignals.filter((signal) => signal.status !== 'clean').length,
    evidenceQuarantinedEntryCount: evidenceSignals.filter((signal) => signal.quarantinedChangedPathCount > 0).length,
    ignoredChangedPathReasonCounts: mergeCountRecords(signals.map((signal) => signal.ignoredChangedPathReasonCounts)),
    jobIds: jobIds(jobs.filter((job) => jobCleanupSignal(job).status !== 'clean')),
    quarantinedJobIds: jobIds(jobs.filter((job) => jobCleanupSignal(job).quarantinedChangedPathCount > 0))
  };
}

export function queryOwnershipSummary(jobs: Record<string, unknown>[], evidenceRows: Record<string, unknown>[]) {
  const signals = jobs.map((job) => jobOwnershipSignal(job));
  const evidenceSignals = evidenceRows.map((entry) => evidenceOwnershipSignal(entry));
  const statusCounts = signals.reduce<Record<string, number>>((out, signal) => {
    incrementCount(out, signal.status);
    return out;
  }, {});
  return {
    jobCount: jobs.length,
    status: aggregateOwnershipStatus(statusCounts, jobs.length),
    statusCounts,
    statuses: Object.keys(statusCounts).sort(),
    violationJobCount: signals.filter((signal) => signal.violationCount > 0).length,
    violationCount: sumMetric(signals, (signal) => signal.violationCount),
    sourceViolationJobCount: signals.filter((signal) => signal.sourceViolationCount > 0).length,
    sourceViolationCount: sumMetric(signals, (signal) => signal.sourceViolationCount),
    ignoredViolationJobCount: signals.filter((signal) => signal.ignoredViolationCount > 0).length,
    ignoredViolationCount: sumMetric(signals, (signal) => signal.ignoredViolationCount),
    strictWriteIsolationFailedJobCount: signals.filter((signal) => signal.sourceViolationCount > 0).length,
    evidenceViolationEntryCount: evidenceSignals.filter((signal) => signal.violationCount > 0).length,
    evidenceSourceViolationEntryCount: evidenceSignals.filter((signal) => signal.sourceViolationCount > 0).length,
    jobIds: jobIds(jobs.filter((job) => jobOwnershipSignal(job).violationCount > 0)),
    sourceViolationJobIds: jobIds(jobs.filter((job) => jobOwnershipSignal(job).sourceViolationCount > 0))
  };
}

export function queryableCounts(
  jobs: Record<string, unknown>[],
  evidenceRows: Record<string, unknown>[],
  landedJobIds: Set<string>,
  dashboard: Record<string, unknown>,
  collection: Record<string, unknown>,
  compactDashboard: Record<string, unknown>
) {
  return {
    runHealth: queryHealthSummary(jobs),
    landed: queryLandedSummary(jobs, landedJobIds, dashboard, collection, compactDashboard),
    context: queryPressureSummary(jobs, evidenceRows),
    semantic: {
      readiness: querySemanticReadinessSummary(jobs),
      editAdmission: semanticEditAdmissionSummary(jobs),
      editProjection: semanticEditProjectionSummary(jobs),
      editReplay: semanticEditReplaySummary(jobs),
      editScriptAdmission: semanticEditScriptAdmissionSummary(jobs),
      mergeAdmission: semanticMergeAdmissionSummary(jobs),
      safeMergeApplyDecision: safeMergeApplyDecisionSummary(jobs)
    },
    cleanup: queryCleanupSummary(jobs, evidenceRows),
    ownership: queryOwnershipSummary(jobs, evidenceRows)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
