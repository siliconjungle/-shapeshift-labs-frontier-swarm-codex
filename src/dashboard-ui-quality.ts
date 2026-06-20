import {
  isDashboardBlockedJob,
  isDashboardContextBudgetFailedJob,
  isDashboardContextBudgetWarningJob,
  isDashboardFailedEvidenceJob,
  isDashboardFailureJob,
  isDashboardNeedsPortJob,
  isDashboardStaleJob,
  hasDashboardContextBudget
} from './dashboard-ui-health.js';
import {
  maxJobMetric,
  mergeNumberRecords,
  qualityMetricPoint,
  qualityMetricSeries,
  recordQualityMetricPoints,
  sampleJobIds,
  sampleQualityStrings,
  sumNumberRecordValues
} from './dashboard-ui-metric-utils.js';
import type {
  FrontierCodexDashboardJob,
  FrontierCodexDashboardQualityMetrics,
  FrontierCodexDashboardSemanticMetrics
} from './types-dashboard.js';

export function createDashboardQualityMetrics(
  jobs: readonly FrontierCodexDashboardJob[],
  semantic: FrontierCodexDashboardSemanticMetrics
): FrontierCodexDashboardQualityMetrics {
  const sourceOwnershipJobs = jobs.filter((job) => job.sourceOwnershipViolationCount > 0);
  const sourceOwnershipViolationCount = jobs.reduce((sum, job) => sum + job.sourceOwnershipViolationCount, 0);
  const sourceOwnershipPaths = sampleQualityStrings(sourceOwnershipJobs.flatMap((job) => job.sourceOwnershipViolations));
  const ignoredChangedPathJobs = jobs.filter((job) => job.ignoredChangedPathCount > 0);
  const ignoredChangedPathCount = jobs.reduce((sum, job) => sum + job.ignoredChangedPathCount, 0);
  const ignoredReasonCounts = mergeNumberRecords(jobs.map((job) => job.ignoredChangedPathReasonCounts));
  const ignoredChangedPathSamples = sampleQualityStrings(jobs.flatMap((job) => job.ignoredChangedPathSamples));
  const generatedChangedPathJobs = jobs.filter((job) => job.changedPaths.some(isGeneratedChangedPath));
  const generatedChangedPathCount = jobs.reduce((sum, job) => sum + job.changedPaths.filter(isGeneratedChangedPath).length, 0);
  const generatedChangedPathSamples = sampleQualityStrings(jobs.flatMap((job) => job.changedPaths.filter(isGeneratedChangedPath)));
  const quarantinedJobs = jobs.filter((job) => job.quarantinedChangedPathCount > 0);
  const quarantinedChangedPathCount = jobs.reduce((sum, job) => sum + job.quarantinedChangedPathCount, 0);
  const quarantinedPaths = sampleQualityStrings(quarantinedJobs.flatMap((job) => job.quarantinedChangedPaths));
  const failedEvidenceJobs = jobs.filter(isDashboardFailedEvidenceJob);
  const failedStatusJobs = jobs.filter((job) => job.status === 'failed');
  const blockedJobs = jobs.filter(isDashboardBlockedJob);
  const rejectedJobs = jobs.filter((job) => job.disposition === 'rejected');
  const failureJobs = jobs.filter(isDashboardFailureJob);
  const needsPortJobs = jobs.filter(isDashboardNeedsPortJob);
  const staleJobs = jobs.filter(isDashboardStaleJob);
  const contextBudgetJobs = jobs.filter(hasDashboardContextBudget);
  const contextBudgetWarningJobs = contextBudgetJobs.filter(isDashboardContextBudgetWarningJob);
  const contextBudgetFailedJobs = contextBudgetJobs.filter(isDashboardContextBudgetFailedJob);
  const contextBudgetActualUsageJobs = contextBudgetJobs.filter((job) => job.actualInputTokens > 0);
  const semanticAdmissionJobTotal = sumNumberRecordValues(semantic.admission.jobs.statusCounts);
  const semanticAdmissionScriptTotal = sumNumberRecordValues(semantic.admission.scripts.statusCounts);
  return {
    summary: {
      jobCount: jobs.length,
      sourceOwnershipViolationCount,
      sourceOwnershipJobCount: sourceOwnershipJobs.length,
      ignoredOwnershipViolationCount: jobs.reduce((sum, job) => sum + job.ignoredOwnershipViolationCount, 0),
      ignoredChangedPathCount,
      ignoredChangedPathJobCount: ignoredChangedPathJobs.length,
      generatedChangedPathCount,
      quarantinedChangedPathCount,
      quarantinedJobCount: quarantinedJobs.length,
      failureJobCount: failureJobs.length,
      failedEvidenceJobCount: failedEvidenceJobs.length,
      failedStatusJobCount: failedStatusJobs.length,
      blockedJobCount: blockedJobs.length,
      rejectedJobCount: rejectedJobs.length,
      needsPortJobCount: needsPortJobs.length,
      staleJobCount: staleJobs.length,
      semanticAdmissionAutoMergeCandidateCount: semantic.admission.jobs.autoMergeCandidateCount,
      semanticAdmissionCleanEligibleCount: semantic.admission.jobs.cleanEligibleCount,
      semanticAdmissionScriptAutoMergeCandidateCount: semantic.admission.scripts.autoMergeCandidateCount,
      semanticAdmissionScriptCleanEligibleCandidateCount: semantic.admission.scripts.cleanEligibleCandidateCount,
      contextBudgetJobCount: contextBudgetJobs.length,
      contextBudgetWarningCount: contextBudgetWarningJobs.length,
      contextBudgetFailedCount: contextBudgetFailedJobs.length,
      contextBudgetMaxPromptBytes: maxJobMetric(contextBudgetJobs, (job) => job.promptBytes),
      contextBudgetMaxEstimatedInputTokens: maxJobMetric(contextBudgetJobs, (job) => job.estimatedInputTokens),
      contextBudgetMaxActualInputTokens: maxJobMetric(contextBudgetJobs, (job) => job.actualInputTokens),
      contextBudgetMaxCachedInputTokens: maxJobMetric(contextBudgetJobs, (job) => job.cachedInputTokens),
      contextBudgetMaxUncachedInputTokens: maxJobMetric(contextBudgetJobs, (job) => job.uncachedInputTokens)
    },
    series: {
      sourceOwnership: qualityMetricSeries('source-ownership', 'Source ownership', sourceOwnershipViolationCount, [
        qualityMetricPoint('violations', 'Violations', sourceOwnershipViolationCount, { jobCount: sourceOwnershipJobs.length, pathCount: sourceOwnershipPaths.length, jobIds: sampleJobIds(sourceOwnershipJobs), paths: sourceOwnershipPaths }),
        qualityMetricPoint('jobs', 'Jobs', sourceOwnershipJobs.length, { jobCount: sourceOwnershipJobs.length, jobIds: sampleJobIds(sourceOwnershipJobs) })
      ]),
      ignoredChangedPaths: qualityMetricSeries('ignored-changed-paths', 'Ignored changed paths', ignoredChangedPathCount, [
        ...recordQualityMetricPoints('reason', ignoredReasonCounts),
        qualityMetricPoint('jobs', 'Jobs', ignoredChangedPathJobs.length, { jobCount: ignoredChangedPathJobs.length, jobIds: sampleJobIds(ignoredChangedPathJobs), pathCount: ignoredChangedPathSamples.length, paths: ignoredChangedPathSamples })
      ]),
      generatedChangedPaths: qualityMetricSeries('generated-changed-paths', 'Generated changed paths', generatedChangedPathCount, [
        qualityMetricPoint('paths', 'Paths', generatedChangedPathCount, { jobCount: generatedChangedPathJobs.length, pathCount: generatedChangedPathSamples.length, jobIds: sampleJobIds(generatedChangedPathJobs), paths: generatedChangedPathSamples }),
        qualityMetricPoint('jobs', 'Jobs', generatedChangedPathJobs.length, { jobCount: generatedChangedPathJobs.length, jobIds: sampleJobIds(generatedChangedPathJobs) })
      ]),
      quarantines: qualityMetricSeries('quarantines', 'Quarantines', quarantinedChangedPathCount, [
        qualityMetricPoint('paths', 'Paths', quarantinedChangedPathCount, { jobCount: quarantinedJobs.length, pathCount: quarantinedPaths.length, jobIds: sampleJobIds(quarantinedJobs), paths: quarantinedPaths }),
        qualityMetricPoint('jobs', 'Jobs', quarantinedJobs.length, { jobCount: quarantinedJobs.length, jobIds: sampleJobIds(quarantinedJobs) })
      ]),
      failures: qualityMetricSeries('failures', 'Failures', failureJobs.length, [
        qualityMetricPoint('failed-evidence', 'Failed evidence', failedEvidenceJobs.length, { jobCount: failedEvidenceJobs.length, jobIds: sampleJobIds(failedEvidenceJobs) }),
        qualityMetricPoint('failed-status', 'Failed status', failedStatusJobs.length, { jobCount: failedStatusJobs.length, jobIds: sampleJobIds(failedStatusJobs) }),
        qualityMetricPoint('blocked', 'Blocked', blockedJobs.length, { jobCount: blockedJobs.length, jobIds: sampleJobIds(blockedJobs) }),
        qualityMetricPoint('rejected', 'Rejected', rejectedJobs.length, { jobCount: rejectedJobs.length, jobIds: sampleJobIds(rejectedJobs) })
      ]),
      needsPort: qualityMetricSeries('needs-port', 'Coordinator review', needsPortJobs.length, [
        qualityMetricPoint('jobs', 'Manual merge review', needsPortJobs.length, { jobCount: needsPortJobs.length, jobIds: sampleJobIds(needsPortJobs) })
      ]),
      stale: qualityMetricSeries('stale', 'Stale', staleJobs.length, [
        qualityMetricPoint('jobs', 'Jobs', staleJobs.length, { jobCount: staleJobs.length, jobIds: sampleJobIds(staleJobs) })
      ]),
      semanticAdmissions: qualityMetricSeries('semantic-admissions', 'Semantic admissions', semanticAdmissionJobTotal + semanticAdmissionScriptTotal, [
        ...recordQualityMetricPoints('job', semantic.admission.jobs.statusCounts),
        ...recordQualityMetricPoints('script', semantic.admission.scripts.statusCounts)
      ]),
      contextBudget: qualityMetricSeries('context-budget', 'Context budget', contextBudgetJobs.length, [
        qualityMetricPoint('jobs', 'Jobs', contextBudgetJobs.length, { jobCount: contextBudgetJobs.length, jobIds: sampleJobIds(contextBudgetJobs) }),
        qualityMetricPoint('warning', 'Warning', contextBudgetWarningJobs.length, { jobCount: contextBudgetWarningJobs.length, jobIds: sampleJobIds(contextBudgetWarningJobs), warnings: sampleQualityStrings(contextBudgetWarningJobs.flatMap((job) => job.contextBudgetWarnings)) }),
        qualityMetricPoint('failed', 'Failed', contextBudgetFailedJobs.length, { jobCount: contextBudgetFailedJobs.length, jobIds: sampleJobIds(contextBudgetFailedJobs), errors: sampleQualityStrings(contextBudgetFailedJobs.flatMap((job) => job.contextBudgetErrors)) }),
        qualityMetricPoint('actual-usage', 'Actual usage', contextBudgetActualUsageJobs.length, { jobCount: contextBudgetActualUsageJobs.length, jobIds: sampleJobIds(contextBudgetActualUsageJobs) })
      ])
    }
  };
}

export function isGeneratedChangedPath(file: string): boolean {
  return file.includes('/.cache/') || file.startsWith('.cache/') || file.endsWith('.tsbuildinfo') || file.includes('/dist/') || file.startsWith('dist/') || file.includes('/node_modules/') || file.startsWith('node_modules/');
}
