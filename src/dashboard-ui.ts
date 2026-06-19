import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_KIND,
  FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_VERSION,
  FRONTIER_SWARM_CODEX_STEERING_INTENT_KIND,
  FRONTIER_SWARM_CODEX_STEERING_INTENT_VERSION
} from './constants.js';
import { isObject, stableHash, uniqueStrings } from './common.js';
import { estimateCodexModelCost } from './model-pricing.js';
import type { FrontierCodexCollectBucket, FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexContinuationResult } from './types-continuation.js';
import type {
  FrontierCodexDashboardJob,
  FrontierCodexDashboardHumanAction,
  FrontierCodexDashboardHumanActionPriority,
  FrontierCodexDashboardHumanActionType,
  FrontierCodexDashboardHealthMetrics,
  FrontierCodexDashboardHealthStatus,
  FrontierCodexDashboardIgnoredChangedPathReason,
  FrontierCodexDashboardQualityMetricPoint,
  FrontierCodexDashboardQualityMetricSeries,
  FrontierCodexDashboardQualityMetrics,
  FrontierCodexDashboardSemanticAdmissionMetrics,
  FrontierCodexDashboardSemanticMetrics,
  FrontierCodexDashboardSemanticReadiness,
  FrontierCodexDashboardSnapshot,
  FrontierCodexDashboardSnapshotInput,
  FrontierCodexDashboardTimeSeries,
  FrontierCodexDashboardTimeSeriesPoint,
  FrontierCodexDashboardSteeringIntent,
  FrontierCodexDashboardSteeringIntentInput,
  FrontierCodexDashboardSteeringWriteInput,
  FrontierCodexDashboardSteeringWriteResult
} from './types-dashboard.js';
import type { FrontierCodexSwarmRunResult } from './types-run.js';
import type { FrontierCodexWorkspaceProof } from './types-workspace.js';

const DASHBOARD_WORKSPACE_PROOF_MAX_BYTES = 512 * 1024;
const DASHBOARD_FULL_COLLECTION_MAX_BYTES = 64 * 1024 * 1024;
const DASHBOARD_IGNORED_CHANGED_PATH_SAMPLE_LIMIT = 12;
const DASHBOARD_QUALITY_SAMPLE_LIMIT = 12;
const DASHBOARD_TIME_SERIES_BUCKET_MS = 60 * 1000;

interface DashboardWorkspaceOwnershipEvidence {
  ignoredChangedPaths: string[];
  ignoredChangedPathCount: number;
  ignoredChangedPathReasonCounts: Record<string, number>;
  ignoredChangedPathSamples: string[];
  ignoredChangedPathReasonSamples: FrontierCodexDashboardIgnoredChangedPathReason[];
  observedChangedPathCount: number;
  reportedChangedPathCount: number;
}

interface DashboardArtifactContext {
  cwd: string;
  artifactRoots: string[];
  artifactBases: string[];
}

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
  const artifactRoots = dashboardArtifactRoots(cwd, runSource?.dir, collectionSource?.dir, collection?.runDir, collection?.outDir);
  const jobs = await createDashboardJobs(run, collection, {
    cwd,
    artifactRoots,
    artifactBases: artifactRoots
  });
  const summary = createDashboardSummary(run, collection, continuation, jobs);
  const semantic = createDashboardSemanticMetrics(collection);
  const health = createDashboardHealthMetrics(jobs);
  const timeSeries = createDashboardTimeSeries(run, jobs);
  return {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_SNAPSHOT_VERSION,
    ok: Boolean(run?.ok ?? collection?.ok ?? continuation?.ok ?? false),
    generatedAt: Date.now(),
    cwd,
    sources: {
      ...(runSource?.file ? { runFile: runSource.file, runDir: runSource.dir } : {}),
      ...(collectionSource?.file ? { collectionFile: collectionSource.file, collectionDir: collectionSource.dir } : {}),
      ...(continuationSource?.file ? { continuationFile: continuationSource.file, continuationDir: continuationSource.dir } : {})
    },
    summary,
    semantic,
    health,
    quality: createDashboardQualityMetrics(jobs, semantic),
    timeSeries,
    lanes: createLaneRows(jobs),
    jobs,
    humanActions: createDashboardHumanActions(collection?.dashboard),
    events: (run?.run.events ?? []).slice(-80).map((event) => ({
      type: event.type,
      at: event.at,
      jobId: event.jobId,
      lane: event.lane,
      message: event.message
    })),
    routing: continuation ? {
      policyId: continuation.nextRoutingPolicy.id,
      defaultMode: continuation.nextRoutingPolicy.defaultMode,
      preferenceCount: continuation.summary.routingPreferenceCount,
      preferCount: continuation.summary.routingPreferences.preferCount,
      avoidCount: continuation.summary.routingPreferences.avoidCount,
      tournamentObservationCount: continuation.summary.tournamentObservationCount,
      tournamentRecommendationCount: continuation.summary.tournamentRecommendationCount
    } : undefined,
    backlog: continuation ? {
      id: continuation.nextBacklog.id,
      entryCount: continuation.nextBacklog.entries.length,
      readyCount: continuation.nextBacklog.summary.readyCount,
      childBacklogPaths: continuation.childBacklogPaths
    } : undefined,
    raw: { ...(run ? { run } : {}), ...(collection ? { collection } : {}), ...(continuation ? { continuation } : {}) }
  };
}

interface CollectedDashboardSource {
  file: string;
  dir: string;
  dashboard: Record<string, unknown>;
}

async function readCollectedDashboardSource(cwd: string, value: string | undefined): Promise<CollectedDashboardSource | undefined> {
  if (!value) return undefined;
  const absolute = path.resolve(cwd, value);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (!stat) return undefined;
  const dir = stat.isDirectory() ? absolute : path.dirname(absolute);
  const collectionFile = stat.isDirectory() ? path.join(absolute, 'collection.json') : absolute;
  const collectionStat = await fs.stat(collectionFile).catch(() => undefined);
  if (collectionStat && collectionStat.size <= DASHBOARD_FULL_COLLECTION_MAX_BYTES) return undefined;
  const dashboardSource = await readArtifact<Record<string, unknown>>(cwd, dir, 'coordinator-query.json');
  if (!dashboardSource || !Array.isArray(dashboardSource.json.jobs)) return undefined;
  return {
    file: dashboardSource.file,
    dir: dashboardSource.dir,
    dashboard: dashboardSource.json
  };
}

function dashboardSnapshotFromCoordinatorDashboard(
  cwd: string,
  source: CollectedDashboardSource,
  continuation: FrontierCodexContinuationResult | undefined
): FrontierCodexDashboardSnapshot {
  const dashboard = source.dashboard;
  const jobs = (Array.isArray(dashboard.jobs) ? dashboard.jobs : [])
    .map((job) => dashboardJobFromCoordinatorJob(job))
    .sort((left, right) => (left.lane ?? '').localeCompare(right.lane ?? '') || left.id.localeCompare(right.id));
  const summaryRecord = isObject(dashboard.summary) ? dashboard.summary : {};
  const semantic = createDashboardSemanticMetricsFromSummary(summaryRecord);
  const summary = {
    ...createDashboardSummary(undefined, undefined, continuation, jobs),
    bucketCounts: {
      total: numberValue(summaryRecord.jobCount, jobs.length),
      'ready-to-apply': numberValue(summaryRecord.readyToApplyCount),
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
    sources: {
      collectionFile: source.file,
      collectionDir: source.dir
    },
    summary,
    semantic,
    health: createDashboardHealthMetrics(jobs),
    quality: createDashboardQualityMetrics(jobs, semantic),
    timeSeries: createDashboardTimeSeries(undefined, jobs),
    lanes: createLaneRows(jobs),
    jobs,
    humanActions: createDashboardHumanActions(dashboard),
    events: [],
    routing: continuation ? {
      policyId: continuation.nextRoutingPolicy.id,
      defaultMode: continuation.nextRoutingPolicy.defaultMode,
      preferenceCount: continuation.summary.routingPreferenceCount,
      preferCount: continuation.summary.routingPreferences.preferCount,
      avoidCount: continuation.summary.routingPreferences.avoidCount,
      tournamentObservationCount: continuation.summary.tournamentObservationCount,
      tournamentRecommendationCount: continuation.summary.tournamentRecommendationCount
    } : undefined,
    backlog: continuation ? {
      id: continuation.nextBacklog.id,
      entryCount: continuation.nextBacklog.entries.length,
      readyCount: continuation.nextBacklog.summary.readyCount,
      childBacklogPaths: continuation.childBacklogPaths
    } : undefined,
    raw: { ...(continuation ? { continuation } : {}) }
  };
}

export function createCodexDashboardSteeringIntent(input: FrontierCodexDashboardSteeringIntentInput): FrontierCodexDashboardSteeringIntent {
  const generatedAt = Date.now();
  const laneFocus = uniqueStrings([...(input.laneFocus ?? [])]);
  const tags = uniqueStrings(['loom-ui', ...(input.tags ?? [])]);
  const maxConcurrency = input.maxConcurrency === undefined ? undefined : Math.max(1, Math.floor(input.maxConcurrency));
  return {
    kind: FRONTIER_SWARM_CODEX_STEERING_INTENT_KIND,
    version: FRONTIER_SWARM_CODEX_STEERING_INTENT_VERSION,
    id: 'codex-dashboard-steering:' + stableHash([input.run, input.collection, input.continuation, input.routingMode, maxConcurrency, laneFocus, input.modelTierPreference, input.nextWaveNote, generatedAt]),
    generatedAt,
    target: {
      ...(input.run ? { run: input.run } : {}),
      ...(input.collection ? { collection: input.collection } : {}),
      ...(input.continuation ? { continuation: input.continuation } : {})
    },
    ...(input.routingMode ? { routingMode: input.routingMode } : {}),
    ...(maxConcurrency ? { maxConcurrency } : {}),
    laneFocus,
    ...(input.modelTierPreference ? { modelTierPreference: input.modelTierPreference } : {}),
    ...(input.nextWaveNote ? { nextWaveNote: input.nextWaveNote } : {}),
    tags,
    metadata: { ...(input.metadata ?? {}) }
  };
}

export async function writeCodexDashboardSteeringIntent(input: FrontierCodexDashboardSteeringWriteInput): Promise<FrontierCodexDashboardSteeringWriteResult> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const intent = isSteeringIntent(input.intent) ? input.intent : createCodexDashboardSteeringIntent(input.intent);
  const baseDir = path.resolve(cwd, input.outDir ?? 'agent-runs/loom-ui-steering');
  const file = input.file
    ? path.resolve(cwd, input.file)
    : path.join(baseDir, `steering-intent-${intent.generatedAt}.json`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(intent, null, 2) + '\n');
  return { ok: true, file, intent };
}

