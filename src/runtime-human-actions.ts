import fs from 'node:fs/promises';
import type { FrontierSwarmJob, FrontierSwarmJobResultInput, FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENT_KIND,
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENT_VERSION,
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_KIND,
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_VERSION
} from './constants.js';
import { isObject, pathExists, stableHash, uniqueStrings } from './common.js';
import {
  countBy,
  humanActionIsOpen,
  humanActionsFromResult,
  normalizedStatus,
  optionalNumberValue,
  readJsonl,
  stableActionKey,
  stringArray,
  stringValue
} from './runtime-projection-common.js';
import type { FrontierCodexHumanActionBrokerState, FrontierCodexHumanActionEvent } from './types-runtime-projections.js';

export function createCodexHumanActionEvents(input: {
  plan: FrontierSwarmPlan;
  job?: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
  generatedAt: number;
}): FrontierCodexHumanActionEvent[] {
  return humanActionsFromResult(input.result).map((action, index) => {
    const resultRecord = input.result as FrontierSwarmJobResultInput & { taskId?: string };
    const code = stringValue(action.code) ?? `Q-${stableHash([input.result.jobId, index]).replace(/[^a-z0-9]/giu, '').slice(0, 5).toUpperCase()}`;
    const actionId = stringValue(action.id) ?? `human-action:${code}`;
    const status = stringValue(action.status) ?? 'open';
    const evidencePaths = uniqueStrings([
      ...stringArray(action.evidencePaths),
      ...(Array.isArray(input.result.evidencePaths) ? input.result.evidencePaths.map(String) : [])
    ]);
    const changedPaths = Array.isArray(input.result.changedPaths) ? input.result.changedPaths.map(String).filter(Boolean) : [];
    return {
      kind: FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENT_KIND,
      version: FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENT_VERSION,
      id: `human-action-event:${input.plan.runId}:${input.result.jobId}:${stableHash([actionId, status, index])}`,
      eventType: eventTypeForHumanActionStatus(status),
      generatedAt: input.generatedAt,
      runId: input.plan.runId,
      planId: input.plan.id,
      jobId: input.result.jobId,
      ...(stringValue(action.taskId) ?? stringValue(resultRecord.taskId) ?? input.job?.taskId ? { taskId: stringValue(action.taskId) ?? stringValue(resultRecord.taskId) ?? input.job?.taskId } : {}),
      ...(stringValue(action.lane) ?? stringValue(input.job?.lane) ? { lane: stringValue(action.lane) ?? stringValue(input.job?.lane) } : {}),
      actionId,
      code,
      status,
      ...(stringValue(action.priority) ? { priority: stringValue(action.priority) } : {}),
      ...(stringValue(action.title) ? { title: stringValue(action.title) } : {}),
      ...(stringValue(action.question) ? { question: stringValue(action.question) } : {}),
      action,
      evidencePaths,
      changedPaths
    };
  });
}

export async function readCodexHumanActionEvents(file: string): Promise<FrontierCodexHumanActionEvent[]> {
  return (await readJsonl(file)).filter((entry): entry is FrontierCodexHumanActionEvent => {
    return isObject(entry) && entry.kind === FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENT_KIND;
  });
}

export async function readCodexHumanActionBrokerState(file: string): Promise<FrontierCodexHumanActionBrokerState | undefined> {
  if (!await pathExists(file)) return undefined;
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  return isObject(parsed) && parsed.kind === FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_KIND
    ? parsed as unknown as FrontierCodexHumanActionBrokerState
    : undefined;
}

export function summarizeCodexHumanActionBrokerState(
  events: readonly FrontierCodexHumanActionEvent[],
  context: { generatedAt: number; runId?: string; planId?: string; eventPath?: string }
): FrontierCodexHumanActionBrokerState {
  const byAction = new Map<string, FrontierCodexHumanActionEvent>();
  for (const event of events) byAction.set(event.actionId, event);
  const actions = Array.from(byAction.values()).map((event) => ({
    ...event.action,
    id: stringValue(event.action.id) ?? event.actionId,
    code: event.code,
    status: event.status,
    source: stringValue(event.action.source) ?? 'job',
    jobId: event.jobId,
    ...(event.taskId ? { taskId: event.taskId } : {}),
    ...(event.lane ? { lane: event.lane } : {}),
    evidencePaths: event.evidencePaths,
    changedPaths: event.changedPaths,
    brokerEventId: event.id,
    brokerEventType: event.eventType
  }));
  const statusCounts = countBy(actions.map((entry) => stringValue(entry.status) ?? 'open'));
  return {
    kind: FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_KIND,
    version: FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_VERSION,
    id: `human-action-state:${context.runId ?? stableHash(events)}`,
    generatedAt: context.generatedAt,
    ...(context.runId ? { runId: context.runId } : {}),
    ...(context.planId ? { planId: context.planId } : {}),
    ...(context.eventPath ? { eventPath: context.eventPath } : {}),
    actionCount: actions.length,
    openActionCount: actions.filter(humanActionIsOpen).length,
    answeredActionCount: actions.filter((entry) => normalizedStatus(entry.status) === 'answered').length,
    resolvedActionCount: actions.filter((entry) => normalizedStatus(entry.status) === 'resolved').length,
    dismissedActionCount: actions.filter((entry) => ['dismissed', 'cancelled', 'canceled', 'closed'].includes(normalizedStatus(entry.status))).length,
    statusCounts,
    codes: uniqueStrings(actions.map((entry) => stringValue(entry.code) ?? '').filter(Boolean)).sort(),
    actions
  };
}

export function mergeHumanActionsForProjection(...groups: readonly (readonly Record<string, unknown>[] | undefined)[]): Record<string, unknown>[] {
  const out = new Map<string, Record<string, unknown>>();
  for (const group of groups) {
    for (const action of group ?? []) {
      const key = stableActionKey(action);
      if (!out.has(key)) out.set(key, action);
    }
  }
  return Array.from(out.values());
}

function eventTypeForHumanActionStatus(status: string): FrontierCodexHumanActionEvent['eventType'] {
  const normalized = normalizedStatus(status);
  if (normalized === 'answered') return 'human-action.answered';
  if (normalized === 'resolved') return 'human-action.resolved';
  if (['dismissed', 'cancelled', 'canceled', 'closed'].includes(normalized)) return 'human-action.dismissed';
  return 'human-action.opened';
}
