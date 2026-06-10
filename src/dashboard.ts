import type {
  FrontierSwarmCoordinatorDashboard,
  FrontierSwarmStrategyTournament
} from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_COMPACT_DASHBOARD_KIND, FRONTIER_SWARM_CODEX_COMPACT_DASHBOARD_VERSION } from './constants.js';
import type { FrontierCodexCompactDashboard, FrontierCodexTraceSummary } from './index.js';
import { uniqueStrings } from './common.js';
import { mergeSemanticFactSummaries } from './semantic-import-facts.js';
import { summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { mergeSemanticEditScriptSummaries } from './semantic-edit-script.js';
import { codexJobTraceSummary, summarizeCodexTraceSummaries } from './trace-summary.js';
import { contextBudgetFromCoordinatorJob } from './context-budget.js';


export function createCodexCompactDashboard(input: {
  runDir: string;
  dashboard: FrontierSwarmCoordinatorDashboard;
  strategyTournament: FrontierSwarmStrategyTournament;
  semanticImportExpected: boolean;
  generatedAt: number;
}): FrontierCodexCompactDashboard {
  const qualities = new Map(input.dashboard.jobs.map((job) => [
    job.jobId,
    summarizeCodexSemanticImportQuality(job.semanticImport, input.semanticImportExpected)
  ]));
  const semanticQualities = Array.from(qualities.values());
  const semanticFacts = mergeSemanticFactSummaries(semanticQualities.map((entry) => ({
    total: entry.semanticFacts,
    byPredicate: entry.semanticFactSummary,
    predicates: entry.semanticFactPredicates
  })));
  const semanticEditScripts = mergeSemanticEditScriptSummaries(semanticQualities.map((entry) => entry.semanticEditScript));
  const traceSummaries = input.dashboard.jobs
    .map((job) => codexJobTraceSummary(job))
    .filter((entry): entry is FrontierCodexTraceSummary => Boolean(entry));
  const traceSummary = summarizeCodexTraceSummaries(traceSummaries);
  const contextBudget = summarizeContextBudget(input.dashboard);
  const usefulPatchJobs = input.dashboard.jobs.filter((job) => (
    (job.disposition === 'auto-mergeable' || job.disposition === 'needs-port')
    && job.changedPaths.length > 0
    && job.tests.requiredFailed === 0
  ));
  const topJobs = [...input.dashboard.jobs]
    .filter((job) => job.changedPaths.length > 0 || job.evidencePaths.length > 0)
    .sort((left, right) => right.mergeScore - left.mergeScore || left.jobId.localeCompare(right.jobId))
    .slice(0, 20)
    .map((job) => ({
      jobId: job.jobId,
      ...(job.lane ? { lane: job.lane } : {}),
      disposition: job.disposition,
      mergeScore: job.mergeScore,
      changedPaths: job.changedPaths.slice(0, 12),
      semanticImportQuality: qualities.get(job.jobId),
      ...(contextBudgetFromCoordinatorJob(job) ? { contextBudget: contextBudgetFromCoordinatorJob(job) } : {}),
      ...(codexJobTraceSummary(job) ? { traceSummary: codexJobTraceSummary(job) } : {}),
      staleAgainstHead: job.staleAgainstHead,
      ...(job.duplicateGroupId ? { duplicateGroupId: job.duplicateGroupId } : {}),
      evidencePaths: job.evidencePaths.slice(0, 12)
    }));
  return {
    kind: FRONTIER_SWARM_CODEX_COMPACT_DASHBOARD_KIND,
    version: FRONTIER_SWARM_CODEX_COMPACT_DASHBOARD_VERSION,
    generatedAt: input.generatedAt,
    runDir: input.runDir,
    total: input.dashboard.summary.jobCount,
    activeJobs: input.dashboard.jobs.filter((job) => job.liveness === 'running').length,
    usefulPatchCount: usefulPatchJobs.length,
    stalePatchCount: input.dashboard.summary.staleAgainstHeadCount,
    duplicateDiscoveryCount: input.dashboard.duplicateGroups.length,
    tournament: summarizeTournament(input.strategyTournament),
    semanticImport: {
      expected: input.semanticImportExpected,
      expectedSatisfiedCount: semanticQualities.filter((entry) => entry.expected && entry.expectedSatisfied).length,
      expectedUnsatisfiedCount: semanticQualities.filter((entry) => entry.expected && !entry.expectedSatisfied).length,
      expectedMissingReasonCodes: uniqueStrings(semanticQualities.flatMap((entry) => entry.expectedMissingReasonCodes)),
      selectedCount: semanticQualities.reduce((sum, entry) => sum + entry.selected, 0),
      eligibleCount: semanticQualities.reduce((sum, entry) => sum + entry.eligible, 0),
      importedCount: semanticQualities.reduce((sum, entry) => sum + entry.imported, 0),
      candidateCount: semanticQualities.reduce((sum, entry) => sum + entry.candidates, 0),
      presentCount: semanticQualities.filter((entry) => entry.present).length,
      emptyCount: semanticQualities.filter((entry) => entry.empty).length,
      weakCount: semanticQualities.filter((entry) => entry.present && entry.warnings.length > 0).length,
      warningCount: semanticQualities.reduce((sum, entry) => sum + entry.warnings.length, 0),
      warnings: uniqueStrings(semanticQualities.flatMap((entry) => entry.warnings)),
      symbolCount: semanticQualities.reduce((sum, entry) => sum + entry.symbols, 0),
      ownershipRegionCount: semanticQualities.reduce((sum, entry) => sum + entry.ownershipRegions, 0),
      patchHintCount: semanticQualities.reduce((sum, entry) => sum + entry.patchHints, 0),
      semanticFactCount: semanticFacts.total,
      semanticFactPredicates: semanticFacts.predicates,
      semanticFactSummary: semanticFacts.byPredicate,
      dependencyRelationCount: semanticQualities.reduce((sum, entry) => sum + entry.dependencyRelations, 0),
      dependencyPredicates: uniqueStrings(semanticQualities.flatMap((entry) => entry.dependencyPredicates)),
      universalAstLayerCount: semanticQualities.reduce((sum, entry) => sum + entry.universalAstLayers, 0),
      universalAstLayerNames: uniqueStrings(semanticQualities.flatMap((entry) => entry.universalAstLayerNames)),
      proofSpecObligations: semanticQualities.reduce((sum, entry) => sum + entry.proofSpecObligations, 0),
      proofSpecFailedObligations: semanticQualities.reduce((sum, entry) => sum + entry.proofSpecFailedObligations, 0),
      paradigmSemanticsRecords: semanticQualities.reduce((sum, entry) => sum + entry.paradigmSemanticsRecords, 0),
      paradigmSemanticsGroups: semanticQualities.reduce((sum, entry) => sum + entry.paradigmSemanticsGroups, 0),
      paradigmSemanticsLoweringRecords: semanticQualities.reduce((sum, entry) => sum + entry.paradigmSemanticsLoweringRecords, 0),
      semanticLineageEvents: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageEvents, 0),
      semanticLineageMoved: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageMoved, 0),
      semanticLineageRenamed: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageRenamed, 0),
      semanticLineageDeleted: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageDeleted, 0),
      semanticLineageAmbiguous: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageAmbiguous, 0),
      semanticLineageBlocked: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageBlocked, 0),
      semanticLineageNeedsReview: semanticQualities.reduce((sum, entry) => sum + entry.semanticLineageNeedsReview, 0),
      semanticLineageEventKinds: uniqueStrings(semanticQualities.flatMap((entry) => entry.semanticLineageEventKinds)),
      semanticLineageReasonCodes: uniqueStrings(semanticQualities.flatMap((entry) => entry.semanticLineageReasonCodes)),
      semanticEditScripts
    },
    trace: {
      shardCount: traceSummary.shardCount,
      jobsWithTraceShards: traceSummaries.filter((entry) => entry.shardCount > 0).length,
      rowWindowCount: traceSummary.rowWindowCount,
      hypothesisCount: traceSummary.hypothesisCount,
      executableOwnershipRegionCount: traceSummary.executableOwnershipRegionCount,
      focusedTestCount: traceSummary.focusedTestCount,
      referenceEvidenceCount: traceSummary.referenceEvidenceCount,
      divergenceCount: traceSummary.divergenceCount,
      openDivergenceCount: traceSummary.openDivergenceCount
    },
    contextBudget,
    evidence: {
      readyToApply: input.dashboard.summary.readyToApplyCount,
      needsHumanPort: input.dashboard.summary.needsHumanPortCount,
      failedEvidence: input.dashboard.summary.failedEvidenceCount,
      averageMergeScore: input.dashboard.summary.averageMergeScore
    },
    topJobs
  };
}

