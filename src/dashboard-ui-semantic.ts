import { isObject, uniqueStrings } from './common.js';
import { numberRecordValue, numberValue, stringArrayValue } from './dashboard-ui-values.js';
import type { FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexDashboardJob } from './types-dashboard.js';
import type {
  FrontierCodexDashboardSemanticAdmissionMetrics,
  FrontierCodexDashboardSemanticGateStatus,
  FrontierCodexDashboardSemanticHealthMetrics,
  FrontierCodexDashboardSemanticMetrics
} from './types-dashboard.js';

export function createDashboardSemanticMetrics(
  collection: FrontierCodexCollectResult | undefined,
  jobs: readonly FrontierCodexDashboardJob[] = []
): FrontierCodexDashboardSemanticMetrics {
  const collectionDashboard = (isObject(collection?.dashboard) ? collection.dashboard : {}) as Record<string, unknown>;
  const collectionSummary = (isObject(collection?.summary) ? collection.summary : {}) as Record<string, unknown>;
  const dashboardSummary = (isObject(collectionDashboard.summary) ? collectionDashboard.summary : {}) as Record<string, unknown>;
  return createDashboardSemanticMetricsFromSummary({ ...collectionSummary, ...dashboardSummary }, jobs, semanticSourcesFromCollection(collection));
}

