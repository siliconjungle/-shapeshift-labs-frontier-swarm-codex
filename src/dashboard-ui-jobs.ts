import path from 'node:path';
import { isObject } from './common.js';
import { estimateCodexModelCost } from './model-pricing.js';
import {
  dashboardJobHealth,
  dashboardRecordIndicatesFailedEvidence,
  dashboardSemanticReadiness
} from './dashboard-ui-health.js';
import { dashboardDurationMs } from './dashboard-ui-time-series.js';
import type { DashboardArtifactContext } from './dashboard-ui-types.js';
import {
  booleanValue,
  dashboardCostFields,
  numberRecordValue,
  numberValue,
  optionalNumberValue,
  stringArrayValue,
  stringListValue,
  stringValue,
  timestampValue
} from './dashboard-ui-values.js';
import {
  dashboardArtifactRoots,
  dashboardWorkspaceOwnershipEvidence,
  ignoredChangedPathReasonArrayValue,
  isIgnoredChangedPath
} from './dashboard-ui-workspace.js';
import type { FrontierCodexCollectBucket, FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexDashboardHealthStatus, FrontierCodexDashboardJob } from './types-dashboard.js';
import type { FrontierCodexSwarmRunResult } from './types-run.js';

export function dashboardJobFromCoordinatorJob(value: unknown): FrontierCodexDashboardJob {
  const job = isObject(value) ? value : {};
  const contextBudget = isObject(job.contextBudget) ? job.contextBudget : {};
  const measuredBudget = isObject(contextBudget.measured) ? contextBudget.measured : {};
  const usageBudget = isObject(contextBudget.usage) ? contextBudget.usage : {};
  const semanticAdmission = isObject(job.semanticEditAdmission) ? job.semanticEditAdmission : {};
  const changedPaths = stringArrayValue(job.changedPaths);
  const ownershipViolations = stringArrayValue(job.ownershipViolations);
  const sourceOwnershipViolations = stringArrayValue(job.sourceOwnershipViolations);
  const effectiveSourceOwnershipViolations = sourceOwnershipViolations.length ? sourceOwnershipViolations : ownershipViolations;
  const ignoredOwnershipViolations = stringArrayValue(job.ignoredOwnershipViolations);
  const quarantinedChangedPaths = stringArrayValue(job.quarantinedChangedPaths);
  const contextBudgetWarnings = stringArrayValue(contextBudget.warnings);
  const contextBudgetErrors = stringArrayValue(contextBudget.errors);
  const startedAt = timestampValue(job.startedAt);
  const finishedAt = timestampValue(job.finishedAt);
  const semanticAdmissionStatus = stringValue(job.semanticEditAdmissionStatus ?? semanticAdmission.status);
  const semanticAutoMergeCandidate = booleanValue(job.semanticAutoMergeCandidate ?? semanticAdmission.autoMergeCandidate);
  const semanticCleanEligible = booleanValue(job.semanticCleanEligible ?? semanticAdmission.cleanEligible);
  const semanticReadinessReasons = stringListValue(job.semanticReadinessReasons ?? semanticAdmission.reasons);
  const actualInputTokens = numberValue(usageBudget.inputTokens, numberValue(measuredBudget.actualInputTokens));
  const cachedInputTokens = numberValue(usageBudget.cachedInputTokens);
  const uncachedInputTokens = numberValue(usageBudget.uncachedInputTokens, Math.max(0, actualInputTokens - cachedInputTokens));
  const outputTokens = numberValue(usageBudget.outputTokens);
  const model = stringValue(job.model);
  const costEstimate = estimateCodexModelCost({ model, estimatedInputTokens: numberValue(measuredBudget.estimatedInputTokens, numberValue(job.estimatedInputTokens)), actualInputTokens, cachedInputTokens, uncachedInputTokens, outputTokens: optionalNumberValue(usageBudget.outputTokens) });
  const row = {
    id: String(job.jobId ?? job.id ?? ''),
    taskId: stringValue(job.taskId),
    title: stringValue(job.title),
    lane: stringValue(job.lane),
    status: stringValue(job.status),
    startedAt,
    finishedAt,
    durationMs: dashboardDurationMs(startedAt, finishedAt),
    generatedAt: timestampValue(job.generatedAt),
    health: 'unknown' as FrontierCodexDashboardHealthStatus,
    computeId: stringValue(job.computeId),
    model,
    modelTier: stringValue(job.modelTier),
    workKind: stringValue(job.workKind),
    bucket: dashboardBucketFromCoordinatorJob(job),
    mergeReadiness: stringValue(job.mergeReadiness),
    disposition: stringValue(job.disposition),
    changedPaths,
    ownershipViolations,
    sourceOwnershipViolations: effectiveSourceOwnershipViolations,
    ignoredOwnershipViolations,
    quarantinedChangedPaths,
    ignoredChangedPathSamples: stringArrayValue(job.ignoredChangedPathSamples),
    ignoredChangedPathReasonSamples: ignoredChangedPathReasonArrayValue(job.ignoredChangedPathReasonSamples),
    changedPathCount: numberValue(job.changedPathCount, changedPaths.length),
    ownershipViolationCount: numberValue(job.ownershipViolationCount, ownershipViolations.length),
    sourceOwnershipViolationCount: numberValue(job.sourceOwnershipViolationCount, effectiveSourceOwnershipViolations.length),
    ignoredOwnershipViolationCount: numberValue(job.ignoredOwnershipViolationCount, ignoredOwnershipViolations.length),
    quarantinedChangedPathCount: numberValue(job.quarantinedChangedPathCount, quarantinedChangedPaths.length),
    ignoredChangedPathCount: numberValue(job.ignoredChangedPathCount),
    ignoredChangedPathReasonCounts: numberRecordValue(job.ignoredChangedPathReasonCounts),
    observedChangedPathCount: numberValue(job.observedChangedPathCount),
    reportedChangedPathCount: numberValue(job.reportedChangedPathCount),
    contextBudgetStatus: stringValue(contextBudget.status ?? job.contextBudgetStatus),
    contextBudgetWarningCount: numberValue(job.contextBudgetWarningCount, contextBudgetWarnings.length),
    contextBudgetErrorCount: numberValue(job.contextBudgetErrorCount, contextBudgetErrors.length),
    contextBudgetWarnings,
    contextBudgetErrors,
    evidencePathCount: stringArrayValue(job.evidencePaths).length,
    promptBytes: numberValue(measuredBudget.promptBytes, numberValue(job.promptBytes)),
    estimatedInputTokens: numberValue(measuredBudget.estimatedInputTokens, numberValue(job.estimatedInputTokens)),
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    ...dashboardCostFields(costEstimate),
    semanticAdmissionStatus,
    semanticAutoMergeCandidate,
    semanticCleanEligible,
    semanticReadiness: dashboardSemanticReadiness({ semanticAdmissionStatus, semanticAutoMergeCandidate, semanticCleanEligible, disposition: stringValue(job.disposition), reasons: Array.isArray(job.reasons) ? job.reasons.map(String) : [] }),
    semanticReadinessReasons,
    eventBytes: numberValue(job.eventBytes),
    eventBytesTruncated: numberValue(job.eventBytesTruncated),
    stderrBytes: numberValue(job.stderrBytes),
    stderrBytesTruncated: numberValue(job.stderrBytesTruncated),
    collectReasonClasses: stringListValue(job.collectReasonClasses),
    reasons: stringListValue(job.reasons)
  };
  row.health = dashboardJobHealth(row);
  return row;
}

