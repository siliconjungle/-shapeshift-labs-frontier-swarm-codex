export interface CodexRunMetadataInput {
  lease?: { id: string; token: string; fencingToken: number };
  resourceAllocation?: unknown;
  workspaceMode?: string;
  contextBudget: unknown;
  logSummary: unknown;
  tournamentStrategy: unknown;
  workspacePatchQuarantine: unknown;
  ownershipRestore: unknown;
  preExecWriteFence: unknown;
  codexDeferredFailure?: unknown;
  workerTermination?: unknown;
  allowedWritePolicy: unknown;
  observedChangedPaths: unknown;
  reportedChangedPaths: unknown;
  humanActions: { actions: unknown[]; paths: string[] };
  strictOwnership?: {
    blockReason: string;
    blockMessage: string;
    skippedReason?: string;
    skipReasons: string[];
    skippedCommands: unknown[];
  };
  semanticImportSummary?: unknown;
  codexHandoffArtifacts?: unknown;
}

export function createCodexRunMetadata(input: CodexRunMetadataInput): Record<string, unknown> {
  return {
    ...(input.lease ? { leaseId: input.lease.id, leaseToken: input.lease.token, fencingToken: input.lease.fencingToken } : {}),
    ...(input.resourceAllocation ? { resourceAllocation: input.resourceAllocation } : {}),
    ...(input.workspaceMode ? { workspaceMode: input.workspaceMode } : {}),
    contextBudget: input.contextBudget,
    logSummary: input.logSummary,
    tournamentStrategy: input.tournamentStrategy,
    workspacePatchQuarantine: input.workspacePatchQuarantine,
    ownershipRestore: input.ownershipRestore,
    preExecWriteFence: input.preExecWriteFence,
    ...(input.codexDeferredFailure ? { codexDeferredFailure: input.codexDeferredFailure } : {}),
    ...(input.workerTermination ? { workerTermination: input.workerTermination } : {}),
    allowedWritePolicy: input.allowedWritePolicy,
    observedChangedPaths: input.observedChangedPaths,
    reportedChangedPaths: input.reportedChangedPaths,
    ...(input.humanActions.actions.length ? { humanActions: input.humanActions.actions, humanActionArtifactPaths: input.humanActions.paths } : {}),
    ...(input.strictOwnership ? {
      strictOwnershipBlockReason: input.strictOwnership.blockReason,
      strictOwnershipBlockMessage: input.strictOwnership.blockMessage,
      verificationSkippedReason: input.strictOwnership.skippedReason,
      verificationSkipReasons: input.strictOwnership.skipReasons,
      verificationSkippedCommands: input.strictOwnership.skippedCommands,
      verificationSkippedCommandCount: input.strictOwnership.skippedCommands.length
    } : {}),
    ...(input.semanticImportSummary ? { semanticImport: input.semanticImportSummary } : {}),
    ...(input.codexHandoffArtifacts ? { codexHandoffArtifacts: input.codexHandoffArtifacts } : {})
  };
}