export function createDashboardSemanticMetricsFromSummary(
  summary: Record<string, unknown>,
  jobs: readonly FrontierCodexDashboardJob[] = [],
  sources: { semanticImport?: Record<string, unknown>; semanticPatchBundleOverlaps?: Record<string, unknown> } = {}
): FrontierCodexDashboardSemanticMetrics {
  const replay = (isObject(summary.semanticEditReplays) ? summary.semanticEditReplays : {}) as Record<string, unknown>;
  const semanticImport = sources.semanticImport ?? {};
  const semanticEditScripts = (isObject(semanticImport.semanticEditScripts) ? semanticImport.semanticEditScripts : {}) as Record<string, unknown>;
  const semanticEditProjections = (isObject(semanticImport.semanticEditProjections) ? semanticImport.semanticEditProjections : {}) as Record<string, unknown>;
  const semanticEditReplays = (isObject(semanticImport.semanticEditReplays) ? semanticImport.semanticEditReplays : {}) as Record<string, unknown>;
  const acceptedCleanCount = numberValue(summary.semanticEditReplayAcceptedClean);
  const alreadyAppliedCount = numberValue(summary.semanticEditReplayAlreadyApplied);
  const conflictCount = numberValue(summary.semanticEditReplayConflicts);
  const staleCount = numberValue(summary.semanticEditReplayStale);
  const blockedCount = numberValue(summary.semanticEditReplayBlocked);
  const needsPortCount = numberValue(summary.semanticEditReplayNeedsPort);
  const importedCount = numberValue(summary.semanticImportImportedCount, numberValue(semanticImport.importedCount));
  const importMetrics = {
    expectedCount: numberValue(summary.semanticImportExpectedCount),
    expectedSatisfiedCount: numberValue(summary.semanticImportExpectedSatisfiedCount, numberValue(semanticImport.expectedSatisfiedCount)),
    expectedUnsatisfiedCount: numberValue(summary.semanticImportExpectedUnsatisfiedCount, numberValue(semanticImport.expectedUnsatisfiedCount)),
    candidateCount: numberValue(summary.semanticImportCandidateCount, numberValue(semanticImport.candidateCount)),
    selectedCount: numberValue(summary.semanticImportSelectedCount, numberValue(semanticImport.selectedCount)),
    eligibleCount: numberValue(summary.semanticImportEligibleCount, numberValue(semanticImport.eligibleCount)),
    importedCount,
    lossCount: numberValue(summary.semanticImportLossCount, numberValue(semanticImport.lossCount)),
    lossSeverityCounts: numberRecordValue(summary.semanticImportLossesBySeverity, numberRecordValue(semanticImport.lossesBySeverity)),
    warningCount: numberValue(summary.semanticImportWarningCount, numberValue(semanticImport.warningCount)),
    factCount: numberValue(summary.semanticImportFactCount, numberValue(semanticImport.semanticFactCount)),
    factPredicates: stringArrayValue(summary.semanticImportFactPredicates).length
      ? stringArrayValue(summary.semanticImportFactPredicates)
      : stringArrayValue(semanticImport.semanticFactPredicates),
    warnings: stringArrayValue(summary.semanticImportWarnings).length
      ? stringArrayValue(summary.semanticImportWarnings)
      : stringArrayValue(semanticImport.warnings),
    lineageEventCount: numberValue(summary.semanticLineageEvents, numberValue(semanticImport.semanticLineageEvents)),
    lineageMovedCount: numberValue(summary.semanticLineageMoved, numberValue(semanticImport.semanticLineageMoved)),
    lineageRenamedCount: numberValue(summary.semanticLineageRenamed, numberValue(semanticImport.semanticLineageRenamed)),
    lineageDeletedCount: numberValue(summary.semanticLineageDeleted, numberValue(semanticImport.semanticLineageDeleted)),
    lineageBlockedCount: numberValue(summary.semanticLineageBlocked, numberValue(semanticImport.semanticLineageBlocked)),
    expectedMissingReasonCodes: uniqueStrings([
      ...stringArrayValue(summary.semanticImportExpectedMissingReasonCodes),
      ...stringArrayValue(semanticImport.expectedMissingReasonCodes)
    ])
  };
  const scriptMetrics = {
    autoMergeCandidateCount: numberValue(summary.semanticEditScriptAutoMergeCandidates, numberValue(semanticEditScripts.autoMergeCandidates)),
    conflictCount: numberValue(summary.semanticEditScriptConflicts, numberValue(semanticEditScripts.conflicts)),
    staleCount: numberValue(summary.semanticEditScriptStale, numberValue(semanticEditScripts.stale)),
    blockedCount: numberValue(summary.semanticEditScriptBlocked, numberValue(semanticEditScripts.blocked)),
    needsPortCount: numberValue(summary.semanticEditScriptNeedsPort, numberValue(semanticEditScripts.needsPort)),
    reviewRequiredCount: numberValue(summary.semanticEditScriptReviewRequired, numberValue(semanticEditScripts.reviewRequired)),
    portableCount: numberValue(summary.semanticEditScriptPortable, numberValue(semanticEditScripts.portable))
  };
  const projectionMetrics = {
    projectedCount: numberValue(summary.semanticEditProjectionProjected, numberValue(semanticEditProjections.projected)),
    blockedCount: numberValue(summary.semanticEditProjectionBlocked, numberValue(semanticEditProjections.blocked)),
    editCount: numberValue(summary.semanticEditProjectionEdits, numberValue(semanticEditProjections.editCount)),
    appliedEditCount: numberValue(summary.semanticEditProjectionAppliedEdits, numberValue(semanticEditProjections.appliedEditCount)),
    alreadyAppliedEditCount: numberValue(summary.semanticEditProjectionAlreadyAppliedEdits, numberValue(semanticEditProjections.alreadyAppliedEditCount)),
    deletedBytes: numberValue(summary.semanticEditProjectionDeletedBytes, numberValue(semanticEditProjections.deletedBytes)),
    replacementBytes: numberValue(summary.semanticEditProjectionReplacementBytes, numberValue(semanticEditProjections.replacementBytes)),
    matchesWorkerCount: numberValue(summary.semanticEditProjectionMatchesWorker, numberValue(semanticEditProjections.projectedSourceMatchesWorker)),
    mismatchesWorkerCount: numberValue(summary.semanticEditProjectionMismatchesWorker, numberValue(semanticEditProjections.projectedSourceMismatchesWorker)),
    matchUnknownCount: numberValue(summary.semanticEditProjectionMatchUnknown, numberValue(semanticEditProjections.projectedSourceMatchUnknown))
  };
  const replayMetrics = {
    totalCount: numberValue(replay.total, numberValue(semanticEditReplays.total, acceptedCleanCount + alreadyAppliedCount + conflictCount + staleCount + blockedCount + needsPortCount)),
    acceptedCleanCount: numberValue(summary.semanticEditReplayAcceptedClean, numberValue(semanticEditReplays.acceptedClean)),
    alreadyAppliedCount: numberValue(summary.semanticEditReplayAlreadyApplied, numberValue(semanticEditReplays.alreadyApplied)),
    conflictCount: numberValue(summary.semanticEditReplayConflicts, numberValue(semanticEditReplays.conflicts)),
    staleCount: numberValue(summary.semanticEditReplayStale, numberValue(semanticEditReplays.stale)),
    blockedCount: numberValue(summary.semanticEditReplayBlocked, numberValue(semanticEditReplays.blocked)),
    needsPortCount: numberValue(summary.semanticEditReplayNeedsPort, numberValue(semanticEditReplays.needsPort)),
    evidenceOnlyCount: numberValue(summary.semanticEditReplayEvidenceOnly, numberValue(semanticEditReplays.evidenceOnly)),
    reasonCodes: uniqueStrings([
      ...stringArrayValue(summary.semanticEditReplayReasonCodes),
      ...stringArrayValue(semanticEditReplays.reasonCodes)
    ])
  };
  const admission = {
    jobs: semanticAdmissionMetrics(summary.semanticEditAdmission),
    scripts: semanticAdmissionMetrics(summary.semanticEditScriptAdmission)
  };
  return {
    import: {
      ...importMetrics
    },
    edit: {
      script: scriptMetrics,
      projection: projectionMetrics
    },
    replay: replayMetrics,
    admission,
    health: semanticHealthMetrics({
      summary,
      jobs,
      semanticImport,
      semanticEditScripts,
      semanticEditProjections,
      semanticEditReplays,
      semanticPatchBundleOverlaps: sources.semanticPatchBundleOverlaps ?? {},
      importMetrics,
      scriptMetrics,
      projectionMetrics,
      replayMetrics,
      admission
    })
  };
}

