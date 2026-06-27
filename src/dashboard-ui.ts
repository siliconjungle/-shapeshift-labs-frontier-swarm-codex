import path from 'node:path';
import {
  FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_KIND,
  FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_VERSION
} from './constants.js';
import { isObject } from './common.js';
import { createDashboardHealthMetrics } from './dashboard-ui-health.js';
import { createDashboardHumanActions } from './dashboard-ui-human-actions.js';
import { dashboardJobFromCoordinatorJob, createDashboardJobs } from './dashboard-ui-jobs.js';
import { createLaneRows } from './dashboard-ui-lanes.js';
import { createDashboardQualityMetrics } from './dashboard-ui-quality.js';
import {
  createDashboardSemanticMetrics,
  createDashboardSemanticMetricsFromSummary
} from './dashboard-ui-semantic.js';
import {
  readArtifact,
  readCollectedDashboardSource
} from './dashboard-ui-sources.js';
import { createDashboardSummary } from './dashboard-ui-summary.js';
import { createDashboardTimeSeries } from './dashboard-ui-time-series.js';
import { dashboardArtifactRoots } from './dashboard-ui-workspace.js';
import { numberValue } from './dashboard-ui-values.js';
import {
  FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_FILE,
  codexProofParentApplyCandidateJobRows,
  projectCodexProofParentApplyCandidates
} from './proof-parent-apply-candidates.js';
import {
  mergeHumanActionsForProjection,
  modelTelemetrySummaryDashboardFields,
  readCodexRuntimeProjectionArtifacts,
  type FrontierCodexHumanActionBrokerState,
  type FrontierCodexModelTelemetrySummary
} from './runtime-projections.js';
import type { FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexContinuationResult } from './types-continuation.js';
import type { CollectedDashboardSource } from './dashboard-ui-types.js';
import type {
  FrontierCodexDashboardSnapshot,
  FrontierCodexDashboardSnapshotInput
} from './types-dashboard.js';
import type { FrontierCodexSwarmRunResult } from './types-run.js';
import type { FrontierCodexProofParentApplyCandidates } from './proof-parent-apply-candidates.js';

export {
  createCodexDashboardSteeringIntent,
  writeCodexDashboardSteeringIntent
} from './dashboard-ui-steering.js';

export async function readCodexDashboardSnapshot(input: FrontierCodexDashboardSnapshotInput = {}): Promise<FrontierCodexDashboardSnapshot> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const collectedDashboardSource = await readCollectedDashboardSource(cwd, input.collection);
  const continuationSource = await readArtifact<FrontierCodexContinuationResult>(cwd, input.continuation, 'continuation.json');
  if (collectedDashboardSource) {
    return dashboardSnapshotFromCoordinatorDashboard(cwd, collectedDashboardSource, continuationSource?.json);
  }
  const runSource = await readArtifact<FrontierCodexSwarmRunResult>(cwd, input.run, 'swarm-results.json');
  const fallbackCollectedDashboardSource = await readCollectedDashboardSource(cwd, runSource?.json?.outDir ? path.join(runSource.json.outDir, 'collected') : undefined);
  if (fallbackCollectedDashboardSource) {
    return dashboardSnapshotFromCoordinatorDashboard(cwd, fallbackCollectedDashboardSource, continuationSource?.json);
  }
  const collectionSource = await readArtifact<FrontierCodexCollectResult>(cwd, input.collection, 'collection.json')
    ?? await readArtifact<FrontierCodexCollectResult>(cwd, runSource?.json?.outDir ? path.join(runSource.json.outDir, 'collected') : undefined, 'collection.json');
  const fullContinuationSource = continuationSource
    ?? await readArtifact<FrontierCodexContinuationResult>(cwd, runSource?.json?.outDir ? path.join(runSource.json.outDir, 'continuation') : undefined, 'continuation.json');
  const run = runSource?.json ?? (collectionSource?.json?.runDir ? (await readArtifact<FrontierCodexSwarmRunResult>(cwd, collectionSource.json.runDir, 'swarm-results.json'))?.json : undefined);
  const collection = collectionSource?.json;
  const continuation = fullContinuationSource?.json;
  const proofParentApplyCandidates = await readProofParentApplyCandidates(cwd, input.collection, continuation);
  const runtimeProjections = await readCodexRuntimeProjectionArtifacts(run?.outDir ?? collection?.runDir);
  const artifactRoots = dashboardArtifactRoots(cwd, runSource?.dir, collectionSource?.dir, collection?.runDir, collection?.outDir);
  const collectionJobs = await createDashboardJobs(run, collection, { cwd, artifactRoots, artifactBases: artifactRoots });
  const jobs = mergeDashboardJobs(collectionJobs, proofParentApplyCandidateDashboardJobs(proofParentApplyCandidates));
  const semantic = createDashboardSemanticMetrics(collection, jobs);
  return createDashboardSnapshot({
    cwd,
    ok: Boolean(run?.ok ?? collection?.ok ?? continuation?.ok ?? proofParentApplyCandidates),
    sources: {
      ...(runSource?.file ? { runFile: runSource.file, runDir: runSource.dir } : {}),
      ...(collectionSource?.file ? { collectionFile: collectionSource.file, collectionDir: collectionSource.dir } : {}),
      ...(continuationSource?.file ? { continuationFile: continuationSource.file, continuationDir: continuationSource.dir } : {})
    },
    run,
    collection,
    continuation,
    proofParentApplyCandidates,
    modelTelemetrySummary: runtimeProjections.modelTelemetrySummary,
    humanActionState: runtimeProjections.humanActionState,
    jobs,
    semantic
  });
}

