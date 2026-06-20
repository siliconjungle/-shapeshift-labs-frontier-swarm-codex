import { uniqueStrings } from './common.js';
import {
  averageJobMetric,
  qualityMetricPoint,
  sampleJobIds,
  sampleQualityStrings,
  ratio,
  maxJobMetric
} from './dashboard-ui-metric-utils.js';
import type {
  FrontierCodexDashboardHealthMetrics,
  FrontierCodexDashboardHealthStatus,
  FrontierCodexDashboardJob,
  FrontierCodexDashboardSemanticReadiness
} from './types-dashboard.js';

export function createDashboardHealthMetrics(jobs: readonly FrontierCodexDashboardJob[]): FrontierCodexDashboardHealthMetrics {
  const healthyJobs = jobs.filter((job) => job.health === 'healthy');
  const warningJobs = jobs.filter((job) => job.health === 'warning');
  const failedJobs = jobs.filter((job) => job.health === 'failed');
  const blockedJobs = jobs.filter((job) => job.health === 'blocked');
  const runningJobs = jobs.filter((job) => job.health === 'running');
  const unknownJobs = jobs.filter((job) => job.health === 'unknown');
  const terminalJobs = jobs.filter(isDashboardTerminalJob);
  const readyToApplyJobs = jobs.filter((job) => job.bucket === 'ready-to-apply' || job.disposition === 'ready-to-apply');
  const contextWarningJobs = jobs.filter(isDashboardContextBudgetWarningJob);
  const contextFailedJobs = jobs.filter(isDashboardContextBudgetFailedJob);
  const semanticCleanJobs = jobs.filter((job) => job.semanticReadiness === 'clean');
  const semanticCandidateJobs = jobs.filter((job) => job.semanticReadiness === 'candidate');
  const semanticBlockedJobs = jobs.filter((job) => job.semanticReadiness === 'blocked');
  const semanticUnknownJobs = jobs.filter((job) => job.semanticReadiness === 'unknown');
  const durationJobs = jobs.filter((job) => job.durationMs > 0);
  const failedOrBlockedCount = failedJobs.length + blockedJobs.length;
  const status: FrontierCodexDashboardHealthStatus = failedJobs.length > 0
    ? 'failed'
    : blockedJobs.length > 0
      ? 'blocked'
      : warningJobs.length > 0
        ? 'warning'
        : runningJobs.length > 0
          ? 'running'
          : unknownJobs.length === jobs.length && jobs.length > 0 ? 'unknown' : 'healthy';
  return {
    status,
    summary: {
      jobCount: jobs.length,
      healthyJobCount: healthyJobs.length,
      warningJobCount: warningJobs.length,
      failedJobCount: failedJobs.length,
      blockedJobCount: blockedJobs.length,
      runningJobCount: runningJobs.length,
      unknownJobCount: unknownJobs.length,
      terminalJobCount: terminalJobs.length,
      readyToApplyJobCount: readyToApplyJobs.length,
      notReadyToApplyJobCount: Math.max(0, jobs.length - readyToApplyJobs.length),
      contextWarningJobCount: contextWarningJobs.length,
      contextFailedJobCount: contextFailedJobs.length,
      semanticCleanJobCount: semanticCleanJobs.length,
      semanticCandidateJobCount: semanticCandidateJobs.length,
      semanticBlockedJobCount: semanticBlockedJobs.length,
      semanticUnknownJobCount: semanticUnknownJobs.length,
      durationMs: durationJobs.reduce((sum, job) => sum + job.durationMs, 0),
      averageDurationMs: averageJobMetric(durationJobs, (job) => job.durationMs),
      maxDurationMs: maxJobMetric(durationJobs, (job) => job.durationMs),
      actualInputTokens: jobs.reduce((sum, job) => sum + job.actualInputTokens, 0),
      cachedInputTokens: jobs.reduce((sum, job) => sum + job.cachedInputTokens, 0),
      uncachedInputTokens: jobs.reduce((sum, job) => sum + job.uncachedInputTokens, 0),
      failureRatio: ratio(failedOrBlockedCount, jobs.length),
      completionRatio: ratio(terminalJobs.length, jobs.length)
    },
    points: [
      qualityMetricPoint('healthy', 'Healthy', healthyJobs.length, { jobCount: healthyJobs.length, jobIds: sampleJobIds(healthyJobs) }),
      qualityMetricPoint('warning', 'Warning', warningJobs.length, { jobCount: warningJobs.length, jobIds: sampleJobIds(warningJobs) }),
      qualityMetricPoint('failed', 'Failed', failedJobs.length, { jobCount: failedJobs.length, jobIds: sampleJobIds(failedJobs) }),
      qualityMetricPoint('blocked', 'Blocked', blockedJobs.length, { jobCount: blockedJobs.length, jobIds: sampleJobIds(blockedJobs) }),
      qualityMetricPoint('running', 'Running', runningJobs.length, { jobCount: runningJobs.length, jobIds: sampleJobIds(runningJobs) }),
      qualityMetricPoint('semantic:clean', 'Semantic clean', semanticCleanJobs.length, { jobCount: semanticCleanJobs.length, jobIds: sampleJobIds(semanticCleanJobs) }),
      qualityMetricPoint('semantic:candidate', 'Semantic candidate', semanticCandidateJobs.length, { jobCount: semanticCandidateJobs.length, jobIds: sampleJobIds(semanticCandidateJobs) }),
      qualityMetricPoint('semantic:blocked', 'Semantic blocked', semanticBlockedJobs.length, { jobCount: semanticBlockedJobs.length, jobIds: sampleJobIds(semanticBlockedJobs) }),
      qualityMetricPoint('context:warning', 'Context warning', contextWarningJobs.length, { jobCount: contextWarningJobs.length, jobIds: sampleJobIds(contextWarningJobs), warnings: sampleQualityStrings(contextWarningJobs.flatMap((job) => job.contextBudgetWarnings)) }),
      qualityMetricPoint('context:failed', 'Context failed', contextFailedJobs.length, { jobCount: contextFailedJobs.length, jobIds: sampleJobIds(contextFailedJobs), errors: sampleQualityStrings(contextFailedJobs.flatMap((job) => job.contextBudgetErrors)) })
    ]
  };
}

