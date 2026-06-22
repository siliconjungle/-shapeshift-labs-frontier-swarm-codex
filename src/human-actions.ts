import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { isObject, pathExists, stableHash, uniqueStrings } from './common.js';

const HUMAN_ACTION_FILES = ['human-question.json', 'human-questions.json'];
const HUMAN_ANSWER_FILES = ['human-action-answers.jsonl', 'human-action-answers.json', 'human-answers.jsonl', 'human-answers.json'];

export interface FrontierCodexHumanActionReadResult {
  paths: string[];
  actions: Record<string, unknown>[];
}

export interface FrontierCodexHumanActionAnswerReadResult {
  paths: string[];
  answers: Record<string, unknown>[];
}

export interface FrontierCodexResolvedHumanActions {
  actions: Record<string, unknown>[];
  answers: Record<string, unknown>[];
  answeredActions: Record<string, unknown>[];
  openActions: Record<string, unknown>[];
  unansweredActions: Record<string, unknown>[];
  summary: {
    actionCount: number;
    answerCount: number;
    answeredActionCount: number;
    openActionCount: number;
    unresolvedAnswerCount: number;
  };
}

export async function readCodexHumanActionArtifacts(input: {
  evidenceDir: string;
  jobId: string;
  taskId?: string;
  lane?: string;
}): Promise<FrontierCodexHumanActionReadResult> {
  const actions: Record<string, unknown>[] = [];
  const paths: string[] = [];
  for (const name of HUMAN_ACTION_FILES) {
    const file = path.join(input.evidenceDir, name);
    if (!await pathExists(file)) continue;
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    const records = humanActionRecords(parsed);
    paths.push(file);
    actions.push(...records.map((record, index) => normalizeHumanActionRecord(record, {
      ...input,
      file,
      index
    })));
  }
  return { paths: uniqueStrings(paths), actions };
}

export async function readCodexHumanActionAnswerArtifacts(input: {
  cwd: string;
  generatedAt: number;
  answers?: unknown;
  answerPath?: string;
  answerPaths?: readonly string[];
  roots?: readonly (string | undefined)[];
}): Promise<FrontierCodexHumanActionAnswerReadResult> {
  const answers: Record<string, unknown>[] = [];
  const paths: string[] = [];
  const candidates = uniqueStrings([
    ...(input.roots ?? []).flatMap((root) => root ? HUMAN_ANSWER_FILES.map((name) => path.join(root, name)) : []),
    ...(input.answerPaths ?? []),
    input.answerPath
  ].filter((entry): entry is string => !!entry));
  for (const candidate of candidates) {
    const file = path.resolve(input.cwd, candidate);
    if (!await pathExists(file)) continue;
    const parsed = await readHumanAnswerFile(file);
    paths.push(file);
    answers.push(...normalizeHumanActionAnswers(parsed, { generatedAt: input.generatedAt, file }));
  }
  answers.push(...normalizeHumanActionAnswers(input.answers, { generatedAt: input.generatedAt }));
  return { paths: uniqueStrings(paths), answers };
}

export function humanActionsFromMergeBundles(bundles: readonly FrontierSwarmMergeBundle[]): Record<string, unknown>[] {
  return bundles.flatMap((bundle) => {
    const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
    return humanActionRecords(metadata.humanActions).map((record, index) => normalizeHumanActionRecord(record, {
      jobId: bundle.jobId,
      taskId: bundle.taskId,
      lane: bundle.lane,
      file: String(record.evidencePath ?? bundle.evidencePaths.find((entry) => path.basename(entry).startsWith('human-question')) ?? ''),
      index,
      evidencePaths: bundle.evidencePaths
    }));
  });
}

export function humanActionsFromDashboard(value: unknown): Record<string, unknown>[] {
  const dashboard = isObject(value) ? value : {};
  const metadata = isObject(dashboard.metadata) ? dashboard.metadata : {};
  return [
    ...humanActionRecords(dashboard.humanActions),
    ...humanActionRecords(metadata.humanActions)
  ];
}

