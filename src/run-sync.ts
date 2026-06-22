import fs from 'node:fs/promises';
import path from 'node:path';
import {
  readRunJsonlStoreSummary,
  syncRunJsonlStores,
  type FrontierRunJsonlStoreSyncEvidence
} from '@shapeshift-labs/frontier-run/node';
import type { FrontierRunSyncDirection } from '@shapeshift-labs/frontier-run';
import {
  FRONTIER_SWARM_CODEX_RUN_SYNC_KIND,
  FRONTIER_SWARM_CODEX_RUN_SYNC_VERSION
} from './constants.js';
import { pathExists, uniqueStrings, writeJsonAtomic } from './common.js';
import {
  FRONTIER_SWARM_CODEX_RUN_DASHBOARD_FILE,
  FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE,
  readCodexRunEvents,
  writeCodexRunDashboard
} from './run-events.js';

export const FRONTIER_SWARM_CODEX_RUN_SYNC_EVIDENCE_FILE = 'run-sync-evidence.json';
export const FRONTIER_SWARM_CODEX_RUN_SYNC_HISTORY_FILE = 'run-sync-history.jsonl';

export interface FrontierCodexRunSyncPathOptions {
  cwd?: string;
  outDir: string;
  runSyncEvidencePath?: string | false;
  runSyncHistoryPath?: string | false;
}

export interface FrontierCodexRunSyncOptions {
  cwd?: string;
  run?: string;
  outDir?: string;
  runEventsPath?: string | false;
  runDashboardPath?: string | false;
  peers?: readonly string[];
  direction?: FrontierRunSyncDirection;
  runSyncEvidencePath?: string | false;
  runSyncHistoryPath?: string | false;
  runId?: string;
  generatedAt?: string;
}

export interface FrontierCodexRunSyncSummary {
  peerCount: number;
  exchangeCount: number;
  hasWork: boolean;
  pulledEventCount: number;
  pushedEventCount: number;
  acceptedEventCount: number;
  skippedDuplicateEventCount: number;
  conflictCount: number;
  localEventCountBefore: number;
  localEventCountAfter: number;
  remoteEventCountBefore: number;
  remoteEventCountAfter: number;
  runIds: string[];
  heads: string[];
}

export interface FrontierCodexRunSyncResult {
  kind: typeof FRONTIER_SWARM_CODEX_RUN_SYNC_KIND;
  version: typeof FRONTIER_SWARM_CODEX_RUN_SYNC_VERSION;
  ok: boolean;
  generatedAt: string;
  direction: FrontierRunSyncDirection;
  localRunEventsPath: string;
  peerRunEventsPaths: string[];
  runSyncEvidencePath?: string;
  runSyncHistoryPath?: string;
  runDashboardPath?: string;
  exchanges: FrontierRunJsonlStoreSyncEvidence[];
  summary: FrontierCodexRunSyncSummary;
}

export function resolveCodexRunSyncEvidencePath(input: FrontierCodexRunSyncPathOptions): string | undefined {
  if (input.runSyncEvidencePath === false) return undefined;
  const base = input.cwd ?? process.cwd();
  return path.resolve(base, input.runSyncEvidencePath ?? path.join(input.outDir, FRONTIER_SWARM_CODEX_RUN_SYNC_EVIDENCE_FILE));
}

export function resolveCodexRunSyncHistoryPath(input: FrontierCodexRunSyncPathOptions): string | undefined {
  if (input.runSyncHistoryPath === false) return undefined;
  const base = input.cwd ?? process.cwd();
  return path.resolve(base, input.runSyncHistoryPath ?? path.join(input.outDir, FRONTIER_SWARM_CODEX_RUN_SYNC_HISTORY_FILE));
}

export function normalizeCodexRunSyncDirection(value: string | undefined): FrontierRunSyncDirection | undefined {
  if (!value) return undefined;
  if (value === 'pull' || value === 'push' || value === 'bidirectional') return value;
  throw new Error(`unsupported run sync direction ${value}; expected pull, push, or bidirectional`);
}

