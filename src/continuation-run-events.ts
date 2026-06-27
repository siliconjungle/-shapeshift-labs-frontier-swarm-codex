import fs from 'node:fs/promises';
import path from 'node:path';
import { createRunEvent, createRunNodeEvent, defineRunDecision, defineRunHumanQuestion, type FrontierRunEvent } from '@shapeshift-labs/frontier-run';
import type { JsonObject } from '@shapeshift-labs/frontier';
import { isObject, stableHash, uniqueStrings } from './common.js';
import { resolveRunDirectory } from './collect-pids.js';
import { normalizeCodexDistributedRunOptions, resolveCodexDistributedRunArtifactPaths } from './distributed-run.js';
import { stringArray, stringValue } from './runtime-projection-common.js';
import { appendCodexRunEvents, readCodexRunEvents, writeCodexRunDashboard } from './run-events.js';
import type { FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexContinuationInput } from './types-continuation.js';
import type {
  FrontierCodexDistributedRunArtifactPaths,
  FrontierCodexDistributedRunResolvedOptions
} from './types-distributed-run.js';

interface ContinuationRunProjection {
  runId: string;
  planId?: string;
  runEventsPath: string;
  runDashboardPath?: string;
  distributedRun?: { enabled: true; options: FrontierCodexDistributedRunResolvedOptions; paths: FrontierCodexDistributedRunArtifactPaths };
}

export async function appendContinuationRunEvents(input: {
  input: FrontierCodexContinuationInput;
  cwd: string;
  outDir: string;
  collection?: FrontierCodexCollectResult;
  generatedAt: number;
  humanActions: readonly Record<string, unknown>[];
  answeredActions: readonly Record<string, unknown>[];
  nextJobCount: number;
  nextJobIds: readonly string[];
  nextJobTaskIds: readonly string[];
  artifactPaths: {
    backlogPath: string;
    routingPolicyPath: string;
    humanActionStatePath: string;
    nextTasksPath?: string;
    nextPlanPath?: string;
    proofParentRecheckResultsPath?: string;
  };
}): Promise<ContinuationRunProjection | undefined> {
  const projection = await resolveContinuationRunProjection(input.input, input.cwd, input.outDir, input.collection);
  if (!projection) return undefined;
  const time = new Date(input.generatedAt).toISOString();
  const actorId = `frontier-swarm-codex-continuation:${stableHash([input.outDir, input.generatedAt])}`;
  const events: FrontierRunEvent[] = [];
  let actorSeq = 1;
  for (const action of input.answeredActions) {
    const code = stringValue(action.code) ?? stringValue(action.actionCode) ?? `Q-${stableHash(action).replace(/[^a-z0-9]/giu, '').slice(0, 5).toUpperCase()}`;
    const actionId = stringValue(action.id) ?? stringValue(action.actionId) ?? stringValue(action.humanActionId) ?? `human-action:${code}`;
    const jobId = stringValue(action.jobId);
    const taskId = stringValue(action.taskId);
    const lane = stringValue(action.lane);
    const answer = stringValue(action.answer)
      ?? stringValue(action.resolution)
      ?? stringValue(isObject(action.humanAnswer) ? action.humanAnswer.answer : undefined)
      ?? stringValue(isObject(action.humanAnswer) ? action.humanAnswer.text : undefined)
      ?? 'answered';
    const questionId = `human-question:${stableHash([projection.runId, jobId, actionId, code])}`;
    const questionEvent = createRunNodeEvent(projection.runId, actorId, actorSeq++, defineRunHumanQuestion({
      id: questionId,
      title: stringValue(action.title) ?? code,
      code,
      question: stringValue(action.question) ?? stringValue(action.title) ?? code,
      context: stringValue(action.context) ?? stringValue(action.detail),
      requestedAnswer: stringValue(action.requestedAnswer),
      options: humanQuestionOptions(action.options),
      status: 'answered',
      answer,
      metadata: jsonObject({
        source: 'frontier-swarm-codex.continuation',
        actionId,
        code,
        ...(jobId ? { jobId } : {}),
        ...(taskId ? { taskId } : {}),
        ...(lane ? { lane } : {}),
        humanAnswer: isObject(action.humanAnswer) ? action.humanAnswer : undefined,
        evidencePaths: stringArray(action.evidencePaths)
      })
    }), { time });
    events.push(questionEvent);
    events.push(createRunEvent({
      runId: projection.runId,
      actorId,
      actorSeq: actorSeq++,
      parents: [questionEvent.id],
      time,
      type: 'decision.recorded',
      payload: {
        decision: jsonObject(defineRunDecision({
          id: `decision:human-answer:${stableHash([questionId, answer])}`,
          title: `Human answer ${code}`,
          decision: 'human-question',
          subjectIds: uniqueStrings([
            questionId,
            jobId ? `job:${jobId}` : undefined,
            taskId ? `task:${taskId}` : undefined
          ].filter((entry): entry is string => !!entry)),
          actorId,
          reason: 'Human answer recorded for continuation.',
          requiredActions: [],
          metadata: jsonObject({
            source: 'frontier-swarm-codex.continuation',
            actionId,
            code,
            answer,
            ...(jobId ? { jobId } : {}),
            ...(taskId ? { taskId } : {}),
            ...(lane ? { lane } : {})
          })
        }))
      }
    }));
  }
  events.push(createRunEvent({
    runId: projection.runId,
    actorId,
    actorSeq: actorSeq++,
    parents: events.slice(-1).map((event) => event.id),
    time,
    type: 'decision.recorded',
    payload: {
      decision: jsonObject(defineRunDecision({
        id: `decision:continuation:${stableHash([input.outDir, input.nextJobIds, input.nextJobTaskIds])}`,
        title: 'Continuation planned',
        decision: input.nextJobCount > 0 ? 'rerun' : 'record-only',
        subjectIds: uniqueStrings([
          ...(input.nextJobIds.map((jobId) => `job:${jobId}`)),
          ...(input.nextJobTaskIds.map((taskId) => `task:${taskId}`))
        ]),
        actorId,
        reason: input.nextJobCount > 0
          ? 'Continuation planned the next worker wave.'
          : 'Continuation resolved without a next worker wave.',
        requiredActions: input.nextJobCount > 0 ? ['run-next-wave'] : [],
        metadata: jsonObject({
          source: 'frontier-swarm-codex.continuation',
          outDir: input.outDir,
          nextJobCount: input.nextJobCount,
          nextJobIds: [...input.nextJobIds],
          nextJobTaskIds: [...input.nextJobTaskIds],
          humanActionCount: input.humanActions.length,
          answeredHumanActionCount: input.answeredActions.length,
          artifactPaths: input.artifactPaths
        })
      }))
    }
  }));
  await appendCodexRunEvents(projection.runEventsPath, events);
  if (projection.runDashboardPath) {
    const runEvents = await readCodexRunEvents(projection.runEventsPath);
    await writeCodexRunDashboard(projection.runDashboardPath, runEvents, {
      runId: projection.runId,
      metadata: jsonObject({
        source: 'frontier-swarm-codex.continuation',
        outDir: input.outDir,
        ...(projection.planId ? { planId: projection.planId } : {}),
        ...(projection.distributedRun ? {
          distributedRun: {
            enabled: true,
            runDir: projection.distributedRun.paths.runDir,
            transport: projection.distributedRun.options.transport
          }
        } : {})
      })
    });
  }
  return projection;
}