function createDashboardSemanticMetrics(
  collection: FrontierCodexCollectResult | undefined
): FrontierCodexDashboardSemanticMetrics {
  const collectionDashboard = (isObject(collection?.dashboard) ? collection.dashboard : {}) as Record<string, unknown>;
  const collectionSummary = (isObject(collection?.summary) ? collection.summary : {}) as Record<string, unknown>;
  const dashboardSummary = (isObject(collectionDashboard.summary) ? collectionDashboard.summary : {}) as Record<string, unknown>;
  return createDashboardSemanticMetricsFromSummary({ ...collectionSummary, ...dashboardSummary });
}

function createDashboardSemanticMetricsFromSummary(
  summary: Record<string, unknown>
): FrontierCodexDashboardSemanticMetrics {
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

function dashboardJobFromCoordinatorJob(value: unknown): FrontierCodexDashboardJob {
  const job = isObject(value) ? value : {};
  const contextBudget = isObject(job.contextBudget) ? job.contextBudget : {};
  const measuredBudget = isObject(contextBudget.measured) ? contextBudget.measured : {};
  const usageBudget = isObject(contextBudget.usage) ? contextBudget.usage : {};
  const semanticAdmission = isObject(job.semanticEditAdmission) ? job.semanticEditAdmission : {};
  const changedPaths = stringArrayValue(job.changedPaths);
  const ownershipViolations = stringArrayValue(job.ownershipViolations);
  const sourceOwnershipViolations = stringArrayValue(job.sourceOwnershipViolations);
  const effectiveSourceOwnershipViolations = sourceOwnershipViolations.length ? sourceOwnershipViolations : ownershipViolations;
  const ignoredOwnershipViolations = stringArrayValue(job.ignoredOwnershipViolations);
  const quarantinedChangedPaths = stringArrayValue(job.quarantinedChangedPaths);
  const contextBudgetWarnings = stringArrayValue(contextBudget.warnings);
  const contextBudgetErrors = stringArrayValue(contextBudget.errors);
  const startedAt = timestampValue(job.startedAt);
  const finishedAt = timestampValue(job.finishedAt);
  const semanticAdmissionStatus = stringValue(job.semanticEditAdmissionStatus ?? semanticAdmission.status);
  const semanticAutoMergeCandidate = booleanValue(job.semanticAutoMergeCandidate ?? semanticAdmission.autoMergeCandidate);
  const semanticCleanEligible = booleanValue(job.semanticCleanEligible ?? semanticAdmission.cleanEligible);
  const semanticReadinessReasons = stringListValue(job.semanticReadinessReasons ?? semanticAdmission.reasons);
  const actualInputTokens = numberValue(usageBudget.inputTokens, numberValue(measuredBudget.actualInputTokens));
  const cachedInputTokens = numberValue(usageBudget.cachedInputTokens);
  const uncachedInputTokens = numberValue(usageBudget.uncachedInputTokens, Math.max(0, actualInputTokens - cachedInputTokens));
  const outputTokens = numberValue(usageBudget.outputTokens);
  const model = stringValue(job.model);
  const costEstimate = estimateCodexModelCost({
    model,
    estimatedInputTokens: numberValue(measuredBudget.estimatedInputTokens, numberValue(job.estimatedInputTokens)),
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens: optionalNumberValue(usageBudget.outputTokens)
  });
  const row = {
    id: String(job.jobId ?? job.id ?? ''),
    taskId: stringValue(job.taskId),
    title: stringValue(job.title),
    lane: stringValue(job.lane),
    status: stringValue(job.status),
    startedAt,
    finishedAt,
    durationMs: dashboardDurationMs(startedAt, finishedAt),
    generatedAt: timestampValue(job.generatedAt),
    health: 'unknown' as FrontierCodexDashboardHealthStatus,
    computeId: stringValue(job.computeId),
    model,
    modelTier: stringValue(job.modelTier),
    workKind: stringValue(job.workKind),
    bucket: dashboardBucketFromCoordinatorJob(job),
    mergeReadiness: stringValue(job.mergeReadiness),
    disposition: stringValue(job.disposition),
    changedPaths,
    ownershipViolations,
    sourceOwnershipViolations: effectiveSourceOwnershipViolations,
    ignoredOwnershipViolations,
    quarantinedChangedPaths,
    ignoredChangedPathSamples: stringArrayValue(job.ignoredChangedPathSamples),
    ignoredChangedPathReasonSamples: ignoredChangedPathReasonArrayValue(job.ignoredChangedPathReasonSamples),
    changedPathCount: numberValue(job.changedPathCount, changedPaths.length),
    ownershipViolationCount: numberValue(job.ownershipViolationCount, ownershipViolations.length),
    sourceOwnershipViolationCount: numberValue(job.sourceOwnershipViolationCount, effectiveSourceOwnershipViolations.length),
    ignoredOwnershipViolationCount: numberValue(job.ignoredOwnershipViolationCount, ignoredOwnershipViolations.length),
    quarantinedChangedPathCount: numberValue(job.quarantinedChangedPathCount, quarantinedChangedPaths.length),
    ignoredChangedPathCount: numberValue(job.ignoredChangedPathCount),
    ignoredChangedPathReasonCounts: numberRecordValue(job.ignoredChangedPathReasonCounts),
    observedChangedPathCount: numberValue(job.observedChangedPathCount),
    reportedChangedPathCount: numberValue(job.reportedChangedPathCount),
    contextBudgetStatus: stringValue(contextBudget.status ?? job.contextBudgetStatus),
    contextBudgetWarningCount: numberValue(job.contextBudgetWarningCount, contextBudgetWarnings.length),
    contextBudgetErrorCount: numberValue(job.contextBudgetErrorCount, contextBudgetErrors.length),
    contextBudgetWarnings,
    contextBudgetErrors,
    evidencePathCount: stringArrayValue(job.evidencePaths).length,
    promptBytes: numberValue(measuredBudget.promptBytes, numberValue(job.promptBytes)),
    estimatedInputTokens: numberValue(measuredBudget.estimatedInputTokens, numberValue(job.estimatedInputTokens)),
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    ...dashboardCostFields(costEstimate),
    semanticAdmissionStatus,
    semanticAutoMergeCandidate,
    semanticCleanEligible,
    semanticReadiness: dashboardSemanticReadiness({
      semanticAdmissionStatus,
      semanticAutoMergeCandidate,
      semanticCleanEligible,
      disposition: stringValue(job.disposition),
      reasons: Array.isArray(job.reasons) ? job.reasons.map(String) : []
    }),
    semanticReadinessReasons,
    eventBytes: numberValue(job.eventBytes),
    eventBytesTruncated: numberValue(job.eventBytesTruncated),
    stderrBytes: numberValue(job.stderrBytes),
    stderrBytesTruncated: numberValue(job.stderrBytesTruncated),
    collectReasonClasses: stringListValue(job.collectReasonClasses),
    reasons: stringListValue(job.reasons)
  };
  row.health = dashboardJobHealth(row);
  return row;
}

function dashboardBucketFromCoordinatorJob(job: Record<string, unknown>): FrontierCodexCollectBucket | undefined {
  const disposition = stringValue(job.disposition);
  const status = stringValue(job.status);
  if (disposition === 'needs-port' || disposition === 'needs-human-port') return 'needs-human-port';
  if (disposition === 'ready-to-apply' || disposition === 'auto-mergeable') return 'ready-to-apply';
  if (disposition === 'rerun-work' || disposition === 'ownership-rescope') return 'rerun-work';
  if (disposition === 'stale-against-head' || disposition === 'stale' || booleanValue(job.staleAgainstHead)) return 'stale-against-head';
  if (dashboardRecordIndicatesFailedEvidence(job) || status === 'failed') return 'failed-evidence';
  return undefined;
}

function createDashboardSummary(
  run: FrontierCodexSwarmRunResult | undefined,
  collection: FrontierCodexCollectResult | undefined,
  continuation: FrontierCodexContinuationResult | undefined,
  jobs: readonly FrontierCodexDashboardJob[]
): FrontierCodexDashboardSnapshot['summary'] {
  const terminalJobs = jobs.filter(isDashboardTerminalJob);
  const failureJobs = jobs.filter(isDashboardFailureJob);
  const warningJobs = jobs.filter((job) => job.health === 'warning');
  const contextWarningJobs = jobs.filter(isDashboardContextBudgetWarningJob);
  const contextFailedJobs = jobs.filter(isDashboardContextBudgetFailedJob);
  const semanticCleanJobs = jobs.filter((job) => job.semanticReadiness === 'clean');
  const semanticCandidateJobs = jobs.filter((job) => job.semanticReadiness === 'candidate');
  const semanticBlockedJobs = jobs.filter((job) => job.semanticReadiness === 'blocked');
  const durationJobs = jobs.filter((job) => job.durationMs > 0);
  const costSignalJobs = jobs.filter(hasDashboardCostSignal);
  const applyLedger = collection?.summary.applyLedger;
  const landed = applyLedger?.landed ?? collection?.summary.landed;
  const landedJobIds = applyLedger?.landedJobIds ?? collection?.summary.landedJobIds;
  return {
    jobCount: jobs.length,
    completedCount: jobs.filter((job) => job.status === 'completed').length,
    failedCount: jobs.filter((job) => job.status === 'failed').length,
    runningCount: jobs.filter((job) => job.status === 'running').length,
    blockedCount: jobs.filter((job) => job.status === 'blocked').length,
    changedPathCount: jobs.reduce((sum, job) => sum + job.changedPathCount, 0),
    ownershipViolationCount: jobs.reduce((sum, job) => sum + job.ownershipViolationCount, 0),
    sourceOwnershipViolationCount: jobs.reduce((sum, job) => sum + job.sourceOwnershipViolationCount, 0),
    ignoredOwnershipViolationCount: jobs.reduce((sum, job) => sum + job.ignoredOwnershipViolationCount, 0),
    quarantinedChangedPathCount: jobs.reduce((sum, job) => sum + job.quarantinedChangedPathCount, 0),
    ignoredChangedPathCount: jobs.reduce((sum, job) => sum + job.ignoredChangedPathCount, 0),
    terminalCount: terminalJobs.length,
    failureCount: failureJobs.length,
    warningCount: warningJobs.length,
    contextWarningCount: contextWarningJobs.length,
    contextFailedCount: contextFailedJobs.length,
    semanticCleanCount: semanticCleanJobs.length,
    semanticCandidateCount: semanticCandidateJobs.length,
    semanticBlockedCount: semanticBlockedJobs.length,
    durationMs: durationJobs.reduce((sum, job) => sum + job.durationMs, 0),
    averageDurationMs: averageJobMetric(durationJobs, (job) => job.durationMs),
    maxDurationMs: maxJobMetric(durationJobs, (job) => job.durationMs),
    actualInputTokens: jobs.reduce((sum, job) => sum + job.actualInputTokens, 0),
    cachedInputTokens: jobs.reduce((sum, job) => sum + job.cachedInputTokens, 0),
    uncachedInputTokens: jobs.reduce((sum, job) => sum + job.uncachedInputTokens, 0),
    outputTokens: jobs.reduce((sum, job) => sum + job.outputTokens, 0),
    billableInputTokens: jobs.reduce((sum, job) => sum + job.billableInputTokens, 0),
    priceKnownJobCount: costSignalJobs.filter((job) => job.priceKnown).length,
    unknownPriceJobCount: costSignalJobs.filter((job) => !job.priceKnown).length,
    inputOnlyCostJobCount: costSignalJobs.filter((job) => job.costEstimateInputOnly).length,
    estimatedInputCostJobCount: costSignalJobs.filter((job) => job.costEstimateEstimatedInput).length,
    estimatedCostUsd: roundDashboardUsd(jobs.reduce((sum, job) => sum + job.estimatedCostUsd, 0)),
    estimatedInputCostUsd: roundDashboardUsd(jobs.reduce((sum, job) => sum + job.estimatedInputCostUsd, 0)),
    estimatedOutputCostUsd: roundDashboardUsd(jobs.reduce((sum, job) => sum + job.estimatedOutputCostUsd, 0)),
    estimatedCostMicroUsd: jobs.reduce((sum, job) => sum + job.estimatedCostMicroUsd, 0),
    ...(collection ? { bucketCounts: collection.summary } : {}),
    ...(landed !== undefined ? { landed } : {}),
    ...(landedJobIds ? { landedJobIds } : {}),
    ...(applyLedger ? {
      applyLedgerLandedCount: applyLedger.landed,
      applyLedger
    } : {}),
    ...(continuation ? {
      childBacklogEntryCount: continuation.summary.childBacklogEntryCount,
      routingFeedbackCount: continuation.summary.totalRoutingFeedbackCount,
      routingPreferenceCount: continuation.summary.routingPreferenceCount,
      nextJobCount: continuation.summary.nextJobCount,
      nextJobRoutedCount: continuation.summary.nextJobRouting.routedJobCount,
      nextJobChangedComputeCount: continuation.summary.nextJobRouting.changedComputeCount,
      nextJobRoutingFeedbackMatchCount: continuation.summary.nextJobRouting.policyFeedbackMatchCount,
      nextJobRoutingCostSignalCount: continuation.summary.nextJobRouting.policyCostSignalCount
    } : {}),
    ...(run && jobs.length === 0 ? { jobCount: run.run.jobs.length } : {})
  };
}

function createDashboardQualityMetrics(
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
        qualityMetricPoint('violations', 'Violations', sourceOwnershipViolationCount, {
          jobCount: sourceOwnershipJobs.length,
          pathCount: sourceOwnershipPaths.length,
          jobIds: sampleJobIds(sourceOwnershipJobs),
          paths: sourceOwnershipPaths
        }),
        qualityMetricPoint('jobs', 'Jobs', sourceOwnershipJobs.length, {
          jobCount: sourceOwnershipJobs.length,
          jobIds: sampleJobIds(sourceOwnershipJobs)
        })
      ]),
      ignoredChangedPaths: qualityMetricSeries('ignored-changed-paths', 'Ignored changed paths', ignoredChangedPathCount, [
        ...recordQualityMetricPoints('reason', ignoredReasonCounts),
        qualityMetricPoint('jobs', 'Jobs', ignoredChangedPathJobs.length, {
          jobCount: ignoredChangedPathJobs.length,
          jobIds: sampleJobIds(ignoredChangedPathJobs),
          pathCount: ignoredChangedPathSamples.length,
          paths: ignoredChangedPathSamples
        })
      ]),
      generatedChangedPaths: qualityMetricSeries('generated-changed-paths', 'Generated changed paths', generatedChangedPathCount, [
        qualityMetricPoint('paths', 'Paths', generatedChangedPathCount, {
          jobCount: generatedChangedPathJobs.length,
          pathCount: generatedChangedPathSamples.length,
          jobIds: sampleJobIds(generatedChangedPathJobs),
          paths: generatedChangedPathSamples
        }),
        qualityMetricPoint('jobs', 'Jobs', generatedChangedPathJobs.length, {
          jobCount: generatedChangedPathJobs.length,
          jobIds: sampleJobIds(generatedChangedPathJobs)
        })
      ]),
      quarantines: qualityMetricSeries('quarantines', 'Quarantines', quarantinedChangedPathCount, [
        qualityMetricPoint('paths', 'Paths', quarantinedChangedPathCount, {
          jobCount: quarantinedJobs.length,
          pathCount: quarantinedPaths.length,
          jobIds: sampleJobIds(quarantinedJobs),
          paths: quarantinedPaths
        }),
        qualityMetricPoint('jobs', 'Jobs', quarantinedJobs.length, {
          jobCount: quarantinedJobs.length,
          jobIds: sampleJobIds(quarantinedJobs)
        })
      ]),
      failures: qualityMetricSeries('failures', 'Failures', failureJobs.length, [
        qualityMetricPoint('failed-evidence', 'Failed evidence', failedEvidenceJobs.length, {
          jobCount: failedEvidenceJobs.length,
          jobIds: sampleJobIds(failedEvidenceJobs)
        }),
        qualityMetricPoint('failed-status', 'Failed status', failedStatusJobs.length, {
          jobCount: failedStatusJobs.length,
          jobIds: sampleJobIds(failedStatusJobs)
        }),
        qualityMetricPoint('blocked', 'Blocked', blockedJobs.length, {
          jobCount: blockedJobs.length,
          jobIds: sampleJobIds(blockedJobs)
        }),
        qualityMetricPoint('rejected', 'Rejected', rejectedJobs.length, {
          jobCount: rejectedJobs.length,
          jobIds: sampleJobIds(rejectedJobs)
        })
      ]),
      needsPort: qualityMetricSeries('needs-port', 'Coordinator review', needsPortJobs.length, [
        qualityMetricPoint('jobs', 'Manual merge review', needsPortJobs.length, {
          jobCount: needsPortJobs.length,
          jobIds: sampleJobIds(needsPortJobs)
        })
      ]),
      stale: qualityMetricSeries('stale', 'Stale', staleJobs.length, [
        qualityMetricPoint('jobs', 'Jobs', staleJobs.length, {
          jobCount: staleJobs.length,
          jobIds: sampleJobIds(staleJobs)
        })
      ]),
      semanticAdmissions: qualityMetricSeries('semantic-admissions', 'Semantic admissions', semanticAdmissionJobTotal + semanticAdmissionScriptTotal, [
        ...recordQualityMetricPoints('job', semantic.admission.jobs.statusCounts),
        ...recordQualityMetricPoints('script', semantic.admission.scripts.statusCounts)
      ]),
      contextBudget: qualityMetricSeries('context-budget', 'Context budget', contextBudgetJobs.length, [
        qualityMetricPoint('jobs', 'Jobs', contextBudgetJobs.length, {
          jobCount: contextBudgetJobs.length,
          jobIds: sampleJobIds(contextBudgetJobs)
        }),
        qualityMetricPoint('warning', 'Warning', contextBudgetWarningJobs.length, {
          jobCount: contextBudgetWarningJobs.length,
          jobIds: sampleJobIds(contextBudgetWarningJobs),
          warnings: sampleQualityStrings(contextBudgetWarningJobs.flatMap((job) => job.contextBudgetWarnings))
        }),
        qualityMetricPoint('failed', 'Failed', contextBudgetFailedJobs.length, {
          jobCount: contextBudgetFailedJobs.length,
          jobIds: sampleJobIds(contextBudgetFailedJobs),
          errors: sampleQualityStrings(contextBudgetFailedJobs.flatMap((job) => job.contextBudgetErrors))
        }),
        qualityMetricPoint('actual-usage', 'Actual usage', contextBudgetActualUsageJobs.length, {
          jobCount: contextBudgetActualUsageJobs.length,
          jobIds: sampleJobIds(contextBudgetActualUsageJobs)
        })
      ])
    }
  };
}

