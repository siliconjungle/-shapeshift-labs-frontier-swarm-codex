import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  FRONTIER_SWARM_DEFAULT_MODEL,
  FRONTIER_SWARM_DEFAULT_REASONING_EFFORT,
  checkSwarmOwnership,
  completeSwarmJob,
  FRONTIER_SWARM_MERGE_BUNDLE_KIND,
  FRONTIER_SWARM_MERGE_BUNDLE_VERSION,
  FRONTIER_SWARM_QUEUE_OVERLAY_KIND,
  FRONTIER_SWARM_QUEUE_OVERLAY_VERSION,
  createSwarmHierarchicalMergeQueue,
  createSwarmMergeAdmission,
  createSwarmMergeBundle,
  createSwarmMergeIndex,
  createSwarmPatchStackPlan,
  createSwarmQueueOverlay,
  createSwarmReviewerLanePlan,
  matchesGlob,
  createSwarmManifest,
  createSwarmEventStream,
  createSwarmLeases,
  createSwarmPlan,
  createSwarmProof,
  createSwarmRun,
  createSwarmSchedule,
  defineSwarmTasks,
  recordSwarmEvent,
  routeSwarmEventToMailboxes,
  type FrontierSwarmCommand,
  type FrontierSwarmEventInput,
  type FrontierSwarmEventStream,
  type FrontierSwarmJob,
  type FrontierSwarmJobResultInput,
  type FrontierSwarmMergeAdmission,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmMergeIndex,
  type FrontierSwarmLease,
  type FrontierSwarmManifestInput,
  type FrontierSwarmHierarchicalMergeQueue,
  type FrontierSwarmMergeQueueAssignmentAction,
  type FrontierSwarmPatchStackPlan,
  type FrontierSwarmPlan,
  type FrontierSwarmPlanInput,
  type FrontierSwarmQueueOverlay,
  type FrontierSwarmReviewerLanePlan,
  type FrontierSwarmRiskLevel,
  type FrontierSwarmRun,
  type FrontierSwarmTaskInput
} from '@shapeshift-labs/frontier-swarm';

export const FRONTIER_SWARM_CODEX_DEFAULT_MODEL = FRONTIER_SWARM_DEFAULT_MODEL;
export const FRONTIER_SWARM_CODEX_DEFAULT_REASONING_EFFORT = FRONTIER_SWARM_DEFAULT_REASONING_EFFORT;
export const FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_KIND = 'frontier.swarm-codex.workspace-manifest';
export const FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_VERSION = 1;
export const FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_KIND = 'frontier.swarm-codex.workspace-proof';
export const FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_VERSION = 1;
export const FRONTIER_SWARM_CODEX_PID_MANIFEST_KIND = 'frontier.swarm-codex.pid-manifest';
export const FRONTIER_SWARM_CODEX_PID_MANIFEST_VERSION = 1;
export const FRONTIER_SWARM_CODEX_COLLECTION_KIND = 'frontier.swarm-codex.collection';
export const FRONTIER_SWARM_CODEX_COLLECTION_VERSION = 1;
export const FRONTIER_SWARM_CODEX_APPLY_LEDGER_KIND = 'frontier.swarm-codex.apply-ledger';
export const FRONTIER_SWARM_CODEX_APPLY_LEDGER_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND = 'frontier.swarm-codex.autonomous-apply';
export const FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_KIND = 'frontier.swarm-codex.autonomous-merge-decision';
export const FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND = 'frontier.swarm-codex.auto-drain';
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_GROUPING_KIND = 'frontier.swarm-codex.auto-drain-grouping';
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_GROUPING_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND = 'frontier.swarm-codex.auto-drain-artifacts';
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_VERSION = 1;
export const FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND = 'frontier.swarm-codex.coordinator-agent-drain';
export const FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_VERSION = 1;
export const FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND = 'frontier.swarm-codex.patch-score';
export const FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION = 1;
export const FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND = 'frontier.swarm-codex.semantic-imports';
export const FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_KIND = 'frontier.swarm-codex.dashboard-queue-metadata';
export const FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_HEALTH_KIND = 'frontier.swarm-codex.dashboard-queue-health';
export const FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_HEALTH_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_KIND = 'frontier.swarm-codex.dashboard-human-questions';
export const FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_VERSION = 1;

export type FrontierCodexModelPolicy = 'config-default' | 'plan' | 'explicit';

const DEFAULT_WORKSPACE_INCLUDES = ['AGENTS.md', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'config'];
const DEFAULT_WORKSPACE_EXCLUDES = [
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.frontier-framework',
  'agent-runs',
  'target'
];
const AUTONOMOUS_APPLY_REPO_LOCK_KEY = 'repo:*';
const pidManifestWriteQueues = new Map<string, Promise<void>>();

export type FrontierCodexSwarmWorkspaceMode = 'current' | 'git-worktree' | 'snapshot' | 'copy';

export interface FrontierCodexSwarmWorkspaceInput {
  mode?: FrontierCodexSwarmWorkspaceMode;
  root?: string;
  create?: boolean;
  replace?: boolean;
  includes?: readonly string[];
  excludes?: readonly string[];
  artifactIncludes?: readonly string[];
  linkPaths?: readonly string[];
  requiredIncludes?: readonly string[];
  optionalIncludes?: readonly string[];
  strategy?: 'fs-cp' | 'rsync' | 'git-archive' | string;
  guardRoot?: string;
  linkNodeModules?: boolean;
  skipGitRepoCheck?: boolean;
}

export interface FrontierCodexSwarmRunOptions {
  outDir: string;
  cwd?: string;
  codexPath?: string;
  maxConcurrency?: number;
  workspace?: FrontierCodexSwarmWorkspaceInput;
  sandbox?: string;
  approval?: string | false;
  model?: string | false;
  modelPolicy?: FrontierCodexModelPolicy;
  forwardPlanModel?: boolean;
  forwardPlanReasoningEffort?: boolean;
  reasoningEffort?: string | false;
  profile?: string;
  ephemeral?: boolean;
  dryRun?: boolean;
  runVerification?: boolean;
  collectGitStatus?: boolean;
  jobTimeoutMs?: number;
  addDirs?: readonly string[];
  executor?: FrontierCodexExecutor;
  eventStream?: FrontierSwarmEventStream;
  coordinatorSnapshotPath?: string;
  pidManifestPath?: string;
  prepareJobWorkspace?: FrontierCodexJobWorkspaceHook;
  renderJobPrompt?: FrontierCodexJobPromptHook;
  changedPathFilter?: FrontierCodexChangedPathFilter;
  semanticImport?: boolean | FrontierCodexSemanticImportOptions;
  autoDrain?: boolean | FrontierCodexSwarmAutoDrainOptions;
  onJobStarted?: FrontierCodexJobStartedHook;
  onJobFinished?: FrontierCodexJobFinishedHook;
  onSwarmFinished?: FrontierCodexSwarmFinishedHook;
}

export interface FrontierCodexSwarmAutoDrainOptions {
  enabled?: boolean;
  outDir?: string;
  dryRun?: boolean;
  allowDirty?: boolean;
  commit?: boolean;
  branchPrefix?: string;
  limit?: number;
  maxIterations?: number;
  maxReady?: number;
  maxChangedPaths?: number;
  maxChangedRegions?: number;
  maxHighRisk?: number;
  allowRisks?: readonly FrontierSwarmRiskLevel[];
  admitConflictLeaders?: boolean;
  checkStale?: boolean;
  focusedCommands?: readonly (string | FrontierSwarmCommand)[];
  globalCommands?: readonly (string | FrontierSwarmCommand)[];
  globalGlobs?: readonly string[];
  decisionLogPath?: string;
  lockPath?: string;
  lockTimeoutMs?: number;
  lockStaleMs?: number;
}

export interface FrontierCodexSemanticImportOptions {
  enabled?: boolean;
  maxFiles?: number;
  maxBytes?: number;
  include?: readonly string[];
  exclude?: readonly string[];
  languages?: Readonly<Record<string, string>>;
}

export interface FrontierCodexSemanticImportRecord {
  path: string;
  language?: string;
  status: 'imported' | 'skipped' | 'error';
  reason?: string;
  bytes?: number;
  importId?: string;
  universalAstHash?: string;
  nativeAstId?: string;
  nativeSourceId?: string;
  sourceMapCount?: number;
  sourceMapMappingCount?: number;
  evidenceCount?: number;
  lossCount?: number;
  losses?: unknown;
  semanticIndex?: {
    documents: number;
    symbols: number;
    occurrences: number;
    relations: number;
    facts: number;
  };
  mergeCandidate?: unknown;
  error?: string;
}

export interface FrontierCodexSemanticImportSidecar {
  kind: typeof FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND;
  version: typeof FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_VERSION;
  generatedAt: number;
  jobId: string;
  taskId?: string;
  records: FrontierCodexSemanticImportRecord[];
  summary: {
    total: number;
    selected: number;
    eligible: number;
    omitted: number;
    maxFiles: number;
    imported: number;
    skipped: number;
    errors: number;
    sourceMapCount: number;
    sourceMapMappingCount: number;
    lossCount: number;
    lossesBySeverity: Record<string, number>;
    semanticIndex: {
      documents: number;
      symbols: number;
      occurrences: number;
      relations: number;
      facts: number;
    };
    readiness: Record<string, number>;
  };
}

export interface FrontierCodexWorkspacePlan {
  mode: FrontierCodexSwarmWorkspaceMode;
  root: string;
  path: string;
  includes: string[];
  excludes: string[];
  artifactIncludes: string[];
  linkPaths: string[];
  requiredIncludes: string[];
  optionalIncludes: string[];
  strategy: string;
  guardRoot?: string;
  linkNodeModules: boolean;
  replace: boolean;
  skipGitRepoCheck: boolean;
}

export interface FrontierCodexJobPaths {
  jobDir: string;
  promptPath: string;
  eventsPath: string;
  stderrPath: string;
  lastMessagePath: string;
  evidenceDir: string;
  resourceAllocationPath: string;
  workspaceProofPath: string;
  patchPath: string;
  mergeBundlePath: string;
  pidManifestPath: string;
}

export interface FrontierCodexBrowserAllocation {
  required: boolean;
  portPool: string[];
  port?: string;
  profileDir?: string;
  headless?: boolean;
}

export interface FrontierCodexResourceAllocation {
  capabilities: string[];
  resources: Record<string, number>;
  env: Record<string, string>;
  browser?: FrontierCodexBrowserAllocation;
}

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
  branchPrefix?: string;
}

export interface FrontierCodexCollectedBundle {
  bucket: FrontierCodexCollectBucket;
  jobId: string;
  mergePath: string;
  outputDir: string;
  bundle: FrontierSwarmMergeBundle;
}