function dashboardSnapshotFromCoordinatorDashboard(
  cwd: string,
  source: CollectedDashboardSource,
  continuation: FrontierCodexContinuationResult | undefined
): FrontierCodexDashboardSnapshot {
  const dashboard = source.dashboard;
  const baseJobs = (Array.isArray(dashboard.jobs) ? dashboard.jobs : [])
    .map((job) => dashboardJobFromCoordinatorJob(job))
    .sort((left, right) => (left.lane ?? '').localeCompare(right.lane ?? '') || left.id.localeCompare(right.id));
  const proofParentApplyCandidates = continuation?.proofParentApplyCandidates;
  const jobs = mergeDashboardJobs(baseJobs, proofParentApplyCandidateDashboardJobs(proofParentApplyCandidates));
  const summaryRecord = isObject(dashboard.summary) ? dashboard.summary : {};
  const candidateProjection = projectCodexProofParentApplyCandidates(proofParentApplyCandidates);
  const semantic = createDashboardSemanticMetricsFromSummary(summaryRecord, jobs);
  const summary = {
    ...createDashboardSummary(undefined, undefined, continuation, jobs),
    ...(candidateProjection.summary.total > 0 ? {
      proofParentApplyCandidateCount: candidateProjection.summary.total,
      proofParentApplyCandidateReadyCount: candidateProjection.summary.readyForStrictApplyAdmission
    } : {}),
    bucketCounts: {
      total: numberValue(summaryRecord.jobCount, jobs.length),
      'ready-to-apply': numberValue(summaryRecord.readyToApplyCount),
      'research-complete': jobs.filter((job) => job.bucket === 'research-complete' || job.disposition === 'discovery-only' || job.disposition === 'evidence-only').length,
      'needs-human-port': numberValue(summaryRecord.needsHumanPortCount),
      'rerun-work': numberValue(summaryRecord.rerunWorkCount),
      'failed-evidence': numberValue(summaryRecord.failedEvidenceCount),
      'stale-against-head': numberValue(summaryRecord.staleAgainstHeadCount)
    }
  };
  return {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_VERSION,
    ok: true,
    generatedAt: Date.now(),
    cwd,
    sources: { collectionFile: source.file, collectionDir: source.dir },
    summary,
    semantic,
    health: createDashboardHealthMetrics(jobs),
    quality: createDashboardQualityMetrics(jobs, semantic),
    timeSeries: createDashboardTimeSeries(undefined, jobs),
    lanes: createLaneRows(jobs),
    jobs,
    humanActions: createDashboardHumanActions(dashboard),
    events: [],
    routing: continuationRouting(continuation),
    backlog: continuationBacklog(continuation),
    ...(candidateProjection.summary.total > 0 ? { proofParentApplyCandidates: candidateProjection } : {}),
    raw: { ...(continuation ? { continuation } : {}) }
  };
}

