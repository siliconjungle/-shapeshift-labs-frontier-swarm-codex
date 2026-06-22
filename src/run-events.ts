import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createRunDashboardSnapshot,
  mergeRunEventLogs,
  parseRunEventsJsonl,
  replayRunEvents,
  serializeRunEventJsonl,
  type FrontierRunDashboardSnapshot,
  type FrontierRunEvent,
  type FrontierRunProjection,
  type FrontierRunReplayOptions
} from '@shapeshift-labs/frontier-run';
import { writeJsonAtomic } from './common.js';
import type { FrontierCodexDashboardArtifactPaths, FrontierCodexDashboardRunSourceMetadata } from './types-dashboard.js';

export const FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE = 'run-events.jsonl';
export const FRONTIER_SWARM_CODEX_RUN_DASHBOARD_FILE = 'run-dashboard.json';

const runEventsWriteQueues = new Map<string, Promise<void>>();

export interface FrontierCodexRunEventPathOptions {
  cwd?: string;
  outDir: string;
  runEventsPath?: string | false;
}

export interface FrontierCodexRunDashboardPathOptions extends FrontierCodexRunEventPathOptions {
  runDashboardPath?: string | false;
}

export interface FrontierCodexRunDashboardWriteOptions {
  runId?: string;
  goal?: string;
  metadata?: FrontierRunReplayOptions['metadata'];
  generatedAt?: string;
}

export function resolveCodexRunEventsPath(input: FrontierCodexRunEventPathOptions): string | undefined {
  if (input.runEventsPath === false) return undefined;
  const base = input.cwd ?? process.cwd();
  return path.resolve(base, input.runEventsPath ?? path.join(input.outDir, FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE));
}

export function resolveCodexRunDashboardPath(input: FrontierCodexRunDashboardPathOptions): string | undefined {
  if (input.runEventsPath === false || input.runDashboardPath === false) return undefined;
  const base = input.cwd ?? process.cwd();
  return path.resolve(base, input.runDashboardPath ?? path.join(input.outDir, FRONTIER_SWARM_CODEX_RUN_DASHBOARD_FILE));
}

export async function initCodexRunEvents(file: string | undefined): Promise<void> {
  if (!file) return;
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await writeTextFileAtomic(absolute, '');
}

export async function readCodexRunEvents(file: string): Promise<FrontierRunEvent[]> {
  const text = await fs.readFile(file, 'utf8').catch((error: unknown) => {
    if (isNodeError(error) && error.code === 'ENOENT') return '';
    throw error;
  });
  return parseRunEventsJsonl(text);
}

export async function writeCodexRunEvents(file: string | undefined, events: readonly FrontierRunEvent[]): Promise<void> {
  if (!file) return;
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await writeTextFileAtomic(absolute, mergeRunEventLogs(events).map((event) => serializeRunEventJsonl(event)).join(''));
}

export async function appendCodexRunEvents(
  file: string | undefined,
  events: readonly FrontierRunEvent[]
): Promise<void> {
  if (!file || events.length === 0) return;
  const absolute = path.resolve(file);
  const previous = runEventsWriteQueues.get(absolute) ?? Promise.resolve();
  let next: Promise<void>;
  next = previous
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.appendFile(absolute, events.map((event) => serializeRunEventJsonl(event)).join(''));
    })
    .finally(() => {
      if (runEventsWriteQueues.get(absolute) === next) runEventsWriteQueues.delete(absolute);
    });
  runEventsWriteQueues.set(absolute, next);
  return next;
}

export function createCodexRunProjection(
  events: readonly FrontierRunEvent[],
  options: FrontierCodexRunDashboardWriteOptions = {}
): FrontierRunProjection {
  return replayRunEvents(mergeRunEventLogs(events), {
    id: options.runId,
    goal: options.goal,
    metadata: options.metadata
  });
}

export async function writeCodexRunDashboard(
  file: string | undefined,
  events: readonly FrontierRunEvent[],
  options: FrontierCodexRunDashboardWriteOptions = {}
): Promise<FrontierRunDashboardSnapshot | undefined> {
  if (!file) return undefined;
  const absolute = path.resolve(file);
  const dashboard = createRunDashboardSnapshot(createCodexRunProjection(events, options), {
    generatedAt: options.generatedAt
  });
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await writeJsonAtomic(absolute, dashboard);
  return dashboard;
}

export function createCodexRunEventsDashboardMetadata(input: {
  runEventsPath?: string;
  runDashboardPath?: string;
}): {
  artifactPaths: FrontierCodexDashboardArtifactPaths;
  runSource: FrontierCodexDashboardRunSourceMetadata;
} {
  if (!input.runEventsPath) {
    return {
      artifactPaths: {},
      runSource: { mode: 'disabled' }
    };
  }
  return {
    artifactPaths: {
      runEvents: input.runEventsPath,
      ...(input.runDashboardPath ? { runDashboard: input.runDashboardPath } : {})
    },
    runSource: {
      mode: 'frontier-run-events',
      format: 'jsonl',
      runEventsPath: input.runEventsPath,
      ...(input.runDashboardPath ? { runDashboardPath: input.runDashboardPath } : {})
    }
  };
}

async function writeTextFileAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.writeFile(tmp, text);
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
