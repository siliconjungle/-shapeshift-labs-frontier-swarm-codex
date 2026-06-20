import { isObject, nonNegativeNumber, readStringArray, uniqueStrings } from './common.js';
import { jobSemanticEditAdmission, jobSemanticEditProjection, jobSemanticEditScript } from './query-semantic-edit.js';
import { jobSemanticEditReplay } from './query-semantic-edit-replay.js';
import {
  canonicalGeneratedChangedPath,
  isNumberRecord,
  stringList,
  testsPassed
} from './query-values.js';
import type { QueryCleanupSignal, QueryContextBudget, QueryHealthStatus, QueryOwnershipSignal, QuerySemanticReadinessStatus } from './query-signal-types.js';

export function jobHealth(job: Record<string, unknown>): QueryHealthStatus {
  const status = String(job.status ?? '').toLowerCase();
  const liveness = String(job.liveness ?? '').toLowerCase();
  const disposition = String(job.disposition ?? '').toLowerCase();
  const contextBudget = jobContextBudget(job);
  if (status === 'running' || liveness === 'running') return 'running';
  if (status === 'rerun-work' || disposition === 'rerun-work' || disposition === 'ownership-rescope') return 'warning';
  if (jobIndicatesFailedEvidence(job)) return 'failed';
  if (status === 'blocked' || disposition === 'blocked' || job.mergeReadiness === 'blocked') return 'blocked';
  if (!testsPassed(job) || contextBudget.status === 'failed' || contextBudget.errors.length > 0 || readStringArray(job.ownershipViolations).length > 0) return 'failed';
  if (
    contextBudget.status === 'warning' ||
    contextBudget.warnings.length > 0 ||
    disposition === 'needs-port' ||
    disposition === 'stale-against-head' ||
    Boolean(job.staleAgainstHead) ||
    ['blocked', 'needs-port', 'stale', 'review-required'].includes(jobSemanticReadinessStatus(job))
  ) return 'warning';
  if (status || liveness) return 'healthy';
  return 'unknown';
}

export function evidenceHealth(entry: Record<string, unknown>): QueryHealthStatus {
  const status = String(entry.status ?? '').toLowerCase();
  const budget = evidenceContextBudget(entry);
  if (status === 'failed-evidence' || budget.status === 'failed' || budget.errors.length > 0) return 'failed';
  if (status === 'blocked') return 'blocked';
  if (status === 'needs-human-port' || status === 'rerun-work' || status === 'stale-against-head' || budget.status === 'warning' || budget.warnings.length > 0) return 'warning';
  if (status) return 'healthy';
  return 'unknown';
}

export function jobSemanticReadinessStatus(job: Record<string, unknown>): QuerySemanticReadinessStatus {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  const admission = isObject(jobSemanticEditAdmission(job)) ? jobSemanticEditAdmission(job) as Record<string, unknown> : {};
  const script = isObject(jobSemanticEditScript(job)) ? jobSemanticEditScript(job) as Record<string, unknown> : {};
  const projection = isObject(jobSemanticEditProjection(job)) ? jobSemanticEditProjection(job) as Record<string, unknown> : {};
  const replay = isObject(jobSemanticEditReplay(job)) ? jobSemanticEditReplay(job) as Record<string, unknown> : {};
  if (Boolean(job.staleAgainstHead) || job.disposition === 'stale-against-head' || nonNegativeNumber(replay.stale) > 0 || nonNegativeNumber(script.stale) > 0) return 'stale';
  if (
    quality.expected === true && quality.expectedSatisfied === false ||
    nonNegativeNumber(quality.proofSpecFailedObligations) > 0 ||
    nonNegativeNumber(replay.conflicts) > 0 ||
    nonNegativeNumber(script.conflicts) > 0 ||
    nonNegativeNumber(replay.blocked) > 0 ||
    nonNegativeNumber(script.blocked) > 0 ||
    nonNegativeNumber(projection.blocked) > 0 ||
    String(admission.status ?? '').includes('blocked')
  ) return 'blocked';
  if (job.disposition === 'needs-port' || nonNegativeNumber(replay.needsPort) > 0 || nonNegativeNumber(script.needsPort) > 0) return 'needs-port';
  if (admission.cleanEligible === true || nonNegativeNumber(replay.acceptedClean) > 0) return 'clean';
  if (admission.autoMergeCandidate === true || nonNegativeNumber(script.autoMergeCandidates) > 0 || nonNegativeNumber(script.portable) > 0 || nonNegativeNumber(script.autoApplyCandidates) > 0) return 'candidate';
  if (typeof admission.status === 'string' || readStringArray(quality.warnings).length > 0) return 'review-required';
  return 'unknown';
}

