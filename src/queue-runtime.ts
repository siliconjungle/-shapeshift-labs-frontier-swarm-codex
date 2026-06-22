import fs from 'node:fs/promises';
import path from 'node:path';
import {
  completeQueueJob,
  createQueueEvidence,
  encodeQueueJsonl,
  enqueueQueueJob,
  expireQueueLeases,
  failQueueJob,
  inspectQueueState,
  leaseQueueJobs,
  projectQueueTerminalOutcomes,
  type FrontierQueueJob,
  type FrontierQueueMutation,
  type FrontierQueueState
} from '@shapeshift-labs/frontier-queue';
import type {
  FrontierSwarmJob,
  FrontierSwarmJobResultInput,
  FrontierSwarmPlan,
  FrontierSwarmScheduledJob
} from '@shapeshift-labs/frontier-swarm';
import { writeJsonAtomic } from './common.js';
import {
  createTerminalResultsFromQueue,
  defaultQueueLeaseMs,
  findQueueJobForSwarmJob,
  queueJobId,
  queueJobInput,
  queueName,
  queueResultMetadata,
  readOrCreateQueueState,
  swarmJobIdFromQueueJob,
  terminalSwarmJobIds
} from './queue-runtime-model.js';
import type { FrontierCodexSwarmRunOptions } from './types-run.js';

type QueueJsonObject = Parameters<typeof encodeQueueJsonl>[0][number];

export const FRONTIER_SWARM_CODEX_QUEUE_RUNTIME_KIND = 'frontier.swarm-codex.queue-runtime';
export const FRONTIER_SWARM_CODEX_QUEUE_RUNTIME_VERSION = 1;
export const FRONTIER_SWARM_CODEX_QUEUE_STATE_FILE = 'queue-state.json';
export const FRONTIER_SWARM_CODEX_QUEUE_EVENTS_FILE = 'queue-events.jsonl';
export const FRONTIER_SWARM_CODEX_QUEUE_SUMMARY_FILE = 'queue-summary.json';

export interface FrontierCodexQueueRuntimePaths {
  queueStatePath?: string;
  queueEventsPath?: string;
  queueSummaryPath?: string;
}

export interface FrontierCodexQueueRuntimeSummary {
  kind: typeof FRONTIER_SWARM_CODEX_QUEUE_RUNTIME_KIND;
  version: typeof FRONTIER_SWARM_CODEX_QUEUE_RUNTIME_VERSION;
  enabled: boolean;
  runId: string;
  planId: string;
  queueId: string;
  generatedAt: number;
  paths: FrontierCodexQueueRuntimePaths;
  inspection: ReturnType<typeof inspectQueueState>;
  evidence: ReturnType<typeof createQueueEvidence>;
  terminalOutcomeCount: number;
  eventCount: number;
  activeLeaseCount: number;
  terminalSwarmJobIds: string[];
}

export interface FrontierCodexQueueRuntime {
  state: FrontierQueueState;
  paths: Required<FrontierCodexQueueRuntimePaths>;
  seedTerminalResults(jobs: readonly FrontierSwarmJob[]): FrontierSwarmJobResultInput[];
  leaseScheduledJobs(
    scheduledJobs: readonly FrontierSwarmScheduledJob[],
    jobsById: ReadonlyMap<string, FrontierSwarmJob>,
    count: number
  ): Promise<Array<{ jobId: string; queueJob: FrontierQueueJob }>>;
  settleJob(result: FrontierSwarmJobResultInput): Promise<void>;
  writeSummary(): Promise<FrontierCodexQueueRuntimeSummary>;
}

export function resolveCodexQueueStatePath(input: {
  cwd?: string;
  outDir: string;
  queueStatePath?: string | false;
}): string | undefined {
  if (input.queueStatePath === false) return undefined;
  const base = input.cwd ?? process.cwd();
  return path.resolve(base, input.queueStatePath ?? path.join(input.outDir, FRONTIER_SWARM_CODEX_QUEUE_STATE_FILE));
}

export function resolveCodexQueueEventsPath(input: {
  cwd?: string;
  outDir: string;
  queueStatePath?: string | false;
  queueEventsPath?: string | false;
}): string | undefined {
  if (input.queueStatePath === false || input.queueEventsPath === false) return undefined;
  const base = input.cwd ?? process.cwd();
  return path.resolve(base, input.queueEventsPath ?? path.join(input.outDir, FRONTIER_SWARM_CODEX_QUEUE_EVENTS_FILE));
}

export function resolveCodexQueueSummaryPath(input: {
  cwd?: string;
  outDir: string;
  queueStatePath?: string | false;
  queueSummaryPath?: string | false;
}): string | undefined {
  if (input.queueStatePath === false || input.queueSummaryPath === false) return undefined;
  const base = input.cwd ?? process.cwd();
  return path.resolve(base, input.queueSummaryPath ?? path.join(input.outDir, FRONTIER_SWARM_CODEX_QUEUE_SUMMARY_FILE));
}

