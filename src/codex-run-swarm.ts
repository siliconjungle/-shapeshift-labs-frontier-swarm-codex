import fs from 'node:fs/promises';
import path from 'node:path';
import {
  completeSwarmJob,
  createRunEventsFromSwarmPlan,
  createSwarmEventStream,
  createSwarmProof,
  createSwarmRun,
  recordSwarmEvent,
  type FrontierSwarmPlan,
  type FrontierSwarmRoutingController
} from '@shapeshift-labs/frontier-swarm';
import { readAdaptiveFeedbackObservations } from './codex-adaptive-feedback.js';
import {
  appendCodexPidManifest,
  appendFileSwarmEvent,
  initFileSwarmEventStream,
  writeSwarmCoordinatorSnapshot
} from './codex-events.js';
import { runCodexDependencyHealthPreflight } from './codex-run-health.js';
import { runScheduledJobPool } from './codex-run-scheduler.js';
import { runCodexJob } from './codex-run.js';
import { createCodexQueueRuntime } from './queue-runtime.js';
import {
  appendCodexRuntimeProjectionResult,
  finalizeCodexRuntimeProjectionStores,
  initCodexRuntimeProjectionStores,
  resolveCodexRuntimeProjectionPaths
} from './runtime-projections.js';
import { resolveCodexLiveRoutingPaths, type FrontierCodexLiveRoutingPaths } from './live-routing.js';
import {
  appendCodexRunEvents,
  initCodexRunEvents,
  readCodexRunEvents,
  resolveCodexRunDashboardPath,
  resolveCodexRunEventsPath,
  writeCodexRunDashboard
} from './run-events.js';
import { syncCodexRunEventPeers } from './run-sync.js';
import {
  applyCodexDistributedRunDefaults,
  distributedWorkerRunRecordsFromResults,
  refreshCodexDistributedWorkerDashboards
} from './distributed-run.js';
import { writeCodexDistributedRunProof } from './distributed-run-proof.js';
import type { FrontierCodexSwarmRunOptions, FrontierCodexSwarmRunResult } from './index.js';