export async function syncCodexRunEventPeers(input: FrontierCodexRunSyncOptions): Promise<FrontierCodexRunSyncResult | undefined> {
  const peers = uniqueStrings(input.peers ?? []);
  if (peers.length === 0) return undefined;
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const localRunEventsPath = await resolveCodexRunSyncEventsPath({
    cwd,
    run: input.run,
    outDir: input.outDir,
    runEventsPath: input.runEventsPath
  });
  if (!localRunEventsPath) return undefined;
  const outDir = path.resolve(cwd, input.outDir ?? path.dirname(localRunEventsPath));
  const peerRunEventsPaths: string[] = [];
  for (const peer of peers) {
    const peerRunEventsPath = await resolveCodexRunSyncEventsPath({ cwd, run: peer });
    if (peerRunEventsPath) peerRunEventsPaths.push(peerRunEventsPath);
  }
  if (peerRunEventsPaths.length === 0) return undefined;
  const direction = input.direction ?? 'bidirectional';
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const localBefore = readRunJsonlStoreSummary(localRunEventsPath);
  const exchanges = peerRunEventsPaths.map((peerRunEventsPath) => syncRunJsonlStores(localRunEventsPath, peerRunEventsPath, {
    direction,
    createdAt: generatedAt,
    ensureDir: true,
    atomic: true
  }));
  const localAfter = readRunJsonlStoreSummary(localRunEventsPath);
  const runSyncEvidencePath = resolveCodexRunSyncEvidencePath({
    cwd,
    outDir,
    runSyncEvidencePath: input.runSyncEvidencePath
  });
  const runSyncHistoryPath = resolveCodexRunSyncHistoryPath({
    cwd,
    outDir,
    runSyncHistoryPath: input.runSyncHistoryPath
  });
  const runDashboardPath = await resolveCodexRunSyncDashboardPath({
    cwd,
    run: input.run,
    outDir,
    runDashboardPath: input.runDashboardPath,
    localRunEventsPath
  });
  const result: FrontierCodexRunSyncResult = {
    kind: FRONTIER_SWARM_CODEX_RUN_SYNC_KIND,
    version: FRONTIER_SWARM_CODEX_RUN_SYNC_VERSION,
    ok: exchanges.every((exchange) => exchange.conflicts.length === 0),
    generatedAt,
    direction,
    localRunEventsPath,
    peerRunEventsPaths,
    ...(runSyncEvidencePath ? { runSyncEvidencePath } : {}),
    ...(runSyncHistoryPath ? { runSyncHistoryPath } : {}),
    ...(runDashboardPath ? { runDashboardPath } : {}),
    exchanges,
    summary: summarizeCodexRunSyncExchanges(localBefore, localAfter, exchanges)
  };
  if (runSyncEvidencePath) {
    await fs.mkdir(path.dirname(runSyncEvidencePath), { recursive: true });
    await writeJsonAtomic(runSyncEvidencePath, result);
  }
  if (runSyncHistoryPath) {
    await fs.mkdir(path.dirname(runSyncHistoryPath), { recursive: true });
    await fs.appendFile(runSyncHistoryPath, JSON.stringify(result) + '\n');
  }
  const dashboardRunId = codexRunSyncDashboardRunId(result.summary.runIds, input.runId);
  if (runDashboardPath && dashboardRunId !== false) {
    const runEvents = await readCodexRunEvents(localRunEventsPath);
    await writeCodexRunDashboard(runDashboardPath, runEvents, { runId: dashboardRunId });
  }
  return result;
}

export async function resolveCodexRunSyncEventsPath(input: {
  cwd?: string;
  run?: string;
  outDir?: string;
  runEventsPath?: string | false;
}): Promise<string | undefined> {
  if (input.runEventsPath === false) return undefined;
  const cwd = path.resolve(input.cwd ?? process.cwd());
  if (input.runEventsPath) return path.resolve(cwd, input.runEventsPath);
  if (!input.run && input.outDir) return path.resolve(cwd, input.outDir, FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE);
  if (!input.run) return undefined;
  const absolute = path.resolve(cwd, input.run);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (stat?.isDirectory()) return path.join(absolute, FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE);
  if (path.basename(absolute) === FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE || absolute.endsWith('.jsonl')) return absolute;
  const artifactPath = await readRunEventArtifactPath(absolute);
  if (artifactPath) return path.resolve(path.dirname(absolute), artifactPath);
  return path.join(path.dirname(absolute), FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE);
}