export function semanticAdmissionMetrics(value: unknown): FrontierCodexDashboardSemanticAdmissionMetrics {
  const input = (isObject(value) ? value : {}) as Record<string, unknown>;
  return {
    statusCounts: numberRecordValue(input.statusCounts),
    statuses: stringArrayValue(input.statuses),
    autoMergeCandidateCount: numberValue(input.autoMergeCandidateCount),
    cleanEligibleCount: numberValue(input.cleanEligibleCount),
    portableCount: numberValue(input.portableCount),
    cleanEligibleCandidateCount: numberValue(input.cleanEligibleCandidateCount)
  };
}

function semanticSourcesFromCollection(
  collection: FrontierCodexCollectResult | undefined
): { semanticImport?: Record<string, unknown>; semanticPatchBundleOverlaps?: Record<string, unknown> } {
  const input = (isObject(collection) ? collection : {}) as Record<string, unknown>;
  const compactDashboard = (isObject(input.compactDashboard) ? input.compactDashboard : {}) as Record<string, unknown>;
  const directSemanticImport = (isObject(input.semanticImport) ? input.semanticImport : {}) as Record<string, unknown>;
  const compactSemanticImport = (isObject(compactDashboard.semanticImport) ? compactDashboard.semanticImport : {}) as Record<string, unknown>;
  const directOverlaps = (isObject(input.semanticPatchBundleOverlaps) ? input.semanticPatchBundleOverlaps : {}) as Record<string, unknown>;
  const compactOverlaps = (isObject(compactDashboard.semanticPatchBundleOverlaps) ? compactDashboard.semanticPatchBundleOverlaps : {}) as Record<string, unknown>;
  return {
    semanticImport: { ...compactSemanticImport, ...directSemanticImport },
    semanticPatchBundleOverlaps: { ...compactOverlaps, ...directOverlaps }
  };
}

