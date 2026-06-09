import fs from 'node:fs/promises';
import type { FrontierSwarmJob, FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_CONTEXT_BUDGET_KIND,
  FRONTIER_SWARM_CODEX_CONTEXT_BUDGET_VERSION
} from './constants.js';
import { isObject, uniqueStrings } from './common.js';
import type {
  FrontierCodexContextBudgetOptions,
  FrontierCodexContextBudgetReport,
  FrontierCodexLogSummary
} from './index.js';
import type { FrontierCodexWorkspacePlan } from './types-workspace.js';

export function createCodexContextBudgetReport(input: {
  job: FrontierSwarmJob;
  prompt: string;
  workspacePlan: FrontierCodexWorkspacePlan;
  options?: boolean | FrontierCodexContextBudgetOptions;
}): FrontierCodexContextBudgetReport {
  const options = normalizeContextBudgetOptions(input.options);
  const promptBytes = Buffer.byteLength(input.prompt);
  const estimatedInputTokens = estimateTokens(input.prompt);
  const measured = {
    promptBytes,
    promptChars: input.prompt.length,
    estimatedInputTokens,
    sourceRefCount: input.job.task.sourceRefs.length,
    targetRefCount: input.job.task.targetRefs.length,
    allowedWriteCount: input.job.allowedWrites.length,
    workspaceIncludeCount: input.workspacePlan.includes.length,
    workspaceMode: input.workspacePlan.mode
  };
  const warnings = budgetFindings(options, measured, 'warn');
  const errors = options.mode === 'fail' ? budgetFindings(options, measured, 'max') : [];
  return {
    kind: FRONTIER_SWARM_CODEX_CONTEXT_BUDGET_KIND,
    version: FRONTIER_SWARM_CODEX_CONTEXT_BUDGET_VERSION,
    generatedAt: Date.now(),
    jobId: input.job.id,
    taskId: input.job.taskId,
    lane: input.job.lane,
    status: errors.length ? 'failed' : warnings.length ? 'warning' : 'ok',
    action: errors.length ? 'fail-before-launch' : warnings.length ? 'warn' : 'allow',
    options,
    measured,
    warnings: uniqueStrings(warnings),
    errors: uniqueStrings(errors)
  };
}

export async function finalizeCodexContextBudgetReport(
  report: FrontierCodexContextBudgetReport,
  logSummary: FrontierCodexLogSummary
): Promise<FrontierCodexContextBudgetReport> {
  const usage = await readCodexTokenUsage(logSummary.eventsPath);
  const warnings = [...report.warnings];
  const errors = [...report.errors];
  const maxInput = report.options.maxActualInputTokens ?? report.options.maxEstimatedInputTokens;
  const warnInput = report.options.warnActualInputTokens ?? report.options.warnEstimatedInputTokens;
  const inputTokens = usage?.inputTokens;
  if (inputTokens !== undefined && warnInput !== undefined && inputTokens > warnInput) {
    warnings.push(`actual input tokens ${inputTokens} exceeded warning budget ${warnInput}`);
  }
  if (report.options.mode === 'fail' && inputTokens !== undefined && maxInput !== undefined && inputTokens > maxInput) {
    errors.push(`actual input tokens ${inputTokens} exceeded max budget ${maxInput}`);
  }
  return {
    ...report,
    generatedAt: Date.now(),
    status: errors.length ? 'failed' : warnings.length ? 'warning' : 'ok',
    action: report.action === 'fail-before-launch' ? report.action : errors.length ? 'fail-after-run' : warnings.length ? 'warn' : 'allow',
    usage,
    warnings: uniqueStrings(warnings),
    errors: uniqueStrings(errors)
  };
}

export function normalizeContextBudgetOptions(
  input: boolean | FrontierCodexContextBudgetOptions | undefined
): Required<Pick<FrontierCodexContextBudgetOptions, 'enabled' | 'mode'>> & FrontierCodexContextBudgetOptions {
  if (input === false) return { enabled: false, mode: 'off' };
  const options = input === true || input === undefined ? {} : input;
  return {
    enabled: options.enabled ?? true,
    mode: options.mode ?? 'warn',
    warnPromptBytes: positive(options.warnPromptBytes, 128_000),
    warnEstimatedInputTokens: positive(options.warnEstimatedInputTokens, 32_000),
    warnActualInputTokens: positive(options.warnActualInputTokens, 250_000),
    maxPromptBytes: positive(options.maxPromptBytes, undefined),
    maxEstimatedInputTokens: positive(options.maxEstimatedInputTokens, undefined),
    maxActualInputTokens: positive(options.maxActualInputTokens, undefined),
    maxSourceRefs: positive(options.maxSourceRefs, 64),
    maxTargetRefs: positive(options.maxTargetRefs, 64),
    maxWorkspaceIncludes: positive(options.maxWorkspaceIncludes, 32)
  };
}

