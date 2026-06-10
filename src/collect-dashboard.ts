import type { FrontierSwarmCoordinatorDashboard } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexContextBudgetReport } from './index.js';
import { uniqueStrings } from './common.js';
import { summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { mergeSemanticEditScriptSummaries } from './semantic-edit-script.js';
import { mergeSemanticEditProjectionSummaries } from './semantic-edit-projection.js';


export function enrichCollectedCoordinatorDashboard(
  dashboard: FrontierSwarmCoordinatorDashboard,
  qualities: ReadonlyMap<string, ReturnType<typeof summarizeCodexSemanticImportQuality>>,
  semanticImportExpected: boolean,
  contextBudgets: ReadonlyMap<string, FrontierCodexContextBudgetReport> = new Map()
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
  const semanticEditAdmission = semanticEditAdmissionSummary(semanticQualities);
  const semanticEditScriptAdmission = semanticEditScriptAdmissionSummary(semanticEditScripts);
  mutable.jobs = dashboard.jobs.map((job) => {
    const quality = qualities.get(job.jobId) ?? summarizeCodexSemanticImportQuality(undefined, semanticImportExpected);
    return {
      ...job,
      semanticImportQuality: quality,
      semanticEditAdmission: quality.semanticEditAdmission,
      ...(contextBudgets.get(job.jobId) ? { contextBudget: contextBudgets.get(job.jobId) } : {})
    };
  });
  mutable.summary = {
    ...dashboard.summary,
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
    semanticEditAdmission,
    semanticEditScriptAdmission,
    semanticImportExpectedMissingReasonCodes: uniqueStrings(semanticQualities.flatMap((entry) => entry.expectedMissingReasonCodes))
  };
  mutable.metadata = {
    ...(mutable.metadata ?? {}),
    semanticImport: semanticImportMetadata(semanticQualities, semanticImportExpected)
  };
  return mutable;
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
