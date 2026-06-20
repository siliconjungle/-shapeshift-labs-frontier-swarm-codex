import type {
  QueryCleanupSignal,
  QueryCleanupStatus,
  QueryContextBudget,
  QueryHealthStatus,
  QueryOwnershipSignal,
  QueryOwnershipStatus,
  QuerySemanticReadinessStatus
} from './query-signal-types.js';
import { normalizeMetricKey } from './query-values.js';

export function aggregateHealthStatus(statusCounts: Record<string, number>, total: number): QueryHealthStatus {
  if ((statusCounts.failed ?? 0) > 0) return 'failed';
  if ((statusCounts.blocked ?? 0) > 0) return 'blocked';
  if ((statusCounts.warning ?? 0) > 0) return 'warning';
  if ((statusCounts.running ?? 0) > 0) return 'running';
  if ((statusCounts.unknown ?? 0) === total && total > 0) return 'unknown';
  return 'healthy';
}

export function healthMatches(actual: QueryHealthStatus, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  if (wanted === actual) return true;
  if (wanted === 'ok') return actual === 'healthy';
  if (wanted === 'warn') return actual === 'warning';
  if (wanted === 'failure') return actual === 'failed';
  if (wanted === 'unhealthy' || wanted === 'attention') return actual === 'warning' || actual === 'failed' || actual === 'blocked';
  return false;
}

export function pressureMatches(budget: QueryContextBudget, job: Record<string, unknown>, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  const warning = budget.status === 'warning' || budget.warnings.length > 0;
  const failed = budget.status === 'failed' || budget.errors.length > 0;
  if (wanted === 'context') return budget.hasBudget;
  if (wanted === 'context-warning' || wanted === 'warning' || wanted === 'warn') return warning;
  if (wanted === 'context-failed' || wanted === 'failed' || wanted === 'failure') return failed;
  if (wanted === 'token' || wanted === 'tokens' || wanted === 'actual-usage') return budget.actualInputTokens > 0 || budget.estimatedInputTokens > 0;
  if (wanted === 'uncached') return budget.uncachedInputTokens > 0;
  if (wanted === 'prompt') return budget.promptBytes > 0;
  if (wanted === 'high') return warning || failed || budget.uncachedInputTokens > 0;
  if (wanted === 'time' || wanted === 'running') return job.liveness === 'running' || job.status === 'running';
  if (wanted === 'none') return !budget.hasBudget && job.liveness !== 'running' && job.status !== 'running';
  return warning && budget.warnings.some((entry) => normalizeMetricKey(entry).includes(wanted));
}

export function semanticReadinessMatches(actual: QuerySemanticReadinessStatus, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  if (wanted === actual) return true;
  if (wanted === 'ready') return actual === 'clean' || actual === 'candidate';
  if (wanted === 'attention') return actual === 'review-required' || actual === 'needs-port' || actual === 'stale' || actual === 'blocked';
  if (wanted === 'review') return actual === 'review-required';
  return false;
}

export function cleanupMatches(signal: QueryCleanupSignal, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  if (wanted === signal.status) return true;
  if (wanted === 'attention' || wanted === 'cleanup' || wanted === 'cleanup-needed') return signal.status !== 'clean';
  if (wanted === 'ignored-changed-paths' || wanted === 'ignored-paths') return signal.ignoredChangedPathCount > 0;
  if (wanted === 'generated-changed-paths' || wanted === 'generated-paths' || wanted === 'build-output') return signal.generatedChangedPathCount > 0;
  if (wanted === 'quarantine' || wanted === 'quarantined-changes') return signal.quarantinedChangedPathCount > 0;
  if (wanted === 'observed') return signal.observedChangedPathCount > 0;
  if (wanted === 'reported') return signal.reportedChangedPathCount > 0;
  return false;
}

export function ownershipMatches(signal: QueryOwnershipSignal, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  if (wanted === signal.status) return true;
  if (wanted === 'attention' || wanted === 'violation' || wanted === 'violations') return signal.violationCount > 0;
  if (wanted === 'source' || wanted === 'source-violation' || wanted === 'source-violations' || wanted === 'strict-write-isolation') return signal.sourceViolationCount > 0;
  if (wanted === 'ignored' || wanted === 'ignored-violation' || wanted === 'ignored-violations') return signal.ignoredViolationCount > 0;
  return false;
}

export function aggregateCleanupStatus(statusCounts: Record<string, number>, total: number): QueryCleanupStatus {
  if ((statusCounts.quarantined ?? 0) > 0) return 'quarantined';
  if ((statusCounts.generated ?? 0) > 0) return 'generated';
  if ((statusCounts.ignored ?? 0) > 0) return 'ignored';
  if (total > 0) return 'clean';
  return 'clean';
}

export function aggregateOwnershipStatus(statusCounts: Record<string, number>, total: number): QueryOwnershipStatus {
  if ((statusCounts.violation ?? 0) > 0) return 'violation';
  if ((statusCounts.ignored ?? 0) > 0) return 'ignored';
  if (total > 0) return 'clean';
  return 'clean';
}