export interface FrontierCodexCollectArtifacts {
  collectionPath: string;
  mergeIndexPath: string;
  hierarchicalMergeQueuePath: string;
  queueOverlayPath: string;
  mergeAdmissionPath: string;
  reviewerLanePlanPath: string;
  patchStackPlanPath: string;
  bucketDirs: Record<FrontierCodexCollectBucket, string>;
  counts: {
    groupedBundleCount: number;
    readyToApplyCount: number;
    needsHumanPortCount: number;
    failedEvidenceCount: number;
    staleAgainstHeadCount: number;
    admittedCount: number;
    deferredCount: number;
    reviewerAssignmentCount: number;
    reviewerTaskCount: number;
    patchStackCount: number;
    patchStackJobCount: number;
    conflictedPatchStackCount: number;
    mergeQueueScopeCount: number;
    mergeQueueApplyLocalCount: number;
    mergeQueueQueueLocalCount: number;
    mergeQueuePromoteCount: number;
    mergeQueueRerunCount: number;
    mergeQueueRejectCount: number;
    mergeQueueBlockCount: number;
    mergeQueueRecordOnlyCount: number;
    patchCount: number;
  };
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
  hierarchicalMergeQueue?: FrontierSwarmHierarchicalMergeQueue;
  mergeAdmission?: FrontierSwarmMergeAdmission;
  reviewerLanePlan?: FrontierSwarmReviewerLanePlan;
  patchStackPlan?: FrontierSwarmPatchStackPlan;
  queueOverlay: FrontierSwarmQueueOverlay;
  summary: Record<FrontierCodexCollectBucket, number> & {
    total: number;
    admittedCount?: number;
    deferredCount?: number;
    reviewerAssignmentCount?: number;
    reviewerTaskCount?: number;
    patchStackCount?: number;
    mergeQueueScopeCount?: number;
    mergeQueueApplyLocalCount?: number;
    mergeQueueQueueLocalCount?: number;
    mergeQueuePromoteCount?: number;
    mergeQueueRerunCount?: number;
    mergeQueueRejectCount?: number;
    mergeQueueBlockCount?: number;
    mergeQueueRecordOnlyCount?: number;
  };
  artifacts?: FrontierCodexCollectArtifacts;
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

export type FrontierCodexAutonomousDecisionStatus =
  | 'checked'
  | 'applied'
  | 'committed'
  | 'rejected'
  | 'rerun'
  | 'conflict-blocked'
  | 'human-blocked'
  | 'skipped'
  | 'failed';

export type FrontierCodexAutonomousLockScope = 'semantic' | 'path' | 'repo';

export interface FrontierCodexAutonomousApplyLockKeys {
  scope: FrontierCodexAutonomousLockScope;
  keys: string[];
}

export interface FrontierCodexAutonomousLockScopeCounts {
  semantic: number;
  path: number;
  repo: number;
}

export interface FrontierCodexAutonomousApplyInput {
  collection?: string;
  run?: string;
  outDir?: string;
  cwd?: string;
  jobIds?: readonly string[];
  dryRun?: boolean;
  allowDirty?: boolean;
  commit?: boolean;
  branchPrefix?: string;
  limit?: number;
  checkStale?: boolean;
  focusedCommands?: readonly (string | FrontierSwarmCommand)[];
  globalCommands?: readonly (string | FrontierSwarmCommand)[];
  globalGlobs?: readonly string[];
  decisionLogPath?: string;
  lockPath?: string;
  lockTimeoutMs?: number;
  lockStaleMs?: number;
}

export interface FrontierCodexAutonomousMergeDecision {
  kind: typeof FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_KIND;
  version: typeof FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_VERSION;
  id: string;
  runId?: string;
  planId?: string;
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  status: FrontierCodexAutonomousDecisionStatus;
  reason: string;
  bundlePath: string;
  patchPath?: string;
  changedPaths: string[];
  changedRegions: string[];
  lockScope: FrontierCodexAutonomousLockScope;
  lockKeys: string[];
  startedAt: number;
  finishedAt: number;
  dryRun: boolean;
  headBefore?: string;
  headAfter?: string;
  lockPath?: string;
  lockToken?: string;
  commands: Array<{ command: string[]; status: number; stdoutTail: string[]; stderrTail: string[] }>;
  error?: string;
}

export interface FrontierCodexAutonomousApplyResult {
  kind: typeof FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND;
  version: typeof FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_VERSION;
  ok: boolean;
  cwd: string;
  collectionDir: string;
  outDir: string;
  generatedAt: number;
  dryRun: boolean;
  decisionLogPath: string;
  lockPath: string;
  decisions: FrontierCodexAutonomousMergeDecision[];
  lockKeys: string[];
  lockScopeCounts: FrontierCodexAutonomousLockScopeCounts;
  queueOverlay: FrontierSwarmQueueOverlay;
  summary: Record<FrontierCodexAutonomousDecisionStatus, number> & { total: number };
}

export type FrontierCodexSwarmAutoDrainGroupingConflictKind = 'path' | 'region' | 'unscoped';
export type FrontierCodexSwarmAutoDrainGroupingPlacement = 'compatible' | 'serialized' | 'deferred';
export type FrontierCodexCoordinatorAgentDrainDecision = 'selected' | 'deferred';

export interface FrontierCodexCoordinatorAgentDrainAssignment {
  jobId: string;
  taskId?: string;
  lane?: string;
  queueItemIds: string[];
  queueAction: FrontierSwarmMergeQueueAssignmentAction;
  decision: FrontierCodexCoordinatorAgentDrainDecision;
  selected: boolean;
  scopeId: string;
  parentScopeIds: string[];
  leaseKey: string;
  promoteToScopeId?: string;
  changedPaths: string[];
  changedRegions: string[];
  conflictingJobIds: string[];
  serializesAfterJobIds: string[];
  leaderJobIds: string[];
  reasons: string[];
  selectionReason: string;
}

export interface FrontierCodexCoordinatorAgentDrainArtifact {
  kind: typeof FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND;
  version: typeof FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_VERSION;
  id: string;
  runId?: string;
  generatedAt: number;
  iteration: number;
  collectionDir: string;
  mergeQueueId: string;
  admissionId?: string;
  readyJobIds: string[];
  admittedJobIds: string[];
  deferredJobIds: string[];
  assignments: FrontierCodexCoordinatorAgentDrainAssignment[];
  summary: {
    assignmentCount: number;
    selectedCount: number;
    deferredCount: number;
    applyLocalCount: number;
    queueLocalCount: number;
    promoteCount: number;
    selectedQueueLocalCount: number;
    selectedPromoteCount: number;
    deferredPromoteCount: number;
    scopeCount: number;
  };
}

export interface FrontierCodexSwarmAutoDrainGroupingConflict {
  kind: FrontierCodexSwarmAutoDrainGroupingConflictKind;
  key: string;
  jobIds: [string, string];
  value?: string;
}

export interface FrontierCodexSwarmAutoDrainGroupingJob {
  jobId: string;
  taskId?: string;
  lane?: string;
  queueItemIds: string[];
  bundlePath?: string;
  patchPath?: string;
  changedPaths: string[];
  changedRegions: string[];
  scopeKeys: string[];
  placement: FrontierCodexSwarmAutoDrainGroupingPlacement;
  groupId?: string;
  serializesAfterJobIds: string[];
  conflicts: FrontierCodexSwarmAutoDrainGroupingConflict[];
  coordinatorAgent?: FrontierCodexCoordinatorAgentDrainAssignment;
  reason?: string;
}

export interface FrontierCodexSwarmAutoDrainGroup {
  id: string;
  index: number;
  jobIds: string[];
  queueItemIds: string[];
  changedPaths: string[];
  changedRegions: string[];
  scopeKeys: string[];
  parallelizable: boolean;
  requiresSerialization: boolean;
  serializesAfterJobIds: string[];
}

export interface FrontierCodexSwarmAutoDrainGroupingArtifact {
  kind: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_GROUPING_KIND;
  version: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_GROUPING_VERSION;
  id: string;
  runId?: string;
  generatedAt: number;
  iteration: number;
  collectionDir: string;
  readyJobIds: string[];
  admittedJobIds: string[];
  deferredJobIds: string[];
  groups: FrontierCodexSwarmAutoDrainGroup[];
  jobs: FrontierCodexSwarmAutoDrainGroupingJob[];
  conflicts: FrontierCodexSwarmAutoDrainGroupingConflict[];
  summary: {
    readyCount: number;
    admittedCount: number;
    deferredCount: number;
    groupCount: number;
    compatibleGroupCount: number;
    serializedJobCount: number;
    conflictCount: number;
    pathConflictCount: number;
    regionConflictCount: number;
    unscopedConflictCount: number;
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

export interface FrontierCodexPatchScoreEntry {
  jobId: string;
  status: FrontierCodexPatchScoreStatus;
  score: number;
  bundlePath: string;
  patchPath?: string;
  workspacePath?: string;
  changedPaths: string[];
  reasons: string[];
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

export interface FrontierCodexWorkspaceManifest {
  kind: typeof FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_KIND;
  version: typeof FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_VERSION;
  id: string;
  mode: FrontierCodexSwarmWorkspaceMode;
  root: string;
  path: string;
  includes: string[];
  excludes: string[];
  artifactIncludes: string[];
  linkPaths: string[];
  requiredIncludes: string[];
  optionalIncludes: string[];
  strategy: string;
  guardRoot?: string;
  linkNodeModules: boolean;
  skipGitRepoCheck: boolean;
}

export interface FrontierCodexWorkspaceProof {
  kind: typeof FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_KIND;
  version: typeof FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_VERSION;
  id: string;
  generatedAt: number;
  manifest: FrontierCodexWorkspaceManifest;
  copiedPaths: string[];
  linkedPaths: string[];
  missingRequired: string[];
  missingOptional: string[];
  ignoredChangedPaths: string[];
  summary: {
    copiedCount: number;
    linkedCount: number;
    missingRequiredCount: number;
    missingOptionalCount: number;
    ignoredChangedPathCount: number;
  };
}

export interface FrontierCodexPidEntry {
  pid: number;
  role: 'parent' | 'codex' | string;
  runId?: string;
  jobId?: string;
  startedAt: number;
  command?: string[];
}

export interface FrontierCodexPidManifest {
  kind: typeof FRONTIER_SWARM_CODEX_PID_MANIFEST_KIND;
  version: typeof FRONTIER_SWARM_CODEX_PID_MANIFEST_VERSION;
  runId?: string;
  entries: FrontierCodexPidEntry[];
}

export interface FrontierCodexStopResult {
  ok: boolean;
  pidManifestPath: string;
  signal: NodeJS.Signals;
  stopped: number[];
  missing: number[];
  errors: Array<{ pid: number; error: string }>;
}

export interface FrontierCodexExecutorInput {
  job: FrontierSwarmJob;
  prompt: string;
  args: string[];
  cwd: string;
  workspacePath: string;
  codexPath: string;
  paths: FrontierCodexJobPaths;
  resourceAllocation: FrontierCodexResourceAllocation;
  env: Record<string, string>;
  timeoutMs: number;
}

export interface FrontierCodexExecutorResult {
  exitCode: number;
  signal?: string;
  changedPaths?: readonly string[];
  lastMessage?: string;
  error?: unknown;
}

export type FrontierCodexExecutor = (input: FrontierCodexExecutorInput) => Promise<FrontierCodexExecutorResult>;

export interface FrontierCodexJobHookInput {
  job: FrontierSwarmJob;
  cwd: string;
  outDir: string;
  workspacePath: string;
  workspacePlan: FrontierCodexWorkspacePlan;
  paths: FrontierCodexJobPaths;
  resourceAllocation: FrontierCodexResourceAllocation;
}

export interface FrontierCodexJobPromptHookInput extends FrontierCodexJobHookInput {
  prompt: string;
}

export interface FrontierCodexJobStartedHookInput extends FrontierCodexJobHookInput {
  prompt: string;
  args: string[];
}

export interface FrontierCodexJobFinishedHookInput {
  job: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
}

export interface FrontierCodexSwarmFinishedHookInput {
  result: FrontierCodexSwarmRunResult;
}

export type FrontierCodexJobWorkspaceHook = (input: FrontierCodexJobHookInput) => Promise<void> | void;
export type FrontierCodexJobPromptHook = (input: FrontierCodexJobPromptHookInput) => Promise<string> | string;
export type FrontierCodexChangedPathFilter = (paths: readonly string[], input: FrontierCodexJobHookInput) => readonly string[];
export type FrontierCodexJobStartedHook = (input: FrontierCodexJobStartedHookInput) => Promise<void> | void;
export type FrontierCodexJobFinishedHook = (input: FrontierCodexJobFinishedHookInput) => Promise<void> | void;
export type FrontierCodexSwarmFinishedHook = (input: FrontierCodexSwarmFinishedHookInput) => Promise<void> | void;

export interface FrontierCodexSwarmAutoDrainIteration {
  index: number;
  collection: FrontierCodexCollectResult;
  admission: FrontierSwarmMergeAdmission;
  admissionPath: string;
  admittedJobIds: string[];
  deferredJobIds: string[];
  readyJobIds: string[];
  coordinatorAgentDrainPath: string;
  coordinatorAgentDrain: FrontierCodexCoordinatorAgentDrainArtifact;
  groupingPath: string;
  grouping: FrontierCodexSwarmAutoDrainGroupingArtifact;
  apply?: FrontierCodexAutonomousApplyResult;
  postApplyCollection?: FrontierCodexCollectResult;
  postApplyCollectionPath?: string;
  lockKeys: string[];
  lockScopeCounts: FrontierCodexAutonomousLockScopeCounts;
  terminalJobIds: string[];
  blockedJobIds: string[];
}

export interface FrontierCodexAutoDrainArtifactIteration {
  index: number;
  collectionPath: string;
  mergeIndexPath: string;
  hierarchicalMergeQueuePath: string;
  queueOverlayPath: string;
  mergeAdmissionPath: string;
  reviewerLanePlanPath: string;
  patchStackPlanPath: string;
  coordinatorAgentDrainPath?: string;
  postApplyCollectionPath?: string;
  groupingPath?: string;
  applyPath?: string;
  autonomousQueueOverlayPath?: string;
  decisionLogPath?: string;
  patchPaths: string[];
  readyJobCount: number;
  groupedBundleCount: number;
  readyToApplyCount: number;
  needsHumanPortCount: number;
  failedEvidenceCount: number;
  staleAgainstHeadCount: number;
  decisionCount: number;
  admittedCount: number;
  deferredCount: number;
  reviewerAssignmentCount: number;
  reviewerTaskCount: number;
  patchStackCount: number;
  patchStackJobCount: number;
  conflictedPatchStackCount: number;
  mergeQueueScopeCount: number;
  mergeQueueApplyLocalCount: number;
  mergeQueueQueueLocalCount: number;
  mergeQueuePromoteCount: number;
  mergeQueueRerunCount: number;
  mergeQueueRejectCount: number;
  mergeQueueBlockCount: number;
  mergeQueueRecordOnlyCount: number;
}

export interface FrontierCodexAutoDrainArtifactPathGroup {
  paths: string[];
  count: number;
}

export interface FrontierCodexAutoDrainArtifactMetadata {
  kind: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND;
  version: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_VERSION;
  outDir: string;
  autoDrainPath: string;
  generatedAt: number;
  admission: FrontierCodexAutoDrainArtifactPathGroup & {
    admittedCount: number;
    deferredCount: number;
  };
  grouping: FrontierCodexAutoDrainArtifactPathGroup & {
    collectionCount: number;
    groupedBundleCount: number;
    readyToApplyCount: number;
    needsHumanPortCount: number;
    failedEvidenceCount: number;
    staleAgainstHeadCount: number;
  };
  reviewer: FrontierCodexAutoDrainArtifactPathGroup & {
    assignmentCount: number;
    taskCount: number;
    decisionCount: number;
  };
  coordinatorAgent: FrontierCodexAutoDrainArtifactPathGroup & {
    assignmentCount: number;
    selectedCount: number;
    deferredCount: number;
    promoteCount: number;
    queueLocalCount: number;
  };
  patchStack: FrontierCodexAutoDrainArtifactPathGroup & {
    stackCount: number;
    jobCount: number;
    conflictedStackCount: number;
    patchCount: number;
  };
  mergeQueue: FrontierCodexAutoDrainArtifactPathGroup & {
    scopeCount: number;
    applyLocalCount: number;
    queueLocalCount: number;
    promoteCount: number;
    rerunCount: number;
    rejectCount: number;
    blockCount: number;
    recordOnlyCount: number;
  };
  iterations: FrontierCodexAutoDrainArtifactIteration[];
  summary: {
    pathCount: number;
    iterationCount: number;
    collectionCount: number;
    applyCount: number;
    admissionCount: number;
    coordinatorAgentDrainCount: number;
    mergeQueuePlanCount: number;
    reviewerPlanCount: number;
    patchStackPlanCount: number;
    decisionCount: number;
    patchCount: number;
  };
}

export interface FrontierCodexDashboardQueueMetadata {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_VERSION;
  source: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND | 'not-collected';
  available: boolean;
  paths: {
    autoDrain: string[];
    collections: string[];
    mergeQueues: string[];
    queueOverlays: string[];
  };
  actionCounts: {
    applyLocalCount: number;
    queueLocalCount: number;
    promoteCount: number;
    rerunCount: number;
    rejectCount: number;
    blockCount: number;
    trueBlockerCount: number;
    conflictBlockedDecisionCount: number;
    recordOnlyCount: number;
  };
  bucketCounts: {
    readyToApplyCount: number;
    needsHumanPortCount: number;
    failedEvidenceCount: number;
    staleAgainstHeadCount: number;
  };
  queueHealth: FrontierCodexDashboardQueueHealth;
  humanQuestions: FrontierCodexDashboardHumanQuestions;
}

export interface FrontierCodexDashboardQueueHealth {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_HEALTH_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_HEALTH_VERSION;
  source: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND | 'not-collected';
  available: boolean;
  activeCoordinatorQueueCount: number;
  leaseCount: number;
  lockKeyCount: number;
  lockScopeCounts: FrontierCodexAutonomousLockScopeCounts;
  localQueueCount: number;
  promotedCount: number;
  appliedDecisionCount: number;
  committedDecisionCount: number;
  staleOrRerunCount: number;
  staleCount: number;
  rerunCount: number;
  conflictBlockedDecisionCount: number;
  trueBlockerCount: number;
  rejectedCount: number;
  recordOnlyCount: number;
  coordinatorReviewCount: number;
  coordinatorReviewAssignmentCount: number;
  coordinatorReviewTaskCount: number;
  humanQuestionCount: number;
}

export interface FrontierCodexDashboardHumanQuestions {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_VERSION;
  source: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND | 'not-collected';
  available: boolean;
  count: number;
  decisionCount: number;
  jobIds: string[];
  taskIds: string[];
  reasons: string[];
}

export interface FrontierCodexSwarmAutoDrainResult {
  kind: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND;
  version: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_VERSION;
  ok: boolean;
  enabled: boolean;
  cwd: string;
  runDir: string;
  outDir: string;
  generatedAt: number;
  skippedReason?: string;
  dirtyPaths?: string[];
  iterations: FrontierCodexSwarmAutoDrainIteration[];
  lockKeys: string[];
  lockScopeCounts: FrontierCodexAutonomousLockScopeCounts;
  terminalJobIds: string[];
  blockedJobIds: string[];
  artifacts?: FrontierCodexAutoDrainArtifactMetadata;
  summary: {
    iterationCount: number;
    collectionCount: number;
    applyCount: number;
    terminalCount: number;
    blockedCount: number;
    remainingReadyCount: number;
    admittedCount: number;
    deferredCount: number;
    reviewerAssignmentCount: number;
    reviewerTaskCount: number;
    patchStackCount: number;
  };
}

export interface FrontierCodexSwarmRunResult {
  ok: boolean;
  outDir: string;
  plan: FrontierSwarmPlan;
  run: FrontierSwarmRun;
  proof: ReturnType<typeof createSwarmProof>;
  autoDrain?: FrontierCodexSwarmAutoDrainResult;
  autoDrainArtifacts?: FrontierCodexAutoDrainArtifactMetadata;
}

export interface FrontierCodexSwarmCliInput {
  manifest: unknown;
  tasks: unknown;
  plan?: FrontierSwarmPlanInput;
}

type WorkspaceFileSnapshot = Map<string, string>;
interface ChangedPathCollection {
  changedPaths: string[];
  ignoredChangedPaths: string[];
}

export function createCodexSwarmPlan(input: FrontierCodexSwarmCliInput): FrontierSwarmPlan {
  return createSwarmPlan(
    coerceCodexSwarmManifestInput(input.manifest),
    coerceCodexSwarmTasksInput(input.tasks),
    input.plan ?? {}
  );
}

export function coerceCodexSwarmManifestInput(value: unknown): FrontierSwarmManifestInput {
  const input = isObject(value) ? value as Record<string, unknown> : {};
  const lanes = arrayOfObjects(input.lanes).map((lane) => ({
    ...lane,
    allowedWrites: readStringArray(lane.allowedWrites).concat(readStringArray(lane.allowedGlobs)),
    evidencePrefix: typeof lane.evidencePrefix === 'string'
      ? lane.evidencePrefix
      : typeof lane.evidenceOutDirPrefix === 'string'
        ? lane.evidenceOutDirPrefix
        : undefined
  }));
  return {
    id: typeof input.id === 'string' ? input.id : 'codex-swarm',
    title: typeof input.title === 'string' ? input.title : undefined,
    description: typeof input.description === 'string' ? input.description : undefined,
    compute: readCompute(input.compute),
    layers: arrayOfObjects(input.layers) as unknown as FrontierSwarmManifestInput['layers'],
    lanes: lanes as unknown as FrontierSwarmManifestInput['lanes'],
    policy: isObject(input.policy) ? input.policy : {
      defaultCompute: 'codex.deep',
      defaultConcurrency: 1
    },
    resources: readStringArray(input.resources),
    tags: readStringArray(input.tags),
    metadata: isObject(input.metadata) ? input.metadata : undefined
  };
}

export function coerceCodexSwarmTasksInput(value: unknown): FrontierSwarmTaskInput[] {
  const raw = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray((value as Record<string, unknown>).tasks)
      ? (value as { tasks: unknown[] }).tasks
      : isObject(value) && Array.isArray((value as Record<string, unknown>).items)
        ? (value as { items: unknown[] }).items
        : [];
  return raw.filter(isObject).map((entry) => {
    const task = entry as Record<string, unknown>;
    return {
      id: String(task.id ?? task.taskId ?? ''),
      title: typeof task.title === 'string' ? task.title : undefined,
      objective: typeof task.objective === 'string'
        ? task.objective
        : typeof task.description === 'string'
          ? task.description
          : typeof task.title === 'string'
            ? task.title
            : undefined,
      kind: typeof task.kind === 'string' ? task.kind : typeof task.surfaceKind === 'string' ? task.surfaceKind : undefined,
      status: typeof task.status === 'string' ? task.status : undefined,
      lane: typeof task.lane === 'string' ? task.lane : undefined,
      layer: typeof task.layer === 'string' ? task.layer : undefined,
      compute: typeof task.compute === 'string' ? task.compute : undefined,
      dependsOn: readStringArray(task.dependsOn),
      concurrencyKey: typeof task.concurrencyKey === 'string' ? task.concurrencyKey : undefined,
      budget: isObject(task.budget) ? task.budget : undefined,
      review: isObject(task.review) ? task.review : undefined,
      priority: typeof task.priority === 'number' ? task.priority : undefined,
      sourceRefs: readStringArray(task.sourceRefs).concat(readStringArray(task.legacySourcePaths)),
      targetRefs: readStringArray(task.targetRefs).concat(readStringArray(task.ownedFiles), readStringArray(task.files)),
      allowedWrites: readStringArray(task.allowedWrites).concat(readStringArray(task.ownedFiles), readStringArray(task.files)),
      ownershipRegions: Array.isArray(task.ownershipRegions) ? task.ownershipRegions as FrontierSwarmTaskInput['ownershipRegions'] : [],
      ownedRegions: readStringArray(task.ownedRegions),
      changedRegions: readStringArray(task.changedRegions),
      acceptance: readStringArray(task.acceptance),
      acceptanceChecks: Array.isArray(task.acceptanceChecks) ? task.acceptanceChecks as FrontierSwarmTaskInput['acceptanceChecks'] : undefined,
      verification: Array.isArray(task.verification) ? task.verification as FrontierSwarmTaskInput['verification'] : undefined,
      evidenceCommand: typeof task.evidenceCommand === 'string' ? task.evidenceCommand : undefined,
      shardCommand: typeof task.shardCommand === 'string' ? task.shardCommand : undefined,
      capabilities: readStringArray(task.capabilities),
      resourceRequirements: isObject(task.resourceRequirements) ? task.resourceRequirements as FrontierSwarmTaskInput['resourceRequirements'] : undefined,
      tags: readStringArray(task.tags),
      metadata: { source: task }
    };
  }).filter((task) => task.id.length > 0);
}

export async function runCodexSwarm(plan: FrontierSwarmPlan, options: FrontierCodexSwarmRunOptions): Promise<FrontierCodexSwarmRunResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const outDir = path.resolve(cwd, options.outDir);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'swarm-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  const eventStream = options.eventStream ?? createSwarmEventStream({
    runId: plan.runId,
    root: path.join(outDir, 'streams'),
    lanes: Array.from(new Set(plan.jobs.map((job) => job.lane)))
  });
  await initFileSwarmEventStream(eventStream);
  const pidManifestPath = path.resolve(options.cwd ?? process.cwd(), options.pidManifestPath ?? path.join(outDir, 'pids.json'));
  await appendCodexPidManifest(pidManifestPath, { pid: process.pid, role: 'parent', runId: plan.runId, startedAt: Date.now() }, plan.runId);
  let run = createSwarmRun({ plan, status: 'running', startedAt: Date.now() });
  const startedEvent = { type: 'swarm.started', runId: run.id, at: run.startedAt, data: { jobCount: plan.jobs.length } };
  run = recordSwarmEvent(run, startedEvent);
  await appendFileSwarmEvent(eventStream, startedEvent);
  const runOptions = { ...options, eventStream, pidManifestPath };
  const results = await runScheduledJobPool(plan, Math.max(1, options.maxConcurrency ?? 1), (job, lease) => runCodexJob(job, runOptions, outDir, lease));
  for (const result of results) {
    const job = plan.jobs.find((entry) => entry.id === result.jobId);
    if (job) {
      await options.onJobFinished?.({ job, result });
      await appendFileSwarmEvent(eventStream, {
        type: 'agent.finished',
        runId: run.id,
        jobId: job.id,
        taskId: job.taskId,
        lane: job.lane,
        data: { status: result.status, mergeReadiness: result.mergeReadiness, changedPathCount: result.changedPaths?.length ?? 0 }
      });
    }
  }
  for (const result of results) run = completeSwarmJob(run, result);
  const proof = createSwarmProof(run, { validation: plan.validation });
  const workerOk = run.summary.failedCount === 0 && run.summary.blockedCount === 0 && run.summary.ownershipViolationCount === 0;
  const autoDrain = await runCodexSwarmAutoDrain({
    plan,
    run,
    cwd,
    outDir,
    options
  });
  const autoDrainArtifacts = autoDrain?.artifacts;
  const ok = workerOk && (autoDrain?.ok ?? true);
  await appendFileSwarmEvent(eventStream, {
    type: 'swarm.finished',
    runId: run.id,
    data: { ok, summary: run.summary, autoDrain: autoDrain?.summary ?? null }
  });
  await fs.writeFile(path.join(outDir, 'swarm-results.json'), JSON.stringify({ ok, outDir, run, proof, ...(autoDrain ? { autoDrain } : {}), ...(autoDrainArtifacts ? { autoDrainArtifacts } : {}) }, null, 2) + '\n');
  await writeSwarmCoordinatorSnapshot(options.coordinatorSnapshotPath ? path.resolve(options.cwd ?? process.cwd(), options.coordinatorSnapshotPath) : path.join(outDir, 'coordinator-dashboard.json'), {
    ok,
    outDir,
    plan,
    run,
    proof,
    ...(autoDrain ? { autoDrain } : {}),
    ...(autoDrainArtifacts ? { autoDrainArtifacts } : {}),
    eventStream,
    pidManifestPath
  });
  const result = { ok, outDir, plan, run, proof, ...(autoDrain ? { autoDrain } : {}), ...(autoDrainArtifacts ? { autoDrainArtifacts } : {}) };
  await options.onSwarmFinished?.({ result });
  return result;
}

async function runCodexSwarmAutoDrain(input: {
  plan: FrontierSwarmPlan;
  run: FrontierSwarmRun;
  cwd: string;
  outDir: string;
  options: FrontierCodexSwarmRunOptions;
}): Promise<FrontierCodexSwarmAutoDrainResult | undefined> {
  const normalized = normalizeSwarmAutoDrainOptions(input.options.autoDrain);
  if (!normalized.enabled) return undefined;
  const generatedAt = Date.now();
  const outDir = path.resolve(input.cwd, normalized.outDir ?? path.join(input.outDir, 'auto-drain'));
  const autoDrainPath = path.join(outDir, 'auto-drain.json');
  await fs.mkdir(outDir, { recursive: true });
  const dirtyPaths = normalized.allowDirty ? [] : await gitDirtyExcluding(input.cwd, [input.outDir, outDir]);
  if (dirtyPaths.length) {
    const artifacts = createAutoDrainArtifactMetadata({ outDir, autoDrainPath, generatedAt, iterations: [] });
    const result: FrontierCodexSwarmAutoDrainResult = {
      kind: FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND,
      version: FRONTIER_SWARM_CODEX_AUTO_DRAIN_VERSION,
      ok: false,
      enabled: true,
      cwd: input.cwd,
      runDir: input.outDir,
      outDir,
      generatedAt,
      skippedReason: 'dirty-worktree',
      dirtyPaths,
      iterations: [],
      lockKeys: [],
      lockScopeCounts: emptyAutonomousLockScopeCounts(),
      terminalJobIds: [],
      blockedJobIds: [],
      artifacts,
      summary: {
        iterationCount: 0,
        collectionCount: 0,
        applyCount: 0,
        terminalCount: 0,
        blockedCount: 0,
        remainingReadyCount: 0,
        admittedCount: 0,
        deferredCount: 0,
        reviewerAssignmentCount: 0,
        reviewerTaskCount: 0,
        patchStackCount: 0
      }
    };
    await writeJsonAtomic(autoDrainPath, result);
    return result;
  }

  const iterations: FrontierCodexSwarmAutoDrainIteration[] = [];
  const terminalJobIds = new Set<string>();
  const blockedJobIds = new Set<string>();
  const maxIterations = Math.max(1, Math.floor(normalized.maxIterations ?? Math.max(1, input.run.jobs.length + 1)));
  let remainingReadyCount = 0;
  let latestCollection: FrontierCodexCollectResult | undefined;
  for (let index = 0; index < maxIterations; index += 1) {
    const collection = await collectCodexSwarmRun({
      run: input.outDir,
      cwd: input.cwd,
      outDir: path.join(outDir, `collection-${String(index + 1).padStart(2, '0')}`),
      checkStale: normalized.checkStale ?? true,
      branchPrefix: normalized.branchPrefix
    });
    latestCollection = collection;
    await writeAutoDrainReviewArtifacts(outDir, collection);
    const allReadyJobIds = collection.buckets['ready-to-apply']
      .map((entry) => entry.jobId)
      .filter((jobId) => !terminalJobIds.has(jobId) && !blockedJobIds.has(jobId));
    const admission = buildAutoDrainAdmission({
      collection,
      options: normalized,
      iteration: index + 1,
      runDir: input.outDir,
      candidateJobIds: allReadyJobIds
    });
    const admissionPath = path.join(collection.outDir, 'merge-admission.json');
    await writeJsonAtomic(admissionPath, admission);
    const admittedCandidateJobIds = allReadyJobIds.filter((jobId) => admission.admitted.includes(jobId));
    const admittedJobIds = limitAutoDrainAdmittedJobIds(admittedCandidateJobIds, normalized);
    const deferredJobIds = uniqueStrings([
      ...admission.deferred.map((entry) => entry.jobId),
      ...admittedCandidateJobIds.filter((jobId) => !admittedJobIds.includes(jobId))
    ]).sort();
    const coordinatorAgentDrain = await writeAutoDrainCoordinatorAgentDrainArtifact({
      collection,
      outDir,
      iteration: index + 1,
      admission,
      readyJobIds: allReadyJobIds,
      admittedJobIds,
      deferredJobIds
    });
    const drainAdmittedJobIds = coordinatorAgentDrain.artifact.assignments
      .filter((assignment) => assignment.selected)
      .map((assignment) => assignment.jobId);
    const drainDeferredJobIds = uniqueStrings([
      ...deferredJobIds,
      ...allReadyJobIds.filter((jobId) => !drainAdmittedJobIds.includes(jobId))
    ]).sort();
    const grouping = await writeAutoDrainGroupingArtifact({
      collection,
      outDir,
      iteration: index + 1,
      readyJobIds: allReadyJobIds,
      admittedJobIds: drainAdmittedJobIds,
      deferredJobIds: drainDeferredJobIds,
      coordinatorAgentDrain: coordinatorAgentDrain.artifact
    });
    remainingReadyCount = allReadyJobIds.length;
    if (!allReadyJobIds.length || !drainAdmittedJobIds.length) {
      iterations.push({
        index: index + 1,
        collection,
        admission,
        admissionPath,
        admittedJobIds: drainAdmittedJobIds,
        deferredJobIds: drainDeferredJobIds,
        readyJobIds: allReadyJobIds,
        coordinatorAgentDrainPath: coordinatorAgentDrain.path,
        coordinatorAgentDrain: coordinatorAgentDrain.artifact,
        groupingPath: grouping.path,
        grouping: grouping.artifact,
        lockKeys: [],
        lockScopeCounts: emptyAutonomousLockScopeCounts(),
        terminalJobIds: [...terminalJobIds].sort(),
        blockedJobIds: [...blockedJobIds].sort()
      });
      break;
    }
    const apply = await autonomousApplyCodexSwarmRun({
      collection: collection.outDir,
      cwd: input.cwd,
      outDir: path.join(outDir, `apply-${String(index + 1).padStart(2, '0')}`),
      jobIds: drainAdmittedJobIds,
      dryRun: normalized.dryRun ?? input.options.dryRun ?? false,
      allowDirty: true,
      commit: normalized.commit ?? false,
      branchPrefix: normalized.branchPrefix,
      focusedCommands: normalized.focusedCommands,
      globalCommands: normalized.globalCommands,
      globalGlobs: normalized.globalGlobs,
      decisionLogPath: normalized.decisionLogPath,
      lockPath: normalized.lockPath,
      lockTimeoutMs: normalized.lockTimeoutMs,
      lockStaleMs: normalized.lockStaleMs
    });
    for (const decision of apply.decisions) {
      if (autonomousDecisionIsTerminal(decision.status)) terminalJobIds.add(decision.jobId);
      else blockedJobIds.add(decision.jobId);
    }
    const postApplyCollection = await collectCodexSwarmRun({
      run: input.outDir,
      cwd: input.cwd,
      outDir: path.join(outDir, `collection-${String(index + 1).padStart(2, '0')}-post-apply`),
      checkStale: normalized.checkStale ?? true,
      branchPrefix: normalized.branchPrefix
    });
    latestCollection = postApplyCollection;
    await writeAutoDrainReviewArtifacts(outDir, postApplyCollection);
    const iterationLockSummary = summarizeAutonomousDecisionLockScopes(apply.decisions);
    iterations.push({
      index: index + 1,
      collection,
      admission,
      admissionPath,
      admittedJobIds: drainAdmittedJobIds,
      deferredJobIds: drainDeferredJobIds,
      readyJobIds: allReadyJobIds,
      coordinatorAgentDrainPath: coordinatorAgentDrain.path,
      coordinatorAgentDrain: coordinatorAgentDrain.artifact,
      groupingPath: grouping.path,
      grouping: grouping.artifact,
      apply,
      postApplyCollection,
      postApplyCollectionPath: postApplyCollection.artifacts?.collectionPath ?? path.join(postApplyCollection.outDir, 'collection.json'),
      lockKeys: iterationLockSummary.lockKeys,
      lockScopeCounts: iterationLockSummary.lockScopeCounts,
      terminalJobIds: [...terminalJobIds].sort(),
      blockedJobIds: [...blockedJobIds].sort()
    });
    remainingReadyCount = postApplyCollection.buckets['ready-to-apply']
      .map((entry) => entry.jobId)
      .filter((jobId) => !terminalJobIds.has(jobId) && !blockedJobIds.has(jobId)).length;
    if (!apply.decisions.length || remainingReadyCount === 0) break;
  }
  const lockSummary = summarizeAutonomousDecisionLockScopes(iterations.flatMap((iteration) => iteration.apply?.decisions ?? []));
  const artifacts = createAutoDrainArtifactMetadata({ outDir, autoDrainPath, generatedAt, iterations });
  const latestIteration = iterations[iterations.length - 1];
  const admittedCount = uniqueStrings(iterations.flatMap((iteration) => iteration.admittedJobIds)).length;
  const deferredCount = latestIteration?.deferredJobIds.length ?? 0;
  const result: FrontierCodexSwarmAutoDrainResult = {
    kind: FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND,
    version: FRONTIER_SWARM_CODEX_AUTO_DRAIN_VERSION,
    ok: [...blockedJobIds].length === 0,
    enabled: true,
    cwd: input.cwd,
    runDir: input.outDir,
    outDir,
    generatedAt,
    iterations,
    lockKeys: lockSummary.lockKeys,
    lockScopeCounts: lockSummary.lockScopeCounts,
    terminalJobIds: [...terminalJobIds].sort(),
    blockedJobIds: [...blockedJobIds].sort(),
    artifacts,
    summary: {
      iterationCount: iterations.length,
      collectionCount: iterations.length,
      applyCount: iterations.filter((iteration) => iteration.apply).length,
      terminalCount: terminalJobIds.size,
      blockedCount: blockedJobIds.size,
      remainingReadyCount,
      admittedCount,
      deferredCount,
      reviewerAssignmentCount: latestCollection?.reviewerLanePlan?.summary.assignmentCount ?? 0,
      reviewerTaskCount: latestCollection?.reviewerLanePlan?.summary.taskCount ?? 0,
      patchStackCount: latestCollection?.patchStackPlan?.summary.stackCount ?? 0
    }
  };
  await writeJsonAtomic(autoDrainPath, result);
  return result;
}

async function writeAutoDrainReviewArtifacts(outDir: string, collection: FrontierCodexCollectResult): Promise<void> {
  await writeJsonAtomic(path.join(outDir, 'merge-index.json'), collection.mergeIndex);
  if (collection.mergeAdmission) await writeJsonAtomic(path.join(outDir, 'merge-admission.json'), collection.mergeAdmission);
  if (collection.reviewerLanePlan) await writeJsonAtomic(path.join(outDir, 'reviewer-lane-plan.json'), collection.reviewerLanePlan);
  if (collection.patchStackPlan) await writeJsonAtomic(path.join(outDir, 'patch-stack-plan.json'), collection.patchStackPlan);
}

async function writeAutoDrainCoordinatorAgentDrainArtifact(input: {
  collection: FrontierCodexCollectResult;
  outDir: string;
  iteration: number;
  admission: FrontierSwarmMergeAdmission;
  readyJobIds: readonly string[];
  admittedJobIds: readonly string[];
  deferredJobIds: readonly string[];
}): Promise<{ path: string; artifact: FrontierCodexCoordinatorAgentDrainArtifact }> {
  const artifact = createAutoDrainCoordinatorAgentDrainArtifact(input);
  const artifactPath = path.join(input.outDir, `coordinator-agent-drain-${String(input.iteration).padStart(2, '0')}.json`);
  await writeJsonAtomic(artifactPath, artifact);
  return { path: artifactPath, artifact };
}

function createAutoDrainCoordinatorAgentDrainArtifact(input: {
  collection: FrontierCodexCollectResult;
  iteration: number;
  admission: FrontierSwarmMergeAdmission;
  readyJobIds: readonly string[];
  admittedJobIds: readonly string[];
  deferredJobIds: readonly string[];
}): FrontierCodexCoordinatorAgentDrainArtifact {
  const generatedAt = Date.now();
  const readyIndex = filterMergeIndexForJobIds(input.collection.mergeIndex, input.readyJobIds);
  const scopedAdmission = scopeAutoDrainCoordinatorAdmission({
    index: readyIndex,
    admission: input.admission,
    admittedJobIds: input.admittedJobIds,
    deferredJobIds: input.deferredJobIds
  });
  const queue = createSwarmHierarchicalMergeQueue({
    index: readyIndex,
    admission: scopedAdmission,
    generatedAt,
    metadata: {
      source: FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND,
      iteration: input.iteration,
      collectionDir: input.collection.outDir
    }
  });
  const entriesByJobId = new Map(readyIndex.entries.map((entry) => [entry.jobId, entry]));
  const admitted = new Set(input.admittedJobIds);
  const deferred = new Set(input.deferredJobIds);
  const readyActions = new Set<FrontierSwarmMergeQueueAssignmentAction>(['apply-local', 'queue-local', 'promote']);
  const assignments = queue.assignments
    .filter((assignment) => readyActions.has(assignment.action) && input.readyJobIds.includes(assignment.jobId))
    .map((assignment): FrontierCodexCoordinatorAgentDrainAssignment => {
      const entry = entriesByJobId.get(assignment.jobId);
      const selected = admitted.has(assignment.jobId);
      const serializesAfterJobIds = selected
        ? []
        : assignment.conflictingJobIds.filter((jobId) => admitted.has(jobId)).sort();
      const leaderJobIds = selected
        ? [assignment.jobId]
        : serializesAfterJobIds;
      return {
        jobId: assignment.jobId,
        ...(assignment.taskId ? { taskId: assignment.taskId } : {}),
        ...(assignment.lane ? { lane: assignment.lane } : {}),
        queueItemIds: entry?.queueItemIds.length ? [...entry.queueItemIds].sort() : [assignment.taskId ?? assignment.jobId],
        queueAction: assignment.action,
        decision: selected ? 'selected' : 'deferred',
        selected,
        scopeId: assignment.scopeId,
        parentScopeIds: [...assignment.parentScopeIds],
        leaseKey: assignment.leaseKey,
        ...(assignment.promoteToScopeId ? { promoteToScopeId: assignment.promoteToScopeId } : {}),
        changedPaths: [...assignment.changedPaths],
        changedRegions: [...assignment.changedRegions],
        conflictingJobIds: [...assignment.conflictingJobIds],
        serializesAfterJobIds,
        leaderJobIds,
        reasons: uniqueStrings([
          ...assignment.reasons,
          selected ? 'coordinator-agent-drain-selected' : 'coordinator-agent-drain-deferred',
          ...(!selected && deferred.has(assignment.jobId) ? ['deferred-by-queue-leader'] : [])
        ]),
        selectionReason: autoDrainCoordinatorAgentSelectionReason(assignment.action, selected, serializesAfterJobIds)
      };
    })
    .sort(compareCoordinatorAgentDrainAssignments);
  return {
    kind: FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND,
    version: FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_VERSION,
    id: `frontier-swarm-codex-coordinator-agent-drain:${stableHash([input.collection.outDir, input.iteration, input.readyJobIds, input.admittedJobIds, input.deferredJobIds, assignments, generatedAt])}`,
    ...(readyIndex.runId ? { runId: readyIndex.runId } : {}),
    generatedAt,
    iteration: input.iteration,
    collectionDir: input.collection.outDir,
    mergeQueueId: queue.id,
    admissionId: scopedAdmission.id,
    readyJobIds: [...input.readyJobIds],
    admittedJobIds: assignments.filter((assignment) => assignment.selected).map((assignment) => assignment.jobId),
    deferredJobIds: assignments.filter((assignment) => !assignment.selected).map((assignment) => assignment.jobId),
    assignments,
    summary: {
      assignmentCount: assignments.length,
      selectedCount: assignments.filter((assignment) => assignment.selected).length,
      deferredCount: assignments.filter((assignment) => !assignment.selected).length,
      applyLocalCount: assignments.filter((assignment) => assignment.queueAction === 'apply-local').length,
      queueLocalCount: assignments.filter((assignment) => assignment.queueAction === 'queue-local').length,
      promoteCount: assignments.filter((assignment) => assignment.queueAction === 'promote').length,
      selectedQueueLocalCount: assignments.filter((assignment) => assignment.selected && assignment.queueAction === 'queue-local').length,
      selectedPromoteCount: assignments.filter((assignment) => assignment.selected && assignment.queueAction === 'promote').length,
      deferredPromoteCount: assignments.filter((assignment) => !assignment.selected && assignment.queueAction === 'promote').length,
      scopeCount: uniqueStrings(assignments.map((assignment) => assignment.scopeId)).length
    }
  };
}

function scopeAutoDrainCoordinatorAdmission(input: {
  index: FrontierSwarmMergeIndex;
  admission: FrontierSwarmMergeAdmission;
  admittedJobIds: readonly string[];
  deferredJobIds: readonly string[];
}): FrontierSwarmMergeAdmission {
  const admitted = uniqueStrings(input.admittedJobIds).sort();
  const admittedSet = new Set(admitted);
  const originalDeferrals = new Map(input.admission.deferred.map((entry) => [entry.jobId, entry.reasons]));
  const deferred = uniqueStrings(input.deferredJobIds)
    .filter((jobId) => !admittedSet.has(jobId))
    .sort()
    .map((jobId) => ({
      jobId,
      reasons: uniqueStrings([
        ...(originalDeferrals.get(jobId) ?? []),
        ...(originalDeferrals.has(jobId) ? [] : ['waiting-for-coordinator-agent-drain'])
      ])
    }));
  const entriesByJobId = new Map(input.index.entries.map((entry) => [entry.jobId, entry]));
  const changedPaths = new Set<string>();
  const changedRegions = new Set<string>();
  let highRiskCount = 0;
  for (const jobId of admitted) {
    const entry = entriesByJobId.get(jobId);
    if (!entry) continue;
    for (const file of entry.changedPaths) changedPaths.add(file);
    for (const region of entry.changedRegions) changedRegions.add(region);
    if (entry.riskLevel === 'high') highRiskCount += 1;
  }
  return {
    ...input.admission,
    id: `${input.admission.id}:coordinator-agent-drain:${stableHash([admitted, deferred])}`,
    admitted,
    deferred,
    metadata: {
      ...(input.admission.metadata ?? {}),
      coordinatorAgentDrain: {
        source: FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND,
        scoped: true
      }
    },
    summary: {
      admittedCount: admitted.length,
      deferredCount: deferred.length,
      changedPathCount: changedPaths.size,
      changedRegionCount: changedRegions.size,
      highRiskCount
    }
  };
}

function autoDrainCoordinatorAgentSelectionReason(
  action: FrontierSwarmMergeQueueAssignmentAction,
  selected: boolean,
  serializesAfterJobIds: readonly string[]
): string {
  if (selected && action === 'promote') return 'deterministic-promoted-queue-leader';
  if (selected && action === 'queue-local') return 'queue-local-drain-leader';
  if (selected) return 'ready-local-drain-leader';
  if (action === 'promote' && serializesAfterJobIds.length) return 'serialized-behind-promoted-queue-leader';
  if (action === 'queue-local') return 'waiting-for-local-queue-leader';
  return 'deferred-by-coordinator-agent-drain';
}

function compareCoordinatorAgentDrainAssignments(
  left: FrontierCodexCoordinatorAgentDrainAssignment,
  right: FrontierCodexCoordinatorAgentDrainAssignment
): number {
  return Number(right.selected) - Number(left.selected)
    || left.scopeId.localeCompare(right.scopeId)
    || left.queueAction.localeCompare(right.queueAction)
    || left.jobId.localeCompare(right.jobId);
}

function buildAutoDrainAdmission(input: {
  collection: FrontierCodexCollectResult;
  options: FrontierCodexSwarmAutoDrainOptions;
  iteration: number;
  runDir: string;
  candidateJobIds?: readonly string[];
}): FrontierSwarmMergeAdmission {
  const index = input.candidateJobIds ? filterMergeIndexForJobIds(input.collection.mergeIndex, input.candidateJobIds) : input.collection.mergeIndex;
  const admission = createSwarmMergeAdmission({
    index,
    maxReady: input.options.maxReady ?? index.entries.length,
    ...(input.options.maxChangedPaths !== undefined ? { maxChangedPaths: input.options.maxChangedPaths } : {}),
    ...(input.options.maxChangedRegions !== undefined ? { maxChangedRegions: input.options.maxChangedRegions } : {}),
    ...(input.options.maxHighRisk !== undefined ? { maxHighRisk: input.options.maxHighRisk } : {}),
    allowRisks: input.options.allowRisks ?? ['low', 'medium', 'unknown'],
    metadata: {
      source: FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND,
      iteration: input.iteration,
      collectionDir: input.collection.outDir,
      candidateJobIds: input.candidateJobIds ? [...input.candidateJobIds] : undefined,
      runDir: input.runDir
    }
  });
  return input.options.admitConflictLeaders === false
    ? admission
    : admitAutoDrainConflictLeaders({ index, admission });
}

function admitAutoDrainConflictLeaders(input: {
  index: FrontierSwarmMergeIndex;
  admission: FrontierSwarmMergeAdmission;
}): FrontierSwarmMergeAdmission {
  const admitted = new Set(input.admission.admitted);
  const maxReady = input.admission.budget.maxReady;
  const remainingSlots = Math.max(0, maxReady - admitted.size);
  if (remainingSlots === 0) return input.admission;
  const entriesByJobId = new Map(input.index.entries.map((entry) => [entry.jobId, entry]));
  const deferralsByJobId = new Map(input.admission.deferred.map((entry) => [entry.jobId, entry.reasons]));
  const eligible = input.index.entries.filter((entry) => {
    const reasons = deferralsByJobId.get(entry.jobId) ?? [];
    return !admitted.has(entry.jobId)
      && reasons.length === 1
      && reasons[0] === 'conflicting-changes'
      && entry.disposition === 'auto-mergeable'
      && entry.autoMergeable
      && !entry.staleAgainstHead
      && entry.ownershipViolations.length === 0;
  });
  if (!eligible.length) return input.admission;
  const eligibleIds = new Set(eligible.map((entry) => entry.jobId));
  const selected: string[] = [];
  const visited = new Set<string>();
  for (const entry of eligible.sort(compareAutoDrainConflictLeaders)) {
    if (visited.has(entry.jobId) || selected.length >= remainingSlots) continue;
    const component = collectAutoDrainConflictComponent(entry, entriesByJobId, eligibleIds, visited);
    const leader = component.sort(compareAutoDrainConflictLeaders)[0];
    if (!leader) continue;
    const nextAdmitted = [...admitted, ...selected, leader.jobId];
    if (!autoDrainAdmissionBudgetAllows(input.index, input.admission, nextAdmitted)) continue;
    selected.push(leader.jobId);
  }
  if (!selected.length) return input.admission;
  const nextAdmitted = uniqueStrings([...input.admission.admitted, ...selected]);
  const selectedSet = new Set(selected);
  const nextDeferred = input.admission.deferred.filter((entry) => !selectedSet.has(entry.jobId));
  const changedPaths = new Set<string>();
  const changedRegions = new Set<string>();
  let highRiskCount = 0;
  for (const jobId of nextAdmitted) {
    const entry = entriesByJobId.get(jobId);
    if (!entry) continue;
    for (const file of entry.changedPaths) changedPaths.add(file);
    for (const region of entry.changedRegions) changedRegions.add(region);
    if (entry.riskLevel === 'high') highRiskCount += 1;
  }
  return {
    ...input.admission,
    id: `${input.admission.id}:conflict-leaders:${stableHash(selected)}`,
    admitted: nextAdmitted,
    deferred: nextDeferred,
    metadata: {
      ...(input.admission.metadata ?? {}),
      conflictLeaderAdmission: {
        enabled: true,
        selectedJobIds: selected
      }
    },
    summary: {
      admittedCount: nextAdmitted.length,
      deferredCount: nextDeferred.length,
      changedPathCount: changedPaths.size,
      changedRegionCount: changedRegions.size,
      highRiskCount
    }
  };
}

function collectAutoDrainConflictComponent(
  seed: FrontierSwarmMergeIndex['entries'][number],
  entriesByJobId: Map<string, FrontierSwarmMergeIndex['entries'][number]>,
  eligibleIds: Set<string>,
  visited: Set<string>
): FrontierSwarmMergeIndex['entries'] {
  const component: FrontierSwarmMergeIndex['entries'] = [];
  const stack = [seed.jobId];
  while (stack.length) {
    const jobId = stack.pop();
    if (!jobId || visited.has(jobId) || !eligibleIds.has(jobId)) continue;
    visited.add(jobId);
    const entry = entriesByJobId.get(jobId);
    if (!entry) continue;
    component.push(entry);
    for (const conflictingJobId of entry.conflictingJobIds) {
      if (eligibleIds.has(conflictingJobId) && !visited.has(conflictingJobId)) stack.push(conflictingJobId);
    }
  }
  return component;
}

function autoDrainAdmissionBudgetAllows(
  index: FrontierSwarmMergeIndex,
  admission: FrontierSwarmMergeAdmission,
  jobIds: readonly string[]
): boolean {
  const entriesByJobId = new Map(index.entries.map((entry) => [entry.jobId, entry]));
  const changedPaths = new Set<string>();
  const changedRegions = new Set<string>();
  let highRiskCount = 0;
  for (const jobId of jobIds) {
    const entry = entriesByJobId.get(jobId);
    if (!entry) continue;
    for (const file of entry.changedPaths) changedPaths.add(file);
    for (const region of entry.changedRegions) changedRegions.add(region);
    if (entry.riskLevel === 'high') highRiskCount += 1;
  }
  if (admission.budget.maxChangedPaths !== undefined && changedPaths.size > admission.budget.maxChangedPaths) return false;
  if (admission.budget.maxChangedRegions !== undefined && changedRegions.size > admission.budget.maxChangedRegions) return false;
  if (admission.budget.maxHighRisk !== undefined && highRiskCount > admission.budget.maxHighRisk) return false;
  return jobIds.length <= admission.budget.maxReady;
}

function compareAutoDrainConflictLeaders(
  left: FrontierSwarmMergeIndex['entries'][number],
  right: FrontierSwarmMergeIndex['entries'][number]
): number {
  return left.changedPaths.length - right.changedPaths.length
    || left.changedRegions.length - right.changedRegions.length
    || left.conflictingJobIds.length - right.conflictingJobIds.length
    || left.jobId.localeCompare(right.jobId);
}

function filterMergeIndexForJobIds(index: FrontierSwarmMergeIndex, jobIds: readonly string[]): FrontierSwarmMergeIndex {
  const wanted = new Set(jobIds);
  const entries = index.entries
    .filter((entry) => wanted.has(entry.jobId))
    .map((entry) => ({
      ...entry,
      conflictingJobIds: entry.conflictingJobIds.filter((jobId) => wanted.has(jobId)).sort()
    }));
  const conflicts = index.conflicts
    .filter((conflict) => conflict.jobIds.every((jobId) => wanted.has(jobId)))
    .map((conflict) => ({ ...conflict, jobIds: [...conflict.jobIds].sort() }));
  const byDisposition: Record<string, string[]> = {};
  const byPath: Record<string, string[]> = {};
  const byRegion: Record<string, string[]> = {};
  const addGroup = (groups: Record<string, string[]>, key: string, jobId: string) => {
    const values = groups[key] ?? [];
    if (!values.includes(jobId)) values.push(jobId);
    groups[key] = values.sort();
  };
  for (const entry of entries) {
    addGroup(byDisposition, entry.disposition, entry.jobId);
    for (const file of entry.changedPaths) addGroup(byPath, file, entry.jobId);
    for (const region of entry.changedRegions) addGroup(byRegion, region, entry.jobId);
  }
  const conflictedJobIds = new Set(conflicts.flatMap((conflict) => conflict.jobIds));
  return {
    ...index,
    id: `${index.id}:pending:${stableHash([...wanted].sort())}`,
    entries,
    conflicts,
    byDisposition,
    byPath,
    byRegion,
    summary: {
      entryCount: entries.length,
      readyToApplyCount: entries.filter((entry) => entry.disposition === 'auto-mergeable' && entry.autoMergeable && !entry.conflictingJobIds.length).length,
      needsHumanPortCount: entries.filter((entry) => entry.disposition === 'needs-port').length,
      failedEvidenceCount: entries.filter((entry) => entry.disposition === 'rejected' || entry.disposition === 'blocked' || entry.ownershipViolations.length > 0).length,
      staleAgainstHeadCount: entries.filter((entry) => entry.staleAgainstHead || entry.disposition === 'stale-against-head').length,
      discoveryOnlyCount: entries.filter((entry) => entry.disposition === 'discovery-only').length,
      conflictCount: conflicts.length,
      conflictedJobCount: conflictedJobIds.size
    }
  };
}

function limitAutoDrainAdmittedJobIds(jobIds: readonly string[], options: FrontierCodexSwarmAutoDrainOptions): string[] {
  return options.limit === undefined
    ? [...jobIds]
    : jobIds.slice(0, Math.max(0, Math.floor(options.limit)));
}

interface AutoDrainGroupingRecord {
  jobId: string;
  taskId?: string;
  lane?: string;
  queueItemIds: string[];
  mergePath: string;
  patchPath?: string;
  changedPaths: string[];
  changedRegions: string[];
  scopeKeys: string[];
}

interface AutoDrainGroupingInternalGroup {
  index: number;
  records: AutoDrainGroupingRecord[];
}

async function writeAutoDrainGroupingArtifact(input: {
  collection: FrontierCodexCollectResult;
  outDir: string;
  iteration: number;
  readyJobIds: readonly string[];
  admittedJobIds: readonly string[];
  deferredJobIds: readonly string[];
  coordinatorAgentDrain?: FrontierCodexCoordinatorAgentDrainArtifact;
}): Promise<{ path: string; artifact: FrontierCodexSwarmAutoDrainGroupingArtifact }> {
  const artifact = createAutoDrainGroupingArtifact(input);
  const artifactPath = path.join(input.outDir, `auto-drain-groups-${String(input.iteration).padStart(2, '0')}.json`);
  await writeJsonAtomic(artifactPath, artifact);
  return { path: artifactPath, artifact };
}

function createAutoDrainGroupingArtifact(input: {
  collection: FrontierCodexCollectResult;
  iteration: number;
  readyJobIds: readonly string[];
  admittedJobIds: readonly string[];
  deferredJobIds: readonly string[];
  coordinatorAgentDrain?: FrontierCodexCoordinatorAgentDrainArtifact;
}): FrontierCodexSwarmAutoDrainGroupingArtifact {
  const generatedAt = Date.now();
  const readyEntries = new Map(input.collection.buckets['ready-to-apply'].map((entry) => [entry.jobId, entry]));
  const coordinatorAgentAssignments = new Map((input.coordinatorAgentDrain?.assignments ?? []).map((assignment) => [assignment.jobId, assignment]));
  const admittedRecords = input.admittedJobIds
    .map((jobId) => {
      const entry = readyEntries.get(jobId);
      return entry ? autoDrainGroupingRecord(entry) : undefined;
    })
    .filter((entry): entry is AutoDrainGroupingRecord => entry !== undefined);
  const internalGroups: AutoDrainGroupingInternalGroup[] = [];
  const placedRecords: AutoDrainGroupingRecord[] = [];
  const placements = new Map<string, {
    group: AutoDrainGroupingInternalGroup;
    conflicts: FrontierCodexSwarmAutoDrainGroupingConflict[];
  }>();
  const conflicts: FrontierCodexSwarmAutoDrainGroupingConflict[] = [];

  for (const record of admittedRecords) {
    const priorConflicts = dedupeAutoDrainGroupingConflicts(
      placedRecords.flatMap((placed) => autoDrainGroupingConflicts(placed, record))
    );
    let group = internalGroups.find((candidate) => candidate.records.every((member) => autoDrainGroupingConflicts(member, record).length === 0));
    if (!group) {
      group = { index: internalGroups.length + 1, records: [] };
      internalGroups.push(group);
    }
    group.records.push(record);
    placedRecords.push(record);
    placements.set(record.jobId, { group, conflicts: priorConflicts });
    conflicts.push(...priorConflicts);
  }

  const groupArtifacts: FrontierCodexSwarmAutoDrainGroup[] = internalGroups.map((group) => {
    const records = group.records;
    const serializesAfterJobIds = uniqueStrings(records.flatMap((record) => placements.get(record.jobId)?.conflicts.flatMap((conflict) => conflict.jobIds.filter((jobId) => jobId !== record.jobId)) ?? [])).sort();
    const jobIds = records.map((record) => record.jobId);
    return {
      id: `frontier-swarm-codex-auto-drain-group:${stableHash([input.collection.outDir, input.iteration, group.index, jobIds])}`,
      index: group.index,
      jobIds,
      queueItemIds: uniqueStrings(records.flatMap((record) => record.queueItemIds)).sort(),
      changedPaths: uniqueWorkspacePaths(records.flatMap((record) => record.changedPaths)).sort(),
      changedRegions: uniqueStrings(records.flatMap((record) => record.changedRegions)).sort(),
      scopeKeys: uniqueStrings(records.flatMap((record) => record.scopeKeys)).sort(),
      parallelizable: records.length > 1,
      requiresSerialization: serializesAfterJobIds.length > 0,
      serializesAfterJobIds
    };
  });
  const groupIds = new Map(groupArtifacts.flatMap((group) => group.jobIds.map((jobId) => [jobId, group.id] as const)));
  const admittedJobs = admittedRecords.map((record): FrontierCodexSwarmAutoDrainGroupingJob => {
    const placement = placements.get(record.jobId);
    const recordConflicts = placement?.conflicts ?? [];
    const serializesAfterJobIds = uniqueStrings(recordConflicts.flatMap((conflict) => conflict.jobIds.filter((jobId) => jobId !== record.jobId))).sort();
    const coordinatorAgent = coordinatorAgentAssignments.get(record.jobId);
    return {
      jobId: record.jobId,
      ...(record.taskId ? { taskId: record.taskId } : {}),
      ...(record.lane ? { lane: record.lane } : {}),
      queueItemIds: [...record.queueItemIds],
      bundlePath: record.mergePath,
      ...(record.patchPath ? { patchPath: record.patchPath } : {}),
      changedPaths: [...record.changedPaths],
      changedRegions: [...record.changedRegions],
      scopeKeys: [...record.scopeKeys],
      placement: serializesAfterJobIds.length ? 'serialized' : 'compatible',
      ...(groupIds.get(record.jobId) ? { groupId: groupIds.get(record.jobId) } : {}),
      serializesAfterJobIds,
      conflicts: recordConflicts,
      ...(coordinatorAgent ? { coordinatorAgent } : {})
    };
  });
  const deferredJobs = input.deferredJobIds.map((jobId): FrontierCodexSwarmAutoDrainGroupingJob => {
    const entry = readyEntries.get(jobId);
    const record = entry ? autoDrainGroupingRecord(entry) : undefined;
    const coordinatorAgent = coordinatorAgentAssignments.get(jobId);
    return {
      jobId,
      ...(record?.taskId ? { taskId: record.taskId } : {}),
      ...(record?.lane ? { lane: record.lane } : {}),
      queueItemIds: record ? [...record.queueItemIds] : [jobId],
      ...(record ? { bundlePath: record.mergePath } : {}),
      ...(record?.patchPath ? { patchPath: record.patchPath } : {}),
      changedPaths: record ? [...record.changedPaths] : [],
      changedRegions: record ? [...record.changedRegions] : [],
      scopeKeys: record ? [...record.scopeKeys] : [],
      placement: 'deferred',
      serializesAfterJobIds: coordinatorAgent?.serializesAfterJobIds ?? [],
      conflicts: [],
      ...(coordinatorAgent ? { coordinatorAgent } : {}),
      reason: coordinatorAgent?.selectionReason ?? 'auto-drain-admission'
    };
  });
  const dedupedConflicts = dedupeAutoDrainGroupingConflicts(conflicts);
  const serializedJobCount = admittedJobs.filter((job) => job.placement === 'serialized').length;
  return {
    kind: FRONTIER_SWARM_CODEX_AUTO_DRAIN_GROUPING_KIND,
    version: FRONTIER_SWARM_CODEX_AUTO_DRAIN_GROUPING_VERSION,
    id: `frontier-swarm-codex-auto-drain-grouping:${stableHash([input.collection.outDir, input.iteration, input.readyJobIds, input.admittedJobIds, groupArtifacts, dedupedConflicts])}`,
    ...(input.collection.mergeIndex.runId ? { runId: input.collection.mergeIndex.runId } : {}),
    generatedAt,
    iteration: input.iteration,
    collectionDir: input.collection.outDir,
    readyJobIds: [...input.readyJobIds],
    admittedJobIds: [...input.admittedJobIds],
    deferredJobIds: [...input.deferredJobIds],
    groups: groupArtifacts,
    jobs: [...admittedJobs, ...deferredJobs],
    conflicts: dedupedConflicts,
    summary: {
      readyCount: input.readyJobIds.length,
      admittedCount: input.admittedJobIds.length,
      deferredCount: input.deferredJobIds.length,
      groupCount: groupArtifacts.length,
      compatibleGroupCount: groupArtifacts.filter((group) => !group.requiresSerialization).length,
      serializedJobCount,
      conflictCount: dedupedConflicts.length,
      pathConflictCount: dedupedConflicts.filter((conflict) => conflict.kind === 'path').length,
      regionConflictCount: dedupedConflicts.filter((conflict) => conflict.kind === 'region').length,
      unscopedConflictCount: dedupedConflicts.filter((conflict) => conflict.kind === 'unscoped').length
    }
  };
}

function autoDrainGroupingRecord(entry: FrontierCodexCollectedBundle): AutoDrainGroupingRecord {
  const bundle = entry.bundle;
  const changedPaths = uniqueWorkspacePaths(bundle.changedPaths).sort();
  const changedRegions = uniqueStrings(bundle.changedRegions).sort();
  const patchPath = bundle.patchPath
    ? path.isAbsolute(bundle.patchPath) ? bundle.patchPath : path.resolve(path.dirname(entry.mergePath), bundle.patchPath)
    : undefined;
  return {
    jobId: bundle.jobId,
    ...(bundle.taskId ? { taskId: bundle.taskId } : {}),
    ...(bundle.lane ? { lane: bundle.lane } : {}),
    queueItemIds: bundle.queueItemIds.length ? [...bundle.queueItemIds].sort() : [bundle.taskId ?? bundle.jobId],
    mergePath: entry.mergePath,
    ...(patchPath ? { patchPath } : {}),
    changedPaths,
    changedRegions,
    scopeKeys: autoDrainScopeKeys(changedPaths, changedRegions)
  };
}

function autoDrainScopeKeys(changedPaths: readonly string[], changedRegions: readonly string[]): string[] {
  return uniqueStrings([
    ...changedRegions.map((region) => `region:${region}`),
    ...changedPaths.map((file) => `path:${file}`)
  ]).sort();
}

function autoDrainGroupingConflicts(
  left: AutoDrainGroupingRecord,
  right: AutoDrainGroupingRecord
): FrontierCodexSwarmAutoDrainGroupingConflict[] {
  const jobIds = [left.jobId, right.jobId].sort() as [string, string];
  const conflicts: FrontierCodexSwarmAutoDrainGroupingConflict[] = [];
  const rightRegions = new Set(right.changedRegions);
  for (const region of left.changedRegions) {
    if (rightRegions.has(region)) conflicts.push({ kind: 'region', key: `region:${region}`, value: region, jobIds });
  }
  const rightPaths = new Set(right.changedPaths);
  for (const file of left.changedPaths) {
    if (rightPaths.has(file)) conflicts.push({ kind: 'path', key: `path:${file}`, value: file, jobIds });
  }
  if (left.scopeKeys.length === 0 || right.scopeKeys.length === 0) {
    conflicts.push({ kind: 'unscoped', key: 'unscoped:*', jobIds });
  }
  return dedupeAutoDrainGroupingConflicts(conflicts);
}

function dedupeAutoDrainGroupingConflicts(
  conflicts: readonly FrontierCodexSwarmAutoDrainGroupingConflict[]
): FrontierCodexSwarmAutoDrainGroupingConflict[] {
  const byKey = new Map<string, FrontierCodexSwarmAutoDrainGroupingConflict>();
  for (const conflict of conflicts) {
    const jobIds = [...conflict.jobIds].sort() as [string, string];
    byKey.set(`${conflict.kind}:${conflict.key}:${jobIds.join(',')}`, {
      ...conflict,
      jobIds
    });
  }
  return Array.from(byKey.values()).sort((left, right) => (
    left.key.localeCompare(right.key)
      || left.jobIds.join(',').localeCompare(right.jobIds.join(','))
      || left.kind.localeCompare(right.kind)
  ));
}

function normalizeSwarmAutoDrainOptions(input: FrontierCodexSwarmRunOptions['autoDrain']): FrontierCodexSwarmAutoDrainOptions & { enabled: boolean } {
  if (input === false) return { enabled: false };
  if (input === true || input === undefined) return { enabled: true };
  return { ...input, enabled: input.enabled !== false };
}

export function deriveCodexAutonomousApplyLockKeys(input: {
  changedRegions?: readonly string[];
  changedPaths?: readonly string[];
}): FrontierCodexAutonomousApplyLockKeys {
  const changedRegions = uniqueStrings(input.changedRegions ?? []);
  if (changedRegions.length) {
    return {
      scope: 'semantic',
      keys: changedRegions.map((region) => `region:${region}`).sort()
    };
  }
  const changedPaths = uniqueWorkspacePaths(input.changedPaths ?? []);
  if (changedPaths.length) {
    return {
      scope: 'path',
      keys: changedPaths.map((file) => `path:${file}`).sort()
    };
  }
  return { scope: 'repo', keys: [AUTONOMOUS_APPLY_REPO_LOCK_KEY] };
}

function autonomousDecisionIsTerminal(status: FrontierCodexAutonomousDecisionStatus): boolean {
  return status === 'checked'
    || status === 'applied'
    || status === 'committed'
    || status === 'rejected'
    || status === 'skipped';
}

function emptyAutonomousLockScopeCounts(): FrontierCodexAutonomousLockScopeCounts {
  return { semantic: 0, path: 0, repo: 0 };
}

function summarizeAutonomousDecisionLockScopes(decisions: readonly FrontierCodexAutonomousMergeDecision[]): {
  lockKeys: string[];
  lockScopeCounts: FrontierCodexAutonomousLockScopeCounts;
} {
  const lockScopeCounts = emptyAutonomousLockScopeCounts();
  for (const decision of decisions) lockScopeCounts[decision.lockScope] += 1;
  return {
    lockKeys: uniqueStrings(decisions.flatMap((decision) => decision.lockKeys)).sort(),
    lockScopeCounts
  };
}

export async function runCodexJob(
  job: FrontierSwarmJob,
  options: FrontierCodexSwarmRunOptions,
  outDir: string,
  lease?: FrontierSwarmLease
): Promise<FrontierSwarmJobResultInput> {
  const paths = await createJobPaths(outDir, job, options);
  const workspace = await prepareCodexWorkspace(job, options);
  const workspacePlan = createCodexWorkspacePlan(job, options);
  const resourceAllocation = createCodexResourceAllocation(job, {
    cwd: options.cwd ?? process.cwd(),
    outDir,
    workspacePath: workspace,
    lease
  });
  if (resourceAllocation.browser?.profileDir) await fs.mkdir(resourceAllocation.browser.profileDir, { recursive: true });
  const hookInput = {
    job,
    cwd: options.cwd ?? process.cwd(),
    outDir,
    workspacePath: workspace,
    workspacePlan,
    paths,
    resourceAllocation
  };
  await options.prepareJobWorkspace?.(hookInput);
  const fileSnapshot = shouldSnapshotWorkspaceChanges(workspacePlan, options)
    ? await snapshotWorkspaceFiles(workspace)
    : undefined;
  await fs.writeFile(paths.resourceAllocationPath, JSON.stringify(resourceAllocation, null, 2) + '\n');
  const basePrompt = renderCodexPrompt(job, { workspacePath: workspace, paths, resourceAllocation });
  const prompt = options.renderJobPrompt
    ? await options.renderJobPrompt({ ...hookInput, prompt: basePrompt })
    : basePrompt;
  await fs.writeFile(paths.promptPath, prompt);
  const args = buildCodexArgs(job, { ...options, workspacePath: workspace, paths });
  await options.onJobStarted?.({ ...hookInput, prompt, args });
  await appendFileSwarmEvent(options.eventStream, {
    type: 'agent.scheduled',
    jobId: job.id,
    taskId: job.taskId,
    lane: job.lane,
    data: {
      workspace: workspacePlan.path,
      capabilities: job.capabilities,
      resourceRequirements: job.resourceRequirements,
      resourceAllocation
    }
  });
  const startedAt = Date.now();
  const execution = options.dryRun
    ? { exitCode: 0, changedPaths: [] }
    : await (options.executor ?? spawnCodexExecutor)({
      job,
      prompt,
      args,
      cwd: options.cwd ?? process.cwd(),
      workspacePath: workspace,
      codexPath: options.codexPath ?? 'codex',
      paths,
      resourceAllocation,
      env: resourceAllocation.env,
      timeoutMs: job.compute.timeoutMs ?? options.jobTimeoutMs ?? 7200000
    });
  const collected = execution.changedPaths
    ? filterWorkspaceChangedPaths(execution.changedPaths, workspacePlan)
    : options.collectGitStatus === false
      ? { changedPaths: [], ignoredChangedPaths: [] }
      : await collectChangedPaths(workspace, fileSnapshot, workspacePlan);
  const rawChangedPaths = collected.changedPaths;
  const changedPaths = options.changedPathFilter ? [...options.changedPathFilter(rawChangedPaths, hookInput)] : rawChangedPaths;
  const workspaceProof = await createSwarmWorkspaceProof(workspacePlan, { ignoredChangedPaths: collected.ignoredChangedPaths });
  await fs.writeFile(paths.workspaceProofPath, JSON.stringify(workspaceProof, null, 2) + '\n');
  const ownership = checkSwarmOwnership(job, changedPaths);
  const verification = options.runVerification ? await runVerification(job.verification, workspace) : [];
  const failedVerification = verification.some((entry) => entry.required !== false && entry.status !== 0);
  const status = ownership.ok && execution.exitCode === 0 && !failedVerification ? 'completed' : 'failed';
  const patchPath = await writeCodexPatchFile({
    workspace,
    sourceRoot: path.resolve(options.cwd ?? process.cwd()),
    paths,
    workspacePlan,
    changedPaths
  });
  const semanticImport = await createCodexSemanticImportSidecar({
    job,
    workspace,
    changedPaths,
    evidenceDir: paths.evidenceDir,
    options: options.semanticImport
  });
  const handoffArtifacts = await discoverCodexHandoffArtifacts({ root: paths.jobDir });
  const evidencePaths = uniqueStrings([
    paths.evidenceDir,
    paths.resourceAllocationPath,
    paths.workspaceProofPath,
    paths.mergeBundlePath,
    ...(patchPath ? [patchPath] : []),
    ...(semanticImport ? [semanticImport.path] : []),
    ...handoffArtifacts.map((artifact) => artifact.path)
  ]);
  const result: FrontierSwarmJobResultInput = {
    jobId: job.id,
    status,
    startedAt,
    finishedAt: Date.now(),
    exitCode: execution.exitCode,
    signal: execution.signal,
    changedPaths,
    changedRegions: job.changedRegions,
    ownershipViolations: ownership.violations,
    evidencePaths,
    ...(patchPath ? { patchPath } : {}),
    queueItemIds: [job.taskId],
    verification,
    lastMessage: execution.lastMessage,
    error: execution.error,
    metadata: {
      ...(lease ? { leaseId: lease.id, leaseToken: lease.token, fencingToken: lease.fencingToken } : {}),
      resourceAllocation,
      ...(semanticImport ? { semanticImport: semanticImport.sidecar.summary } : {}),
      codexHandoffArtifacts: handoffArtifacts
    }
  };
  const mergeBundle = createSwarmMergeBundle({
    runId: options.eventStream?.runId,
    job,
    result,
    ...(patchPath ? { patchPath } : {}),
    evidencePaths: uniqueStrings([
      paths.evidenceDir,
      paths.resourceAllocationPath,
      paths.workspaceProofPath,
      ...(semanticImport ? [semanticImport.path] : []),
      ...handoffArtifacts.map((artifact) => artifact.path)
    ]),
    queueItemIds: [job.taskId],
    ...(semanticImport ? { metadata: { semanticImport: semanticImport.sidecar.summary } } : {})
  });
  await fs.writeFile(paths.mergeBundlePath, JSON.stringify(mergeBundle, null, 2) + '\n');
  return result;
}

async function createCodexSemanticImportSidecar(input: {
  job: FrontierSwarmJob;
  workspace: string;
  changedPaths: readonly string[];
  evidenceDir: string;
  options?: boolean | FrontierCodexSemanticImportOptions;
}): Promise<{ path: string; sidecar: FrontierCodexSemanticImportSidecar } | undefined> {
  const options = normalizeSemanticImportOptions(input.options);
  if (!options) return undefined;
  const selection = selectSemanticImportPaths(input.changedPaths, options);
  const selected = selection.selected;
  const records: FrontierCodexSemanticImportRecord[] = [];
  const importPath = path.join(input.evidenceDir, 'semantic-imports.json');
  if (!selected.length) {
    const sidecar = createSemanticImportSidecar(input.job, records, selection);
    await fs.writeFile(importPath, JSON.stringify(sidecar, null, 2) + '\n');
    return { path: importPath, sidecar };
  }
  const api = await loadFrontierLangForSemanticImport();
  if (!api.ok) {
    for (const file of selected) {
      records.push({
        path: file.path,
        language: file.language,
        status: 'error',
        reason: 'frontier-lang-unavailable',
        error: api.error
      });
    }
    const sidecar = createSemanticImportSidecar(input.job, records, selection);
    await fs.writeFile(importPath, JSON.stringify(sidecar, null, 2) + '\n');
    return { path: importPath, sidecar };
  }
  for (const file of selected) {
    const absolute = path.join(input.workspace, file.path);
    const stat = await fs.stat(absolute).catch(() => undefined);
    if (!stat?.isFile()) {
      records.push({ path: file.path, language: file.language, status: 'skipped', reason: 'not-a-file' });
      continue;
    }
    if (stat.size > options.maxBytes) {
      records.push({ path: file.path, language: file.language, status: 'skipped', reason: 'too-large', bytes: stat.size });
      continue;
    }
    try {
      const sourceText = await fs.readFile(absolute, 'utf8');
      const importResult = api.importNativeSource({
        language: file.language,
        sourcePath: file.path,
        sourceText,
        parser: 'source-text',
        metadata: {
          swarmJobId: input.job.id,
          swarmTaskId: input.job.taskId,
          swarmLane: input.job.lane
        }
      });
      const mergeCandidate = api.createSemanticMergeCandidateFromImport({ importResult });
      const sourceMaps = Array.isArray(importResult?.sourceMaps)
        ? importResult.sourceMaps
        : Array.isArray(importResult?.universalAst?.sourceMaps)
          ? importResult.universalAst.sourceMaps
          : [];
      records.push({
        path: file.path,
        language: file.language,
        status: 'imported',
        bytes: stat.size,
        importId: importResult?.id,
        universalAstHash: api.hashUniversalAstEnvelope && importResult?.universalAst
          ? api.hashUniversalAstEnvelope(importResult.universalAst)
          : undefined,
        nativeAstId: importResult?.nativeAst?.id,
        nativeSourceId: importResult?.nativeSource?.id,
        sourceMapCount: sourceMaps.length,
        sourceMapMappingCount: sourceMaps.reduce((sum: number, sourceMap: any) => sum + (Array.isArray(sourceMap?.mappings) ? sourceMap.mappings.length : 0), 0),
        evidenceCount: Array.isArray(importResult?.evidence) ? importResult.evidence.length : 0,
        lossCount: Array.isArray(importResult?.losses) ? importResult.losses.length : 0,
        losses: summarizeSemanticLosses(importResult?.losses),
        semanticIndex: summarizeSemanticIndex(importResult?.semanticIndex),
        mergeCandidate: summarizeSemanticMergeCandidate(mergeCandidate)
      });
    } catch (error) {
      records.push({
        path: file.path,
        language: file.language,
        status: 'error',
        bytes: stat.size,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const sidecar = createSemanticImportSidecar(input.job, records, selection);
  await fs.writeFile(importPath, JSON.stringify(sidecar, null, 2) + '\n');
  return { path: importPath, sidecar };
}

export async function discoverCodexHandoffArtifacts(input: FrontierCodexHandoffDiscoveryInput): Promise<FrontierCodexHandoffArtifact[]> {
  const root = path.resolve(input.root);
  const maxDepth = Math.max(0, Math.floor(input.maxDepth ?? 3));
  const maxArtifacts = Math.max(1, Math.floor(input.maxArtifacts ?? 64));
  const artifacts: FrontierCodexHandoffArtifact[] = [];
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (artifacts.length >= maxArtifacts || depth > maxDepth) return;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (artifacts.length >= maxArtifacts) return;
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = classifyCodexHandoffArtifact(full);
      if (!kind) continue;
      const stat = await fs.stat(full).catch(() => undefined);
      artifacts.push({
        path: full,
        kind,
        ...(stat ? { bytes: stat.size } : {})
      });
    }
  };
  await visit(root, 0);
  return artifacts.sort((left, right) => left.path.localeCompare(right.path));
}

export function buildCodexArgs(
  job: FrontierSwarmJob,
  input: FrontierCodexSwarmRunOptions & { workspacePath: string; paths: FrontierCodexJobPaths }
): string[] {
  const model = resolveCodexModelFlag(job, input);
  const effort = resolveCodexReasoningEffort(job, input);
  const sandbox = job.compute.sandbox ?? input.sandbox ?? 'workspace-write';
  const approval = normalizeCodexApprovalPolicy(input.approval);
  const args = [
    ...(approval ? ['--ask-for-approval', approval] : []),
    'exec',
    '--cd',
    input.workspacePath,
    '--add-dir',
    path.resolve(input.cwd ?? process.cwd(), input.outDir),
    '--sandbox',
    sandbox,
    '--json',
    '--output-last-message',
    input.paths.lastMessagePath
  ];
  if (model) args.push('--model', model);
  if (effort) args.push('-c', `model_reasoning_effort="${effort}"`);
  if (shouldSkipGitRepoCheck(input)) args.push('--skip-git-repo-check');
  for (const dir of input.addDirs ?? []) args.push('--add-dir', dir);
  const profile = job.compute.profile ?? input.profile;
  if (profile) args.push('--profile', profile);
  if (input.ephemeral ?? true) args.push('--ephemeral');
  args.push('-');
  return args;
}

export function normalizeCodexModelFlag(model: string | false | null | undefined): string | undefined {
  if (model === false || model == null) return undefined;
  const value = String(model).trim();
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'auto' || normalized === 'default' || normalized === 'config' || normalized === 'config-default') {
    return undefined;
  }
  return value;
}

export function normalizeCodexApprovalPolicy(
  approval: string | false | null | undefined
): 'untrusted' | 'on-failure' | 'on-request' | 'never' | undefined {
  if (approval === false || approval == null) return undefined;
  const value = String(approval).trim().toLowerCase().replaceAll('_', '-');
  if (!value || value === 'default' || value === 'config-default') return undefined;
  if (value === 'never' || value === 'none' || value === 'off' || value === 'false' || value === 'full-auto') return 'never';
  if (value === 'untrusted') return 'untrusted';
  if (value === 'on-failure') return 'on-failure';
  if (value === 'on-request' || value === 'request' || value === 'manual') return 'on-request';
  throw new Error(
    `unsupported Codex approval policy "${approval}"; expected untrusted, on-request, on-failure, never, full-auto, none, or default`
  );
}

function resolveCodexModelFlag(
  job: FrontierSwarmJob,
  input: FrontierCodexSwarmRunOptions
): string | undefined {
  const explicit = normalizeCodexModelFlag(input.model);
  if (explicit || input.model === false) return explicit;
  const policy = input.modelPolicy ?? (input.forwardPlanModel ? 'plan' : 'config-default');
  if (policy === 'plan') return normalizeCodexModelFlag(job.compute.model ?? FRONTIER_SWARM_CODEX_DEFAULT_MODEL);
  return undefined;
}

function resolveCodexReasoningEffort(
  job: FrontierSwarmJob,
  input: FrontierCodexSwarmRunOptions
): string | undefined {
  if (input.reasoningEffort === false) return undefined;
  if (typeof input.reasoningEffort === 'string') {
    const explicit = input.reasoningEffort.trim();
    return explicit && explicit !== 'default' && explicit !== 'config-default' ? explicit : undefined;
  }
  const policy = input.modelPolicy ?? (input.forwardPlanModel || input.forwardPlanReasoningEffort ? 'plan' : 'config-default');
  if (policy !== 'plan') return undefined;
  const effort = job.compute.reasoningEffort ?? FRONTIER_SWARM_CODEX_DEFAULT_REASONING_EFFORT;
  return effort ? String(effort).trim() : undefined;
}

export function createCodexResourceAllocation(
  job: FrontierSwarmJob,
  input: { cwd?: string; outDir: string; workspacePath?: string; lease?: FrontierSwarmLease }
): FrontierCodexResourceAllocation {
  const requirements = job.resourceRequirements;
  const capabilities = uniqueStrings([...(job.capabilities ?? []), ...(requirements?.capabilities ?? [])]);
  const resources = { ...(requirements?.resources ?? {}) };
  const env: Record<string, string> = {
    FRONTIER_SWARM_JOB_ID: job.id,
    FRONTIER_SWARM_TASK_ID: job.taskId,
    FRONTIER_SWARM_LANE: job.lane,
    FRONTIER_SWARM_CAPABILITIES: capabilities.join(',')
  };
  const browser = requirements?.browser;
  if (!browser) return { capabilities, resources, env };
  const portPool = uniqueWorkspacePaths(browser.portPool ?? []);
  const port = portPool.length ? portPool[resourceSlot(job, input.lease, portPool.length)] : undefined;
  const profileDir = resolveBrowserProfileDir(job, browser.profileDir, browser.profileDirPrefix, input.cwd ?? process.cwd());
  const browserAllocation: FrontierCodexBrowserAllocation = {
    required: browser.required,
    portPool,
    ...(port ? { port } : {}),
    ...(profileDir ? { profileDir } : {}),
    ...(browser.headless !== undefined ? { headless: browser.headless } : {})
  };
  env.FRONTIER_SWARM_BROWSER_REQUIRED = String(browser.required);
  if (port) {
    env.FRONTIER_SWARM_BROWSER_PORT = port;
    env.PORT = port;
  }
  if (profileDir) env.FRONTIER_SWARM_BROWSER_PROFILE_DIR = profileDir;
  if (browser.headless !== undefined) env.FRONTIER_SWARM_BROWSER_HEADLESS = String(browser.headless);
  env.FRONTIER_SWARM_RESOURCE_ALLOCATION = JSON.stringify({ capabilities, resources, browser: browserAllocation });
  return {
    capabilities,
    resources,
    env,
    browser: browserAllocation
  };
}

export function renderCodexPrompt(
  job: FrontierSwarmJob,
  input: { workspacePath: string; paths: FrontierCodexJobPaths; resourceAllocation?: FrontierCodexResourceAllocation }
): string {
  const resourceAllocation = input.resourceAllocation ?? createCodexResourceAllocation(job, { outDir: input.paths.jobDir, workspacePath: input.workspacePath });
  return [
    '# Frontier Swarm Codex Job',
    '',
    `Job: ${job.id}`,
    `Task: ${job.taskId}`,
    `Lane: ${job.lane}`,
    `Layer: ${job.layer ?? 'none'}`,
    `Compute: ${job.compute.id}`,
    `Workspace: ${input.workspacePath}`,
    '',
    '## Ownership',
    '',
    'Allowed write globs:',
    ...bullets(job.allowedWrites),
    '',
    'Shared read-only globs:',
    ...bullets(job.sharedReadOnly),
    '',
    'Never edit without parent assignment:',
    ...bullets(job.neverEdit),
    '',
    '## Task',
    '',
    job.task.objective,
    '',
    'Dependencies:',
    ...bullets(job.dependsOn),
    '',
    'Budget:',
    ...bullets(formatBudget(job)),
    '',
    'Resource allocation:',
    ...bullets(formatResourceAllocation(resourceAllocation)),
    '',
    'Source refs:',
    ...bullets(job.task.sourceRefs),
    '',
    'Target refs:',
    ...bullets(job.task.targetRefs),
    '',
    'Acceptance:',
    ...bullets(job.acceptance),
    '',
    'Verification commands:',
    ...bullets(job.verification.map(formatCommand)),
    '',
    '## Evidence',
    '',
    `Write evidence under ${input.paths.evidenceDir}.`,
    'If this is a copy or snapshot workspace under an ignored parent directory, `git status` may not show your file edits. Verify created or changed files with direct filesystem reads/checks, and let the runner snapshot determine changed paths.',
    'Final response must include changed files, commands run, evidence paths, remaining gaps, and whether changed paths stayed inside allowed write globs.',
    '',
    'Raw task JSON:',
    '',
    JSON.stringify(job.task, null, 2)
  ].join('\n') + '\n';
}

export async function spawnCodexExecutor(input: FrontierCodexExecutorInput): Promise<FrontierCodexExecutorResult> {
  await fs.writeFile(input.paths.eventsPath, '');
  await fs.writeFile(input.paths.stderrPath, '');
  return new Promise((resolve) => {
    const child = spawn(input.codexPath, input.args, {
      cwd: input.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...input.env }
    });
    if (child.pid) {
      appendCodexPidManifest(input.paths.pidManifestPath, {
        pid: child.pid,
        role: 'codex',
        jobId: input.job.id,
        startedAt: Date.now(),
        command: [input.codexPath, ...input.args]
      }).catch(() => {});
    }
    const timer = setTimeout(() => child.kill('SIGTERM'), input.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => fs.appendFile(input.paths.eventsPath, chunk).catch(() => {}));
    child.stderr.on('data', (chunk: Buffer) => fs.appendFile(input.paths.stderrPath, chunk).catch(() => {}));
    child.stdin.end(input.prompt);
    child.on('close', async (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        ...(signal ? { signal } : {}),
        lastMessage: await readOptionalText(input.paths.lastMessagePath)
      });
    });
    child.on('error', (error: Error) => {
      clearTimeout(timer);
      resolve({ exitCode: 1, error });
    });
  });
}

