import fs from 'node:fs/promises';
import type { FrontierSwarmJob, FrontierSwarmJobResultInput, FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_KIND,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_KIND,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_VERSION,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_VERSION
} from './constants.js';
import { isObject, pathExists } from './common.js';
import { estimateCodexModelCost, type FrontierCodexModelCostEstimate } from './model-pricing.js';
import {
  countBy,
  humanActionIsOpen,
  humanActionsFromResult,
  numberValue,
  optionalNumberValue,
  readJsonl,
  roundUsd,
  stringArray,
  stringValue
} from './runtime-projection-common.js';
import type { FrontierCodexModelTelemetryRecord, FrontierCodexModelTelemetrySummary } from './types-runtime-projections.js';

export function createCodexModelTelemetryRecord(input: {
  plan: FrontierSwarmPlan;
  job?: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
  generatedAt: number;
}): FrontierCodexModelTelemetryRecord {
  const { job, result } = input;
  const jobRecord = isObject(job) ? job as unknown as Record<string, unknown> : {};
  const resultRecord = result as FrontierSwarmJobResultInput & { taskId?: string };
  const metadata = isObject(result.metadata) ? result.metadata : {};
  const task = isObject(job?.task) ? job.task as unknown as Record<string, unknown> : {};
  const compute = isObject(job?.compute) ? job.compute as unknown as Record<string, unknown> : {};
  const computeMetadata = isObject(compute.metadata) ? compute.metadata : {};
  const contextBudget = isObject(metadata.contextBudget) ? metadata.contextBudget : {};
  const measured = isObject(contextBudget.measured) ? contextBudget.measured : {};
  const usage = isObject(contextBudget.usage) ? contextBudget.usage : {};
  const logSummary = isObject(metadata.logSummary) ? metadata.logSummary : {};
  const humanActions = humanActionsFromResult(result);
  const verification = Array.isArray(result.verification) ? result.verification : [];
  const gateEvidence = isObject(metadata.verificationGateEvidence) ? metadata.verificationGateEvidence : {};
  const semanticImport = isObject(result.semanticImport) ? result.semanticImport : isObject(metadata.semanticImport) ? metadata.semanticImport : {};
  const model = stringValue(compute.model) ?? stringValue(metadata.model);
  const actualInputTokens = numberValue(usage.inputTokens, numberValue(measured.actualInputTokens));
  const cachedInputTokens = numberValue(usage.cachedInputTokens);
  const uncachedInputTokens = numberValue(usage.uncachedInputTokens, Math.max(0, actualInputTokens - cachedInputTokens));
  const outputTokens = numberValue(usage.outputTokens);
  const estimatedInputTokens = numberValue(measured.estimatedInputTokens);
  const cost = estimateCodexModelCost({ model, estimatedInputTokens, actualInputTokens, cachedInputTokens, uncachedInputTokens, outputTokens: optionalNumberValue(usage.outputTokens) });
  const startedAt = optionalNumberValue(result.startedAt);
  const finishedAt = optionalNumberValue(result.finishedAt);
  const changedPaths = Array.isArray(result.changedPaths) ? result.changedPaths.map(String).filter(Boolean) : [];
  const ownershipViolations = Array.isArray(result.ownershipViolations) ? result.ownershipViolations.map(String).filter(Boolean) : [];
  const evidencePaths = Array.isArray(result.evidencePaths) ? result.evidencePaths.map(String).filter(Boolean) : [];
  const taskKind = stringValue(task.taskKind) ?? stringValue(task.kind) ?? stringValue(task.surfaceKind);
  const workKind = stringValue(task.workKind);
  return {
    kind: FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_KIND,
    version: FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_VERSION,
    id: `model-telemetry:${input.plan.runId}:${result.jobId}`,
    generatedAt: input.generatedAt,
    runId: input.plan.runId,
    planId: input.plan.id,
    jobId: result.jobId,
    ...(stringValue(resultRecord.taskId) ?? job?.taskId ? { taskId: stringValue(resultRecord.taskId) ?? job?.taskId } : {}),
    ...(stringValue(job?.lane) ? { lane: stringValue(job?.lane) } : {}),
    ...(stringValue(jobRecord.title ?? task.title) ? { title: stringValue(jobRecord.title ?? task.title) } : {}),
    ...(workKind ? { workKind } : {}),
    ...(taskKind ? { taskKind } : {}),
    ...(stringValue(job?.layer) ? { layer: stringValue(job?.layer) } : {}),
    ...(stringValue(compute.id) ? { computeId: stringValue(compute.id) } : {}),
    ...(stringValue(compute.kind) ? { computeKind: stringValue(compute.kind) } : {}),
    ...(model ? { model } : {}),
    ...(stringValue(computeMetadata.modelTier ?? computeMetadata.tier) ? { modelTier: stringValue(computeMetadata.modelTier ?? computeMetadata.tier) } : {}),
    ...(stringValue(compute.reasoningEffort) ? { reasoningEffort: stringValue(compute.reasoningEffort) } : {}),
    ...(stringValue(compute.serviceTier) ? { serviceTier: stringValue(compute.serviceTier) } : {}),
    ...(stringValue(result.status) ? { status: stringValue(result.status) } : {}),
    ...(stringValue(result.mergeReadiness) ? { mergeReadiness: stringValue(result.mergeReadiness) } : {}),
    ...(stringValue(result.mergeDisposition) ? { mergeDisposition: stringValue(result.mergeDisposition) } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    durationMs: startedAt && finishedAt ? Math.max(0, finishedAt - startedAt) : 0,
    ...(optionalNumberValue(result.exitCode) !== undefined ? { exitCode: optionalNumberValue(result.exitCode) } : {}),
    ...(stringValue(result.signal) ? { signal: stringValue(result.signal) } : {}),
    changedPathCount: changedPaths.length,
    ownershipViolationCount: ownershipViolations.length,
    evidencePathCount: evidencePaths.length,
    promptBytes: numberValue(measured.promptBytes),
    estimatedInputTokens,
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    ...costFields(cost),
    ...(stringValue(contextBudget.status) ? { contextBudgetStatus: stringValue(contextBudget.status) } : {}),
    contextBudgetWarningCount: stringArray(contextBudget.warnings).length,
    contextBudgetErrorCount: stringArray(contextBudget.errors).length,
    verificationTotal: verification.length,
    verificationPassed: verification.filter((entry) => verificationStatus(entry) === 0).length,
    verificationFailed: verification.filter((entry) => verificationStatus(entry) !== 0).length,
    verificationRequiredFailed: verification.filter((entry) => verificationRequired(entry) && verificationStatus(entry) !== 0).length,
    ...(stringValue(gateEvidence.gateExecutionsPath) ? { gateExecutionsPath: stringValue(gateEvidence.gateExecutionsPath) } : {}),
    ...(stringValue(gateEvidence.gateSummaryPath) ? { gateSummaryPath: stringValue(gateEvidence.gateSummaryPath) } : {}),
    humanActionCount: humanActions.length,
    openHumanActionCount: humanActions.filter(humanActionIsOpen).length,
    semanticImportPresent: Object.keys(semanticImport).length > 0,
    semanticImportCandidateCount: numberValue(semanticImport.candidateCount ?? semanticImport.candidates),
    semanticImportSelectedCount: numberValue(semanticImport.selectedCount ?? semanticImport.selected),
    metadata: {
      ...(stringValue(metadata.queueOutcome) ? { queueOutcome: stringValue(metadata.queueOutcome) } : {}),
      ...(stringValue(metadata.source) ? { source: stringValue(metadata.source) } : {}),
      eventBytes: numberValue(logSummary.eventBytes),
      stderrBytes: numberValue(logSummary.stderrBytes),
      eventBytesTruncated: numberValue(logSummary.eventBytesTruncated),
      stderrBytesTruncated: numberValue(logSummary.stderrBytesTruncated),
      contextBudgetWarnings: stringArray(contextBudget.warnings),
      contextBudgetErrors: stringArray(contextBudget.errors)
    }
  };
}

export async function readCodexModelTelemetryRecords(file: string): Promise<FrontierCodexModelTelemetryRecord[]> {
  return (await readJsonl(file)).filter((entry): entry is FrontierCodexModelTelemetryRecord => isObject(entry) && entry.kind === FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_KIND);
}

export async function readCodexModelTelemetrySummary(file: string): Promise<FrontierCodexModelTelemetrySummary | undefined> {
  if (!await pathExists(file)) return undefined;
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  return isObject(parsed) && parsed.kind === FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_KIND ? parsed as unknown as FrontierCodexModelTelemetrySummary : undefined;
}

export function summarizeCodexModelTelemetry(records: readonly FrontierCodexModelTelemetryRecord[], context: { generatedAt: number; runId?: string; planId?: string; telemetryPath?: string }): FrontierCodexModelTelemetrySummary {
  return {
    kind: FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_KIND,
    version: FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_VERSION,
    generatedAt: context.generatedAt,
    ...(context.runId ? { runId: context.runId } : {}),
    ...(context.planId ? { planId: context.planId } : {}),
    ...(context.telemetryPath ? { telemetryPath: context.telemetryPath } : {}),
    recordCount: records.length,
    jobCount: new Set(records.map((entry) => entry.jobId)).size,
    statusCounts: countBy(records.map((entry) => entry.status ?? 'unknown')),
    laneCounts: countBy(records.map((entry) => entry.lane ?? 'unknown')),
    computeCounts: countBy(records.map((entry) => entry.computeId ?? 'unknown')),
    modelCounts: countBy(records.map((entry) => entry.model ?? 'unknown')),
    modelTierCounts: countBy(records.map((entry) => entry.modelTier ?? 'unknown')),
    taskKindCounts: countBy(records.map((entry) => entry.taskKind ?? 'unknown')),
    workKindCounts: countBy(records.map((entry) => entry.workKind ?? 'unknown')),
    totalDurationMs: records.reduce((sum, entry) => sum + entry.durationMs, 0),
    maxDurationMs: Math.max(0, ...records.map((entry) => entry.durationMs)),
    promptBytes: sumRecords(records, 'promptBytes'),
    estimatedInputTokens: sumRecords(records, 'estimatedInputTokens'),
    actualInputTokens: sumRecords(records, 'actualInputTokens'),
    cachedInputTokens: sumRecords(records, 'cachedInputTokens'),
    uncachedInputTokens: sumRecords(records, 'uncachedInputTokens'),
    outputTokens: sumRecords(records, 'outputTokens'),
    billableInputTokens: sumRecords(records, 'billableInputTokens'),
    priceKnownRecordCount: records.filter((entry) => entry.priceKnown).length,
    unknownPriceRecordCount: records.filter((entry) => !entry.priceKnown).length,
    inputOnlyCostRecordCount: records.filter((entry) => entry.costEstimateInputOnly).length,
    estimatedInputRecordCount: records.filter((entry) => entry.costEstimateEstimatedInput).length,
    missingOutputTokenRecordCount: records.filter((entry) => entry.costEstimateMissingOutputTokens).length,
    longContextRecordCount: records.filter((entry) => entry.costEstimateLongContext).length,
    estimatedCostUsd: roundUsd(records.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0)),
    estimatedInputCostUsd: roundUsd(records.reduce((sum, entry) => sum + entry.estimatedInputCostUsd, 0)),
    estimatedOutputCostUsd: roundUsd(records.reduce((sum, entry) => sum + entry.estimatedOutputCostUsd, 0)),
    estimatedCostMicroUsd: sumRecords(records, 'estimatedCostMicroUsd'),
    verificationTotal: sumRecords(records, 'verificationTotal'),
    verificationPassed: sumRecords(records, 'verificationPassed'),
    verificationFailed: sumRecords(records, 'verificationFailed'),
    verificationRequiredFailed: sumRecords(records, 'verificationRequiredFailed'),
    humanActionCount: sumRecords(records, 'humanActionCount'),
    openHumanActionCount: sumRecords(records, 'openHumanActionCount'),
    semanticImportPresentCount: records.filter((entry) => entry.semanticImportPresent).length
  };
}

