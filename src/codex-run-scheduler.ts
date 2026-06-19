import path from 'node:path';
import {
  createSwarmAdaptiveLoadPlan,
  createSwarmLeases,
  createSwarmRun,
  createSwarmSchedule,
  createSwarmScheduleInputFromAdaptiveLoadPlan,
  type FrontierSwarmAdaptiveLoadPlan,
  type FrontierSwarmAdaptiveObservationInput,
  type FrontierSwarmEventStream,
  type FrontierSwarmJob,
  type FrontierSwarmJobResultInput,
  type FrontierSwarmLease,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmPlan
} from '@shapeshift-labs/frontier-swarm';
import { writeJsonAtomic } from './common.js';
import { createCodexResourceScheduledPlan } from './codex-resource-schedule.js';
import { summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { appendFileSwarmEvent } from './codex-events.js';
import { contextBudgetFromCoordinatorJob } from './context-budget.js';
import type {
  FrontierCodexContextBudgetReport,
  FrontierCodexAdaptiveConcurrencyOptions,
  FrontierCodexLogSummary
} from './index.js';

export async function runScheduledJobPool(
  plan: FrontierSwarmPlan,
  input: {
    concurrency: number;
    adaptive?: boolean | FrontierCodexAdaptiveConcurrencyOptions;
    resourceScheduling?: Parameters<typeof createCodexResourceScheduledPlan>[2];
    observations?: readonly FrontierSwarmAdaptiveObservationInput[];
    outDir?: string;
    eventStream?: FrontierSwarmEventStream;
  },
  worker: (job: FrontierSwarmJob, lease: FrontierSwarmLease) => Promise<FrontierSwarmJobResultInput>
): Promise<FrontierSwarmJobResultInput[]> {
  const concurrency = Math.max(1, Math.floor(input.concurrency));
  const adaptiveOptions = normalizeAdaptiveConcurrencyOptions(input.adaptive, concurrency);
  const resourceSchedule = createCodexResourceScheduledPlan(plan, concurrency, input.resourceScheduling);
  const results: FrontierSwarmJobResultInput[] = [];
  const active = new Map<string, Promise<FrontierSwarmJobResultInput>>();
  const leases: FrontierSwarmLease[] = [];
  const completed = new Set<string>();
  const resultByJob = new Map<string, FrontierSwarmJobResultInput>();
  const adaptiveHistory: FrontierSwarmAdaptiveLoadPlan[] = [];
  let currentAdaptiveLimits: FrontierSwarmAdaptiveLoadPlan['effectiveLimits'] | undefined;
  while (resultByJob.size < plan.jobs.length) {
    const run = createSwarmRun({ plan: resourceSchedule.plan, status: 'running', results });
    run.jobs = run.jobs.map((job) => active.has(job.id) ? { ...job, status: 'running' } : job);
    const adaptivePlan = adaptiveOptions.enabled ? createSwarmAdaptiveLoadPlan({
      plan: resourceSchedule.plan,
      run,
      mode: adaptiveOptions.mode,
      maxLimits: { maxReadyJobs: adaptiveOptions.maxConcurrency, ...resourceSchedule.limits },
      minLimits: { maxReadyJobs: adaptiveOptions.minConcurrency },
      currentLimits: currentAdaptiveLimits ?? { maxReadyJobs: adaptiveOptions.maxConcurrency, ...resourceSchedule.limits },
      observations: [...(input.observations ?? []), ...createCodexAdaptiveObservations(results)]
    }) : undefined;
    if (adaptivePlan) {
      currentAdaptiveLimits = adaptivePlan.effectiveLimits;
      adaptiveHistory.push(adaptivePlan);
      if (adaptiveOptions.writePlan !== false && input.outDir) {
        await writeJsonAtomic(path.join(input.outDir, 'adaptive-load.json'), {
          latest: adaptivePlan,
          history: adaptiveHistory.slice(-50)
        }).catch(() => {});
      }
      await appendFileSwarmEvent(input.eventStream, {
        type: 'swarm.adaptive-load',
        runId: run.id,
        data: {
          mode: adaptivePlan.mode,
          effectiveMaxReadyJobs: adaptivePlan.effectiveLimits.maxReadyJobs,
          bottleneckCount: adaptivePlan.summary.bottleneckCount,
          decisions: adaptivePlan.decisions.map((decision: FrontierSwarmAdaptiveLoadPlan['decisions'][number]) => ({
            action: decision.action,
            target: decision.target,
            key: decision.key,
            previous: decision.previous,
            next: decision.next,
            reason: decision.reason
          }))
        }
      });
    }
    const effectiveConcurrency = Math.max(1, Math.min(concurrency, adaptivePlan?.effectiveLimits.maxReadyJobs ?? concurrency));
    const readyWindow = Math.max(0, effectiveConcurrency - active.size);
    const schedule = createSwarmSchedule({
      ...(adaptivePlan
        ? createSwarmScheduleInputFromAdaptiveLoadPlan(resourceSchedule.plan, adaptivePlan, { run })
        : { plan: resourceSchedule.plan, run, ...resourceSchedule.limits }),
      maxReadyJobs: readyWindow
    });
    const nextLeases = createSwarmLeases({
      schedule,
      workerId: 'frontier-swarm-codex',
      count: readyWindow,
      existingLeases: leases
    });
    for (const lease of nextLeases) {
      const job = resourceSchedule.plan.jobs.find((entry) => entry.id === lease.jobId);
      if (!job || active.has(job.id) || completed.has(job.id)) continue;
      leases.push(lease);
      active.set(job.id, worker(job, lease));
    }
    if (active.size === 0) {
      for (const blocked of schedule.blocked) {
        if (resultByJob.has(blocked.jobId)) continue;
        const result: FrontierSwarmJobResultInput = {
          jobId: blocked.jobId,
          status: 'blocked',
          startedAt: Date.now(),
          finishedAt: Date.now(),
          error: blocked.reasons.join(', '),
          metadata: { waitingFor: blocked.waitingFor, reasons: blocked.reasons }
        };
        results.push(result);
        resultByJob.set(result.jobId, result);
      }
      break;
    }
    const settled = await Promise.race(Array.from(active.entries()).map(async ([jobId, promise]) => ({ jobId, result: await promise })));
    active.delete(settled.jobId);
    completed.add(settled.jobId);
    results.push(settled.result);
    resultByJob.set(settled.jobId, settled.result);
  }
  return plan.jobs.map((job) => resultByJob.get(job.id)).filter((result): result is FrontierSwarmJobResultInput => !!result);
}

function normalizeAdaptiveConcurrencyOptions(
  input: boolean | FrontierCodexAdaptiveConcurrencyOptions | undefined,
  maxConcurrency: number
): Required<Pick<FrontierCodexAdaptiveConcurrencyOptions, 'enabled' | 'mode' | 'minConcurrency' | 'maxConcurrency' | 'writePlan'>> {
  if (input === false || input === undefined) {
    return { enabled: false, mode: 'balanced', minConcurrency: 1, maxConcurrency, writePlan: true };
  }
  if (input === true) {
    return { enabled: true, mode: 'balanced', minConcurrency: 1, maxConcurrency, writePlan: true };
  }
  return {
    enabled: input.enabled ?? true,
    mode: input.mode ?? 'balanced',
    minConcurrency: Math.max(1, Math.min(maxConcurrency, Math.floor(input.minConcurrency ?? 1))),
    maxConcurrency: Math.max(1, Math.min(maxConcurrency, Math.floor(input.maxConcurrency ?? maxConcurrency))),
    writePlan: input.writePlan ?? true
  };
}

function createCodexAdaptiveObservations(results: readonly FrontierSwarmJobResultInput[]): FrontierSwarmAdaptiveObservationInput[] {
  const observations: FrontierSwarmAdaptiveObservationInput[] = [];
  for (const result of results) {
    const metadata = result.metadata && typeof result.metadata === 'object' ? result.metadata as {
      logSummary?: FrontierCodexLogSummary;
      semanticImport?: FrontierSwarmMergeBundle['semanticImport'];
      contextBudget?: FrontierCodexContextBudgetReport;
    } : {};
    const logSummary = metadata.logSummary;
    if (logSummary && (logSummary.eventBytesTruncated > 0 || logSummary.stderrBytesTruncated > 0 || logSummary.eventBytes > 1_000_000 || logSummary.stderrBytes > 256_000)) {
      observations.push({
        kind: 'log-noise',
        severity: logSummary.eventBytesTruncated > 0 || logSummary.stderrBytesTruncated > 0 ? 'warning' : 'info',
        jobId: result.jobId,
        value: logSummary.eventBytes + logSummary.stderrBytes,
        reason: 'worker output exceeded compact log threshold',
        metadata: logSummary
      });
    }
    if (result.mergeDisposition === 'stale-against-head') {
      observations.push({ kind: 'stale-patch', severity: 'warning', jobId: result.jobId, reason: 'worker result is stale against head' });
    }
    if (result.mergeDisposition === 'discovery-only' || result.mergeReadiness === 'discovery-only') {
      observations.push({ kind: 'discovery-only-output', severity: 'info', jobId: result.jobId, reason: 'worker produced discovery-only output' });
    }
    const contextBudget = metadata.contextBudget ?? contextBudgetFromCoordinatorJob(result);
    if (contextBudget?.status === 'failed') {
      observations.push({ kind: 'context-budget-failed', severity: 'warning', jobId: result.jobId, reasons: contextBudget.errors, metadata: contextBudget });
    } else if (contextBudget?.status === 'warning') {
      observations.push({ kind: 'context-budget-warning', severity: 'info', jobId: result.jobId, reasons: contextBudget.warnings, metadata: contextBudget });
    }
    const semanticQuality = summarizeCodexSemanticImportQuality(result.semanticImport ?? metadata.semanticImport, false);
    if (semanticQuality.present && semanticQuality.empty) {
      observations.push({ kind: 'semantic-empty', severity: 'warning', jobId: result.jobId, reason: 'worker semantic sidecar is empty' });
    } else if (semanticQuality.present && semanticQuality.warnings.length > 0) {
      observations.push({ kind: 'semantic-weak', severity: 'info', jobId: result.jobId, reasons: semanticQuality.warnings });
    }
  }
  return observations;
}
