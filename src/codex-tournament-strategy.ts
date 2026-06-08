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
  model?: string;
  reasoningEffort?: string;
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
  return {
    promptStyle: input.customPrompt ? 'custom-prompt' : 'default-prompt',
    workspaceStyle: input.workspaceMode,
    evidenceStyle: evidenceStyle(input.semanticImportSummary),
    model: input.job.compute.model,
    reasoningEffort: input.job.compute.reasoningEffort,
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

function outputClass(
  outputBytes: number,
  summary: FrontierCodexLogSummary
): FrontierCodexTournamentStrategyMetadata['outputClass'] {
  if (outputBytes > 500000 || summary.eventBytesTruncated > 0 || summary.stderrBytesTruncated > 0) return 'noisy';
  return summary.eventBytesWritten + summary.stderrBytesWritten < outputBytes ? 'compact' : 'normal';
}
