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
import type { FrontierCodexSwarmRunOptions, FrontierCodexSwarmRunResult } from './index.js';

export async function runCodexSwarm(plan: FrontierSwarmPlan, options: FrontierCodexSwarmRunOptions): Promise<FrontierCodexSwarmRunResult> {
  const outDir = path.resolve(options.cwd ?? process.cwd(), options.outDir);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'swarm-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  await runCodexDependencyHealthPreflight(plan, options, outDir);
  const eventStream = options.eventStream ?? createSwarmEventStream({
    runId: plan.runId,
    root: path.join(outDir, 'streams'),
    lanes: Array.from(new Set(plan.jobs.map((job) => job.lane)))
  });
  await initFileSwarmEventStream(eventStream);
  const runEventsPath = resolveCodexRunEventsPath({
    cwd: options.cwd,
    outDir,
    runEventsPath: options.runEventsPath
  });
  await initCodexRunEvents(runEventsPath);
  const runDashboardPath = resolveCodexRunDashboardPath({
    cwd: options.cwd,
    outDir,
    runEventsPath: options.runEventsPath,
    runDashboardPath: options.runDashboardPath
  });
  const pidManifestPath = path.resolve(options.cwd ?? process.cwd(), options.pidManifestPath ?? path.join(outDir, 'pids.json'));
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
    ...options,
    eventStream,
    pidManifestPath,
    runEventsPath: runEventsPath ?? options.runEventsPath,
    runDashboardPath: runDashboardPath ?? options.runDashboardPath
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
  const adaptiveObservations = await readAdaptiveFeedbackObservations(options);
  const results = await runScheduledJobPool(plan, {
    concurrency: Math.max(1, options.maxConcurrency ?? 1),
    adaptive: options.adaptiveConcurrency,
    resourceScheduling: options.resourceScheduling,
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
      await options.onJobFinished?.({ job, result });
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
  const runEvents = runEventsPath ? await readCodexRunEvents(runEventsPath) : [];
  await writeCodexRunDashboard(runDashboardPath, runEvents, { runId: run.id });
  const queueSummary = await queueRuntime?.writeSummary();
  const runtimeProjectionFinal = await finalizeCodexRuntimeProjectionStores({
    paths: runtimeProjectionPaths,
    plan,
    generatedAt: Date.now()
  });
  await fs.writeFile(path.join(outDir, 'swarm-results.json'), JSON.stringify({
    ok,
    outDir,
    plan: effectivePlan,
    run,
    proof,
    ...(runEventsPath ? { runEventsPath } : {}),
    ...(runDashboardPath ? { runDashboardPath } : {}),
    ...(queueRuntime ? queueRuntime.paths : {}),
    ...(queueSummary ? { queueSummary } : {}),
    ...runtimeProjectionPaths,
    ...liveRoutingPaths,
    ...(latestLiveRoutingController ? { liveRoutingController: latestLiveRoutingController } : {}),
    ...runtimeProjectionFinal
  }, null, 2) + '\n');
  await writeSwarmCoordinatorSnapshot(options.coordinatorSnapshotPath ? path.resolve(options.cwd ?? process.cwd(), options.coordinatorSnapshotPath) : path.join(outDir, 'coordinator-dashboard.json'), {
    ok,
    outDir,
    plan: effectivePlan,
    run,
    proof,
    eventStream,
    pidManifestPath,
    runEventsPath,
    runDashboardPath,
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
    ...(queueRuntime ? queueRuntime.paths : {}),
    ...runtimeProjectionPaths,
    ...liveRoutingPaths,
    ...(latestLiveRoutingController ? { liveRoutingController: latestLiveRoutingController } : {})
  };
  await options.onSwarmFinished?.({ result });
  return result;
}