export function evidenceSemanticReadinessStatus(entry: Record<string, unknown>): QuerySemanticReadinessStatus {
  const facets = isObject(entry.facets) ? entry.facets : {};
  if (facets.staleAgainstHead === true || entry.status === 'stale-against-head' || nonNegativeNumber(facets.semanticEditReplayStale) > 0) return 'stale';
  if (
    facets.semanticExpected === true && facets.semanticExpectedSatisfied === false ||
    nonNegativeNumber(facets.proofSpecFailedObligations) > 0 ||
    nonNegativeNumber(facets.semanticEditReplayConflicts) > 0 ||
    nonNegativeNumber(facets.semanticEditReplayBlocked) > 0 ||
    nonNegativeNumber(facets.semanticEditProjectionBlocked) > 0
  ) return 'blocked';
  if (entry.status === 'needs-human-port' || nonNegativeNumber(facets.semanticEditReplayNeedsPort) > 0 || nonNegativeNumber(facets.semanticEditScriptNeedsPort) > 0) return 'needs-port';
  if (facets.semanticEditAdmissionCleanEligible === true || String(facets.semanticEditAdmissionCleanEligible) === 'true' || nonNegativeNumber(facets.semanticEditReplayAcceptedClean) > 0) return 'clean';
  if (facets.semanticEditAdmissionAutoMergeCandidate === true || String(facets.semanticEditAdmissionAutoMergeCandidate) === 'true' || nonNegativeNumber(facets.semanticEditScriptAutoMergeCandidates) > 0) return 'candidate';
  if (typeof facets.semanticEditAdmissionStatus === 'string' || nonNegativeNumber(facets.semanticWarningCount) > 0) return 'review-required';
  return 'unknown';
}

export function jobContextBudget(job: Record<string, unknown>): QueryContextBudget {
  const budget = isObject(job.contextBudget) ? job.contextBudget : {};
  const measured = isObject(budget.measured) ? budget.measured : {};
  const usage = isObject(budget.usage) ? budget.usage : {};
  const actualInputTokens = nonNegativeNumber(usage.inputTokens) || nonNegativeNumber(measured.actualInputTokens);
  const cachedInputTokens = nonNegativeNumber(usage.cachedInputTokens);
  const uncachedInputTokens = nonNegativeNumber(usage.uncachedInputTokens) || Math.max(0, actualInputTokens - cachedInputTokens);
  return {
    status: typeof budget.status === 'string' ? budget.status : undefined,
    warnings: stringList(budget.warnings),
    errors: stringList(budget.errors),
    promptBytes: nonNegativeNumber(measured.promptBytes),
    estimatedInputTokens: nonNegativeNumber(measured.estimatedInputTokens),
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens: nonNegativeNumber(usage.outputTokens),
    hasBudget: isObject(job.contextBudget)
  };
}

export function evidenceContextBudget(entry: Record<string, unknown>): QueryContextBudget {
  const facets = isObject(entry.facets) ? entry.facets : {};
  const actualInputTokens = nonNegativeNumber(facets.contextBudgetActualInputTokens);
  const cachedInputTokens = nonNegativeNumber(facets.contextBudgetCachedInputTokens);
  const uncachedInputTokens = nonNegativeNumber(facets.contextBudgetUncachedInputTokens) || Math.max(0, actualInputTokens - cachedInputTokens);
  return {
    status: typeof facets.contextBudgetStatus === 'string' ? facets.contextBudgetStatus : undefined,
    warnings: stringList(facets.contextBudgetWarnings),
    errors: stringList(facets.contextBudgetErrors),
    promptBytes: nonNegativeNumber(facets.contextBudgetPromptBytes),
    estimatedInputTokens: nonNegativeNumber(facets.contextBudgetEstimatedInputTokens),
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens: 0,
    hasBudget: hasEvidenceContextBudget(facets)
  };
}

export function jobCleanupSignal(job: Record<string, unknown>): QueryCleanupSignal {
  const metadata = isObject(job.metadata) ? job.metadata : {};
  const quarantine = isObject(metadata.workspacePatchQuarantine) ? metadata.workspacePatchQuarantine : {};
  const changedPaths = readStringArray(job.changedPaths);
  const ignoredPaths = uniqueStrings([...readStringArray(job.ignoredChangedPaths), ...readStringArray(job.ignoredChangedPathSamples)]);
  const quarantinedPaths = uniqueStrings([...readStringArray(job.quarantinedChangedPaths), ...readStringArray(quarantine.quarantinedChangedPaths)]);
  const generatedPaths = uniqueStrings([...changedPaths, ...ignoredPaths, ...quarantinedPaths].map(canonicalGeneratedChangedPath).filter((entry): entry is string => Boolean(entry)));
  const ignoredChangedPathCount = nonNegativeNumber(job.ignoredChangedPathCount) || ignoredPaths.length;
  const quarantinedChangedPathCount = nonNegativeNumber(job.quarantinedChangedPathCount) || quarantinedPaths.length;
  const generatedChangedPathCount = Math.max(nonNegativeNumber(job.generatedChangedPathCount), generatedPaths.length);
  return {
    status: quarantinedChangedPathCount > 0 ? 'quarantined' : generatedChangedPathCount > 0 ? 'generated' : ignoredChangedPathCount > 0 ? 'ignored' : 'clean',
    ignoredChangedPathCount,
    generatedChangedPathCount,
    quarantinedChangedPathCount,
    observedChangedPathCount: nonNegativeNumber(job.observedChangedPathCount),
    reportedChangedPathCount: nonNegativeNumber(job.reportedChangedPathCount),
    ignoredChangedPathReasonCounts: isNumberRecord(job.ignoredChangedPathReasonCounts) ? job.ignoredChangedPathReasonCounts : {}
  };
}

