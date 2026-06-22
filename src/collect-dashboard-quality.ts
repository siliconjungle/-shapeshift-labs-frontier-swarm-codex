import type { FrontierSwarmCoordinatorDashboard, FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexCollectQualitySignals, FrontierCodexContextBudgetReport } from './index.js';
import { isObject, uniqueStrings } from './common.js';
import {
  compactCollectFailureReasonClasses,
  infrastructureNoiseFailureReasonClass,
  ignoredWorkspaceNoiseOwnershipViolationsForReasons,
  sourceOwnershipViolationsForReasons,
  type FrontierCodexCollectCompactReasonClass
} from './collect-bundles.js';

const SIGNAL_ITEM_LIMIT = 12;

export function compactAutosplitRerunGuidance(signals: FrontierCodexCollectQualitySignals): string[] {
  const guidance: string[] = [];
  const budget = signals.contextBudget;
  if (budget.failedCount > 0 || budget.warningCount > 0) {
    guidance.push('guidance: autosplit context-budget jobs before rerun; keep sourceRefs/targetRefs lane-local and prompt evidence compact');
  }
  if ([...budget.warnings, ...budget.errors].some((entry) => entry.includes('source refs'))) {
    guidance.push('guidance: autosplit sourceRefs by package or ownership lane; rerun narrow shards instead of one broad worker');
  }
  if (signals.logTruncation.truncatedJobCount > 0) {
    guidance.push('guidance: rerun truncated-log jobs with compact log summaries and exact failure windows, not raw logs');
  }
  return limitStrings(guidance);
}

