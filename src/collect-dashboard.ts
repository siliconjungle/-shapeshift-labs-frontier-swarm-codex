import type { FrontierSwarmCoordinatorDashboard, FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexCollectQualitySignals, FrontierCodexContextBudgetReport } from './index.js';
import { isObject, uniqueStrings } from './common.js';
import {
  compactAutosplitRerunGuidance,
  createCollectedQualitySignals
} from './collect-dashboard-quality.js';
import { summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { mergeSemanticEditScriptSummaries } from './semantic-edit-script.js';
import { mergeSemanticEditProjectionSummaries } from './semantic-edit-projection.js';
import { mergeSemanticEditReplaySummaries } from './semantic-edit-replay.js';
import { humanActionsFromMergeBundles } from './human-actions.js';

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
  const semanticImportLossesBySeverity = mergeNumberRecords(semanticQualities.map((entry) => entry.lossesBySeverity));
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
    semanticImportLossCount: semanticQualities.reduce((sum, entry) => sum + entry.lossCount, 0),
    semanticImportLossesBySeverity,
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
    semanticLineageAmbiguous: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageAmbiguous, 0),
    semanticLineageBlocked: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageBlocked, 0),
    semanticLineageNeedsReview: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageNeedsReview, 0),
    semanticLineageReasonCodes: uniqueStrings(semanticQualities.flatMap((entry) => entry.semanticLineageReasonCodes)),
    semanticProofSpecFailedObligations: semanticQualities.reduce((sum, entry) => sum + entry.proofSpecFailedObligations, 0),
    semanticParadigmSemanticsRecords: semanticQualities.reduce((sum, entry) => sum + entry.paradigmSemanticsRecords, 0),
    semanticEditScriptAutoMergeCandidates: semanticEditScripts.autoMergeCandidates,
    semanticEditScriptConflicts: semanticEditScripts.conflicts,
    semanticEditScriptStale: semanticEditScripts.stale,
    semanticEditScriptBlocked: semanticEditScripts.blocked,
    semanticEditScriptNeedsPort: semanticEditScripts.needsPort,
    semanticEditScriptPortable: semanticEditScripts.portable,
    semanticEditScriptReviewRequired: semanticEditScripts.reviewRequired,
    semanticEditScriptReasonCodes: semanticEditScripts.reasonCodes,
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
    semanticEditProjectionReasonCodes: semanticEditProjections.reasonCodes,
    semanticEditReplayAcceptedClean: semanticEditReplays.acceptedClean,
    semanticEditReplayAlreadyApplied: semanticEditReplays.alreadyApplied,
    semanticEditReplayConflicts: semanticEditReplays.conflicts,
    semanticEditReplayStale: semanticEditReplays.stale,
    semanticEditReplayBlocked: semanticEditReplays.blocked,
    semanticEditReplayNeedsPort: semanticEditReplays.needsPort,
    semanticEditReplayReasonCodes: semanticEditReplays.reasonCodes,
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

export function collectedQualitySignalsFromDashboard(
  dashboard: FrontierSwarmCoordinatorDashboard
): FrontierCodexCollectQualitySignals {
  const value = (dashboard.summary as Record<string, unknown>).collectionQualitySignals;
  if (isObject(value)) return value as unknown as FrontierCodexCollectQualitySignals;
  return createCollectedQualitySignals(dashboard.jobs, new Map(), []);
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
    lossCount: semanticQualities.reduce((sum, entry) => sum + entry.lossCount, 0),
    lossesBySeverity: mergeNumberRecords(semanticQualities.map((entry) => entry.lossesBySeverity)),
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
    semanticLineageNeedsReview: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageNeedsReview, 0),
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

function mergeNumberRecords(records: readonly Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (Number.isFinite(value)) out[key] = (out[key] ?? 0) + value;
    }
  }
  return out;
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
