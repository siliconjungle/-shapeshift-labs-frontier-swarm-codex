import { isObject } from './common.js';
import { numberRecordValue, numberValue, stringArrayValue } from './dashboard-ui-values.js';
import type { FrontierCodexCollectResult } from './types-collection.js';
import type {
  FrontierCodexDashboardSemanticAdmissionMetrics,
  FrontierCodexDashboardSemanticMetrics
} from './types-dashboard.js';

export function createDashboardSemanticMetrics(
  collection: FrontierCodexCollectResult | undefined
): FrontierCodexDashboardSemanticMetrics {
  const collectionDashboard = (isObject(collection?.dashboard) ? collection.dashboard : {}) as Record<string, unknown>;
  const collectionSummary = (isObject(collection?.summary) ? collection.summary : {}) as Record<string, unknown>;
  const dashboardSummary = (isObject(collectionDashboard.summary) ? collectionDashboard.summary : {}) as Record<string, unknown>;
  return createDashboardSemanticMetricsFromSummary({ ...collectionSummary, ...dashboardSummary });
}

export function createDashboardSemanticMetricsFromSummary(summary: Record<string, unknown>): FrontierCodexDashboardSemanticMetrics {
  const replay = (isObject(summary.semanticEditReplays) ? summary.semanticEditReplays : {}) as Record<string, unknown>;
  const acceptedCleanCount = numberValue(summary.semanticEditReplayAcceptedClean);
  const alreadyAppliedCount = numberValue(summary.semanticEditReplayAlreadyApplied);
  const conflictCount = numberValue(summary.semanticEditReplayConflicts);
  const staleCount = numberValue(summary.semanticEditReplayStale);
  const blockedCount = numberValue(summary.semanticEditReplayBlocked);
  const needsPortCount = numberValue(summary.semanticEditReplayNeedsPort);
  return {
    import: {
      expectedCount: numberValue(summary.semanticImportExpectedCount),
      expectedSatisfiedCount: numberValue(summary.semanticImportExpectedSatisfiedCount),
      expectedUnsatisfiedCount: numberValue(summary.semanticImportExpectedUnsatisfiedCount),
      candidateCount: numberValue(summary.semanticImportCandidateCount),
      selectedCount: numberValue(summary.semanticImportSelectedCount),
      eligibleCount: numberValue(summary.semanticImportEligibleCount),
      importedCount: numberValue(summary.semanticImportImportedCount),
      warningCount: numberValue(summary.semanticImportWarningCount),
      factCount: numberValue(summary.semanticImportFactCount),
      factPredicates: stringArrayValue(summary.semanticImportFactPredicates),
      warnings: stringArrayValue(summary.semanticImportWarnings),
      lineageEventCount: numberValue(summary.semanticLineageEvents),
      lineageMovedCount: numberValue(summary.semanticLineageMoved),
      lineageRenamedCount: numberValue(summary.semanticLineageRenamed),
      lineageDeletedCount: numberValue(summary.semanticLineageDeleted),
      lineageBlockedCount: numberValue(summary.semanticLineageBlocked),
      expectedMissingReasonCodes: stringArrayValue(summary.semanticImportExpectedMissingReasonCodes)
    },
    edit: {
      script: {
        autoMergeCandidateCount: numberValue(summary.semanticEditScriptAutoMergeCandidates),
        conflictCount: numberValue(summary.semanticEditScriptConflicts),
        staleCount: numberValue(summary.semanticEditScriptStale),
        needsPortCount: numberValue(summary.semanticEditScriptNeedsPort),
        portableCount: numberValue(summary.semanticEditScriptPortable)
      },
      projection: {
        projectedCount: numberValue(summary.semanticEditProjectionProjected),
        blockedCount: numberValue(summary.semanticEditProjectionBlocked),
        editCount: numberValue(summary.semanticEditProjectionEdits),
        appliedEditCount: numberValue(summary.semanticEditProjectionAppliedEdits),
        alreadyAppliedEditCount: numberValue(summary.semanticEditProjectionAlreadyAppliedEdits),
        deletedBytes: numberValue(summary.semanticEditProjectionDeletedBytes),
        replacementBytes: numberValue(summary.semanticEditProjectionReplacementBytes),
        matchesWorkerCount: numberValue(summary.semanticEditProjectionMatchesWorker),
        mismatchesWorkerCount: numberValue(summary.semanticEditProjectionMismatchesWorker),
        matchUnknownCount: numberValue(summary.semanticEditProjectionMatchUnknown)
      }
    },
    replay: {
      totalCount: numberValue(replay.total, acceptedCleanCount + alreadyAppliedCount + conflictCount + staleCount + blockedCount + needsPortCount),
      acceptedCleanCount,
      alreadyAppliedCount,
      conflictCount,
      staleCount,
      blockedCount,
      needsPortCount
    },
    admission: {
      jobs: semanticAdmissionMetrics(summary.semanticEditAdmission),
      scripts: semanticAdmissionMetrics(summary.semanticEditScriptAdmission)
    }
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