export function createCollectedQualitySignals(
  jobs: readonly FrontierSwarmCoordinatorDashboard['jobs'][number][],
  contextBudgets: ReadonlyMap<string, FrontierCodexContextBudgetReport>,
  bundles: readonly FrontierSwarmMergeBundle[]
): FrontierCodexCollectQualitySignals {
  const bundleByJob = new Map(bundles.map((bundle) => [bundle.jobId, bundle]));
  const failureEntries = jobs.map((job) => {
    const bundle = bundleByJob.get(job.jobId);
    const reasonClasses = bundleReasonClasses(bundle);
    return {
      job,
      bundle,
      reasonClasses,
      compactReasonClasses: compactReasonClassesForFailureJob(job, bundle, reasonClasses)
    };
  });
  const ignoredNoiseFailureEntries = failureEntries.filter((entry) => isIgnoredWorkspaceNoiseOnlyFailureJob(entry.job, entry.bundle));
  const failureJobEntries = failureEntries.filter((entry) => isFailureJob(entry.job, entry.bundle));
  const failureJobs = failureJobEntries.map((entry) => entry.job);
  const failureReasonClasses = failureJobEntries.flatMap((entry) => entry.reasonClasses).filter((entry) => !ignoredWorkspaceNoiseReasonClass(entry));
  const ignoredNoiseReasonClasses = ignoredNoiseFailureEntries.flatMap((entry) => entry.reasonClasses).filter(ignoredWorkspaceNoiseReasonClass);
  const compactFailureReasonClasses = failureJobEntries.flatMap((entry) => entry.compactReasonClasses);
  const ignoredNoiseCompactReasonClasses = ignoredNoiseFailureEntries.flatMap((entry) => entry.compactReasonClasses);
  const infrastructureNoiseEntries = failureEntries.filter((entry) => entry.compactReasonClasses.includes('infrastructure-noise') && isRawFailureJob(entry.job, entry.bundle));
  const sourceBlockerEntries = failureJobEntries.filter((entry) => entry.compactReasonClasses.includes('source-blocker'));
  const rawNeedsPortJobs = jobs.filter((job) => job.disposition === 'needs-port');
  const needsPortEntries = failureEntries.filter((entry) => entry.job.disposition === 'needs-port' && !isIgnoredWorkspaceNoiseOnlyFailureJob(entry.job, entry.bundle));
  const ignoredNoiseNeedsPortEntries = failureEntries.filter((entry) => entry.job.disposition === 'needs-port' && isIgnoredWorkspaceNoiseOnlyFailureJob(entry.job, entry.bundle));
  const staleJobs = jobs.filter((job) => job.staleAgainstHead || job.disposition === 'stale-against-head');
  const ownershipJobs = jobs.filter((job) => job.ownershipViolations.length > 0);
  const ownershipDetails = ownershipJobs.map((job) => {
    const bundle = bundleByJob.get(job.jobId);
    const paths = uniqueStrings([...(bundle?.ownershipViolations ?? []), ...job.ownershipViolations]);
    return {
      job,
      paths,
      sourcePaths: sourceOwnershipViolationsForReasons(paths, bundle?.reasons ?? []),
      ignoredNoisePaths: ignoredWorkspaceNoiseOwnershipViolationsForReasons(paths, bundle?.reasons ?? [])
    };
  });
  const ownershipPaths = uniqueStrings(ownershipDetails.flatMap((entry) => entry.paths));
  const sourceOwnershipPaths = uniqueStrings(ownershipDetails.flatMap((entry) => entry.sourcePaths));
  const ignoredNoiseOwnershipPaths = uniqueStrings(ownershipDetails.flatMap((entry) => entry.ignoredNoisePaths));
  const sourceOwnershipJobs = ownershipDetails.filter((entry) => entry.sourcePaths.length > 0).map((entry) => entry.job);
  const ignoredNoiseOwnershipJobs = ownershipDetails.filter((entry) => entry.ignoredNoisePaths.length > 0).map((entry) => entry.job);
  const quarantineEntries = bundles.map((bundle) => ({
    jobId: bundle.jobId,
    bundle,
    paths: bundleQuarantinedChangedPaths(bundle),
    quarantined: bundle.reasons.includes('quarantined-disallowed-changes')
  }));
  const quarantineJobIds = uniqueStrings(quarantineEntries
    .filter((entry) => entry.paths.length > 0 || entry.quarantined)
    .map((entry) => entry.jobId));
  const quarantinePaths = uniqueStrings(quarantineEntries.flatMap((entry) => entry.paths));
  const sourceQuarantinePaths = uniqueStrings(quarantineEntries.flatMap((entry) => sourceOwnershipViolationsForReasons(entry.paths, entry.bundle.reasons)));
  const ignoredNoiseQuarantinePaths = uniqueStrings(quarantineEntries.flatMap((entry) => ignoredWorkspaceNoiseOwnershipViolationsForReasons(entry.paths, entry.bundle.reasons)));
  const sourceQuarantineJobIds = uniqueStrings(quarantineEntries
    .filter((entry) => sourceOwnershipViolationsForReasons(entry.paths, entry.bundle.reasons).length > 0)
    .map((entry) => entry.jobId));
  const ignoredNoiseQuarantineJobIds = uniqueStrings(quarantineEntries
    .filter((entry) => ignoredWorkspaceNoiseOwnershipViolationsForReasons(entry.paths, entry.bundle.reasons).length > 0)
    .map((entry) => entry.jobId));
  const budgets = Array.from(contextBudgets.values());
  const warningBudgets = budgets.filter((budget) => budget.status === 'warning');
  const failedBudgets = budgets.filter((budget) => budget.status === 'failed');
  const logEntries = bundles.map((bundle) => ({
    jobId: bundle.jobId,
    summary: bundleLogSummary(bundle)
  })).filter((entry): entry is { jobId: string; summary: NonNullable<ReturnType<typeof bundleLogSummary>> } => Boolean(entry.summary));
  const truncatedLogEntries = logEntries.filter((entry) => logBytesTruncated(entry.summary) > 0);
  return {
    failure: {
      jobCount: failureJobs.length,
      failedEvidenceCount: failureJobEntries.filter((entry) => entry.job.disposition === 'rejected' || entry.job.disposition === 'blocked' || entry.job.tests.requiredFailed > 0).length,
      statusFailedCount: jobs.filter((job) => job.status === 'failed').length,
      blockedCount: jobs.filter((job) => job.disposition === 'blocked').length,
      rejectedCount: jobs.filter((job) => job.disposition === 'rejected').length,
      failedCommandCount: jobs.reduce((sum, job) => sum + job.tests.failed, 0),
      requiredFailedCommandCount: jobs.reduce((sum, job) => sum + job.tests.requiredFailed, 0),
      reasonClasses: limitStrings(failureReasonClasses),
      reasonClassCounts: countStrings(failureReasonClasses),
      compactReasonClasses: limitStrings(compactFailureReasonClasses),
      compactReasonClassCounts: countStrings(compactFailureReasonClasses),
      sourceBlockerJobCount: sourceBlockerEntries.length,
      sourceBlockerJobIds: limitStrings(sourceBlockerEntries.map((entry) => entry.job.jobId)),
      infrastructureNoiseJobCount: infrastructureNoiseEntries.length,
      infrastructureNoiseJobIds: limitStrings(infrastructureNoiseEntries.map((entry) => entry.job.jobId)),
      ignoredWorkspaceNoiseJobCount: ignoredNoiseFailureEntries.length,
      ignoredWorkspaceNoiseJobIds: limitStrings(ignoredNoiseFailureEntries.map((entry) => entry.job.jobId)),
      ignoredWorkspaceNoiseReasonClasses: limitStrings(ignoredNoiseReasonClasses),
      ignoredWorkspaceNoiseReasonClassCounts: countStrings(ignoredNoiseReasonClasses),
      ignoredWorkspaceNoiseCompactReasonClasses: limitStrings(ignoredNoiseCompactReasonClasses),
      ignoredWorkspaceNoiseCompactReasonClassCounts: countStrings(ignoredNoiseCompactReasonClasses),
      jobIds: limitStrings(failureJobs.map((job) => job.jobId))
    },
    needsPort: {
      jobCount: needsPortEntries.length,
      rawJobCount: rawNeedsPortJobs.length,
      jobIds: limitStrings(needsPortEntries.map((entry) => entry.job.jobId)),
      rawJobIds: limitStrings(rawNeedsPortJobs.map((job) => job.jobId)),
      ignoredWorkspaceNoiseJobCount: ignoredNoiseNeedsPortEntries.length,
      ignoredWorkspaceNoiseJobIds: limitStrings(ignoredNoiseNeedsPortEntries.map((entry) => entry.job.jobId))
    },
    stale: {
      jobCount: staleJobs.length,
      jobIds: limitStrings(staleJobs.map((job) => job.jobId))
    },
    ownership: {
      jobCount: ownershipJobs.length,
      violationCount: ownershipJobs.reduce((sum, job) => sum + job.ownershipViolations.length, 0),
      sourceViolationCount: ownershipDetails.reduce((sum, entry) => sum + entry.sourcePaths.length, 0),
      ignoredWorkspaceNoiseViolationCount: ownershipDetails.reduce((sum, entry) => sum + entry.ignoredNoisePaths.length, 0),
      paths: limitStrings(ownershipPaths),
      sourcePaths: limitStrings(sourceOwnershipPaths),
      ignoredWorkspaceNoisePaths: limitStrings(ignoredNoiseOwnershipPaths),
      jobIds: limitStrings(ownershipJobs.map((job) => job.jobId)),
      sourceJobIds: limitStrings(sourceOwnershipJobs.map((job) => job.jobId)),
      ignoredWorkspaceNoiseJobIds: limitStrings(ignoredNoiseOwnershipJobs.map((job) => job.jobId))
    },
    quarantine: {
      jobCount: quarantineJobIds.length,
      pathCount: quarantinePaths.length,
      sourcePathCount: sourceQuarantinePaths.length,
      ignoredWorkspaceNoisePathCount: ignoredNoiseQuarantinePaths.length,
      paths: limitStrings(quarantinePaths),
      sourcePaths: limitStrings(sourceQuarantinePaths),
      ignoredWorkspaceNoisePaths: limitStrings(ignoredNoiseQuarantinePaths),
      jobIds: limitStrings(quarantineJobIds),
      sourceJobIds: limitStrings(sourceQuarantineJobIds),
      ignoredWorkspaceNoiseJobIds: limitStrings(ignoredNoiseQuarantineJobIds)
    },
    contextBudget: {
      jobCount: budgets.length,
      warningCount: warningBudgets.length,
      failedCount: failedBudgets.length,
      jobsWithActualUsage: budgets.filter((budget) => numberValue(budget.usage?.inputTokens) > 0).length,
      maxPromptBytes: Math.max(0, ...budgets.map((budget) => numberValue(budget.measured.promptBytes))),
      maxEstimatedInputTokens: Math.max(0, ...budgets.map((budget) => numberValue(budget.measured.estimatedInputTokens))),
      maxActualInputTokens: Math.max(0, ...budgets.map((budget) => numberValue(budget.usage?.inputTokens))),
      maxCachedInputTokens: Math.max(0, ...budgets.map((budget) => numberValue(budget.usage?.cachedInputTokens))),
      maxUncachedInputTokens: Math.max(0, ...budgets.map((budget) => {
        const reported = numberValue(budget.usage?.uncachedInputTokens);
        if (reported > 0) return reported;
        return Math.max(0, numberValue(budget.usage?.inputTokens) - numberValue(budget.usage?.cachedInputTokens));
      })),
      warnings: limitStrings(budgets.flatMap((budget) => budget.warnings)),
      errors: limitStrings(budgets.flatMap((budget) => budget.errors)),
      warningJobIds: limitStrings(warningBudgets.map((budget) => budget.jobId)),
      failedJobIds: limitStrings(failedBudgets.map((budget) => budget.jobId))
    },
    logTruncation: {
      jobCount: logEntries.length,
      truncatedJobCount: truncatedLogEntries.length,
      eventBytes: logEntries.reduce((sum, entry) => sum + numberValue(entry.summary.eventBytes), 0),
      stderrBytes: logEntries.reduce((sum, entry) => sum + numberValue(entry.summary.stderrBytes), 0),
      eventBytesTruncated: logEntries.reduce((sum, entry) => sum + numberValue(entry.summary.eventBytesTruncated), 0),
      stderrBytesTruncated: logEntries.reduce((sum, entry) => sum + numberValue(entry.summary.stderrBytesTruncated), 0),
      bytesTruncated: logEntries.reduce((sum, entry) => sum + logBytesTruncated(entry.summary), 0),
      jobIds: limitStrings(truncatedLogEntries.map((entry) => entry.jobId))
    }
  };
}

