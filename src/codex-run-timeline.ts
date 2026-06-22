import {
  createRunEvent,
  createRunNodeEvent,
  defineRunDecision,
  defineRunHumanQuestion,
  type FrontierRunEvent
} from '@shapeshift-labs/frontier-run';
import type { JsonObject } from '@shapeshift-labs/frontier';
import { createRunEventsFromMergeBundle, createRunEventsFromSwarmResult, type FrontierSwarmJob, type FrontierSwarmJobResultInput, type FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { appendCodexRunEvents, resolveCodexRunEventsPath } from './run-events.js';
import { stableHash } from './common.js';
import {
  humanActionsFromResult,
  normalizedStatus,
  stringArray,
  stringValue
} from './runtime-projection-common.js';
import type { FrontierCodexSwarmRunOptions } from './index.js';

export interface FrontierCodexJobResultTimelineInput {
  options: FrontierCodexSwarmRunOptions;
  outDir: string;
  job: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
  mergeBundle: FrontierSwarmMergeBundle;
}

export function createCodexJobResultTimelineEvents(input: FrontierCodexJobResultTimelineInput): FrontierRunEvent[] {
  return [
    ...createRunEventsFromSwarmResult(input.result, {
      runId: input.options.eventStream?.runId,
      actorId: `frontier-swarm-codex-worker:${input.job.id}`,
      time: new Date(input.result.finishedAt ?? Date.now()).toISOString(),
      job: input.job
    }),
    ...createRunEventsFromMergeBundle(input.mergeBundle, {
      runId: input.options.eventStream?.runId,
      actorId: `frontier-swarm-codex-collector:${input.job.id}`,
      time: new Date(input.mergeBundle.generatedAt ?? input.result.finishedAt ?? Date.now()).toISOString()
    }),
    ...createRunEventsFromHumanActions(input)
  ];
}

export async function appendCodexJobResultTimelineEvents(input: FrontierCodexJobResultTimelineInput): Promise<FrontierRunEvent[]> {
  const events = createCodexJobResultTimelineEvents(input);
  await appendCodexRunEvents(resolveCodexRunEventsPath({
    cwd: input.options.cwd,
    outDir: input.outDir,
    runEventsPath: input.options.runEventsPath
  }), events);
  return events;
}

function createRunEventsFromHumanActions(input: FrontierCodexJobResultTimelineInput): FrontierRunEvent[] {
  const actions = humanActionsFromResult(input.result);
  if (actions.length === 0) return [];
  const runId = input.options.eventStream?.runId ?? input.mergeBundle.runId ?? 'frontier-swarm';
  const actorId = `frontier-swarm-codex-human-broker:${input.job.id}`;
  const time = new Date(input.result.finishedAt ?? Date.now()).toISOString();
  const events: FrontierRunEvent[] = [];
  let actorSeq = 1;
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const code = stringValue(action.code) ?? `Q-${stableHash([input.result.jobId, index]).replace(/[^a-z0-9]/giu, '').slice(0, 5).toUpperCase()}`;
    const actionId = stringValue(action.id) ?? stringValue(action.actionId) ?? `human-action:${code}`;
    const status = normalizedStatus(action.status);
    const questionId = `human-question:${stableHash([runId, input.result.jobId, actionId, code])}`;
    const questionEvent = createRunNodeEvent(runId, actorId, actorSeq++, defineRunHumanQuestion({
      id: questionId,
      title: stringValue(action.title) ?? code,
      code,
      question: stringValue(action.question) ?? stringValue(action.title) ?? code,
      context: stringValue(action.context),
      requestedAnswer: stringValue(action.requestedAnswer),
      options: humanActionOptions(action.options),
      status: status === 'answered' || stringValue(action.answer) ? 'answered' : ['cancelled', 'canceled', 'dismissed', 'closed'].includes(status) ? 'cancelled' : 'open',
      answer: stringValue(action.answer),
      metadata: jsonObject({
        source: 'frontier-swarm-codex.human-action',
        jobId: input.result.jobId,
        taskId: input.job.taskId,
        lane: input.job.lane,
        actionId,
        status,
        ...(stringValue(action.priority) ? { priority: stringValue(action.priority) } : {}),
        evidencePaths: uniqueStringArray([
          ...stringArray(action.evidencePaths),
          ...(Array.isArray(input.result.evidencePaths) ? input.result.evidencePaths.map(String) : [])
        ])
      })
    }), { time });
    events.push(questionEvent);
    events.push(createRunEvent({
      runId,
      actorId,
      actorSeq: actorSeq++,
      parents: [questionEvent.id],
      time,
      type: 'decision.recorded',
      payload: {
        decision: jsonObject(defineRunDecision({
          id: `decision:human-question:${stableHash([questionId, status])}`,
          title: `Human question ${code}`,
          decision: 'human-question',
          subjectIds: [questionId, `job:${input.result.jobId}`, `task:${input.job.taskId}`],
          actorId,
          reason: status === 'answered' ? 'Human answer recorded.' : 'Worker requested structured human input.',
          requiredActions: status === 'answered' ? [] : ['answer-human-question'],
          metadata: jsonObject({
            source: 'frontier-swarm-codex.human-action',
            jobId: input.result.jobId,
            taskId: input.job.taskId,
            lane: input.job.lane,
            actionId,
            code,
            status
          })
        }))
      }
    }));
  }
  return events;
}

function humanActionOptions(value: unknown): Array<{ label: string; value: string; description?: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((entry) => {
      if (typeof entry === 'string') return { label: entry, value: entry };
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
      const record = entry as Record<string, unknown>;
      const label = stringValue(record.label) ?? stringValue(record.value);
      const optionValue = stringValue(record.value) ?? label;
      if (!label || !optionValue) return undefined;
      return {
        label,
        value: optionValue,
        ...(stringValue(record.description) ? { description: stringValue(record.description) } : {})
      };
    })
    .filter((entry): entry is { label: string; value: string; description?: string } => !!entry);
  return out.length ? out : undefined;
}

function uniqueStringArray(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function jsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}
