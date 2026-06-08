import type {
  FrontierSwarmCommand,
  FrontierSwarmCoordinatorDashboard,
  FrontierSwarmEvidenceIndex,
  FrontierSwarmMergeAdmission,
  FrontierSwarmMergeBundle,
  FrontierSwarmMergeIndex,
  FrontierSwarmStrategyTournament,
  FrontierSwarmQueueOverlay
} from '@shapeshift-labs/frontier-swarm';
import type {
  FRONTIER_SWARM_CODEX_APPLY_LEDGER_KIND,
  FRONTIER_SWARM_CODEX_APPLY_LEDGER_VERSION,
  FRONTIER_SWARM_CODEX_COLLECTION_KIND,
  FRONTIER_SWARM_CODEX_COLLECTION_VERSION,
  FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND,
  FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION
} from './constants.js';
import type { FrontierCodexCompactDashboard } from './types-evidence.js';

export type FrontierCodexCollectBucket =
  | 'ready-to-apply'
  | 'needs-human-port'
  | 'failed-evidence'
  | 'stale-against-head';

export interface FrontierCodexCollectInput {
  run: string;
  outDir?: string;
  cwd?: string;
  checkStale?: boolean;
  semanticImportExpected?: boolean;
  branchPrefix?: string;
}

export interface FrontierCodexCollectedBundle {
  bucket: FrontierCodexCollectBucket;
  jobId: string;
  mergePath: string;
  outputDir: string;
  bundle: FrontierSwarmMergeBundle;
}

export interface FrontierCodexCollectResult {
  kind: typeof FRONTIER_SWARM_CODEX_COLLECTION_KIND;
  version: typeof FRONTIER_SWARM_CODEX_COLLECTION_VERSION;
  ok: boolean;
  runDir: string;
  outDir: string;
  generatedAt: number;
  buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>;
  mergeIndex: FrontierSwarmMergeIndex;
  queueOverlay: FrontierSwarmQueueOverlay;
  strategyTournament: FrontierSwarmStrategyTournament;
  evidenceIndex: FrontierSwarmEvidenceIndex;
  admission: FrontierSwarmMergeAdmission;
  dashboard: FrontierSwarmCoordinatorDashboard;
  compactDashboard: FrontierCodexCompactDashboard;
  summary: Record<FrontierCodexCollectBucket, number> & { total: number };
}

export type FrontierCodexApplyStatus = 'checked' | 'applied' | 'committed' | 'skipped' | 'failed';

export interface FrontierCodexApplyInput {
  collection?: string;
  run?: string;
  outDir?: string;
  cwd?: string;
  bucket?: FrontierCodexCollectBucket | 'all';
  jobIds?: readonly string[];
  dryRun?: boolean;
  allowDirty?: boolean;
  commit?: boolean;
  branchPrefix?: string;
  limit?: number;
}

export interface FrontierCodexApplyEntry {
  jobId: string;
  status: FrontierCodexApplyStatus;
  bundlePath: string;
  patchPath?: string;
  branchName?: string;
  commit?: string;
  dryRun: boolean;
  commands: Array<{ command: string[]; status: number; stdoutTail: string[]; stderrTail: string[] }>;
  error?: string;
}

export interface FrontierCodexApplyResult {
  kind: typeof FRONTIER_SWARM_CODEX_APPLY_LEDGER_KIND;
  version: typeof FRONTIER_SWARM_CODEX_APPLY_LEDGER_VERSION;
  ok: boolean;
  cwd: string;
  collectionDir: string;
  outDir: string;
  generatedAt: number;
  dryRun: boolean;
  entries: FrontierCodexApplyEntry[];
  summary: {
    total: number;
    checked: number;
    applied: number;
    committed: number;
    skipped: number;
    failed: number;
  };
}

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
  dependencyRelations: number;
  dependencyPredicates: string[];
  universalAstLayers: number;
  universalAstLayerNames: string[];
  proofSpecObligations: number;
  proofSpecFailedObligations: number;
  paradigmSemanticsRecords: number;
  paradigmSemanticsGroups: number;
  paradigmSemanticsLoweringRecords: number;
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