export function contextBudgetFromBundle(bundle: FrontierSwarmMergeBundle): FrontierCodexContextBudgetReport | undefined {
  const metadata = isObject(bundle.metadata) ? bundle.metadata as { contextBudget?: unknown } : {};
  return isContextBudgetReport(metadata.contextBudget) ? metadata.contextBudget : undefined;
}

export function contextBudgetFromCoordinatorJob(job: unknown): FrontierCodexContextBudgetReport | undefined {
  return isObject(job) && isContextBudgetReport(job.contextBudget) ? job.contextBudget : undefined;
}

function budgetFindings(options: ReturnType<typeof normalizeContextBudgetOptions>, measured: FrontierCodexContextBudgetReport['measured'], level: 'warn' | 'max'): string[] {
  if (!options.enabled || options.mode === 'off') return [];
  const prefix = level === 'warn' ? 'warn' : 'max';
  const pairs: Array<[number, number | undefined, string]> = [
    [measured.promptBytes, options[`${prefix}PromptBytes`], 'prompt bytes'],
    [measured.estimatedInputTokens, options[`${prefix}EstimatedInputTokens`], 'estimated input tokens'],
    [measured.sourceRefCount, options.maxSourceRefs, 'source refs'],
    [measured.targetRefCount, options.maxTargetRefs, 'target refs'],
    [measured.workspaceIncludeCount, options.maxWorkspaceIncludes, 'workspace includes']
  ];
  return pairs
    .filter(([actual, limit]) => limit !== undefined && actual > limit)
    .map(([actual, limit, label]) => `${label} ${actual} exceeded ${level} budget ${limit}`);
}

function estimateTokens(text: string): number {
  if (!text) return 0;
  const ascii = text.replace(/[^\x00-\x7F]/g, '  ');
  return Math.max(1, Math.ceil(ascii.length / 4));
}

async function readCodexTokenUsage(eventsPath: string): Promise<FrontierCodexContextBudgetReport['usage']> {
  const text = await fs.readFile(eventsPath, 'utf8').catch(() => '');
  const usage: NonNullable<FrontierCodexContextBudgetReport['usage']> = { source: 'codex-events' };
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    try {
      visitUsage(JSON.parse(line), usage);
    } catch {
      // Ignore partial or non-JSON lines from older Codex binaries.
    }
  }
  return Object.keys(usage).length > 1 ? usage : undefined;
}

function visitUsage(value: unknown, usage: NonNullable<FrontierCodexContextBudgetReport['usage']>): void {
  if (!isObject(value) && !Array.isArray(value)) return;
  if (Array.isArray(value)) {
    for (const entry of value) visitUsage(entry, usage);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[_-]/g, '').toLowerCase();
    if (typeof child === 'number') mergeUsageValue(usage, normalized, child);
    else visitUsage(child, usage);
  }
}

function mergeUsageValue(usage: NonNullable<FrontierCodexContextBudgetReport['usage']>, key: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  if (key === 'inputtokens' || key === 'prompttokens') usage.inputTokens = Math.max(usage.inputTokens ?? 0, value);
  if (key === 'cachedinputtokens') usage.cachedInputTokens = Math.max(usage.cachedInputTokens ?? 0, value);
  if (key === 'outputtokens' || key === 'completiontokens') usage.outputTokens = Math.max(usage.outputTokens ?? 0, value);
  if (key === 'totaltokens') usage.totalTokens = Math.max(usage.totalTokens ?? 0, value);
}

function isContextBudgetReport(value: unknown): value is FrontierCodexContextBudgetReport {
  return isObject(value) && value.kind === FRONTIER_SWARM_CODEX_CONTEXT_BUDGET_KIND && typeof value.jobId === 'string';
}

function positive(value: unknown, fallback: number | undefined): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}
