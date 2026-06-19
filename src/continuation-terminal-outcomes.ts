import {
  createSwarmBacklog,
  type FrontierSwarmBacklog,
  type FrontierSwarmBacklogEntry,
  type FrontierSwarmQueueOutcomeDecision,
  type FrontierSwarmQueueOutcomeModel,
  type FrontierSwarmTaskInput
} from '@shapeshift-labs/frontier-swarm';
import { uniqueStrings } from './common.js';
import { humanActionSubjectAliases } from './human-actions.js';
import type { FrontierCodexCollectResult } from './types-collection.js';

export interface ContinuationTerminalOutcomeProjection {
  backlog: FrontierSwarmBacklog;
  tasks: FrontierSwarmTaskInput[];
  summary: {
    closedEntryCount: number;
    closedTaskCount: number;
    rerunEntryCount: number;
    rerunTaskCount: number;
    reviewEntryCount: number;
    reviewTaskCount: number;
    blockedEntryCount: number;
    blockedTaskCount: number;
    answeredHumanBlockerEntryCount: number;
    answeredHumanBlockerTaskCount: number;
    decisionCount: number;
  };
}

export function projectContinuationTerminalOutcomes(input: {
  backlog: FrontierSwarmBacklog;
  tasks: readonly FrontierSwarmTaskInput[];
  collection?: FrontierCodexCollectResult;
  answeredHumanActions?: readonly Record<string, unknown>[];
  generatedAt: number;
}): ContinuationTerminalOutcomeProjection {
  const model = input.collection?.queueOutcomeModel;
  if (!model) {
    return {
      backlog: input.backlog,
      tasks: [...input.tasks],
      summary: emptyTerminalOutcomeProjectionSummary()
    };
  }
  const decisionsByAlias = latestDecisionsByAlias(model);
  const answeredActionsByAlias = answeredHumanActionsByAlias(input.answeredHumanActions ?? []);
  const entries = input.backlog.entries.map((entry) => projectBacklogEntry(entry, decisionsByAlias, input.generatedAt, answeredActionsByAlias));
  const projectedTasks = input.tasks.map((task) => projectTaskInput(task, decisionsByAlias, input.generatedAt, answeredActionsByAlias));
  const tasks = projectedTasks.filter((task) => !taskClosedByTerminalProjection(task));
  const summary = summarizeProjection(input.backlog.entries, entries, input.tasks, projectedTasks, model);
  return {
    backlog: createSwarmBacklog({
      ...input.backlog,
      entries,
      metadata: {
        ...(input.backlog.metadata ?? {}),
        terminalOutcomeProjection: {
          generatedAt: input.generatedAt,
          sourceCollectionDir: input.collection?.outDir,
          ...summary
        }
      }
    }),
    tasks,
    summary
  };
}

function latestDecisionsByAlias(model: FrontierSwarmQueueOutcomeModel): Map<string, FrontierSwarmQueueOutcomeDecision> {
  const byId = new Map(model.decisions.map((decision) => [decision.id, decision]));
  const out = new Map<string, FrontierSwarmQueueOutcomeDecision>();
  for (const [alias, decisionId] of Object.entries(model.latestDecisionIdByAlias)) {
    const decision = byId.get(decisionId);
    if (decision) out.set(alias, decision);
  }
  return out;
}

function projectBacklogEntry(
  entry: FrontierSwarmBacklogEntry,
  decisionsByAlias: ReadonlyMap<string, FrontierSwarmQueueOutcomeDecision>,
  generatedAt: number,
  answeredActionsByAlias: ReadonlyMap<string, Record<string, unknown>>
): FrontierSwarmBacklogEntry {
  const aliases = entryAliases(entry);
  const decision = decisionForAliases(aliases, decisionsByAlias);
  if (!decision) return entry;
  const answeredAction = answeredHumanActionForAliases(aliases, answeredActionsByAlias);
  const projection = projectionForDecision(decision, aliases, answeredActionsByAlias);
  return {
    ...entry,
    status: projection.status,
    tags: uniqueStrings([...entry.tags, ...projection.tags]),
    metadata: {
      ...(entry.metadata ?? {}),
      terminalOutcome: terminalOutcomeMetadata(decision, generatedAt, answeredAction)
    } as FrontierSwarmBacklogEntry['metadata']
  };
}