async function createJobPaths(outDir: string, job: FrontierSwarmJob, options: FrontierCodexSwarmRunOptions): Promise<FrontierCodexJobPaths> {
  const jobDir = path.join(outDir, job.id);
  const paths = {
    jobDir,
    promptPath: path.join(jobDir, 'prompt.md'),
    eventsPath: path.join(jobDir, 'codex-events.jsonl'),
    stderrPath: path.join(jobDir, 'codex-stderr.log'),
    lastMessagePath: path.join(jobDir, 'last-message.md'),
    evidenceDir: path.join(jobDir, 'evidence'),
    resourceAllocationPath: path.join(jobDir, 'evidence', 'resource-allocation.json'),
    workspaceProofPath: path.join(jobDir, 'evidence', 'workspace-proof.json'),
    patchPath: path.join(jobDir, 'evidence', 'changes.patch'),
    mergeBundlePath: path.join(jobDir, 'evidence', 'merge.json'),
    pidManifestPath: path.resolve(options.cwd ?? process.cwd(), options.pidManifestPath ?? path.join(outDir, 'pids.json'))
  };
  await fs.mkdir(paths.evidenceDir, { recursive: true });
  return paths;
}

export async function prepareCodexWorkspace(job: FrontierSwarmJob, options: FrontierCodexSwarmRunOptions): Promise<string> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const plan = createCodexWorkspacePlan(job, options);
  if (plan.mode === 'current') return plan.path;
  if (plan.mode === 'git-worktree') {
    if (await pathExists(plan.path)) return plan.path;
    if (options.workspace?.create === false) throw new Error(`missing worktree for ${job.id}: ${plan.path}`);
    await fs.mkdir(path.dirname(plan.path), { recursive: true });
    await runProcess('git', ['worktree', 'add', '--detach', plan.path, 'HEAD'], { cwd });
    return plan.path;
  }
  if (await pathExists(plan.path)) {
    if (!plan.replace) return plan.path;
    assertGeneratedWorkspacePath(plan);
    await fs.rm(plan.path, { recursive: true, force: true });
  }
  await fs.mkdir(plan.path, { recursive: true });
  for (const include of plan.includes) await copyWorkspacePath(cwd, plan.path, include, plan.excludes);
  for (const include of plan.artifactIncludes) await copyWorkspacePath(cwd, plan.path, include, []);
  for (const linkPath of plan.linkPaths) await linkWorkspacePath(cwd, plan.path, linkPath);
  if (plan.linkNodeModules) await linkWorkspacePath(cwd, plan.path, 'node_modules');
  return plan.path;
}

