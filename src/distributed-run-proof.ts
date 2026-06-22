import {
  FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_KIND,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_VERSION
} from './distributed-run.js';
import { pathExists, uniqueStrings, writeJsonAtomic } from './common.js';
import { readCodexRunEvents } from './run-events.js';
import type { FrontierCodexLiveRoutingPaths } from './live-routing.js';
import type { FrontierCodexQueueRuntimeSummary } from './queue-runtime.js';
import type { FrontierCodexRunSyncResult } from './run-sync.js';
import type {
  FrontierCodexHumanActionBrokerState,
  FrontierCodexModelTelemetrySummary
} from './runtime-projections.js';
import type {
  FrontierCodexDistributedRunArtifactPaths,
  FrontierCodexDistributedRunProof,
  FrontierCodexDistributedRunResolvedOptions,
  FrontierCodexDistributedWorkerRunRecord
} from './types-distributed-run.js';
import type { FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';

export async function writeCodexDistributedRunProof(input: {
  plan: FrontierSwarmPlan;
  paths: FrontierCodexDistributedRunArtifactPaths;
  options: FrontierCodexDistributedRunResolvedOptions;
  workerRunRecords: readonly FrontierCodexDistributedWorkerRunRecord[];
  runSync?: FrontierCodexRunSyncResult;
  queueSummary?: FrontierCodexQueueRuntimeSummary;
  modelTelemetrySummary?: FrontierCodexModelTelemetrySummary;
  humanActionState?: FrontierCodexHumanActionBrokerState;
  liveRoutingPaths?: FrontierCodexLiveRoutingPaths;
}): Promise<FrontierCodexDistributedRunProof | undefined> {
  if (!input.paths.proofPath) return undefined;
  const coordinatorEvents = await readCodexRunEvents(input.paths.runEventsPath);
  const coordinatorEventIds = new Set(coordinatorEvents.map((event) => event.id));
  const workers = await Promise.all(input.workerRunRecords.map(async (record) => {
    const events = await readCodexRunEvents(record.runEventsPath);
    return {
      ...record,
      eventCount: events.length,
      actorIds: uniqueStrings(events.map((event) => event.actorId)).sort(),
      syncedToCoordinator: events.length > 0 && events.every((event) => coordinatorEventIds.has(event.id))
    };
  }));
  const coverage = {
    realWorkerRunEvents: workers.length > 0 && workers.every((worker) => worker.eventCount > 0),
    distributedSync: Boolean(input.runSync?.ok && workers.every((worker) => worker.syncedToCoordinator)),
    queueBacked: Boolean(input.queueSummary?.enabled && input.queueSummary.eventCount > 0),
    dashboardProjection: await pathExists(input.paths.runDashboardPath),
    modelTelemetryProjection: Boolean(input.modelTelemetrySummary),
    humanQuestionProjection: Boolean(input.humanActionState),
    transportResolved: input.options.transport.supported
  };
  const proof: FrontierCodexDistributedRunProof = {
    kind: FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_KIND,
    version: FRONTIER_SWARM_CODEX_DISTRIBUTED_RUN_VERSION,
    ok: Object.values(coverage).every(Boolean),
    generatedAt: new Date().toISOString(),
    runId: input.plan.runId,
    planId: input.plan.id,
    transport: input.options.transport,
    coordinator: {
      runDir: input.paths.runDir,
      runEventsPath: input.paths.runEventsPath,
      runDashboardPath: input.paths.runDashboardPath,
      eventCount: coordinatorEvents.length,
      actorIds: uniqueStrings(coordinatorEvents.map((event) => event.actorId)).sort()
    },
    workers,
    peers: input.options.peers,
    ...(input.runSync ? { runSync: input.runSync } : {}),
    ...(input.queueSummary ? { queueSummary: input.queueSummary } : {}),
    ...(input.modelTelemetrySummary ? { modelTelemetrySummary: input.modelTelemetrySummary } : {}),
    ...(input.humanActionState ? { humanActionState: input.humanActionState } : {}),
    paths: input.paths,
    coverage
  };
  await writeJsonAtomic(input.paths.proofPath, proof);
  return proof;
}
