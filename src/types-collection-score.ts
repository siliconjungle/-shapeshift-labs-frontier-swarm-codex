import type { FrontierSwarmCommand } from '@shapeshift-labs/frontier-swarm';
import type {
  FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND,
  FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION
} from './constants.js';
import type { FrontierCodexCollectBucket } from './types-collection.js';
import type { FrontierCodexContextBudgetReport } from './types-evidence.js';
import type { FrontierCodexPatchScoreCalibration } from './types-score-calibration.js';
import type {
  FrontierCodexSemanticEditAdmissionDecision,
  FrontierCodexSemanticEditScriptSummary
} from './types-semantic-edit.js';
import type { FrontierCodexSemanticEditProjectionSummary } from './types-semantic-edit-projection.js';
import type { FrontierCodexSemanticEditReplaySummary } from './types-semantic-edit-replay.js';

export type FrontierCodexPatchScoreStatus =
  | 'accepted-clean'
  | 'accepted-needs-port'
  | 'conflict'
  | 'test-fail'
  | 'stale'
  | 'evidence-only';

export interface FrontierCodexPatchScoreInput {
  collection?: string;
  run?: string;
  outDir?: string;
  cwd?: string;
  bucket?: FrontierCodexCollectBucket | 'all';
  jobIds?: readonly string[];
  workspaceIncludes?: readonly string[];
  workspaceExcludes?: readonly string[];
  focusedCommands?: readonly (string | FrontierSwarmCommand)[];
  globalCommands?: readonly (string | FrontierSwarmCommand)[];
  globalGlobs?: readonly string[];
  limit?: number;
  keepWorkspaces?: boolean;
}

export interface FrontierCodexPatchScoreSemanticEvidence {
  present: boolean;
  total: number;
  imported: number;
  errors: number;
  sourceMapMappings: number;
  semanticSymbols: number;
  ownershipRegions: number;
  patchHints: number;
  semanticFacts: number;
  semanticFactPredicates: string[];
  semanticFactSummary: Record<string, number>;
  dependencyRelations: number;
  dependencyPredicates: string[];
  dependencyEdges: string[];
  dependencyEdgeHints: string[];
  universalAstLayers: number;
  universalAstLayerNames: string[];
  proofSpecObligations: number;
  proofSpecFailedObligations: number;
  paradigmSemanticsRecords: number;
  paradigmSemanticsGroups: number;
  paradigmSemanticsLoweringRecords: number;
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
  semanticEditOperationAutoMergeCandidate: boolean;
  semanticEditOperationCleanEligible: boolean;
  readiness: Record<string, number>;
  lossesBySeverity: Record<string, number>;
  scoreAdjustment: number;
  cleanEligible: boolean;
  reasons: string[];
}

export interface FrontierCodexPatchScoreEntry {
  jobId: string;
  status: FrontierCodexPatchScoreStatus;
  score: number;
  bundlePath: string;
  patchPath?: string;
  workspacePath?: string;
  changedPaths: string[];
  reasons: string[];
  semanticEvidence: FrontierCodexPatchScoreSemanticEvidence;
  contextBudget?: FrontierCodexContextBudgetReport;
  commands: Array<{ command: string[]; status: number; stdoutTail: string[]; stderrTail: string[] }>;
}

export interface FrontierCodexPatchScoreResult {
  kind: typeof FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND;
  version: typeof FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION;
  ok: boolean;
  cwd: string;
  collectionDir: string;
  outDir: string;
  generatedAt: number;
  entries: FrontierCodexPatchScoreEntry[];
  summary: Record<FrontierCodexPatchScoreStatus, number> & { total: number };
  calibration: FrontierCodexPatchScoreCalibration;
}

export type FrontierCodexHandoffArtifactKind =
  | 'debug-handoff'
  | 'replay'
  | 'watchpoint'
  | 'trace'
  | 'diagnostic'
  | 'log'
  | 'last-message'
  | 'evidence'
  | string;

export interface FrontierCodexHandoffArtifact {
  path: string;
  kind: FrontierCodexHandoffArtifactKind;
  bytes?: number;
}

export interface FrontierCodexHandoffDiscoveryInput {
  root: string;
  maxDepth?: number;
  maxArtifacts?: number;
}