export function createCodexWorkspacePlan(job: FrontierSwarmJob, options: FrontierCodexSwarmRunOptions): FrontierCodexWorkspacePlan {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const workspace = options.workspace ?? { mode: 'current' };
  const mode = workspace.mode ?? 'current';
  const root = path.resolve(cwd, workspace.root ?? path.join('agent-worktrees', 'frontier-swarm-codex'));
  const rawTask = readRawTask(job);
  if (mode === 'current') {
    const currentPath = path.resolve(cwd, job.worktreePath ?? '.');
    return {
      mode,
      root,
      path: currentPath,
      includes: [],
      excludes: [],
      artifactIncludes: [],
      linkPaths: [],
      requiredIncludes: [],
      optionalIncludes: [],
      strategy: workspace.strategy ?? 'fs-cp',
      ...(workspace.guardRoot ? { guardRoot: path.resolve(cwd, workspace.guardRoot) } : {}),
      linkNodeModules: false,
      replace: false,
      skipGitRepoCheck: workspace.skipGitRepoCheck ?? false
    };
  }
  const includes = uniqueWorkspacePaths([
    ...DEFAULT_WORKSPACE_INCLUDES,
    ...readStringArray(workspace.includes),
    ...readStringArray(rawTask.snapshotIncludes),
    ...readStringArray(rawTask.files),
    ...job.task.sourceRefs,
    ...job.task.targetRefs
  ]);
  const excludes = uniqueWorkspacePaths([
    ...DEFAULT_WORKSPACE_EXCLUDES,
    ...readStringArray(workspace.excludes),
    ...readStringArray(rawTask.snapshotExcludes)
  ]);
  const artifactIncludes = uniqueWorkspacePaths([
    ...readStringArray(workspace.artifactIncludes),
    ...readStringArray(rawTask.snapshotArtifactIncludes)
  ]);
  const linkPaths = uniqueWorkspacePaths([
    ...readStringArray(workspace.linkPaths),
    ...readStringArray(rawTask.snapshotLinkPaths),
    ...readStringArray(rawTask.linkPaths)
  ]);
  const requiredIncludes = uniqueWorkspacePaths([
    ...readStringArray(workspace.requiredIncludes),
    ...readStringArray(rawTask.requiredIncludes),
    ...readStringArray(rawTask.snapshotRequiredIncludes)
  ]);
  const optionalIncludes = uniqueWorkspacePaths([
    ...readStringArray(workspace.optionalIncludes),
    ...readStringArray(rawTask.optionalIncludes),
    ...readStringArray(rawTask.snapshotOptionalIncludes)
  ]);
  return {
    mode,
    root,
    path: path.resolve(root, job.id),
    includes,
    excludes,
    artifactIncludes,
    linkPaths,
    requiredIncludes,
    optionalIncludes,
    strategy: workspace.strategy ?? 'fs-cp',
    guardRoot: path.resolve(cwd, workspace.guardRoot ?? workspace.root ?? path.join('agent-worktrees', 'frontier-swarm-codex')),
    linkNodeModules: workspace.linkNodeModules ?? (mode !== 'git-worktree'),
    replace: workspace.replace ?? false,
    skipGitRepoCheck: workspace.skipGitRepoCheck ?? (mode === 'copy' || mode === 'snapshot')
  };
}