export async function resolvePriorDistributedRunPaths(
  input: FrontierCodexContinuationInput,
  cwd: string,
  distributedRun: FrontierCodexDistributedRunResolvedOptions
): Promise<FrontierCodexDistributedRunArtifactPaths | undefined> {
  if (!distributedRun.enabled || !input.run) return undefined;
  if (!distributedRun.transport.supported) {
    throw new Error(`unsupported distributed run transport ${distributedRun.transport.kind}: ${distributedRun.transport.reason ?? 'no adapter is available'}`);
  }
  const prior = await readPriorRunResult(input.run, cwd);
  const priorPaths = isObject(prior?.distributedRun) && isObject(prior.distributedRun.paths)
    ? prior.distributedRun.paths
    : undefined;
  if (isDistributedRunArtifactPaths(priorPaths)) return priorPaths;
  const runId = stringValue(isObject(prior?.plan) ? prior.plan.runId : undefined)
    ?? stringValue(isObject(prior?.run) ? prior.run.id : undefined);
  if (!runId) return undefined;
  const runDir = stringValue(prior?.outDir) ?? await resolveRunDirectory(path.resolve(cwd, input.run));
  return resolveCodexDistributedRunArtifactPaths({
    cwd,
    outDir: runDir,
    runId,
    options: distributedRun
  });
}

