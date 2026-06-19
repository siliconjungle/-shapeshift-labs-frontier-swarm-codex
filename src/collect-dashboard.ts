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
import { summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { mergeSemanticEditScriptSummaries } from './semantic-edit-script.js';
import { mergeSemanticEditProjectionSummaries } from './semantic-edit-projection.js';
import { mergeSemanticEditReplaySummaries } from './semantic-edit-replay.js';
import { humanActionsFromMergeBundles } from './human-actions.js';

const SIGNAL_ITEM_LIMIT = 12;

export function enrichCollectedCoordinatorDashboard(
  dashboard: FrontierSwarmCoordinatorDashboard,
  qualities: ReadonlyMap<string, ReturnType<typeof summarizeCodexSemanticImportQuality>>,
  semanticImportExpected: boolean,
  contextBudgets: ReadonlyMap<string, FrontierCodexContextBudgetReport> = new Map(),
  bundles: readonly FrontierSwarmMergeBundle[] = []
): FrontierSwarmCoordinatorDashboard {
  const mutable = dashboard as FrontierSwarmCoordinatorDashboard & {
    jobs: Array<FrontierSwarmCoordinatorDashboard['jobs'][number] & {
      semanticImportQuality?: ReturnType<typeof summarizeCodexSemanticImportQuality>;
      semanticEditAdmission?: ReturnType<typeof summarizeCodexSemanticImportQuality>['semanticEditAdmission'];
      contextBudget?: FrontierCodexContextBudgetReport;
    }>;
    summary: FrontierSwarmCoordinatorDashboard['summary'] & Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
  const semanticQualities = dashboard.jobs.map((job) => qualities.get(job.jobId) ?? summarizeCodexSemanticImportQuality(undefined, semanticImportExpected));
  const semanticEditScripts = mergeSemanticEditScriptSummaries(semanticQualities.map((entry) => entry.semanticEditScript));
  const semanticEditProjections = mergeSemanticEditProjectionSummaries(semanticQualities.map((entry) => entry.semanticEditProjection));
  const semanticEditReplays = mergeSemanticEditReplaySummaries(semanticQualities.map((entry) => entry.semanticEditReplay));
  const semanticEditAdmission = semanticEditAdmissionSummary(semanticQualities);
  const semanticEditScriptAdmission = semanticEditScriptAdmissionSummary(semanticEditScripts);
  mutable.jobs = dashboard.jobs.map((job) => {
    const quality = qualities.get(job.jobId) ?? summarizeCodexSemanticImportQuality(undefined, semanticImportExpected);
    const { contextBudget: _contextBudget, ...jobWithoutOpaqueBudget } = job;
    return {
      ...jobWithoutOpaqueBudget,
      ...(primaryEvidencePathForJob(job) ? { primaryEvidencePath: primaryEvidencePathForJob(job) } : {}),
      semanticImportQuality: quality,
      semanticEditAdmission: quality.semanticEditAdmission,
      ...(contextBudgets.get(job.jobId) ? { contextBudget: contextBudgets.get(job.jobId) } : {})
    };
  });
  const collectionQualitySignals = createCollectedQualitySignals(mutable.jobs, contextBudgets, bundles);
  const collectionAutosplitRerunGuidance = compactAutosplitRerunGuidance(collectionQualitySignals);
  const humanActions = humanActionsFromMergeBundles(bundles);
  mutable.summary = {
    ...dashboard.summary,
    humanActionCount: humanActions.length,
    collectionFailureSignalCount: collectionQualitySignals.failure.jobCount,
    collectionSourceBlockerSignalCount: collectionQualitySignals.failure.sourceBlockerJobCount,
    collectionInfrastructureNoiseSignalCount: collectionQualitySignals.failure.infrastructureNoiseJobCount,
    collectionNeedsPortSignalCount: collectionQualitySignals.needsPort.jobCount,
    collectionStaleSignalCount: collectionQualitySignals.stale.jobCount,
    collectionOwnershipViolationSignalCount: collectionQualitySignals.ownership.sourceViolationCount,
    collectionQuarantinedChangedPathSignalCount: collectionQualitySignals.quarantine.pathCount,
    collectionContextBudgetWarningSignalCount: collectionQualitySignals.contextBudget.warningCount,
    collectionContextBudgetFailedSignalCount: collectionQualitySignals.contextBudget.failedCount,
    collectionLogTruncatedJobSignalCount: collectionQualitySignals.logTruncation.truncatedJobCount,
    collectionLogBytesTruncatedSignalCount: collectionQualitySignals.logTruncation.bytesTruncated,
    collectionAutosplitRerunGuidance,
    collectionQualitySignals,
    semanticImportExpectedCount: semanticQualities.filter((entry) => entry.expected).length,
    semanticImportExpectedSatisfiedCount: semanticQualities.filter((entry) => entry.expected && entry.expectedSatisfied).length,
    semanticImportExpectedUnsatisfiedCount: semanticQualities.filter((entry) => entry.expected && !entry.expectedSatisfied).length,
    semanticImportCandidateCount: semanticQualities.reduce((sum, entry) => sum + entry.candidates, 0),
    semanticImportSelectedCount: semanticQualities.reduce((sum, entry) => sum + entry.selected, 0),
    semanticImportEligibleCount: semanticQualities.reduce((sum, entry) => sum + entry.eligible, 0),
    semanticImportImportedCount: semanticQualities.reduce((sum, entry) => sum + entry.imported, 0),
    semanticImportWarningCount: semanticQualities.reduce((sum, entry) => sum + entry.warnings.length, 0),
    semanticImportWarnings: uniqueStrings(semanticQualities.flatMap((entry) => entry.warnings)),
    semanticImportFactCount: semanticQualities.reduce((sum, entry) => sum + entry.semanticFacts, 0),
    semanticImportFactPredicates: uniqueStrings(semanticQualities.flatMap((entry) => entry.semanticFactPredicates)),
    semanticDependencyRelationCount: semanticQualities.reduce((sum, entry) => sum + entry.dependencyRelations, 0),
    semanticDependencyPredicates: uniqueStrings(semanticQualities.flatMap((entry) => entry.dependencyPredicates)),
    semanticLineageEvents: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageEvents, 0),
    semanticLineageMoved: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageMoved, 0),
    semanticLineageRenamed: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageRenamed, 0),
    semanticLineageDeleted: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageDeleted, 0),
    semanticLineageBlocked: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageBlocked, 0),
    semanticEditScriptAutoMergeCandidates: semanticEditScripts.autoMergeCandidates,
    semanticEditScriptConflicts: semanticEditScripts.conflicts,
    semanticEditScriptStale: semanticEditScripts.stale,
    semanticEditScriptNeedsPort: semanticEditScripts.needsPort,
    semanticEditScriptPortable: semanticEditScripts.portable,
    semanticEditProjectionProjected: semanticEditProjections.projected,
    semanticEditProjectionBlocked: semanticEditProjections.blocked,
    semanticEditProjectionEdits: semanticEditProjections.editCount,
    semanticEditProjectionAppliedEdits: semanticEditProjections.appliedEditCount,
    semanticEditProjectionAlreadyAppliedEdits: semanticEditProjections.alreadyAppliedEditCount,
    semanticEditProjectionDeletedBytes: semanticEditProjections.deletedBytes,
    semanticEditProjectionReplacementBytes: semanticEditProjections.replacementBytes,
    semanticEditProjectionMatchesWorker: semanticEditProjections.projectedSourceMatchesWorker,
    semanticEditProjectionMismatchesWorker: semanticEditProjections.projectedSourceMismatchesWorker,
    semanticEditProjectionMatchUnknown: semanticEditProjections.projectedSourceMatchUnknown,
    semanticEditReplayAcceptedClean: semanticEditReplays.acceptedClean,
    semanticEditReplayAlreadyApplied: semanticEditReplays.alreadyApplied,
    semanticEditReplayConflicts: semanticEditReplays.conflicts,
    semanticEditReplayStale: semanticEditReplays.stale,
    semanticEditReplayBlocked: semanticEditReplays.blocked,
    semanticEditReplayNeedsPort: semanticEditReplays.needsPort,
    semanticEditReplays,
    semanticEditAdmission,
    semanticEditScriptAdmission,
    semanticImportExpectedMissingReasonCodes: uniqueStrings(semanticQualities.flatMap((entry) => entry.expectedMissingReasonCodes))
  };
  mutable.metadata = {
    ...(mutable.metadata ?? {}),
    ...(humanActions.length ? { humanActions } : {}),
    semanticImport: semanticImportMetadata(semanticQualities, semanticImportExpected)
  } as FrontierSwarmCoordinatorDashboard['metadata'];
  return mutable;
}