export function createSwarmWorkspaceManifest(plan: FrontierCodexWorkspacePlan): FrontierCodexWorkspaceManifest {
  return {
    kind: FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_KIND,
    version: FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_VERSION,
    id: 'codex-workspace:' + stableHash([plan.mode, plan.root, plan.path, plan.includes, plan.linkPaths]),
    mode: plan.mode,
    root: plan.root,
    path: plan.path,
    includes: [...plan.includes],
    excludes: [...plan.excludes],
    artifactIncludes: [...plan.artifactIncludes],
    linkPaths: [...plan.linkPaths],
    requiredIncludes: [...plan.requiredIncludes],
    optionalIncludes: [...plan.optionalIncludes],
    strategy: plan.strategy,
    ...(plan.guardRoot ? { guardRoot: plan.guardRoot } : {}),
    linkNodeModules: plan.linkNodeModules,
    skipGitRepoCheck: plan.skipGitRepoCheck
  };
}

export async function createSwarmWorkspaceProof(
  plan: FrontierCodexWorkspacePlan,
  input: { ignoredChangedPaths?: readonly string[]; generatedAt?: number } = {}
): Promise<FrontierCodexWorkspaceProof> {
  const generatedAt = input.generatedAt ?? Date.now();
  const manifest = createSwarmWorkspaceManifest(plan);
  const copiedCandidates = uniqueWorkspacePaths([...plan.includes, ...plan.artifactIncludes, ...plan.requiredIncludes]);
  const optionalCandidates = uniqueWorkspacePaths(plan.optionalIncludes);
  const copiedPaths: string[] = [];
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  for (const include of copiedCandidates) {
    if (await pathExists(path.join(plan.path, include))) copiedPaths.push(include);
    else if (plan.requiredIncludes.includes(include)) missingRequired.push(include);
  }
  for (const include of optionalCandidates) {
    if (await pathExists(path.join(plan.path, include))) copiedPaths.push(include);
    else missingOptional.push(include);
  }
  const linkedPaths: string[] = [];
  for (const linkPath of uniqueWorkspacePaths([...plan.linkPaths, ...(plan.linkNodeModules ? ['node_modules'] : [])])) {
    const stat = await fs.lstat(path.join(plan.path, linkPath)).catch(() => undefined);
    if (stat?.isSymbolicLink()) linkedPaths.push(linkPath);
  }
  const ignoredChangedPaths = uniqueWorkspacePaths(input.ignoredChangedPaths ?? []);
  return {
    kind: FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_KIND,
    version: FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_VERSION,
    id: 'codex-workspace-proof:' + stableHash([manifest.id, copiedPaths, linkedPaths, missingRequired, missingOptional, generatedAt]),
    generatedAt,
    manifest,
    copiedPaths: uniqueWorkspacePaths(copiedPaths),
    linkedPaths,
    missingRequired,
    missingOptional,
    ignoredChangedPaths,
    summary: {
      copiedCount: uniqueWorkspacePaths(copiedPaths).length,
      linkedCount: linkedPaths.length,
      missingRequiredCount: missingRequired.length,
      missingOptionalCount: missingOptional.length,
      ignoredChangedPathCount: ignoredChangedPaths.length
    }
  };
}

export async function initFileSwarmEventStream(stream: FrontierSwarmEventStream | undefined): Promise<void> {
  if (!stream) return;
  const mailboxes = [stream.global, ...Object.values(stream.lanes)];
  await Promise.all(mailboxes.map(async (mailbox) => {
    if (!mailbox.path) return;
    await fs.mkdir(path.dirname(mailbox.path), { recursive: true });
    await fs.writeFile(mailbox.path, '');
  }));
}

export async function appendFileSwarmEvent(stream: FrontierSwarmEventStream | undefined, event: FrontierSwarmEventInput): Promise<void> {
  if (!stream) return;
  const line = JSON.stringify({ at: Date.now(), ...event }) + '\n';
  const paths = routeSwarmEventToMailboxes(stream, event)
    .map((mailbox) => mailbox.path)
    .filter((mailboxPath): mailboxPath is string => !!mailboxPath);
  await Promise.all(paths.map(async (mailboxPath) => {
    await fs.mkdir(path.dirname(mailboxPath), { recursive: true });
    await fs.appendFile(mailboxPath, line);
  }));
}

export async function writeSwarmCoordinatorSnapshot(
  file: string,
  input: FrontierCodexSwarmRunResult & { eventStream?: FrontierSwarmEventStream; pidManifestPath?: string }
): Promise<void> {
  const byLane = input.run.jobs.reduce<Record<string, { total: number; completed: number; failed: number; blocked: number }>>((acc, job) => {
    const current = acc[job.lane] ?? { total: 0, completed: 0, failed: 0, blocked: 0 };
    current.total += 1;
    const result = input.run.results.find((entry) => entry.jobId === job.id);
    if (result?.status === 'completed' || result?.status === 'verified') current.completed += 1;
    else if (result?.status === 'failed') current.failed += 1;
    else if (result?.status === 'blocked') current.blocked += 1;
    acc[job.lane] = current;
    return acc;
  }, {});
  const mergeReadiness = input.run.results.reduce<Record<string, number>>((acc, result) => {
    acc[result.mergeReadiness] = (acc[result.mergeReadiness] ?? 0) + 1;
    return acc;
  }, {});
  const queueMetadata = createDashboardQueueMetadata(input.autoDrainArtifacts ?? input.autoDrain?.artifacts ?? null, input.autoDrain ?? null);
  const dashboard = {
    kind: 'frontier.swarm-codex.coordinator-dashboard',
    version: 1,
    generatedAt: new Date().toISOString(),
    ok: input.ok,
    outDir: input.outDir,
    runId: input.run.id,
    planId: input.plan.id,
    summary: input.run.summary,
    byLane,
    mergeReadiness,
    queueMetadata,
    queueHealth: queueMetadata.queueHealth,
    humanQuestions: queueMetadata.humanQuestions,
    autoDrain: input.autoDrain ?? null,
    autoDrainArtifacts: input.autoDrainArtifacts ?? input.autoDrain?.artifacts ?? null,
    eventStream: input.eventStream ?? null,
    pidManifestPath: input.pidManifestPath ?? null,
    proof: input.proof
  };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(dashboard, null, 2) + '\n');
}

function createDashboardQueueMetadata(
  artifacts: FrontierCodexAutoDrainArtifactMetadata | null,
  autoDrain: FrontierCodexSwarmAutoDrainResult | null
): FrontierCodexDashboardQueueMetadata {
  const iterations = artifacts?.iterations ?? [];
  const decisionSummary = summarizeDashboardAutonomousDecisions(autoDrain);
  const staleCount = artifacts?.grouping.staleAgainstHeadCount ?? 0;
  const queueRerunCount = artifacts?.mergeQueue.rerunCount ?? 0;
  const rerunCount = queueRerunCount + decisionSummary.rerunDecisionCount;
  const humanQuestions: FrontierCodexDashboardHumanQuestions = {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_VERSION,
    source: autoDrain ? FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND : 'not-collected',
    available: !!autoDrain,
    count: decisionSummary.humanBlockedDecisionCount,
    decisionCount: decisionSummary.humanBlockedDecisionCount,
    jobIds: decisionSummary.humanQuestionJobIds,
    taskIds: decisionSummary.humanQuestionTaskIds,
    reasons: decisionSummary.humanQuestionReasons
  };
  const queueHealth: FrontierCodexDashboardQueueHealth = {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_HEALTH_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_HEALTH_VERSION,
    source: artifacts ? FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND : 'not-collected',
    available: !!artifacts,
    activeCoordinatorQueueCount: artifacts?.mergeQueue.count ?? 0,
    leaseCount: artifacts?.mergeQueue.scopeCount ?? 0,
    lockKeyCount: autoDrain?.lockKeys.length ?? 0,
    lockScopeCounts: autoDrain?.lockScopeCounts ?? { semantic: 0, path: 0, repo: 0 },
    localQueueCount: artifacts?.mergeQueue.queueLocalCount ?? 0,
    promotedCount: artifacts?.mergeQueue.promoteCount ?? 0,
    appliedDecisionCount: decisionSummary.appliedDecisionCount,
    committedDecisionCount: decisionSummary.committedDecisionCount,
    staleOrRerunCount: Math.max(staleCount, queueRerunCount) + decisionSummary.rerunDecisionCount,
    staleCount,
    rerunCount,
    conflictBlockedDecisionCount: decisionSummary.conflictBlockedDecisionCount,
    trueBlockerCount: artifacts?.mergeQueue.blockCount ?? 0,
    rejectedCount: artifacts?.mergeQueue.rejectCount ?? 0,
    recordOnlyCount: artifacts?.mergeQueue.recordOnlyCount ?? 0,
    coordinatorReviewCount: artifacts?.reviewer.taskCount ?? 0,
    coordinatorReviewAssignmentCount: artifacts?.reviewer.assignmentCount ?? 0,
    coordinatorReviewTaskCount: artifacts?.reviewer.taskCount ?? 0,
    humanQuestionCount: humanQuestions.count
  };
  return {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_VERSION,
    source: artifacts ? FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND : 'not-collected',
    available: !!artifacts,
    paths: {
      autoDrain: artifacts ? [artifacts.autoDrainPath] : [],
      collections: compactArtifactPaths(iterations.map((iteration) => iteration.collectionPath)),
      mergeQueues: artifacts?.mergeQueue.paths ?? [],
      queueOverlays: compactArtifactPaths(iterations.map((iteration) => iteration.queueOverlayPath))
    },
    actionCounts: {
      applyLocalCount: artifacts?.mergeQueue.applyLocalCount ?? 0,
      queueLocalCount: artifacts?.mergeQueue.queueLocalCount ?? 0,
      promoteCount: artifacts?.mergeQueue.promoteCount ?? 0,
      rerunCount: artifacts?.mergeQueue.rerunCount ?? 0,
      rejectCount: artifacts?.mergeQueue.rejectCount ?? 0,
      blockCount: artifacts?.mergeQueue.blockCount ?? 0,
      trueBlockerCount: artifacts?.mergeQueue.blockCount ?? 0,
      conflictBlockedDecisionCount: decisionSummary.conflictBlockedDecisionCount,
      recordOnlyCount: artifacts?.mergeQueue.recordOnlyCount ?? 0
    },
    bucketCounts: {
      readyToApplyCount: artifacts?.grouping.readyToApplyCount ?? 0,
      needsHumanPortCount: artifacts?.grouping.needsHumanPortCount ?? 0,
      failedEvidenceCount: artifacts?.grouping.failedEvidenceCount ?? 0,
      staleAgainstHeadCount: artifacts?.grouping.staleAgainstHeadCount ?? 0
    },
    queueHealth,
    humanQuestions
  };
}

function summarizeDashboardAutonomousDecisions(autoDrain: FrontierCodexSwarmAutoDrainResult | null): {
  appliedDecisionCount: number;
  committedDecisionCount: number;
  rerunDecisionCount: number;
  conflictBlockedDecisionCount: number;
  humanBlockedDecisionCount: number;
  humanQuestionJobIds: string[];
  humanQuestionTaskIds: string[];
  humanQuestionReasons: string[];
} {
  const decisions = (autoDrain?.iterations ?? []).flatMap((iteration) => iteration.apply?.decisions ?? []);
  const humanQuestionDecisions = decisions.filter((decision) => decision.status === 'human-blocked');
  return {
    appliedDecisionCount: decisions.filter((decision) => decision.status === 'applied' || decision.status === 'committed').length,
    committedDecisionCount: decisions.filter((decision) => decision.status === 'committed').length,
    rerunDecisionCount: decisions.filter((decision) => decision.status === 'rerun').length,
    conflictBlockedDecisionCount: decisions.filter((decision) => decision.status === 'conflict-blocked').length,
    humanBlockedDecisionCount: humanQuestionDecisions.length,
    humanQuestionJobIds: uniqueStrings(humanQuestionDecisions.map((decision) => decision.jobId)).sort(),
    humanQuestionTaskIds: uniqueStrings(humanQuestionDecisions.map((decision) => decision.taskId).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)).sort(),
    humanQuestionReasons: uniqueStrings(humanQuestionDecisions.map((decision) => decision.reason).filter((entry) => entry.length > 0)).sort()
  };
}

export async function appendCodexPidManifest(file: string, entry: FrontierCodexPidEntry, runId?: string): Promise<void> {
  const absolute = path.resolve(file);
  const previous = pidManifestWriteQueues.get(absolute) ?? Promise.resolve();
  let next: Promise<void>;
  next = previous
    .catch(() => {})
    .then(() => appendCodexPidManifestUnlocked(absolute, entry, runId))
    .finally(() => {
      if (pidManifestWriteQueues.get(absolute) === next) pidManifestWriteQueues.delete(absolute);
    });
  pidManifestWriteQueues.set(absolute, next);
  return next;
}

async function appendCodexPidManifestUnlocked(file: string, entry: FrontierCodexPidEntry, runId?: string): Promise<void> {
  const manifest = await readCodexPidManifest(file).catch(() => ({
    kind: FRONTIER_SWARM_CODEX_PID_MANIFEST_KIND,
    version: FRONTIER_SWARM_CODEX_PID_MANIFEST_VERSION,
    ...(runId ? { runId } : {}),
    entries: []
  } satisfies FrontierCodexPidManifest));
  const entries = manifest.entries.filter((existing) => existing.pid !== entry.pid || existing.jobId !== entry.jobId);
  entries.push(entry);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeJsonAtomic(file, { ...manifest, ...(runId ? { runId } : {}), entries });
}

export async function readCodexPidManifest(file: string): Promise<FrontierCodexPidManifest> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as FrontierCodexPidManifest;
}