function createDashboardSnapshot(input: {
  cwd: string;
  ok: boolean;
  sources: FrontierCodexDashboardSnapshot['sources'];
  run?: FrontierCodexSwarmRunResult;
  collection?: FrontierCodexCollectResult;
  continuation?: FrontierCodexContinuationResult;
  proofParentApplyCandidates?: FrontierCodexProofParentApplyCandidates;
  modelTelemetrySummary?: FrontierCodexModelTelemetrySummary;
  humanActionState?: FrontierCodexHumanActionBrokerState;
  jobs: FrontierCodexDashboardSnapshot['jobs'];
  semantic: FrontierCodexDashboardSnapshot['semantic'];
}): FrontierCodexDashboardSnapshot {
  const summary = {
    ...createDashboardSummary(input.run, input.collection, input.continuation, input.jobs),
    ...modelTelemetrySummaryDashboardFields(input.modelTelemetrySummary),
    ...(proofParentApplyCandidateSummary(input.proofParentApplyCandidates)),
    ...(input.humanActionState ? {
      humanActionBrokerActionCount: input.humanActionState.actionCount,
      humanActionBrokerOpenCount: input.humanActionState.openActionCount,
      humanActionBrokerDismissedCount: input.humanActionState.dismissedActionCount
    } : {})
  };
  return {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_VERSION,
    ok: input.ok,
    generatedAt: Date.now(),
    cwd: input.cwd,
    sources: input.sources,
    summary,
    semantic: input.semantic,
    health: createDashboardHealthMetrics(input.jobs),
    quality: createDashboardQualityMetrics(input.jobs, input.semantic),
    timeSeries: createDashboardTimeSeries(input.run, input.jobs),
    lanes: createLaneRows(input.jobs),
    jobs: input.jobs,
    humanActions: createDashboardHumanActionRows(input.collection?.dashboard, input.humanActionState),
    events: (input.run?.run.events ?? []).slice(-80).map((event) => ({
      type: event.type,
      at: event.at,
      jobId: event.jobId,
      lane: event.lane,
      message: event.message
    })),
    routing: continuationRouting(input.continuation),
    backlog: continuationBacklog(input.continuation),
    ...(projectCodexProofParentApplyCandidates(input.proofParentApplyCandidates).summary.total > 0 ? {
      proofParentApplyCandidates: projectCodexProofParentApplyCandidates(input.proofParentApplyCandidates)
    } : {}),
    raw: { ...(input.run ? { run: input.run } : {}), ...(input.collection ? { collection: input.collection } : {}), ...(input.continuation ? { continuation: input.continuation } : {}) }
  };
}

function createDashboardHumanActionRows(
  dashboard: unknown,
  humanActionState: FrontierCodexHumanActionBrokerState | undefined
): FrontierCodexDashboardSnapshot['humanActions'] {
  const dashboardActions = createDashboardHumanActions(dashboard);
  if (!humanActionState) return dashboardActions;
  return createDashboardHumanActions({
    humanActions: mergeHumanActionsForProjection(
      humanActionState.actions,
      dashboardActions as unknown as Record<string, unknown>[]
    )
  });
}

function continuationRouting(continuation: FrontierCodexContinuationResult | undefined): FrontierCodexDashboardSnapshot['routing'] {
  return continuation ? {
    policyId: continuation.nextRoutingPolicy.id,
    defaultMode: continuation.nextRoutingPolicy.defaultMode,
    preferenceCount: continuation.summary.routingPreferenceCount,
    preferCount: continuation.summary.routingPreferences.preferCount,
    avoidCount: continuation.summary.routingPreferences.avoidCount,
    tournamentObservationCount: continuation.summary.tournamentObservationCount,
    tournamentRecommendationCount: continuation.summary.tournamentRecommendationCount
  } : undefined;
}

function continuationBacklog(continuation: FrontierCodexContinuationResult | undefined): FrontierCodexDashboardSnapshot['backlog'] {
  return continuation ? {
    id: continuation.nextBacklog.id,
    entryCount: continuation.nextBacklog.entries.length,
    readyCount: continuation.nextBacklog.summary.readyCount,
    childBacklogPaths: continuation.childBacklogPaths
  } : undefined;
}

async function readProofParentApplyCandidates(
  cwd: string,
  collection: string | undefined,
  continuation: FrontierCodexContinuationResult | undefined
): Promise<FrontierCodexProofParentApplyCandidates | undefined> {
  const direct = await readArtifact<FrontierCodexProofParentApplyCandidates>(cwd, collection, FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_FILE);
  if (direct?.json) return direct.json;
  if (continuation?.proofParentApplyCandidates) return continuation.proofParentApplyCandidates;
  const fromContinuationPath = await readArtifact<FrontierCodexProofParentApplyCandidates>(
    cwd,
    continuation?.proofParentApplyCandidateCollectionDir,
    FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_FILE
  );
  return fromContinuationPath?.json;
}

function proofParentApplyCandidateDashboardJobs(value: unknown): FrontierCodexDashboardSnapshot['jobs'] {
  return codexProofParentApplyCandidateJobRows(value).map((row) => dashboardJobFromCoordinatorJob(row));
}

function mergeDashboardJobs(
  jobs: FrontierCodexDashboardSnapshot['jobs'],
  candidates: FrontierCodexDashboardSnapshot['jobs']
): FrontierCodexDashboardSnapshot['jobs'] {
  const byId = new Set(jobs.map((job) => job.id));
  return [...jobs, ...candidates.filter((job) => !byId.has(job.id))]
    .sort((left, right) => (left.lane ?? '').localeCompare(right.lane ?? '') || left.id.localeCompare(right.id));
}

function proofParentApplyCandidateSummary(value: unknown): Record<string, unknown> {
  const projection = projectCodexProofParentApplyCandidates(value);
  return projection.summary.total > 0 ? {
    proofParentApplyCandidateCount: projection.summary.total,
    proofParentApplyCandidateReadyCount: projection.summary.readyForStrictApplyAdmission,
    proofParentApplyCandidateJobIds: projection.summary.jobIds
  } : {};
}
