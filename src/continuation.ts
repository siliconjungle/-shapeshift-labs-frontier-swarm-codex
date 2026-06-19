import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createSwarmBacklog,
  createSwarmModelRoutingPolicy,
  mergeSwarmBacklogs,
  type FrontierSwarmBacklog,
  type FrontierSwarmBacklogInput,
  type FrontierSwarmJob,
  type FrontierSwarmModelRoutingFeedback,
  type FrontierSwarmModelRoutingFeedbackInput,
  type FrontierSwarmModelRoutingPolicy,
  type FrontierSwarmModelRoutingPolicyInput,
  type FrontierSwarmTaskInput
} from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_CONTINUATION_KIND,
  FRONTIER_SWARM_CODEX_CONTINUATION_VERSION
} from './constants.js';
import { uniqueStrings } from './common.js';
import { collectCodexSwarmRun } from './collect.js';
import {
  readContinuationChildBacklogs,
  resolveContinuationChildBacklogNames
} from './continuation-child-backlogs.js';
import {
  createContinuationFeedback,
  createContinuationRoutingCostSummary,
  createContinuationTournamentSummary
} from './continuation-feedback.js';
import { projectContinuationTerminalOutcomes } from './continuation-terminal-outcomes.js';
import { coerceCodexSwarmTasksInput, createCodexSwarmPlan } from './index.js';
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
  const feedback = createContinuationFeedback({
    collection,
    repository: input.repository ?? path.basename(cwd),
    packageName: input.package
  });
  const routingCostSummary = createContinuationRoutingCostSummary(feedback);
  const tournamentSummary = createContinuationTournamentSummary(collection);
  const baseRoutingPolicy = await readContinuationRoutingPolicy(input, cwd);
  const baseRoutingFeedback = Array.isArray((baseRoutingPolicy as { feedback?: unknown[] } | undefined)?.feedback)
    ? (baseRoutingPolicy as { feedback: (FrontierSwarmModelRoutingFeedbackInput | FrontierSwarmModelRoutingFeedback)[] }).feedback
    : [];
  const nextRoutingPolicy = createSwarmModelRoutingPolicy({
    ...(baseRoutingPolicy ?? {}),
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
  const childBacklogPaths = childBacklogs.map((entry) => entry.path);
  const nextJobs = nextPlan?.jobs ?? [];
  const nextJobRouting = summarizeNextJobRouting(nextJobs);
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.dirname(backlogPath), { recursive: true });
  await fs.mkdir(path.dirname(routingPolicyPath), { recursive: true });
  await fs.writeFile(backlogPath, JSON.stringify(projected.backlog, null, 2) + '\n');
  await fs.writeFile(routingPolicyPath, JSON.stringify(nextRoutingPolicy, null, 2) + '\n');
  if (nextPlan && nextPlanPath) await fs.writeFile(nextPlanPath, JSON.stringify(nextPlan, null, 2) + '\n');
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
    ...(nextPlanPath ? { nextPlanPath } : {}),
    childBacklogNames,
    childBacklogPaths,
    feedbackCount: feedback.length,
    nextBacklog: projected.backlog,
    nextRoutingPolicy,
    ...(nextPlan ? { nextPlan } : {}),
    summary: {
      childBacklogCount: childBacklogs.length,
      childBacklogEntryCount: childBacklogs.reduce((sum, entry) => sum + entry.backlog.entries.length, 0),
      feedbackCount: feedback.length,
      totalRoutingFeedbackCount: nextRoutingPolicy.feedback.length,
      backlogEntryCount: projected.backlog.entries.length,
      terminalOutcomeProjection: projected.summary,
      routingPreferenceCount: nextRoutingPolicy.preferences.length,
      routingPreferences: {
        defaultMode: nextRoutingPolicy.defaultMode,
        signalCount: nextRoutingPolicy.summary.signalCount,
        feedbackCount: nextRoutingPolicy.summary.feedbackCount,
        preferenceCount: nextRoutingPolicy.summary.preferenceCount,
        preferCount: nextRoutingPolicy.summary.preferCount,
        avoidCount: nextRoutingPolicy.summary.avoidCount
      },
      routingCost: routingCostSummary,
      nextJobCount: nextJobs.length,
      nextJobIds: nextJobs.map((job) => job.id),
      nextJobTaskIds: nextJobs.map((job) => job.taskId),
      nextJobLaneCounts: countByString(nextJobs.map((job) => job.lane)),
      nextJobRouting,
      tournamentObservationCount: tournamentSummary?.adaptiveFeedback.observationCount ?? 0,
      tournamentRecommendationCount: tournamentSummary?.adaptiveFeedback.recommendationCount ?? 0,
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
        ...(nextPlanPath ? { nextPlanPath } : {}),
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
  return collectCodexSwarmRun({
    run: input.run,
    cwd,
    outDir: input.collectionOutDir,
    checkStale: input.checkStale,
    semanticImportExpected: input.semanticImportExpected,
    branchPrefix: input.branchPrefix
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
  return raw ? createSwarmBacklog(raw as FrontierSwarmBacklogInput) : createSwarmBacklog({
    id: 'swarm-backlog:continuation',
    title: 'Continuation Backlog'
  });
}

async function readContinuationRoutingPolicy(
  input: FrontierCodexContinuationInput,
  cwd: string
): Promise<FrontierSwarmModelRoutingPolicyInput | FrontierSwarmModelRoutingPolicy | undefined> {
  return readOptionalJsonPath(input.routingPolicyPath, cwd, input.routingPolicy) as Promise<FrontierSwarmModelRoutingPolicyInput | FrontierSwarmModelRoutingPolicy | undefined>;
}

async function readOptionalJsonPath(file: string | undefined, cwd: string, fallback?: unknown): Promise<unknown | undefined> {
  if (!file) return fallback;
  return JSON.parse(await fs.readFile(path.resolve(cwd, file), 'utf8'));
}

function countByString(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function summarizeNextJobRouting(jobs: readonly FrontierSwarmJob[]): FrontierCodexContinuationResult['summary']['nextJobRouting'] {
  const routed = jobs
    .map((job) => ({ job, route: readModelRouteMetadata(job) }))
    .filter((entry): entry is { job: FrontierSwarmJob; route: Record<string, unknown> } => !!entry.route);
  const changed = routed.filter((entry) => {
    const fallback = stringValue(entry.route.fallbackComputeId);
    const selected = stringValue(entry.route.selectedComputeId);
    return !!fallback && !!selected && fallback !== selected;
  });
  return {
    routedJobCount: routed.length,
    changedComputeCount: changed.length,
    policyFeedbackMatchCount: routed.reduce((sum, entry) => sum + numberValue(readRouteSummaryValue(entry.route, 'routingPolicyFeedbackCount')), 0),
    policyCostSignalCount: routed.reduce((sum, entry) => sum + numberValue(readRouteSummaryValue(entry.route, 'routingPolicyCostSignalCount')), 0),
    policyPreferenceMatchCount: routed.reduce((sum, entry) => sum + numberValue(readRouteSummaryValue(entry.route, 'routingPolicyPreferenceCount')), 0),
    selectedComputeCounts: countByString(routed.map((entry) => stringValue(entry.route.selectedComputeId)).filter((entry): entry is string => !!entry)),
    fallbackComputeCounts: countByString(routed.map((entry) => stringValue(entry.route.fallbackComputeId)).filter((entry): entry is string => !!entry)),
    routedJobIds: routed.map((entry) => entry.job.id),
    changedComputeJobIds: changed.map((entry) => entry.job.id)
  };
}

function readModelRouteMetadata(job: FrontierSwarmJob): Record<string, unknown> | undefined {
  const metadata = job.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const route = (metadata as Record<string, unknown>).modelRoute;
  return route && typeof route === 'object' && !Array.isArray(route) ? route as Record<string, unknown> : undefined;
}

function readRouteSummaryValue(route: Record<string, unknown>, key: string): unknown {
  const summary = route.summary;
  return summary && typeof summary === 'object' && !Array.isArray(summary)
    ? (summary as Record<string, unknown>)[key]
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function sanitizeContinuationBacklogForPlan(
  backlog: FrontierSwarmBacklog,
  explicitTasks: readonly FrontierSwarmTaskInput[]
): FrontierSwarmBacklog {
  const entryTaskIds = new Map(backlog.entries.map((entry) => [entry.id, entry.taskId ?? entry.id]));
  const plannedTaskIds = new Set([
    ...explicitTasks.map((task) => task.id),
    ...entryTaskIds.values()
  ]);
  const normalizeTaskId = (value: string) => entryTaskIds.get(value) ?? value;
  return {
    ...backlog,
    entries: backlog.entries.map((entry) => {
      const parentTaskId = entry.parentEntryId ? normalizeTaskId(entry.parentEntryId) : undefined;
      const dependsOn = uniqueStrings(entry.dependsOn.map(normalizeTaskId).filter((dependency) => plannedTaskIds.has(dependency)));
      const { parentEntryId: _parentEntryId, ...rest } = entry;
      return {
        ...rest,
        ...(parentTaskId && plannedTaskIds.has(parentTaskId) ? { parentEntryId: parentTaskId } : {}),
        dependsOn
      };
    })
  };
}