export async function createDashboardJobs(
  run: FrontierCodexSwarmRunResult | undefined,
  collection: FrontierCodexCollectResult | undefined,
  context: DashboardArtifactContext
): Promise<FrontierCodexDashboardJob[]> {
  const collected = new Map<string, { bucket: FrontierCodexCollectBucket; bundle: FrontierCodexCollectResult['buckets'][FrontierCodexCollectBucket][number]['bundle']; outputDir?: string; mergePath?: string }>();
  for (const [bucket, entries] of Object.entries(collection?.buckets ?? {}) as Array<[FrontierCodexCollectBucket, FrontierCodexCollectResult['buckets'][FrontierCodexCollectBucket]]>) {
    for (const entry of entries) collected.set(entry.jobId, { bucket, bundle: entry.bundle, outputDir: entry.outputDir, mergePath: entry.mergePath });
  }
  const rows = await Promise.all((run?.run.jobs ?? []).map((job) => {
    const result = run?.run.results.find((entry) => entry.jobId === job.id);
    return dashboardJobFromParts(job, result, collected.get(job.id), context);
  }));
  for (const [jobId, bucket] of collected) {
    if (!rows.some((row) => row.id === jobId)) rows.push(await dashboardJobFromParts({ id: jobId }, undefined, bucket, context));
  }
  return rows.sort((left, right) => (left.lane ?? '').localeCompare(right.lane ?? '') || left.id.localeCompare(right.id));
}