function projectTaskInput(
  task: FrontierSwarmTaskInput,
  decisionsByAlias: ReadonlyMap<string, FrontierSwarmQueueOutcomeDecision>,
  generatedAt: number,
  answeredActionsByAlias: ReadonlyMap<string, Record<string, unknown>>
): FrontierSwarmTaskInput {
  const aliases = taskAliases(task);
  const decision = decisionForAliases(aliases, decisionsByAlias);
  if (!decision) return task;
  const answeredAction = answeredHumanActionForAliases(aliases, answeredActionsByAlias);
  const projection = projectionForDecision(decision, aliases, answeredActionsByAlias);
  return {
    ...task,
    status: projection.status,
    tags: uniqueStrings([...(task.tags ?? []), ...projection.tags]),
    metadata: {
      ...metadataObject(task.metadata),
      terminalOutcome: terminalOutcomeMetadata(decision, generatedAt, answeredAction)
    }
  };
}

function taskClosedByTerminalProjection(task: FrontierSwarmTaskInput): boolean {
  if (!metadataObject(task.metadata).terminalOutcome) return false;
  return task.status !== 'ready' && task.status !== 'open';
}

function decisionForAliases(
  aliases: readonly string[],
  decisionsByAlias: ReadonlyMap<string, FrontierSwarmQueueOutcomeDecision>
): FrontierSwarmQueueOutcomeDecision | undefined {
  let latest: FrontierSwarmQueueOutcomeDecision | undefined;
  for (const alias of aliases) {
    const decision = decisionsByAlias.get(alias);
    if (!decision) continue;
    if (!latest || decision.generatedAt > latest.generatedAt || decision.generatedAt === latest.generatedAt && decision.id > latest.id) latest = decision;
  }
  return latest;
}

function projectionForDecision(
  decision: FrontierSwarmQueueOutcomeDecision,
  aliases: readonly string[],
  answeredActionsByAlias: ReadonlyMap<string, Record<string, unknown>>
): { status: string; tags: string[] } {
  if (decision.outcome === 'rerun') return { status: 'ready', tags: ['terminal:rerun'] };
  if (decision.outcome === 'needs-port' || decision.coordinatorReview) return { status: 'coordinator-review', tags: ['terminal:coordinator-review'] };
  if (decision.outcome === 'human-question' || decision.humanBlocked) {
    return aliases.some((alias) => answeredActionsByAlias.has(alias))
      ? { status: 'ready', tags: ['terminal:human-question', 'human-answer:answered'] }
      : { status: 'blocked', tags: ['terminal:human-question'] };
  }
  if (decision.outcome === 'conflict-blocked' || decision.conflict) return { status: 'blocked', tags: ['terminal:conflict'] };
  if (decision.outcome === 'rejected') return { status: 'rejected', tags: ['terminal:rejected'] };
  if (decision.outcome === 'ready') return { status: 'ready', tags: ['terminal:ready'] };
  return { status: decision.outcome === 'checked' ? 'verified' : 'completed', tags: [`terminal:${decision.outcome}`] };
}

function terminalOutcomeMetadata(decision: FrontierSwarmQueueOutcomeDecision, generatedAt: number, answeredAction?: Record<string, unknown>): Record<string, unknown> {
  return {
    generatedAt,
    decisionId: decision.id,
    category: decision.category,
    outcome: decision.outcome,
    terminal: decision.terminal,
    closesSubject: decision.closesSubject,
    reasons: decision.reasons,
    ...(answeredAction ? { humanAnswer: humanAnswerMetadata(answeredAction) } : {})
  };
}