function summarizeContextBudget(dashboard: FrontierSwarmCoordinatorDashboard): FrontierCodexCompactDashboard['contextBudget'] {
  const entries = dashboard.evidenceIndex?.entries ?? [];
  const facets = entries.map((entry) => entry.facets ?? {});
  const statuses = facets.map((entry) => String(entry.contextBudgetStatus ?? 'unknown'));
  const promptBytes = facets.map((entry) => Number(entry.contextBudgetPromptBytes ?? 0));
  const estimatedTokens = facets.map((entry) => Number(entry.contextBudgetEstimatedInputTokens ?? 0));
  const actualTokens = facets.map((entry) => Number(entry.contextBudgetActualInputTokens ?? 0));
  return {
    warningCount: statuses.filter((status) => status === 'warning').length,
    failedCount: statuses.filter((status) => status === 'failed').length,
    jobsWithActualUsage: actualTokens.filter((value) => value > 0).length,
    maxPromptBytes: Math.max(0, ...promptBytes),
    maxEstimatedInputTokens: Math.max(0, ...estimatedTokens),
    maxActualInputTokens: Math.max(0, ...actualTokens),
    warnings: uniqueStrings(facets.flatMap((entry) => String(entry.contextBudgetWarnings ?? '').split(',').filter(Boolean)))
  };
}

function summarizeTournament(tournament: FrontierSwarmStrategyTournament) {
  const totalScore = tournament.standings.reduce((sum, standing) => sum + standing.score, 0);
  const averageScore = tournament.standings.length ? Math.round((totalScore / tournament.standings.length) * 100) / 100 : 0;
  return {
    strategyCount: tournament.summary.strategyCount,
    gameCount: tournament.summary.gameCount,
    matchCount: tournament.summary.matchCount,
    averageScore,
    ...(tournament.summary.topStrategyId ? { topStrategyId: tournament.summary.topStrategyId } : {}),
    ...(tournament.summary.topScore !== undefined ? { topScore: tournament.summary.topScore } : {}),
    outcomeCounts: tournament.summary.outcomeCounts
  };
}
