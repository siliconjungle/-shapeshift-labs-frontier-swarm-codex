import type { FrontierCodexSemanticEditAdmissionDecision, FrontierCodexSemanticEditScriptSummary } from './types-semantic-edit.js';
import type { FrontierCodexSemanticEditProjectionSummary } from './types-semantic-edit-projection.js';
import type { FrontierCodexSemanticEditReplaySummary } from './types-semantic-edit-replay.js';

export interface FrontierCodexSafeMergeRecordSummary {
  total: number;
  classifications: string[];
  byClassification: Record<string, number>;
  decisions: string[];
  byDecision: Record<string, number>;
  noOp: number;
  stale: number;
  needsReview: number;
  blocked: number;
  conflicts: number;
  conflictReasonCodes: string[];
  conflictKeys: string[];
  evidenceIds: string[];
  autoApplyable: number;
  autoApplyCandidates: number;
  empty: boolean;
}

export interface FrontierCodexSemanticMergeAdmissionSummary extends FrontierCodexSafeMergeRecordSummary {
  safe: number;
  safeWithLosses: number;
  reviewRequired: number;
  autoMergeable: number;
  reasonCodes: string[];
  conflictKeyKinds: string[];
  candidateIds: string[];
}

export interface FrontierCodexJsTsSafeMergeApplySummary extends FrontierCodexSafeMergeRecordSummary {
  acceptedClean: number;
  alreadyApplied: number;
  applied: number;
  skipped: number;
  scripts: number;
  projections: number;
  replays: number;
  statuses: string[];
  byStatus: Record<string, number>;
  actions: string[];
  byAction: Record<string, number>;
  reasonCodes: string[];
  sourcePaths: string[];
  scriptIds: string[];
  projectionIds: string[];
  replayIds: string[];
}

export interface FrontierCodexSemanticImportQuality {
  expected: boolean;
  expectedSatisfied: boolean;
  expectedMissingReasonCodes: string[];
  present: boolean;
  empty: boolean;
  total: number;
  lossCount: number;
  lossesBySeverity: Record<string, number>;
  candidates: number;
  selected: number;
  eligible: number;
  imported: number;
  errors: number;
  semanticErrorLosses: number;
  semanticWarningLosses: number;
  symbols: number;
  ownershipRegions: number;
  patchHints: number;
  semanticReadiness: Record<string, number>;
  sourceProjectionTotal: number;
  sourceProjectionPreserved: number;
  sourceProjectionStubs: number;
  sourceProjectionReady: number;
  sourceProjectionNeedsReview: number;
  sourceProjectionBlocked: number;
  nativeCompileTotal: number;
  nativeCompileEmitted: number;
  nativeCompilePreserved: number;
  nativeCompileTargetStubs: number;
  nativeCompileReady: number;
  nativeCompileNeedsReview: number;
  nativeCompileBlocked: number;
  semanticFacts: number;
  semanticFactPredicates: string[];
  semanticFactSummary: Record<string, number>;
  dependencyRelations: number;
  dependencyPredicates: string[];
  dependencyEdges: string[];
  dependencyEdgeHints: string[];
  sourceMapMappings: number;
  universalAstLayers: number;
  universalAstLayerNames: string[];
  proofSpecObligations: number;
  proofSpecFailedObligations: number;
  paradigmSemanticsRecords: number;
  paradigmSemanticsGroups: number;
  paradigmSemanticsLoweringRecords: number;
  semanticSliceAdmissionTotal: number;
  semanticSliceAdmissionAdmitted: number;
  semanticSliceAdmissionPrioritized: number;
  semanticSliceAdmissionRejected: number;
  semanticLineageEvents: number;
  semanticLineageMoved: number;
  semanticLineageRenamed: number;
  semanticLineageDeleted: number;
  semanticLineageAmbiguous: number;
  semanticLineageBlocked: number;
  semanticLineageNeedsReview: number;
  semanticLineageEventKinds: string[];
  semanticLineageReasonCodes: string[];
  semanticEditScript: FrontierCodexSemanticEditScriptSummary;
  semanticEditProjection: FrontierCodexSemanticEditProjectionSummary;
  semanticEditReplay: FrontierCodexSemanticEditReplaySummary;
  semanticEditAdmission: FrontierCodexSemanticEditAdmissionDecision;
  semanticMergeAdmission: FrontierCodexSemanticMergeAdmissionSummary;
  jsTsSafeMergeApply: FrontierCodexJsTsSafeMergeApplySummary;
  warnings: string[];
}