function isFailureJob(
  job: FrontierSwarmCoordinatorDashboard['jobs'][number],
  bundle?: FrontierSwarmMergeBundle
): boolean {
  if (isIgnoredWorkspaceNoiseOnlyFailureJob(job, bundle)) return false;
  return isRawFailureJob(job, bundle);
}

function isRawFailureJob(
  job: FrontierSwarmCoordinatorDashboard['jobs'][number],
  bundle?: FrontierSwarmMergeBundle
): boolean {
  return job.status === 'failed'
    || job.disposition === 'rejected'
    || job.disposition === 'blocked'
    || job.tests.requiredFailed > 0
    || Boolean(bundle && bundle.commandsFailed.length > 0);
}

function isIgnoredWorkspaceNoiseOnlyFailureJob(
  job: FrontierSwarmCoordinatorDashboard['jobs'][number],
  bundle?: FrontierSwarmMergeBundle
): boolean {
  const ownershipViolations = uniqueStrings([...(bundle?.ownershipViolations ?? []), ...job.ownershipViolations]);
  if (sourceOwnershipViolationsForReasons(ownershipViolations, bundle?.reasons ?? []).length > 0) return false;
  if (job.tests.requiredFailed > 0 || job.tests.failed > 0 || (bundle?.commandsFailed.length ?? 0) > 0) return false;
  const reasonClasses = bundleReasonClasses(bundle);
  const compactReasonClasses = compactReasonClassesForFailureJob(job, bundle, reasonClasses);
  const hasInfrastructureNoise = compactReasonClasses.includes('infrastructure-noise')
    || ignoredWorkspaceNoiseOwnershipViolationsForReasons(ownershipViolations, bundle?.reasons ?? []).length > 0;
  if (!hasInfrastructureNoise || compactReasonClasses.includes('source-blocker')) return false;
  return job.status === 'failed'
    || job.disposition === 'rejected'
    || job.disposition === 'blocked'
    || bundle?.status === 'failed'
    || bundle?.disposition === 'rejected'
    || bundle?.disposition === 'blocked';
}