function createDashboardHealthMetrics(jobs: readonly FrontierCodexDashboardJob[]): FrontierCodexDashboardHealthMetrics {
  const healthyJobs = jobs.filter((job) => job.health === 'healthy');
  const warningJobs = jobs.filter((job) => job.health === 'warning');
  const failedJobs = jobs.filter((job) => job.health === 'failed');
  const blockedJobs = jobs.filter((job) => job.health === 'blocked');
  const runningJobs = jobs.filter((job) => job.health === 'running');
  const unknownJobs = jobs.filter((job) => job.health === 'unknown');
  const terminalJobs = jobs.filter(isDashboardTerminalJob);
  const readyToApplyJobs = jobs.filter((job) => job.bucket === 'ready-to-apply' || job.disposition === 'ready-to-apply');
  const notReadyToApplyJobCount = Math.max(0, jobs.length - readyToApplyJobs.length);
  const contextWarningJobs = jobs.filter(isDashboardContextBudgetWarningJob);
  const contextFailedJobs = jobs.filter(isDashboardContextBudgetFailedJob);
  const semanticCleanJobs = jobs.filter((job) => job.semanticReadiness === 'clean');
  const semanticCandidateJobs = jobs.filter((job) => job.semanticReadiness === 'candidate');
  const semanticBlockedJobs = jobs.filter((job) => job.semanticReadiness === 'blocked');
  const semanticUnknownJobs = jobs.filter((job) => job.semanticReadiness === 'unknown');
  const durationJobs = jobs.filter((job) => job.durationMs > 0);
  const failedOrBlockedCount = failedJobs.length + blockedJobs.length;
  const status: FrontierCodexDashboardHealthStatus = failedJobs.length > 0
    ? 'failed'
    : blockedJobs.length > 0
      ? 'blocked'
      : warningJobs.length > 0
        ? 'warning'
        : runningJobs.length > 0
          ? 'running'
          : unknownJobs.length === jobs.length && jobs.length > 0
            ? 'unknown'
            : 'healthy';
  return {
    status,
    summary: {
      jobCount: jobs.length,
      healthyJobCount: healthyJobs.length,
      warningJobCount: warningJobs.length,
      failedJobCount: failedJobs.length,
      blockedJobCount: blockedJobs.length,
      runningJobCount: runningJobs.length,
      unknownJobCount: unknownJobs.length,
      terminalJobCount: terminalJobs.length,
      readyToApplyJobCount: readyToApplyJobs.length,
      notReadyToApplyJobCount,
      contextWarningJobCount: contextWarningJobs.length,
      contextFailedJobCount: contextFailedJobs.length,
      semanticCleanJobCount: semanticCleanJobs.length,
      semanticCandidateJobCount: semanticCandidateJobs.length,
      semanticBlockedJobCount: semanticBlockedJobs.length,
      semanticUnknownJobCount: semanticUnknownJobs.length,
      durationMs: durationJobs.reduce((sum, job) => sum + job.durationMs, 0),
      averageDurationMs: averageJobMetric(durationJobs, (job) => job.durationMs),
      maxDurationMs: maxJobMetric(durationJobs, (job) => job.durationMs),
      actualInputTokens: jobs.reduce((sum, job) => sum + job.actualInputTokens, 0),
      cachedInputTokens: jobs.reduce((sum, job) => sum + job.cachedInputTokens, 0),
      uncachedInputTokens: jobs.reduce((sum, job) => sum + job.uncachedInputTokens, 0),
      failureRatio: ratio(failedOrBlockedCount, jobs.length),
      completionRatio: ratio(terminalJobs.length, jobs.length)
    },
    points: [
      qualityMetricPoint('healthy', 'Healthy', healthyJobs.length, { jobCount: healthyJobs.length, jobIds: sampleJobIds(healthyJobs) }),
      qualityMetricPoint('warning', 'Warning', warningJobs.length, { jobCount: warningJobs.length, jobIds: sampleJobIds(warningJobs) }),
      qualityMetricPoint('failed', 'Failed', failedJobs.length, { jobCount: failedJobs.length, jobIds: sampleJobIds(failedJobs) }),
      qualityMetricPoint('blocked', 'Blocked', blockedJobs.length, { jobCount: blockedJobs.length, jobIds: sampleJobIds(blockedJobs) }),
      qualityMetricPoint('running', 'Running', runningJobs.length, { jobCount: runningJobs.length, jobIds: sampleJobIds(runningJobs) }),
      qualityMetricPoint('semantic:clean', 'Semantic clean', semanticCleanJobs.length, { jobCount: semanticCleanJobs.length, jobIds: sampleJobIds(semanticCleanJobs) }),
      qualityMetricPoint('semantic:candidate', 'Semantic candidate', semanticCandidateJobs.length, { jobCount: semanticCandidateJobs.length, jobIds: sampleJobIds(semanticCandidateJobs) }),
      qualityMetricPoint('semantic:blocked', 'Semantic blocked', semanticBlockedJobs.length, { jobCount: semanticBlockedJobs.length, jobIds: sampleJobIds(semanticBlockedJobs) }),
      qualityMetricPoint('context:warning', 'Context warning', contextWarningJobs.length, {
        jobCount: contextWarningJobs.length,
        jobIds: sampleJobIds(contextWarningJobs),
        warnings: sampleQualityStrings(contextWarningJobs.flatMap((job) => job.contextBudgetWarnings))
      }),
      qualityMetricPoint('context:failed', 'Context failed', contextFailedJobs.length, {
        jobCount: contextFailedJobs.length,
        jobIds: sampleJobIds(contextFailedJobs),
        errors: sampleQualityStrings(contextFailedJobs.flatMap((job) => job.contextBudgetErrors))
      })
    ]
  };
}

