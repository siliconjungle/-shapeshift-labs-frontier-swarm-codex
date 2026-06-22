import path from 'node:path';
import { type FrontierRunEvent } from '@shapeshift-labs/frontier-run';
import type { JsonObject } from '@shapeshift-labs/frontier';
import {
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENTS_FILE,
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_FILE,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_EVENTS_FILE,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_FILE
} from './runtime-projection-common.js';
import {
  FRONTIER_SWARM_CODEX_LIVE_ROUTING_CONTROLLER_FILE,
  FRONTIER_SWARM_CODEX_LIVE_ROUTING_HISTORY_FILE,
  FRONTIER_SWARM_CODEX_LIVE_ROUTING_POLICY_FILE
} from './live-routing.js';
import {
  FRONTIER_SWARM_CODEX_QUEUE_EVENTS_FILE,
  FRONTIER_SWARM_CODEX_QUEUE_STATE_FILE,
  FRONTIER_SWARM_CODEX_QUEUE_SUMMARY_FILE
} from './queue-runtime.js';
import {
  FRONTIER_SWARM_CODEX_RUN_DASHBOARD_FILE,
  FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE,
  appendCodexRunEvents,
  readCodexRunEvents,
  writeCodexRunDashboard
} from './run-events.js';
import {
  FRONTIER_SWARM_CODEX_RUN_SYNC_EVIDENCE_FILE,
  FRONTIER_SWARM_CODEX_RUN_SYNC_HISTORY_FILE
} from './run-sync.js';
import { isObject, uniqueStrings } from './common.js';
import type { FrontierCodexSwarmRunOptions } from './types-run.js';
import type {
  FrontierCodexDistributedRunArtifactPaths,
  FrontierCodexDistributedRunOptions,
  FrontierCodexDistributedRunResolvedOptions,
  FrontierCodexDistributedRunResolvedTransport,
  FrontierCodexDistributedRunTransportKind,
  FrontierCodexDistributedWorkerRunRecord
} from './types-distributed-run.js';
import type { FrontierSwarmJob, FrontierSwarmJobResultInput, FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';

export const FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_KIND = 'frontier.swarm-codex.distributed-run';
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_ROOT = '.frontier-run';
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_PROOF_FILE = 'distributed-run-proof.json';

export function normalizeCodexDistributedRunOptions(
  value: boolean | FrontierCodexDistributedRunOptions | undefined
): FrontierCodexDistributedRunResolvedOptions {
  if (value === undefined || value === false) {
    return {
      enabled: false,
      runRoot: FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_ROOT,
      transport: normalizeDistributedRunTransport(undefined),
      peers: [],
      syncDirection: 'bidirectional',
      requireQueue: true,
      requireWorkerRunEvents: true
    };
  }
  const input = value === true ? {} : value;
  return {
    enabled: input.enabled ?? true,
    runRoot: normalizeRunRoot(input.runRoot),
    transport: normalizeDistributedRunTransport(input.transport),
    peers: uniqueStrings(input.peers ?? []),
    syncDirection: input.syncDirection ?? 'bidirectional',
    proofPath: input.proofPath,
    requireQueue: input.requireQueue ?? true,
    requireWorkerRunEvents: input.requireWorkerRunEvents ?? true
  };
}

export function resolveCodexDistributedRunDir(input: {
  baseDir: string;
  runId: string;
  runRoot?: string;
}): string {
  return path.resolve(input.baseDir, normalizeRunRoot(input.runRoot), input.runId);
}

export function resolveCodexDistributedRunArtifactPaths(input: {
  cwd?: string;
  outDir: string;
  runId: string;
  options: FrontierCodexDistributedRunResolvedOptions;
}): FrontierCodexDistributedRunArtifactPaths {
  const runDir = resolveCodexDistributedRunDir({
    baseDir: input.outDir,
    runId: input.runId,
    runRoot: input.options.runRoot
  });
  const proofPath = input.options.proofPath === false
    ? ''
    : path.resolve(input.cwd ?? process.cwd(), input.options.proofPath ?? path.join(runDir, FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_PROOF_FILE));
  return {
    runDir,
    runEventsPath: path.join(runDir, FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE),
    runDashboardPath: path.join(runDir, FRONTIER_SWARM_CODEX_RUN_DASHBOARD_FILE),
    queueStatePath: path.join(runDir, FRONTIER_SWARM_CODEX_QUEUE_STATE_FILE),
    queueEventsPath: path.join(runDir, FRONTIER_SWARM_CODEX_QUEUE_EVENTS_FILE),
    queueSummaryPath: path.join(runDir, FRONTIER_SWARM_CODEX_QUEUE_SUMMARY_FILE),
    modelTelemetryPath: path.join(runDir, FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_EVENTS_FILE),
    modelTelemetrySummaryPath: path.join(runDir, FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_FILE),
    humanActionEventsPath: path.join(runDir, FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENTS_FILE),
    humanActionStatePath: path.join(runDir, FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_FILE),
    liveRoutingPolicyPath: path.join(runDir, FRONTIER_SWARM_CODEX_LIVE_ROUTING_POLICY_FILE),
    liveRoutingControllerPath: path.join(runDir, FRONTIER_SWARM_CODEX_LIVE_ROUTING_CONTROLLER_FILE),
    liveRoutingHistoryPath: path.join(runDir, FRONTIER_SWARM_CODEX_LIVE_ROUTING_HISTORY_FILE),
    runSyncEvidencePath: path.join(runDir, FRONTIER_SWARM_CODEX_RUN_SYNC_EVIDENCE_FILE),
    runSyncHistoryPath: path.join(runDir, FRONTIER_SWARM_CODEX_RUN_SYNC_HISTORY_FILE),
    proofPath
  };
}

export function applyCodexDistributedRunDefaults(
  plan: FrontierSwarmPlan,
  options: FrontierCodexSwarmRunOptions,
  outDir: string
): {
  options: FrontierCodexSwarmRunOptions;
  distributedRun: FrontierCodexDistributedRunResolvedOptions;
  paths?: FrontierCodexDistributedRunArtifactPaths;
} {
  const distributedRun = normalizeCodexDistributedRunOptions(options.distributedRun);
  if (!distributedRun.enabled) return { options, distributedRun };
  if (!distributedRun.transport.supported) {
    throw new Error(`unsupported distributed run transport ${distributedRun.transport.kind}: ${distributedRun.transport.reason ?? 'no adapter is available'}`);
  }
  const paths = resolveCodexDistributedRunArtifactPaths({
    cwd: options.cwd,
    outDir,
    runId: plan.runId,
    options: distributedRun
  });
  return {
    distributedRun,
    paths,
    options: {
      ...options,
      distributedRun,
      runEventsPath: options.runEventsPath ?? paths.runEventsPath,
      runDashboardPath: options.runDashboardPath ?? paths.runDashboardPath,
      queueStatePath: options.queueStatePath ?? paths.queueStatePath,
      queueEventsPath: options.queueEventsPath ?? paths.queueEventsPath,
      queueSummaryPath: options.queueSummaryPath ?? paths.queueSummaryPath,
      modelTelemetryPath: options.modelTelemetryPath ?? paths.modelTelemetryPath,
      modelTelemetrySummaryPath: options.modelTelemetrySummaryPath ?? paths.modelTelemetrySummaryPath,
      humanActionEventsPath: options.humanActionEventsPath ?? paths.humanActionEventsPath,
      humanActionStatePath: options.humanActionStatePath ?? paths.humanActionStatePath,
      liveRoutingPolicyPath: options.liveRoutingPolicyPath ?? paths.liveRoutingPolicyPath,
      liveRoutingControllerPath: options.liveRoutingControllerPath ?? paths.liveRoutingControllerPath,
      liveRoutingHistoryPath: options.liveRoutingHistoryPath ?? paths.liveRoutingHistoryPath,
      runSyncEvidencePath: options.runSyncEvidencePath ?? paths.runSyncEvidencePath,
      runSyncHistoryPath: options.runSyncHistoryPath ?? paths.runSyncHistoryPath
    }
  };
}

export function createCodexDistributedWorkerRunRecord(input: {
  options: FrontierCodexSwarmRunOptions;
  workspacePath: string;
  job: FrontierSwarmJob;
}): FrontierCodexDistributedWorkerRunRecord | undefined {
  const distributedRun = normalizeCodexDistributedRunOptions(input.options.distributedRun);
  const runId = input.options.eventStream?.runId;
  if (!distributedRun.enabled || !runId) return undefined;
  if (!distributedRun.transport.supported) {
    throw new Error(`unsupported distributed run transport ${distributedRun.transport.kind}: ${distributedRun.transport.reason ?? 'no adapter is available'}`);
  }
  const runDir = resolveCodexDistributedRunDir({
    baseDir: input.workspacePath,
    runId,
    runRoot: distributedRun.runRoot
  });
  return {
    enabled: true,
    runId,
    jobId: input.job.id,
    taskId: input.job.taskId,
    lane: input.job.lane,
    workspacePath: input.workspacePath,
    runRoot: distributedRun.runRoot,
    runDir,
    runEventsPath: path.join(runDir, FRONTIER_SWARM_CODEX_RUN_EVENTS_FILE),
    runDashboardPath: path.join(runDir, FRONTIER_SWARM_CODEX_RUN_DASHBOARD_FILE),
    transport: distributedRun.transport
  };
}

export async function appendCodexDistributedWorkerRunEvents(input: {
  record?: FrontierCodexDistributedWorkerRunRecord;
  events: readonly FrontierRunEvent[];
}): Promise<void> {
  if (!input.record || input.events.length === 0) return;
  await appendCodexRunEvents(input.record.runEventsPath, input.events);
  const events = await readCodexRunEvents(input.record.runEventsPath);
  await writeCodexRunDashboard(input.record.runDashboardPath, events, {
    runId: input.record.runId,
    metadata: workerDashboardMetadata(input.record)
  });
}

export async function refreshCodexDistributedWorkerDashboards(
  records: readonly FrontierCodexDistributedWorkerRunRecord[]
): Promise<void> {
  for (const record of records) {
    const events = await readCodexRunEvents(record.runEventsPath);
    await writeCodexRunDashboard(record.runDashboardPath, events, {
      runId: record.runId,
      metadata: workerDashboardMetadata(record)
    });
  }
}

export function distributedWorkerRunRecordsFromResults(
  results: readonly FrontierSwarmJobResultInput[]
): FrontierCodexDistributedWorkerRunRecord[] {
  const records: FrontierCodexDistributedWorkerRunRecord[] = [];
  for (const result of results) {
    const metadata = isObject(result.metadata) ? result.metadata : {};
    const record = metadata.distributedRun;
    if (isDistributedWorkerRunRecord(record)) records.push(record);
  }
  return records;
}

function normalizeRunRoot(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/^\/+|\/+$/g, '') : FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_ROOT;
}