export function resolveCodexHumanActions(input: {
  actions: unknown;
  answers: unknown;
  generatedAt: number;
}): FrontierCodexResolvedHumanActions {
  const actions = humanActionRecords(input.actions);
  const answers = normalizeHumanActionAnswers(input.answers, { generatedAt: input.generatedAt });
  const answerKeys = new Map<string, Record<string, unknown>>();
  for (const answer of answers) {
    for (const key of humanActionRecordKeys(answer)) answerKeys.set(key, answer);
  }
  const usedAnswerIds = new Set<string>();
  const resolved = actions.map((action) => {
    const answer = firstMatchingAnswer(action, answerKeys);
    if (!answer) return action;
    const answerId = stringValue(answer.id) ?? stringValue(answer.code) ?? stableHash(answer);
    usedAnswerIds.add(answerId);
    return {
      ...action,
      status: stringValue(answer.status) ?? 'answered',
      answer: stringValue(answer.answer) ?? stringValue(answer.text) ?? stringValue(answer.value) ?? '',
      answeredAt: timestampValue(answer.answeredAt) ?? input.generatedAt,
      resolution: stringValue(answer.resolution) ?? stringValue(answer.answer) ?? stringValue(answer.text) ?? stringValue(answer.value) ?? 'answered',
      humanAnswer: answer
    };
  });
  const answeredActions = resolved.filter((action) => isObject(action.humanAnswer));
  const openActions = resolved.filter((action) => humanActionIsOpen(action));
  return {
    actions: resolved,
    answers,
    answeredActions,
    openActions,
    unansweredActions: openActions,
    summary: {
      actionCount: resolved.length,
      answerCount: answers.length,
      answeredActionCount: answeredActions.length,
      openActionCount: openActions.length,
      unresolvedAnswerCount: answers.filter((answer) => !usedAnswerIds.has(stringValue(answer.id) ?? stringValue(answer.code) ?? stableHash(answer))).length
    }
  };
}

export function humanActionSubjectAliases(action: Record<string, unknown>): string[] {
  const taskId = stringValue(action.taskId);
  const jobId = stringValue(action.jobId);
  return uniqueStrings([
    taskId,
    taskId ? `task:${taskId}` : undefined,
    taskId ? `queue:${taskId}` : undefined,
    jobId,
    jobId ? `job:${jobId}` : undefined
  ].filter((entry): entry is string => !!entry));
}

async function readHumanAnswerFile(file: string): Promise<unknown> {
  const text = await fs.readFile(file, 'utf8');
  if (file.endsWith('.jsonl')) {
    return text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as unknown);
  }
  return JSON.parse(text) as unknown;
}

function humanActionRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isObject);
  if (isObject(value) && Array.isArray(value.actions)) return value.actions.filter(isObject);
  return isObject(value) ? [value] : [];
}

function normalizeHumanActionAnswers(value: unknown, context: { generatedAt: number; file?: string }): Record<string, unknown>[] {
  return humanActionRecords(value).map((record, index) => {
    const code = stringValue(record.code) ?? stringValue(record.actionCode);
    const actionId = stringValue(record.actionId) ?? stringValue(record.humanActionId);
    const id = stringValue(record.id) ?? (code ? `human-answer:${code}` : actionId ? `human-answer:${actionId}` : `human-answer:${stableHash([record, index])}`);
    return {
      kind: 'human-answer',
      source: 'human',
      status: stringValue(record.status) ?? 'answered',
      ...record,
      id,
      ...(code ? { code } : {}),
      ...(actionId ? { actionId } : {}),
      answeredAt: timestampValue(record.answeredAt) ?? context.generatedAt,
      ...(context.file ? { evidencePath: context.file } : {})
    };
  });
}

