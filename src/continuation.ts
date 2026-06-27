import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createSwarmBacklog,
  createSwarmModelRoutingPolicy,
  mergeSwarmBacklogs,
  type FrontierSwarmBacklog,
  type FrontierSwarmBacklogInput,
  type FrontierSwarmModelRoutingFeedback,
  type FrontierSwarmModelRoutingFeedbackInput,
  type FrontierSwarmModelRoutingPolicy,
  type FrontierSwarmModelRoutingPolicyInput
} from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_CONTINUATION_KIND, FRONTIER_SWARM_CODEX_CONTINUATION_VERSION } from './constants.js';
import { uniqueStrings } from './common.js';
import { collectCodexSwarmRun } from './collect.js';
import { createAdaptiveRoutingSignalsFromTournamentFeedback, dedupeRoutingSignals, summarizeAdaptiveRoutingSignals } from './continuation-adaptive-routing.js';
import { readContinuationChildBacklogs, resolveContinuationChildBacklogNames } from './continuation-child-backlogs.js';
import { createContinuationFeedback, createContinuationRoutingCostSummary, createContinuationTournamentSummary } from './continuation-feedback.js';
import { createContinuationHumanActionState } from './continuation-human-actions.js';
import { summarizeNextJobRouting } from './continuation-job-routing-summary.js';
import { appendContinuationRunEvents, resolvePriorDistributedRunPaths } from './continuation-run-events.js';
import { writeContinuationTaskSource } from './continuation-task-source.js';
import { projectContinuationTerminalOutcomes } from './continuation-terminal-outcomes.js';
import { countByString, sanitizeContinuationBacklogForPlan } from './continuation-plan-utils.js';
import { coerceCodexSwarmTasksInput, createCodexSwarmPlan } from './index.js';
import { normalizeCodexDistributedRunOptions } from './distributed-run.js';
import { writeCodexProofParentApplyCandidates } from './proof-parent-apply-candidates.js';
import { writeCodexProofParentRecheckResults } from './proof-parent-recheck-results.js';
import type { FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexContinuationInput, FrontierCodexContinuationResult } from './types-continuation.js';

