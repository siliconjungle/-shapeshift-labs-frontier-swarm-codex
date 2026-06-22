import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createSwarmCoordinatorDashboard,
  routeSwarmEventToMailboxes,
  type FrontierSwarmEventInput,
  type FrontierSwarmEventStream
} from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_PID_MANIFEST_KIND,
  FRONTIER_SWARM_CODEX_PID_MANIFEST_VERSION
} from './constants.js';
import { writeJsonAtomic } from './common.js';
import { readCodexPidProcesses } from './collect.js';
import { createCodexRunEventsDashboardMetadata } from './run-events.js';
import type {
  FrontierCodexPidEntry,
  FrontierCodexPidManifest,
  FrontierCodexStopResult,
  FrontierCodexSwarmRunResult
} from './index.js';

const pidManifestWriteQueues = new Map<string, Promise<void>>();

export async function initFileSwarmEventStream(stream: FrontierSwarmEventStream | undefined): Promise<void> {
  if (!stream) return;
  const mailboxes = [stream.global, ...Object.values(stream.lanes)];
  await Promise.all(mailboxes.map(async (mailbox) => {
    if (!mailbox.path) return;
    await fs.mkdir(path.dirname(mailbox.path), { recursive: true });
    await fs.writeFile(mailbox.path, '');
  }));
}

export async function appendFileSwarmEvent(stream: FrontierSwarmEventStream | undefined, event: FrontierSwarmEventInput): Promise<void> {
  if (!stream) return;
  const line = JSON.stringify({ at: Date.now(), ...event }) + '\n';
  const paths = routeSwarmEventToMailboxes(stream, event)
    .map((mailbox) => mailbox.path)
    .filter((mailboxPath): mailboxPath is string => !!mailboxPath);
  await Promise.all(paths.map(async (mailboxPath) => {
    await fs.mkdir(path.dirname(mailboxPath), { recursive: true });
    await fs.appendFile(mailboxPath, line);
  }));
}

export async function writeSwarmCoordinatorSnapshot(
  file: string,
  input: FrontierCodexSwarmRunResult & {
    eventStream?: FrontierSwarmEventStream;
    pidManifestPath?: string;
    runEventsPath?: string;
    runDashboardPath?: string;
    runSyncEvidencePath?: string;
    runSyncHistoryPath?: string;
    queueStatePath?: string;
    queueEventsPath?: string;
    queueSummaryPath?: string;
    modelTelemetryPath?: string;
    modelTelemetrySummaryPath?: string;
    humanActionEventsPath?: string;
    humanActionStatePath?: string;
    liveRoutingPolicyPath?: string;
    liveRoutingControllerPath?: string;
    liveRoutingHistoryPath?: string;
  }
): Promise<void> {
  const processes = input.pidManifestPath ? await readCodexPidProcesses(input.pidManifestPath).catch(() => []) : [];
  const runEventsMetadata = createCodexRunEventsDashboardMetadata({
    runEventsPath: input.runEventsPath,
    runDashboardPath: input.runDashboardPath
  });
  const dashboard = createSwarmCoordinatorDashboard({
    plan: input.plan,
    run: input.run,
    processes,
    metadata: {
      ok: input.ok,
      outDir: input.outDir,
      eventStream: input.eventStream ?? null,
      pidManifestPath: input.pidManifestPath ?? null,
      runEventsPath: input.runEventsPath ?? null,
      runDashboardPath: input.runDashboardPath ?? null,
      runSyncEvidencePath: input.runSyncEvidencePath ?? null,
      runSyncHistoryPath: input.runSyncHistoryPath ?? null,
      queueStatePath: input.queueStatePath ?? null,
      queueEventsPath: input.queueEventsPath ?? null,
      queueSummaryPath: input.queueSummaryPath ?? null,
      modelTelemetryPath: input.modelTelemetryPath ?? null,
      modelTelemetrySummaryPath: input.modelTelemetrySummaryPath ?? null,
      humanActionEventsPath: input.humanActionEventsPath ?? null,
      humanActionStatePath: input.humanActionStatePath ?? null,
      liveRoutingPolicyPath: input.liveRoutingPolicyPath ?? null,
      liveRoutingControllerPath: input.liveRoutingControllerPath ?? null,
      liveRoutingHistoryPath: input.liveRoutingHistoryPath ?? null,
      artifactPaths: {
        coordinatorDashboard: file,
        ...runEventsMetadata.artifactPaths,
        ...(input.runSyncEvidencePath ? { runSyncEvidence: input.runSyncEvidencePath } : {}),
        ...(input.runSyncHistoryPath ? { runSyncHistory: input.runSyncHistoryPath } : {}),
        ...(input.queueStatePath ? { queueState: input.queueStatePath } : {}),
        ...(input.queueEventsPath ? { queueEvents: input.queueEventsPath } : {}),
        ...(input.queueSummaryPath ? { queueSummary: input.queueSummaryPath } : {}),
        ...(input.modelTelemetryPath ? { modelTelemetry: input.modelTelemetryPath } : {}),
        ...(input.modelTelemetrySummaryPath ? { modelTelemetrySummary: input.modelTelemetrySummaryPath } : {}),
        ...(input.humanActionEventsPath ? { humanActionEvents: input.humanActionEventsPath } : {}),
        ...(input.humanActionStatePath ? { humanActionState: input.humanActionStatePath } : {}),
        ...(input.liveRoutingPolicyPath ? { liveRoutingPolicy: input.liveRoutingPolicyPath } : {}),
        ...(input.liveRoutingControllerPath ? { liveRoutingController: input.liveRoutingControllerPath } : {}),
        ...(input.liveRoutingHistoryPath ? { liveRoutingHistory: input.liveRoutingHistoryPath } : {})
      },
      runSource: runEventsMetadata.runSource,
      proof: input.proof
    }
  });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(dashboard, null, 2) + '\n');
}

