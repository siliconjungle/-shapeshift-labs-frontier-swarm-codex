import fs from 'node:fs/promises';
import path from 'node:path';
import {
  completeSwarmJob,
  createRunEventsFromSwarmPlan,
  createSwarmEventStream,
  createSwarmProof,
  createSwarmRun,
  recordSwarmEvent,
  type FrontierSwarmPlan
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
import {
  appendCodexLiveRunGraphEvent,
  createCodexLiveRunFinishedEvent,
  createCodexLiveRunStartedEvent,
  initCodexLiveRunGraphEvents,
  resolveCodexLiveRunGraphEventsPath
} from './run-graph-live.js';
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
  const liveRunGraphEventsPath = resolveCodexLiveRunGraphEventsPath({
    cwd: options.cwd,
    outDir,
    liveRunGraphEventsPath: options.liveRunGraphEventsPath
  });
  await initCodexLiveRunGraphEvents(liveRunGraphEventsPath);
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
  await appendCodexLiveRunGraphEvent(liveRunGraphEventsPath, createCodexLiveRunStartedEvent({
    runId: run.id,
    outDir,
    jobCount: plan.jobs.length,
    generatedAt: run.startedAt
  }));
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
    liveRunGraphEventsPath: liveRunGraphEventsPath ?? options.liveRunGraphEventsPath,
    runEventsPath: runEventsPath ?? options.runEventsPath,
    runDashboardPath: runDashboardPath ?? options.runDashboardPath
  };
  const adaptiveObservations = await readAdaptiveFeedbackObservations(options);
  const results = await runScheduledJobPool(plan, {
    concurrency: Math.max(1, options.maxConcurrency ?? 1),
    adaptive: options.adaptiveConcurrency,
    resourceScheduling: options.resourceScheduling,
    observations: adaptiveObservations,
    outDir,
    eventStream
  }, (job, lease) => runCodexJob(job, runOptions, outDir, lease));
  for (const result of results) {
    const job = plan.jobs.find((entry) => entry.id === result.jobId);
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
  for (const result of results) run = completeSwarmJob(run, result);
  const proof = createSwarmProof(run, { validation: plan.validation });
  const ok = run.summary.failedCount === 0 && run.summary.blockedCount === 0 && run.summary.ownershipViolationCount === 0;
  await appendCodexLiveRunGraphEvent(liveRunGraphEventsPath, createCodexLiveRunFinishedEvent({
    runId: run.id,
    outDir,
    ok,
    summary: run.summary
  }));
  await appendFileSwarmEvent(eventStream, { type: 'swarm.finished', runId: run.id, data: { ok, summary: run.summary } });
  const runEvents = runEventsPath ? await readCodexRunEvents(runEventsPath) : [];
  await writeCodexRunDashboard(runDashboardPath, runEvents, { runId: run.id });
  await fs.writeFile(path.join(outDir, 'swarm-results.json'), JSON.stringify({
    ok,
    outDir,
    run,
    proof,
    ...(runEventsPath ? { runEventsPath } : {}),
    ...(runDashboardPath ? { runDashboardPath } : {})
  }, null, 2) + '\n');
  await writeSwarmCoordinatorSnapshot(options.coordinatorSnapshotPath ? path.resolve(options.cwd ?? process.cwd(), options.coordinatorSnapshotPath) : path.join(outDir, 'coordinator-dashboard.json'), {
    ok,
    outDir,
    plan,
    run,
    proof,
    eventStream,
    pidManifestPath,
    runEventsPath,
    runDashboardPath,
    liveRunGraphEventsPath
  });
  const result: FrontierCodexSwarmRunResult = {
    ok,
    outDir,
    plan,
    run,
    proof,
    ...(runEventsPath ? { runEventsPath } : {}),
    ...(runDashboardPath ? { runDashboardPath } : {})
  };
  await options.onSwarmFinished?.({ result });
  return result;
}