function primaryEvidencePathForJob(job: FrontierSwarmCoordinatorDashboard['jobs'][number]): string | undefined {
  return job.evidencePaths.find((entry) => /(?:^|\/)evidence\.json$/.test(entry))
    ?? job.evidencePaths[0];
}

function compactAutosplitRerunGuidance(signals: FrontierCodexCollectQualitySignals): string[] {
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

export function collectedQualitySignalsFromDashboard(
  dashboard: FrontierSwarmCoordinatorDashboard
): FrontierCodexCollectQualitySignals {
  const value = (dashboard.summary as Record<string, unknown>).collectionQualitySignals;
  if (isObject(value)) return value as unknown as FrontierCodexCollectQualitySignals;
  return createCollectedQualitySignals(dashboard.jobs, new Map(), []);
}

function createCollectedQualitySignals(
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
  const infrastructureNoiseEntries = failureEntries.filter((entry) => entry.compactReasonClasses.includes('infrastructure-noise') && isRawFailureJob(entry.job, entry.bundle));
  const sourceBlockerEntries = failureJobEntries.filter((entry) => entry.compactReasonClasses.includes('source-blocker'));
  const needsPortJobs = jobs.filter((job) => job.disposition === 'needs-port');
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
      jobIds: limitStrings(failureJobs.map((job) => job.jobId))
    },
    needsPort: {
      jobCount: needsPortJobs.length,
      jobIds: limitStrings(needsPortJobs.map((job) => job.jobId))
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

function semanticImportMetadata(
  semanticQualities: ReturnType<typeof summarizeCodexSemanticImportQuality>[],
  semanticImportExpected: boolean
): NonNullable<FrontierSwarmCoordinatorDashboard['metadata']>[string] {
  return {
    expected: semanticImportExpected,
    expectedSatisfiedCount: semanticQualities.filter((entry) => entry.expected && entry.expectedSatisfied).length,
    expectedUnsatisfiedCount: semanticQualities.filter((entry) => entry.expected && !entry.expectedSatisfied).length,
    expectedMissingReasonCodes: uniqueStrings(semanticQualities.flatMap((entry) => entry.expectedMissingReasonCodes)),
    candidateCount: semanticQualities.reduce((sum, entry) => sum + entry.candidates, 0),
    selectedCount: semanticQualities.reduce((sum, entry) => sum + entry.selected, 0),
    eligibleCount: semanticQualities.reduce((sum, entry) => sum + entry.eligible, 0),
    importedCount: semanticQualities.reduce((sum, entry) => sum + entry.imported, 0),
    symbolCount: semanticQualities.reduce((sum, entry) => sum + entry.symbols, 0),
    ownershipRegionCount: semanticQualities.reduce((sum, entry) => sum + entry.ownershipRegions, 0),
    semanticFactCount: semanticQualities.reduce((sum, entry) => sum + entry.semanticFacts, 0),
    semanticFactPredicates: uniqueStrings(semanticQualities.flatMap((entry) => entry.semanticFactPredicates)),
    semanticLineageEvents: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageEvents, 0),
    semanticLineageMoved: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageMoved, 0),
    semanticLineageRenamed: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageRenamed, 0),
    semanticLineageDeleted: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageDeleted, 0),
    semanticLineageBlocked: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageBlocked, 0),
    semanticEditScripts: { ...mergeSemanticEditScriptSummaries(semanticQualities.map((entry) => entry.semanticEditScript)) },
    semanticEditProjections: {
      ...mergeSemanticEditProjectionSummaries(semanticQualities.map((entry) => entry.semanticEditProjection))
    },
    semanticEditReplays: {
      ...mergeSemanticEditReplaySummaries(semanticQualities.map((entry) => entry.semanticEditReplay))
    },
    semanticEditAdmission: semanticEditAdmissionSummary(semanticQualities),
    semanticEditScriptAdmission: semanticEditScriptAdmissionSummary(mergeSemanticEditScriptSummaries(semanticQualities.map((entry) => entry.semanticEditScript))),
    semanticLineageEventKinds: uniqueStrings(semanticQualities.flatMap((entry) => entry.semanticLineageEventKinds)),
    warningCount: semanticQualities.reduce((sum, entry) => sum + entry.warnings.length, 0),
    warnings: uniqueStrings(semanticQualities.flatMap((entry) => entry.warnings))
  };
}