function normalizeDistributedRunTransport(
  value: FrontierCodexDistributedRunOptions['transport']
): FrontierCodexDistributedRunResolvedTransport {
  const input = typeof value === 'string' ? { kind: value } : value ?? {};
  const kind = input.kind ?? 'local-fs';
  if (kind === 'local-fs' || kind === 'git-repo') {
    return {
      kind,
      name: input.name,
      root: input.root,
      metadata: input.metadata,
      supported: true
    };
  }
  return {
    kind,
    name: input.name,
    root: input.root,
    metadata: input.metadata,
    supported: false,
    reason: `${kind} transport is reserved for pluggable distributed adapters and is not implemented in the Codex runner`
  };
}

function isDistributedWorkerRunRecord(value: unknown): value is FrontierCodexDistributedWorkerRunRecord {
  if (!isObject(value)) return false;
  return value.enabled === true
    && typeof value.runId === 'string'
    && typeof value.jobId === 'string'
    && typeof value.workspacePath === 'string'
    && typeof value.runDir === 'string'
    && typeof value.runEventsPath === 'string'
    && typeof value.runDashboardPath === 'string';
}

function workerDashboardMetadata(record: FrontierCodexDistributedWorkerRunRecord): JsonObject {
  return {
    source: FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_KIND,
    role: 'worker',
    jobId: record.jobId,
    ...(record.taskId ? { taskId: record.taskId } : {}),
    ...(record.lane ? { lane: record.lane } : {}),
    workspacePath: record.workspacePath,
    runDir: record.runDir
  };
}