async function resolveContinuationRunProjection(
  input: FrontierCodexContinuationInput,
  cwd: string,
  outDir: string,
  collection?: FrontierCodexCollectResult
): Promise<ContinuationRunProjection | undefined> {
  const distributedRun = normalizeCodexDistributedRunOptions(input.distributedRun);
  if (distributedRun.enabled && !distributedRun.transport.supported) {
    throw new Error(`unsupported distributed run transport ${distributedRun.transport.kind}: ${distributedRun.transport.reason ?? 'no adapter is available'}`);
  }
  const collectionPaths = collectionRunArtifactPaths(collection);
  const runId = collectionRunId(collection) ?? (distributedRun.enabled ? path.basename(collection?.runDir ?? outDir) : undefined);
  const planId = collectionPlanId(collection);
  const distributedPaths = distributedRun.enabled && runId
    ? resolveCodexDistributedRunArtifactPaths({
      cwd,
      outDir: collection?.runDir ?? outDir,
      runId,
      options: distributedRun
    })
    : undefined;
  const runEventsPath = input.runEventsPath === false
    ? undefined
    : resolveOptionalPath(cwd, input.runEventsPath ?? collectionPaths.runEventsPath ?? distributedPaths?.runEventsPath);
  if (!runEventsPath || !runId) return undefined;
  const runDashboardPath = input.runDashboardPath === false
    ? undefined
    : resolveOptionalPath(cwd, input.runDashboardPath ?? collectionPaths.runDashboardPath ?? distributedPaths?.runDashboardPath);
  return {
    runId,
    ...(planId ? { planId } : {}),
    runEventsPath,
    ...(runDashboardPath ? { runDashboardPath } : {}),
    ...(distributedRun.enabled && distributedPaths ? {
      distributedRun: {
        enabled: true,
        options: distributedRun,
        paths: distributedPaths
      }
    } : {})
  };
}

async function readPriorRunResult(run: string, cwd: string): Promise<Record<string, unknown> | undefined> {
  const absolute = path.resolve(cwd, run);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  const file = stat?.isDirectory() ? path.join(absolute, 'swarm-results.json') : absolute;
  const parsed = await fs.readFile(file, 'utf8').then((text) => JSON.parse(text) as unknown).catch(() => undefined);
  return isObject(parsed) ? parsed : undefined;
}

function collectionRunArtifactPaths(collection: FrontierCodexCollectResult | undefined): {
  runEventsPath?: string;
  runDashboardPath?: string;
} {
  const metadata = isObject(collection?.dashboard?.metadata) ? collection.dashboard.metadata : {};
  const artifactPaths = isObject(metadata.artifactPaths) ? metadata.artifactPaths : {};
  const runSource = isObject(metadata.runSource) ? metadata.runSource : {};
  return {
    runEventsPath: stringValue(metadata.runEventsPath)
      ?? stringValue(artifactPaths.runEvents)
      ?? stringValue(runSource.runEventsPath),
    runDashboardPath: stringValue(metadata.runDashboardPath)
      ?? stringValue(artifactPaths.runDashboard)
      ?? stringValue(runSource.runDashboardPath)
  };
}

function collectionRunId(collection: FrontierCodexCollectResult | undefined): string | undefined {
  const dashboard: Record<string, unknown> = isObject(collection?.dashboard) ? collection.dashboard : {};
  return stringValue(isObject(dashboard.plan) ? dashboard.plan.runId : undefined)
    ?? stringValue(isObject(dashboard.run) ? dashboard.run.id : undefined)
    ?? stringValue(isObject(dashboard.metadata) ? dashboard.metadata.runId : undefined)
    ?? (collection?.runDir ? path.basename(collection.runDir) : undefined);
}

function collectionPlanId(collection: FrontierCodexCollectResult | undefined): string | undefined {
  const dashboard: Record<string, unknown> = isObject(collection?.dashboard) ? collection.dashboard : {};
  return stringValue(isObject(dashboard.plan) ? dashboard.plan.id : undefined);
}

function isDistributedRunArtifactPaths(value: unknown): value is FrontierCodexDistributedRunArtifactPaths {
  return isObject(value)
    && typeof value.runDir === 'string'
    && typeof value.runEventsPath === 'string'
    && typeof value.runDashboardPath === 'string';
}

function resolveOptionalPath(cwd: string, value: string | undefined): string | undefined {
  return value ? path.resolve(cwd, value) : undefined;
}

function humanQuestionOptions(value: unknown): Array<{ label: string; value: string; description?: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const options = value.map((entry) => {
    if (typeof entry === 'string') return { label: entry, value: entry };
    if (!isObject(entry)) return undefined;
    const label = stringValue(entry.label) ?? stringValue(entry.value);
    const optionValue = stringValue(entry.value) ?? label;
    if (!label || !optionValue) return undefined;
    return {
      label,
      value: optionValue,
      ...(stringValue(entry.description) ? { description: stringValue(entry.description) } : {})
    };
  }).filter((entry): entry is { label: string; value: string; description?: string } => !!entry);
  return options.length ? options : undefined;
}

function jsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}