function isDashboardFailureJob(job: FrontierCodexDashboardJob): boolean {
  if (job.bucket === 'rerun-work') return false;
  return isDashboardFailedEvidenceJob(job)
    || isDashboardBlockedJob(job)
    || isDashboardContextBudgetFailedJob(job)
    || job.sourceOwnershipViolationCount > 0
    || job.quarantinedChangedPathCount > 0;
}

function dashboardJobHealth(job: FrontierCodexDashboardJob): FrontierCodexDashboardHealthStatus {
  if (job.status === 'running') return 'running';
  if (job.bucket === 'rerun-work') return 'warning';
  if (isDashboardFailedEvidenceJob(job)) return 'failed';
  if (isDashboardBlockedJob(job)) return 'blocked';
  if (isDashboardContextBudgetFailedJob(job)) return 'failed';
  if (job.sourceOwnershipViolationCount > 0 || job.quarantinedChangedPathCount > 0) return 'failed';
  if (isDashboardContextBudgetWarningJob(job) || isDashboardNeedsPortJob(job) || isDashboardStaleJob(job)) return 'warning';
  if (job.semanticReadiness === 'blocked' || job.semanticReadiness === 'needs-port' || job.semanticReadiness === 'stale') return 'warning';
  if (job.bucket === 'ready-to-apply' || job.disposition === 'ready-to-apply' || job.status === 'completed') return 'healthy';
  return 'unknown';
}

function dashboardSemanticReadiness(input: {
  semanticAdmissionStatus?: string;
  semanticAutoMergeCandidate: boolean;
  semanticCleanEligible: boolean;
  disposition?: string;
  reasons: readonly string[];
}): FrontierCodexDashboardSemanticReadiness {
  const status = input.semanticAdmissionStatus ?? '';
  const haystack = [status, input.disposition ?? '', ...input.reasons].join(' ').toLowerCase();
  if (input.semanticAutoMergeCandidate && input.semanticCleanEligible) return 'clean';
  if (input.semanticAutoMergeCandidate || status === 'auto-merge-candidate') return 'candidate';
  if (haystack.includes('needs-port')) return 'needs-port';
  if (haystack.includes('stale')) return 'stale';
  if (haystack.includes('blocked') || haystack.includes('conflict')) return 'blocked';
  return 'unknown';
}

function isDashboardTerminalJob(job: FrontierCodexDashboardJob): boolean {
  return job.finishedAt !== undefined
    || (job.generatedAt !== undefined && Boolean(job.bucket))
    || ['completed', 'failed', 'blocked', 'cancelled', 'canceled', 'timed-out', 'timeout'].includes(job.status ?? '')
    || ['rejected', 'blocked', 'needs-port', 'stale-against-head'].includes(job.disposition ?? '');
}

function isDashboardBlockedJob(job: FrontierCodexDashboardJob): boolean {
  return job.status === 'blocked'
    || job.disposition === 'blocked';
}

function isDashboardFailedEvidenceJob(job: FrontierCodexDashboardJob): boolean {
  if (job.status === 'failed') return true;
  if (job.bucket === 'failed-evidence' || job.disposition === 'failed-evidence') return true;
  if (job.disposition !== 'rejected') return false;
  return dashboardFailureReasonTokens(job.reasons, job.collectReasonClasses).length > 0;
}

function dashboardRecordIndicatesFailedEvidence(job: Record<string, unknown>): boolean {
  const disposition = stringValue(job.disposition);
  const status = stringValue(job.status);
  if (status === 'failed' || disposition === 'failed-evidence') return true;
  if (disposition !== 'rejected') return false;
  return dashboardFailureReasonTokens(
    stringListValue(job.reasons),
    stringListValue(job.collectReasonClasses)
  ).length > 0;
}

function dashboardFailureReasonTokens(...groups: readonly string[][]): string[] {
  const tokens = uniqueStrings(groups.flat()).map((token) => token.toLowerCase());
  return tokens.filter((token) => token === 'failed'
    || token === 'failed-evidence'
    || token === 'failed-or-invalid-evidence'
    || token === 'failed-verification'
    || token === 'no-source-changes'
    || token === 'worker-error'
    || token === 'generated-failed-evidence'
    || token === 'patch-missing'
    || token === 'bundle-missing'
    || token === 'malformed-patch'
    || token === 'patch-apply-failed'
    || token === 'source-blocker'
    || token.startsWith('worker-exit-nonzero:')
    || token.startsWith('worker-signal:')
    || token.startsWith('ownership-violation:')
    || token.startsWith('generated-failed-evidence:')
    || token.startsWith('verification-failed:'));
}