function normalizeHumanActionRecord(
  record: Record<string, unknown>,
  context: { jobId: string; taskId?: string; lane?: string; file: string; index: number; evidencePaths?: readonly string[] }
): Record<string, unknown> {
  const title = stringValue(record.title) ?? stringValue(record.question) ?? 'Human decision needed';
  const code = stringValue(record.code) ?? shortQuestionCode(context.jobId, title, context.index);
  const evidencePaths = uniqueStrings([
    context.file,
    ...stringArray(record.evidencePaths),
    ...(context.evidencePaths ?? [])
  ]);
  const question = stringValue(record.question) ?? stringValue(record.prompt);
  const requestedAnswer = stringValue(record.requestedAnswer) ?? stringValue(record.answerFormat);
  const safeToProceedWithoutAnswer = booleanValue(record.safeToProceedWithoutAnswer);
  const invalidReason = humanQuestionInvalidReason(record, question, safeToProceedWithoutAnswer);
  return {
    kind: 'human-question',
    type: 'question',
    source: 'job',
    ...record,
    id: stringValue(record.id) ?? `human-action:${code}`,
    code,
    status: invalidReason ? 'dismissed' : stringValue(record.status) ?? 'open',
    priority: invalidReason ? 'info' : stringValue(record.priority) ?? 'blocking',
    title,
    question: question ?? title,
    detail: stringValue(record.detail) ?? stringValue(record.context) ?? question ?? title,
    requestedAnswer: requestedAnswer ?? 'Answer with the code and your decision.',
    askedBy: stringValue(record.askedBy) ?? context.jobId,
    jobId: stringValue(record.jobId) ?? context.jobId,
    ...(stringValue(record.taskId) ?? context.taskId ? { taskId: stringValue(record.taskId) ?? context.taskId } : {}),
    ...(stringValue(record.lane) ?? context.lane ? { lane: stringValue(record.lane) ?? context.lane } : {}),
    ...(stringValue(record.blockingReason) ? { blockingReason: stringValue(record.blockingReason) } : {}),
    ...(stringArray(record.attemptedSelfResolution).length ? { attemptedSelfResolution: stringArray(record.attemptedSelfResolution) } : {}),
    ...(safeToProceedWithoutAnswer !== undefined ? { safeToProceedWithoutAnswer } : {}),
    ...(invalidReason ? { humanQuestionValid: false, humanQuestionInvalidReason: invalidReason } : { humanQuestionValid: true }),
    evidencePaths
  };
}

function humanQuestionInvalidReason(
  record: Record<string, unknown>,
  question: string | undefined,
  safeToProceedWithoutAnswer: boolean | undefined
): string | undefined {
  const status = stringValue(record.status)?.toLowerCase();
  if (status && ['answered', 'resolved', 'dismissed', 'cancelled', 'canceled', 'closed'].includes(status)) return undefined;
  if (safeToProceedWithoutAnswer === true) return 'safe-to-proceed-without-answer';
  if (!question) return 'missing-question';
  return undefined;
}

function shortQuestionCode(jobId: string, title: string, index: number): string {
  const suffix = stableHash([jobId, title, index]).replace(/[^a-z0-9]/giu, '').slice(0, 5).toUpperCase();
  return `Q-${suffix || 'ASK'}`;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return true;
    if (['false', 'no', '0'].includes(normalized)) return false;
  }
  return undefined;
}

function firstMatchingAnswer(action: Record<string, unknown>, answers: ReadonlyMap<string, Record<string, unknown>>): Record<string, unknown> | undefined {
  for (const key of humanActionRecordKeys(action)) {
    const answer = answers.get(key);
    if (answer) return answer;
  }
  return undefined;
}

function humanActionRecordKeys(record: Record<string, unknown>): string[] {
  const code = stringValue(record.code) ?? stringValue(record.actionCode);
  const id = stringValue(record.id);
  const actionId = stringValue(record.actionId) ?? stringValue(record.humanActionId);
  return uniqueStrings([
    code ? `code:${code}` : undefined,
    id ? `id:${id}` : undefined,
    actionId ? `id:${actionId}` : undefined,
    actionId ? `action:${actionId}` : undefined
  ].filter((entry): entry is string => !!entry));
}

function humanActionIsOpen(action: Record<string, unknown>): boolean {
  const status = stringValue(action.status)?.toLowerCase();
  if (status === 'answered' || status === 'resolved' || status === 'dismissed' || status === 'cancelled' || status === 'closed') return false;
  if (stringValue(action.answer) || stringValue(action.resolution) || timestampValue(action.answeredAt) || timestampValue(action.resolvedAt)) return false;
  return true;
}

function timestampValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
