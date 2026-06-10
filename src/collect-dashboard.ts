import type { FrontierSwarmCoordinatorDashboard } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexContextBudgetReport } from './index.js';
import { uniqueStrings } from './common.js';
import { summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { mergeSemanticEditScriptSummaries } from './semantic-edit-script.js';


export function enrichCollectedCoordinatorDashboard(
  dashboard: FrontierSwarmCoordinatorDashboard,
  qualities: ReadonlyMap<string, ReturnType<typeof summarizeCodexSemanticImportQuality>>,
  semanticImportExpected: boolean,
  contextBudgets: ReadonlyMap<string, FrontierCodexContextBudgetReport> = new Map()
): FrontierSwarmCoordinatorDashboard {
  const mutable = dashboard as FrontierSwarmCoordinatorDashboard & {
    jobs: Array<FrontierSwarmCoordinatorDashboard['jobs'][number] & {
      semanticImportQuality?: ReturnType<typeof summarizeCodexSemanticImportQuality>;
      contextBudget?: FrontierCodexContextBudgetReport;
    }>;
    summary: FrontierSwarmCoordinatorDashboard['summary'] & Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
  const semanticQualities = dashboard.jobs.map((job) => qualities.get(job.jobId) ?? summarizeCodexSemanticImportQuality(undefined, semanticImportExpected));
  const semanticEditScripts = mergeSemanticEditScriptSummaries(semanticQualities.map((entry) => entry.semanticEditScript));
  mutable.jobs = dashboard.jobs.map((job) => ({
    ...job,
    semanticImportQuality: qualities.get(job.jobId) ?? summarizeCodexSemanticImportQuality(undefined, semanticImportExpected),
    ...(contextBudgets.get(job.jobId) ? { contextBudget: contextBudgets.get(job.jobId) } : {})
  }));
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
    semanticLineageEventKinds: uniqueStrings(semanticQualities.flatMap((entry) => entry.semanticLineageEventKinds)),
    warningCount: semanticQualities.reduce((sum, entry) => sum + entry.warnings.length, 0),
    warnings: uniqueStrings(semanticQualities.flatMap((entry) => entry.warnings))
  };
}