function createDashboardTimeSeries(
  run: FrontierCodexSwarmRunResult | undefined,
  jobs: readonly FrontierCodexDashboardJob[]
): FrontierCodexDashboardTimeSeries {
  const points = new Map<number, FrontierCodexDashboardTimeSeriesPoint>();
  const bucketMs = DASHBOARD_TIME_SERIES_BUCKET_MS;
  let missingTimestampJobCount = 0;

  for (const event of run?.run.events ?? []) {
    const at = timestampValue(event.at);
    if (at === undefined) continue;
    pointForTimeSeriesBucket(points, at, bucketMs).eventCount += 1;
  }

  for (const job of jobs) {
    const hasContextLoad = hasDashboardContextLoad(job);
    const hasLogVolume = hasDashboardLogVolume(job);
    const terminal = isDashboardTerminalJob(job);
    if (!terminal && !hasContextLoad && !hasLogVolume) continue;

    const at = dashboardJobTimeSeriesTimestamp(job);
    if (at === undefined) {
      missingTimestampJobCount += 1;
      continue;
    }

    const point = pointForTimeSeriesBucket(points, at, bucketMs);
    if (terminal) point.terminalJobCount += 1;
    if (isDashboardFailureJob(job)) point.failureJobCount += 1;
    if (isDashboardBlockedJob(job)) point.blockedJobCount += 1;
    if (job.health === 'running') point.runningJobCount += 1;
    if (job.health === 'warning') point.warningJobCount += 1;
    if (job.semanticReadiness === 'clean') point.semanticCleanJobCount += 1;
    if (job.semanticReadiness === 'candidate') point.semanticCandidateJobCount += 1;
    if (job.semanticReadiness === 'blocked') point.semanticBlockedJobCount += 1;
    point.promptBytes += job.promptBytes;
    point.estimatedInputTokens += job.estimatedInputTokens;
    point.actualInputTokens += job.actualInputTokens;
    point.cachedInputTokens += job.cachedInputTokens;
    point.uncachedInputTokens += job.uncachedInputTokens;
    point.outputTokens += job.outputTokens;
    point.billableInputTokens += job.billableInputTokens;
    const hasCostSignal = hasDashboardCostSignal(job);
    if (hasCostSignal) {
      if (job.priceKnown) point.priceKnownJobCount += 1;
      else point.unknownPriceJobCount += 1;
    }
    if (hasCostSignal && job.costEstimateInputOnly) point.inputOnlyCostJobCount += 1;
    if (hasCostSignal && job.costEstimateEstimatedInput) point.estimatedInputCostJobCount += 1;
    point.estimatedCostUsd = roundDashboardUsd(point.estimatedCostUsd + job.estimatedCostUsd);
    point.estimatedInputCostUsd = roundDashboardUsd(point.estimatedInputCostUsd + job.estimatedInputCostUsd);
    point.estimatedOutputCostUsd = roundDashboardUsd(point.estimatedOutputCostUsd + job.estimatedOutputCostUsd);
    point.estimatedCostMicroUsd += job.estimatedCostMicroUsd;
    point.durationMs += job.durationMs;
    point.averageDurationMs = point.terminalJobCount > 0 ? Math.round(point.durationMs / point.terminalJobCount) : 0;
    point.eventBytes += job.eventBytes;
    point.eventBytesTruncated += job.eventBytesTruncated;
    point.stderrBytes += job.stderrBytes;
    point.stderrBytesTruncated += job.stderrBytesTruncated;
    point.logBytes += job.eventBytes + job.stderrBytes;
    point.logBytesTruncated += job.eventBytesTruncated + job.stderrBytesTruncated;
    if (!point.jobIds.includes(job.id)) point.jobIds.push(job.id);
  }

  const sortedPoints = Array.from(points.values()).sort((left, right) => left.at - right.at);
  for (const point of sortedPoints) point.jobIds.sort();
  const contextLoadJobs = jobs.filter(hasDashboardContextLoad);
  const logVolumeJobs = jobs.filter(hasDashboardLogVolume);
  const durationJobs = jobs.filter((job) => job.durationMs > 0);
  return {
    bucketMs,
    summary: {
      pointCount: sortedPoints.length,
      eventCount: sortedPoints.reduce((sum, point) => sum + point.eventCount, 0),
      terminalJobCount: sortedPoints.reduce((sum, point) => sum + point.terminalJobCount, 0),
      failureJobCount: sortedPoints.reduce((sum, point) => sum + point.failureJobCount, 0),
      blockedJobCount: sortedPoints.reduce((sum, point) => sum + point.blockedJobCount, 0),
      runningJobCount: sortedPoints.reduce((sum, point) => sum + point.runningJobCount, 0),
      warningJobCount: sortedPoints.reduce((sum, point) => sum + point.warningJobCount, 0),
      semanticCleanJobCount: sortedPoints.reduce((sum, point) => sum + point.semanticCleanJobCount, 0),
      semanticCandidateJobCount: sortedPoints.reduce((sum, point) => sum + point.semanticCandidateJobCount, 0),
      semanticBlockedJobCount: sortedPoints.reduce((sum, point) => sum + point.semanticBlockedJobCount, 0),
      contextLoadJobCount: contextLoadJobs.length,
      logVolumeJobCount: logVolumeJobs.length,
      missingTimestampJobCount,
      ...(sortedPoints[0] ? { earliestAt: sortedPoints[0].at } : {}),
      ...(sortedPoints[sortedPoints.length - 1] ? { latestAt: sortedPoints[sortedPoints.length - 1].at } : {}),
      promptBytes: sortedPoints.reduce((sum, point) => sum + point.promptBytes, 0),
      estimatedInputTokens: sortedPoints.reduce((sum, point) => sum + point.estimatedInputTokens, 0),
      actualInputTokens: sortedPoints.reduce((sum, point) => sum + point.actualInputTokens, 0),
      cachedInputTokens: sortedPoints.reduce((sum, point) => sum + point.cachedInputTokens, 0),
      uncachedInputTokens: sortedPoints.reduce((sum, point) => sum + point.uncachedInputTokens, 0),
      outputTokens: sortedPoints.reduce((sum, point) => sum + point.outputTokens, 0),
      billableInputTokens: sortedPoints.reduce((sum, point) => sum + point.billableInputTokens, 0),
      priceKnownJobCount: sortedPoints.reduce((sum, point) => sum + point.priceKnownJobCount, 0),
      unknownPriceJobCount: sortedPoints.reduce((sum, point) => sum + point.unknownPriceJobCount, 0),
      inputOnlyCostJobCount: sortedPoints.reduce((sum, point) => sum + point.inputOnlyCostJobCount, 0),
      estimatedInputCostJobCount: sortedPoints.reduce((sum, point) => sum + point.estimatedInputCostJobCount, 0),
      estimatedCostUsd: roundDashboardUsd(sortedPoints.reduce((sum, point) => sum + point.estimatedCostUsd, 0)),
      estimatedInputCostUsd: roundDashboardUsd(sortedPoints.reduce((sum, point) => sum + point.estimatedInputCostUsd, 0)),
      estimatedOutputCostUsd: roundDashboardUsd(sortedPoints.reduce((sum, point) => sum + point.estimatedOutputCostUsd, 0)),
      estimatedCostMicroUsd: sortedPoints.reduce((sum, point) => sum + point.estimatedCostMicroUsd, 0),
      durationMs: sortedPoints.reduce((sum, point) => sum + point.durationMs, 0),
      averageDurationMs: averageJobMetric(durationJobs, (job) => job.durationMs),
      maxDurationMs: maxJobMetric(durationJobs, (job) => job.durationMs),
      eventBytes: sortedPoints.reduce((sum, point) => sum + point.eventBytes, 0),
      eventBytesTruncated: sortedPoints.reduce((sum, point) => sum + point.eventBytesTruncated, 0),
      stderrBytes: sortedPoints.reduce((sum, point) => sum + point.stderrBytes, 0),
      stderrBytesTruncated: sortedPoints.reduce((sum, point) => sum + point.stderrBytesTruncated, 0),
      logBytes: sortedPoints.reduce((sum, point) => sum + point.logBytes, 0),
      logBytesTruncated: sortedPoints.reduce((sum, point) => sum + point.logBytesTruncated, 0)
    },
    points: sortedPoints
  };
}

function dashboardJobTimeSeriesTimestamp(job: FrontierCodexDashboardJob): number | undefined {
  return timestampValue(job.finishedAt)
    ?? timestampValue(job.generatedAt)
    ?? timestampValue(job.startedAt);
}

function dashboardDurationMs(startedAt: number | undefined, finishedAt: number | undefined): number {
  if (startedAt === undefined || finishedAt === undefined || finishedAt < startedAt) return 0;
  return Math.max(0, Math.round(finishedAt - startedAt));
}

function pointForTimeSeriesBucket(
  points: Map<number, FrontierCodexDashboardTimeSeriesPoint>,
  at: number,
  bucketMs: number
): FrontierCodexDashboardTimeSeriesPoint {
  const bucketAt = Math.floor(at / bucketMs) * bucketMs;
  const existing = points.get(bucketAt);
  if (existing) return existing;
  const point: FrontierCodexDashboardTimeSeriesPoint = {
    at: bucketAt,
    label: new Date(bucketAt).toISOString(),
    eventCount: 0,
    terminalJobCount: 0,
    failureJobCount: 0,
    blockedJobCount: 0,
    runningJobCount: 0,
    warningJobCount: 0,
    semanticCleanJobCount: 0,
    semanticCandidateJobCount: 0,
    semanticBlockedJobCount: 0,
    promptBytes: 0,
    estimatedInputTokens: 0,
    actualInputTokens: 0,
    cachedInputTokens: 0,
    uncachedInputTokens: 0,
    outputTokens: 0,
    billableInputTokens: 0,
    priceKnownJobCount: 0,
    unknownPriceJobCount: 0,
    inputOnlyCostJobCount: 0,
    estimatedInputCostJobCount: 0,
    estimatedCostUsd: 0,
    estimatedInputCostUsd: 0,
    estimatedOutputCostUsd: 0,
    estimatedCostMicroUsd: 0,
    durationMs: 0,
    averageDurationMs: 0,
    eventBytes: 0,
    eventBytesTruncated: 0,
    stderrBytes: 0,
    stderrBytesTruncated: 0,
    logBytes: 0,
    logBytesTruncated: 0,
    jobIds: []
  };
  points.set(bucketAt, point);
  return point;
}

function hasDashboardContextLoad(job: FrontierCodexDashboardJob): boolean {
  return job.promptBytes > 0
    || job.estimatedInputTokens > 0
    || job.actualInputTokens > 0
    || job.cachedInputTokens > 0
    || job.uncachedInputTokens > 0
    || job.outputTokens > 0;
}

function hasDashboardCostSignal(job: FrontierCodexDashboardJob): boolean {
  return job.estimatedInputTokens > 0
    || job.actualInputTokens > 0
    || job.billableInputTokens > 0
    || job.outputTokens > 0;
}

function hasDashboardLogVolume(job: FrontierCodexDashboardJob): boolean {
  return job.eventBytes > 0
    || job.eventBytesTruncated > 0
    || job.stderrBytes > 0
    || job.stderrBytesTruncated > 0;
}

function isDashboardNeedsPortJob(job: FrontierCodexDashboardJob): boolean {
  return job.bucket === 'needs-human-port'
    || job.disposition === 'needs-port';
}

function isDashboardStaleJob(job: FrontierCodexDashboardJob): boolean {
  return job.bucket === 'stale-against-head'
    || job.disposition === 'stale-against-head'
    || job.reasons.includes('stale-against-head');
}

function hasDashboardContextBudget(job: FrontierCodexDashboardJob): boolean {
  return Boolean(job.contextBudgetStatus)
    || job.contextBudgetWarningCount > 0
    || job.contextBudgetErrorCount > 0
    || job.promptBytes > 0
    || job.estimatedInputTokens > 0
    || job.actualInputTokens > 0;
}

function isDashboardContextBudgetWarningJob(job: FrontierCodexDashboardJob): boolean {
  return job.contextBudgetStatus === 'warning'
    || job.contextBudgetWarningCount > 0 && !isDashboardContextBudgetFailedJob(job);
}

function isDashboardContextBudgetFailedJob(job: FrontierCodexDashboardJob): boolean {
  return job.contextBudgetStatus === 'failed'
    || job.contextBudgetErrorCount > 0;
}

function qualityMetricSeries(
  id: FrontierCodexDashboardQualityMetricSeries['id'],
  label: string,
  total: number,
  points: FrontierCodexDashboardQualityMetricPoint[]
): FrontierCodexDashboardQualityMetricSeries {
  return { id, label, total, points };
}

function qualityMetricPoint(
  id: string,
  label: string,
  value: number,
  extras: Omit<FrontierCodexDashboardQualityMetricPoint, 'id' | 'label' | 'value'> = {}
): FrontierCodexDashboardQualityMetricPoint {
  return { id, label, value, ...extras };
}

function recordQualityMetricPoints(prefix: string, counts: Record<string, number>): FrontierCodexDashboardQualityMetricPoint[] {
  return Object.entries(counts)
    .filter((entry) => entry[1] > 0)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([id, value]) => qualityMetricPoint(`${prefix}:${id}`, qualityLabel(id), value));
}