export async function stopCodexSwarmRun(input: { run: string; signal?: NodeJS.Signals }): Promise<FrontierCodexStopResult> {
  const signal = input.signal ?? 'SIGTERM';
  const pidManifestPath = await resolvePidManifestPath(input.run);
  const manifest = await readCodexPidManifest(pidManifestPath);
  const stopped: number[] = [];
  const missing: number[] = [];
  const errors: Array<{ pid: number; error: string }> = [];
  for (const entry of manifest.entries.filter((item) => item.pid !== process.pid).sort((left, right) => right.startedAt - left.startedAt)) {
    try {
      process.kill(entry.pid, signal);
      stopped.push(entry.pid);
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code === 'ESRCH') missing.push(entry.pid);
      else errors.push({ pid: entry.pid, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok: errors.length === 0, pidManifestPath, signal, stopped, missing, errors };
}

export async function collectCodexSwarmRun(input: FrontierCodexCollectInput): Promise<FrontierCodexCollectResult> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const runDir = await resolveRunDirectory(input.run);
  const outDir = path.resolve(cwd, input.outDir ?? path.join(runDir, 'collected'));
  const buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]> = {
    'ready-to-apply': [],
    'needs-human-port': [],
    'failed-evidence': [],
    'stale-against-head': []
  };
  const collectedBundles: FrontierSwarmMergeBundle[] = [];
  const patchStatuses: Record<string, 'unknown' | 'applies' | 'missing' | 'stale'> = {};
  const mergePaths = (await findFilesByName(runDir, 'merge.json'))
    .filter((mergePath) => !pathHasIgnoredSegment(path.relative(runDir, mergePath), [
      'collected',
      'patch-scores',
      'ready-to-apply',
      'needs-human-port',
      'failed-evidence',
      'stale-against-head'
    ]));
  const mergeRecordsByJob = new Map<string, { mergePath: string; bundle: FrontierSwarmMergeBundle }>();
  for (const mergePath of mergePaths.sort()) {
    const bundle = normalizeCollectedMergeBundle(JSON.parse(await fs.readFile(mergePath, 'utf8')), mergePath);
    const existing = mergeRecordsByJob.get(bundle.jobId);
    const next = { mergePath, bundle };
    if (!existing || mergeRecordScore(next) > mergeRecordScore(existing)) mergeRecordsByJob.set(bundle.jobId, next);
  }
  const mergeRecords = Array.from(mergeRecordsByJob.values()).sort((left, right) => left.bundle.jobId.localeCompare(right.bundle.jobId));
  for (const { mergePath, bundle } of mergeRecords) {
    const patchPath = resolveBundlePatchPath(bundle, mergePath);
    const patchExists = !!patchPath && await pathExists(patchPath);
    const staleAgainstHead = input.checkStale === false ? false : await bundlePatchIsStale(bundle, mergePath, cwd);
    const bucket = classifyCodexCollectBucket(bundle, staleAgainstHead);
    const branchName = input.branchPrefix ? `${input.branchPrefix}/${slug(bundle.jobId)}` : bundle.branchName;
    const nextBundle: FrontierSwarmMergeBundle = {
      ...bundle,
      ...(branchName ? { branchName } : {}),
      staleAgainstHead: bundle.staleAgainstHead || staleAgainstHead,
      disposition: staleAgainstHead ? 'stale-against-head' : bundle.disposition,
      autoMergeable: bucket === 'ready-to-apply' && bundle.autoMergeable
    };
    collectedBundles.push(nextBundle);
    patchStatuses[nextBundle.jobId] = staleAgainstHead ? 'stale' : patchExists ? input.checkStale === false ? 'unknown' : 'applies' : 'missing';
    const outputDir = path.join(outDir, bucket, slug(bundle.jobId));
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'merge.json'), JSON.stringify(nextBundle, null, 2) + '\n');
    if (patchPath && await pathExists(patchPath)) await fs.copyFile(patchPath, path.join(outputDir, 'changes.patch')).catch(() => {});
    buckets[bucket].push({ bucket, jobId: bundle.jobId, mergePath, outputDir, bundle: nextBundle });
  }
  const mergeIndex = createSwarmMergeIndex({
    runId: path.basename(runDir),
    bundles: collectedBundles,
    patchStatuses
  });
  const mergeAdmission = createSwarmMergeAdmission({
    index: mergeIndex,
    maxReady: buckets['ready-to-apply'].length,
    allowRisks: ['low', 'medium', 'unknown'],
    generatedAt,
    metadata: { source: FRONTIER_SWARM_CODEX_COLLECTION_KIND }
  });
  const hierarchicalMergeQueue = createSwarmHierarchicalMergeQueue({
    index: mergeIndex,
    admission: mergeAdmission,
    generatedAt,
    metadata: { source: FRONTIER_SWARM_CODEX_COLLECTION_KIND }
  });
  const reviewerLanePlan = createSwarmReviewerLanePlan({
    index: mergeIndex,
    admission: mergeAdmission,
    generatedAt,
    metadata: { source: FRONTIER_SWARM_CODEX_COLLECTION_KIND }
  });
  const patchStackPlan = createSwarmPatchStackPlan({
    index: mergeIndex,
    generatedAt,
    metadata: { source: FRONTIER_SWARM_CODEX_COLLECTION_KIND }
  });
  const queueOverlay = createSwarmQueueOverlay({
    runId: path.basename(runDir),
    bundles: collectedBundles
  });
  const summary = {
    total: mergeRecords.length,
    'ready-to-apply': buckets['ready-to-apply'].length,
    'needs-human-port': buckets['needs-human-port'].length,
    'failed-evidence': buckets['failed-evidence'].length,
    'stale-against-head': buckets['stale-against-head'].length,
    admittedCount: mergeAdmission.summary.admittedCount,
    deferredCount: mergeAdmission.summary.deferredCount,
    reviewerAssignmentCount: reviewerLanePlan.summary.assignmentCount,
    reviewerTaskCount: reviewerLanePlan.summary.taskCount,
    patchStackCount: patchStackPlan.summary.stackCount,
    mergeQueueScopeCount: hierarchicalMergeQueue.summary.scopeCount,
    mergeQueueApplyLocalCount: hierarchicalMergeQueue.summary.applyLocalCount,
    mergeQueueQueueLocalCount: hierarchicalMergeQueue.summary.queueLocalCount,
    mergeQueuePromoteCount: hierarchicalMergeQueue.summary.promoteCount,
    mergeQueueRerunCount: hierarchicalMergeQueue.summary.rerunCount,
    mergeQueueRejectCount: hierarchicalMergeQueue.summary.rejectCount,
    mergeQueueBlockCount: hierarchicalMergeQueue.summary.blockCount,
    mergeQueueRecordOnlyCount: hierarchicalMergeQueue.summary.recordOnlyCount
  };
  const artifacts = createCollectArtifacts({
    outDir,
    summary,
    patchStatuses,
    mergeAdmission,
    hierarchicalMergeQueue,
    reviewerLanePlan,
    patchStackPlan
  });
  const result: FrontierCodexCollectResult = {
    kind: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
    version: FRONTIER_SWARM_CODEX_COLLECTION_VERSION,
    ok: summary['failed-evidence'] === 0 && summary['stale-against-head'] === 0,
    runDir,
    outDir,
    generatedAt,
    buckets,
    mergeIndex,
    hierarchicalMergeQueue,
    mergeAdmission,
    reviewerLanePlan,
    patchStackPlan,
    queueOverlay,
    summary,
    artifacts
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(artifacts.collectionPath, JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(artifacts.mergeIndexPath, JSON.stringify(mergeIndex, null, 2) + '\n');
  await fs.writeFile(artifacts.hierarchicalMergeQueuePath, JSON.stringify(hierarchicalMergeQueue, null, 2) + '\n');
  await fs.writeFile(artifacts.mergeAdmissionPath, JSON.stringify(mergeAdmission, null, 2) + '\n');
  await fs.writeFile(artifacts.reviewerLanePlanPath, JSON.stringify(reviewerLanePlan, null, 2) + '\n');
  await fs.writeFile(artifacts.patchStackPlanPath, JSON.stringify(patchStackPlan, null, 2) + '\n');
  await fs.writeFile(artifacts.queueOverlayPath, JSON.stringify(queueOverlay, null, 2) + '\n');
  return result;
}

function createCollectArtifacts(input: {
  outDir: string;
  summary: FrontierCodexCollectResult['summary'];
  patchStatuses: Record<string, 'unknown' | 'applies' | 'missing' | 'stale'>;
  mergeAdmission: FrontierSwarmMergeAdmission;
  hierarchicalMergeQueue: FrontierSwarmHierarchicalMergeQueue;
  reviewerLanePlan: FrontierSwarmReviewerLanePlan;
  patchStackPlan: FrontierSwarmPatchStackPlan;
}): FrontierCodexCollectArtifacts {
  return {
    collectionPath: path.join(input.outDir, 'collection.json'),
    mergeIndexPath: path.join(input.outDir, 'merge-index.json'),
    hierarchicalMergeQueuePath: path.join(input.outDir, 'hierarchical-merge-queue.json'),
    queueOverlayPath: path.join(input.outDir, 'queue-overlay.json'),
    mergeAdmissionPath: path.join(input.outDir, 'merge-admission.json'),
    reviewerLanePlanPath: path.join(input.outDir, 'reviewer-lane-plan.json'),
    patchStackPlanPath: path.join(input.outDir, 'patch-stack-plan.json'),
    bucketDirs: {
      'ready-to-apply': path.join(input.outDir, 'ready-to-apply'),
      'needs-human-port': path.join(input.outDir, 'needs-human-port'),
      'failed-evidence': path.join(input.outDir, 'failed-evidence'),
      'stale-against-head': path.join(input.outDir, 'stale-against-head')
    },
    counts: {
      groupedBundleCount: input.summary.total,
      readyToApplyCount: input.summary['ready-to-apply'],
      needsHumanPortCount: input.summary['needs-human-port'],
      failedEvidenceCount: input.summary['failed-evidence'],
      staleAgainstHeadCount: input.summary['stale-against-head'],
      admittedCount: input.mergeAdmission.summary.admittedCount,
      deferredCount: input.mergeAdmission.summary.deferredCount,
      reviewerAssignmentCount: input.reviewerLanePlan.summary.assignmentCount,
      reviewerTaskCount: input.reviewerLanePlan.summary.taskCount,
      patchStackCount: input.patchStackPlan.summary.stackCount,
      patchStackJobCount: input.patchStackPlan.summary.jobCount,
      conflictedPatchStackCount: input.patchStackPlan.summary.conflictedStackCount,
      mergeQueueScopeCount: input.hierarchicalMergeQueue.summary.scopeCount,
      mergeQueueApplyLocalCount: input.hierarchicalMergeQueue.summary.applyLocalCount,
      mergeQueueQueueLocalCount: input.hierarchicalMergeQueue.summary.queueLocalCount,
      mergeQueuePromoteCount: input.hierarchicalMergeQueue.summary.promoteCount,
      mergeQueueRerunCount: input.hierarchicalMergeQueue.summary.rerunCount,
      mergeQueueRejectCount: input.hierarchicalMergeQueue.summary.rejectCount,
      mergeQueueBlockCount: input.hierarchicalMergeQueue.summary.blockCount,
      mergeQueueRecordOnlyCount: input.hierarchicalMergeQueue.summary.recordOnlyCount,
      patchCount: Object.values(input.patchStatuses).filter((status) => status !== 'missing').length
    }
  };
}

function collectArtifactsForSnapshot(collection: FrontierCodexCollectResult): FrontierCodexCollectArtifacts {
  return collection.artifacts ?? {
    collectionPath: path.join(collection.outDir, 'collection.json'),
    mergeIndexPath: path.join(collection.outDir, 'merge-index.json'),
    hierarchicalMergeQueuePath: path.join(collection.outDir, 'hierarchical-merge-queue.json'),
    queueOverlayPath: path.join(collection.outDir, 'queue-overlay.json'),
    mergeAdmissionPath: path.join(collection.outDir, 'merge-admission.json'),
    reviewerLanePlanPath: path.join(collection.outDir, 'reviewer-lane-plan.json'),
    patchStackPlanPath: path.join(collection.outDir, 'patch-stack-plan.json'),
    bucketDirs: {
      'ready-to-apply': path.join(collection.outDir, 'ready-to-apply'),
      'needs-human-port': path.join(collection.outDir, 'needs-human-port'),
      'failed-evidence': path.join(collection.outDir, 'failed-evidence'),
      'stale-against-head': path.join(collection.outDir, 'stale-against-head')
    },
    counts: {
      groupedBundleCount: collection.summary.total,
      readyToApplyCount: collection.summary['ready-to-apply'],
      needsHumanPortCount: collection.summary['needs-human-port'],
      failedEvidenceCount: collection.summary['failed-evidence'],
      staleAgainstHeadCount: collection.summary['stale-against-head'],
      admittedCount: collection.summary.admittedCount ?? 0,
      deferredCount: collection.summary.deferredCount ?? 0,
      reviewerAssignmentCount: collection.summary.reviewerAssignmentCount ?? 0,
      reviewerTaskCount: collection.summary.reviewerTaskCount ?? 0,
      patchStackCount: collection.summary.patchStackCount ?? 0,
      patchStackJobCount: collection.patchStackPlan?.summary.jobCount ?? 0,
      conflictedPatchStackCount: collection.patchStackPlan?.summary.conflictedStackCount ?? 0,
      mergeQueueScopeCount: collection.hierarchicalMergeQueue?.summary.scopeCount ?? collection.summary.mergeQueueScopeCount ?? 0,
      mergeQueueApplyLocalCount: collection.hierarchicalMergeQueue?.summary.applyLocalCount ?? collection.summary.mergeQueueApplyLocalCount ?? 0,
      mergeQueueQueueLocalCount: collection.hierarchicalMergeQueue?.summary.queueLocalCount ?? collection.summary.mergeQueueQueueLocalCount ?? 0,
      mergeQueuePromoteCount: collection.hierarchicalMergeQueue?.summary.promoteCount ?? collection.summary.mergeQueuePromoteCount ?? 0,
      mergeQueueRerunCount: collection.hierarchicalMergeQueue?.summary.rerunCount ?? collection.summary.mergeQueueRerunCount ?? 0,
      mergeQueueRejectCount: collection.hierarchicalMergeQueue?.summary.rejectCount ?? collection.summary.mergeQueueRejectCount ?? 0,
      mergeQueueBlockCount: collection.hierarchicalMergeQueue?.summary.blockCount ?? collection.summary.mergeQueueBlockCount ?? 0,
      mergeQueueRecordOnlyCount: collection.hierarchicalMergeQueue?.summary.recordOnlyCount ?? collection.summary.mergeQueueRecordOnlyCount ?? 0,
      patchCount: 0
    }
  };
}

function createAutoDrainArtifactMetadata(input: {
  outDir: string;
  autoDrainPath: string;
  generatedAt?: number;
  iterations: readonly FrontierCodexSwarmAutoDrainIteration[];
}): FrontierCodexAutoDrainArtifactMetadata {
  const iterations: FrontierCodexAutoDrainArtifactIteration[] = input.iterations.map((iteration) => {
    const collectionArtifacts = collectArtifactsForSnapshot(iteration.collection);
    const applyPath = iteration.apply ? path.join(iteration.apply.outDir, 'autonomous-apply.json') : undefined;
    const autonomousQueueOverlayPath = iteration.apply ? path.join(iteration.apply.outDir, 'autonomous-queue-overlay.json') : undefined;
    const patchPaths = uniqueStrings((iteration.apply?.decisions ?? [])
      .map((decision) => decision.patchPath)
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0));
    return {
      index: iteration.index,
      collectionPath: collectionArtifacts.collectionPath,
      mergeIndexPath: collectionArtifacts.mergeIndexPath,
      hierarchicalMergeQueuePath: collectionArtifacts.hierarchicalMergeQueuePath,
      queueOverlayPath: collectionArtifacts.queueOverlayPath,
      mergeAdmissionPath: collectionArtifacts.mergeAdmissionPath,
      reviewerLanePlanPath: collectionArtifacts.reviewerLanePlanPath,
      patchStackPlanPath: collectionArtifacts.patchStackPlanPath,
      coordinatorAgentDrainPath: iteration.coordinatorAgentDrainPath,
      ...(iteration.postApplyCollectionPath ? { postApplyCollectionPath: iteration.postApplyCollectionPath } : {}),
      groupingPath: iteration.groupingPath,
      ...(applyPath ? { applyPath } : {}),
      ...(autonomousQueueOverlayPath ? { autonomousQueueOverlayPath } : {}),
      ...(iteration.apply?.decisionLogPath ? { decisionLogPath: iteration.apply.decisionLogPath } : {}),
      patchPaths,
      readyJobCount: iteration.readyJobIds.length,
      groupedBundleCount: collectionArtifacts.counts.groupedBundleCount,
      readyToApplyCount: collectionArtifacts.counts.readyToApplyCount,
      needsHumanPortCount: collectionArtifacts.counts.needsHumanPortCount,
      failedEvidenceCount: collectionArtifacts.counts.failedEvidenceCount,
      staleAgainstHeadCount: collectionArtifacts.counts.staleAgainstHeadCount,
      decisionCount: iteration.apply?.decisions.length ?? 0,
      admittedCount: iteration.admittedJobIds.length,
      deferredCount: iteration.deferredJobIds.length,
      reviewerAssignmentCount: collectionArtifacts.counts.reviewerAssignmentCount,
      reviewerTaskCount: collectionArtifacts.counts.reviewerTaskCount,
      patchStackCount: collectionArtifacts.counts.patchStackCount,
      patchStackJobCount: collectionArtifacts.counts.patchStackJobCount,
      conflictedPatchStackCount: collectionArtifacts.counts.conflictedPatchStackCount,
      mergeQueueScopeCount: collectionArtifacts.counts.mergeQueueScopeCount,
      mergeQueueApplyLocalCount: collectionArtifacts.counts.mergeQueueApplyLocalCount,
      mergeQueueQueueLocalCount: collectionArtifacts.counts.mergeQueueQueueLocalCount,
      mergeQueuePromoteCount: collectionArtifacts.counts.mergeQueuePromoteCount,
      mergeQueueRerunCount: collectionArtifacts.counts.mergeQueueRerunCount,
      mergeQueueRejectCount: collectionArtifacts.counts.mergeQueueRejectCount,
      mergeQueueBlockCount: collectionArtifacts.counts.mergeQueueBlockCount,
      mergeQueueRecordOnlyCount: collectionArtifacts.counts.mergeQueueRecordOnlyCount
    };
  });
  const admissionPaths = compactArtifactPaths(iterations.map((iteration) => iteration.mergeAdmissionPath));
  const coordinatorAgentPaths = compactArtifactPaths(iterations.map((iteration) => iteration.coordinatorAgentDrainPath));
  const mergeQueuePaths = compactArtifactPaths(iterations.map((iteration) => iteration.hierarchicalMergeQueuePath));
  const groupingPaths = compactArtifactPaths(iterations.flatMap((iteration) => [
    iteration.collectionPath,
    iteration.postApplyCollectionPath,
    iteration.mergeIndexPath,
    iteration.hierarchicalMergeQueuePath,
    iteration.queueOverlayPath,
    iteration.groupingPath
  ]));
  const reviewerPaths = compactArtifactPaths(iterations.flatMap((iteration) => [
    iteration.reviewerLanePlanPath,
    iteration.decisionLogPath
  ]));
  const patchStackPaths = compactArtifactPaths(iterations.flatMap((iteration) => [
    iteration.patchStackPlanPath,
    iteration.applyPath,
    iteration.autonomousQueueOverlayPath,
    ...iteration.patchPaths
  ]));
  const sum = (select: (iteration: FrontierCodexAutoDrainArtifactIteration) => number): number =>
    iterations.reduce((total, iteration) => total + select(iteration), 0);
  return {
    kind: FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND,
    version: FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_VERSION,
    outDir: input.outDir,
    autoDrainPath: input.autoDrainPath,
    generatedAt: input.generatedAt ?? Date.now(),
    admission: {
      paths: admissionPaths,
      count: admissionPaths.length,
      admittedCount: sum((iteration) => iteration.admittedCount),
      deferredCount: sum((iteration) => iteration.deferredCount)
    },
    grouping: {
      paths: groupingPaths,
      count: groupingPaths.length,
      collectionCount: iterations.length,
      groupedBundleCount: sum((iteration) => iteration.groupedBundleCount),
      readyToApplyCount: sum((iteration) => iteration.readyToApplyCount),
      needsHumanPortCount: sum((iteration) => iteration.needsHumanPortCount),
      failedEvidenceCount: sum((iteration) => iteration.failedEvidenceCount),
      staleAgainstHeadCount: sum((iteration) => iteration.staleAgainstHeadCount)
    },
    reviewer: {
      paths: reviewerPaths,
      count: reviewerPaths.length,
      assignmentCount: sum((iteration) => iteration.reviewerAssignmentCount),
      taskCount: sum((iteration) => iteration.reviewerTaskCount),
      decisionCount: sum((iteration) => iteration.decisionCount)
    },
    coordinatorAgent: {
      paths: coordinatorAgentPaths,
      count: coordinatorAgentPaths.length,
      assignmentCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrain.summary.assignmentCount, 0),
      selectedCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrain.summary.selectedCount, 0),
      deferredCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrain.summary.deferredCount, 0),
      promoteCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrain.summary.promoteCount, 0),
      queueLocalCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrain.summary.queueLocalCount, 0)
    },
    patchStack: {
      paths: patchStackPaths,
      count: patchStackPaths.length,
      stackCount: sum((iteration) => iteration.patchStackCount),
      jobCount: sum((iteration) => iteration.patchStackJobCount),
      conflictedStackCount: sum((iteration) => iteration.conflictedPatchStackCount),
      patchCount: compactArtifactPaths(iterations.flatMap((iteration) => iteration.patchPaths)).length
    },
    mergeQueue: {
      paths: mergeQueuePaths,
      count: mergeQueuePaths.length,
      scopeCount: sum((iteration) => iteration.mergeQueueScopeCount),
      applyLocalCount: sum((iteration) => iteration.mergeQueueApplyLocalCount),
      queueLocalCount: sum((iteration) => iteration.mergeQueueQueueLocalCount),
      promoteCount: sum((iteration) => iteration.mergeQueuePromoteCount),
      rerunCount: sum((iteration) => iteration.mergeQueueRerunCount),
      rejectCount: sum((iteration) => iteration.mergeQueueRejectCount),
      blockCount: sum((iteration) => iteration.mergeQueueBlockCount),
      recordOnlyCount: sum((iteration) => iteration.mergeQueueRecordOnlyCount)
    },
    iterations,
    summary: {
      pathCount: compactArtifactPaths([
        input.autoDrainPath,
        ...admissionPaths,
        ...coordinatorAgentPaths,
        ...mergeQueuePaths,
        ...groupingPaths,
        ...reviewerPaths,
        ...patchStackPaths
      ]).length,
      iterationCount: iterations.length,
      collectionCount: iterations.length,
      applyCount: iterations.filter((iteration) => !!iteration.applyPath).length,
      admissionCount: admissionPaths.length,
      coordinatorAgentDrainCount: coordinatorAgentPaths.length,
      mergeQueuePlanCount: mergeQueuePaths.length,
      reviewerPlanCount: compactArtifactPaths(iterations.map((iteration) => iteration.reviewerLanePlanPath)).length,
      patchStackPlanCount: compactArtifactPaths(iterations.map((iteration) => iteration.patchStackPlanPath)).length,
      decisionCount: sum((iteration) => iteration.decisionCount),
      patchCount: compactArtifactPaths(iterations.flatMap((iteration) => iteration.patchPaths)).length
    }
  };
}

function compactArtifactPaths(paths: readonly (string | undefined)[]): string[] {
  return uniqueStrings(paths.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0));
}