export function isDashboardFailureJob(job: FrontierCodexDashboardJob): boolean {
  if (job.bucket === 'rerun-work') return false;
  return isDashboardFailedEvidenceJob(job)
    || isDashboardBlockedJob(job)
    || isDashboardContextBudgetFailedJob(job)
    || job.sourceOwnershipViolationCount > 0
    || job.quarantinedChangedPathCount > 0;
}

export function dashboardJobHealth(job: FrontierCodexDashboardJob): FrontierCodexDashboardHealthStatus {
  if (job.status === 'running') return 'running';
  if (job.bucket === 'rerun-work') return 'warning';
  if (isDashboardFailedEvidenceJob(job)) return 'failed';
  if (isDashboardBlockedJob(job)) return 'blocked';
  if (isDashboardContextBudgetFailedJob(job)) return 'failed';
  if (job.sourceOwnershipViolationCount > 0 || job.quarantinedChangedPathCount > 0) return 'failed';
  if (isDashboardContextBudgetWarningJob(job) || isDashboardNeedsPortJob(job) || isDashboardStaleJob(job)) return 'warning';
  if (job.semanticReadiness === 'blocked' || job.semanticReadiness === 'needs-port' || job.semanticReadiness === 'stale') return 'warning';
  if (job.bucket === 'ready-to-apply' || job.disposition === 'ready-to-apply' || job.status === 'completed') return 'healthy';
  return 'unknown';
}

export function dashboardSemanticReadiness(input: {
  semanticAdmissionStatus?: string;
  semanticAutoMergeCandidate: boolean;
  semanticCleanEligible: boolean;
  disposition?: string;
  reasons: readonly string[];
}): FrontierCodexDashboardSemanticReadiness {
  const status = input.semanticAdmissionStatus ?? '';
  const haystack = [status, input.disposition ?? '', ...input.reasons].join(' ').toLowerCase();
  if (input.semanticAutoMergeCandidate && input.semanticCleanEligible) return 'clean';
  if (input.semanticAutoMergeCandidate || status === 'auto-merge-candidate') return 'candidate';
  if (haystack.includes('needs-port')) return 'needs-port';
  if (haystack.includes('stale')) return 'stale';
  if (haystack.includes('blocked') || haystack.includes('conflict')) return 'blocked';
  return 'unknown';
}