export async function createCodexQueueRuntime(
  plan: FrontierSwarmPlan,
  options: FrontierCodexSwarmRunOptions,
  outDir: string
): Promise<FrontierCodexQueueRuntime | undefined> {
  const queueStatePath = resolveCodexQueueStatePath({
    cwd: options.cwd,
    outDir,
    queueStatePath: options.queueStatePath
  });
  if (!queueStatePath) return undefined;
  const queueEventsPath = resolveCodexQueueEventsPath({
    cwd: options.cwd,
    outDir,
    queueStatePath: options.queueStatePath,
    queueEventsPath: options.queueEventsPath
  }) ?? path.join(path.dirname(queueStatePath), FRONTIER_SWARM_CODEX_QUEUE_EVENTS_FILE);
  const queueSummaryPath = resolveCodexQueueSummaryPath({
    cwd: options.cwd,
    outDir,
    queueStatePath: options.queueStatePath,
    queueSummaryPath: options.queueSummaryPath
  }) ?? path.join(path.dirname(queueStatePath), FRONTIER_SWARM_CODEX_QUEUE_SUMMARY_FILE);
  const paths = { queueStatePath, queueEventsPath, queueSummaryPath };
  let state = await readOrCreateQueueState(queueStatePath, plan, options);
  const activeQueueJobs = new Map<string, FrontierQueueJob>();

  const persist = async (mutation?: FrontierQueueMutation): Promise<void> => {
    state = mutation?.state ?? state;
    await fs.mkdir(path.dirname(queueStatePath), { recursive: true });
    await fs.mkdir(path.dirname(queueEventsPath), { recursive: true });
    await writeJsonAtomic(queueStatePath, state);
    await fs.writeFile(queueEventsPath, encodeQueueJsonl(state.events as unknown as QueueJsonObject[]));
    await writeSummary();
  };

  const applyMutation = async (mutation: FrontierQueueMutation): Promise<FrontierQueueMutation> => {
    await persist(mutation);
    return mutation;
  };

  const writeSummary = async (): Promise<FrontierCodexQueueRuntimeSummary> => {
    const summary = createCodexQueueRuntimeSummary(plan, state, paths);
    await fs.mkdir(path.dirname(queueSummaryPath), { recursive: true });
    await writeJsonAtomic(queueSummaryPath, summary);
    return summary;
  };

  state = (await applyMutation(expireQueueLeases(state, { now: Date.now(), reason: 'codex-runtime-start' }))).state;
  state = (await applyMutation(projectQueueTerminalOutcomes(state, { states: [state], now: Date.now(), source: 'frontier-swarm-codex.queue-runtime' }))).state;

  return {
    get state() {
      return state;
    },
    paths,
    seedTerminalResults(jobs: readonly FrontierSwarmJob[]): FrontierSwarmJobResultInput[] {
      return createTerminalResultsFromQueue(plan, state, jobs);
    },
    async leaseScheduledJobs(
      scheduledJobs: readonly FrontierSwarmScheduledJob[],
      jobsById: ReadonlyMap<string, FrontierSwarmJob>,
      count: number
    ): Promise<Array<{ jobId: string; queueJob: FrontierQueueJob }>> {
      const now = Date.now();
      const readyJobs = scheduledJobs
        .slice(0, Math.max(0, count))
        .map((scheduled) => jobsById.get(scheduled.jobId))
        .filter((job): job is FrontierSwarmJob => !!job);
      for (const job of readyJobs) {
        const mutation = enqueueQueueJob(state, queueJobInput(plan, job, options, now), { now });
        await applyMutation(mutation);
      }
      const queueJobIds = readyJobs.map((job) => queueJobId(job));
      if (queueJobIds.length === 0) return [];
      const leased = await applyMutation(leaseQueueJobs(state, {
        queue: queueName(plan),
        workerId: 'frontier-swarm-codex',
        count: queueJobIds.length,
        jobIds: queueJobIds,
        now,
        leaseMs: defaultQueueLeaseMs(plan, options)
      }));
      const out: Array<{ jobId: string; queueJob: FrontierQueueJob }> = [];
      for (const queueJob of leased.jobs ?? []) {
        const jobId = swarmJobIdFromQueueJob(queueJob);
        if (!jobId) continue;
        activeQueueJobs.set(jobId, queueJob);
        out.push({ jobId, queueJob });
      }
      return out;
    },
    async settleJob(result: FrontierSwarmJobResultInput): Promise<void> {
      const queueJob = activeQueueJobs.get(result.jobId) ?? findQueueJobForSwarmJob(state, plan, result.jobId);
      if (!queueJob?.lease?.token) return;
      activeQueueJobs.delete(result.jobId);
      const now = result.finishedAt ?? Date.now();
      const metadata = queueResultMetadata(result);
      const mutation = result.status === 'completed' || result.status === 'verified'
        ? completeQueueJob(state, {
          jobId: queueJob.id,
          leaseToken: queueJob.lease.token,
          workerId: queueJob.lease.owner,
          now,
          metadata
        })
        : failQueueJob(state, {
          jobId: queueJob.id,
          leaseToken: queueJob.lease.token,
          workerId: queueJob.lease.owner,
          now,
          retryable: false,
          reason: String(result.status ?? 'failed'),
          error: {
            type: String(result.status ?? 'failed'),
            message: typeof result.error === 'string' ? result.error : String(result.error ?? result.status ?? 'failed'),
            retryable: false
          },
          metadata
        });
      await applyMutation(mutation);
    },
    writeSummary
  };
}

function createCodexQueueRuntimeSummary(
  plan: FrontierSwarmPlan,
  state: FrontierQueueState,
  paths: Required<FrontierCodexQueueRuntimePaths>
): FrontierCodexQueueRuntimeSummary {
  const inspection = inspectQueueState(state);
  return {
    kind: FRONTIER_SWARM_CODEX_QUEUE_RUNTIME_KIND,
    version: FRONTIER_SWARM_CODEX_QUEUE_RUNTIME_VERSION,
    enabled: true,
    runId: plan.runId,
    planId: plan.id,
    queueId: state.id,
    generatedAt: Date.now(),
    paths,
    inspection,
    evidence: createQueueEvidence(state),
    terminalOutcomeCount: state.terminalOutcomes.length,
    eventCount: state.events.length,
    activeLeaseCount: state.jobs.filter((job) => job.status === 'leased').length,
    terminalSwarmJobIds: terminalSwarmJobIds(plan, state)
  };
}
