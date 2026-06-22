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
import {
  createRunEventsFromMergeBundle,
  createRunEventsFromSwarmPlan,
  createRunEventsFromSwarmResult,
  createRunEventsFromSwarmRun,
  type FrontierSwarmJob,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmPlan,
  type FrontierSwarmRun
} from '@shapeshift-labs/frontier-swarm';
import { findFilesByName, pathExists, writeJsonAtomic } from './common.js';
import { resolveRunDirectory } from './collect-pids.js';
import type { FrontierCodexDashboardArtifactPaths, FrontierCodexDashboardRunSourceMetadata } from './types-dashboard.js';
import type { FrontierCodexSwarmRunResult } from './types-run.js';

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

export interface FrontierCodexLegacyRunEventImportOptions {
  run: string;
  cwd?: string;
  outFile?: string;
  dashboardOutFile?: string | false;
}

export interface FrontierCodexLegacyRunEventImportResult {
  ok: boolean;
  runDir: string;
  runEventsPath: string;
  runDashboardPath?: string;
  eventCount: number;
  dashboard?: FrontierRunDashboardSnapshot;
  sources: {
    plan?: string;
    results?: string;
    mergeBundles: string[];
  };
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

export async function importCodexLegacyRunEvents(
  options: FrontierCodexLegacyRunEventImportOptions
): Promise<FrontierCodexLegacyRunEventImportResult> {
  const runDir = await resolveRunDirectory(path.resolve(options.cwd ?? process.cwd(), options.run));
  const planPath = path.join(runDir, 'swarm-plan.json');
  const resultsPath = path.join(runDir, 'swarm-results.json');
  const plan = await readJsonIfExists<FrontierSwarmPlan>(planPath);
  const results = await readJsonIfExists<Partial<FrontierCodexSwarmRunResult>>(resultsPath);
  const run = results?.run as FrontierSwarmRun | undefined;
  const runId = run?.id ?? plan?.runId ?? 'frontier-swarm-codex';
  const events: FrontierRunEvent[] = [];

  const planEvents = plan ? createRunEventsFromSwarmPlan(plan, {
    runId,
    actorId: 'frontier-swarm-codex-import',
    startActorSeq: 1
  }) : [];
  events.push(...planEvents);
  const createdEventId = planEvents.find((event) => event.type === 'run.created')?.id;

  if (run && !plan) {
    events.push(...createRunEventsFromSwarmRun(run, {
      runId,
      actorId: 'frontier-swarm-codex-import',
      startActorSeq: 1
    }));
  } else if (run) {
    for (let index = 0; index < run.results.length; index += 1) {
      const result = run.results[index];
      events.push(...createRunEventsFromSwarmResult(result, {
        runId,
        actorId: 'frontier-swarm-codex-import-worker',
        startActorSeq: 1000 + index * 100,
        parents: createdEventId ? [createdEventId] : undefined,
        job: findSwarmJob(plan, run, result.jobId)
      }));
    }
  }

  const mergeBundlePaths = await findFilesByName(runDir, 'merge.json');
  for (let index = 0; index < mergeBundlePaths.length; index += 1) {
    const bundle = await readJsonIfExists<FrontierSwarmMergeBundle>(mergeBundlePaths[index]);
    if (!bundle || bundle.kind !== 'frontier.swarm.merge-bundle') continue;
    events.push(...createRunEventsFromMergeBundle(bundle, {
      runId,
      actorId: 'frontier-swarm-codex-import-collector',
      startActorSeq: 100000 + index * 100,
      parents: createdEventId ? [createdEventId] : undefined
    }));
  }

  const merged = mergeRunEventLogs(events);
  const runEventsPath = path.resolve(options.cwd ?? process.cwd(), options.outFile ?? path.join(runDir, FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE));
  const runDashboardPath = options.dashboardOutFile === false
    ? undefined
    : path.resolve(options.cwd ?? process.cwd(), options.dashboardOutFile ?? path.join(runDir, FRONTIER_SWARM_CODEX_RUN_DASHBOARD_FILE));
  await writeCodexRunEvents(runEventsPath, merged);
  const dashboard = await writeCodexRunDashboard(runDashboardPath, merged, { runId });

  return {
    ok: merged.length > 0,
    runDir,
    runEventsPath,
    ...(runDashboardPath ? { runDashboardPath } : {}),
    eventCount: merged.length,
    ...(dashboard ? { dashboard } : {}),
    sources: {
      ...(await pathExists(planPath) ? { plan: planPath } : {}),
      ...(await pathExists(resultsPath) ? { results: resultsPath } : {}),
      mergeBundles: mergeBundlePaths
    }
  };
}

function findSwarmJob(plan: FrontierSwarmPlan | undefined, run: FrontierSwarmRun, jobId: string): FrontierSwarmJob | undefined {
  return plan?.jobs.find((job) => job.id === jobId) ?? run.jobs.find((job) => job.id === jobId);
}

async function readJsonIfExists<T>(file: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
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
