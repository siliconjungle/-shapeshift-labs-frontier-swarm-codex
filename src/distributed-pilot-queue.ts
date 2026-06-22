import fs from 'node:fs/promises';
import path from 'node:path';
import {
  completeQueueJob,
  createQueueEvidence,
  createQueueState,
  encodeQueueJsonl,
  enqueueQueueJob,
  inspectQueueState,
  leaseQueueJobs,
  type FrontierQueueState
} from '@shapeshift-labs/frontier-queue';
import { createSwarmQueueOverlay, type FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';
import { stableHash, writeJsonAtomic } from './common.js';
import {
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_EVENTS_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_STATE_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_SUMMARY_FILE,
  type PilotQueueArtifacts,
  type PilotRepo
} from './distributed-pilot-types.js';

export async function writePilotQueueArtifacts(
  repo: PilotRepo,
  plan: FrontierSwarmPlan,
  generatedAt: string
): Promise<PilotQueueArtifacts> {
  const queueStatePath = path.join(repo.runDir, FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_STATE_FILE);
  const queueEventsPath = path.join(repo.runDir, FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_EVENTS_FILE);
  const queueSummaryPath = path.join(repo.runDir, FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_SUMMARY_FILE);
  const now = Date.parse(generatedAt);
  let state: FrontierQueueState = createQueueState({
    id: `distributed-pilot:${plan.runId}`,
    defaults: {
      queue: 'distributed-pilot',
      leaseMs: 30_000,
      maxStalls: 0,
      retry: { maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, backoff: 1, jitter: 'none' },
      deadLetterQueue: 'distributed-pilot:dead'
    },
    metadata: {
      source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
      planId: plan.id,
      runId: plan.runId,
      repoId: repo.id
    }
  });
  state = enqueueQueueJob(state, {
    id: 'distributed-pilot-job',
    queue: 'distributed-pilot',
    payload: { taskId: 'distributed-pilot-task', repoId: repo.id },
    dedupeKey: stableHash(['distributed-pilot', plan.runId, 'distributed-pilot-task']),
    dedupeMode: 'drop',
    priority: 100,
    runAt: now,
    leaseMs: 30_000,
    maxAttempts: 1,
    maxStalls: 0,
    tags: ['frontier-swarm-codex', 'distributed-pilot'],
    metadata: { planId: plan.id, runId: plan.runId, lane: 'distributed-runtime' }
  }, { now }).state;
  const leased = leaseQueueJobs(state, {
    queue: 'distributed-pilot',
    workerId: repo.actorId,
    count: 1,
    now: now + 1,
    leaseMs: 30_000
  });
  state = leased.state;
  const leaseToken = leased.jobs?.[0]?.lease?.token;
  if (!leaseToken) throw new Error('distributed pilot queue lease was not created');
  state = completeQueueJob(state, {
    jobId: 'distributed-pilot-job',
    leaseToken,
    workerId: repo.actorId,
    now: now + 2,
    metadata: { completedBy: repo.actorId, source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND }
  }).state;
  const evidence = createQueueEvidence(state);
  const inspection = inspectQueueState(state);
  const overlay = createSwarmQueueOverlay({
    runId: plan.runId,
    results: [{
      jobId: 'distributed-pilot-job',
      status: 'completed',
      mergeReadiness: 'verified-patch',
      mergeDisposition: 'ready',
      queueItemIds: ['distributed-pilot-task'],
      changedPaths: ['packages/frontier-swarm-codex/src/distributed-pilot.ts'],
      evidencePaths: [queueSummaryPath],
      riskLevel: 'low',
      metadata: { queueId: state.id, terminalOutcomeCount: state.terminalOutcomes.length }
    }],
    metadata: { source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND }
  });
  const summary = {
    kind: 'frontier.swarm-codex.distributed-pilot.queue-summary',
    version: 1,
    generatedAt,
    runId: plan.runId,
    planId: plan.id,
    queueId: state.id,
    inspection,
    evidence,
    overlay,
    terminalOutcomeCount: state.terminalOutcomes.length,
    eventCount: state.events.length,
    completed: inspection.completed
  };
  await writeJsonAtomic(queueStatePath, state);
  await fs.writeFile(queueEventsPath, encodeQueueJsonl(state.events as any));
  await writeJsonAtomic(queueSummaryPath, summary);
  return { queueStatePath, queueEventsPath, queueSummaryPath, summary };
}