function dashboardBucketFromCoordinatorJob(job: Record<string, unknown>): FrontierCodexCollectBucket | undefined {
  const disposition = stringValue(job.disposition);
  const status = stringValue(job.status);
  if (disposition === 'needs-port' || disposition === 'needs-human-port') return 'needs-human-port';
  if (disposition === 'ready-to-apply' || disposition === 'auto-mergeable') return 'ready-to-apply';
  if (disposition === 'rerun-work' || disposition === 'ownership-rescope') return 'rerun-work';
  if (disposition === 'stale-against-head' || disposition === 'stale' || booleanValue(job.staleAgainstHead)) return 'stale-against-head';
  if (dashboardRecordIndicatesFailedEvidence(job, stringListValue) || status === 'failed') return 'failed-evidence';
  return undefined;
}

async function dashboardJobFromParts(
  jobValue: unknown,
  resultValue: unknown,
  collected: { bucket: FrontierCodexCollectBucket; bundle: unknown; outputDir?: string; mergePath?: string } | undefined,
  context: DashboardArtifactContext
): Promise<FrontierCodexDashboardJob> {
  const job = isObject(jobValue) ? jobValue : {};
  const result = isObject(resultValue) ? resultValue : undefined;
  const task = isObject(job.task) ? job.task : {};
  const compute = isObject(job.compute) ? job.compute : {};
  const bundle = isObject(collected?.bundle) ? collected.bundle : {};
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const collectMetadata = isObject(metadata.collect) ? metadata.collect : {};
  const quarantine = isObject(metadata.workspacePatchQuarantine) ? metadata.workspacePatchQuarantine : {};
  const contextBudget = isObject(metadata.contextBudget) ? metadata.contextBudget : {};
  const measuredBudget = isObject(contextBudget.measured) ? contextBudget.measured : {};
  const usageBudget = isObject(contextBudget.usage) ? contextBudget.usage : {};
  const logSummary = isObject(metadata.logSummary) ? metadata.logSummary : {};
  const changedPaths = stringArrayValue(bundle.changedPaths);
  const ownershipViolations = stringArrayValue(bundle.ownershipViolations);
  const workspaceEvidence = await dashboardWorkspaceOwnershipEvidence(bundle, metadata, {
    ...context,
    artifactRoots: dashboardArtifactRoots(context.cwd, ...context.artifactRoots, collected?.outputDir, collected?.mergePath ? path.dirname(collected.mergePath) : undefined),
    artifactBases: dashboardArtifactRoots(context.cwd, ...context.artifactBases, collected?.outputDir, collected?.mergePath ? path.dirname(collected.mergePath) : undefined)
  });
  const sourceOwnershipViolations = ownershipViolations.filter((entry) => !isIgnoredChangedPath(entry, workspaceEvidence.ignoredChangedPaths));
  const ignoredOwnershipViolations = ownershipViolations.filter((entry) => isIgnoredChangedPath(entry, workspaceEvidence.ignoredChangedPaths));
  const startedAt = timestampValue(result?.startedAt ?? bundle.startedAt);
  const finishedAt = timestampValue(result?.finishedAt ?? bundle.finishedAt);
  const semantic = semanticFields(metadata, stringValue(bundle.disposition), Array.isArray(bundle.reasons) ? bundle.reasons.map(String) : []);
  const model = stringValue(compute.model ?? metadata.model ?? bundle.model ?? collectMetadata.model);
  const actualInputTokens = numberValue(usageBudget.inputTokens, numberValue(measuredBudget.actualInputTokens));
  const cachedInputTokens = numberValue(usageBudget.cachedInputTokens);
  const uncachedInputTokens = numberValue(usageBudget.uncachedInputTokens, Math.max(0, actualInputTokens - cachedInputTokens));
  const outputTokens = numberValue(usageBudget.outputTokens);
  const estimatedInputTokens = numberValue(measuredBudget.estimatedInputTokens);
  const costEstimate = estimateCodexModelCost({ model, estimatedInputTokens, actualInputTokens, cachedInputTokens, uncachedInputTokens, outputTokens: optionalNumberValue(usageBudget.outputTokens) });
  const row = {
    id: String(job.id ?? bundle.jobId ?? ''),
    taskId: stringValue(job.taskId ?? bundle.taskId),
    title: stringValue(job.title ?? task.title),
    lane: stringValue(job.lane ?? bundle.lane),
    status: stringValue(result?.status ?? bundle.status ?? job.status),
    startedAt,
    finishedAt,
    durationMs: dashboardDurationMs(startedAt, finishedAt),
    generatedAt: timestampValue(bundle.generatedAt),
    health: 'unknown' as FrontierCodexDashboardHealthStatus,
    computeId: stringValue(compute.id),
    model,
    modelTier: stringValue(isObject(compute.metadata) ? compute.metadata.modelTier : undefined),
    workKind: stringValue(task.workKind),
    bucket: collected?.bucket,
    mergeReadiness: stringValue(bundle.mergeReadiness),
    disposition: stringValue(bundle.disposition),
    changedPaths,
    ownershipViolations,
    sourceOwnershipViolations,
    ignoredOwnershipViolations,
    quarantinedChangedPaths: stringArrayValue(quarantine.quarantinedChangedPaths),
    ignoredChangedPathSamples: workspaceEvidence.ignoredChangedPathSamples,
    ignoredChangedPathReasonSamples: workspaceEvidence.ignoredChangedPathReasonSamples,
    changedPathCount: changedPaths.length,
    ownershipViolationCount: ownershipViolations.length,
    sourceOwnershipViolationCount: sourceOwnershipViolations.length,
    ignoredOwnershipViolationCount: ignoredOwnershipViolations.length,
    quarantinedChangedPathCount: stringArrayValue(quarantine.quarantinedChangedPaths).length,
    ignoredChangedPathCount: workspaceEvidence.ignoredChangedPathCount,
    ignoredChangedPathReasonCounts: workspaceEvidence.ignoredChangedPathReasonCounts,
    observedChangedPathCount: workspaceEvidence.observedChangedPathCount,
    reportedChangedPathCount: workspaceEvidence.reportedChangedPathCount,
    contextBudgetStatus: stringValue(contextBudget.status),
    contextBudgetWarningCount: stringArrayValue(contextBudget.warnings).length,
    contextBudgetErrorCount: stringArrayValue(contextBudget.errors).length,
    contextBudgetWarnings: stringArrayValue(contextBudget.warnings),
    contextBudgetErrors: stringArrayValue(contextBudget.errors),
    evidencePathCount: Array.isArray(bundle.evidencePaths) ? bundle.evidencePaths.length : 0,
    promptBytes: numberValue(measuredBudget.promptBytes),
    estimatedInputTokens,
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    ...dashboardCostFields(costEstimate),
    ...semantic,
    eventBytes: numberValue(logSummary.eventBytes),
    eventBytesTruncated: numberValue(logSummary.eventBytesTruncated),
    stderrBytes: numberValue(logSummary.stderrBytes),
    stderrBytesTruncated: numberValue(logSummary.stderrBytesTruncated),
    collectReasonClasses: Array.isArray(collectMetadata.reasonClasses) ? collectMetadata.reasonClasses.map(String) : [],
    reasons: Array.isArray(bundle.reasons) ? bundle.reasons.map(String) : []
  };
  row.health = dashboardJobHealth(row);
  return row;
}