function summarizeProjection(
  beforeEntries: readonly FrontierSwarmBacklogEntry[],
  afterEntries: readonly FrontierSwarmBacklogEntry[],
  beforeTasks: readonly FrontierSwarmTaskInput[],
  afterTasks: readonly FrontierSwarmTaskInput[],
  model: FrontierSwarmQueueOutcomeModel
): ContinuationTerminalOutcomeProjection['summary'] {
  return {
    closedEntryCount: countChangedTo(beforeEntries, afterEntries, (status) => status === 'completed' || status === 'verified' || status === 'rejected'),
    closedTaskCount: countChangedTo(beforeTasks, afterTasks, (status) => status === 'completed' || status === 'verified' || status === 'rejected'),
    rerunEntryCount: countChangedTo(beforeEntries, afterEntries, (status, tags) => status === 'ready' && tags.includes('terminal:rerun')),
    rerunTaskCount: countChangedTo(beforeTasks, afterTasks, (status, tags) => status === 'ready' && tags.includes('terminal:rerun')),
    reviewEntryCount: countChangedTo(beforeEntries, afterEntries, (status) => status === 'coordinator-review'),
    reviewTaskCount: countChangedTo(beforeTasks, afterTasks, (status) => status === 'coordinator-review'),
    blockedEntryCount: countChangedTo(beforeEntries, afterEntries, (status) => status === 'blocked'),
    blockedTaskCount: countChangedTo(beforeTasks, afterTasks, (status) => status === 'blocked'),
    answeredHumanBlockerEntryCount: countMatching(afterEntries, (status, tags) => status === 'ready' && tags.includes('human-answer:answered')),
    answeredHumanBlockerTaskCount: countMatching(afterTasks, (status, tags) => status === 'ready' && tags.includes('human-answer:answered')),
    decisionCount: model.summary.latestDecisionCount
  };
}

function answeredHumanActionsByAlias(actions: readonly Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const action of actions) {
    for (const alias of humanActionSubjectAliases(action)) out.set(alias, action);
  }
  return out;
}

function answeredHumanActionForAliases(
  aliases: readonly string[],
  answeredActionsByAlias: ReadonlyMap<string, Record<string, unknown>>
): Record<string, unknown> | undefined {
  for (const alias of aliases) {
    const action = answeredActionsByAlias.get(alias);
    if (action) return action;
  }
  return undefined;
}

function countChangedTo<T extends { status?: string; tags?: readonly string[] }>(
  before: readonly T[],
  after: readonly T[],
  predicate: (status: string | undefined, tags: readonly string[]) => boolean
): number {
  let count = 0;
  for (let index = 0; index < after.length; index += 1) {
    if (before[index]?.status === after[index]?.status) continue;
    if (predicate(after[index]?.status, after[index]?.tags ?? [])) count += 1;
  }
  return count;
}

function countMatching<T extends { status?: string; tags?: readonly string[] }>(
  items: readonly T[],
  predicate: (status: string | undefined, tags: readonly string[]) => boolean
): number {
  return items.filter((item) => predicate(item.status, item.tags ?? [])).length;
}

function entryAliases(entry: FrontierSwarmBacklogEntry): string[] {
  return uniqueStrings([entry.id, `queue:${entry.id}`, entry.taskId, entry.taskId ? `task:${entry.taskId}` : undefined].filter(isString));
}

function taskAliases(task: FrontierSwarmTaskInput): string[] {
  return uniqueStrings([task.id, `task:${task.id}`, `queue:${task.id}`]);
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function humanAnswerMetadata(action: Record<string, unknown>): Record<string, unknown> {
  const answer = metadataObject(action.humanAnswer);
  return {
    ...(stringValue(action.code) ? { code: stringValue(action.code) } : {}),
    ...(stringValue(action.title) ? { title: stringValue(action.title) } : {}),
    ...(stringValue(action.question) ? { question: stringValue(action.question) } : {}),
    ...(stringValue(action.requestedAnswer) ? { requestedAnswer: stringValue(action.requestedAnswer) } : {}),
    ...(stringValue(action.answer) ? { answer: stringValue(action.answer) } : {}),
    ...(typeof action.answeredAt === 'number' ? { answeredAt: action.answeredAt } : {}),
    ...(stringValue(answer.id) ? { answerId: stringValue(answer.id) } : {}),
    ...(stringValue(action.jobId) ? { jobId: stringValue(action.jobId) } : {}),
    ...(stringValue(action.taskId) ? { taskId: stringValue(action.taskId) } : {}),
    ...(stringValue(action.lane) ? { lane: stringValue(action.lane) } : {})
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function emptyTerminalOutcomeProjectionSummary(): ContinuationTerminalOutcomeProjection['summary'] {
  return {
    closedEntryCount: 0,
    closedTaskCount: 0,
    rerunEntryCount: 0,
    rerunTaskCount: 0,
    reviewEntryCount: 0,
    reviewTaskCount: 0,
    blockedEntryCount: 0,
    blockedTaskCount: 0,
    answeredHumanBlockerEntryCount: 0,
    answeredHumanBlockerTaskCount: 0,
    decisionCount: 0
  };
}