function semanticEditScriptAdmissionSummary(
  semanticEditScripts: ReturnType<typeof mergeSemanticEditScriptSummaries>
) {
  return {
    statusCounts: { ...semanticEditScripts.admission },
    statuses: Object.keys(semanticEditScripts.admission).filter((key) => semanticEditScripts.admission[key] > 0).sort(),
    autoMergeCandidateCount: semanticEditScripts.admission['auto-merge-candidate'] ?? 0,
    portableCount: semanticEditScripts.portable,
    cleanEligibleCandidateCount: Math.min(semanticEditScripts.admission['auto-merge-candidate'] ?? 0, semanticEditScripts.portable)
  };
}

function semanticEditAdmissionSummary(
  semanticQualities: ReturnType<typeof summarizeCodexSemanticImportQuality>[]
) {
  const statusCounts = semanticQualities.reduce<Record<string, number>>((out, entry) => {
    const status = entry.semanticEditAdmission.status;
    out[status] = (out[status] ?? 0) + 1;
    return out;
  }, {});
  return {
    statusCounts,
    statuses: Object.keys(statusCounts).sort(),
    autoMergeCandidateCount: semanticQualities.filter((entry) => entry.semanticEditAdmission.autoMergeCandidate).length,
    cleanEligibleCount: semanticQualities.filter((entry) => entry.semanticEditAdmission.cleanEligible).length
  };
}
