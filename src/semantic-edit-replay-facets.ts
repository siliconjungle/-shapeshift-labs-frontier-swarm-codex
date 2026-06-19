import type { FrontierCodexSemanticEditReplaySummary } from './types-semantic-edit-replay.js';

export function semanticEditReplayFacets(replay: FrontierCodexSemanticEditReplaySummary): Record<string, unknown> {
  return {
    semanticEditReplayTotal: replay.total,
    semanticEditReplayAcceptedClean: replay.acceptedClean,
    semanticEditReplayAlreadyApplied: replay.alreadyApplied,
    semanticEditReplayConflicts: replay.conflicts,
    semanticEditReplayStale: replay.stale,
    semanticEditReplayBlocked: replay.blocked,
    semanticEditReplayNeedsPort: replay.needsPort,
    semanticEditReplayEvidenceOnly: replay.evidenceOnly,
    semanticEditReplayAppliedOperations: replay.appliedOperations,
    semanticEditReplaySkippedOperations: replay.skippedOperations,
    semanticEditReplayEdits: replay.editCount,
    semanticEditReplayAppliedEdits: replay.appliedEditCount,
    semanticEditReplayAlreadyAppliedEdits: replay.alreadyAppliedEditCount,
    semanticEditReplayStatuses: Object.keys(replay.statusCounts).filter((key) => replay.statusCounts[key] > 0).join(','),
    semanticEditReplayAdmissions: Object.keys(replay.admission).filter((key) => replay.admission[key] > 0).join(','),
    semanticEditReplayActions: replay.actions.join(','),
    semanticEditReplayOperationIds: replay.operationIds.join(','),
    semanticEditReplaySemanticKeys: replay.semanticKeys.join(','),
    semanticEditReplaySemanticIdentityHashes: replay.semanticIdentityHashes.join(','),
    semanticEditReplaySourceIdentityHashes: replay.sourceIdentityHashes.join(','),
    semanticEditReplayEditContentHashes: replay.editContentHashes.join(','),
    semanticEditReplaySourcePaths: replay.sourcePaths.join(','),
    semanticEditReplaySymbolNames: replay.symbolNames.join(','),
    semanticEditReplayCurrentHashes: replay.currentHashes.join(','),
    semanticEditReplayOutputHashes: replay.outputHashes.join(','),
    semanticEditReplayReasonCodes: replay.reasonCodes.join(',')
  };
}