function semanticHealthMetrics(input: {
  summary: Record<string, unknown>;
  jobs: readonly FrontierCodexDashboardJob[];
  semanticImport: Record<string, unknown>;
  semanticEditScripts: Record<string, unknown>;
  semanticEditProjections: Record<string, unknown>;
  semanticEditReplays: Record<string, unknown>;
  semanticPatchBundleOverlaps: Record<string, unknown>;
  importMetrics: FrontierCodexDashboardSemanticMetrics['import'];
  scriptMetrics: FrontierCodexDashboardSemanticMetrics['edit']['script'];
  projectionMetrics: FrontierCodexDashboardSemanticMetrics['edit']['projection'];
  replayMetrics: FrontierCodexDashboardSemanticMetrics['replay'];
  admission: FrontierCodexDashboardSemanticMetrics['admission'];
}): FrontierCodexDashboardSemanticHealthMetrics {
  const applyLedger = (isObject(input.summary.applyLedger) ? input.summary.applyLedger : {}) as Record<string, unknown>;
  const ledger = {
    totalCount: numberValue(applyLedger.total),
    landedCount: numberValue(applyLedger.landed, numberValue(input.summary.landed)),
    skippedCount: numberValue(applyLedger.skipped),
    failedCount: numberValue(applyLedger.failed)
  };
  const semanticLineageNeedsReview = numberValue(input.summary.semanticLineageNeedsReview, numberValue(input.semanticImport.semanticLineageNeedsReview));
  const semanticLineageBlocked = numberValue(input.summary.semanticLineageBlocked, numberValue(input.semanticImport.semanticLineageBlocked));
  const semanticLineageAmbiguous = numberValue(input.summary.semanticLineageAmbiguous, numberValue(input.semanticImport.semanticLineageAmbiguous));
  const semanticEditReviewRequired = input.scriptMetrics.reviewRequiredCount;
  const overlapReviewRequired = numberValue(input.semanticPatchBundleOverlaps.reviewRequiredCount);
  const reviewRequiredCount = semanticEditReviewRequired +
    semanticLineageNeedsReview +
    semanticLineageAmbiguous +
    overlapReviewRequired +
    admissionStatusCount(input.admission.jobs.statusCounts, 'review-required') +
    admissionStatusCount(input.admission.scripts.statusCounts, 'review-required');
  const conflictCount = input.scriptMetrics.conflictCount +
    input.replayMetrics.conflictCount +
    admissionStatusCount(input.admission.jobs.statusCounts, 'conflict') +
    admissionStatusCount(input.admission.scripts.statusCounts, 'conflict');
  const blockedCount = input.scriptMetrics.blockedCount +
    input.projectionMetrics.blockedCount +
    input.replayMetrics.blockedCount +
    semanticLineageBlocked +
    admissionStatusCount(input.admission.jobs.statusCounts, 'blocked') +
    admissionStatusCount(input.admission.scripts.statusCounts, 'blocked');
  const staleCount = input.scriptMetrics.staleCount + input.replayMetrics.staleCount;
  const needsPortCount = input.scriptMetrics.needsPortCount + input.replayMetrics.needsPortCount;
  const autoMergeCandidateCount = Math.max(
    input.scriptMetrics.autoMergeCandidateCount,
    input.admission.jobs.autoMergeCandidateCount,
    input.admission.scripts.autoMergeCandidateCount
  );
  const reviewRequiredReasonCodes = uniqueStrings([
    ...input.importMetrics.expectedMissingReasonCodes,
    ...stringArrayValue(input.summary.semanticLineageReasonCodes),
    ...stringArrayValue(input.semanticImport.semanticLineageReasonCodes),
    ...stringArrayValue(input.summary.semanticEditScriptReasonCodes),
    ...stringArrayValue(input.semanticEditScripts.reasonCodes),
    ...stringArrayValue(input.summary.semanticEditProjectionReasonCodes),
    ...stringArrayValue(input.semanticEditProjections.reasonCodes),
    ...input.replayMetrics.reasonCodes
  ]).slice(0, 12);
  const errorLosses = numberValue(input.importMetrics.lossSeverityCounts.error);
  const proofFailedCount = numberValue(input.summary.semanticProofSpecFailedObligations, numberValue(input.semanticImport.proofSpecFailedObligations));
  const openCoordinatorReviewCount = input.jobs.filter(isOpenCoordinatorReviewJob).length;
  const synthesizedResearchCompleteCount = input.jobs.filter(isSynthesizedResearchCompleteJob).length;
  const failedCount = errorLosses + proofFailedCount + ledger.failedCount + conflictCount + blockedCount;
  const warningCount = input.importMetrics.warningCount +
    reviewRequiredCount +
    ledger.skippedCount +
    staleCount +
    needsPortCount +
    openCoordinatorReviewCount;
  const passedCount = input.replayMetrics.acceptedCleanCount +
    input.replayMetrics.alreadyAppliedCount +
    ledger.landedCount +
    autoMergeCandidateCount;
  const gateReasonCodes = uniqueStrings([
    ...reviewRequiredReasonCodes,
    ...(errorLosses ? ['semantic-parser-error-loss'] : []),
    ...(proofFailedCount ? ['semantic-proof-obligation-failed'] : []),
    ...(ledger.failedCount ? ['apply-ledger-failed'] : []),
    ...(conflictCount ? ['semantic-conflict'] : []),
    ...(blockedCount ? ['semantic-blocked'] : []),
    ...(openCoordinatorReviewCount ? ['open-coordinator-review'] : [])
  ]).slice(0, 12);
  return {
    parser: {
      lossCount: input.importMetrics.lossCount,
      lossSeverityCounts: input.importMetrics.lossSeverityCounts,
      warningCount: input.importMetrics.warningCount,
      expectedMissingReasonCodes: input.importMetrics.expectedMissingReasonCodes
    },
    ledger,
    merge: {
      autoMergeCandidateCount,
      reviewRequiredCount,
      conflictCount,
      staleCount,
      blockedCount,
      needsPortCount,
      reasonCodes: reviewRequiredReasonCodes
    },
    gates: {
      status: semanticGateStatus({ failedCount, warningCount, passedCount }),
      passedCount,
      warningCount,
      failedCount,
      reasonCodes: gateReasonCodes
    },
    outcomes: {
      openCoordinatorReviewCount,
      synthesizedResearchCompleteCount
    }
  };
}