function semanticFields(metadata: Record<string, unknown>, disposition: string | undefined, reasons: readonly string[]) {
  const semanticAdmission = isObject(metadata.semanticEditAdmission) ? metadata.semanticEditAdmission : {};
  const semanticCompactSummary = isObject(metadata.semanticCompactSummary) ? metadata.semanticCompactSummary : {};
  const semanticCompactEdit = isObject(semanticCompactSummary.semanticEdit) ? semanticCompactSummary.semanticEdit : {};
  const semanticAdmissionStatus = stringValue(metadata.semanticEditAdmissionStatus ?? semanticAdmission.status ?? semanticCompactEdit.status);
  const semanticAutoMergeCandidate = booleanValue(metadata.semanticEditAdmissionAutoMergeCandidate) || booleanValue(semanticAdmission.autoMergeCandidate) || booleanValue(semanticCompactEdit.autoMergeCandidate);
  const semanticCleanEligible = booleanValue(metadata.semanticEditAdmissionCleanEligible) || booleanValue(semanticAdmission.cleanEligible) || booleanValue(semanticCompactEdit.cleanEligible);
  return {
    semanticAdmissionStatus,
    semanticAutoMergeCandidate,
    semanticCleanEligible,
    semanticReadiness: dashboardSemanticReadiness({ semanticAdmissionStatus, semanticAutoMergeCandidate, semanticCleanEligible, disposition, reasons }),
    semanticReadinessReasons: stringListValue(metadata.semanticEditAdmissionReasons)
  };
}