export function modelTelemetrySummaryDashboardFields(summary: FrontierCodexModelTelemetrySummary | undefined): Record<string, number> {
  return summary ? {
    modelTelemetryRecordCount: summary.recordCount,
    modelTelemetryJobCount: summary.jobCount,
    modelTelemetryPriceKnownRecordCount: summary.priceKnownRecordCount,
    modelTelemetryUnknownPriceRecordCount: summary.unknownPriceRecordCount,
    modelTelemetryEstimatedCostUsd: summary.estimatedCostUsd,
    modelTelemetryEstimatedInputCostUsd: summary.estimatedInputCostUsd,
    modelTelemetryEstimatedOutputCostUsd: summary.estimatedOutputCostUsd,
    modelTelemetryEstimatedCostMicroUsd: summary.estimatedCostMicroUsd,
    modelTelemetryBillableInputTokens: summary.billableInputTokens,
    modelTelemetryOutputTokens: summary.outputTokens,
    modelTelemetryVerificationRequiredFailed: summary.verificationRequiredFailed
  } : {};
}

function costFields(cost: FrontierCodexModelCostEstimate): Pick<FrontierCodexModelTelemetryRecord, 'billableInputTokens' | 'priceKnown' | 'pricingModel' | 'pricingMatchedModel' | 'pricingSource' | 'pricingUpdatedAt' | 'estimatedCostUsd' | 'estimatedInputCostUsd' | 'estimatedCachedInputCostUsd' | 'estimatedUncachedInputCostUsd' | 'estimatedOutputCostUsd' | 'estimatedCostMicroUsd' | 'costEstimateInputOnly' | 'costEstimateEstimatedInput' | 'costEstimateMissingOutputTokens' | 'costEstimateLongContext' | 'unknownPricingReason'> {
  return {
    billableInputTokens: cost.billableInputTokens,
    priceKnown: cost.priceKnown,
    ...(cost.pricingModel ? { pricingModel: cost.pricingModel } : {}),
    ...(cost.pricingMatchedModel ? { pricingMatchedModel: cost.pricingMatchedModel } : {}),
    ...(cost.pricingSource ? { pricingSource: cost.pricingSource } : {}),
    ...(cost.pricingUpdatedAt ? { pricingUpdatedAt: cost.pricingUpdatedAt } : {}),
    estimatedCostUsd: cost.estimatedCostUsd,
    estimatedInputCostUsd: cost.estimatedInputCostUsd,
    estimatedCachedInputCostUsd: cost.estimatedCachedInputCostUsd,
    estimatedUncachedInputCostUsd: cost.estimatedUncachedInputCostUsd,
    estimatedOutputCostUsd: cost.estimatedOutputCostUsd,
    estimatedCostMicroUsd: cost.estimatedCostMicroUsd,
    costEstimateInputOnly: cost.costEstimateInputOnly,
    costEstimateEstimatedInput: cost.costEstimateEstimatedInput,
    costEstimateMissingOutputTokens: cost.costEstimateMissingOutputTokens,
    costEstimateLongContext: cost.costEstimateLongContext,
    ...(cost.unknownPricingReason ? { unknownPricingReason: cost.unknownPricingReason } : {})
  };
}

function verificationStatus(value: unknown): number {
  if (!isObject(value)) return 1;
  return optionalNumberValue(value.status) ?? optionalNumberValue(value.exitCode) ?? 1;
}

function verificationRequired(value: unknown): boolean {
  return !isObject(value) || value.required !== false;
}

function sumRecords(records: readonly FrontierCodexModelTelemetryRecord[], key: keyof FrontierCodexModelTelemetryRecord): number {
  return records.reduce((sum, record) => sum + numberValue(record[key]), 0);
}
