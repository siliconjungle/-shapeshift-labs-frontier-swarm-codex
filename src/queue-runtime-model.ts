import fs from 'node:fs/promises';
import {
  completeQueueJob,
  createQueueState,
  enqueueQueueJob,
  type FrontierQueueJob,
  type FrontierQueueState
} from '@shapeshift-labs/frontier-queue';
import type {
  FrontierSwarmJob,
  FrontierSwarmJobResultInput,
  FrontierSwarmPlan
} from '@shapeshift-labs/frontier-swarm';
import { isObject, pathExists, stableHash } from './common.js';
import type { FrontierCodexSwarmRunOptions } from './types-run.js';

type QueueMetadata = NonNullable<Parameters<typeof completeQueueJob>[1]['metadata']>;

export async function readOrCreateQueueState(
  file: string,
  plan: FrontierSwarmPlan,
  options: FrontierCodexSwarmRunOptions
): Promise<FrontierQueueState> {
  if (await pathExists(file)) {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as FrontierQueueState;
    return createQueueState(raw);
  }
  return createQueueState({
    id: 'frontier-swarm-codex:' + plan.runId,
    defaults: {
      queue: queueName(plan),
      leaseMs: defaultQueueLeaseMs(plan, options),
      maxStalls: 0,
      retry: {
        maxAttempts: 1,
        initialDelayMs: 0,
        maxDelayMs: 0,
        backoff: 1,
        jitter: 'none'
      },
      deadLetterQueue: queueName(plan) + ':dead'
    },
    metadata: {
      source: 'frontier-swarm-codex',
      planId: plan.id,
      runId: plan.runId
    }
  });
}

export function queueJobInput(
  plan: FrontierSwarmPlan,
  job: FrontierSwarmJob,
  options: FrontierCodexSwarmRunOptions,
  now: number
): Parameters<typeof enqueueQueueJob>[1] {
  return {
    id: queueJobId(job),
    queue: queueName(plan),
    payload: job as unknown as Parameters<typeof enqueueQueueJob>[1]['payload'],
    dedupeKey: queueJobDedupeKey(plan, job),
    dedupeMode: 'drop',
    priority: job.priority,
    runAt: now,
    leaseMs: job.compute.timeoutMs ?? options.jobTimeoutMs ?? defaultQueueLeaseMs(plan, options),
    maxAttempts: 1,
    maxStalls: 0,
    tags: ['frontier-swarm-codex', job.lane, job.compute.id],
    metadata: {
      source: 'frontier-swarm-codex',
      planId: plan.id,
      runId: plan.runId,
      swarmJobId: job.id,
      taskId: job.taskId,
      lane: job.lane,
      compute: job.compute.id,
      queueItemIds: queueItemIdsForJob(job)
    }
  };
}

export function createTerminalResultsFromQueue(
  plan: FrontierSwarmPlan,
  state: FrontierQueueState,
  jobs: readonly FrontierSwarmJob[]
): FrontierSwarmJobResultInput[] {
  const results: FrontierSwarmJobResultInput[] = [];
  const terminal = terminalQueueJobsBySwarmJobId(plan, state);
  for (const job of jobs) {
    const queueJob = terminal.get(job.id);
    if (!queueJob) continue;
    const successful = queueJob.status === 'completed' || queueJob.status === 'deduped';
    results.push({
      jobId: job.id,
      status: successful ? 'completed' : 'blocked',
      mergeReadiness: successful ? 'discovery-only' : 'blocked',
      mergeDisposition: successful ? 'discovery-only' : 'blocked',
      startedAt: queueJob.createdAt,
      finishedAt: queueJob.completedAt ?? queueJob.deadAt ?? queueJob.updatedAt,
      changedPaths: [],
      queueItemIds: queueItemIdsForJob(job),
      error: successful ? undefined : queueJob.error?.message ?? queueJob.status,
      metadata: {
        source: 'frontier-swarm-codex.queue-runtime',
        queueOutcome: queueJob.status,
        queueJobId: queueJob.id,
        dedupeKey: queueJob.dedupeKey,
        terminal: true,
        resurrectedFromManifest: false
      }
    });
  }
  return results;
}

export function queueResultMetadata(result: FrontierSwarmJobResultInput): QueueMetadata {
  return {
    source: 'frontier-swarm-codex.queue-runtime',
    swarmJobId: result.jobId,
    status: result.status ?? 'unknown',
    mergeReadiness: result.mergeReadiness ?? 'unknown',
    mergeDisposition: result.mergeDisposition ?? 'unknown',
    changedPathCount: result.changedPaths?.length ?? 0,
    queueItemIds: [...(result.queueItemIds ?? [])]
  };
}

export function terminalSwarmJobIds(plan: FrontierSwarmPlan, state: FrontierQueueState): string[] {
  return Array.from(terminalQueueJobsBySwarmJobId(plan, state).keys()).sort();
}

export function findQueueJobForSwarmJob(state: FrontierQueueState, plan: FrontierSwarmPlan, swarmJobId: string): FrontierQueueJob | undefined {
  const id = queueJobId({ id: swarmJobId } as FrontierSwarmJob);
  return state.jobs.find((job) => job.id === id && job.queue === queueName(plan));
}

export function swarmJobIdFromQueueJob(job: FrontierQueueJob): string | undefined {
  if (isObject(job.metadata) && typeof job.metadata.swarmJobId === 'string') return job.metadata.swarmJobId;
  const payload = job.payload;
  if (isObject(payload) && typeof payload.id === 'string') return payload.id;
  if (job.id.startsWith('swarm-job:')) return job.id.slice('swarm-job:'.length);
  return undefined;
}

export function queueJobId(job: Pick<FrontierSwarmJob, 'id'>): string {
  return 'swarm-job:' + job.id;
}

export function queueName(plan: FrontierSwarmPlan): string {
  return 'frontier-swarm-codex:' + plan.runId;
}

export function defaultQueueLeaseMs(plan: FrontierSwarmPlan, options: FrontierCodexSwarmRunOptions): number {
  const jobTimeouts = plan.jobs.map((job) => job.compute.timeoutMs).filter((value): value is number => Number.isFinite(value));
  return Math.max(30_000, options.jobTimeoutMs ?? 0, ...jobTimeouts, 7_200_000) + 60_000;
}

function queueItemIdsForJob(job: FrontierSwarmJob): string[] {
  if (isObject(job.metadata) && Array.isArray(job.metadata.queueItemIds)) {
    return job.metadata.queueItemIds.map(String).filter(Boolean);
  }
  return [job.taskId || job.id];
}

function terminalQueueJobsBySwarmJobId(plan: FrontierSwarmPlan, state: FrontierQueueState): Map<string, FrontierQueueJob> {
  const terminalStatuses = new Set(['completed', 'dead', 'cancelled', 'deduped']);
  const out = new Map<string, FrontierQueueJob>();
  for (const job of state.jobs) {
    if (!terminalStatuses.has(job.status)) continue;
    if (job.queue !== queueName(plan)) continue;
    const swarmJobId = swarmJobIdFromQueueJob(job);
    if (swarmJobId) out.set(swarmJobId, job);
  }
  return out;
}

function queueJobDedupeKey(plan: FrontierSwarmPlan, job: FrontierSwarmJob): string {
  return stableHash(['frontier-swarm-codex', plan.id, job.taskId || job.id, job.lane]);
}