export async function appendCodexPidManifest(file: string, entry: FrontierCodexPidEntry, runId?: string): Promise<void> {
  const absolute = path.resolve(file);
  const previous = pidManifestWriteQueues.get(absolute) ?? Promise.resolve();
  let next: Promise<void>;
  next = previous
    .catch(() => {})
    .then(() => appendCodexPidManifestUnlocked(absolute, entry, runId))
    .finally(() => {
      if (pidManifestWriteQueues.get(absolute) === next) pidManifestWriteQueues.delete(absolute);
    });
  pidManifestWriteQueues.set(absolute, next);
  return next;
}

export async function readCodexPidManifest(file: string): Promise<FrontierCodexPidManifest> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as FrontierCodexPidManifest;
}

export async function stopCodexSwarmRun(input: { run: string; signal?: NodeJS.Signals }): Promise<FrontierCodexStopResult> {
  const signal = input.signal ?? 'SIGTERM';
  const pidManifestPath = await resolvePidManifestPath(input.run);
  const manifest = await readCodexPidManifest(pidManifestPath);
  const stopped: number[] = [];
  const missing: number[] = [];
  const errors: Array<{ pid: number; error: string }> = [];
  for (const entry of manifest.entries.filter((item) => item.pid !== process.pid).sort((left, right) => right.startedAt - left.startedAt)) {
    try {
      process.kill(entry.pid, signal);
      stopped.push(entry.pid);
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code === 'ESRCH') missing.push(entry.pid);
      else errors.push({ pid: entry.pid, error: error instanceof Error ? error.message : String(error) });
    }
  }
  if (stopped.length || missing.length) {
    await writeStoppedPidManifest(pidManifestPath, manifest, { signal, stopped, missing }).catch((error) => {
      errors.push({ pid: 0, error: error instanceof Error ? error.message : String(error) });
    });
  }
  return { ok: errors.length === 0, pidManifestPath, signal, stopped, missing, errors };
}

async function appendCodexPidManifestUnlocked(file: string, entry: FrontierCodexPidEntry, runId?: string): Promise<void> {
  const manifest = await readCodexPidManifest(file).catch(() => ({
    kind: FRONTIER_SWARM_CODEX_PID_MANIFEST_KIND,
    version: FRONTIER_SWARM_CODEX_PID_MANIFEST_VERSION,
    ...(runId ? { runId } : {}),
    entries: []
  } satisfies FrontierCodexPidManifest));
  const entries = manifest.entries.filter((existing) => existing.pid !== entry.pid || existing.jobId !== entry.jobId);
  entries.push(entry);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeJsonAtomic(file, { ...manifest, ...(runId ? { runId } : {}), entries });
}

async function writeStoppedPidManifest(
  file: string,
  manifest: FrontierCodexPidManifest,
  input: { signal: NodeJS.Signals; stopped: readonly number[]; missing: readonly number[] }
): Promise<void> {
  const stopped = new Set(input.stopped);
  const missing = new Set(input.missing);
  const stoppedAt = Date.now();
  const entries = manifest.entries.map((entry) => {
    if (stopped.has(entry.pid)) {
      return { ...entry, stoppedAt, stopSignal: input.signal, stopReason: 'stop-command' };
    }
    if (missing.has(entry.pid)) {
      return { ...entry, stoppedAt, stopSignal: input.signal, stopReason: 'stop-command-process-missing' };
    }
    return entry;
  });
  await writeJsonAtomic(file, { ...manifest, entries });
}

async function resolvePidManifestPath(runPath: string): Promise<string> {
  const absolute = path.resolve(runPath);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (stat?.isDirectory()) return path.join(absolute, 'pids.json');
  if (path.basename(absolute) === 'swarm-results.json') return path.join(path.dirname(absolute), 'pids.json');
  return absolute;
}