export async function applyCodexSwarmCollection(input: FrontierCodexApplyInput): Promise<FrontierCodexApplyResult> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const dryRun = input.dryRun ?? true;
  if (!input.collection && !input.run) throw new Error('apply requires --collection <dir> or --run <run-dir>');
  const collectionDir = input.collection
    ? path.resolve(cwd, input.collection)
    : (await collectCodexSwarmRun({ run: String(input.run ?? ''), cwd, outDir: input.outDir })).outDir;
  const outDir = path.resolve(cwd, input.outDir ?? path.join(collectionDir, 'apply-ledger'));
  if (!dryRun && !input.allowDirty) {
    const dirty = await gitDirty(cwd);
    if (dirty.length) throw new Error(`refusing to apply into dirty worktree; pass allowDirty to override (${dirty.slice(0, 8).join(', ')})`);
  }
  const bucket = input.bucket ?? 'ready-to-apply';
  const roots = bucket === 'all'
    ? ['ready-to-apply', 'needs-human-port', 'failed-evidence', 'stale-against-head'].map((entry) => path.join(collectionDir, entry))
    : [path.join(collectionDir, bucket)];
  const wanted = new Set(input.jobIds ?? []);
  const mergePaths = (await Promise.all(roots.map((root) => findFilesByName(root, 'merge.json')))).flat().sort();
  const entries: FrontierCodexApplyEntry[] = [];
  for (const mergePath of mergePaths.slice(0, input.limit ? Math.max(0, Math.floor(input.limit)) : undefined)) {
    const bundle = JSON.parse(await fs.readFile(mergePath, 'utf8')) as FrontierSwarmMergeBundle;
    if (wanted.size && !wanted.has(bundle.jobId)) continue;
    entries.push(await applyCodexMergeBundle({
      cwd,
      bundle,
      mergePath,
      dryRun,
      commit: input.commit ?? false,
      branchPrefix: input.branchPrefix
    }));
  }
  const summary = {
    total: entries.length,
    checked: entries.filter((entry) => entry.status === 'checked').length,
    applied: entries.filter((entry) => entry.status === 'applied').length,
    committed: entries.filter((entry) => entry.status === 'committed').length,
    skipped: entries.filter((entry) => entry.status === 'skipped').length,
    failed: entries.filter((entry) => entry.status === 'failed').length
  };
  const result: FrontierCodexApplyResult = {
    kind: FRONTIER_SWARM_CODEX_APPLY_LEDGER_KIND,
    version: FRONTIER_SWARM_CODEX_APPLY_LEDGER_VERSION,
    ok: summary.failed === 0,
    cwd,
    collectionDir,
    outDir,
    generatedAt,
    dryRun,
    entries,
    summary
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'apply-ledger.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

export async function autonomousApplyCodexSwarmRun(input: FrontierCodexAutonomousApplyInput): Promise<FrontierCodexAutonomousApplyResult> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const dryRun = input.dryRun ?? false;
  if (!input.collection && !input.run) throw new Error('autonomous apply requires --collection <dir> or --run <run-dir>');
  if (!dryRun && !input.allowDirty) {
    const dirty = await gitDirty(cwd);
    if (dirty.length) throw new Error(`refusing to autonomous-apply into dirty worktree; pass allowDirty to override (${dirty.slice(0, 8).join(', ')})`);
  }
  const baseOutDir = path.resolve(cwd, input.outDir ?? (
    input.collection
      ? path.join(path.resolve(cwd, input.collection), 'autonomous-apply')
      : path.join(await resolveRunDirectory(String(input.run ?? '')), 'autonomous-apply')
  ));
  const collectionDir = input.collection
    ? path.resolve(cwd, input.collection)
    : (await collectCodexSwarmRun({
      run: String(input.run ?? ''),
      cwd,
      outDir: path.join(baseOutDir, 'collection'),
      checkStale: input.checkStale ?? true,
      branchPrefix: input.branchPrefix
    })).outDir;
  const outDir = baseOutDir;
  const decisionLogPath = path.resolve(cwd, input.decisionLogPath ?? path.join(outDir, 'autonomous-merge-decisions.jsonl'));
  const lockPath = input.lockPath
    ? path.resolve(cwd, input.lockPath)
    : await defaultAutonomousApplyLockPath(cwd, outDir);
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.dirname(decisionLogPath), { recursive: true });
  await fs.appendFile(decisionLogPath, '');

  const readyRoot = path.join(collectionDir, 'ready-to-apply');
  const wanted = new Set(input.jobIds ?? []);
  const allMergePaths = (await findFilesByName(readyRoot, 'merge.json')).sort();
  const limit = input.limit ? Math.max(0, Math.floor(input.limit)) : undefined;
  const decisions: FrontierCodexAutonomousMergeDecision[] = [];
  const lock = await acquireAutonomousApplyLock({
    cwd,
    lockPath,
    timeoutMs: input.lockTimeoutMs,
    staleMs: input.lockStaleMs,
    dryRun
  });
  try {
    for (const mergePath of allMergePaths) {
      if (limit !== undefined && decisions.length >= limit) break;
      const raw = JSON.parse(await fs.readFile(mergePath, 'utf8')) as FrontierSwarmMergeBundle;
      const bundle = normalizeCollectedMergeBundle(raw, mergePath);
      if (wanted.size && !wanted.has(bundle.jobId)) continue;
      const decision = await applyCodexMergeBundleAutonomously({
        cwd,
        bundle,
        mergePath,
        dryRun,
        commit: input.commit ?? false,
        branchPrefix: input.branchPrefix,
        input,
        lock
      });
      decisions.push(decision);
      await appendAutonomousDecision(decisionLogPath, decision);
    }
  } finally {
    await releaseAutonomousApplyLock(lock).catch(() => {});
  }

  const queueOverlay = createAutonomousQueueOverlay({ decisions, generatedAt, runId: readRunIdFromDecisions(decisions) });
  const lockSummary = summarizeAutonomousDecisionLockScopes(decisions);
  const statuses: FrontierCodexAutonomousDecisionStatus[] = [
    'checked',
    'applied',
    'committed',
    'rejected',
    'rerun',
    'conflict-blocked',
    'human-blocked',
    'skipped',
    'failed'
  ];
  const summary = Object.fromEntries(statuses.map((status) => [status, decisions.filter((decision) => decision.status === status).length])) as Record<FrontierCodexAutonomousDecisionStatus, number>;
  const result: FrontierCodexAutonomousApplyResult = {
    kind: FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND,
    version: FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_VERSION,
    ok: decisions.every((decision) => decision.status === 'checked' || decision.status === 'applied' || decision.status === 'committed' || decision.status === 'skipped' || decision.status === 'rejected'),
    cwd,
    collectionDir,
    outDir,
    generatedAt,
    dryRun,
    decisionLogPath,
    lockPath,
    decisions,
    lockKeys: lockSummary.lockKeys,
    lockScopeCounts: lockSummary.lockScopeCounts,
    queueOverlay,
    summary: { ...summary, total: decisions.length }
  };
  await fs.writeFile(path.join(outDir, 'autonomous-apply.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'autonomous-queue-overlay.json'), JSON.stringify(queueOverlay, null, 2) + '\n');
  return result;
}

export async function scoreCodexSwarmPatches(input: FrontierCodexPatchScoreInput): Promise<FrontierCodexPatchScoreResult> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  if (!input.collection && !input.run) throw new Error('score requires --collection <dir> or --run <run-dir>');
  const collectionDir = input.collection
    ? path.resolve(cwd, input.collection)
    : (await collectCodexSwarmRun({ run: String(input.run ?? ''), cwd, outDir: input.outDir })).outDir;
  const outDir = path.resolve(cwd, input.outDir ?? path.join(collectionDir, 'patch-scores'));
  const bucket = input.bucket ?? 'all';
  const roots = bucket === 'all'
    ? ['ready-to-apply', 'needs-human-port', 'failed-evidence', 'stale-against-head'].map((entry) => path.join(collectionDir, entry))
    : [path.join(collectionDir, bucket)];
  const wanted = new Set(input.jobIds ?? []);
  const mergePaths = (await Promise.all(roots.map((root) => findFilesByName(root, 'merge.json')))).flat().sort();
  const entries: FrontierCodexPatchScoreEntry[] = [];
  for (const mergePath of mergePaths.slice(0, input.limit ? Math.max(0, Math.floor(input.limit)) : undefined)) {
    const bundle = JSON.parse(await fs.readFile(mergePath, 'utf8')) as FrontierSwarmMergeBundle;
    if (wanted.size && !wanted.has(bundle.jobId)) continue;
    entries.push(await scoreCodexMergeBundle({ cwd, mergePath, bundle, outDir, input }));
  }
  const statuses: FrontierCodexPatchScoreStatus[] = ['accepted-clean', 'accepted-needs-port', 'conflict', 'test-fail', 'stale', 'evidence-only'];
  const summary = Object.fromEntries(statuses.map((status) => [status, entries.filter((entry) => entry.status === status).length])) as Record<FrontierCodexPatchScoreStatus, number>;
  const result: FrontierCodexPatchScoreResult = {
    kind: FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND,
    version: FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION,
    ok: entries.every((entry) => entry.status === 'accepted-clean' || entry.status === 'accepted-needs-port' || entry.status === 'evidence-only'),
    cwd,
    collectionDir,
    outDir,
    generatedAt,
    entries: entries.sort((left, right) => right.score - left.score || left.jobId.localeCompare(right.jobId)),
    summary: { ...summary, total: entries.length }
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'patch-score.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}

async function applyCodexMergeBundle(input: {
  cwd: string;
  bundle: FrontierSwarmMergeBundle;
  mergePath: string;
  dryRun: boolean;
  commit: boolean;
  branchPrefix?: string;
}): Promise<FrontierCodexApplyEntry> {
  const commands: FrontierCodexApplyEntry['commands'] = [];
  const patchPath = await resolveApplyPatchPath(input.bundle, input.mergePath);
  const branchName = input.branchPrefix ? `${input.branchPrefix}/${slug(input.bundle.jobId)}` : input.bundle.branchName;
  const base = {
    jobId: input.bundle.jobId,
    bundlePath: input.mergePath,
    ...(patchPath ? { patchPath } : {}),
    ...(branchName ? { branchName } : {}),
    dryRun: input.dryRun,
    commands
  };
  if (!patchPath) {
    return {
      ...base,
      status: input.bundle.disposition === 'discovery-only' ? 'skipped' : 'failed',
      error: 'missing patch'
    };
  }
  const check = await runLoggedProcess('git', ['apply', '--check', patchPath], input.cwd);
  commands.push(check);
  if (check.status !== 0) return { ...base, status: 'failed', error: 'git apply --check failed' };
  if (input.dryRun) return { ...base, status: 'checked' };
  if (branchName) {
    const branch = await runLoggedProcess('git', ['switch', '-c', branchName], input.cwd);
    commands.push(branch);
    if (branch.status !== 0) return { ...base, status: 'failed', error: 'git switch -c failed' };
  }
  const apply = await runLoggedProcess('git', ['apply', patchPath], input.cwd);
  commands.push(apply);
  if (apply.status !== 0) return { ...base, status: 'failed', error: 'git apply failed' };
  if (!input.commit) return { ...base, status: 'applied' };
  const add = await runLoggedProcess('git', ['add', '--', ...input.bundle.changedPaths], input.cwd);
  commands.push(add);
  if (add.status !== 0) return { ...base, status: 'failed', error: 'git add failed' };
  const commit = await runLoggedProcess('git', ['commit', '-m', `Apply swarm bundle ${input.bundle.jobId}`], input.cwd);
  commands.push(commit);
  if (commit.status !== 0) return { ...base, status: 'failed', error: 'git commit failed' };
  const rev = await runLoggedProcess('git', ['rev-parse', 'HEAD'], input.cwd);
  commands.push(rev);
  return {
    ...base,
    status: 'committed',
    commit: rev.stdoutTail[0]
  };
}

interface FrontierCodexAutonomousApplyLock {
  cwd: string;
  lockPath: string;
  token: string;
  acquiredAt: number;
  expiresAt: number;
  dryRun: boolean;
}

async function applyCodexMergeBundleAutonomously(input: {
  cwd: string;
  bundle: FrontierSwarmMergeBundle;
  mergePath: string;
  dryRun: boolean;
  commit: boolean;
  branchPrefix?: string;
  input: FrontierCodexAutonomousApplyInput;
  lock: FrontierCodexAutonomousApplyLock;
}): Promise<FrontierCodexAutonomousMergeDecision> {
  const startedAt = Date.now();
  const commands: FrontierCodexAutonomousMergeDecision['commands'] = [];
  const patchPath = await resolveApplyPatchPath(input.bundle, input.mergePath);
  const queueItemIds = input.bundle.queueItemIds.length ? [...input.bundle.queueItemIds] : [input.bundle.taskId ?? input.bundle.jobId];
  const lockKeys = deriveCodexAutonomousApplyLockKeys(input.bundle);
  const finish = (
    status: FrontierCodexAutonomousDecisionStatus,
    reason: string,
    extra: {
      headBefore?: string;
      headAfter?: string;
      error?: string;
    } = {}
  ): FrontierCodexAutonomousMergeDecision => ({
    kind: FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_KIND,
    version: FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_VERSION,
    id: `frontier-swarm-codex-autonomous-decision:${input.bundle.jobId}:${randomUUID()}`,
    ...(input.bundle.runId ? { runId: input.bundle.runId } : {}),
    ...(input.bundle.planId ? { planId: input.bundle.planId } : {}),
    jobId: input.bundle.jobId,
    ...(input.bundle.taskId ? { taskId: input.bundle.taskId } : {}),
    queueItemIds,
    status,
    reason,
    bundlePath: input.mergePath,
    ...(patchPath ? { patchPath } : {}),
    changedPaths: [...input.bundle.changedPaths],
    changedRegions: [...input.bundle.changedRegions],
    lockScope: lockKeys.scope,
    lockKeys: [...lockKeys.keys],
    startedAt,
    finishedAt: Date.now(),
    dryRun: input.dryRun,
    ...(extra.headBefore ? { headBefore: extra.headBefore } : {}),
    ...(extra.headAfter ? { headAfter: extra.headAfter } : {}),
    lockPath: input.lock.lockPath,
    lockToken: input.lock.token,
    commands,
    ...(extra.error ? { error: extra.error } : {})
  });

  if (input.bundle.staleAgainstHead || input.bundle.disposition === 'stale-against-head') {
    return finish('rerun', 'bundle is stale against the current repository head');
  }
  if (!input.bundle.changedPaths.length || input.bundle.disposition === 'discovery-only') {
    return finish('skipped', 'bundle has no source patch to apply');
  }
  if (!patchPath) {
    return finish('rejected', 'missing patch');
  }
  if (input.bundle.ownershipViolations.length) {
    return finish('human-blocked', `ownership violations: ${input.bundle.ownershipViolations.join(', ')}`);
  }
  if (input.bundle.disposition !== 'auto-mergeable' || !input.bundle.autoMergeable) {
    return finish('human-blocked', 'bundle is not marked auto-mergeable');
  }

  const headBefore = await readGitHead(input.cwd, commands);
  if (!headBefore) return finish('failed', 'unable to read repository head before apply');
  const check = await runLoggedProcess('git', ['apply', '--check', patchPath], input.cwd);
  commands.push(check);
  if (check.status !== 0) return finish('conflict-blocked', 'git apply --check failed', { headBefore });
  const checkedHead = await readGitHead(input.cwd, commands);
  if (checkedHead && checkedHead !== headBefore) {
    return finish('rerun', 'repository head changed while checking patch', { headBefore, headAfter: checkedHead });
  }
  if (input.dryRun) return finish('checked', 'patch checked under autonomous apply lock', { headBefore, headAfter: checkedHead ?? headBefore });

  const branchName = input.branchPrefix ? `${input.branchPrefix}/${slug(input.bundle.jobId)}` : input.bundle.branchName;
  if (branchName) {
    const branch = await runLoggedProcess('git', ['switch', '-c', branchName], input.cwd);
    commands.push(branch);
    if (branch.status !== 0) return finish('failed', 'git switch -c failed', { headBefore });
  }
  const apply = await runLoggedProcess('git', ['apply', patchPath], input.cwd);
  commands.push(apply);
  if (apply.status !== 0) return finish('failed', 'git apply failed', { headBefore });

  const gates = autonomousVerificationCommands(input.bundle, input.input);
  for (const gate of gates) {
    const gateCwd = gate.cwd ? path.resolve(input.cwd, gate.cwd) : input.cwd;
    const run = await runLoggedProcess(gate.command, gate.args, gateCwd);
    commands.push(run);
    if (run.status !== 0 && gate.required !== false) {
      const rollback = await runLoggedProcess('git', ['apply', '-R', patchPath], input.cwd);
      commands.push(rollback);
      const headAfterRollback = await readGitHead(input.cwd, commands);
      if (rollback.status !== 0) {
        return finish('failed', `verification failed and rollback failed: ${gate.name}`, {
          headBefore,
          headAfter: headAfterRollback,
          error: `required gate failed: ${gate.name}`
        });
      }
      return finish('rejected', `verification failed: ${gate.name}`, {
        headBefore,
        headAfter: headAfterRollback,
        error: `required gate failed: ${gate.name}`
      });
    }
  }

  if (!input.commit) {
    const headAfter = await readGitHead(input.cwd, commands);
    return finish('applied', gates.length ? 'patch applied and verification passed' : 'patch applied after git apply check', {
      headBefore,
      headAfter
    });
  }
  const add = await runLoggedProcess('git', ['add', '--', ...input.bundle.changedPaths], input.cwd);
  commands.push(add);
  if (add.status !== 0) {
    const rollback = await runLoggedProcess('git', ['apply', '-R', patchPath], input.cwd);
    commands.push(rollback);
    const headAfterRollback = await readGitHead(input.cwd, commands);
    return finish('failed', rollback.status === 0 ? 'git add failed; patch rolled back' : 'git add failed and rollback failed', {
      headBefore,
      headAfter: headAfterRollback,
      error: 'git add failed'
    });
  }
  const commit = await runLoggedProcess('git', ['commit', '-m', `Apply swarm bundle ${input.bundle.jobId}`], input.cwd);
  commands.push(commit);
  if (commit.status !== 0) {
    const reset = await runLoggedProcess('git', ['reset', '--', ...input.bundle.changedPaths], input.cwd);
    commands.push(reset);
    const rollback = await runLoggedProcess('git', ['apply', '-R', patchPath], input.cwd);
    commands.push(rollback);
    const headAfterRollback = await readGitHead(input.cwd, commands);
    return finish('failed', rollback.status === 0 ? 'git commit failed; patch rolled back' : 'git commit failed and rollback failed', {
      headBefore,
      headAfter: headAfterRollback,
      error: 'git commit failed'
    });
  }
  const headAfter = await readGitHead(input.cwd, commands);
  return finish('committed', gates.length ? 'patch committed and verification passed' : 'patch committed after git apply check', {
    headBefore,
    headAfter
  });
}

function autonomousVerificationCommands(bundle: FrontierSwarmMergeBundle, input: FrontierCodexAutonomousApplyInput): FrontierSwarmCommand[] {
  const focused = normalizeScoreCommands(input.focusedCommands ?? []);
  const global = bundle.changedPaths.some((file) => (input.globalGlobs ?? []).some((glob) => matchesGlob(file, glob)))
    ? normalizeScoreCommands(input.globalCommands ?? [])
    : [];
  return [...focused, ...global];
}

async function readGitHead(cwd: string, commands: FrontierCodexAutonomousMergeDecision['commands']): Promise<string | undefined> {
  const rev = await runLoggedProcess('git', ['rev-parse', 'HEAD'], cwd);
  commands.push(rev);
  if (rev.status !== 0) return undefined;
  return rev.stdoutTail[rev.stdoutTail.length - 1]?.trim();
}

async function defaultAutonomousApplyLockPath(cwd: string, outDir: string): Promise<string> {
  const result = await runProcess('git', ['rev-parse', '--git-path', 'frontier-swarm/autonomous-apply.lock'], { cwd, allowFailure: true });
  const resolved = result.stdout.trim();
  return result.status === 0 && resolved ? path.resolve(cwd, resolved) : path.join(outDir, 'autonomous-apply.lock');
}

async function acquireAutonomousApplyLock(input: {
  cwd: string;
  lockPath: string;
  timeoutMs?: number;
  staleMs?: number;
  dryRun: boolean;
}): Promise<FrontierCodexAutonomousApplyLock> {
  const timeoutMs = Math.max(0, input.timeoutMs ?? 30_000);
  const staleMs = Math.max(1_000, input.staleMs ?? 10 * 60_000);
  const deadline = Date.now() + timeoutMs;
  await fs.mkdir(path.dirname(input.lockPath), { recursive: true });
  for (;;) {
    const acquiredAt = Date.now();
    const lock: FrontierCodexAutonomousApplyLock = {
      cwd: input.cwd,
      lockPath: input.lockPath,
      token: randomUUID(),
      acquiredAt,
      expiresAt: acquiredAt + staleMs,
      dryRun: input.dryRun
    };
    try {
      const handle = await fs.open(input.lockPath, 'wx');
      try {
        await handle.writeFile(JSON.stringify({
          kind: 'frontier.swarm-codex.autonomous-apply-lock',
          version: 1,
          token: lock.token,
          pid: process.pid,
          cwd: input.cwd,
          dryRun: input.dryRun,
          acquiredAt: lock.acquiredAt,
          expiresAt: lock.expiresAt
        }, null, 2) + '\n');
      } finally {
        await handle.close();
      }
      return lock;
    } catch (error) {
      if (!isFileExistsError(error)) throw error;
      if (await autonomousApplyLockIsStale(input.lockPath, staleMs)) {
        await fs.rm(input.lockPath, { force: true }).catch(() => {});
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`timed out waiting for autonomous apply lock: ${input.lockPath}`);
      await sleep(250);
    }
  }
}

async function autonomousApplyLockIsStale(lockPath: string, staleMs: number): Promise<boolean> {
  const text = await fs.readFile(lockPath, 'utf8').catch(() => '');
  if (text) {
    try {
      const parsed = JSON.parse(text) as { expiresAt?: unknown };
      if (typeof parsed.expiresAt === 'number') return parsed.expiresAt < Date.now();
    } catch {
      return true;
    }
  }
  const stat = await fs.stat(lockPath).catch(() => undefined);
  return stat ? Date.now() - stat.mtimeMs > staleMs : true;
}

async function releaseAutonomousApplyLock(lock: FrontierCodexAutonomousApplyLock): Promise<void> {
  const text = await fs.readFile(lock.lockPath, 'utf8').catch(() => '');
  if (!text) return;
  let parsed: { token?: unknown };
  try {
    parsed = JSON.parse(text) as { token?: unknown };
  } catch {
    return;
  }
  if (parsed.token === lock.token) await fs.rm(lock.lockPath, { force: true });
}

async function appendAutonomousDecision(file: string, decision: FrontierCodexAutonomousMergeDecision): Promise<void> {
  await fs.appendFile(file, JSON.stringify(decision) + '\n');
}

function createAutonomousQueueOverlay(input: {
  decisions: readonly FrontierCodexAutonomousMergeDecision[];
  generatedAt: number;
  runId?: string;
}): FrontierSwarmQueueOverlay {
  const entries: FrontierSwarmQueueOverlay['entries'] = [];
  for (const decision of input.decisions) {
    const queueItemIds = decision.queueItemIds.length ? decision.queueItemIds : [decision.taskId ?? decision.jobId];
    for (const queueItemId of queueItemIds) {
      entries.push({
        queueItemId,
        jobId: decision.jobId,
        status: queueStatusFromAutonomousDecision(decision.status),
        mergeReadiness: decision.status === 'conflict-blocked' || decision.status === 'human-blocked' ? 'blocked' : 'verified-patch',
        disposition: dispositionFromAutonomousDecision(decision.status),
        riskLevel: decision.status === 'conflict-blocked' || decision.status === 'human-blocked' || decision.status === 'failed' ? 'high' : 'low',
        ...(decision.patchPath ? { patchPath: decision.patchPath } : {}),
        evidencePaths: [decision.bundlePath],
        changedPaths: [...decision.changedPaths],
        changedRegions: [...decision.changedRegions],
        reasons: [decision.reason],
        generatedAt: decision.finishedAt
      });
    }
  }
  const byQueueItemId = groupAutonomousQueueOverlayEntries(entries);
  const lockSummary = summarizeAutonomousDecisionLockScopes(input.decisions);
  return {
    kind: FRONTIER_SWARM_QUEUE_OVERLAY_KIND,
    version: FRONTIER_SWARM_QUEUE_OVERLAY_VERSION,
    id: `frontier-swarm-codex-autonomous-queue-overlay:${stableHash([input.runId, entries, input.generatedAt])}`,
    ...(input.runId ? { runId: input.runId } : {}),
    generatedAt: input.generatedAt,
    entries,
    byQueueItemId,
    summary: {
      entryCount: entries.length,
      queueItemCount: Object.keys(byQueueItemId).length,
      readyToApplyCount: entries.filter((entry) => entry.status === 'ready-to-apply').length,
      needsHumanPortCount: entries.filter((entry) => entry.status === 'needs-human-port').length,
      failedEvidenceCount: entries.filter((entry) => entry.status === 'failed-evidence').length,
      staleAgainstHeadCount: entries.filter((entry) => entry.status === 'stale-against-head').length,
      discoveryOnlyCount: entries.filter((entry) => entry.status === 'discovery-only').length
    },
    metadata: {
      source: FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND,
      terminalCount: entries.filter((entry) => entry.status === 'satisfied').length,
      lockKeys: lockSummary.lockKeys,
      lockScopeCounts: {
        semantic: lockSummary.lockScopeCounts.semantic,
        path: lockSummary.lockScopeCounts.path,
        repo: lockSummary.lockScopeCounts.repo
      }
    }
  };
}

function queueStatusFromAutonomousDecision(status: FrontierCodexAutonomousDecisionStatus): string {
  if (status === 'checked') return 'ready-to-apply';
  if (status === 'rerun') return 'stale-against-head';
  if (status === 'conflict-blocked' || status === 'human-blocked') return 'blocked';
  if (status === 'failed') return 'failed-evidence';
  return 'satisfied';
}

function dispositionFromAutonomousDecision(status: FrontierCodexAutonomousDecisionStatus): string {
  if (status === 'checked') return 'auto-mergeable';
  if (status === 'rerun') return 'stale-against-head';
  if (status === 'conflict-blocked' || status === 'human-blocked' || status === 'failed') return 'blocked';
  if (status === 'rejected') return 'rejected';
  return 'auto-mergeable';
}

function groupAutonomousQueueOverlayEntries(entries: readonly FrontierSwarmQueueOverlay['entries'][number][]): Record<string, FrontierSwarmQueueOverlay['entries'][number][]> {
  const out: Record<string, FrontierSwarmQueueOverlay['entries'][number][]> = {};
  for (const entry of entries) out[entry.queueItemId] = [...(out[entry.queueItemId] ?? []), entry];
  return out;
}

function readRunIdFromDecisions(decisions: readonly FrontierCodexAutonomousMergeDecision[]): string | undefined {
  const runIds = [...new Set(decisions.map((decision) => decision.runId).filter((runId): runId is string => typeof runId === 'string' && runId.length > 0))];
  return runIds.length === 1 ? runIds[0] : undefined;
}

async function scoreCodexMergeBundle(input: {
  cwd: string;
  mergePath: string;
  bundle: FrontierSwarmMergeBundle;
  outDir: string;
  input: FrontierCodexPatchScoreInput;
}): Promise<FrontierCodexPatchScoreEntry> {
  const commands: FrontierCodexPatchScoreEntry['commands'] = [];
  const patchPath = await resolveApplyPatchPath(input.bundle, input.mergePath);
  const base = {
    jobId: input.bundle.jobId,
    bundlePath: input.mergePath,
    ...(patchPath ? { patchPath } : {}),
    changedPaths: [...input.bundle.changedPaths],
    commands
  };
  if (!patchPath || input.bundle.disposition === 'discovery-only' || input.bundle.changedPaths.length === 0) {
    return { ...base, status: 'evidence-only', score: 20, reasons: ['no patch to apply'] };
  }
  if (input.bundle.staleAgainstHead || input.bundle.disposition === 'stale-against-head') {
    return { ...base, status: 'stale', score: 0, reasons: ['stale-against-head'] };
  }
  const workspacePath = await createScoreWorkspace(input.cwd, input.bundle.jobId, input.input);
  try {
    const check = await runLoggedProcess('git', ['apply', '--check', patchPath], workspacePath);
    commands.push(check);
    if (check.status !== 0) return { ...base, workspacePath, status: 'conflict', score: 0, reasons: ['git apply --check failed'] };
    const apply = await runLoggedProcess('git', ['apply', patchPath], workspacePath);
    commands.push(apply);
    if (apply.status !== 0) return { ...base, workspacePath, status: 'conflict', score: 0, reasons: ['git apply failed'] };
    const gates = scoreCommands(input.bundle, input.input);
    for (const gate of gates) {
      const run = await runLoggedProcess(gate.command, gate.args, gate.cwd ? path.resolve(workspacePath, gate.cwd) : workspacePath);
      commands.push(run);
      if (run.status !== 0 && gate.required !== false) {
        return { ...base, workspacePath, status: 'test-fail', score: 10, reasons: [`gate failed: ${gate.name}`] };
      }
    }
    const clean = input.bundle.disposition === 'auto-mergeable' && input.bundle.autoMergeable;
    return {
      ...base,
      workspacePath,
      status: clean ? 'accepted-clean' : 'accepted-needs-port',
      score: clean ? 100 : 70,
      reasons: clean ? [] : ['patch applies but bundle is not auto-mergeable']
    };
  } finally {
    if (!input.input.keepWorkspaces) await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => {});
  }
}

async function createScoreWorkspace(cwd: string, jobId: string, input: FrontierCodexPatchScoreInput): Promise<string> {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), `frontier-swarm-score-${slug(jobId)}-`));
  const excludes = uniqueWorkspacePaths([
    '.git',
    'node_modules',
    'dist',
    'coverage',
    'agent-runs',
    '.frontier-framework',
    ...(input.workspaceExcludes ?? [])
  ]);
  const includes = uniqueWorkspacePaths(input.workspaceIncludes ?? []);
  if (includes.length) {
    for (const include of includes) await copyWorkspacePath(cwd, workspacePath, include, excludes);
  } else {
    await fs.cp(cwd, workspacePath, {
      recursive: true,
      force: true,
      filter: (source) => {
        if (source === cwd) return true;
        const relative = path.relative(cwd, source).replace(/\\/g, '/');
        if (!relative) return true;
        if (pathHasIgnoredSegment(relative, excludes)) return false;
        return !excludes.some((entry) => relative === entry || relative.startsWith(entry.replace(/\/$/, '') + '/'));
      }
    });
  }
  return workspacePath;
}

function scoreCommands(bundle: FrontierSwarmMergeBundle, input: FrontierCodexPatchScoreInput): FrontierSwarmCommand[] {
  const focused = normalizeScoreCommands(input.focusedCommands ?? []);
  const global = bundle.changedPaths.some((file) => (input.globalGlobs ?? []).some((glob) => matchesGlob(file, glob)))
    ? normalizeScoreCommands(input.globalCommands ?? [])
    : [];
  return [...focused, ...global];
}

function normalizeScoreCommands(input: readonly (string | FrontierSwarmCommand)[]): FrontierSwarmCommand[] {
  return input.map((entry) => {
    if (typeof entry === 'string') return { name: entry, command: 'sh', args: ['-c', entry], required: true };
    return {
      name: entry.name,
      command: entry.command,
      args: [...entry.args],
      required: entry.required,
      ...(entry.cwd ? { cwd: entry.cwd } : {}),
      ...(entry.metadata ? { metadata: entry.metadata } : {})
    };
  }).filter((entry) => entry.command.length > 0);
}

async function resolveApplyPatchPath(bundle: FrontierSwarmMergeBundle, mergePath: string): Promise<string | undefined> {
  const sibling = path.join(path.dirname(mergePath), 'changes.patch');
  if (await pathExists(sibling)) return sibling;
  const patchPath = resolveBundlePatchPath(bundle, mergePath);
  if (patchPath && await pathExists(patchPath)) return patchPath;
  return undefined;
}

async function runLoggedProcess(command: string, args: readonly string[], cwd: string): Promise<{ command: string[]; status: number; stdoutTail: string[]; stderrTail: string[] }> {
  const result = await runProcess(command, args, { cwd, allowFailure: true });
  return {
    command: [command, ...args],
    status: result.status,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr)
  };
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(tmp, file);
}

async function gitDirty(cwd: string): Promise<string[]> {
  const result = await runProcess('git', ['status', '--porcelain', '--untracked-files=all'], { cwd, allowFailure: true });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
}

async function gitDirtyExcluding(cwd: string, excludedRoots: readonly string[]): Promise<string[]> {
  const roots = excludedRoots.map((root) => path.resolve(cwd, root));
  const dirty = await gitDirty(cwd);
  return dirty.filter((entry) => {
    const absolute = path.resolve(cwd, entry);
    return !roots.some((root) => absolute === root || absolute.startsWith(root + path.sep));
  });
}

async function copyWorkspacePath(cwd: string, workspacePath: string, include: string, excludes: readonly string[]): Promise<void> {
  const relative = normalizeWorkspacePath(include);
  if (!relative) return;
  const from = path.resolve(cwd, relative);
  const to = path.resolve(workspacePath, relative);
  if (!await pathExists(from)) return;
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, {
    recursive: true,
    force: true,
    filter: (source: string) => !isExcluded(cwd, source, excludes)
  });
}

async function linkWorkspacePath(cwd: string, workspacePath: string, include: string): Promise<void> {
  const relative = normalizeWorkspacePath(include);
  if (!relative) return;
  const from = path.resolve(cwd, relative);
  const to = path.resolve(workspacePath, relative);
  if (!await pathExists(from) || await pathExists(to)) return;
  await fs.mkdir(path.dirname(to), { recursive: true });
  const stat = await fs.lstat(from);
  await fs.symlink(from, to, stat.isDirectory() ? 'dir' : 'file').catch(() => {});
}

function shouldSnapshotWorkspaceChanges(plan: FrontierCodexWorkspacePlan, options: FrontierCodexSwarmRunOptions): boolean {
  return options.collectGitStatus !== false && (plan.mode === 'copy' || plan.mode === 'snapshot');
}

function shouldSkipGitRepoCheck(input: FrontierCodexSwarmRunOptions): boolean {
  const workspace = input.workspace;
  if (!workspace) return false;
  if (workspace.skipGitRepoCheck !== undefined) return workspace.skipGitRepoCheck;
  return workspace.mode === 'copy' || workspace.mode === 'snapshot';
}

function assertGeneratedWorkspacePath(plan: FrontierCodexWorkspacePlan): void {
  const relative = path.relative(plan.guardRoot ?? plan.root, plan.path);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative === '') {
    throw new Error(`Refusing to replace workspace outside generated root: ${plan.path}`);
  }
}

function readRawTask(job: FrontierSwarmJob): Record<string, unknown> {
  const metadata = isObject(job.task.metadata) ? job.task.metadata : {};
  return isObject(metadata.source) ? metadata.source : {};
}

function normalizeWorkspacePath(value: string): string | undefined {
  const clean = value.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!clean || clean.includes('\0') || clean.includes('*') || path.isAbsolute(clean)) return undefined;
  const normalized = path.normalize(clean).replace(/\\/g, '/');
  if (normalized === '.' || normalized.startsWith('..') || path.isAbsolute(normalized)) return undefined;
  return normalized;
}

function uniqueWorkspacePaths(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeWorkspacePath(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

async function gitChangedPaths(cwd: string): Promise<string[]> {
  const result = await runProcess('git', ['status', '--porcelain'], { cwd, allowFailure: true });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const value = line.slice(3);
    return value.includes(' -> ') ? value.split(' -> ') : [value];
  });
}

async function collectChangedPaths(cwd: string, baseline: WorkspaceFileSnapshot | undefined, plan: FrontierCodexWorkspacePlan): Promise<ChangedPathCollection> {
  if (!baseline) return filterWorkspaceChangedPaths(await gitChangedPaths(cwd), plan);
  const after = await snapshotWorkspaceFiles(cwd);
  return filterWorkspaceChangedPaths(diffWorkspaceFiles(baseline, after), plan);
}

async function writeCodexPatchFile(input: {
  workspace: string;
  sourceRoot: string;
  paths: FrontierCodexJobPaths;
  workspacePlan: FrontierCodexWorkspacePlan;
  changedPaths: readonly string[];
}): Promise<string | undefined> {
  await fs.mkdir(path.dirname(input.paths.patchPath), { recursive: true });
  const changedPaths = uniqueWorkspacePaths(input.changedPaths);
  if (changedPaths.length === 0) {
    await fs.writeFile(input.paths.patchPath, '');
    return undefined;
  }
  const diff = input.workspacePlan.mode === 'current' || input.workspacePlan.mode === 'git-worktree'
    ? await gitDiffPatch(input.workspace, changedPaths)
    : await noIndexWorkspacePatch(input.sourceRoot, input.workspace, changedPaths);
  await fs.writeFile(input.paths.patchPath, diff);
  return diff.trim().length ? input.paths.patchPath : undefined;
}

async function gitDiffPatch(workspace: string, changedPaths: readonly string[]): Promise<string> {
  const result = await runProcess('git', ['diff', '--', ...changedPaths], { cwd: workspace, allowFailure: true });
  return result.stdout;
}

async function noIndexWorkspacePatch(sourceRoot: string, workspace: string, changedPaths: readonly string[]): Promise<string> {
  const chunks: string[] = [];
  for (const file of changedPaths) {
    const source = path.join(sourceRoot, file);
    const target = path.join(workspace, file);
    const sourceExists = await pathExists(source);
    const targetExists = await pathExists(target);
    if (!sourceExists && !targetExists) continue;
    const left = sourceExists ? source : '/dev/null';
    const right = targetExists ? target : '/dev/null';
    const result = await runProcess('git', ['diff', '--no-index', '--', left, right], { cwd: sourceRoot, allowFailure: true });
    if (result.stdout.trim()) chunks.push(normalizeNoIndexWorkspacePatch(result.stdout, file, sourceExists, targetExists));
  }
  return chunks.join('\n');
}