function qualityLabel(value: string): string {
  return value
    .split(/[-_.:]/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function sampleJobIds(jobs: readonly FrontierCodexDashboardJob[]): string[] {
  return sampleQualityStrings(jobs.map((job) => job.id));
}

function sampleQualityStrings(values: readonly string[]): string[] {
  return uniqueStrings(values.filter((value) => value.length > 0)).slice(0, DASHBOARD_QUALITY_SAMPLE_LIMIT);
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

function sumNumberRecordValues(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function maxJobMetric(jobs: readonly FrontierCodexDashboardJob[], metric: (job: FrontierCodexDashboardJob) => number): number {
  return Math.max(0, ...jobs.map(metric));
}

function averageJobMetric(jobs: readonly FrontierCodexDashboardJob[], metric: (job: FrontierCodexDashboardJob) => number): number {
  if (jobs.length === 0) return 0;
  return Math.round(jobs.reduce((sum, job) => sum + metric(job), 0) / jobs.length);
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

async function createDashboardJobs(
  run: FrontierCodexSwarmRunResult | undefined,
  collection: FrontierCodexCollectResult | undefined,
  context: DashboardArtifactContext
): Promise<FrontierCodexDashboardJob[]> {
  const collected = new Map<string, { bucket: FrontierCodexCollectBucket; bundle: FrontierCodexCollectResult['buckets'][FrontierCodexCollectBucket][number]['bundle']; outputDir?: string; mergePath?: string }>();
  for (const [bucket, entries] of Object.entries(collection?.buckets ?? {}) as Array<[FrontierCodexCollectBucket, FrontierCodexCollectResult['buckets'][FrontierCodexCollectBucket]]>) {
    for (const entry of entries) {
      collected.set(entry.jobId, {
        bucket,
        bundle: entry.bundle,
        outputDir: entry.outputDir,
        mergePath: entry.mergePath
      });
    }
  }
  const rows = await Promise.all((run?.run.jobs ?? []).map((job) => {
    const result = run?.run.results.find((entry) => entry.jobId === job.id);
    const bucket = collected.get(job.id);
    return dashboardJobFromParts(job, result, bucket, context);
  }));
  for (const [jobId, bucket] of collected) {
    if (!rows.some((row) => row.id === jobId)) rows.push(await dashboardJobFromParts({ id: jobId }, undefined, bucket, context));
  }
  return rows.sort((left, right) => (left.lane ?? '').localeCompare(right.lane ?? '') || left.id.localeCompare(right.id));
}

async function dashboardJobFromParts(
  jobValue: unknown,
  resultValue: unknown,
  collected: { bucket: FrontierCodexCollectBucket; bundle: unknown; outputDir?: string; mergePath?: string } | undefined,
  context: DashboardArtifactContext
): Promise<FrontierCodexDashboardJob> {
  const job = isObject(jobValue) ? jobValue : {};
  const result = isObject(resultValue) ? resultValue : undefined;
  const task = isObject(job.task) ? job.task : {};
  const compute = isObject(job.compute) ? job.compute : {};
  const bundle = isObject(collected?.bundle) ? collected.bundle : {};
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const collectMetadata = isObject(metadata.collect) ? metadata.collect : {};
  const quarantine = isObject(metadata.workspacePatchQuarantine) ? metadata.workspacePatchQuarantine : {};
  const contextBudget = isObject(metadata.contextBudget) ? metadata.contextBudget : {};
  const measuredBudget = isObject(contextBudget.measured) ? contextBudget.measured : {};
  const usageBudget = isObject(contextBudget.usage) ? contextBudget.usage : {};
  const logSummary = isObject(metadata.logSummary) ? metadata.logSummary : {};
  const changedPaths = stringArrayValue(bundle.changedPaths);
  const ownershipViolations = stringArrayValue(bundle.ownershipViolations);
  const quarantinedChangedPaths = stringArrayValue(quarantine.quarantinedChangedPaths);
  const contextBudgetWarnings = stringArrayValue(contextBudget.warnings);
  const contextBudgetErrors = stringArrayValue(contextBudget.errors);
  const workspaceEvidence = await dashboardWorkspaceOwnershipEvidence(bundle, metadata, {
    ...context,
    artifactRoots: dashboardArtifactRoots(context.cwd, ...context.artifactRoots, collected?.outputDir, collected?.mergePath ? path.dirname(collected.mergePath) : undefined),
    artifactBases: dashboardArtifactRoots(context.cwd, ...context.artifactBases, collected?.outputDir, collected?.mergePath ? path.dirname(collected.mergePath) : undefined)
  });
  const sourceOwnershipViolations = ownershipViolations.filter((entry) => !isIgnoredChangedPath(entry, workspaceEvidence.ignoredChangedPaths));
  const ignoredOwnershipViolations = ownershipViolations.filter((entry) => isIgnoredChangedPath(entry, workspaceEvidence.ignoredChangedPaths));
  const startedAt = timestampValue(result?.startedAt ?? bundle.startedAt);
  const finishedAt = timestampValue(result?.finishedAt ?? bundle.finishedAt);
  const semanticAdmission = isObject(metadata.semanticEditAdmission) ? metadata.semanticEditAdmission : {};
  const semanticCompactSummary = isObject(metadata.semanticCompactSummary) ? metadata.semanticCompactSummary : {};
  const semanticCompactEdit = isObject(semanticCompactSummary.semanticEdit) ? semanticCompactSummary.semanticEdit : {};
  const semanticAdmissionStatus = stringValue(metadata.semanticEditAdmissionStatus ?? semanticAdmission.status ?? semanticCompactEdit.status);
  const semanticAutoMergeCandidate = booleanValue(metadata.semanticEditAdmissionAutoMergeCandidate)
    || booleanValue(semanticAdmission.autoMergeCandidate)
    || booleanValue(semanticCompactEdit.autoMergeCandidate);
  const semanticCleanEligible = booleanValue(metadata.semanticEditAdmissionCleanEligible)
    || booleanValue(semanticAdmission.cleanEligible)
    || booleanValue(semanticCompactEdit.cleanEligible);
  const semanticReadinessReasons = stringListValue(metadata.semanticEditAdmissionReasons);
  const model = stringValue(compute.model ?? metadata.model ?? bundle.model ?? collectMetadata.model);
  const actualInputTokens = numberValue(usageBudget.inputTokens, numberValue(measuredBudget.actualInputTokens));
  const cachedInputTokens = numberValue(usageBudget.cachedInputTokens);
  const uncachedInputTokens = numberValue(usageBudget.uncachedInputTokens, Math.max(0, actualInputTokens - cachedInputTokens));
  const outputTokens = numberValue(usageBudget.outputTokens);
  const estimatedInputTokens = numberValue(measuredBudget.estimatedInputTokens);
  const costEstimate = estimateCodexModelCost({
    model,
    estimatedInputTokens,
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens: optionalNumberValue(usageBudget.outputTokens)
  });
  const semanticReadiness = dashboardSemanticReadiness({
    semanticAdmissionStatus,
    semanticAutoMergeCandidate,
    semanticCleanEligible,
    disposition: stringValue(bundle.disposition),
    reasons: Array.isArray(bundle.reasons) ? bundle.reasons.map(String) : []
  });
  const row = {
    id: String(job.id ?? bundle.jobId ?? ''),
    taskId: stringValue(job.taskId ?? bundle.taskId),
    title: stringValue(job.title ?? task.title),
    lane: stringValue(job.lane ?? bundle.lane),
    status: stringValue(result?.status ?? bundle.status ?? job.status),
    startedAt,
    finishedAt,
    durationMs: dashboardDurationMs(startedAt, finishedAt),
    generatedAt: timestampValue(bundle.generatedAt),
    health: 'unknown' as FrontierCodexDashboardHealthStatus,
    computeId: stringValue(compute.id),
    model,
    modelTier: stringValue(isObject(compute.metadata) ? compute.metadata.modelTier : undefined),
    workKind: stringValue(task.workKind),
    bucket: collected?.bucket,
    mergeReadiness: stringValue(bundle.mergeReadiness),
    disposition: stringValue(bundle.disposition),
    changedPaths,
    ownershipViolations,
    sourceOwnershipViolations,
    ignoredOwnershipViolations,
    quarantinedChangedPaths,
    ignoredChangedPathSamples: workspaceEvidence.ignoredChangedPathSamples,
    ignoredChangedPathReasonSamples: workspaceEvidence.ignoredChangedPathReasonSamples,
    changedPathCount: changedPaths.length,
    ownershipViolationCount: ownershipViolations.length,
    sourceOwnershipViolationCount: sourceOwnershipViolations.length,
    ignoredOwnershipViolationCount: ignoredOwnershipViolations.length,
    quarantinedChangedPathCount: quarantinedChangedPaths.length,
    ignoredChangedPathCount: workspaceEvidence.ignoredChangedPathCount,
    ignoredChangedPathReasonCounts: workspaceEvidence.ignoredChangedPathReasonCounts,
    observedChangedPathCount: workspaceEvidence.observedChangedPathCount,
    reportedChangedPathCount: workspaceEvidence.reportedChangedPathCount,
    contextBudgetStatus: stringValue(contextBudget.status),
    contextBudgetWarningCount: contextBudgetWarnings.length,
    contextBudgetErrorCount: contextBudgetErrors.length,
    contextBudgetWarnings,
    contextBudgetErrors,
    evidencePathCount: Array.isArray(bundle.evidencePaths) ? bundle.evidencePaths.length : 0,
    promptBytes: numberValue(measuredBudget.promptBytes),
    estimatedInputTokens,
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    ...dashboardCostFields(costEstimate),
    semanticAdmissionStatus,
    semanticAutoMergeCandidate,
    semanticCleanEligible,
    semanticReadiness,
    semanticReadinessReasons,
    eventBytes: numberValue(logSummary.eventBytes),
    eventBytesTruncated: numberValue(logSummary.eventBytesTruncated),
    stderrBytes: numberValue(logSummary.stderrBytes),
    stderrBytesTruncated: numberValue(logSummary.stderrBytesTruncated),
    collectReasonClasses: Array.isArray(collectMetadata.reasonClasses) ? collectMetadata.reasonClasses.map(String) : [],
    reasons: Array.isArray(bundle.reasons) ? bundle.reasons.map(String) : []
  };
  row.health = dashboardJobHealth(row);
  return row;
}

async function dashboardWorkspaceOwnershipEvidence(
  bundle: Record<string, unknown>,
  metadata: Record<string, unknown>,
  context: DashboardArtifactContext
): Promise<DashboardWorkspaceOwnershipEvidence> {
  const fallback = dashboardWorkspaceOwnershipEvidenceFromMetadata(metadata);
  const embedded = dashboardWorkspaceOwnershipEvidenceFromProof(metadata.workspaceProof);
  if (embedded) return mergeDashboardWorkspaceOwnershipEvidence(fallback, embedded);
  const proofPath = dashboardWorkspaceProofPath(bundle, metadata, context);
  if (!proofPath) return fallback;
  const proof = await readDashboardWorkspaceProof(proofPath);
  const fromProof = dashboardWorkspaceOwnershipEvidenceFromProof(proof);
  return fromProof ? mergeDashboardWorkspaceOwnershipEvidence(fallback, fromProof) : fallback;
}

function dashboardWorkspaceOwnershipEvidenceFromMetadata(metadata: Record<string, unknown>): DashboardWorkspaceOwnershipEvidence {
  return {
    ignoredChangedPaths: [],
    ignoredChangedPathCount: 0,
    ignoredChangedPathReasonCounts: {},
    ignoredChangedPathSamples: [],
    ignoredChangedPathReasonSamples: [],
    observedChangedPathCount: stringArrayValue(metadata.observedChangedPaths).length,
    reportedChangedPathCount: stringArrayValue(metadata.reportedChangedPaths).length
  };
}

function dashboardWorkspaceOwnershipEvidenceFromProof(value: unknown): DashboardWorkspaceOwnershipEvidence | undefined {
  if (!isObject(value)) return undefined;
  const summary = isObject(value.summary) ? value.summary : {};
  const ignoredChangedPathReasons = ignoredChangedPathReasonArrayValue(value.ignoredChangedPathReasons);
  const ignoredChangedPaths = uniqueStrings([
    ...stringArrayValue(value.ignoredChangedPaths),
    ...ignoredChangedPathReasons.map((entry) => entry.path)
  ]);
  return {
    ignoredChangedPaths,
    ignoredChangedPathCount: numberValue(summary.ignoredChangedPathCount, ignoredChangedPaths.length),
    ignoredChangedPathReasonCounts: numberRecordValue(summary.ignoredChangedPathReasonCounts, countIgnoredChangedPathReasons(ignoredChangedPathReasons)),
    ignoredChangedPathSamples: ignoredChangedPaths.slice(0, DASHBOARD_IGNORED_CHANGED_PATH_SAMPLE_LIMIT),
    ignoredChangedPathReasonSamples: ignoredChangedPathReasons.slice(0, DASHBOARD_IGNORED_CHANGED_PATH_SAMPLE_LIMIT),
    observedChangedPathCount: numberValue(summary.observedChangedPathCount, stringArrayValue(value.observedChangedPaths).length),
    reportedChangedPathCount: numberValue(summary.reportedChangedPathCount, stringArrayValue(value.reportedChangedPaths).length)
  };
}

function mergeDashboardWorkspaceOwnershipEvidence(
  fallback: DashboardWorkspaceOwnershipEvidence,
  value: DashboardWorkspaceOwnershipEvidence
): DashboardWorkspaceOwnershipEvidence {
  return {
    ignoredChangedPathCount: value.ignoredChangedPathCount,
    ignoredChangedPathReasonCounts: value.ignoredChangedPathReasonCounts,
    ignoredChangedPaths: value.ignoredChangedPaths,
    ignoredChangedPathSamples: value.ignoredChangedPathSamples,
    ignoredChangedPathReasonSamples: value.ignoredChangedPathReasonSamples,
    observedChangedPathCount: value.observedChangedPathCount || fallback.observedChangedPathCount,
    reportedChangedPathCount: value.reportedChangedPathCount || fallback.reportedChangedPathCount
  };
}

function dashboardWorkspaceProofPath(
  bundle: Record<string, unknown>,
  metadata: Record<string, unknown>,
  context: DashboardArtifactContext
): string | undefined {
  const candidates = uniqueStrings([
    ...stringArrayValue(bundle.evidencePaths),
    ...(typeof metadata.workspaceProofPath === 'string' ? [metadata.workspaceProofPath] : [])
  ]).filter((entry) => path.basename(entry) === 'workspace-proof.json');
  for (const candidate of candidates) {
    for (const resolved of resolveDashboardArtifactPath(candidate, context.artifactBases)) {
      if (isDashboardArtifactPathSafe(resolved, context.artifactRoots)) return resolved;
    }
  }
  return undefined;
}

function resolveDashboardArtifactPath(value: string, bases: readonly string[]): string[] {
  if (path.isAbsolute(value)) return [path.normalize(value)];
  return uniqueStrings(bases.map((base) => path.resolve(base, value)));
}

function isDashboardArtifactPathSafe(file: string, roots: readonly string[]): boolean {
  for (const root of roots) {
    const relative = path.relative(root, file);
    if (relative === '' || relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return true;
  }
  return false;
}

async function readDashboardWorkspaceProof(file: string): Promise<FrontierCodexWorkspaceProof | undefined> {
  const stat = await fs.stat(file).catch(() => undefined);
  if (!stat?.isFile() || stat.size > DASHBOARD_WORKSPACE_PROOF_MAX_BYTES) return undefined;
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    return isObject(parsed) ? parsed as unknown as FrontierCodexWorkspaceProof : undefined;
  } catch {
    return undefined;
  }
}

function dashboardArtifactRoots(cwd: string, ...values: Array<string | undefined>): string[] {
  return uniqueStrings([cwd, ...values.filter((value): value is string => typeof value === 'string' && value.length > 0)]
    .map((value) => path.resolve(cwd, value)));
}

function ignoredChangedPathReasonArrayValue(value: unknown): FrontierCodexDashboardIgnoredChangedPathReason[] {
  if (!Array.isArray(value)) return [];
  const out: FrontierCodexDashboardIgnoredChangedPathReason[] = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const pathValue = stringValue(entry.path);
    const reasonCode = stringValue(entry.reasonCode);
    if (pathValue && reasonCode) out.push({ path: pathValue, reasonCode });
  }
  return out;
}

function countIgnoredChangedPathReasons(
  reasons: readonly FrontierCodexDashboardIgnoredChangedPathReason[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reason of reasons) counts[reason.reasonCode] = (counts[reason.reasonCode] ?? 0) + 1;
  return counts;
}

function isIgnoredChangedPath(file: string, ignoredPaths: readonly string[]): boolean {
  const normalized = file.replace(/\\/g, '/');
  if (isGeneratedChangedPath(normalized)) return true;
  return ignoredPaths.some((entry) => {
    const ignored = entry.replace(/\\/g, '/');
    return normalized === ignored
      || normalized.endsWith('/' + ignored)
      || ignored.endsWith('/' + normalized);
  });
}

function isGeneratedChangedPath(file: string): boolean {
  return file.includes('/.cache/')
    || file.startsWith('.cache/')
    || file.endsWith('.tsbuildinfo')
    || file.includes('/dist/')
    || file.startsWith('dist/')
    || file.includes('/node_modules/')
    || file.startsWith('node_modules/');
}

function semanticAdmissionMetrics(value: unknown): FrontierCodexDashboardSemanticAdmissionMetrics {
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

function createDashboardHumanActions(dashboard: unknown): FrontierCodexDashboardHumanAction[] {
  const rows = [
    ...dashboardPersistedHumanActions(dashboard),
    ...dashboardHumanActionsFromBoardSources(dashboard)
  ];
  const deduped = new Map<string, FrontierCodexDashboardHumanAction>();
  for (const row of rows) {
    if (!isOpenDashboardHumanAction(row)) continue;
    if (!deduped.has(row.code)) deduped.set(row.code, row);
  }
  return Array.from(deduped.values())
    .sort((left, right) => dashboardHumanActionPriorityRank(left.priority) - dashboardHumanActionPriorityRank(right.priority)
      || (left.createdAt ?? 0) - (right.createdAt ?? 0)
      || left.code.localeCompare(right.code))
    .slice(0, 60);
}

function dashboardPersistedHumanActions(value: unknown): FrontierCodexDashboardHumanAction[] {
  const dashboard = isObject(value) ? value : {};
  const metadata = isObject(dashboard.metadata) ? dashboard.metadata : {};
  return [
    ...humanActionRecordArray(dashboard.humanActions),
    ...humanActionRecordArray(metadata.humanActions)
  ].map((entry) => normalizeDashboardHumanAction(entry)).filter((entry): entry is FrontierCodexDashboardHumanAction => Boolean(entry));
}

function dashboardHumanActionsFromBoardSources(value: unknown): FrontierCodexDashboardHumanAction[] {
  const dashboard = isObject(value) ? value : {};
  const metadata = isObject(dashboard.metadata) ? dashboard.metadata : {};
  const boards = [dashboard.board, metadata.board, metadata.humanActionBoard, dashboard.humanActionBoard];
  const rows: FrontierCodexDashboardHumanAction[] = [];
  for (const board of boards) {
    if (!isObject(board) || !Array.isArray(board.entries)) continue;
    for (const entry of board.entries) {
      if (!isHumanFacingBoardEntry(entry)) continue;
      const action = dashboardHumanActionFromBoardEntry(entry);
      if (action) rows.push(action);
    }
  }
  return rows;
}

function normalizeDashboardHumanAction(value: unknown): FrontierCodexDashboardHumanAction | undefined {
  if (!isObject(value)) return undefined;
  const id = stringValue(value.id) ?? 'dashboard-human-action:' + stableHash(value);
  const type = dashboardHumanActionType(stringValue(value.type), stringValue(value.kind));
  const priority = dashboardHumanActionPriority(stringValue(value.priority), stringValue(value.riskLevel), stringValue(value.status), stringValue(value.kind));
  const code = stringValue(value.code) ?? dashboardHumanActionCode(dashboardHumanActionPrefix(type, priority), id);
  const title = stringValue(value.title) ?? stringValue(value.topic) ?? id;
  const question = stringValue(value.question) ?? stringValue(value.prompt) ?? stringValue(value.detail) ?? stringValue(value.text) ?? title;
  const detail = stringValue(value.detail) ?? stringValue(value.context) ?? question;
  return {
    id,
    code,
    status: stringValue(value.status) ?? 'open',
    priority,
    type,
    title,
    question,
    scope: stringValue(value.scope) ?? stringValue(value.lane) ?? stringValue(value.topic) ?? 'workspace',
    detail,
    ...(stringValue(value.why) ?? stringValue(value.reason) ? { why: stringValue(value.why) ?? stringValue(value.reason) } : {}),
    ...(stringValue(value.requestedAnswer) ?? stringValue(value.answerFormat) ?? stringValue(value.expectedAnswer)
      ? { requestedAnswer: stringValue(value.requestedAnswer) ?? stringValue(value.answerFormat) ?? stringValue(value.expectedAnswer) }
      : {}),
    defaultAction: stringValue(value.defaultAction) ?? 'Answer in Codex so the coordinator can resolve the item.',
    ...(stringValue(value.askedBy) ?? stringValue(value.agentId) ?? stringValue(value.jobId)
      ? { askedBy: stringValue(value.askedBy) ?? stringValue(value.agentId) ?? stringValue(value.jobId) }
      : {}),
    source: stringValue(value.source) ?? 'board',
    ...(stringValue(value.jobId) ? { jobId: stringValue(value.jobId) } : {}),
    ...(stringValue(value.taskId) ? { taskId: stringValue(value.taskId) } : {}),
    ...(stringValue(value.lane) ? { lane: stringValue(value.lane) } : {}),
    options: dashboardHumanActionOptions(value.options),
    ...(timestampValue(value.createdAt ?? value.generatedAt) ? { createdAt: timestampValue(value.createdAt ?? value.generatedAt) } : {}),
    ...(timestampValue(value.answeredAt) ? { answeredAt: timestampValue(value.answeredAt) } : {}),
    ...(timestampValue(value.resolvedAt) ? { resolvedAt: timestampValue(value.resolvedAt) } : {}),
    ...(stringValue(value.answer) ? { answer: stringValue(value.answer) } : {}),
    ...(stringValue(value.resolution) ? { resolution: stringValue(value.resolution) } : {}),
    evidencePaths: stringArrayValue(value.evidencePaths),
    changedPaths: stringArrayValue(value.changedPaths)
  };
}

function dashboardHumanActionFromBoardEntry(value: unknown): FrontierCodexDashboardHumanAction | undefined {
  if (!isObject(value)) return undefined;
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const id = stringValue(value.id) ?? 'dashboard-board-action:' + stableHash(value);
  const kind = stringValue(value.kind);
  const status = stringValue(value.status) ?? 'open';
  const type = dashboardHumanActionType(stringValue(metadata.type), kind);
  const priority = dashboardHumanActionPriority(stringValue(metadata.priority), stringValue(value.riskLevel), status, kind);
  const title = stringValue(value.title) ?? stringValue(value.topic) ?? id;
  const question = stringValue(metadata.question) ?? stringValue(value.question) ?? stringValue(value.text) ?? title;
  const detail = stringValue(metadata.detail) ?? stringValue(value.detail) ?? stringValue(value.text) ?? question;
  return {
    id,
    code: stringValue(metadata.code ?? value.code) ?? dashboardHumanActionCode(dashboardHumanActionPrefix(type, priority), id),
    status,
    priority,
    type,
    title,
    question,
    scope: stringValue(metadata.scope) ?? stringValue(value.lane) ?? stringValue(value.groupId) ?? stringValue(value.topic) ?? 'workspace',
    detail,
    ...(stringValue(metadata.why) ?? stringValue(value.why) ?? stringValue(value.reason)
      ? { why: stringValue(metadata.why) ?? stringValue(value.why) ?? stringValue(value.reason) }
      : {}),
    ...(stringValue(metadata.requestedAnswer) ?? stringValue(metadata.answerFormat) ?? stringValue(value.requestedAnswer) ?? stringValue(value.answerFormat)
      ? { requestedAnswer: stringValue(metadata.requestedAnswer) ?? stringValue(metadata.answerFormat) ?? stringValue(value.requestedAnswer) ?? stringValue(value.answerFormat) }
      : {}),
    defaultAction: stringValue(metadata.defaultAction) ?? defaultHumanActionForType(type),
    ...(stringValue(metadata.askedBy) ?? stringValue(value.agentId) ?? stringValue(value.jobId)
      ? { askedBy: stringValue(metadata.askedBy) ?? stringValue(value.agentId) ?? stringValue(value.jobId) }
      : {}),
    source: 'board',
    ...(stringValue(value.jobId) ? { jobId: stringValue(value.jobId) } : {}),
    ...(stringValue(value.taskId) ? { taskId: stringValue(value.taskId) } : {}),
    ...(stringValue(value.lane) ? { lane: stringValue(value.lane) } : {}),
    options: dashboardHumanActionOptions(metadata.options ?? value.options),
    ...(timestampValue(value.generatedAt) ? { createdAt: timestampValue(value.generatedAt) } : {}),
    ...(timestampValue(metadata.answeredAt) ? { answeredAt: timestampValue(metadata.answeredAt) } : {}),
    ...(timestampValue(metadata.resolvedAt) ? { resolvedAt: timestampValue(metadata.resolvedAt) } : {}),
    ...(stringValue(metadata.answer) ? { answer: stringValue(metadata.answer) } : {}),
    ...(stringValue(metadata.resolution) ? { resolution: stringValue(metadata.resolution) } : {}),
    evidencePaths: evidencePathsFromBoardEntry(value.evidenceRefs),
    changedPaths: stringArrayValue(value.changedPaths)
  };
}

function humanActionRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function isHumanFacingBoardEntry(value: unknown): boolean {
  if (!isObject(value)) return false;
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const kind = stringValue(value.kind)?.toLowerCase();
  const target = (stringValue(metadata.target) ?? stringValue(value.target) ?? stringValue(metadata.audience) ?? stringValue(value.audience))?.toLowerCase();
  if (target === 'human' || target === 'user' || target === 'operator') return true;
  if (booleanValue(metadata.requiresHuman) || booleanValue(value.requiresHuman) || booleanValue(metadata.askHuman) || booleanValue(value.askHuman)) return true;
  if (kind === 'human-question' || kind === 'ask-human' || kind === 'human-decision' || kind === 'user-question' || kind === 'operator-question') return true;
  return (kind === 'decision' || kind === 'review-question' || kind === 'escalation')
    && Boolean(stringValue(metadata.question) ?? stringValue(value.question));
}

function dashboardHumanActionOptions(value: unknown): FrontierCodexDashboardHumanAction['options'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [{ label: entry }];
    if (!isObject(entry)) return [];
    const label = stringValue(entry.label) ?? stringValue(entry.title) ?? stringValue(entry.value);
    if (!label) return [];
    const detail = stringValue(entry.detail) ?? stringValue(entry.description) ?? stringValue(entry.impact);
    return [{ label, ...(detail ? { detail } : {}) }];
  }).slice(0, 6);
}

function evidencePathsFromBoardEntry(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((entry) => {
    if (typeof entry === 'string') return entry;
    if (isObject(entry)) return stringValue(entry.path) ?? stringValue(entry.href) ?? stringValue(entry.id) ?? '';
    return '';
  }).filter(Boolean));
}

function dashboardHumanActionType(value: string | undefined, kind: string | undefined): FrontierCodexDashboardHumanActionType {
  if (value === 'question' || value === 'concern' || value === 'review' || value === 'approval') return value;
  if (kind === 'human-question' || kind === 'ask-human' || kind === 'review-question' || kind === 'decision') return 'question';
  if (kind === 'ownership' || kind === 'escalation') return 'approval';
  return 'concern';
}

function dashboardHumanActionPriority(
  value: string | undefined,
  riskLevel: string | undefined,
  status: string | undefined,
  kind: string | undefined
): FrontierCodexDashboardHumanActionPriority {
  if (value === 'blocking' || value === 'important' || value === 'info') return value;
  if (riskLevel === 'high' || status === 'blocked' || kind === 'blocker' || kind === 'ownership') return 'blocking';
  if (status === 'needs-review' || kind === 'review-question' || kind === 'escalation') return 'important';
  return 'info';
}

function dashboardHumanActionPrefix(type: FrontierCodexDashboardHumanActionType, priority: FrontierCodexDashboardHumanActionPriority): string {
  if (priority === 'blocking') return type === 'approval' ? 'R' : 'B';
  if (type === 'approval') return 'R';
  if (type === 'question' || type === 'review') return 'Q';
  return 'I';
}

function dashboardHumanActionCode(prefix: string, ...parts: unknown[]): string {
  const hash = stableHash(parts).split(':').pop() ?? stableHash(parts);
  return `${prefix}-${hash.toUpperCase().slice(0, 4)}`;
}

function defaultHumanActionForType(type: FrontierCodexDashboardHumanActionType): string {
  if (type === 'approval') return 'Answer with approve, reject, or rerun guidance in Codex.';
  if (type === 'question') return 'Answer the question in Codex using the short code.';
  if (type === 'review') return 'Answer the question in Codex using the short code.';
  return 'Tell Codex whether this concern should block or be ignored.';
}

function isOpenDashboardHumanAction(action: FrontierCodexDashboardHumanAction): boolean {
  const status = action.status.toLowerCase();
  if (['answered', 'resolved', 'dismissed', 'cancelled', 'canceled', 'closed'].includes(status)) return false;
  return !action.answer && !action.resolution && action.answeredAt === undefined && action.resolvedAt === undefined;
}

function dashboardHumanActionPriorityRank(priority: FrontierCodexDashboardHumanActionPriority): number {
  if (priority === 'blocking') return 0;
  if (priority === 'important') return 1;
  return 2;
}


function createLaneRows(jobs: readonly FrontierCodexDashboardJob[]): FrontierCodexDashboardSnapshot['lanes'] {
  const rows = new Map<string, FrontierCodexDashboardSnapshot['lanes'][number]>();
  for (const job of jobs) {
    const id = job.lane ?? 'unassigned';
    const row = rows.get(id) ?? { id, jobCount: 0, completedCount: 0, failedCount: 0, runningCount: 0 };
    row.jobCount += 1;
    if (job.status === 'completed') row.completedCount += 1;
    if (job.status === 'failed') row.failedCount += 1;
    if (job.status === 'running') row.runningCount += 1;
    rows.set(id, row);
  }
  return Array.from(rows.values()).sort((left, right) => left.id.localeCompare(right.id));
}

async function readArtifact<T>(cwd: string, value: string | undefined, defaultFile: string): Promise<{ file: string; dir: string; json: T } | undefined> {
  if (!value) return undefined;
  const absolute = path.resolve(cwd, value);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (!stat) return undefined;
  const file = stat.isDirectory() ? path.join(absolute, defaultFile) : absolute;
  const text = await fs.readFile(file, 'utf8').catch(() => undefined);
  if (!text) return undefined;
  const json = JSON.parse(text) as T;
  return { file, dir: stat.isDirectory() ? absolute : path.dirname(file), json };
}

function isSteeringIntent(value: unknown): value is FrontierCodexDashboardSteeringIntent {
  return isObject(value) && value.kind === FRONTIER_SWARM_CODEX_STEERING_INTENT_KIND;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function dashboardCostFields(cost: ReturnType<typeof estimateCodexModelCost>): Pick<FrontierCodexDashboardJob,
  | 'billableInputTokens'
  | 'priceKnown'
  | 'pricingModel'
  | 'pricingMatchedModel'
  | 'pricingSource'
  | 'pricingUpdatedAt'
  | 'estimatedCostUsd'
  | 'estimatedInputCostUsd'
  | 'estimatedCachedInputCostUsd'
  | 'estimatedUncachedInputCostUsd'
  | 'estimatedOutputCostUsd'
  | 'estimatedCostMicroUsd'
  | 'costEstimateInputOnly'
  | 'costEstimateEstimatedInput'
  | 'costEstimateMissingOutputTokens'
  | 'unknownPricingReason'
> {
  return {
    billableInputTokens: cost.billableInputTokens,
    priceKnown: cost.priceKnown,
    ...(cost.pricingModel ? { pricingModel: cost.pricingModel } : {}),
    ...(cost.pricingMatchedModel ? { pricingMatchedModel: cost.pricingMatchedModel } : {}),
    ...(cost.pricingSource ? { pricingSource: cost.pricingSource } : {}),
    ...(cost.pricingUpdatedAt ? { pricingUpdatedAt: cost.pricingUpdatedAt } : {}),
    estimatedCostUsd: cost.estimatedCostUsd,
    estimatedInputCostUsd: cost.estimatedInputCostUsd,
    estimatedCachedInputCostUsd: cost.estimatedCachedInputCostUsd,
    estimatedUncachedInputCostUsd: cost.estimatedUncachedInputCostUsd,
    estimatedOutputCostUsd: cost.estimatedOutputCostUsd,
    estimatedCostMicroUsd: cost.estimatedCostMicroUsd,
    costEstimateInputOnly: cost.costEstimateInputOnly,
    costEstimateEstimatedInput: cost.costEstimateEstimatedInput,
    costEstimateMissingOutputTokens: cost.costEstimateMissingOutputTokens,
    ...(cost.unknownPricingReason ? { unknownPricingReason: cost.unknownPricingReason } : {})
  };
}

function roundDashboardUsd(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 'true';
}

function timestampValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function numberRecordValue(value: unknown, fallback: Record<string, number> = {}): Record<string, number> {
  if (!isObject(value)) return fallback;
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function stringListValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}
