import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { isObject, pathExists, stableHash, uniqueStrings } from './common.js';

const HUMAN_ACTION_FILES = ['human-question.json', 'human-questions.json'];

export interface FrontierCodexHumanActionReadResult {
  paths: string[];
  actions: Record<string, unknown>[];
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

function humanActionRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isObject);
  if (isObject(value) && Array.isArray(value.actions)) return value.actions.filter(isObject);
  return isObject(value) ? [value] : [];
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
  return {
    kind: 'human-question',
    type: 'question',
    status: stringValue(record.status) ?? 'open',
    priority: stringValue(record.priority) ?? 'blocking',
    source: 'job',
    ...record,
    id: stringValue(record.id) ?? `human-action:${code}`,
    code,
    title,
    question: stringValue(record.question) ?? title,
    detail: stringValue(record.detail) ?? stringValue(record.context) ?? stringValue(record.question) ?? title,
    requestedAnswer: stringValue(record.requestedAnswer) ?? stringValue(record.answerFormat) ?? 'Answer with the code and your decision.',
    askedBy: stringValue(record.askedBy) ?? context.jobId,
    jobId: stringValue(record.jobId) ?? context.jobId,
    ...(stringValue(record.taskId) ?? context.taskId ? { taskId: stringValue(record.taskId) ?? context.taskId } : {}),
    ...(stringValue(record.lane) ?? context.lane ? { lane: stringValue(record.lane) ?? context.lane } : {}),
    evidencePaths
  };
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