function bundleReasonClasses(bundle?: FrontierSwarmMergeBundle): string[] {
  const metadata = isObject(bundle?.metadata) ? bundle.metadata : {};
  const collect = isObject(metadata.collect) ? metadata.collect : {};
  return stringArray(collect.reasonClasses);
}

function compactReasonClassesForFailureJob(
  job: FrontierSwarmCoordinatorDashboard['jobs'][number],
  bundle: FrontierSwarmMergeBundle | undefined,
  reasonClasses: readonly string[]
): FrontierCodexCollectCompactReasonClass[] {
  const compact = compactCollectFailureReasonClasses(reasonClasses);
  const ownershipViolations = uniqueStrings([...(bundle?.ownershipViolations ?? []), ...job.ownershipViolations]);
  if (sourceOwnershipViolationsForReasons(ownershipViolations, bundle?.reasons ?? []).length > 0) compact.push('source-blocker');
  if (ignoredWorkspaceNoiseOwnershipViolationsForReasons(ownershipViolations, bundle?.reasons ?? []).length > 0) compact.push('infrastructure-noise');
  const quarantinedPaths = bundle ? bundleQuarantinedChangedPaths(bundle) : [];
  if (sourceOwnershipViolationsForReasons(quarantinedPaths, bundle?.reasons ?? []).length > 0) compact.push('source-blocker');
  if (ignoredWorkspaceNoiseOwnershipViolationsForReasons(quarantinedPaths, bundle?.reasons ?? []).length > 0) compact.push('infrastructure-noise');
  if (job.tests.requiredFailed > 0 || (bundle?.commandsFailed.length ?? 0) > 0) compact.push('source-blocker');
  if ((job.status === 'failed' || bundle?.status === 'failed') && compact.length === 0) compact.push('unknown-failure');
  return uniqueStrings(compact) as FrontierCodexCollectCompactReasonClass[];
}

function ignoredWorkspaceNoiseReasonClass(reasonClass: string): boolean {
  return infrastructureNoiseFailureReasonClass(reasonClass);
}

function bundleQuarantinedChangedPaths(bundle: FrontierSwarmMergeBundle): string[] {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const quarantine = isObject(metadata.workspacePatchQuarantine) ? metadata.workspacePatchQuarantine : {};
  const paths = stringArray(quarantine.quarantinedChangedPaths);
  if (paths.length > 0) return paths;
  return bundle.reasons.includes('quarantined-disallowed-changes') ? bundle.ownershipViolations : [];
}

function bundleLogSummary(bundle: FrontierSwarmMergeBundle): Record<string, unknown> | undefined {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  return isObject(metadata.logSummary) ? metadata.logSummary : undefined;
}

function logBytesTruncated(summary: Record<string, unknown>): number {
  return numberValue(summary.eventBytesTruncated) + numberValue(summary.stderrBytesTruncated);
}

function limitStrings(values: readonly string[]): string[] {
  return uniqueStrings(values).slice(0, SIGNAL_ITEM_LIMIT);
}

function countStrings(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