export async function continueCodexSwarmLoop(input: FrontierCodexContinuationInput): Promise<FrontierCodexContinuationResult> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const collection = await resolveContinuationCollection(input, cwd);
  const outDir = path.resolve(cwd, input.outDir ?? path.join(collection?.outDir ?? cwd, 'continuation'));
  const baseBacklog = await readContinuationBacklog(input, cwd);
  const childBacklogNames = resolveContinuationChildBacklogNames(input);
  const childBacklogs = await readContinuationChildBacklogs({
    roots: uniqueStrings([collection?.outDir, collection?.runDir].filter((entry): entry is string => !!entry)),
    names: childBacklogNames
  });
  const nextBacklog = mergeSwarmBacklogs({
    base: baseBacklog,
    backlogs: childBacklogs.map((entry) => entry.backlog),
    generatedAt,
    metadata: {
      continuationGeneratedAt: generatedAt,
      childBacklogNames,
      childBacklogPaths: childBacklogs.map((entry) => entry.path)
    }
  });
  const humanActionState = await createContinuationHumanActionState({ continuation: input, cwd, outDir, collection, generatedAt });
  const feedback = createContinuationFeedback({
    collection,
    repository: input.repository ?? path.basename(cwd),
    packageName: input.package
  });
  const routingCostSummary = createContinuationRoutingCostSummary(feedback);
  const tournamentSummary = createContinuationTournamentSummary(collection);
  const adaptiveRoutingSignals = createAdaptiveRoutingSignalsFromTournamentFeedback(collection);
  const adaptiveRouting = summarizeAdaptiveRoutingSignals(collection, adaptiveRoutingSignals);
  const baseRoutingPolicy = await readContinuationRoutingPolicy(input, cwd);
  const baseRoutingFeedback = Array.isArray((baseRoutingPolicy as { feedback?: unknown[] } | undefined)?.feedback)
    ? (baseRoutingPolicy as { feedback: (FrontierSwarmModelRoutingFeedbackInput | FrontierSwarmModelRoutingFeedback)[] }).feedback
    : [];
  const baseRoutingSignals = Array.isArray((baseRoutingPolicy as { signals?: unknown[] } | undefined)?.signals)
    ? (baseRoutingPolicy as { signals: FrontierSwarmModelRoutingPolicy['signals'] }).signals
    : [];
  const nextRoutingPolicy = createSwarmModelRoutingPolicy({
    ...(baseRoutingPolicy ?? {}),
    signals: dedupeRoutingSignals([
      ...baseRoutingSignals,
      ...adaptiveRoutingSignals
    ]),
    feedback: [
      ...baseRoutingFeedback,
      ...feedback
    ],
    generatedAt,
    metadata: {
      ...((baseRoutingPolicy as FrontierSwarmModelRoutingPolicy | undefined)?.metadata ?? {}),
      continuationGeneratedAt: generatedAt,
      feedbackCount: feedback.length,
      repository: input.repository ?? path.basename(cwd),
      ...(input.package ? { package: input.package } : {}),
      collectionDir: collection?.outDir,
      ...(collection?.runDir ? { collectionRunDir: collection.runDir } : {}),
      ...(collection?.generatedAt ? { collectionGeneratedAt: collection.generatedAt } : {}),
      ...(collection?.summary ? { collectionSummary: collection.summary } : {}),
      adaptiveRouting,
      routingCostSummary,
      ...(tournamentSummary ? { tournamentSummary } : {})
    }
  });
  const manifest = await readOptionalJsonPath(input.manifestPath, cwd, input.manifest);
  const tasks = await readOptionalJsonPath(input.tasksPath, cwd, input.tasks ?? []);
  const planTasks = coerceCodexSwarmTasksInput(tasks);
  const projected = projectContinuationTerminalOutcomes({
    backlog: nextBacklog,
    tasks: planTasks,
    collection,
    answeredHumanActions: humanActionState.answeredActions,
    generatedAt
  });
  await fs.mkdir(outDir, { recursive: true });
  const proofParentRecheckResults = await writeCodexProofParentRecheckResults({
    cwd,
    outDir,
    collection,
    backlog: projected.backlog,
    generatedAt
  });
  const proofParentApplyCandidates = await writeCodexProofParentApplyCandidates({
    cwd,
    outDir,
    recheck: proofParentRecheckResults?.result,
    generatedAt
  });
  const nextPlan = manifest ? createCodexSwarmPlan({
    manifest,
    tasks: projected.tasks,
    backlog: sanitizeContinuationBacklogForPlan(projected.backlog, projected.tasks),
    backlogPlan: {
      ...(input.backlogPlan ?? {}),
      backlogPath: input.backlogPath
    },
    routingPolicy: nextRoutingPolicy,
    routingMode: input.routingMode,
    routingContext: {
      repository: input.repository ?? path.basename(cwd),
      package: input.package
    },
    plan: input.plan
  }) : undefined;
  const backlogPath = path.resolve(cwd, input.write && input.backlogPath ? input.backlogPath : path.join(outDir, 'backlog.next.json'));
  const routingPolicyPath = path.resolve(cwd, input.write && input.routingPolicyPath ? input.routingPolicyPath : path.join(outDir, 'model-routing-policy.next.json'));
  const nextPlanPath = nextPlan ? path.join(outDir, 'next-plan.json') : undefined;
  const nextTasksPath = await writeContinuationTaskSource({ cwd, outDir, write: input.write, tasks: input.tasks, tasksPath: input.tasksPath, projectedTasks: projected.tasks });
  const childBacklogPaths = childBacklogs.map((entry) => entry.path);
  const nextJobs = nextPlan?.jobs ?? [];
  const nextJobRouting = summarizeNextJobRouting(nextJobs);
  await fs.mkdir(path.dirname(backlogPath), { recursive: true });
  await fs.mkdir(path.dirname(routingPolicyPath), { recursive: true });
  await fs.writeFile(backlogPath, JSON.stringify(projected.backlog, null, 2) + '\n');
  await fs.writeFile(routingPolicyPath, JSON.stringify(nextRoutingPolicy, null, 2) + '\n');
  await fs.writeFile(humanActionState.statePath, JSON.stringify(humanActionState, null, 2) + '\n');
  if (nextPlan && nextPlanPath) await fs.writeFile(nextPlanPath, JSON.stringify(nextPlan, null, 2) + '\n');
  const continuationRun = await appendContinuationRunEvents({
    input,
    cwd,
    outDir,
    collection,
    generatedAt,
    humanActions: humanActionState.actions,
    answeredActions: humanActionState.answeredActions,
    nextJobCount: nextJobs.length,
    nextJobIds: nextJobs.map((job) => job.id),
    nextJobTaskIds: nextJobs.map((job) => job.taskId),
    artifactPaths: {
      backlogPath,
      routingPolicyPath,
      humanActionStatePath: humanActionState.statePath,
      ...(nextTasksPath ? { nextTasksPath } : {}),
      ...(nextPlanPath ? { nextPlanPath } : {}),
      ...(proofParentRecheckResults?.path ? { proofParentRecheckResultsPath: proofParentRecheckResults.path } : {}),
      ...(proofParentApplyCandidates?.path ? { proofParentApplyCandidatesPath: proofParentApplyCandidates.path } : {})
    }
  });
  const result: FrontierCodexContinuationResult = {
    kind: FRONTIER_SWARM_CODEX_CONTINUATION_KIND,
    version: FRONTIER_SWARM_CODEX_CONTINUATION_VERSION,
    ok: true,
    generatedAt,
    cwd,
    outDir,
    ...(collection?.outDir ? { collectionDir: collection.outDir } : {}),
    ...(collection?.runDir ? { runDir: collection.runDir } : {}),
    backlogPath,
    routingPolicyPath,
    humanActionStatePath: humanActionState.statePath,
    ...(continuationRun?.runEventsPath ? { runEventsPath: continuationRun.runEventsPath } : {}),
    ...(continuationRun?.runDashboardPath ? { runDashboardPath: continuationRun.runDashboardPath } : {}),
    ...(continuationRun?.distributedRun ? { distributedRun: continuationRun.distributedRun } : {}),
    ...(nextTasksPath ? { nextTasksPath } : {}),
    ...(nextPlanPath ? { nextPlanPath } : {}),
    ...(proofParentRecheckResults?.path ? { proofParentRecheckResultsPath: proofParentRecheckResults.path } : {}),
    ...(proofParentRecheckResults?.result ? { proofParentRecheckResults: proofParentRecheckResults.result } : {}),
    ...(proofParentApplyCandidates?.path ? { proofParentApplyCandidatesPath: proofParentApplyCandidates.path } : {}),
    ...(proofParentApplyCandidates?.collectionDir ? { proofParentApplyCandidateCollectionDir: proofParentApplyCandidates.collectionDir } : {}),
    ...(proofParentApplyCandidates?.result ? { proofParentApplyCandidates: proofParentApplyCandidates.result } : {}),
    childBacklogNames,
    childBacklogPaths,
    feedbackCount: feedback.length,
    nextBacklog: projected.backlog,
    nextRoutingPolicy,
    humanActions: humanActionState.actions,
    humanAnswers: humanActionState.answers,
    ...(nextPlan ? { nextPlan } : {}),
    summary: {
      childBacklogCount: childBacklogs.length,
      childBacklogEntryCount: childBacklogs.reduce((sum, entry) => sum + entry.backlog.entries.length, 0),
      feedbackCount: feedback.length,
      totalRoutingFeedbackCount: nextRoutingPolicy.feedback.length,
      backlogEntryCount: projected.backlog.entries.length,
      terminalOutcomeProjection: projected.summary,
      humanActions: {
        ...humanActionState.summary,
        answerPaths: humanActionState.answerPaths,
        statePath: humanActionState.statePath
      },
      routingPreferenceCount: nextRoutingPolicy.preferences.length,
      routingPreferences: {
        defaultMode: nextRoutingPolicy.defaultMode,
        signalCount: nextRoutingPolicy.summary.signalCount,
        feedbackCount: nextRoutingPolicy.summary.feedbackCount,
        preferenceCount: nextRoutingPolicy.summary.preferenceCount,
        preferCount: nextRoutingPolicy.summary.preferCount,
        avoidCount: nextRoutingPolicy.summary.avoidCount
      },
      adaptiveRouting,
      routingCost: routingCostSummary,
      nextJobCount: nextJobs.length,
      nextJobIds: nextJobs.map((job) => job.id),
      nextJobTaskIds: nextJobs.map((job) => job.taskId),
      nextJobLaneCounts: countByString(nextJobs.map((job) => job.lane)),
      nextJobRouting,
      tournamentObservationCount: tournamentSummary?.adaptiveFeedback.observationCount ?? 0,
      tournamentRecommendationCount: tournamentSummary?.adaptiveFeedback.recommendationCount ?? 0,
      ...(proofParentRecheckResults?.result ? { proofParentRecheck: proofParentRecheckResults.result.summary } : {}),
      ...(proofParentApplyCandidates?.result ? { proofParentApplyCandidates: proofParentApplyCandidates.result.summary } : {}),
      ...(collection ? {
        collectionBucketCounts: collection.summary,
        tournamentCounts: {
          strategyCount: collection.strategyTournament.summary.strategyCount,
          gameCount: collection.strategyTournament.summary.gameCount,
          matchCount: collection.strategyTournament.summary.matchCount,
          verifiedCount: collection.strategyTournament.summary.verifiedCount,
          rejectedCount: collection.strategyTournament.summary.rejectedCount,
          undefinedCount: collection.strategyTournament.summary.undefinedCount,
          sampleConfidence: collection.strategyTournament.summary.sampleConfidence,
          decisionGrade: collection.strategyTournament.summary.decisionGrade
        },
        tournamentFeedbackCounts: collection.tournamentAdaptiveFeedback.summary
      } : {}),
      paths: {
        outDir,
        ...(collection?.outDir ? { collectionDir: collection.outDir } : {}),
        ...(collection?.runDir ? { runDir: collection.runDir } : {}),
        backlogPath,
        routingPolicyPath,
        humanActionStatePath: humanActionState.statePath,
        ...(continuationRun?.runEventsPath ? { runEventsPath: continuationRun.runEventsPath } : {}),
        ...(continuationRun?.runDashboardPath ? { runDashboardPath: continuationRun.runDashboardPath } : {}),
        ...(continuationRun?.distributedRun ? { distributedRunDir: continuationRun.distributedRun.paths.runDir } : {}),
        ...(nextTasksPath ? { nextTasksPath } : {}),
        ...(nextPlanPath ? { nextPlanPath } : {}),
        ...(proofParentRecheckResults?.path ? { proofParentRecheckResultsPath: proofParentRecheckResults.path } : {}),
        ...(proofParentApplyCandidates?.path ? { proofParentApplyCandidatesPath: proofParentApplyCandidates.path } : {}),
        ...(proofParentApplyCandidates?.collectionDir ? { proofParentApplyCandidateCollectionDir: proofParentApplyCandidates.collectionDir } : {}),
        childBacklogPaths
      }
    }
  };
  await fs.writeFile(path.join(outDir, 'continuation.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

async function resolveContinuationCollection(
  input: FrontierCodexContinuationInput,
  cwd: string
): Promise<FrontierCodexCollectResult | undefined> {
  if (input.collection) return readContinuationCollection(input.collection, cwd);
  if (!input.run) return undefined;
  const distributedRun = normalizeCodexDistributedRunOptions(input.distributedRun);
  const priorDistributedPaths = await resolvePriorDistributedRunPaths(input, cwd, distributedRun);
  return collectCodexSwarmRun({
    run: input.run,
    cwd,
    outDir: input.collectionOutDir,
    checkStale: input.checkStale,
    semanticImportExpected: input.semanticImportExpected,
    branchPrefix: input.branchPrefix,
    runEventsPath: input.runEventsPath !== undefined ? input.runEventsPath : priorDistributedPaths?.runEventsPath,
    runDashboardPath: input.runDashboardPath !== undefined ? input.runDashboardPath : priorDistributedPaths?.runDashboardPath,
    runSyncPeers: distributedRun.enabled
      ? uniqueStrings([...(input.runSyncPeers ?? []), ...distributedRun.peers])
      : input.runSyncPeers,
    runSyncDirection: distributedRun.enabled ? distributedRun.syncDirection : input.runSyncDirection,
    runSyncEvidencePath: input.runSyncEvidencePath !== undefined ? input.runSyncEvidencePath : priorDistributedPaths?.runSyncEvidencePath,
    runSyncHistoryPath: input.runSyncHistoryPath !== undefined ? input.runSyncHistoryPath : priorDistributedPaths?.runSyncHistoryPath
  });
}

async function readContinuationCollection(collectionPath: string, cwd: string): Promise<FrontierCodexCollectResult> {
  const absolute = path.resolve(cwd, collectionPath);
  const stat = await fs.lstat(absolute);
  const file = stat.isDirectory() ? path.join(absolute, 'collection.json') : absolute;
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as FrontierCodexCollectResult;
  return {
    ...parsed,
    outDir: parsed.outDir ? path.resolve(cwd, parsed.outDir) : path.dirname(file),
    runDir: parsed.runDir ? path.resolve(cwd, parsed.runDir) : path.dirname(file)
  };
}

async function readContinuationBacklog(input: FrontierCodexContinuationInput, cwd: string): Promise<FrontierSwarmBacklog> {
  const raw = await readOptionalJsonPath(input.backlogPath, cwd, input.backlog);
  return raw ? createSwarmBacklog(raw as FrontierSwarmBacklogInput) : createSwarmBacklog({ id: 'swarm-backlog:continuation', title: 'Continuation Backlog' });
}

async function readContinuationRoutingPolicy(input: FrontierCodexContinuationInput, cwd: string): Promise<FrontierSwarmModelRoutingPolicyInput | FrontierSwarmModelRoutingPolicy | undefined> {
  return readOptionalJsonPath(input.routingPolicyPath, cwd, input.routingPolicy) as Promise<FrontierSwarmModelRoutingPolicyInput | FrontierSwarmModelRoutingPolicy | undefined>;
}

async function readOptionalJsonPath(file: string | undefined, cwd: string, fallback?: unknown): Promise<unknown | undefined> {
  if (!file) return fallback;
  return JSON.parse(await fs.readFile(path.resolve(cwd, file), 'utf8'));
}