async function resolveCodexRunSyncDashboardPath(input: {
  cwd: string;
  run?: string;
  outDir: string;
  runDashboardPath?: string | false;
  localRunEventsPath: string;
}): Promise<string | undefined> {
  if (input.runDashboardPath === false) return undefined;
  if (input.runDashboardPath) return path.resolve(input.cwd, input.runDashboardPath);
  if (input.run) {
    const absolute = path.resolve(input.cwd, input.run);
    const stat = await fs.lstat(absolute).catch(() => undefined);
    if (stat?.isDirectory()) return path.join(absolute, FRONTIER_SWARM_CODEX_RUN_DASHBOARD_FILE);
    const artifactPath = await readRunDashboardArtifactPath(absolute);
    if (artifactPath) return path.resolve(path.dirname(absolute), artifactPath);
  }
  if (path.basename(input.localRunEventsPath) === FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE) {
    return path.join(path.dirname(input.localRunEventsPath), FRONTIER_SWARM_CODEX_RUN_DASHBOARD_FILE);
  }
  return path.join(input.outDir, FRONTIER_SWARM_CODEX_RUN_DASHBOARD_FILE);
}

function summarizeCodexRunSyncExchanges(
  localBefore: ReturnType<typeof readRunJsonlStoreSummary>,
  localAfter: ReturnType<typeof readRunJsonlStoreSummary>,
  exchanges: readonly FrontierRunJsonlStoreSyncEvidence[]
): FrontierCodexRunSyncSummary {
  const pulledEventCount = exchanges.reduce((sum, exchange) => sum + exchange.local.acceptedEventCount, 0);
  const pushedEventCount = exchanges.reduce((sum, exchange) => sum + exchange.remote.acceptedEventCount, 0);
  const skippedDuplicateEventCount = exchanges.reduce((sum, exchange) => (
    sum + exchange.local.skippedDuplicateEventCount + exchange.remote.skippedDuplicateEventCount
  ), 0);
  const remoteEventCountBefore = exchanges.reduce((sum, exchange) => sum + exchange.remote.eventCountBefore, 0);
  const remoteEventCountAfter = exchanges.reduce((sum, exchange) => sum + exchange.remote.eventCountAfter, 0);
  return {
    peerCount: exchanges.length,
    exchangeCount: exchanges.length,
    hasWork: exchanges.some((exchange) => exchange.plan.hasWork),
    pulledEventCount,
    pushedEventCount,
    acceptedEventCount: pulledEventCount + pushedEventCount,
    skippedDuplicateEventCount,
    conflictCount: exchanges.reduce((sum, exchange) => sum + exchange.conflicts.length, 0),
    localEventCountBefore: localBefore.uniqueEventCount,
    localEventCountAfter: localAfter.uniqueEventCount,
    remoteEventCountBefore,
    remoteEventCountAfter,
    runIds: localAfter.runIds,
    heads: localAfter.heads
  };
}

async function readRunEventArtifactPath(file: string): Promise<string | undefined> {
  if (!await pathExists(file)) return undefined;
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
  return stringPath([
    parsed.runEventsPath,
    pathFromRecord(parsed.metadata, 'runEventsPath'),
    pathFromRecord(parsed.metadata, 'artifactPaths', 'runEvents'),
    pathFromRecord(parsed.metadata, 'runSource', 'runEventsPath')
  ]);
}

async function readRunDashboardArtifactPath(file: string): Promise<string | undefined> {
  if (!await pathExists(file)) return undefined;
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
  return stringPath([
    parsed.runDashboardPath,
    pathFromRecord(parsed.metadata, 'runDashboardPath'),
    pathFromRecord(parsed.metadata, 'artifactPaths', 'runDashboard'),
    pathFromRecord(parsed.metadata, 'runSource', 'runDashboardPath')
  ]);
}

function pathFromRecord(value: unknown, first: string, second?: string): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (!second) return record[first];
  const nested = record[first];
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return undefined;
  return (nested as Record<string, unknown>)[second];
}

function stringPath(values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function codexRunSyncDashboardRunId(runIds: readonly string[], requestedRunId: string | undefined): string | false | undefined {
  if (requestedRunId && runIds.every((runId) => runId === requestedRunId)) return requestedRunId;
  if (requestedRunId && runIds.length === 0) return requestedRunId;
  if (!requestedRunId && runIds.length === 1) return runIds[0];
  if (!requestedRunId && runIds.length === 0) return undefined;
  return false;
}