export async function runCodexSwarm(plan: FrontierSwarmPlan, options: FrontierCodexSwarmRunOptions): Promise<FrontierCodexSwarmRunResult> {
  const outDir = path.resolve(options.cwd ?? process.cwd(), options.outDir);
  const distributed = applyCodexDistributedRunDefaults(plan, options, outDir);
  const runInputOptions = distributed.options;
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'swarm-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  await runCodexDependencyHealthPreflight(plan, runInputOptions, outDir);
  const eventStream = runInputOptions.eventStream ?? createSwarmEventStream({
    runId: plan.runId,
    root: path.join(outDir, 'streams'),
    lanes: Array.from(new Set(plan.jobs.map((job) => job.lane)))
  });
  await initFileSwarmEventStream(eventStream);
  const runEventsPath = resolveCodexRunEventsPath({
    cwd: runInputOptions.cwd,
    outDir,
    runEventsPath: runInputOptions.runEventsPath
  });
  await initCodexRunEvents(runEventsPath);
  const runDashboardPath = resolveCodexRunDashboardPath({
    cwd: runInputOptions.cwd,
    outDir,
    runEventsPath: runInputOptions.runEventsPath,
    runDashboardPath: runInputOptions.runDashboardPath
  });
  const pidManifestPath = path.resolve(runInputOptions.cwd ?? process.cwd(), runInputOptions.pidManifestPath ?? path.join(outDir, 'pids.json'));
  await appendCodexPidManifest(pidManifestPath, { pid: process.pid, role: 'parent', runId: plan.runId, startedAt: Date.now() }, plan.runId);
  let run = createSwarmRun({ plan, status: 'running', startedAt: Date.now() });
  const startedEvent = { type: 'swarm.started', runId: run.id, at: run.startedAt, data: { jobCount: plan.jobs.length } };
  run = recordSwarmEvent(run, startedEvent);
  await appendCodexRunEvents(runEventsPath, createRunEventsFromSwarmPlan(plan, {
    runId: run.id,
    actorId: 'frontier-swarm-codex-run',
    time: new Date(run.startedAt).toISOString()
  }));
  await appendFileSwarmEvent(eventStream, startedEvent);
  const runOptions = {
    ...runInputOptions,
    eventStream,
    pidManifestPath,
    runEventsPath: runEventsPath ?? runInputOptions.runEventsPath,
    runDashboardPath: runDashboardPath ?? runInputOptions.runDashboardPath
  };
  const queueRuntime = await createCodexQueueRuntime(plan, runOptions, outDir);
  const runtimeProjectionPaths = resolveCodexRuntimeProjectionPaths(runOptions, outDir);
  const liveRoutingPaths: FrontierCodexLiveRoutingPaths = resolveCodexLiveRoutingPaths(runOptions, outDir);
  await initCodexRuntimeProjectionStores(runtimeProjectionPaths);
  let effectivePlan = plan;
  let latestLiveRoutingController: FrontierSwarmRoutingController | undefined;
  let jobsById = new Map(effectivePlan.jobs.map((job) => [job.id, job]));
  const projectedJobIds = new Set<string>();
  const appendRuntimeProjection = async (result: Parameters<typeof appendCodexRuntimeProjectionResult>[0]['result']) => {
    if (projectedJobIds.has(result.jobId)) return;
    projectedJobIds.add(result.jobId);
    await appendCodexRuntimeProjectionResult({
      paths: runtimeProjectionPaths,
      plan,
      job: jobsById.get(result.jobId),
      result
    });
  };
  const adaptiveObservations = await readAdaptiveFeedbackObservations(runInputOptions);
  const results = await runScheduledJobPool(plan, {
    concurrency: Math.max(1, runInputOptions.maxConcurrency ?? 1),
    adaptive: runInputOptions.adaptiveConcurrency,
    resourceScheduling: runInputOptions.resourceScheduling,
    observations: adaptiveObservations,
    outDir,
    eventStream,
    queueRuntime,
    liveRouting: runOptions.liveRouting,
    liveRoutingPaths,
    onPlanRerouted: ({ plan: routedPlan, controller }) => {
      effectivePlan = routedPlan;
      latestLiveRoutingController = controller;
      jobsById = new Map(effectivePlan.jobs.map((job) => [job.id, job]));
    },
    onJobSettled: appendRuntimeProjection
  }, (job, lease) => runCodexJob(job, runOptions, outDir, lease));
  for (const result of results) await appendRuntimeProjection(result);
  for (const result of results) {
    const job = effectivePlan.jobs.find((entry) => entry.id === result.jobId);
    if (job) {
      await runInputOptions.onJobFinished?.({ job, result });
      await appendFileSwarmEvent(eventStream, {
        type: 'agent.finished',
        runId: run.id,
        jobId: job.id,
        taskId: job.taskId,
        lane: job.lane,
        data: { status: result.status, mergeReadiness: result.mergeReadiness, changedPathCount: result.changedPaths?.length ?? 0 }
      });
    }
  }
  if (effectivePlan !== plan) {
    run = createSwarmRun({ plan: effectivePlan, status: 'running', startedAt: run.startedAt });
    run = recordSwarmEvent(run, startedEvent);
  }
  for (const result of results) run = completeSwarmJob(run, result);
  const proof = createSwarmProof(run, { validation: plan.validation });
  const ok = run.summary.failedCount === 0 && run.summary.blockedCount === 0 && run.summary.ownershipViolationCount === 0;
  await appendFileSwarmEvent(eventStream, { type: 'swarm.finished', runId: run.id, data: { ok, summary: run.summary } });
  const distributedWorkerRecords = distributedWorkerRunRecordsFromResults(results);
  const runSyncPeers = distributed.distributedRun.enabled
    ? uniqueRunSyncPeers([
      ...(runInputOptions.runSyncPeers ?? []),
      ...distributed.distributedRun.peers,
      ...distributedWorkerRecords.map((record) => record.runDir)
    ])
    : runInputOptions.runSyncPeers;
  const runSync = await syncCodexRunEventPeers({
    cwd: runInputOptions.cwd,
    run: outDir,
    outDir,
    runEventsPath: runEventsPath ?? runInputOptions.runEventsPath,
    runDashboardPath: runDashboardPath ?? runInputOptions.runDashboardPath,
    peers: runSyncPeers,
    direction: distributed.distributedRun.enabled ? distributed.distributedRun.syncDirection : runInputOptions.runSyncDirection,
    runSyncEvidencePath: runInputOptions.runSyncEvidencePath,
    runSyncHistoryPath: runInputOptions.runSyncHistoryPath,
    runId: run.id
  });
  if (distributed.distributedRun.enabled) await refreshCodexDistributedWorkerDashboards(distributedWorkerRecords);
  if (!runSync) {
    const runEvents = runEventsPath ? await readCodexRunEvents(runEventsPath) : [];
    await writeCodexRunDashboard(runDashboardPath, runEvents, { runId: run.id });
  }
  const queueSummary = await queueRuntime?.writeSummary();
  const runtimeProjectionFinal = await finalizeCodexRuntimeProjectionStores({
    paths: runtimeProjectionPaths,
    plan,
    generatedAt: Date.now()
  });
  const distributedProof = distributed.distributedRun.enabled && distributed.paths
    ? await writeCodexDistributedRunProof({
      plan: effectivePlan,
      paths: distributed.paths,
      options: distributed.distributedRun,
      workerRunRecords: distributedWorkerRecords,
      ...(runSync ? { runSync } : {}),
      ...(queueSummary ? { queueSummary } : {}),
      ...(runtimeProjectionFinal.modelTelemetrySummary ? { modelTelemetrySummary: runtimeProjectionFinal.modelTelemetrySummary } : {}),
      ...(runtimeProjectionFinal.humanActionState ? { humanActionState: runtimeProjectionFinal.humanActionState } : {}),
      liveRoutingPaths
    })
    : undefined;
  const distributedRunResult = distributed.distributedRun.enabled && distributed.paths ? {
    enabled: true as const,
    options: distributed.distributedRun,
    paths: distributed.paths,
    workerRunRecords: distributedWorkerRecords,
    ...(distributedProof ? { proof: distributedProof, proofPath: distributed.paths.proofPath } : {})
  } : undefined;
  await fs.writeFile(path.join(outDir, 'swarm-results.json'), JSON.stringify({
    ok,
    outDir,
    plan: effectivePlan,
    run,
    proof,
    ...(runEventsPath ? { runEventsPath } : {}),
    ...(runDashboardPath ? { runDashboardPath } : {}),
    ...(runSync?.runSyncEvidencePath ? { runSyncEvidencePath: runSync.runSyncEvidencePath } : {}),
    ...(runSync?.runSyncHistoryPath ? { runSyncHistoryPath: runSync.runSyncHistoryPath } : {}),
    ...(runSync ? { runSync } : {}),
    ...(distributedRunResult ? { distributedRun: distributedRunResult } : {}),
    ...(queueRuntime ? queueRuntime.paths : {}),
    ...(queueSummary ? { queueSummary } : {}),
    ...runtimeProjectionPaths,
    ...liveRoutingPaths,
    ...(latestLiveRoutingController ? { liveRoutingController: latestLiveRoutingController } : {}),
    ...runtimeProjectionFinal
  }, null, 2) + '\n');
  await writeSwarmCoordinatorSnapshot(runInputOptions.coordinatorSnapshotPath ? path.resolve(runInputOptions.cwd ?? process.cwd(), runInputOptions.coordinatorSnapshotPath) : path.join(outDir, 'coordinator-dashboard.json'), {
    ok,
    outDir,
    plan: effectivePlan,
    run,
    proof,
    eventStream,
    pidManifestPath,
    runEventsPath,
    runDashboardPath,
    ...(runSync?.runSyncEvidencePath ? { runSyncEvidencePath: runSync.runSyncEvidencePath } : {}),
    ...(runSync?.runSyncHistoryPath ? { runSyncHistoryPath: runSync.runSyncHistoryPath } : {}),
    ...(runSync ? { runSync } : {}),
    ...(distributedRunResult ? { distributedRun: distributedRunResult } : {}),
    ...(queueRuntime ? queueRuntime.paths : {}),
    ...runtimeProjectionPaths,
    ...liveRoutingPaths
  });
  const result: FrontierCodexSwarmRunResult = {
    ok,
    outDir,
    plan: effectivePlan,
    run,
    proof,
    ...(runEventsPath ? { runEventsPath } : {}),
    ...(runDashboardPath ? { runDashboardPath } : {}),
    ...(runSync?.runSyncEvidencePath ? { runSyncEvidencePath: runSync.runSyncEvidencePath } : {}),
    ...(runSync?.runSyncHistoryPath ? { runSyncHistoryPath: runSync.runSyncHistoryPath } : {}),
    ...(runSync ? { runSync } : {}),
    ...(distributedRunResult ? { distributedRun: distributedRunResult } : {}),
    ...(queueRuntime ? queueRuntime.paths : {}),
    ...runtimeProjectionPaths,
    ...liveRoutingPaths,
    ...(latestLiveRoutingController ? { liveRoutingController: latestLiveRoutingController } : {})
  };
  await runInputOptions.onSwarmFinished?.({ result });
  return result;
}

function uniqueRunSyncPeers(peers: readonly string[]): string[] {
  return Array.from(new Set(peers.map((peer) => peer.trim()).filter(Boolean)));
}