export function evidenceCleanupSignal(entry: Record<string, unknown>): QueryCleanupSignal {
  const facets = isObject(entry.facets) ? entry.facets : {};
  const ignoredChangedPathCount = nonNegativeNumber(facets.ignoredChangedPathCount);
  const generatedChangedPathCount = nonNegativeNumber(facets.generatedChangedPathCount);
  const quarantinedChangedPathCount = nonNegativeNumber(facets.quarantinedChangedPathCount);
  return {
    status: quarantinedChangedPathCount > 0 ? 'quarantined' : generatedChangedPathCount > 0 ? 'generated' : ignoredChangedPathCount > 0 ? 'ignored' : 'clean',
    ignoredChangedPathCount,
    generatedChangedPathCount,
    quarantinedChangedPathCount,
    observedChangedPathCount: nonNegativeNumber(facets.observedChangedPathCount),
    reportedChangedPathCount: nonNegativeNumber(facets.reportedChangedPathCount),
    ignoredChangedPathReasonCounts: isNumberRecord(facets.ignoredChangedPathReasonCounts) ? facets.ignoredChangedPathReasonCounts : {}
  };
}

export function jobOwnershipSignal(job: Record<string, unknown>): QueryOwnershipSignal {
  const ownershipViolations = readStringArray(job.ownershipViolations);
  const sourceOwnershipViolations = readStringArray(job.sourceOwnershipViolations);
  const ignoredOwnershipViolations = readStringArray(job.ignoredOwnershipViolations);
  const ignoredViolationCount = nonNegativeNumber(job.ignoredOwnershipViolationCount) || ignoredOwnershipViolations.length;
  const violationCount = nonNegativeNumber(job.ownershipViolationCount) || ownershipViolations.length || sourceOwnershipViolations.length + ignoredViolationCount;
  const sourceViolationCount = nonNegativeNumber(job.sourceOwnershipViolationCount) || sourceOwnershipViolations.length || Math.max(0, violationCount - ignoredViolationCount);
  return { status: sourceViolationCount > 0 ? 'violation' : ignoredViolationCount > 0 ? 'ignored' : 'clean', violationCount, sourceViolationCount, ignoredViolationCount };
}

export function evidenceOwnershipSignal(entry: Record<string, unknown>): QueryOwnershipSignal {
  const facets = isObject(entry.facets) ? entry.facets : {};
  const ignoredViolationCount = nonNegativeNumber(facets.ignoredOwnershipViolationCount);
  const violationCount = nonNegativeNumber(facets.ownershipViolationCount);
  const sourceViolationCount = nonNegativeNumber(facets.sourceOwnershipViolationCount) || Math.max(0, violationCount - ignoredViolationCount);
  return { status: sourceViolationCount > 0 ? 'violation' : ignoredViolationCount > 0 ? 'ignored' : 'clean', violationCount, sourceViolationCount, ignoredViolationCount };
}

function jobIndicatesFailedEvidence(job: Record<string, unknown>): boolean {
  const status = String(job.status ?? '').toLowerCase();
  const disposition = String(job.disposition ?? '').toLowerCase();
  if (status === 'failed' || disposition === 'failed-evidence') return true;
  if (disposition !== 'rejected') return false;
  return queryFailureReasonTokens(readStringArray(job.reasons), readStringArray(job.collectReasonClasses)).length > 0;
}

function queryFailureReasonTokens(...groups: readonly string[][]): string[] {
  const tokens = uniqueStrings(groups.flat()).map((token) => token.toLowerCase());
  return tokens.filter((token) => token === 'failed' || token === 'failed-evidence' || token === 'failed-or-invalid-evidence' ||
    token === 'failed-verification' || token === 'no-source-changes' || token === 'worker-error' || token === 'generated-failed-evidence' ||
    token === 'patch-missing' || token === 'bundle-missing' || token === 'malformed-patch' || token === 'patch-apply-failed' ||
    token === 'source-blocker' || token.startsWith('worker-exit-nonzero:') || token.startsWith('worker-signal:') ||
    token.startsWith('ownership-violation:') || token.startsWith('generated-failed-evidence:') || token.startsWith('verification-failed:'));
}

function hasEvidenceContextBudget(facets: Record<string, unknown>): boolean {
  return Boolean(facets.contextBudgetStatus) ||
    Boolean(facets.contextBudgetWarnings) ||
    Boolean(facets.contextBudgetErrors) ||
    nonNegativeNumber(facets.contextBudgetPromptBytes) > 0 ||
    nonNegativeNumber(facets.contextBudgetEstimatedInputTokens) > 0 ||
    nonNegativeNumber(facets.contextBudgetActualInputTokens) > 0 ||
    nonNegativeNumber(facets.contextBudgetCachedInputTokens) > 0 ||
    nonNegativeNumber(facets.contextBudgetUncachedInputTokens) > 0;
}