export function isDashboardTerminalJob(job: FrontierCodexDashboardJob): boolean {
  return job.finishedAt !== undefined
    || (job.generatedAt !== undefined && Boolean(job.bucket))
    || ['completed', 'failed', 'blocked', 'cancelled', 'canceled', 'timed-out', 'timeout'].includes(job.status ?? '')
    || ['rejected', 'blocked', 'needs-port', 'stale-against-head'].includes(job.disposition ?? '');
}

export function isDashboardBlockedJob(job: FrontierCodexDashboardJob): boolean {
  return job.status === 'blocked' || job.disposition === 'blocked';
}

export function isDashboardFailedEvidenceJob(job: FrontierCodexDashboardJob): boolean {
  if (job.status === 'failed') return true;
  if (job.bucket === 'failed-evidence' || job.disposition === 'failed-evidence') return true;
  if (job.disposition !== 'rejected') return false;
  return dashboardFailureReasonTokens(job.reasons, job.collectReasonClasses).length > 0;
}

export function dashboardRecordIndicatesFailedEvidence(job: Record<string, unknown>, stringListValue: (value: unknown) => string[]): boolean {
  const disposition = typeof job.disposition === 'string' ? job.disposition : undefined;
  const status = typeof job.status === 'string' ? job.status : undefined;
  if (status === 'failed' || disposition === 'failed-evidence') return true;
  if (disposition !== 'rejected') return false;
  return dashboardFailureReasonTokens(stringListValue(job.reasons), stringListValue(job.collectReasonClasses)).length > 0;
}

export function hasDashboardContextLoad(job: FrontierCodexDashboardJob): boolean {
  return job.promptBytes > 0 || job.estimatedInputTokens > 0 || job.actualInputTokens > 0 || job.cachedInputTokens > 0 || job.uncachedInputTokens > 0 || job.outputTokens > 0;
}

export function hasDashboardCostSignal(job: FrontierCodexDashboardJob): boolean {
  return job.estimatedInputTokens > 0 || job.actualInputTokens > 0 || job.billableInputTokens > 0 || job.outputTokens > 0;
}

export function hasDashboardLogVolume(job: FrontierCodexDashboardJob): boolean {
  return job.eventBytes > 0 || job.eventBytesTruncated > 0 || job.stderrBytes > 0 || job.stderrBytesTruncated > 0;
}

export function isDashboardNeedsPortJob(job: FrontierCodexDashboardJob): boolean {
  return job.bucket === 'needs-human-port' || job.disposition === 'needs-port';
}

export function isDashboardStaleJob(job: FrontierCodexDashboardJob): boolean {
  return job.bucket === 'stale-against-head' || job.disposition === 'stale-against-head' || job.reasons.includes('stale-against-head');
}

export function hasDashboardContextBudget(job: FrontierCodexDashboardJob): boolean {
  return Boolean(job.contextBudgetStatus) || job.contextBudgetWarningCount > 0 || job.contextBudgetErrorCount > 0 || job.promptBytes > 0 || job.estimatedInputTokens > 0 || job.actualInputTokens > 0;
}

export function isDashboardContextBudgetWarningJob(job: FrontierCodexDashboardJob): boolean {
  return job.contextBudgetStatus === 'warning' || job.contextBudgetWarningCount > 0 && !isDashboardContextBudgetFailedJob(job);
}

export function isDashboardContextBudgetFailedJob(job: FrontierCodexDashboardJob): boolean {
  return job.contextBudgetStatus === 'failed' || job.contextBudgetErrorCount > 0;
}

function dashboardFailureReasonTokens(...groups: readonly string[][]): string[] {
  const tokens = uniqueStrings(groups.flat()).map((token) => token.toLowerCase());
  return tokens.filter((token) => token === 'failed' || token === 'failed-evidence' || token === 'failed-or-invalid-evidence' ||
    token === 'failed-verification' || token === 'no-source-changes' || token === 'worker-error' || token === 'generated-failed-evidence' ||
    token === 'patch-missing' || token === 'bundle-missing' || token === 'malformed-patch' || token === 'patch-apply-failed' ||
    token === 'source-blocker' || token.startsWith('worker-exit-nonzero:') || token.startsWith('worker-signal:') ||
    token.startsWith('ownership-violation:') || token.startsWith('generated-failed-evidence:') || token.startsWith('verification-failed:'));
}