function normalizeNoIndexWorkspacePatch(diff: string, file: string, sourceExists: boolean, targetExists: boolean): string {
  const normalized = file.replace(/\\/g, '/');
  return diff.split(/\r?\n/).map((line) => {
    if (line.startsWith('diff --git ')) return `diff --git a/${normalized} b/${normalized}`;
    if (line.startsWith('--- ')) return sourceExists ? `--- a/${normalized}` : '--- /dev/null';
    if (line.startsWith('+++ ')) return targetExists ? `+++ b/${normalized}` : '+++ /dev/null';
    return line;
  }).join('\n');
}

function filterWorkspaceChangedPaths(paths: readonly string[], plan: FrontierCodexWorkspacePlan): ChangedPathCollection {
  const changedPaths: string[] = [];
  const ignoredChangedPaths: string[] = [];
  for (const file of uniqueWorkspacePaths(paths)) {
    if (isIgnoredWorkspaceChangedPath(file, plan)) ignoredChangedPaths.push(file);
    else changedPaths.push(file);
  }
  return { changedPaths, ignoredChangedPaths };
}

function isIgnoredWorkspaceChangedPath(file: string, plan: FrontierCodexWorkspacePlan): boolean {
  if (plan.mode !== 'copy' && plan.mode !== 'snapshot') return false;
  if (pathHasIgnoredSegment(file, ['node_modules', 'dist', 'coverage', '.frontier-framework', 'agent-runs'])) return true;
  const ignored = [
    ...plan.excludes,
    ...plan.artifactIncludes,
    ...plan.linkPaths,
    ...(plan.linkNodeModules ? ['node_modules'] : []),
    'agent-runs',
    '.frontier-framework',
    'dist',
    'coverage'
  ];
  return ignored.some((entry) => file === entry || file.startsWith(entry.replace(/\/$/, '') + '/'));
}

function pathHasIgnoredSegment(file: string, segments: readonly string[]): boolean {
  const parts = file.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.some((part) => segments.includes(part));
}

async function snapshotWorkspaceFiles(root: string): Promise<WorkspaceFileSnapshot> {
  const snapshot: WorkspaceFileSnapshot = new Map();
  await walkWorkspaceFiles(root, root, snapshot);
  return snapshot;
}

async function walkWorkspaceFiles(root: string, current: string, snapshot: WorkspaceFileSnapshot): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(current);
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = path.join(current, entry);
    const relative = path.relative(root, absolute).replace(/\\/g, '/');
    const stat = await fs.lstat(absolute).catch(() => undefined);
    if (!stat) continue;
    if (stat.isSymbolicLink()) {
      const target = await fs.readlink(absolute).catch(() => '');
      snapshot.set(relative, `link:${target}`);
      continue;
    }
    if (stat.isDirectory()) {
      await walkWorkspaceFiles(root, absolute, snapshot);
      continue;
    }
    if (stat.isFile()) snapshot.set(relative, `${stat.size}:${stat.mtimeMs}`);
  }
}

function diffWorkspaceFiles(before: WorkspaceFileSnapshot, after: WorkspaceFileSnapshot): string[] {
  const changed = new Set<string>();
  for (const [file, marker] of after) {
    if (before.get(file) !== marker) changed.add(file);
  }
  for (const file of before.keys()) {
    if (!after.has(file)) changed.add(file);
  }
  return Array.from(changed).sort();
}

async function runVerification(commands: readonly FrontierSwarmCommand[], cwd: string): Promise<Array<{ name: string; command: string[]; status: number; durationMs: number; stdoutTail: string[]; stderrTail: string[]; required: boolean }>> {
  const results = [];
  for (const command of commands) {
    const startedAt = Date.now();
    const run = await runProcess(command.command, command.args, { cwd, allowFailure: true });
    results.push({
      name: command.name,
      command: [command.command, ...command.args],
      status: run.status,
      durationMs: Date.now() - startedAt,
      stdoutTail: tail(run.stdout),
      stderrTail: tail(run.stderr),
      required: command.required
    });
    if (run.status !== 0 && command.required) break;
  }
  return results;
}

async function runScheduledJobPool(
  plan: FrontierSwarmPlan,
  concurrency: number,
  worker: (job: FrontierSwarmJob, lease: FrontierSwarmLease) => Promise<FrontierSwarmJobResultInput>
): Promise<FrontierSwarmJobResultInput[]> {
  const results: FrontierSwarmJobResultInput[] = [];
  const active = new Map<string, Promise<FrontierSwarmJobResultInput>>();
  const leases: FrontierSwarmLease[] = [];
  const completed = new Set<string>();
  const resultByJob = new Map<string, FrontierSwarmJobResultInput>();
  while (resultByJob.size < plan.jobs.length) {
    const run = createSwarmRun({ plan, status: 'running', results });
    run.jobs = run.jobs.map((job) => active.has(job.id) ? { ...job, status: 'running' } : job);
    const schedule = createSwarmSchedule({
      plan,
      run,
      maxReadyJobs: Math.max(0, concurrency - active.size)
    });
    const nextLeases = createSwarmLeases({
      schedule,
      workerId: 'frontier-swarm-codex',
      count: Math.max(0, concurrency - active.size),
      existingLeases: leases
    });
    for (const lease of nextLeases) {
      const job = plan.jobs.find((entry) => entry.id === lease.jobId);
      if (!job || active.has(job.id) || completed.has(job.id)) continue;
      leases.push(lease);
      active.set(job.id, worker(job, lease));
    }
    if (active.size === 0) {
      for (const blocked of schedule.blocked) {
        if (resultByJob.has(blocked.jobId)) continue;
        const result: FrontierSwarmJobResultInput = {
          jobId: blocked.jobId,
          status: 'blocked',
          startedAt: Date.now(),
          finishedAt: Date.now(),
          error: blocked.reasons.join(', '),
          metadata: { waitingFor: blocked.waitingFor, reasons: blocked.reasons }
        };
        results.push(result);
        resultByJob.set(result.jobId, result);
      }
      break;
    }
    const settled = await Promise.race(Array.from(active.entries()).map(async ([jobId, promise]) => ({ jobId, result: await promise })));
    active.delete(settled.jobId);
    completed.add(settled.jobId);
    results.push(settled.result);
    resultByJob.set(settled.jobId, settled.result);
  }
  return plan.jobs.map((job) => resultByJob.get(job.id)).filter((result): result is FrontierSwarmJobResultInput => !!result);
}

async function runJobPool(
  jobs: readonly FrontierSwarmJob[],
  concurrency: number,
  worker: (job: FrontierSwarmJob) => Promise<FrontierSwarmJobResultInput>
): Promise<FrontierSwarmJobResultInput[]> {
  const results: FrontierSwarmJobResultInput[] = [];
  const pending = jobs.map((job, index) => ({ job, index }));
  const activeKeys = new Set<string>();
  let active = 0;
  await new Promise<void>((resolve) => {
    const schedule = () => {
      if (pending.length === 0 && active === 0) resolve();
      while (active < concurrency && pending.length > 0) {
        const nextIndex = pending.findIndex((entry) => !activeKeys.has(entry.job.concurrencyKey));
        if (nextIndex < 0) return;
        const [next] = pending.splice(nextIndex, 1);
        const concurrencyKey = next.job.concurrencyKey;
        active += 1;
        activeKeys.add(concurrencyKey);
        worker(next.job).then((result) => {
          results[next.index] = result;
        }).catch((error) => {
          results[next.index] = { jobId: next.job.id, status: 'failed', error };
        }).finally(() => {
          active -= 1;
          activeKeys.delete(concurrencyKey);
          schedule();
        });
      }
    };
    schedule();
  });
  return results;
}

function readCompute(value: unknown) {
  if (Array.isArray(value) && value.length > 0) return value as FrontierSwarmManifestInput['compute'];
  return [{
    id: 'codex.deep',
    kind: 'codex',
    model: FRONTIER_SWARM_CODEX_DEFAULT_MODEL,
    reasoningEffort: FRONTIER_SWARM_CODEX_DEFAULT_REASONING_EFFORT
  }];
}

function formatCommand(command: FrontierSwarmCommand): string {
  return [command.command, ...command.args].join(' ') + (command.required ? '' : ' (optional)');
}

function bullets(values: readonly string[]): string[] {
  return values.length ? values.map((value) => `- ${value}`) : ['- none'];
}

function formatBudget(job: FrontierSwarmJob): string[] {
  if (!job.budget) return ['none'];
  return [
    job.budget.maxCostUsd === undefined ? undefined : `maxCostUsd=${job.budget.maxCostUsd}`,
    job.budget.maxInputTokens === undefined ? undefined : `maxInputTokens=${job.budget.maxInputTokens}`,
    job.budget.maxOutputTokens === undefined ? undefined : `maxOutputTokens=${job.budget.maxOutputTokens}`,
    job.budget.maxDurationMs === undefined ? undefined : `maxDurationMs=${job.budget.maxDurationMs}`,
    `maxRetries=${job.budget.maxRetries}`
  ].filter((value): value is string => !!value);
}

function formatResourceAllocation(allocation: FrontierCodexResourceAllocation): string[] {
  const entries = [
    allocation.capabilities.length ? `capabilities=${allocation.capabilities.join(',')}` : undefined,
    Object.keys(allocation.resources).length ? `resources=${JSON.stringify(allocation.resources)}` : undefined,
    allocation.browser ? `browser.required=${allocation.browser.required}` : undefined,
    allocation.browser?.port ? `browser.port=${allocation.browser.port}` : undefined,
    allocation.browser?.profileDir ? `browser.profileDir=${allocation.browser.profileDir}` : undefined,
    allocation.browser?.headless === undefined ? undefined : `browser.headless=${allocation.browser.headless}`,
    Object.keys(allocation.env).length ? `env=${Object.keys(allocation.env).sort().join(',')}` : undefined
  ].filter((value): value is string => !!value);
  return entries.length ? entries : ['none'];
}

function resourceSlot(job: FrontierSwarmJob, lease: FrontierSwarmLease | undefined, count: number): number {
  if (count <= 1) return 0;
  const seed = lease ? lease.fencingToken - 1 : Number.parseInt(stableHash(job.id).slice(0, 8), 16);
  return Math.abs(seed) % count;
}

function resolveBrowserProfileDir(job: FrontierSwarmJob, profileDir: string | undefined, profileDirPrefix: string | undefined, cwd: string): string | undefined {
  const raw = profileDir ?? (profileDirPrefix ? path.join(profileDirPrefix, safePathSegment(job.id)) : undefined);
  if (!raw) return undefined;
  return path.isAbsolute(raw) ? raw : path.resolve(cwd, raw);
}

function safePathSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'job';
}

type SemanticImportSelectedPath = { path: string; language: string };
type SemanticImportSelection = {
  selected: SemanticImportSelectedPath[];
  eligibleCount: number;
  omittedCount: number;
  maxFiles: number;
};

type FrontierLangSemanticImportApi = {
  ok: true;
  importNativeSource(input: Record<string, unknown>): any;
  createSemanticMergeCandidateFromImport(input: Record<string, unknown>): any;
  hashUniversalAstEnvelope?(input: unknown): string;
} | {
  ok: false;
  error: string;
};

function normalizeSemanticImportOptions(input: boolean | FrontierCodexSemanticImportOptions | undefined): Required<Pick<FrontierCodexSemanticImportOptions, 'maxFiles' | 'maxBytes'>> & FrontierCodexSemanticImportOptions | undefined {
  if (input === false || input === undefined) return undefined;
  const options = input === true ? {} : input;
  if (options.enabled === false) return undefined;
  return {
    ...options,
    enabled: true,
    maxFiles: Math.max(0, Math.floor(options.maxFiles ?? 24)),
    maxBytes: Math.max(0, Math.floor(options.maxBytes ?? 512 * 1024))
  };
}

function selectSemanticImportPaths(
  changedPaths: readonly string[],
  options: Required<Pick<FrontierCodexSemanticImportOptions, 'maxFiles' | 'maxBytes'>> & FrontierCodexSemanticImportOptions
): SemanticImportSelection {
  const eligible: SemanticImportSelectedPath[] = [];
  for (const file of uniqueWorkspacePaths(changedPaths)) {
    if (pathHasIgnoredSegment(file, ['node_modules', 'dist', 'coverage', 'agent-runs', '.frontier-framework'])) continue;
    if (options.include?.length && !options.include.some((glob) => matchesGlob(file, glob))) continue;
    if (options.exclude?.some((glob) => matchesGlob(file, glob))) continue;
    const language = inferSemanticImportLanguage(file, options.languages);
    if (!language) continue;
    eligible.push({ path: file, language });
  }
  const maxFiles = Math.max(0, options.maxFiles);
  return {
    selected: eligible.slice(0, maxFiles),
    eligibleCount: eligible.length,
    omittedCount: Math.max(0, eligible.length - maxFiles),
    maxFiles
  };
}

function inferSemanticImportLanguage(file: string, overrides?: Readonly<Record<string, string>>): string | undefined {
  const ext = path.extname(file).toLowerCase();
  return overrides?.[file] ?? overrides?.[ext] ?? ({
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.rs': 'rust',
    '.py': 'python',
    '.c': 'c',
    '.h': 'c',
    '.cc': 'cpp',
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.hh': 'cpp',
    '.go': 'go',
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.swift': 'swift',
    '.cs': 'csharp',
    '.wasm': 'wasm',
    '.wat': 'wasm',
    '.php': 'php',
    '.rb': 'ruby',
    '.rake': 'ruby'
  } as Record<string, string | undefined>)[ext];
}

async function loadFrontierLangForSemanticImport(): Promise<FrontierLangSemanticImportApi> {
  try {
    const packageName = '@shapeshift-labs/frontier-lang';
    const api = await import(packageName) as any;
    if (typeof api.importNativeSource !== 'function' || typeof api.createSemanticMergeCandidateFromImport !== 'function') {
      return { ok: false, error: 'frontier-lang missing importNativeSource/createSemanticMergeCandidateFromImport exports' };
    }
    return {
      ok: true,
      importNativeSource: api.importNativeSource,
      createSemanticMergeCandidateFromImport: api.createSemanticMergeCandidateFromImport,
      ...(typeof api.hashUniversalAstEnvelope === 'function' ? { hashUniversalAstEnvelope: api.hashUniversalAstEnvelope } : {})
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function createSemanticImportSidecar(
  job: FrontierSwarmJob,
  records: FrontierCodexSemanticImportRecord[],
  selection?: SemanticImportSelection
): FrontierCodexSemanticImportSidecar {
  const semanticIndex = records.reduce((totals, record) => {
    totals.documents += record.semanticIndex?.documents ?? 0;
    totals.symbols += record.semanticIndex?.symbols ?? 0;
    totals.occurrences += record.semanticIndex?.occurrences ?? 0;
    totals.relations += record.semanticIndex?.relations ?? 0;
    totals.facts += record.semanticIndex?.facts ?? 0;
    return totals;
  }, { documents: 0, symbols: 0, occurrences: 0, relations: 0, facts: 0 });
  const lossesBySeverity: Record<string, number> = {};
  const readiness: Record<string, number> = {};
  for (const record of records) {
    for (const loss of Array.isArray(record.losses) ? record.losses as any[] : []) {
      const severity = String(loss?.severity ?? 'unknown');
      lossesBySeverity[severity] = (lossesBySeverity[severity] ?? 0) + 1;
    }
    const candidate = record.mergeCandidate as { readiness?: unknown } | undefined;
    if (candidate?.readiness !== undefined) {
      const key = String(candidate.readiness);
      readiness[key] = (readiness[key] ?? 0) + 1;
    }
  }
  return {
    kind: FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND,
    version: FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_VERSION,
    generatedAt: Date.now(),
    jobId: job.id,
    taskId: job.taskId,
    records,
    summary: {
      total: records.length,
      selected: selection?.selected.length ?? records.length,
      eligible: selection?.eligibleCount ?? records.length,
      omitted: selection?.omittedCount ?? 0,
      maxFiles: selection?.maxFiles ?? records.length,
      imported: records.filter((record) => record.status === 'imported').length,
      skipped: records.filter((record) => record.status === 'skipped').length,
      errors: records.filter((record) => record.status === 'error').length,
      sourceMapCount: records.reduce((sum, record) => sum + (record.sourceMapCount ?? 0), 0),
      sourceMapMappingCount: records.reduce((sum, record) => sum + (record.sourceMapMappingCount ?? 0), 0),
      lossCount: records.reduce((sum, record) => sum + (record.lossCount ?? 0), 0),
      lossesBySeverity,
      semanticIndex,
      readiness
    }
  };
}

function summarizeSemanticIndex(value: any): FrontierCodexSemanticImportRecord['semanticIndex'] {
  if (!value || typeof value !== 'object') return undefined;
  return {
    documents: Array.isArray(value.documents) ? value.documents.length : 0,
    symbols: Array.isArray(value.symbols) ? value.symbols.length : 0,
    occurrences: Array.isArray(value.occurrences) ? value.occurrences.length : 0,
    relations: Array.isArray(value.relations) ? value.relations.length : 0,
    facts: Array.isArray(value.facts) ? value.facts.length : 0
  };
}

function summarizeSemanticLosses(value: any): unknown {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.slice(0, 12).map((loss) => ({
    id: loss?.id,
    severity: loss?.severity,
    phase: loss?.phase,
    kind: loss?.kind,
    message: loss?.message,
    nodeId: loss?.nodeId,
    span: loss?.span
  }));
}

function summarizeSemanticMergeCandidate(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    readiness: value.readiness,
    touchedSymbols: Array.isArray(value.touchedSymbols) ? value.touchedSymbols.slice(0, 50) : [],
    touchedSemanticNodes: Array.isArray(value.touchedSemanticNodes) ? value.touchedSemanticNodes.slice(0, 50) : [],
    nativeSpans: Array.isArray(value.nativeSpans) ? value.nativeSpans.slice(0, 50) : [],
    conflictKeys: Array.isArray(value.conflictKeys) ? value.conflictKeys.slice(0, 100) : [],
    reasons: Array.isArray(value.reasons) ? value.reasons.slice(0, 50) : []
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function arrayOfObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) as Record<string, unknown>[] : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'EEXIST';
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolvePidManifestPath(runPath: string): Promise<string> {
  const absolute = path.resolve(runPath);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (stat?.isDirectory()) return path.join(absolute, 'pids.json');
  if (path.basename(absolute) === 'swarm-results.json') return path.join(path.dirname(absolute), 'pids.json');
  return absolute;
}

async function resolveRunDirectory(runPath: string): Promise<string> {
  const absolute = path.resolve(runPath);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (stat?.isDirectory()) return absolute;
  if (path.basename(absolute) === 'swarm-results.json' || path.basename(absolute) === 'pids.json') return path.dirname(absolute);
  return path.dirname(absolute);
}

async function findFilesByName(root: string, name: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'collected'
          || entry.name === 'auto-drain'
          || entry.name === 'apply-ledger'
          || entry.name === 'patch-scores'
          || entry.name === 'node_modules'
          || entry.name === '.git') continue;
        await walk(absolute);
      } else if (entry.isFile() && entry.name === name) {
        out.push(absolute);
      }
    }
  }
  await walk(root);
  return out;
}

async function bundlePatchIsStale(bundle: FrontierSwarmMergeBundle, mergePath: string, cwd: string): Promise<boolean> {
  const patchPath = resolveBundlePatchPath(bundle, mergePath);
  if (!patchPath || !await pathExists(patchPath)) return false;
  const patch = await fs.readFile(patchPath, 'utf8').catch(() => '');
  if (!patch.trim()) return false;
  const result = await runProcess('git', ['apply', '--check', patchPath], { cwd, allowFailure: true });
  return result.status !== 0;
}

function resolveBundlePatchPath(bundle: FrontierSwarmMergeBundle, mergePath: string): string | undefined {
  if (!bundle.patchPath) return undefined;
  return path.isAbsolute(bundle.patchPath) ? bundle.patchPath : path.resolve(path.dirname(mergePath), bundle.patchPath);
}

function normalizeCollectedMergeBundle(value: unknown, mergePath: string): FrontierSwarmMergeBundle {
  const input = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const jobId = typeof input.jobId === 'string' && input.jobId ? input.jobId : path.basename(path.dirname(mergePath));
  const changedPaths = stringArray(input.changedPaths);
  const status = typeof input.status === 'string' ? input.status as FrontierSwarmMergeBundle['status'] : 'completed';
  const autoMergeable = Boolean(input.autoMergeable);
  const disposition = typeof input.disposition === 'string'
    ? input.disposition as FrontierSwarmMergeBundle['disposition']
    : autoMergeable ? 'auto-mergeable' : status === 'failed' ? 'rejected' : 'needs-port';
  return {
    kind: typeof input.kind === 'string' ? input.kind as FrontierSwarmMergeBundle['kind'] : FRONTIER_SWARM_MERGE_BUNDLE_KIND,
    version: typeof input.version === 'number' ? input.version as FrontierSwarmMergeBundle['version'] : FRONTIER_SWARM_MERGE_BUNDLE_VERSION,
    id: typeof input.id === 'string' && input.id ? input.id : `swarm-merge-bundle:${jobId}`,
    ...(typeof input.runId === 'string' ? { runId: input.runId } : {}),
    ...(typeof input.planId === 'string' ? { planId: input.planId } : {}),
    jobId,
    ...(typeof input.taskId === 'string' ? { taskId: input.taskId } : {}),
    ...(typeof input.lane === 'string' ? { lane: input.lane } : {}),
    ...(typeof input.title === 'string' ? { title: input.title } : {}),
    generatedAt: typeof input.generatedAt === 'number' ? input.generatedAt : Date.now(),
    status,
    mergeReadiness: typeof input.mergeReadiness === 'string'
      ? input.mergeReadiness as FrontierSwarmMergeBundle['mergeReadiness']
      : changedPaths.length ? 'patch-candidate' : 'discovery-only',
    disposition,
    riskLevel: typeof input.riskLevel === 'string' ? input.riskLevel as FrontierSwarmMergeBundle['riskLevel'] : 'unknown',
    autoMergeable,
    changedPaths,
    changedRegions: stringArray(input.changedRegions),
    ownedFilesTouched: stringArray(input.ownedFilesTouched),
    allowedWrites: stringArray(input.allowedWrites),
    ownershipViolations: stringArray(input.ownershipViolations),
    ...(typeof input.patchPath === 'string' ? { patchPath: input.patchPath } : {}),
    ...(typeof input.patchHash === 'string' ? { patchHash: input.patchHash } : {}),
    evidencePaths: stringArray(input.evidencePaths),
    commandsPassed: Array.isArray(input.commandsPassed) ? input.commandsPassed as FrontierSwarmMergeBundle['commandsPassed'] : [],
    commandsFailed: Array.isArray(input.commandsFailed) ? input.commandsFailed as FrontierSwarmMergeBundle['commandsFailed'] : [],
    queueItemIds: stringArray(input.queueItemIds),
    ...(typeof input.branchName === 'string' ? { branchName: input.branchName } : {}),
    ...(typeof input.commit === 'string' ? { commit: input.commit } : {}),
    staleAgainstHead: Boolean(input.staleAgainstHead),
    reasons: stringArray(input.reasons)
  };
}

function mergeRecordScore(record: { mergePath: string; bundle: FrontierSwarmMergeBundle }): number {
  return (record.mergePath.includes('/evidence/') ? 100 : 0)
    + record.bundle.changedPaths.length
    + record.bundle.evidencePaths.length
    + record.bundle.commandsPassed.length
    + record.bundle.commandsFailed.length;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function classifyCodexHandoffArtifact(file: string): FrontierCodexHandoffArtifactKind | undefined {
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  const name = path.basename(normalized);
  if (name === 'last-message.md' || name === 'last.md') return 'last-message';
  if (name.endsWith('.patch') || name.endsWith('.diff')) return 'patch';
  if (normalized.includes('debug-handoff') || normalized.includes('/debug/') || name.includes('handoff')) return 'debug-handoff';
  if (name.includes('replay')) return 'replay';
  if (name.includes('watchpoint')) return 'watchpoint';
  if (name.includes('trace') || normalized.endsWith('.trace.jsonl')) return 'trace';
  if (name.includes('diagnostic') || name.includes('health') || name.includes('probe')) return 'diagnostic';
  if (name.endsWith('.log') || name.includes('codex-events') || name.includes('events.jsonl')) return 'log';
  if (name === 'evidence.json' || name === 'merge.json' || name === 'resource-allocation.json' || name === 'workspace-proof.json') return 'evidence';
  return undefined;
}

function classifyCodexCollectBucket(bundle: FrontierSwarmMergeBundle, staleAgainstHead: boolean): FrontierCodexCollectBucket {
  if (staleAgainstHead || bundle.staleAgainstHead || bundle.disposition === 'stale-against-head') return 'stale-against-head';
  if (bundle.disposition === 'rejected' || bundle.disposition === 'blocked' || bundle.commandsFailed.length > 0 || bundle.status === 'failed') {
    return 'failed-evidence';
  }
  if (bundle.disposition === 'auto-mergeable' && bundle.autoMergeable) return 'ready-to-apply';
  return 'needs-human-port';
}

async function readOptionalText(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}

function isExcluded(cwd: string, source: string, excludes: readonly string[]): boolean {
  const relative = path.relative(cwd, source).replace(/\\/g, '/');
  return excludes.some((exclude) => relative === exclude.replace(/\/$/, '') || relative.startsWith(exclude.replace(/\/$/, '') + '/'));
}

async function runProcess(command: string, args: readonly string[], options: { cwd: string; allowFailure?: boolean }): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('close', (status: number | null) => {
      const result = { status: status ?? 1, stdout, stderr };
      if (!options.allowFailure && result.status !== 0) reject(new Error(stderr || stdout || `${command} failed`));
      else resolve(result);
    });
    child.on('error', (error: Error) => {
      if (options.allowFailure) resolve({ status: 1, stdout, stderr: String(error) });
      else reject(error);
    });
  });
}

function tail(text: string, maxLines = 24): string[] {
  return text.trim().split(/\r?\n/).filter(Boolean).slice(-maxLines);
}

function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 'fnv1a32:' + (hash >>> 0).toString(16).padStart(8, '0');
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const object = value as Record<string, unknown>;
  return '{' + Object.keys(object).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(object[key])).join(',') + '}';
}