function admissionStatusCount(record: Record<string, number>, wanted: string): number {
  return Object.entries(record).reduce((sum, [key, value]) => normalizedStatus(key) === wanted ? sum + value : sum, 0);
}

function semanticGateStatus(input: { failedCount: number; warningCount: number; passedCount: number }): FrontierCodexDashboardSemanticGateStatus {
  if (input.failedCount > 0) return 'blocked';
  if (input.warningCount > 0) return 'review';
  if (input.passedCount > 0) return 'pass';
  return 'unknown';
}

function isOpenCoordinatorReviewJob(job: FrontierCodexDashboardJob): boolean {
  const signals = [job.bucket, job.disposition, job.mergeReadiness, job.semanticReadiness, job.semanticAdmissionStatus, ...job.reasons].map((value) => normalizedStatus(value));
  return signals.some((signal) => signal === 'needs-human-port' ||
    signal === 'needs-human-review' ||
    signal === 'needs-coordinator-port' ||
    signal === 'needs-coordinator-review' ||
    signal === 'needs-review' ||
    signal === 'review-required');
}

function isSynthesizedResearchCompleteJob(job: FrontierCodexDashboardJob): boolean {
  if (normalizedStatus(job.status) !== 'completed' || isOpenCoordinatorReviewJob(job)) return false;
  const signals = [
    job.lane,
    job.title,
    job.workKind,
    job.disposition,
    job.mergeReadiness,
    ...job.reasons,
    ...job.collectReasonClasses
  ].map((value) => normalizedStatus(value));
  return signals.some((signal) => signal === 'discovery-only' ||
    signal.includes('research') ||
    signal.includes('synthesized') ||
    signal.includes('collector-workspace-only-recovery') ||
    signal.includes('generated-by-collector'));
}

function normalizedStatus(value: unknown): string {
  return String(value ?? '').trim().replace(/_/g, '-').toLowerCase();
}
