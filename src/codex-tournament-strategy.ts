import type { FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import type {
  FrontierCodexLogSummary,
  FrontierCodexSemanticImportSidecar,
  FrontierCodexSwarmWorkspaceMode
} from './index.js';

export interface FrontierCodexTournamentStrategyMetadata {
  promptStyle: string;
  workspaceStyle: string;
  evidenceStyle: string;
  taskKind: string;
  workKind: string;
  lane: string;
  model?: string;
  modelTier?: string;
  reasoningEffort?: string;
  routingKey: {
    taskKind: string;
    workKind: string;
    lane: string;
    modelTier?: string;
  };
  outputBytes: number;
  outputClass: 'compact' | 'normal' | 'noisy';
}

export function createCodexTournamentStrategyMetadata(input: {
  job: FrontierSwarmJob;
  workspaceMode: FrontierCodexSwarmWorkspaceMode;
  customPrompt: boolean;
  semanticImportSummary?: FrontierCodexSemanticImportSidecar['summary'];
  logSummary: FrontierCodexLogSummary;
}): FrontierCodexTournamentStrategyMetadata {
  const outputBytes = input.logSummary.eventBytes + input.logSummary.stderrBytes;
  const workKind = stringValue(input.job.task.workKind) ?? 'agent-task';
  const taskKind = stringValue(input.job.task.metadata?.taskKind) ?? workKind;
  const lane = stringValue(input.job.lane) ?? 'default';
  const modelTier = modelTierForJob(input.job);
  return {
    promptStyle: input.customPrompt ? 'custom-prompt' : 'default-prompt',
    workspaceStyle: input.workspaceMode,
    evidenceStyle: evidenceStyle(input.semanticImportSummary),
    taskKind,
    workKind,
    lane,
    model: input.job.compute.model,
    ...(modelTier ? { modelTier } : {}),
    reasoningEffort: input.job.compute.reasoningEffort,
    routingKey: {
      taskKind,
      workKind,
      lane,
      ...(modelTier ? { modelTier } : {})
    },
    outputBytes,
    outputClass: outputClass(outputBytes, input.logSummary)
  };
}

function evidenceStyle(summary: FrontierCodexSemanticImportSidecar['summary'] | undefined): string {
  if (!summary) return 'structured-evidence';
  if (summary.imported > 0 && summary.semanticIndex.symbols > 0) return 'semantic-symbols';
  if (summary.imported > 0) return 'semantic-imported';
  if (summary.errors > 0) return 'semantic-errors';
  return 'semantic-empty';
}

function modelTierForJob(job: FrontierSwarmJob): string | undefined {
  const metadata = isRecord(job.compute.metadata) ? job.compute.metadata : {};
  return stringValue(metadata.modelTier)
    ?? stringValue(metadata.tier)
    ?? job.compute.profile
    ?? modelTierFromModel(job.compute.model);
}

function modelTierFromModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  if (/\b(?:mini|small|fast|haiku|flash)\b/i.test(model)) return 'fast';
  if (/\b(?:deep|large|pro|opus|max)\b/i.test(model)) return 'deep';
  return undefined;
}

function outputClass(
  outputBytes: number,
  summary: FrontierCodexLogSummary
): FrontierCodexTournamentStrategyMetadata['outputClass'] {
  if (outputBytes > 500000 || summary.eventBytesTruncated > 0 || summary.stderrBytesTruncated > 0) return 'noisy';
  return summary.eventBytesWritten + summary.stderrBytesWritten < outputBytes ? 'compact' : 'normal';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
