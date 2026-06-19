import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createWriteStream, type WriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';
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
  createSwarmCoordinatorAgentDrainWork,
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
  type FrontierSwarmCoordinatorAgentDrainWork,
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
export const FRONTIER_SWARM_CODEX_MODEL_PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';
export const FRONTIER_SWARM_CODEX_MODEL_PRICING_SOURCE_CHECKED_AT = '2026-06-18';
export const FRONTIER_SWARM_CODEX_MODEL_PRICING_UNIT_TOKENS = 1_000_000;
export const FRONTIER_SWARM_CODEX_SUPPORTED_MODELS = [
  'gpt-5.5',
  'gpt-5.4-mini',
  'o4-mini',
  'gpt-4.1-mini'
] as const;
export const FRONTIER_SWARM_CODEX_ADAPTIVE_MODEL_LADDER = [
  'gpt-4.1-mini',
  'o4-mini',
  'gpt-5.4-mini',
  'gpt-5.5'
] as const;
const FRONTIER_SWARM_CODEX_FALLBACK_PACKAGE_GATE_ORDER = [
  'frontier-swarm',
  'frontier-swarm-codex'
] as const;
export const FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_KIND = 'frontier.swarm-codex.workspace-manifest';
export const FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_VERSION = 1;
export const FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_KIND = 'frontier.swarm-codex.workspace-proof';
export const FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_VERSION = 1;
export const FRONTIER_SWARM_CODEX_PID_MANIFEST_KIND = 'frontier.swarm-codex.pid-manifest';
export const FRONTIER_SWARM_CODEX_PID_MANIFEST_VERSION = 1;
export const FRONTIER_SWARM_CODEX_COLLECTION_KIND = 'frontier.swarm-codex.collection';
export const FRONTIER_SWARM_CODEX_COLLECTION_VERSION = 1;
const FRONTIER_SWARM_CODEX_METADATA_KEY = 'frontierSwarmCodex';
export const FRONTIER_SWARM_CODEX_APPLY_LEDGER_KIND = 'frontier.swarm-codex.apply-ledger';
export const FRONTIER_SWARM_CODEX_APPLY_LEDGER_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND = 'frontier.swarm-codex.autonomous-apply';
export const FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_KIND = 'frontier.swarm-codex.autonomous-merge-decision';
export const FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY_KIND = 'frontier.swarm-codex.autonomous-decision-collapse-policy';
export const FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND = 'frontier.swarm-codex.auto-drain';
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_GROUPING_KIND = 'frontier.swarm-codex.auto-drain-grouping';
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_GROUPING_VERSION = 1;
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND = 'frontier.swarm-codex.auto-drain-artifacts';
export const FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_VERSION = 1;
export const FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND = 'frontier.swarm-codex.rerun-manifest';
export const FRONTIER_SWARM_CODEX_RERUN_MANIFEST_VERSION = 1;
export const FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_KIND = 'frontier.swarm-codex.continuous-refill';
export const FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_VERSION = 1;
export const FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_TASK_SET_KIND = 'frontier.swarm-codex.continuous-refill.task-set';
export const FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_TASK_SET_VERSION = 1;
export const FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND = 'frontier.swarm-codex.coordinator-agent-drain';
export const FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_VERSION = 1;
export const FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND = 'frontier.swarm-codex.patch-score';
export const FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION = 1;
export const FRONTIER_SWARM_CODEX_MODEL_ROUTING_FEEDBACK_KIND = 'frontier.swarm-codex.model-routing-feedback';
export const FRONTIER_SWARM_CODEX_MODEL_ROUTING_FEEDBACK_VERSION = 1;
export const FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND = 'frontier.swarm-codex.semantic-imports';
export const FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_KIND = 'frontier.swarm-codex.dashboard-queue-metadata';
export const FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_HEALTH_KIND = 'frontier.swarm-codex.dashboard-queue-health';
export const FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_HEALTH_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_MERGE_QUEUE_HEALTH_KIND = 'frontier.swarm-codex.dashboard-merge-queue-health';
export const FRONTIER_SWARM_CODEX_DASHBOARD_MERGE_QUEUE_HEALTH_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_KIND = 'frontier.swarm-codex.dashboard-human-questions';
export const FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_ANSWERS_KIND = 'frontier.swarm-codex.dashboard-human-answers';
export const FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_ANSWERS_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_OPERATOR_QUEUE_KIND = 'frontier.swarm-codex.dashboard-operator-queue';
export const FRONTIER_SWARM_CODEX_DASHBOARD_OPERATOR_QUEUE_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_COST_SUMMARY_KIND = 'frontier.swarm-codex.dashboard-cost-summary';
export const FRONTIER_SWARM_CODEX_DASHBOARD_COST_SUMMARY_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DASHBOARD_AUTONOMOUS_QUEUE_HEALTH_KIND = 'frontier.swarm-codex.dashboard-autonomous-queue-health';
export const FRONTIER_SWARM_CODEX_DASHBOARD_AUTONOMOUS_QUEUE_HEALTH_VERSION = 1;
export const FRONTIER_SWARM_CODEX_HUMAN_ANSWER_ROUTING_KIND = 'frontier.swarm-codex.human-answer-routing';
export const FRONTIER_SWARM_CODEX_HUMAN_ANSWER_ROUTING_VERSION = 1;
const DASHBOARD_EXPLICIT_HUMAN_QUESTION_REASON_PREFIX = 'human-question:';
const DASHBOARD_HUMAN_QUESTION_REQUIRED_FIELDS = [
  'owner',
  'surface',
  'missing-authority',
  'question',
  'answer-code'
] as const;
const DASHBOARD_HUMAN_QUESTION_MISSING_AUTHORITY_VALUES = new Set(['policy', 'fact', 'approval']);
const DEFAULT_HUMAN_ACTION_ANSWER_LOG_FILENAMES = [
  'human-action-answers.jsonl',
  'human-answers.jsonl',
  'operator-answers.jsonl'
];
const CODEX_WORKER_HUMAN_QUESTION_CONTRACT = [
  'Ask a human only when repo context, tests, task JSON, ownership rules, and coordinator policy cannot decide the issue.',
  'Do not ask humans for stale patches, failed applies, routine review, queue classification, or answerable implementation details; produce a patch, rerun/reject/record evidence, or name the concrete follow-up instead.',
  'Before asking, exhaust local source refs, verification output, allowed write globs, and existing docs; if a reasonable implementation choice exists, make it and document the assumption.',
  'If still blocked, emit exactly one structured line in the final response and last-message.md: `human-question: owner=<role>; surface=<package/path>; missing-authority=<policy/fact/approval>; question=<single answerable question>; answer-code=<approve|reject|choose:<option-id>|provide:<fact-id>>`.',
  'The answer-code must describe the allowed human answer shape so the coordinator can unblock the queue with a short stable code.'
];

export type FrontierCodexModelPolicy = 'config-default' | 'plan' | 'explicit' | 'adaptive';
export type FrontierCodexModelRoutingRecommendation = 'lower' | 'same' | 'higher';
export type FrontierCodexModelRoutingFeedbackInput = unknown;
export type FrontierCodexCostEstimateReason =
  | 'missing-input-tokens'
  | 'missing-model'
  | 'missing-output-tokens'
  | 'missing-token-breakdown'
  | 'missing-token-usage'
  | 'unknown-model-pricing';

export type FrontierCodexHumanQuestionMissingAuthority = 'policy' | 'fact' | 'approval';

export interface FrontierCodexHumanQuestionContractFields {
  raw: string;
  owner: string;
  surface: string;
  missingAuthority: FrontierCodexHumanQuestionMissingAuthority;
  question: string;
  answerCode: string;
}

export interface FrontierCodexModelPricing {
  model: string;
  currency: 'USD';
  unitTokens: number;
  inputUsdPerUnit: number;
  cachedInputUsdPerUnit: number;
  outputUsdPerUnit: number;
  source: string;
  sourceCheckedAt: string;
}

export interface FrontierCodexModelRoutingFeedbackSignal {
  source: string;
  recommendation: FrontierCodexModelRoutingRecommendation;
  confidence: number;
  reason: string;
  model?: string;
  baselineModel?: string;
  winnerModel?: string;
  loserModel?: string;
  score?: number;
}

export interface FrontierCodexModelRoutingFeedbackSummary {
  kind: typeof FRONTIER_SWARM_CODEX_MODEL_ROUTING_FEEDBACK_KIND;
  version: typeof FRONTIER_SWARM_CODEX_MODEL_ROUTING_FEEDBACK_VERSION;
  recommendation: FrontierCodexModelRoutingRecommendation;
  confidence: number;
  score: number;
  signals: FrontierCodexModelRoutingFeedbackSignal[];
  reasons: string[];
  summary: {
    signalCount: number;
    sourceCount: number;
    lowerCount: number;
    sameCount: number;
    higherCount: number;
  };
}

export interface FrontierCodexModelRoutingDecision {
  policy: FrontierCodexModelPolicy;
  forwarded: boolean;
  baseModel?: string;
  selectedModel?: string;
  recommendation: FrontierCodexModelRoutingRecommendation;
  confidence: number;
  routingScore: number;
  reasons: string[];
  hardCaps: {
    minModel?: string;
    maxModel?: string;
    applied: string[];
  };
  pricing?: FrontierCodexModelPricing;
  feedback?: FrontierCodexModelRoutingFeedbackSummary;
}

// Standard direct OpenAI API rates, verified against the official pricing page on 2026-06-18.
// The catalog is intentionally exact-model only so unknown or renamed models do not look free.
export const FRONTIER_SWARM_CODEX_MODEL_PRICING: Readonly<Record<string, FrontierCodexModelPricing>> = {
  'gpt-5.5': codexModelPricing('gpt-5.5', 5, 0.5, 30),
  'gpt-5.4': codexModelPricing('gpt-5.4', 2.5, 0.25, 15),
  'gpt-5.4-mini': codexModelPricing('gpt-5.4-mini', 0.75, 0.075, 4.5),
  'gpt-5.4-nano': codexModelPricing('gpt-5.4-nano', 0.2, 0.02, 1.25),
  'gpt-5.3-codex': codexModelPricing('gpt-5.3-codex', 1.75, 0.175, 14)
};

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
const GENERATED_PATCH_REJECT_LEFTOVER_SUFFIXES = ['.orig', '.rej'];
const DEFAULT_SEMANTIC_IMPORT_MAX_FILES = 24;
const DEFAULT_SEMANTIC_IMPORT_MAX_BYTES = 512 * 1024;
const SEMANTIC_IMPORT_MAX_STRING_CHARS = 2048;
const SEMANTIC_IMPORT_MAX_OBJECT_KEYS = 24;
const SEMANTIC_IMPORT_MAX_ARRAY_ITEMS = 50;
const CODEX_EVENT_METRICS_MAX_LINE_CHARS = 1024 * 1024;
const CODEX_COMPLETED_TURN_SETTLE_MS = 15_000;
const CODEX_COMPLETED_TURN_SETTLE_POLL_MS = 250;
const CODEX_COMPLETED_TURN_KILL_GRACE_MS = 2_000;
const AUTONOMOUS_APPLY_REPO_LOCK_KEY = 'repo:*';
const SUPPORTED_CODEX_MODEL_BY_NORMALIZED = new Map(
  FRONTIER_SWARM_CODEX_SUPPORTED_MODELS.map((model) => [model.toLowerCase(), model])
);
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
  modelRoutingFeedback?: FrontierCodexModelRoutingFeedbackInput;
  modelRoutingFeedbackPaths?: readonly string[];
  adaptiveModelMin?: string;
  adaptiveModelMax?: string;
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
  promotePatchCandidates?: boolean;
  checkStale?: boolean;
  focusedCommands?: readonly (string | FrontierSwarmCommand)[];
  globalCommands?: readonly (string | FrontierSwarmCommand)[];
  globalGlobs?: readonly string[];
  decisionLogPath?: string;
  humanAnswerLogPath?: string;
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
    maxBytes: number;
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

export interface FrontierCodexRunMetricsInput {
  model?: string | null;
  inputTokens?: number;
  cachedInputTokens?: number;
  uncachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  usage?: unknown;
  metadata?: unknown;
}

export interface FrontierCodexRunMetrics {
  model?: string;
  inputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  hasTokenUsage: boolean;
  inputTokensKnown: boolean;
  cachedInputTokensKnown: boolean;
  uncachedInputTokensKnown: boolean;
  outputTokensKnown: boolean;
  totalTokensKnown: boolean;
  tokenBreakdownComplete: boolean;
  missingTokenFields: string[];
}

export interface FrontierCodexRunCostEstimate {
  estimated: boolean;
  reason?: FrontierCodexCostEstimateReason;
  model?: string;
  pricingModel?: string;
  currency: 'USD';
  unitTokens: number;
  source: string;
  sourceCheckedAt: string;
  inputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputCostUsd?: number;
  cachedInputCostUsd?: number;
  uncachedInputCostUsd?: number;
  outputCostUsd?: number;
  estimatedCostUsd?: number;
  pricing?: FrontierCodexModelPricing;
}

export type FrontierCodexDashboardCostEstimateStatus = 'estimated' | 'partial' | 'unknown-pricing' | 'unestimated';

export interface FrontierCodexResourceAllocation {
  capabilities: string[];
  resources: Record<string, number>;
  env: Record<string, string>;
  model?: string;
  modelPricing?: FrontierCodexModelPricing;
  modelPricingUnknownReason?: FrontierCodexCostEstimateReason;
  modelRouting?: FrontierCodexModelRoutingDecision;
  browser?: FrontierCodexBrowserAllocation;
}

const FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET = 'coordinator-review';
const FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_BUCKET = 'needs-human-port';
const FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_REASON = 'coordinator-review-required';
const FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_REASON = 'needs-human-port';

export type FrontierCodexCollectBucket =
  | 'ready-to-apply'
  | 'coordinator-review'
  | 'failed-evidence'
  | 'stale-against-head';

export type FrontierCodexLegacyCollectBucket = 'needs-human-port';

export interface FrontierCodexCollectInput {
  run: string;
  outDir?: string;
  cwd?: string;
  checkStale?: boolean;
  branchPrefix?: string;
  promotePatchCandidates?: boolean;
  promotionFocusedCommands?: readonly (string | FrontierSwarmCommand)[];
  promotionGlobalCommands?: readonly (string | FrontierSwarmCommand)[];
  promotionGlobalGlobs?: readonly string[];
}

export interface FrontierCodexCollectedBundle {
  bucket: FrontierCodexCollectBucket;
  jobId: string;
  mergePath: string;
  patchOnly?: boolean;
  patchPath?: string;
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
    coordinatorReviewCount: number;
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
    promotedPatchCandidateCount: number;
    patchOnlyCount: number;
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
    promotedPatchCandidateCount?: number;
    patchOnlyCount?: number;
  };
  artifacts?: FrontierCodexCollectArtifacts;
}

interface CodexCollectMergeRecord {
  mergePath: string;
  bundle: FrontierSwarmMergeBundle;
  patchOnly?: boolean;
  patchPath?: string;
}

export type FrontierCodexApplyStatus = 'checked' | 'applied' | 'committed' | 'skipped' | 'failed';

export interface FrontierCodexApplyInput {
  collection?: string;
  run?: string;
  outDir?: string;
  cwd?: string;
  bucket?: FrontierCodexCollectBucket | FrontierCodexLegacyCollectBucket | 'all';
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

export type FrontierCodexAutonomousDecisionDashboardCategory =
  | 'ready-to-apply'
  | 'satisfied'
  | 'rejected'
  | 'rerun-work'
  | 'automation-blocker'
  | 'human-needed';

export type FrontierCodexAutonomousDecisionHumanNeedPolicy = 'never' | 'explicit-question-only';

export interface FrontierCodexAutonomousDecisionCollapsePolicyEntry {
  status: FrontierCodexAutonomousDecisionStatus;
  ledgerTerminal: boolean;
  autoDrainTerminal: boolean;
  queueResolved: boolean;
  createsRerunWork: boolean;
  blocksAutoDrain: boolean;
  dashboardCategory: FrontierCodexAutonomousDecisionDashboardCategory;
  explicitHumanQuestionDashboardCategory?: FrontierCodexAutonomousDecisionDashboardCategory;
  humanNeed: FrontierCodexAutonomousDecisionHumanNeedPolicy;
  queueStatus: string;
  mergeReadiness: string;
  disposition: string;
  riskLevel: FrontierSwarmRiskLevel;
}

export interface FrontierCodexAutonomousDecisionCollapsePolicy {
  kind: typeof FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY_KIND;
  version: typeof FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY_VERSION;
  latestDecisionWinsByQueueSubject: boolean;
  explicitHumanQuestionsOnly: boolean;
  statuses: Record<FrontierCodexAutonomousDecisionStatus, FrontierCodexAutonomousDecisionCollapsePolicyEntry>;
}

export interface FrontierCodexAutonomousDecisionCollapse extends Omit<FrontierCodexAutonomousDecisionCollapsePolicyEntry, 'dashboardCategory' | 'explicitHumanQuestionDashboardCategory'> {
  dashboardCategory: FrontierCodexAutonomousDecisionDashboardCategory;
  explicitHumanQuestion: boolean;
  humanNeeded: boolean;
}

const AUTONOMOUS_DECISION_COLLAPSE_STATUS_ORDER: FrontierCodexAutonomousDecisionStatus[] = [
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

const AUTONOMOUS_DECISION_COLLAPSE_POLICY_BY_STATUS: Record<
  FrontierCodexAutonomousDecisionStatus,
  Omit<FrontierCodexAutonomousDecisionCollapsePolicyEntry, 'status'>
> = {
  checked: {
    ledgerTerminal: true,
    autoDrainTerminal: true,
    queueResolved: false,
    createsRerunWork: false,
    blocksAutoDrain: false,
    dashboardCategory: 'ready-to-apply',
    humanNeed: 'never',
    queueStatus: 'ready-to-apply',
    mergeReadiness: 'verified-patch',
    disposition: 'auto-mergeable',
    riskLevel: 'low'
  },
  applied: {
    ledgerTerminal: true,
    autoDrainTerminal: true,
    queueResolved: true,
    createsRerunWork: false,
    blocksAutoDrain: false,
    dashboardCategory: 'satisfied',
    humanNeed: 'never',
    queueStatus: 'satisfied',
    mergeReadiness: 'verified-patch',
    disposition: 'auto-mergeable',
    riskLevel: 'low'
  },
  committed: {
    ledgerTerminal: true,
    autoDrainTerminal: true,
    queueResolved: true,
    createsRerunWork: false,
    blocksAutoDrain: false,
    dashboardCategory: 'satisfied',
    humanNeed: 'never',
    queueStatus: 'satisfied',
    mergeReadiness: 'verified-patch',
    disposition: 'auto-mergeable',
    riskLevel: 'low'
  },
  rejected: {
    ledgerTerminal: true,
    autoDrainTerminal: true,
    queueResolved: true,
    createsRerunWork: false,
    blocksAutoDrain: false,
    dashboardCategory: 'rejected',
    humanNeed: 'never',
    queueStatus: 'satisfied',
    mergeReadiness: 'verified-patch',
    disposition: 'rejected',
    riskLevel: 'low'
  },
  rerun: {
    ledgerTerminal: true,
    autoDrainTerminal: true,
    queueResolved: false,
    createsRerunWork: true,
    blocksAutoDrain: false,
    dashboardCategory: 'rerun-work',
    humanNeed: 'never',
    queueStatus: 'stale-against-head',
    mergeReadiness: 'stale-against-head',
    disposition: 'stale-against-head',
    riskLevel: 'low'
  },
  'conflict-blocked': {
    ledgerTerminal: true,
    autoDrainTerminal: true,
    queueResolved: false,
    createsRerunWork: true,
    blocksAutoDrain: false,
    dashboardCategory: 'rerun-work',
    humanNeed: 'never',
    queueStatus: 'stale-against-head',
    mergeReadiness: 'stale-against-head',
    disposition: 'stale-against-head',
    riskLevel: 'high'
  },
  'human-blocked': {
    ledgerTerminal: true,
    autoDrainTerminal: false,
    queueResolved: false,
    createsRerunWork: false,
    blocksAutoDrain: true,
    dashboardCategory: 'automation-blocker',
    explicitHumanQuestionDashboardCategory: 'human-needed',
    humanNeed: 'explicit-question-only',
    queueStatus: 'blocked',
    mergeReadiness: 'blocked',
    disposition: 'blocked',
    riskLevel: 'high'
  },
  skipped: {
    ledgerTerminal: true,
    autoDrainTerminal: true,
    queueResolved: true,
    createsRerunWork: false,
    blocksAutoDrain: false,
    dashboardCategory: 'satisfied',
    humanNeed: 'never',
    queueStatus: 'satisfied',
    mergeReadiness: 'verified-patch',
    disposition: 'auto-mergeable',
    riskLevel: 'low'
  },
  failed: {
    ledgerTerminal: true,
    autoDrainTerminal: false,
    queueResolved: false,
    createsRerunWork: false,
    blocksAutoDrain: false,
    dashboardCategory: 'automation-blocker',
    humanNeed: 'never',
    queueStatus: 'failed-evidence',
    mergeReadiness: 'rejected',
    disposition: 'blocked',
    riskLevel: 'high'
  }
};

export const FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY: FrontierCodexAutonomousDecisionCollapsePolicy = {
  kind: FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY_KIND,
  version: FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY_VERSION,
  latestDecisionWinsByQueueSubject: true,
  explicitHumanQuestionsOnly: true,
  statuses: Object.fromEntries(AUTONOMOUS_DECISION_COLLAPSE_STATUS_ORDER.map((status) => [
    status,
    { status, ...AUTONOMOUS_DECISION_COLLAPSE_POLICY_BY_STATUS[status] }
  ])) as Record<FrontierCodexAutonomousDecisionStatus, FrontierCodexAutonomousDecisionCollapsePolicyEntry>
};

export function classifyCodexAutonomousDecisionCollapse(
  input: FrontierCodexAutonomousDecisionStatus | { status: FrontierCodexAutonomousDecisionStatus; reason?: string }
): FrontierCodexAutonomousDecisionCollapse {
  const status = typeof input === 'string' ? input : input.status;
  const reason = typeof input === 'string' ? undefined : input.reason;
  const policy = FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY.statuses[status];
  const {
    dashboardCategory: defaultDashboardCategory,
    explicitHumanQuestionDashboardCategory,
    ...rest
  } = policy;
  const explicitHumanQuestion = status === 'human-blocked'
    && typeof reason === 'string'
    && dashboardTextIsExplicitHumanQuestion(reason);
  const humanNeeded = policy.humanNeed === 'explicit-question-only' && explicitHumanQuestion;
  return {
    ...rest,
    dashboardCategory: humanNeeded && explicitHumanQuestionDashboardCategory
      ? explicitHumanQuestionDashboardCategory
      : defaultDashboardCategory,
    explicitHumanQuestion,
    humanNeeded
  };
}

export type FrontierCodexAutonomousLockScope = 'semantic' | 'path' | 'repo';

export interface FrontierCodexAutonomousApplyLockKeys {
  scope: FrontierCodexAutonomousLockScope;
  keys: string[];
}

export type FrontierCodexAutonomousApplyLockRecoveryReason =
  | 'expired'
  | 'owner-pid-gone'
  | 'mtime-expired';

export interface FrontierCodexAutonomousApplyLockRecovery {
  lockPath: string;
  recoveredAt: number;
  reason: FrontierCodexAutonomousApplyLockRecoveryReason;
  staleMs: number;
  previous: {
    token?: string;
    pid?: number;
    cwd?: string;
    dryRun?: boolean;
    acquiredAt?: number;
    expiresAt?: number;
    mtimeMs?: number;
    ageMs?: number;
    parseError?: string;
  };
  ownerProbe?: {
    pid: number;
    status: 'gone' | 'alive' | 'unknown';
    code?: string;
  };
}

export interface FrontierCodexAutonomousLockScopeCounts {
  semantic: number;
  path: number;
  repo: number;
}

export interface FrontierCodexAutonomousDecisionLeaseReadback {
  source: 'autonomous-apply';
  decisionId: string;
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  queueKeys: string[];
  status: FrontierCodexAutonomousDecisionStatus;
  reason: string;
  terminal: boolean;
  dryRun: boolean;
  applyScope: {
    bundlePath: string;
    patchPath?: string;
    changedPaths: string[];
    changedRegions: string[];
  };
  lease: {
    scope: FrontierCodexAutonomousLockScope;
    keys: string[];
    lockPath?: string;
    token?: string;
  };
  head: {
    collectionHead?: string;
    leaseHead?: string;
    headBefore?: string;
    headAfter?: string;
    currentHead?: string;
    commit?: string;
    movedSinceCollection: boolean;
    movedDuringDecision: boolean;
  };
  rollbackEvidence?: FrontierCodexAutonomousRollbackEvidence;
  supersedesDecisionIds?: string[];
  supersededByDecisionId?: string;
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
  promotePatchCandidates?: boolean;
  focusedCommands?: readonly (string | FrontierSwarmCommand)[];
  globalCommands?: readonly (string | FrontierSwarmCommand)[];
  globalGlobs?: readonly string[];
  decisionLogPath?: string;
  lockPath?: string;
  lockTimeoutMs?: number;
  lockStaleMs?: number;
}

export interface FrontierCodexAutonomousDecisionVerification {
  planned: number;
  run: number;
  required: number;
  passed: number;
  failed: number;
  skipped: number;
  skippedRequired: number;
  names: string[];
  passedNames: string[];
  failedNames: string[];
  skippedNames: string[];
  skippedRequiredNames: string[];
}

export type FrontierCodexAutonomousFinalGateStatus = 'passed' | 'failed' | 'skipped';
export type FrontierCodexAutonomousFinalGateState = 'not-configured' | 'passed' | 'failed' | 'skipped-required' | 'continuation';

export interface FrontierCodexAutonomousFinalGateEntry {
  index: number;
  name: string;
  command: string[];
  required: boolean;
  status: FrontierCodexAutonomousFinalGateStatus;
  exitCode?: number;
}

export interface FrontierCodexAutonomousDecisionFinalGateSummary {
  ok: boolean;
  state: FrontierCodexAutonomousFinalGateState;
  planned: number;
  run: number;
  required: number;
  passed: number;
  failed: number;
  failedRequired: number;
  skipped: number;
  skippedRequired: number;
  names: string[];
  passedNames: string[];
  failedNames: string[];
  failedRequiredGateNames: string[];
  skippedNames: string[];
  skippedRequiredGateNames: string[];
  gates: FrontierCodexAutonomousFinalGateEntry[];
}

export interface FrontierCodexAutonomousRollbackEvidence {
  attempted: boolean;
  ok: boolean;
  patchPath?: string;
  changedPaths: string[];
  reverseApplyStatus?: number;
  cleanupCommands: Array<{ command: string[]; status: number }>;
  dirtyPaths: string[];
  cleanChangedPaths: boolean;
  headAfter?: string;
}

export interface FrontierCodexAutonomousFinalGateDecisionSummary {
  decisionId: string;
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  status: FrontierCodexAutonomousDecisionStatus;
  reason: string;
  continuation: boolean;
  ok: boolean;
  state: FrontierCodexAutonomousFinalGateState;
  planned: number;
  run: number;
  required: number;
  passed: number;
  failed: number;
  failedRequired: number;
  skipped: number;
  skippedRequired: number;
  failedRequiredGateNames: string[];
  skippedRequiredGateNames: string[];
}

export interface FrontierCodexAutonomousFinalGateRunEntry extends FrontierCodexAutonomousFinalGateEntry {
  decisionId: string;
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  decisionStatus: FrontierCodexAutonomousDecisionStatus;
  continuation: boolean;
}

export interface FrontierCodexAutonomousFinalGateRunSummary {
  ok: boolean;
  state: FrontierCodexAutonomousFinalGateState;
  decisionCount: number;
  evaluatedDecisionCount: number;
  continuationDecisionCount: number;
  gatedDecisionCount: number;
  passedDecisionCount: number;
  failedDecisionCount: number;
  skippedRequiredDecisionCount: number;
  continuationGateCount: number;
  continuationRequiredGateCount: number;
  continuationSkippedRequiredGateCount: number;
  plannedGateCount: number;
  runGateCount: number;
  requiredGateCount: number;
  passedGateCount: number;
  failedGateCount: number;
  failedRequiredGateCount: number;
  skippedGateCount: number;
  skippedRequiredGateCount: number;
  failedDecisionIds: string[];
  skippedRequiredDecisionIds: string[];
  continuationDecisionIds: string[];
  continuationGateNames: string[];
  failedRequiredGateNames: string[];
  skippedRequiredGateNames: string[];
  decisions: FrontierCodexAutonomousFinalGateDecisionSummary[];
  gates: FrontierCodexAutonomousFinalGateRunEntry[];
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
  commit?: string;
  lockPath?: string;
  lockToken?: string;
  lockRecoveries?: FrontierCodexAutonomousApplyLockRecovery[];
  verification: FrontierCodexAutonomousDecisionVerification;
  finalGateSummary: FrontierCodexAutonomousDecisionFinalGateSummary;
  rollbackEvidence?: FrontierCodexAutonomousRollbackEvidence;
  commands: Array<{ command: string[]; status: number; stdoutTail: string[]; stderrTail: string[] }>;
  leaseReadback: FrontierCodexAutonomousDecisionLeaseReadback;
  error?: string;
}

export interface FrontierCodexHumanActionAnswer {
  id?: string;
  sourcePath: string;
  line: number;
  consumed: boolean;
  questionIds: string[];
  questionCodes: string[];
  decisionIds: string[];
  jobIds: string[];
  taskIds: string[];
  queueItemIds: string[];
  routes: string[];
  evidencePaths: string[];
  answer?: string;
}

export interface FrontierCodexHumanAnswerRoutedDecision {
  decisionId: string;
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  questionIds: string[];
  questionCodes: string[];
  questionContract?: FrontierCodexHumanQuestionContractFields;
  reason: string;
  answerIds: string[];
  answerRoutes: string[];
  answerTexts: string[];
  answerEvidencePaths: string[];
}

export interface FrontierCodexHumanQuestionContinuation {
  id: string;
  source: 'merge-queue';
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  questionIds: string[];
  questionCodes: string[];
  questionContract?: FrontierCodexHumanQuestionContractFields;
  reason: string;
  bundlePath?: string;
  patchPath?: string;
  changedPaths: string[];
  changedRegions: string[];
  allowedWrites: string[];
  evidencePaths: string[];
  queueActions: FrontierSwarmMergeQueueAssignmentAction[];
}

export interface FrontierCodexHumanAnswerRoutedContinuation {
  continuationId: string;
  source: FrontierCodexHumanQuestionContinuation['source'];
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  questionIds: string[];
  questionCodes: string[];
  questionContract?: FrontierCodexHumanQuestionContractFields;
  reason: string;
  bundlePath?: string;
  patchPath?: string;
  answerIds: string[];
  answerRoutes: string[];
  answerTexts: string[];
  answerEvidencePaths: string[];
}

export interface FrontierCodexHumanAnswerRoutingSummary {
  kind: typeof FRONTIER_SWARM_CODEX_HUMAN_ANSWER_ROUTING_KIND;
  version: typeof FRONTIER_SWARM_CODEX_HUMAN_ANSWER_ROUTING_VERSION;
  source: 'human-action-answers.jsonl';
  available: boolean;
  paths: string[];
  routingPath?: string;
  count: number;
  consumedCount: number;
  routedDecisionCount: number;
  routedContinuationCount: number;
  ignoredCount: number;
  parseErrorCount: number;
  answeredQuestionIds: string[];
  answeredQuestionCodes: string[];
  routedDecisionIds: string[];
  routedContinuationIds: string[];
  routedJobIds: string[];
  routedTaskIds: string[];
  routedQueueItemIds: string[];
  evidencePaths: string[];
  answers: FrontierCodexHumanActionAnswer[];
  routedDecisions: FrontierCodexHumanAnswerRoutedDecision[];
  routedContinuations: FrontierCodexHumanAnswerRoutedContinuation[];
  parseErrors: Array<{ path: string; line: number; error: string }>;
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
  decisionReadbacks: FrontierCodexAutonomousDecisionLeaseReadback[];
  lockRecoveries: FrontierCodexAutonomousApplyLockRecovery[];
  lockKeys: string[];
  lockScopeCounts: FrontierCodexAutonomousLockScopeCounts;
  queueOverlay: FrontierSwarmQueueOverlay;
  rerunManifest?: FrontierCodexAutoDrainRerunManifest;
  finalGateSummary: FrontierCodexAutonomousFinalGateRunSummary;
  summary: Record<FrontierCodexAutonomousDecisionStatus, number> & {
    total: number;
    gatedDecisionCount: number;
    verificationGateCount: number;
    requiredVerificationGateCount: number;
    finalGateOk: boolean;
    finalGateState: FrontierCodexAutonomousFinalGateState;
    failedRequiredGateCount: number;
    skippedRequiredGateCount: number;
    finalGateContinuationDecisionCount: number;
    finalGateContinuationSkippedRequiredGateCount: number;
    rerunManifestCount: number;
    rerunTaskCount: number;
    rerunManifestTerminalState: FrontierCodexAutoDrainRerunManifestTerminalState;
    lockRecoveryCount: number;
  };
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
  workArtifactId?: string;
  workArtifactPath?: string;
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
  bucket?: FrontierCodexCollectBucket;
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
  drainWorkJobIds: string[];
  queueDebtJobIds: string[];
  groups: FrontierCodexSwarmAutoDrainGroup[];
  jobs: FrontierCodexSwarmAutoDrainGroupingJob[];
  conflicts: FrontierCodexSwarmAutoDrainGroupingConflict[];
  summary: {
    readyCount: number;
    admittedCount: number;
    deferredCount: number;
    queueDebtCount: number;
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
  bucket?: FrontierCodexCollectBucket | FrontierCodexLegacyCollectBucket | 'all';
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
  status?: 'running' | 'finished';
  runId?: string;
  jobId?: string;
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
  signal?: string;
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
  completedTurnSettleMs?: number;
  completedTurnSettlePollMs?: number;
  completedTurnKillGraceMs?: number;
}

export interface FrontierCodexExecutorResult {
  exitCode: number;
  signal?: string;
  changedPaths?: readonly string[];
  lastMessage?: string;
  metrics?: FrontierCodexRunMetricsInput;
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
  coordinatorAgentDrainWorkPath: string;
  coordinatorAgentDrainWork: FrontierSwarmCoordinatorAgentDrainWork;
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
  coordinatorAgentDrainWorkPath?: string;
  postApplyCollectionPath?: string;
  groupingPath?: string;
  applyPath?: string;
  autonomousQueueOverlayPath?: string;
  decisionLogPath?: string;
  patchPaths: string[];
  readyJobCount: number;
  groupedBundleCount: number;
  readyToApplyCount: number;
  coordinatorReviewCount: number;
  failedEvidenceCount: number;
  staleAgainstHeadCount: number;
  decisionCount: number;
  committedDecisionCount: number;
  gatedDecisionCount: number;
  verificationGateCount: number;
  requiredVerificationGateCount: number;
  finalGateSummary: FrontierCodexAutonomousFinalGateRunSummary;
  finalGateOk: boolean;
  finalGateState: FrontierCodexAutonomousFinalGateState;
  failedRequiredGateCount: number;
  skippedRequiredGateCount: number;
  finalGateContinuationDecisionCount: number;
  finalGateContinuationSkippedRequiredGateCount: number;
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
  promotedPatchCandidateCount: number;
}

export interface FrontierCodexAutoDrainArtifactPathGroup {
  paths: string[];
  count: number;
}

export type FrontierCodexAutoDrainRerunSourceKind =
  | 'stale-against-head'
  | 'queue-rerun'
  | 'decision-rerun'
  | 'conflict-blocked';

export interface FrontierCodexAutoDrainRerunTaskMetadata {
  source: typeof FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND;
  sourceAutoDrainPath: string;
  sourceCollectionPaths: string[];
  sourceMergeQueuePaths: string[];
  sourceDecisionLogPaths: string[];
  originalJobId: string;
  originalTaskId?: string;
  queueItemIds: string[];
  lane?: string;
  layer?: string;
  compute?: string;
  priority?: number;
  concurrencyKey?: string;
  sourceKinds: FrontierCodexAutoDrainRerunSourceKind[];
  reasons: string[];
  currentHead?: string;
  sourceHead?: string;
  sourceHeads: string[];
  sourcePatchPaths: string[];
  sourceBundlePaths: string[];
  evidencePaths: string[];
  targetRefs: string[];
  changedRegions: string[];
  verification: NonNullable<FrontierSwarmTaskInput['verification']>;
  queueActions: FrontierSwarmMergeQueueAssignmentAction[];
  decisionStatuses: FrontierCodexAutonomousDecisionStatus[];
  conflictHeadBefore: string[];
  conflictHeadAfter: string[];
  conflictingJobIds: string[];
  scopeIds: string[];
  leaseKeys: string[];
  sourceTask?: FrontierCodexAutoDrainRerunSourceTaskMetadata;
  generatedAt: number;
}

export interface FrontierCodexAutoDrainRerunSourceTaskMetadata {
  id?: string;
  title?: string;
  lane?: string;
  layer?: string;
  compute?: string;
  priority?: number;
  concurrencyKey?: string;
  sourceRefs: string[];
  targetRefs: string[];
  allowedWrites: string[];
  ownershipRegions: NonNullable<FrontierSwarmTaskInput['ownershipRegions']>;
  ownedRegions: string[];
  changedRegions: string[];
  acceptance: string[];
  verification: NonNullable<FrontierSwarmTaskInput['verification']>;
}

export interface FrontierCodexAutoDrainRerunTask extends FrontierSwarmTaskInput {
  id: string;
  title: string;
  objective: string;
  status: 'todo';
  lane?: string;
  layer?: string;
  compute?: string;
  concurrencyKey?: string;
  priority?: number;
  sourceRefs: string[];
  targetRefs: string[];
  allowedWrites: string[];
  ownershipRegions: NonNullable<FrontierSwarmTaskInput['ownershipRegions']>;
  ownedRegions: string[];
  changedRegions: string[];
  acceptance: string[];
  verification: NonNullable<FrontierSwarmTaskInput['verification']>;
  tags: string[];
  metadata: {
    source: typeof FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND;
    rerun: FrontierCodexAutoDrainRerunTaskMetadata;
  };
}

export type FrontierCodexAutoDrainRerunManifestTerminalState = 'missing' | 'drained' | 'rerun-required';

export interface FrontierCodexAutoDrainRerunManifest {
  kind: typeof FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND;
  version: typeof FRONTIER_SWARM_CODEX_RERUN_MANIFEST_VERSION;
  id: string;
  runId?: string;
  path: string;
  outDir: string;
  sourceAutoDrainPath: string;
  generatedAt: number;
  currentHead?: string;
  sourceHead?: string;
  sourceHeads: string[];
  items: FrontierCodexAutoDrainRerunTask[];
  tasks: FrontierCodexAutoDrainRerunTask[];
  sourcePatchPaths: string[];
  targetRefs: string[];
  taskIds: string[];
  jobIds: string[];
  summary: {
    taskCount: number;
    terminalState: FrontierCodexAutoDrainRerunManifestTerminalState;
    conflictBlockedCount: number;
    decisionRerunCount: number;
    staleAgainstHeadCount: number;
    queueRerunCount: number;
    sourceHeadCount: number;
    sourcePatchCount: number;
    targetRefCount: number;
  };
}

export type FrontierCodexContinuousRefillState = 'next-task-set' | 'drained' | 'capacity-full';
export type FrontierCodexContinuousRefillTaskSource = 'rerun-manifest' | 'backlog';

export interface FrontierCodexContinuousRefillWorkerInput {
  id?: string;
  jobId?: string;
  taskId?: string;
  status?: string;
  role?: string;
  finishedAt?: number;
}

export interface FrontierCodexContinuousRefillInput {
  desiredConcurrency: number;
  activeWorkerCount?: number;
  activeWorkers?: unknown;
  queuedTaskCount?: number;
  queuedTasks?: unknown;
  rerunManifest?: unknown;
  rerunManifests?: readonly unknown[];
  backlog?: unknown;
  maxTasks?: number;
  excludeTaskIds?: readonly string[];
  generatedAt?: number;
}

export interface FrontierCodexContinuousRefillTaskRecord {
  taskId: string;
  source: FrontierCodexContinuousRefillTaskSource;
  index: number;
}

export interface FrontierCodexContinuousRefillTaskSet {
  kind: typeof FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_TASK_SET_KIND;
  version: typeof FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_TASK_SET_VERSION;
  id: string;
  generatedAt: number;
  source: 'continuous-refill';
  items: FrontierSwarmTaskInput[];
  tasks: FrontierSwarmTaskInput[];
  taskIds: string[];
  summary: {
    taskCount: number;
    rerunTaskCount: number;
    backlogTaskCount: number;
  };
}

export interface FrontierCodexContinuousRefillResult {
  kind: typeof FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_KIND;
  version: typeof FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_VERSION;
  id: string;
  generatedAt: number;
  state: FrontierCodexContinuousRefillState;
  drained: boolean;
  desiredConcurrency: number;
  activeWorkerCount: number;
  queuedTaskCount: number;
  openConcurrency: number;
  availableTaskCount: number;
  selectedTaskCount: number;
  selectedTaskIds: string[];
  selectedTasks: FrontierCodexContinuousRefillTaskRecord[];
  excludedTaskIds: string[];
  rerunManifestTerminalStates: FrontierCodexAutoDrainRerunManifestTerminalState[];
  taskSet?: FrontierCodexContinuousRefillTaskSet;
  reason: string;
  summary: {
    desiredConcurrency: number;
    activeWorkerCount: number;
    queuedTaskCount: number;
    openConcurrency: number;
    rerunManifestCount: number;
    rerunTaskCount: number;
    backlogTaskCount: number;
    backlogTodoCount: number;
    availableTaskCount: number;
    selectedTaskCount: number;
    drained: boolean;
  };
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
    coordinatorReviewCount: number;
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
  coordinatorAgentDrainWork: FrontierCodexAutoDrainArtifactPathGroup & {
    leaseCount: number;
    assignmentCount: number;
    terminalCount: number;
    nonTerminalCount: number;
    promotedWorkCount: number;
    appliedCount: number;
    queuedCount: number;
    escalatedCount: number;
    rerunCount: number;
    rejectedCount: number;
    recordedCount: number;
    blockedCount: number;
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
    promotedPatchCandidateCount: number;
  };
  rerunManifest: FrontierCodexAutoDrainArtifactPathGroup & {
    taskCount: number;
    terminalState: FrontierCodexAutoDrainRerunManifestTerminalState;
    conflictBlockedCount: number;
    decisionRerunCount: number;
    staleAgainstHeadCount: number;
    queueRerunCount: number;
    sourceHeadCount: number;
    sourcePatchCount: number;
    targetRefCount: number;
    currentHead?: string;
    sourceHead?: string;
  };
  iterations: FrontierCodexAutoDrainArtifactIteration[];
  finalGateSummary: FrontierCodexAutonomousFinalGateRunSummary;
  summary: {
    pathCount: number;
    iterationCount: number;
    collectionCount: number;
    applyCount: number;
    admissionCount: number;
    coordinatorAgentDrainCount: number;
    coordinatorAgentDrainWorkCount: number;
    mergeQueuePlanCount: number;
    reviewerPlanCount: number;
    patchStackPlanCount: number;
    decisionCount: number;
    committedDecisionCount: number;
    gatedDecisionCount: number;
    verificationGateCount: number;
    requiredVerificationGateCount: number;
    finalGateOk: boolean;
    finalGateState: FrontierCodexAutonomousFinalGateState;
    failedRequiredGateCount: number;
    skippedRequiredGateCount: number;
    finalGateContinuationDecisionCount: number;
    finalGateContinuationSkippedRequiredGateCount: number;
    promotedPatchCandidateCount: number;
    patchCount: number;
    rerunManifestCount: number;
    rerunTaskCount: number;
    rerunManifestTerminalState: FrontierCodexAutoDrainRerunManifestTerminalState;
  };
}

export type FrontierCodexDashboardMergeQueueHealthSource = typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND | 'not-collected';
export type FrontierCodexDashboardMergeQueueConflictKind = 'queue-conflict' | 'grouping-conflict' | 'current-head-conflict';
export type FrontierCodexDashboardMergeQueueRerunSourceKind = 'stale-against-head' | 'queue-rerun' | 'decision-rerun' | 'conflict-blocked';

export interface FrontierCodexDashboardMergeQueueLease {
  id: string;
  queueId: string;
  scopeId: string;
  scopeKind: FrontierSwarmCoordinatorAgentDrainWork['leases'][number]['scopeKind'];
  title: string;
  leaseScope: string;
  leaseKey: string;
  parentQueueId?: string;
  lane?: string;
  changedPaths: string[];
  changedRegions: string[];
  jobIds: string[];
  actions: Record<string, string[]>;
}

export interface FrontierCodexDashboardMergeQueueScope {
  id: string;
  kind: FrontierSwarmHierarchicalMergeQueue['scopes'][number]['kind'];
  parentId?: string;
  title: string;
  lane?: string;
  leaseKey: string;
  changedPaths: string[];
  changedRegions: string[];
  jobIds: string[];
  assignmentCount: number;
  openAssignmentCount: number;
  activeLease: boolean;
}

export interface FrontierCodexDashboardMergeQueueCoordinatorAssignment {
  id?: string;
  jobId: string;
  taskId?: string;
  lane?: string;
  title?: string;
  queueItemIds: string[];
  queueKeys: string[];
  queueId: string;
  queueKind?: FrontierSwarmCoordinatorAgentDrainWork['assignments'][number]['queueKind'];
  rootQueueId?: string;
  parentQueueIds: string[];
  promoteToQueueId?: string;
  leaseId?: string;
  leaseScope?: string;
  leaseKey?: string;
  assignedAction: FrontierSwarmMergeQueueAssignmentAction;
  decision: string;
  classification: string;
  terminal: boolean;
  open: boolean;
  selected?: boolean;
  coordinatorDecision?: FrontierCodexCoordinatorAgentDrainDecision;
  selectionReason?: string;
  reasons: string[];
  admitted?: boolean;
  changedPaths: string[];
  changedRegions: string[];
  conflictingJobIds: string[];
}

export interface FrontierCodexDashboardMergeQueueTerminalDecision {
  source: 'coordinator-agent-drain-work' | 'autonomous-apply';
  id: string;
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  queueKeys: string[];
  status: string;
  assignedAction?: FrontierSwarmMergeQueueAssignmentAction;
  queueId?: string;
  leaseId?: string;
  leaseScope?: string;
  lockScope?: FrontierCodexAutonomousLockScope;
  lockKeys?: string[];
  reasons: string[];
  bundlePath?: string;
  patchPath?: string;
  changedPaths: string[];
  changedRegions: string[];
  finishedAt?: number;
  commit?: string;
}

export interface FrontierCodexDashboardMergeQueueHumanQuestion {
  id: string;
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  queueKeys: string[];
  questionIds: string[];
  questionCodes: string[];
  questionContract?: FrontierCodexHumanQuestionContractFields;
  reason: string;
  answered: boolean;
  answerIds: string[];
  answerRoutes: string[];
  answerTexts: string[];
  answerEvidencePaths: string[];
  bundlePath?: string;
  patchPath?: string;
  changedPaths: string[];
  changedRegions: string[];
  finishedAt: number;
}

export interface FrontierCodexDashboardMergeQueueConflict {
  source: 'hierarchical-merge-queue' | 'auto-drain-grouping' | 'autonomous-apply';
  kind: FrontierCodexDashboardMergeQueueConflictKind | FrontierCodexSwarmAutoDrainGroupingConflictKind;
  key: string;
  jobIds: string[];
  taskId?: string;
  queueItemIds: string[];
  queueKeys: string[];
  scopeId?: string;
  leaseKey?: string;
  patchPath?: string;
  bundlePath?: string;
  changedPaths: string[];
  changedRegions: string[];
  reasons: string[];
  headBefore?: string;
  headAfter?: string;
  value?: string;
}

export interface FrontierCodexDashboardMergeQueueRerunCandidate {
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  queueKeys: string[];
  sourceKinds: FrontierCodexDashboardMergeQueueRerunSourceKind[];
  reasons: string[];
  sourceHeads: string[];
  sourcePatchPaths: string[];
  sourceBundlePaths: string[];
  sourceCollectionPaths: string[];
  sourceMergeQueuePaths: string[];
  sourceDecisionLogPaths: string[];
  targetRefs: string[];
  changedRegions: string[];
  queueActions: FrontierSwarmMergeQueueAssignmentAction[];
  decisionStatuses: FrontierCodexAutonomousDecisionStatus[];
  conflictingJobIds: string[];
  scopeIds: string[];
  leaseKeys: string[];
}

export interface FrontierCodexDashboardMergeQueueAppliedDecision {
  id: string;
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  queueKeys: string[];
  status: Extract<FrontierCodexAutonomousDecisionStatus, 'applied' | 'committed'>;
  reason: string;
  bundlePath: string;
  patchPath?: string;
  changedPaths: string[];
  changedRegions: string[];
  lockScope: FrontierCodexAutonomousLockScope;
  lockKeys: string[];
  finishedAt: number;
  commit?: string;
  verification: FrontierCodexAutonomousDecisionVerification;
}

export interface FrontierCodexDashboardMergeQueueHealth {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_MERGE_QUEUE_HEALTH_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_MERGE_QUEUE_HEALTH_VERSION;
  source: FrontierCodexDashboardMergeQueueHealthSource;
  available: boolean;
  activeLeases: FrontierCodexDashboardMergeQueueLease[];
  queueScopes: FrontierCodexDashboardMergeQueueScope[];
  coordinatorAssignments: FrontierCodexDashboardMergeQueueCoordinatorAssignment[];
  terminalDecisions: FrontierCodexDashboardMergeQueueTerminalDecision[];
  blockedHumanQuestions: FrontierCodexDashboardMergeQueueHumanQuestion[];
  realConflicts: FrontierCodexDashboardMergeQueueConflict[];
  rerunCandidates: FrontierCodexDashboardMergeQueueRerunCandidate[];
  appliedDecisions: FrontierCodexDashboardMergeQueueAppliedDecision[];
  counts: {
    activeLeaseCount: number;
    queueScopeCount: number;
    coordinatorAssignmentCount: number;
    openCoordinatorAssignmentCount: number;
    terminalDecisionCount: number;
    blockedHumanQuestionCount: number;
    realConflictCount: number;
    rerunCandidateCount: number;
    appliedDecisionCount: number;
    committedDecisionCount: number;
  };
}

export interface FrontierCodexDashboardQueueMetadata {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_VERSION;
  source: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND | 'not-collected';
  available: boolean;
  collectOnly?: FrontierCodexDashboardCollectOnlyMetadata;
  decisionCollapsePolicy: FrontierCodexAutonomousDecisionCollapsePolicy;
  humanAnswers: FrontierCodexDashboardHumanAnswers;
  paths: {
    autoDrain: string[];
    collections: string[];
    mergeQueues: string[];
    coordinatorAgentDrainWork: string[];
    queueOverlays: string[];
    rerunManifests: string[];
    humanAnswers: string[];
  };
  coordinatorAgentDrainWork: FrontierCodexDashboardCoordinatorAgentDrainWorkMetadata;
  actionCounts: {
    applyLocalCount: number;
    queueLocalCount: number;
    promoteCount: number;
    rerunCount: number;
    rejectCount: number;
    blockCount: number;
    trueBlockerCount: number;
    conflictBlockedDecisionCount: number;
    currentHeadConflictCount: number;
    deferredCoordinatorCount: number;
    deferredPromoteCount: number;
    recordOnlyCount: number;
  };
  conflictRetryWork: FrontierCodexDashboardConflictRetryWork[];
  bucketCounts: {
    readyToApplyCount: number;
    coordinatorReviewCount: number;
    failedEvidenceCount: number;
    staleAgainstHeadCount: number;
    promotedPatchCandidateCount: number;
  };
  mergeQueueHealth: FrontierCodexDashboardMergeQueueHealth;
  queueHealth: FrontierCodexDashboardQueueHealth;
  humanQuestions: FrontierCodexDashboardHumanQuestions;
  operatorSummary: FrontierCodexDashboardOperatorQueueSummary;
}

export interface FrontierCodexDashboardConflictRetryWork {
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  queueKeys: string[];
  patchPath?: string;
  bundlePath: string;
  changedPaths: string[];
  changedRegions: string[];
  reason: string;
  finishedAt: number;
}

export interface FrontierCodexDashboardCoordinatorAgentDrainWorkMetadata {
  paths: string[];
  count: number;
  leaseCount: number;
  assignmentCount: number;
  terminalCount: number;
  nonTerminalCount: number;
  promotedWorkCount: number;
  appliedCount: number;
  queuedCount: number;
  escalatedCount: number;
  rerunCount: number;
  rejectedCount: number;
  recordedCount: number;
  blockedCount: number;
}

export interface FrontierCodexDashboardCollectOnlyMetadata {
  reason: string;
  dirtyPaths: string[];
  dirtyPathCount: number;
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
  currentHeadConflictCount: number;
  selectedCoordinatorCount: number;
  deferredCoordinatorCount: number;
  selectedPromoteCount: number;
  deferredPromoteCount: number;
  conflictRetryWork: FrontierCodexDashboardConflictRetryWork[];
  trueBlockerCount: number;
  rejectedCount: number;
  recordOnlyCount: number;
  coordinatorReviewCount: number;
  coordinatorReviewAssignmentCount: number;
  coordinatorReviewTaskCount: number;
  humanQuestionCount: number;
  coordinatorDrainWorkCount: number;
  coordinatorDrainAssignmentCount: number;
  coordinatorDrainTerminalCount: number;
  coordinatorDrainNonTerminalCount: number;
  coordinatorDrainAppliedCount: number;
}

export interface FrontierCodexDashboardHumanQuestions {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_VERSION;
  source: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND | 'not-collected';
  available: boolean;
  count: number;
  decisionCount: number;
  answeredCount: number;
  routedDecisionCount: number;
  questionIds: string[];
  questionCodes: string[];
  openDecisionIds: string[];
  answeredDecisionIds: string[];
  jobIds: string[];
  taskIds: string[];
  reasons: string[];
  answeredJobIds: string[];
  answeredTaskIds: string[];
  routedDecisionIds: string[];
  routedJobIds: string[];
  routedTaskIds: string[];
  routedQuestionIds: string[];
  routedQuestionCodes: string[];
  answerIds: string[];
  answerRoutes: string[];
  answerLogPaths: string[];
  answerEvidencePaths: string[];
  openQuestions: FrontierCodexDashboardHumanQuestionDetail[];
  answeredQuestions: FrontierCodexDashboardHumanQuestionDetail[];
}

export interface FrontierCodexDashboardHumanQuestionDetail {
  id: string;
  decisionId: string;
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  questionIds: string[];
  questionCodes: string[];
  questionContract: FrontierCodexHumanQuestionContractFields;
  owner: string;
  surface: string;
  missingAuthority: FrontierCodexHumanQuestionMissingAuthority;
  question: string;
  answerCode: string;
  reason: string;
  answered: boolean;
  answerIds: string[];
  answerRoutes: string[];
  answerTexts: string[];
  answerEvidencePaths: string[];
}

export interface FrontierCodexDashboardHumanAnswers {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_ANSWERS_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_ANSWERS_VERSION;
  source: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND | 'not-collected';
  available: boolean;
  routingKind?: typeof FRONTIER_SWARM_CODEX_HUMAN_ANSWER_ROUTING_KIND;
  routingPath?: string;
  paths: string[];
  count: number;
  answeredCount: number;
  consumedCount: number;
  routedDecisionCount: number;
  routedContinuationCount: number;
  ignoredCount: number;
  parseErrorCount: number;
  answeredQuestionIds: string[];
  answeredQuestionCodes: string[];
  routedDecisionIds: string[];
  routedContinuationIds: string[];
  routedJobIds: string[];
  routedTaskIds: string[];
  routedQueueItemIds: string[];
  answerIds: string[];
  answerRoutes: string[];
  evidencePaths: string[];
  answers: FrontierCodexHumanActionAnswer[];
  routedDecisions: FrontierCodexHumanAnswerRoutedDecision[];
  routedContinuations: FrontierCodexHumanAnswerRoutedContinuation[];
  parseErrors: Array<{ path: string; line: number; error: string }>;
}

export interface FrontierCodexDashboardCostModelSummary {
  model: string;
  jobCount: number;
  estimatedJobCount: number;
  unknownPricingJobCount: number;
  unknownCostJobCount: number;
  incompleteTokenUsageJobCount: number;
  unestimatedJobCount: number;
  costEstimateStatus: FrontierCodexDashboardCostEstimateStatus;
  unknownPricingReason?: FrontierCodexCostEstimateReason;
  unknownCostReason?: FrontierCodexCostEstimateReason;
  inputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  pricingSource?: string;
  pricingSourceCheckedAt?: string;
  pricing?: FrontierCodexModelPricing;
  estimatedCostUsd?: number;
}

export interface FrontierCodexDashboardCostUnknownPricing {
  jobId: string;
  model?: string;
  reason: FrontierCodexCostEstimateReason;
  missingTokenFields?: string[];
}

export interface FrontierCodexDashboardCostUnknownCost {
  jobId: string;
  model?: string;
  reason: FrontierCodexCostEstimateReason;
  missingTokenFields?: string[];
}

export interface FrontierCodexDashboardCostSummary {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_COST_SUMMARY_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_COST_SUMMARY_VERSION;
  source: 'run-results-and-jobs-metadata';
  available: boolean;
  currency: 'USD';
  unitTokens: number;
  pricingSource: string;
  pricingSourceCheckedAt: string;
  jobCount: number;
  jobsWithTokenUsage: number;
  estimatedJobCount: number;
  unknownPricingJobCount: number;
  unknownCostJobCount: number;
  incompleteTokenUsageJobCount: number;
  missingUsageJobCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costEstimateStatus: FrontierCodexDashboardCostEstimateStatus;
  inputCostUsd?: number;
  cachedInputCostUsd?: number;
  uncachedInputCostUsd?: number;
  outputCostUsd?: number;
  estimatedCostUsd?: number;
  byModel: FrontierCodexDashboardCostModelSummary[];
  unknownPricing: FrontierCodexDashboardCostUnknownPricing[];
  unknownCosts: FrontierCodexDashboardCostUnknownCost[];
  missingUsageJobIds: string[];
}

interface FrontierCodexDashboardCostItem {
  jobId: string;
  status?: string;
  source: 'result' | 'job';
  metadata?: unknown;
}

export type FrontierCodexDashboardOperatorQueueStatus = 'ok' | 'info' | 'warning' | 'blocked' | 'unavailable';

export interface FrontierCodexDashboardOperatorQueueCard {
  id: string;
  label: string;
  value: number;
  detail: string;
  status: FrontierCodexDashboardOperatorQueueStatus;
  action: string;
  sourceFields: string[];
}

export interface FrontierCodexDashboardOperatorQueueSummary {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_OPERATOR_QUEUE_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_OPERATOR_QUEUE_VERSION;
  source: typeof FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND | 'not-collected';
  available: boolean;
  collectOnly?: FrontierCodexDashboardCollectOnlyMetadata;
  status: FrontierCodexDashboardOperatorQueueStatus;
  headline: string;
  cards: FrontierCodexDashboardOperatorQueueCard[];
  counts: {
    coordinatorQueues: number;
    leases: number;
    appliedDecisions: number;
    currentHeadConflicts: number;
    deferredCoordinatorQueues: number;
    deferredPromoteQueues: number;
    staleOrRerun: number;
    trueBlockers: number;
    humanQuestions: number;
    coordinatorReviewArtifacts: number;
  };
}

export type FrontierCodexDashboardAutonomousQueueHealthSource = 'run-and-auto-drain' | 'run-only';

export type FrontierCodexDashboardAutonomousQueueHealthSectionId =
  | 'active-workers'
  | 'coordinator-review'
  | 'completed-history'
  | 'rerun-work'
  | 'real-blockers'
  | 'human-questions';

export type FrontierCodexDashboardAutonomousDecisionHistoryState = 'current' | 'superseded';

export type FrontierCodexDashboardAutonomousDecisionQueueImpact =
  | 'completed-history'
  | 'rerun-work'
  | 'real-blocker'
  | 'human-question';

export interface FrontierCodexDashboardAutonomousQueueWorker {
  jobId: string;
  taskId?: string;
  lane?: string;
  layer?: string;
  title?: string;
  status: string;
  active: boolean;
  resultStatus?: string;
  mergeReadiness?: string;
  changedPaths: string[];
  evidencePaths: string[];
  costTelemetry?: FrontierCodexDashboardWorkerCostTelemetry;
}

export interface FrontierCodexDashboardWorkerCostTelemetry {
  costEstimateStatus: FrontierCodexDashboardCostEstimateStatus;
  estimated: boolean;
  reason?: FrontierCodexCostEstimateReason;
  model?: string;
  pricingModel?: string;
  currency: 'USD';
  unitTokens: number;
  pricingSource: string;
  pricingSourceCheckedAt: string;
  inputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputTokensKnown: boolean;
  cachedInputTokensKnown: boolean;
  uncachedInputTokensKnown: boolean;
  outputTokensKnown: boolean;
  totalTokensKnown: boolean;
  tokenBreakdownComplete: boolean;
  missingTokenFields: string[];
  inputCostUsd?: number;
  cachedInputCostUsd?: number;
  uncachedInputCostUsd?: number;
  outputCostUsd?: number;
  estimatedCostUsd?: number;
  pricing?: FrontierCodexModelPricing;
}

export interface FrontierCodexDashboardAutonomousDecisionHistoryItem {
  id: string;
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  queueKeys: string[];
  status: FrontierCodexAutonomousDecisionStatus;
  reason: string;
  historyState: FrontierCodexDashboardAutonomousDecisionHistoryState;
  current: boolean;
  superseded: boolean;
  supersededByDecisionId?: string;
  supersededByStatus?: FrontierCodexAutonomousDecisionStatus;
  queueImpact: FrontierCodexDashboardAutonomousDecisionQueueImpact;
  bundlePath: string;
  patchPath?: string;
  changedPaths: string[];
  changedRegions: string[];
  lockScope: FrontierCodexAutonomousLockScope;
  lockKeys: string[];
  finishedAt: number;
  commit?: string;
}

export interface FrontierCodexDashboardAutonomousQueueBlocker {
  id: string;
  source: 'queue-block' | 'human-blocked-decision';
  jobId: string;
  taskId?: string;
  queueItemIds: string[];
  queueKeys: string[];
  reason: string;
  changedPaths: string[];
  changedRegions: string[];
}

export interface FrontierCodexDashboardAutonomousQueueHealthSection {
  id: FrontierCodexDashboardAutonomousQueueHealthSectionId;
  label: string;
  value: number;
  detail: string;
  status: FrontierCodexDashboardOperatorQueueStatus;
  action: string;
  sourceFields: string[];
  itemIds: string[];
}

export interface FrontierCodexDashboardAutonomousQueueHealth {
  kind: typeof FRONTIER_SWARM_CODEX_DASHBOARD_AUTONOMOUS_QUEUE_HEALTH_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DASHBOARD_AUTONOMOUS_QUEUE_HEALTH_VERSION;
  source: FrontierCodexDashboardAutonomousQueueHealthSource;
  available: boolean;
  status: FrontierCodexDashboardOperatorQueueStatus;
  headline: string;
  sections: FrontierCodexDashboardAutonomousQueueHealthSection[];
  activeWorkers: FrontierCodexDashboardAutonomousQueueWorker[];
  workers: FrontierCodexDashboardAutonomousQueueWorker[];
  decisionHistory: FrontierCodexDashboardAutonomousDecisionHistoryItem[];
  completedHistory: FrontierCodexDashboardAutonomousDecisionHistoryItem[];
  rerunWork: FrontierCodexDashboardMergeQueueRerunCandidate[];
  realBlockers: FrontierCodexDashboardAutonomousQueueBlocker[];
  humanQuestions: FrontierCodexDashboardHumanQuestions;
  summary: {
    activeWorkerCount: number;
    workerCount: number;
    completedWorkerCount: number;
    failedWorkerCount: number;
    blockedWorkerCount: number;
    coordinatorReviewCount: number;
    coordinatorReviewAssignmentCount: number;
    coordinatorReviewTaskCount: number;
    completedHistoryCount: number;
    autonomousDecisionCount: number;
    currentDecisionCount: number;
    supersededDecisionCount: number;
    appliedDecisionCount: number;
    committedDecisionCount: number;
    rerunWorkCount: number;
    realBlockerCount: number;
    humanQuestionCount: number;
  };
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
  humanAnswers?: FrontierCodexHumanAnswerRoutingSummary;
  artifacts?: FrontierCodexAutoDrainArtifactMetadata;
  finalGateSummary: FrontierCodexAutonomousFinalGateRunSummary;
  summary: {
    iterationCount: number;
    collectionCount: number;
    applyCount: number;
    terminalCount: number;
    blockedCount: number;
    conflictBlockedCount: number;
    humanBlockedCount: number;
    humanBlockedDecisionCount: number;
    answeredHumanBlockedCount: number;
    humanAnswerContinuationCount: number;
    committedDecisionCount: number;
    gatedDecisionCount: number;
    verificationGateCount: number;
    requiredVerificationGateCount: number;
    finalGateOk: boolean;
    finalGateState: FrontierCodexAutonomousFinalGateState;
    failedRequiredGateCount: number;
    skippedRequiredGateCount: number;
    finalGateContinuationDecisionCount: number;
    finalGateContinuationSkippedRequiredGateCount: number;
    remainingReadyCount: number;
    rerunTaskCount: number;
    rerunManifestTerminalState: FrontierCodexAutoDrainRerunManifestTerminalState;
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
  generatedFailedEvidencePaths: string[];
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
      metadata: coerceCodexTaskMetadata(task)
    };
  }).filter((task) => task.id.length > 0);
}

function coerceCodexTaskMetadata(task: Record<string, unknown>): Record<string, unknown> {
  const metadata = isObject(task.metadata) ? task.metadata as Record<string, unknown> : {};
  return {
    ...metadata,
    source: task
  };
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
  const modelRoutingFeedback = options.modelRoutingFeedback
    ?? await loadCodexModelRoutingFeedback(options.modelRoutingFeedbackPaths, { cwd });
  await initFileSwarmEventStream(eventStream);
  const pidManifestPath = path.resolve(options.cwd ?? process.cwd(), options.pidManifestPath ?? path.join(outDir, 'pids.json'));
  await appendCodexPidManifest(pidManifestPath, { pid: process.pid, role: 'parent', status: 'running', runId: plan.runId, startedAt: Date.now() }, plan.runId);
  let parentExitCode = 1;
  try {
    let run = createSwarmRun({ plan, status: 'running', startedAt: Date.now() });
    const startedEvent = { type: 'swarm.started', runId: run.id, at: run.startedAt, data: { jobCount: plan.jobs.length } };
    run = recordSwarmEvent(run, startedEvent);
    await appendFileSwarmEvent(eventStream, startedEvent);
    const runOptions = { ...options, ...(modelRoutingFeedback ? { modelRoutingFeedback } : {}), eventStream, pidManifestPath };
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
    parentExitCode = ok ? 0 : 1;
    return result;
  } finally {
    await finishCodexPidManifestEntry(pidManifestPath, {
      pid: process.pid,
      role: 'parent'
    }, {
      finishedAt: Date.now(),
      exitCode: parentExitCode
    }, plan.runId).catch(() => {});
  }
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
  const collectOnlyReason = dirtyPaths.length ? 'dirty-worktree' : undefined;

  const iterations: FrontierCodexSwarmAutoDrainIteration[] = [];
  const terminalJobIds = new Set<string>();
  const blockedJobIds = new Set<string>();
  const promotedQueueDebtJobIds = new Set<string>();
  const maxIterations = Math.max(1, Math.floor(normalized.maxIterations ?? Math.max(1, input.run.jobs.length + 1)));
  let remainingReadyCount = 0;
  let latestCollection: FrontierCodexCollectResult | undefined;
  for (let index = 0; index < maxIterations; index += 1) {
    const collection = await collectCodexSwarmRun({
      run: input.outDir,
      cwd: input.cwd,
      outDir: path.join(outDir, `collection-${String(index + 1).padStart(2, '0')}`),
      checkStale: normalized.checkStale ?? true,
      branchPrefix: normalized.branchPrefix,
      promotePatchCandidates: shouldAutoDrainPromotePatchCandidates(normalized),
      promotionFocusedCommands: normalized.focusedCommands,
      promotionGlobalCommands: normalized.globalCommands,
      promotionGlobalGlobs: normalized.globalGlobs
    });
    latestCollection = collection;
    await writeAutoDrainReviewArtifacts(outDir, collection);
    const resolvedQueueKeys = createResolvedAutonomousDecisionQueueKeySet(
      iterations.flatMap((iteration) => iteration.apply?.decisions ?? [])
    );
    const allReadyJobIds = collection.buckets['ready-to-apply']
      .filter((entry) => dashboardCollectedBundleIsOpen(entry, terminalJobIds, blockedJobIds, resolvedQueueKeys))
      .map((entry) => entry.jobId);
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
    const terminalQueueDebtJobIds = terminalAutoDrainQueueDebtJobIds(collection, terminalJobIds, blockedJobIds, resolvedQueueKeys);
    const activePromotedQueueDebtJobIds = visibleAutoDrainQueueDebtJobIds(
      collection,
      [...promotedQueueDebtJobIds],
      terminalJobIds,
      blockedJobIds,
      resolvedQueueKeys
    );
    const drainWorkJobIds = uniqueStrings([
      ...allReadyJobIds,
      ...terminalQueueDebtJobIds,
      ...activePromotedQueueDebtJobIds
    ]).sort();
    const coordinatorAgentDrain = await writeAutoDrainCoordinatorAgentDrainArtifact({
      collection,
      outDir,
      iteration: index + 1,
      admission,
      readyJobIds: allReadyJobIds,
      drainWorkJobIds,
      promotedQueueDebtJobIds: activePromotedQueueDebtJobIds,
      admittedJobIds,
      deferredJobIds
    });
    for (const promotedWork of coordinatorAgentDrain.workArtifact.promotedWork) promotedQueueDebtJobIds.add(promotedWork.jobId);
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
      drainWorkJobIds,
      coordinatorAgentDrain: coordinatorAgentDrain.artifact
    });
    remainingReadyCount = allReadyJobIds.length;
    if (collectOnlyReason || !allReadyJobIds.length || !drainAdmittedJobIds.length) {
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
        coordinatorAgentDrainWorkPath: coordinatorAgentDrain.workPath,
        coordinatorAgentDrainWork: coordinatorAgentDrain.workArtifact,
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
      else if (autonomousDecisionBlocksAutoDrain(decision.status)) blockedJobIds.add(decision.jobId);
    }
    const postApplyCollection = await collectCodexSwarmRun({
      run: input.outDir,
      cwd: input.cwd,
      outDir: path.join(outDir, `collection-${String(index + 1).padStart(2, '0')}-post-apply`),
      checkStale: normalized.checkStale ?? true,
      branchPrefix: normalized.branchPrefix,
      promotePatchCandidates: shouldAutoDrainPromotePatchCandidates(normalized),
      promotionFocusedCommands: normalized.focusedCommands,
      promotionGlobalCommands: normalized.globalCommands,
      promotionGlobalGlobs: normalized.globalGlobs
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
      coordinatorAgentDrainWorkPath: coordinatorAgentDrain.workPath,
      coordinatorAgentDrainWork: coordinatorAgentDrain.workArtifact,
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
    const updatedResolvedQueueKeys = createResolvedAutonomousDecisionQueueKeySet(
      iterations.flatMap((iteration) => iteration.apply?.decisions ?? [])
    );
    remainingReadyCount = postApplyCollection.buckets['ready-to-apply']
      .filter((entry) => dashboardCollectedBundleIsOpen(entry, terminalJobIds, blockedJobIds, updatedResolvedQueueKeys)).length;
    const remainingTerminalQueueDebtCount = terminalAutoDrainQueueDebtJobIds(postApplyCollection, terminalJobIds, blockedJobIds, updatedResolvedQueueKeys).length;
    const remainingPromotedQueueDebtCount = visibleAutoDrainQueueDebtJobIds(
      postApplyCollection,
      [...promotedQueueDebtJobIds],
      terminalJobIds,
      blockedJobIds,
      updatedResolvedQueueKeys
    ).length;
    if (!apply.decisions.length || (remainingReadyCount === 0 && remainingTerminalQueueDebtCount === 0 && remainingPromotedQueueDebtCount === 0)) break;
  }
  const lockSummary = summarizeAutonomousDecisionLockScopes(iterations.flatMap((iteration) => iteration.apply?.decisions ?? []));
  const latestIteration = iterations[iterations.length - 1];
  const admittedCount = uniqueStrings(iterations.flatMap((iteration) => iteration.admittedJobIds)).length;
  const deferredCount = latestIteration?.deferredJobIds.length ?? 0;
  const decisions = iterations.flatMap((iteration) => iteration.apply?.decisions ?? []);
  const humanQuestionContinuations = createHumanQuestionContinuations(iterations);
  const humanAnswers = await createHumanAnswerRoutingSummary({
    cwd: input.cwd,
    runDir: input.outDir,
    autoDrainOutDir: outDir,
    configuredPath: normalized.humanAnswerLogPath,
    routingPath: path.join(outDir, 'human-answer-routing.json'),
    decisions,
    continuations: humanQuestionContinuations
  });
  const latestDecisions = latestDashboardAutonomousDecisions(decisions);
  const answeredHumanBlockedDecisions = latestDecisions.filter((decision) => (
    dashboardAutonomousDecisionIsExplicitHumanQuestion(decision)
      && dashboardHumanQuestionHasRoutedAnswer(decision, humanAnswers)
  ));
  const answeredHumanBlockedDecisionIds = new Set(answeredHumanBlockedDecisions.map((decision) => decision.id));
  const answeredHumanBlockedJobIds = new Set(answeredHumanBlockedDecisions.map((decision) => decision.jobId));
  const openBlockedJobIds = uniqueStrings([...blockedJobIds].filter((jobId) => !answeredHumanBlockedJobIds.has(jobId))).sort();
  const openBlockedJobIdSet = new Set(openBlockedJobIds);
  const finalResolvedQueueKeys = createResolvedAutonomousDecisionQueueKeySet(decisions);
  const finalRemainingReadyCount = latestCollection?.buckets['ready-to-apply']
    .filter((entry) => dashboardCollectedBundleIsOpen(entry, terminalJobIds, openBlockedJobIdSet, finalResolvedQueueKeys)).length ?? remainingReadyCount;
  const rerunManifest = await writeAutoDrainRerunManifest({
    cwd: input.cwd,
    outDir,
    autoDrainPath,
    generatedAt,
    iterations,
    terminalJobIds: [...terminalJobIds],
    blockedJobIds: openBlockedJobIds
  });
  const artifacts = createAutoDrainArtifactMetadata({ outDir, autoDrainPath, generatedAt, iterations, rerunManifest });
  const decisionProof = summarizeAutonomousDecisionProof(decisions);
  const finalGateSummary = summarizeAutonomousFinalGateRun(decisions);
  const conflictBlockedCount = decisions.filter((decision) => decision.status === 'conflict-blocked').length;
  const humanBlockedDecisionCount = latestDecisions.filter((decision) => decision.status === 'human-blocked').length;
  const humanBlockedCount = latestDecisions.filter((decision) => (
    decision.status === 'human-blocked'
      && !answeredHumanBlockedDecisionIds.has(decision.id)
  )).length;
  const result: FrontierCodexSwarmAutoDrainResult = {
    kind: FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND,
    version: FRONTIER_SWARM_CODEX_AUTO_DRAIN_VERSION,
    ok: dirtyPaths.length === 0 && openBlockedJobIds.length === 0 && finalGateSummary.ok,
    enabled: true,
    cwd: input.cwd,
    runDir: input.outDir,
    outDir,
    generatedAt,
    ...(collectOnlyReason ? { skippedReason: collectOnlyReason } : {}),
    ...(dirtyPaths.length ? { dirtyPaths } : {}),
    iterations,
    lockKeys: lockSummary.lockKeys,
    lockScopeCounts: lockSummary.lockScopeCounts,
    terminalJobIds: [...terminalJobIds].sort(),
    blockedJobIds: openBlockedJobIds,
    humanAnswers,
    artifacts,
    finalGateSummary,
    summary: {
      iterationCount: iterations.length,
      collectionCount: iterations.length,
      applyCount: iterations.filter((iteration) => iteration.apply).length,
      terminalCount: terminalJobIds.size,
      blockedCount: openBlockedJobIds.length,
      conflictBlockedCount,
      humanBlockedCount,
      humanBlockedDecisionCount,
      answeredHumanBlockedCount: answeredHumanBlockedDecisions.length,
      humanAnswerContinuationCount: humanAnswers.routedContinuationCount,
      committedDecisionCount: decisionProof.committedDecisionCount,
      gatedDecisionCount: decisionProof.gatedDecisionCount,
      verificationGateCount: decisionProof.verificationGateCount,
      requiredVerificationGateCount: decisionProof.requiredVerificationGateCount,
      finalGateOk: finalGateSummary.ok,
      finalGateState: finalGateSummary.state,
      failedRequiredGateCount: finalGateSummary.failedRequiredGateCount,
      skippedRequiredGateCount: finalGateSummary.skippedRequiredGateCount,
      finalGateContinuationDecisionCount: finalGateSummary.continuationDecisionCount,
      finalGateContinuationSkippedRequiredGateCount: finalGateSummary.continuationSkippedRequiredGateCount,
      remainingReadyCount: finalRemainingReadyCount,
      rerunTaskCount: rerunManifest.summary.taskCount,
      rerunManifestTerminalState: rerunManifest.summary.terminalState,
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
  drainWorkJobIds?: readonly string[];
  promotedQueueDebtJobIds?: readonly string[];
  admittedJobIds: readonly string[];
  deferredJobIds: readonly string[];
}): Promise<{
  path: string;
  artifact: FrontierCodexCoordinatorAgentDrainArtifact;
  workPath: string;
  workArtifact: FrontierSwarmCoordinatorAgentDrainWork;
}> {
  const artifactPath = path.join(input.outDir, `coordinator-agent-drain-${String(input.iteration).padStart(2, '0')}.json`);
  const workArtifactPath = path.join(input.outDir, `coordinator-agent-drain-work-${String(input.iteration).padStart(2, '0')}.json`);
  const workArtifact = createAutoDrainCoordinatorAgentDrainWorkArtifact({
    ...input,
    artifactPath
  });
  const artifact = createAutoDrainCoordinatorAgentDrainArtifact({
    ...input,
    workArtifactId: workArtifact.id,
    workArtifactPath
  });
  await writeJsonAtomic(artifactPath, artifact);
  await writeJsonAtomic(workArtifactPath, workArtifact);
  return { path: artifactPath, artifact, workPath: workArtifactPath, workArtifact };
}

function createAutoDrainCoordinatorAgentDrainArtifact(input: {
  collection: FrontierCodexCollectResult;
  iteration: number;
  admission: FrontierSwarmMergeAdmission;
  readyJobIds: readonly string[];
  drainWorkJobIds?: readonly string[];
  admittedJobIds: readonly string[];
  deferredJobIds: readonly string[];
  workArtifactId?: string;
  workArtifactPath?: string;
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
    ...(input.workArtifactId ? { workArtifactId: input.workArtifactId } : {}),
    ...(input.workArtifactPath ? { workArtifactPath: input.workArtifactPath } : {}),
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

function createAutoDrainCoordinatorAgentDrainWorkArtifact(input: {
  collection: FrontierCodexCollectResult;
  iteration: number;
  artifactPath: string;
  admission: FrontierSwarmMergeAdmission;
  readyJobIds: readonly string[];
  drainWorkJobIds?: readonly string[];
  promotedQueueDebtJobIds?: readonly string[];
  admittedJobIds: readonly string[];
  deferredJobIds: readonly string[];
}): FrontierSwarmCoordinatorAgentDrainWork {
  const generatedAt = Date.now();
  const drainWorkJobIds = uniqueStrings(input.drainWorkJobIds ?? input.readyJobIds).sort();
  const promotedQueueDebtJobIds = visibleAutoDrainQueueDebtJobIds(
    input.collection,
    input.promotedQueueDebtJobIds ?? [],
    new Set<string>(),
    new Set<string>()
  );
  const readyIndex = filterMergeIndexForJobIds(input.collection.mergeIndex, drainWorkJobIds);
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
  return createSwarmCoordinatorAgentDrainWork({
    queue,
    coordinatorId: 'frontier-swarm-codex:auto-drain',
    generatedAt,
    metadata: {
      source: FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND,
      iteration: input.iteration,
      collectionDir: input.collection.outDir,
      selectedDeferredArtifactPath: input.artifactPath,
      readyJobIds: [...input.readyJobIds],
      drainWorkJobIds,
      promotedQueueDebtJobIds,
      deferredPromotedWork: autoDrainQueueDebtRecords({
        collection: input.collection,
        queue,
        jobIds: input.deferredJobIds,
        actions: ['promote']
      }),
      carriedPromotedQueueDebt: autoDrainQueueDebtRecords({
        collection: input.collection,
        queue,
        jobIds: promotedQueueDebtJobIds
      }),
      admittedJobIds: [...input.admittedJobIds],
      deferredJobIds: [...input.deferredJobIds]
    }
  });
}

const AUTO_DRAIN_TERMINAL_QUEUE_ACTIONS: ReadonlySet<FrontierSwarmMergeQueueAssignmentAction> = new Set([
  'rerun',
  'reject',
  'record-only',
  'block'
]);

function collectionEntriesByJobId(collection: FrontierCodexCollectResult): Map<string, FrontierCodexCollectedBundle> {
  const entries = new Map<string, FrontierCodexCollectedBundle>();
  for (const bucketEntries of Object.values(collection.buckets)) {
    for (const entry of bucketEntries) entries.set(entry.jobId, entry);
  }
  return entries;
}

function visibleAutoDrainQueueDebtJobIds(
  collection: FrontierCodexCollectResult,
  jobIds: readonly string[],
  terminalJobIds: ReadonlySet<string>,
  blockedJobIds: ReadonlySet<string>,
  resolvedQueueKeys: ReadonlySet<string> = new Set()
): string[] {
  const entriesByJobId = collectionEntriesByJobId(collection);
  return uniqueStrings(jobIds)
    .filter((jobId) => {
      const entry = entriesByJobId.get(jobId);
      if (!entry) return false;
      const record = autoDrainGroupingRecord(entry);
      return dashboardQueueSubjectIsOpen(record, terminalJobIds, blockedJobIds, resolvedQueueKeys);
    })
    .sort();
}

function autoDrainQueueDebtRecords(input: {
  collection: FrontierCodexCollectResult;
  queue: FrontierSwarmHierarchicalMergeQueue;
  jobIds: readonly string[];
  actions?: readonly FrontierSwarmMergeQueueAssignmentAction[];
}): AutoDrainQueueDebtRecord[] {
  const entriesByJobId = collectionEntriesByJobId(input.collection);
  const assignmentsByJobId = new Map(input.queue.assignments.map((assignment) => [assignment.jobId, assignment]));
  const actions = input.actions ? new Set(input.actions) : undefined;
  return uniqueStrings(input.jobIds)
    .sort()
    .map((jobId): AutoDrainQueueDebtRecord | undefined => {
      const assignment = assignmentsByJobId.get(jobId);
      if (actions && (!assignment || !actions.has(assignment.action))) return undefined;
      const entry = entriesByJobId.get(jobId);
      const record = entry ? autoDrainGroupingRecord(entry) : undefined;
      return {
        jobId,
        ...(assignment?.taskId || record?.taskId ? { taskId: assignment?.taskId ?? record?.taskId } : {}),
        ...(assignment?.lane || record?.lane ? { lane: assignment?.lane ?? record?.lane } : {}),
        queueItemIds: assignment?.queueItemIds.length ? [...assignment.queueItemIds] : record ? [...record.queueItemIds] : [jobId],
        ...(entry ? { bucket: entry.bucket } : {}),
        ...(record ? { bundlePath: record.mergePath } : {}),
        ...(record?.patchPath ? { patchPath: record.patchPath } : {}),
        ...(assignment ? { queueAction: assignment.action } : {}),
        changedPaths: assignment ? [...assignment.changedPaths] : record ? [...record.changedPaths] : [],
        changedRegions: assignment ? [...assignment.changedRegions] : record ? [...record.changedRegions] : [],
        scopeKeys: record ? [...record.scopeKeys] : [],
        reasons: assignment ? [...assignment.reasons] : []
      };
    })
    .filter((entry): entry is AutoDrainQueueDebtRecord => entry !== undefined);
}

function terminalAutoDrainQueueDebtJobIds(
  collection: FrontierCodexCollectResult,
  terminalJobIds: ReadonlySet<string>,
  blockedJobIds: ReadonlySet<string>,
  resolvedQueueKeys: ReadonlySet<string> = new Set()
): string[] {
  return uniqueStrings((collection.hierarchicalMergeQueue?.assignments ?? [])
    .filter((assignment) => (
      AUTO_DRAIN_TERMINAL_QUEUE_ACTIONS.has(assignment.action)
      && dashboardQueueSubjectIsOpen(assignment, terminalJobIds, blockedJobIds, resolvedQueueKeys)
    ))
    .map((assignment) => assignment.jobId)).sort();
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

interface AutoDrainQueueDebtRecord {
  jobId: string;
  taskId?: string;
  lane?: string;
  queueItemIds: string[];
  bucket?: FrontierCodexCollectBucket;
  bundlePath?: string;
  patchPath?: string;
  queueAction?: FrontierSwarmMergeQueueAssignmentAction;
  changedPaths: string[];
  changedRegions: string[];
  scopeKeys: string[];
  reasons: string[];
}

async function writeAutoDrainGroupingArtifact(input: {
  collection: FrontierCodexCollectResult;
  outDir: string;
  iteration: number;
  readyJobIds: readonly string[];
  admittedJobIds: readonly string[];
  deferredJobIds: readonly string[];
  drainWorkJobIds?: readonly string[];
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
  drainWorkJobIds?: readonly string[];
  coordinatorAgentDrain?: FrontierCodexCoordinatorAgentDrainArtifact;
}): FrontierCodexSwarmAutoDrainGroupingArtifact {
  const generatedAt = Date.now();
  const entriesByJobId = collectionEntriesByJobId(input.collection);
  const coordinatorAgentAssignments = new Map((input.coordinatorAgentDrain?.assignments ?? []).map((assignment) => [assignment.jobId, assignment]));
  const admittedRecords = input.admittedJobIds
    .map((jobId) => {
      const entry = entriesByJobId.get(jobId);
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
    const entry = entriesByJobId.get(record.jobId);
    const placement = placements.get(record.jobId);
    const recordConflicts = placement?.conflicts ?? [];
    const serializesAfterJobIds = uniqueStrings(recordConflicts.flatMap((conflict) => conflict.jobIds.filter((jobId) => jobId !== record.jobId))).sort();
    const coordinatorAgent = coordinatorAgentAssignments.get(record.jobId);
    return {
      jobId: record.jobId,
      ...(record.taskId ? { taskId: record.taskId } : {}),
      ...(record.lane ? { lane: record.lane } : {}),
      queueItemIds: [...record.queueItemIds],
      ...(entry ? { bucket: entry.bucket } : {}),
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
    const entry = entriesByJobId.get(jobId);
    const record = entry ? autoDrainGroupingRecord(entry) : undefined;
    const coordinatorAgent = coordinatorAgentAssignments.get(jobId);
    return {
      jobId,
      ...(record?.taskId ? { taskId: record.taskId } : {}),
      ...(record?.lane ? { lane: record.lane } : {}),
      queueItemIds: record ? [...record.queueItemIds] : [jobId],
      ...(entry ? { bucket: entry.bucket } : {}),
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
  const placedJobIds = new Set([...input.admittedJobIds, ...input.deferredJobIds]);
  const queueDebtJobIds = uniqueStrings(input.drainWorkJobIds ?? [])
    .filter((jobId) => !placedJobIds.has(jobId))
    .sort();
  const queueDebtJobs = queueDebtJobIds.map((jobId): FrontierCodexSwarmAutoDrainGroupingJob => {
    const entry = entriesByJobId.get(jobId);
    const record = entry ? autoDrainGroupingRecord(entry) : undefined;
    const coordinatorAgent = coordinatorAgentAssignments.get(jobId);
    return {
      jobId,
      ...(record?.taskId ? { taskId: record.taskId } : {}),
      ...(record?.lane ? { lane: record.lane } : {}),
      queueItemIds: record ? [...record.queueItemIds] : [jobId],
      ...(entry ? { bucket: entry.bucket } : {}),
      ...(record ? { bundlePath: record.mergePath } : {}),
      ...(record?.patchPath ? { patchPath: record.patchPath } : {}),
      changedPaths: record ? [...record.changedPaths] : [],
      changedRegions: record ? [...record.changedRegions] : [],
      scopeKeys: record ? [...record.scopeKeys] : [],
      placement: 'deferred',
      serializesAfterJobIds: coordinatorAgent?.serializesAfterJobIds ?? [],
      conflicts: [],
      ...(coordinatorAgent ? { coordinatorAgent } : {}),
      reason: coordinatorAgent?.selectionReason ?? 'auto-drain-queue-debt'
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
    drainWorkJobIds: uniqueStrings(input.drainWorkJobIds ?? input.readyJobIds).sort(),
    queueDebtJobIds,
    groups: groupArtifacts,
    jobs: [...admittedJobs, ...deferredJobs, ...queueDebtJobs],
    conflicts: dedupedConflicts,
    summary: {
      readyCount: input.readyJobIds.length,
      admittedCount: input.admittedJobIds.length,
      deferredCount: input.deferredJobIds.length,
      queueDebtCount: queueDebtJobIds.length,
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

function shouldAutoDrainPromotePatchCandidates(options: FrontierCodexSwarmAutoDrainOptions): boolean {
  if (options.promotePatchCandidates === false) return false;
  return hasAutoDrainCoordinatorVerification(options);
}

function hasAutoDrainCoordinatorVerification(options: FrontierCodexSwarmAutoDrainOptions): boolean {
  if (hasAutoDrainVerificationCommands(options.focusedCommands)) return true;
  return hasAutoDrainVerificationCommands(options.globalCommands) && (options.globalGlobs ?? []).length > 0;
}

function shouldAutonomousApplyPromotePatchCandidates(options: FrontierCodexAutonomousApplyInput): boolean {
  if (options.promotePatchCandidates === false) return false;
  if (options.promotePatchCandidates === true) return true;
  return hasAutonomousApplyCoordinatorVerification(options);
}

function hasAutonomousApplyCoordinatorVerification(options: FrontierCodexAutonomousApplyInput): boolean {
  if (hasAutoDrainVerificationCommands(options.focusedCommands)) return true;
  return hasAutoDrainVerificationCommands(options.globalCommands) && (options.globalGlobs ?? []).length > 0;
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
  return classifyCodexAutonomousDecisionCollapse(status).autoDrainTerminal;
}

function autonomousDecisionBlocksAutoDrain(status: FrontierCodexAutonomousDecisionStatus): boolean {
  return classifyCodexAutonomousDecisionCollapse(status).blocksAutoDrain;
}

function autonomousDecisionResolvesPriorQueueDebt(status: FrontierCodexAutonomousDecisionStatus): boolean {
  return classifyCodexAutonomousDecisionCollapse(status).ledgerTerminal;
}

function createCodexAutonomousDecisionLeaseReadback(
  decision: Omit<FrontierCodexAutonomousMergeDecision, 'leaseReadback'> | FrontierCodexAutonomousMergeDecision,
  input: { collectionHead?: string; leaseHead?: string } = {}
): FrontierCodexAutonomousDecisionLeaseReadback {
  const existing = (decision as Partial<FrontierCodexAutonomousMergeDecision>).leaseReadback;
  const collectionHead = input.collectionHead ?? existing?.head.collectionHead;
  const leaseHead = input.leaseHead ?? existing?.head.leaseHead;
  const currentHead = decision.commit ?? decision.headAfter ?? leaseHead ?? decision.headBefore;
  const movedSinceCollection = Boolean(collectionHead && leaseHead && collectionHead !== leaseHead);
  const movedDuringDecision = Boolean(
    leaseHead
      && decision.headAfter
      && decision.headAfter !== leaseHead
      && decision.status !== 'applied'
      && decision.status !== 'committed'
  );
  return {
    source: 'autonomous-apply',
    decisionId: decision.id,
    jobId: decision.jobId,
    ...(decision.taskId ? { taskId: decision.taskId } : {}),
    queueItemIds: [...decision.queueItemIds],
    queueKeys: dashboardQueueSubjectAliasKeys(decision),
    status: decision.status,
    reason: decision.reason,
    terminal: autonomousDecisionIsTerminal(decision.status),
    dryRun: decision.dryRun,
    applyScope: {
      bundlePath: decision.bundlePath,
      ...(decision.patchPath ? { patchPath: decision.patchPath } : {}),
      changedPaths: [...decision.changedPaths],
      changedRegions: [...decision.changedRegions]
    },
    lease: {
      scope: decision.lockScope,
      keys: [...decision.lockKeys],
      ...(decision.lockPath ? { lockPath: decision.lockPath } : {}),
      ...(decision.lockToken ? { token: decision.lockToken } : {})
    },
    head: {
      ...(collectionHead ? { collectionHead } : {}),
      ...(leaseHead ? { leaseHead } : {}),
      ...(decision.headBefore ? { headBefore: decision.headBefore } : {}),
      ...(decision.headAfter ? { headAfter: decision.headAfter } : {}),
      ...(currentHead ? { currentHead } : {}),
      ...(decision.commit ? { commit: decision.commit } : {}),
      movedSinceCollection,
      movedDuringDecision
    },
    ...(decision.rollbackEvidence ? { rollbackEvidence: cloneAutonomousRollbackEvidence(decision.rollbackEvidence) } : {}),
    ...(existing?.supersedesDecisionIds?.length ? { supersedesDecisionIds: [...existing.supersedesDecisionIds] } : {}),
    ...(existing?.supersededByDecisionId ? { supersededByDecisionId: existing.supersededByDecisionId } : {})
  };
}

function attachCodexAutonomousDecisionLeaseReadbacks(
  decisions: FrontierCodexAutonomousMergeDecision[]
): FrontierCodexAutonomousDecisionLeaseReadback[] {
  for (const decision of decisions) {
    decision.leaseReadback = createCodexAutonomousDecisionLeaseReadback(decision);
  }
  for (const component of createDashboardAutonomousDecisionComponents(decisions)) {
    const latest = component.latest.decision;
    const superseded = decisions.filter((decision) => (
      decision.id !== latest.id
        && dashboardAutonomousDecisionAliasKeys(decision).some((key) => component.keys.has(key))
    ));
    if (!superseded.length) continue;
    latest.leaseReadback = {
      ...latest.leaseReadback,
      supersedesDecisionIds: uniqueStrings([
        ...(latest.leaseReadback.supersedesDecisionIds ?? []),
        ...superseded.map((decision) => decision.id)
      ]).sort()
    };
    for (const decision of superseded) {
      decision.leaseReadback = {
        ...decision.leaseReadback,
        supersededByDecisionId: latest.id
      };
    }
  }
  return decisions.map((decision) => cloneCodexAutonomousDecisionLeaseReadback(decision.leaseReadback));
}

function cloneCodexAutonomousDecisionLeaseReadback(
  readback: FrontierCodexAutonomousDecisionLeaseReadback
): FrontierCodexAutonomousDecisionLeaseReadback {
  return {
    ...readback,
    queueItemIds: [...readback.queueItemIds],
    queueKeys: [...readback.queueKeys],
    applyScope: {
      ...readback.applyScope,
      changedPaths: [...readback.applyScope.changedPaths],
      changedRegions: [...readback.applyScope.changedRegions]
    },
    lease: {
      ...readback.lease,
      keys: [...readback.lease.keys]
    },
    head: { ...readback.head },
    ...(readback.rollbackEvidence ? { rollbackEvidence: cloneAutonomousRollbackEvidence(readback.rollbackEvidence) } : {}),
    ...(readback.supersedesDecisionIds?.length ? { supersedesDecisionIds: [...readback.supersedesDecisionIds] } : {}),
    ...(readback.supersededByDecisionId ? { supersededByDecisionId: readback.supersededByDecisionId } : {})
  };
}

function cloneAutonomousRollbackEvidence(
  evidence: FrontierCodexAutonomousRollbackEvidence
): FrontierCodexAutonomousRollbackEvidence {
  return {
    ...evidence,
    changedPaths: [...evidence.changedPaths],
    cleanupCommands: evidence.cleanupCommands.map((command) => ({
      command: [...command.command],
      status: command.status
    })),
    dirtyPaths: [...evidence.dirtyPaths]
  };
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

function revalidateAutonomousHeadMoveCandidate(input: {
  collectionHead: string;
  currentHead: string;
  candidate: {
    jobId: string;
    lockScope: FrontierCodexAutonomousLockScope;
    lockKeys: readonly string[];
    changedPaths: readonly string[];
  };
  priorDecisions: readonly FrontierCodexAutonomousMergeDecision[];
}): { ok: true } | { ok: false; reason: string } {
  const headMoveChain = autonomousCommittedHeadMoveChain(input.priorDecisions, input.collectionHead, input.currentHead);
  if (!headMoveChain) {
    return {
      ok: false,
      reason: 'repository head changed since bundle collection; rerun against current head'
    };
  }
  const conflicts = headMoveChain.filter((decision) => autonomousLockSurfacesConflict(input.candidate, decision));
  if (conflicts.length) {
    const jobs = uniqueStrings(conflicts.map((decision) => decision.jobId)).slice(0, 8);
    const keys = uniqueStrings(conflicts.flatMap((decision) => conflictingAutonomousLockKeys(input.candidate, decision))).slice(0, 8);
    const jobText = jobs.length ? ` with ${jobs.join(', ')}` : '';
    const keyText = keys.length ? ` (${keys.join(', ')})` : '';
    return {
      ok: false,
      reason: `repository head changed since bundle collection and semantic lease keys conflict${jobText}${keyText}; rerun against current head`
    };
  }
  return { ok: true };
}

async function replayAutonomousPatchAtCollectionHead(input: {
  cwd: string;
  jobId: string;
  collectionHead: string;
  patchPath: string;
  commands: FrontierCodexAutonomousMergeDecision['commands'];
}): Promise<{ status: 'applies' | 'conflict' | 'unavailable'; reason: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `frontier-swarm-current-head-${slug(input.jobId)}-`));
  const workspace = path.join(root, 'workspace');
  let added = false;
  try {
    const add = await runLoggedProcess('git', ['worktree', 'add', '--detach', workspace, input.collectionHead], input.cwd);
    input.commands.push(add);
    if (add.status !== 0) {
      return { status: 'unavailable', reason: 'collection-head replay workspace unavailable; rerun against current head' };
    }
    added = true;
    const check = await runLoggedProcess('git', ['apply', '--check', path.resolve(input.patchPath)], workspace);
    input.commands.push(check);
    return check.status === 0
      ? { status: 'applies', reason: 'patch applies at collection head but not current head; rerun against current head' }
      : { status: 'conflict', reason: 'patch does not apply at collection head or current head' };
  } finally {
    if (added) {
      const remove = await runLoggedProcess('git', ['worktree', 'remove', '--force', workspace], input.cwd);
      input.commands.push(remove);
    }
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }
}

function autonomousCommittedHeadMoveChain(
  decisions: readonly FrontierCodexAutonomousMergeDecision[],
  collectionHead: string,
  currentHead: string
): FrontierCodexAutonomousMergeDecision[] | undefined {
  const chain: FrontierCodexAutonomousMergeDecision[] = [];
  let head = collectionHead;
  for (const decision of decisions) {
    if (decision.status !== 'committed' || !decision.headBefore || !decision.headAfter || decision.headBefore === decision.headAfter) continue;
    if (decision.headBefore !== head) continue;
    chain.push(decision);
    head = decision.headAfter;
    if (head === currentHead) return chain;
  }
  return undefined;
}

function autonomousLockSurfacesConflict(
  left: {
    lockScope: FrontierCodexAutonomousLockScope;
    lockKeys: readonly string[];
    changedPaths: readonly string[];
  },
  right: {
    lockScope: FrontierCodexAutonomousLockScope;
    lockKeys: readonly string[];
    changedPaths: readonly string[];
  }
): boolean {
  if (left.lockScope === 'repo' || right.lockScope === 'repo') return true;
  const leftKeys = new Set(left.lockKeys);
  for (const key of right.lockKeys) {
    if (key === AUTONOMOUS_APPLY_REPO_LOCK_KEY || leftKeys.has(key)) return true;
  }
  if (left.lockKeys.includes(AUTONOMOUS_APPLY_REPO_LOCK_KEY)) return true;
  if (left.lockScope === 'path' || right.lockScope === 'path') {
    const rightPaths = new Set(uniqueWorkspacePaths(right.changedPaths));
    return uniqueWorkspacePaths(left.changedPaths).some((file) => rightPaths.has(file));
  }
  return false;
}

function conflictingAutonomousLockKeys(
  left: {
    lockScope: FrontierCodexAutonomousLockScope;
    lockKeys: readonly string[];
    changedPaths: readonly string[];
  },
  right: {
    lockScope: FrontierCodexAutonomousLockScope;
    lockKeys: readonly string[];
    changedPaths: readonly string[];
  }
): string[] {
  const rightKeys = new Set(right.lockKeys);
  const direct = left.lockKeys.filter((key) => key === AUTONOMOUS_APPLY_REPO_LOCK_KEY || rightKeys.has(key));
  if (direct.length) return uniqueStrings(direct).sort();
  if (left.lockScope === 'repo' || right.lockScope === 'repo') return [AUTONOMOUS_APPLY_REPO_LOCK_KEY];
  if (left.lockScope === 'path' || right.lockScope === 'path') {
    const rightPaths = new Set(uniqueWorkspacePaths(right.changedPaths));
    return uniqueWorkspacePaths(left.changedPaths)
      .filter((file) => rightPaths.has(file))
      .map((file) => `path:${file}`)
      .sort();
  }
  return [];
}

function summarizeAutonomousDecisionProof(decisions: readonly FrontierCodexAutonomousMergeDecision[]): {
  committedDecisionCount: number;
  gatedDecisionCount: number;
  verificationGateCount: number;
  requiredVerificationGateCount: number;
} {
  return {
    committedDecisionCount: decisions.filter((decision) => decision.status === 'committed').length,
    gatedDecisionCount: decisions.filter((decision) => (
      decision.finalGateSummary.required > 0 && decision.finalGateSummary.ok
    )).length,
    verificationGateCount: decisions.reduce((total, decision) => total + decision.verification.run, 0),
    requiredVerificationGateCount: decisions.reduce((total, decision) => total + decision.verification.required, 0)
  };
}

function summarizeAutonomousFinalGateRun(decisions: readonly FrontierCodexAutonomousMergeDecision[]): FrontierCodexAutonomousFinalGateRunSummary {
  const decisionSummaries: FrontierCodexAutonomousFinalGateDecisionSummary[] = decisions.map((decision) => ({
    decisionId: decision.id,
    jobId: decision.jobId,
    ...(decision.taskId ? { taskId: decision.taskId } : {}),
    queueItemIds: [...decision.queueItemIds],
    status: decision.status,
    reason: decision.reason,
    continuation: autonomousDecisionDefersFinalGateToRerun(decision.status),
    ok: decision.finalGateSummary.ok,
    state: decision.finalGateSummary.state,
    planned: decision.finalGateSummary.planned,
    run: decision.finalGateSummary.run,
    required: decision.finalGateSummary.required,
    passed: decision.finalGateSummary.passed,
    failed: decision.finalGateSummary.failed,
    failedRequired: decision.finalGateSummary.failedRequired,
    skipped: decision.finalGateSummary.skipped,
    skippedRequired: decision.finalGateSummary.skippedRequired,
    failedRequiredGateNames: [...decision.finalGateSummary.failedRequiredGateNames],
    skippedRequiredGateNames: [...decision.finalGateSummary.skippedRequiredGateNames]
  }));
  const gates: FrontierCodexAutonomousFinalGateRunEntry[] = decisions.flatMap((decision) => (
    decision.finalGateSummary.gates.map((gate) => ({
      decisionId: decision.id,
      jobId: decision.jobId,
      ...(decision.taskId ? { taskId: decision.taskId } : {}),
      queueItemIds: [...decision.queueItemIds],
      decisionStatus: decision.status,
      continuation: autonomousDecisionDefersFinalGateToRerun(decision.status),
      ...gate,
      command: [...gate.command]
    }))
  ));
  const evaluatedDecisionSummaries = decisionSummaries.filter((decision) => !decision.continuation);
  const continuationDecisionSummaries = decisionSummaries.filter((decision) => decision.continuation);
  const plannedGateCount = sumNumbers(evaluatedDecisionSummaries.map((decision) => decision.planned));
  const failedRequiredGateCount = sumNumbers(evaluatedDecisionSummaries.map((decision) => decision.failedRequired));
  const skippedRequiredGateCount = sumNumbers(evaluatedDecisionSummaries.map((decision) => decision.skippedRequired));
  const continuationGateCount = sumNumbers(continuationDecisionSummaries.map((decision) => decision.planned));
  const continuationRequiredGateCount = sumNumbers(continuationDecisionSummaries.map((decision) => decision.required));
  const continuationSkippedRequiredGateCount = sumNumbers(continuationDecisionSummaries.map((decision) => decision.skippedRequired));
  const state: FrontierCodexAutonomousFinalGateState = plannedGateCount === 0
    ? continuationDecisionSummaries.length > 0
      ? 'continuation'
      : 'not-configured'
    : failedRequiredGateCount > 0
      ? 'failed'
      : skippedRequiredGateCount > 0
        ? 'skipped-required'
        : 'passed';
  return {
    ok: failedRequiredGateCount === 0 && skippedRequiredGateCount === 0,
    state,
    decisionCount: decisions.length,
    evaluatedDecisionCount: evaluatedDecisionSummaries.length,
    continuationDecisionCount: continuationDecisionSummaries.length,
    gatedDecisionCount: evaluatedDecisionSummaries.filter((decision) => decision.required > 0 && decision.ok).length,
    passedDecisionCount: evaluatedDecisionSummaries.filter((decision) => decision.state === 'passed').length,
    failedDecisionCount: evaluatedDecisionSummaries.filter((decision) => decision.failedRequired > 0).length,
    skippedRequiredDecisionCount: evaluatedDecisionSummaries.filter((decision) => decision.skippedRequired > 0).length,
    continuationGateCount,
    continuationRequiredGateCount,
    continuationSkippedRequiredGateCount,
    plannedGateCount,
    runGateCount: sumNumbers(evaluatedDecisionSummaries.map((decision) => decision.run)),
    requiredGateCount: sumNumbers(evaluatedDecisionSummaries.map((decision) => decision.required)),
    passedGateCount: sumNumbers(evaluatedDecisionSummaries.map((decision) => decision.passed)),
    failedGateCount: sumNumbers(evaluatedDecisionSummaries.map((decision) => decision.failed)),
    failedRequiredGateCount,
    skippedGateCount: sumNumbers(evaluatedDecisionSummaries.map((decision) => decision.skipped)),
    skippedRequiredGateCount,
    failedDecisionIds: evaluatedDecisionSummaries.filter((decision) => decision.failedRequired > 0).map((decision) => decision.decisionId),
    skippedRequiredDecisionIds: evaluatedDecisionSummaries.filter((decision) => decision.skippedRequired > 0).map((decision) => decision.decisionId),
    continuationDecisionIds: continuationDecisionSummaries.map((decision) => decision.decisionId),
    continuationGateNames: uniqueStrings(continuationDecisionSummaries.flatMap((decision) => decision.skippedRequiredGateNames)),
    failedRequiredGateNames: uniqueStrings(evaluatedDecisionSummaries.flatMap((decision) => decision.failedRequiredGateNames)),
    skippedRequiredGateNames: uniqueStrings(evaluatedDecisionSummaries.flatMap((decision) => decision.skippedRequiredGateNames)),
    decisions: decisionSummaries,
    gates
  };
}

function autonomousDecisionDefersFinalGateToRerun(status: FrontierCodexAutonomousDecisionStatus): boolean {
  return status === 'rerun' || status === 'conflict-blocked';
}

function sumNumbers(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
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
    lease,
    model: options.model,
    modelPolicy: options.modelPolicy,
    forwardPlanModel: options.forwardPlanModel,
    modelRoutingFeedback: options.modelRoutingFeedback,
    adaptiveModelMin: options.adaptiveModelMin,
    adaptiveModelMax: options.adaptiveModelMax
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
      selectedModel: resourceAllocation.model,
      modelPricing: resourceAllocation.modelPricing,
      routingScore: resourceAllocation.modelRouting?.routingScore,
      routingReasons: resourceAllocation.modelRouting?.reasons,
      modelRouting: resourceAllocation.modelRouting,
      resourceAllocation
    }
  });
  const startedAt = Date.now();
  const execution: FrontierCodexExecutorResult = options.dryRun
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
  const codexRunMetrics = normalizeCodexRunMetrics({
    ...(execution.metrics ?? {}),
    model: normalizeCodexMetricsModel(execution.metrics?.model) ?? resourceAllocation.model ?? job.compute.model ?? FRONTIER_SWARM_CODEX_DEFAULT_MODEL
  });
  const codexCostEstimate = estimateCodexRunCost(codexRunMetrics);
  const collected = await collectJobChangedPaths({
    workspace,
    fileSnapshot,
    workspacePlan,
    executionChangedPaths: execution.changedPaths,
    collectGitStatus: options.collectGitStatus,
    ignoreGeneratedFailedEvidencePaths: execution.exitCode !== 0
  });
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
  const generatedFailedEvidence = collected.generatedFailedEvidencePaths.length
    ? {
      source: 'frontier.swarm-codex.generated-failed-evidence',
      reason: 'patch-reject-leftover',
      paths: [...collected.generatedFailedEvidencePaths]
    }
    : undefined;
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
      codexRunMetrics,
      codexCostEstimate,
      ...(generatedFailedEvidence ? { generatedFailedEvidence } : {}),
      ...(semanticImport ? { semanticImport: semanticImport.sidecar.summary } : {}),
      codexHandoffArtifacts: handoffArtifacts
    }
  };
  const sourceTask = createCodexRerunSourceTaskMetadata(job);
  const mergeMetadata = {
    [FRONTIER_SWARM_CODEX_METADATA_KEY]: {
      sourceTask
    },
    ...(codexRunMetrics.hasTokenUsage ? { codexRunMetrics, codexCostEstimate } : {}),
    ...(generatedFailedEvidence ? { generatedFailedEvidence } : {}),
    ...(semanticImport ? { semanticImport: semanticImport.sidecar.summary } : {})
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
    ...(Object.keys(mergeMetadata).length ? { metadata: mergeMetadata } : {})
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
  const records: FrontierCodexSemanticImportRecord[] = [];
  const importPath = path.join(input.evidenceDir, 'semantic-imports.json');
  try {
    const selection = selectSemanticImportPaths(input.changedPaths, options);
    const selected = selection.selected;
    const importable: SemanticImportImportablePath[] = [];
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
      importable.push({ ...file, absolute, bytes: stat.size });
    }
    if (!importable.length) {
      return await finalizeCodexSemanticImportSidecar(input.job, importPath, records, selection);
    }
    const api = await loadFrontierLangForSemanticImport();
    if (!api.ok) {
      for (const file of importable) {
        records.push({
          path: file.path,
          language: file.language,
          status: 'error',
          reason: 'frontier-lang-unavailable',
          bytes: file.bytes,
          error: formatSemanticImportError(api.error)
        });
      }
      return await finalizeCodexSemanticImportSidecar(input.job, importPath, records, selection);
    }
    for (const file of importable) {
      try {
        const sourceRead = await readSemanticImportSource(file.absolute, options.maxBytes, file.bytes);
        if (!sourceRead.ok) {
          records.push({
            path: file.path,
            language: file.language,
            status: 'skipped',
            reason: sourceRead.reason,
            bytes: sourceRead.bytes
          });
          continue;
        }
        const importResult = api.importNativeSource({
          language: file.language,
          sourcePath: file.path,
          sourceText: sourceRead.sourceText,
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
          bytes: sourceRead.bytes,
          importId: semanticImportString(importResult?.id),
          universalAstHash: semanticImportUniversalAstHash(api, importResult?.universalAst),
          nativeAstId: semanticImportString(importResult?.nativeAst?.id),
          nativeSourceId: semanticImportString(importResult?.nativeSource?.id),
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
          bytes: file.bytes,
          error: formatSemanticImportError(error)
        });
      }
    }
    return await finalizeCodexSemanticImportSidecar(input.job, importPath, records, selection);
  } catch (error) {
    const selection = createEmptySemanticImportSelection(options);
    records.push({
      path: '<semantic-import>',
      status: 'error',
      reason: 'semantic-import-failed',
      error: formatSemanticImportError(error)
    });
    return await finalizeCodexSemanticImportSidecar(input.job, importPath, records, selection);
  }
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
  const supported = SUPPORTED_CODEX_MODEL_BY_NORMALIZED.get(normalized);
  if (!supported) {
    throw new Error(
      `unsupported Codex model "${value}"; supported models: ${FRONTIER_SWARM_CODEX_SUPPORTED_MODELS.join(', ')}. ` +
      'Use default/config-default or omit --model to use the local Codex config.'
    );
  }
  return supported;
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

export async function loadCodexModelRoutingFeedback(
  paths: readonly string[] | undefined,
  input: { cwd?: string } = {}
): Promise<FrontierCodexModelRoutingFeedbackSummary | undefined> {
  const resolved = uniqueStrings(paths ?? []);
  if (!resolved.length) return undefined;
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const artifacts: unknown[] = [];
  for (const rawPath of resolved) {
    const file = path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath);
    const text = await fs.readFile(file, 'utf8');
    artifacts.push(parseCodexModelRoutingFeedbackArtifact(text, file));
  }
  return normalizeCodexModelRoutingFeedback(artifacts);
}

export function normalizeCodexModelRoutingFeedback(input: FrontierCodexModelRoutingFeedbackInput): FrontierCodexModelRoutingFeedbackSummary {
  if (isCodexModelRoutingFeedbackSummary(input)) return input;
  const signals: FrontierCodexModelRoutingFeedbackSignal[] = [];
  collectCodexModelRoutingFeedbackSignals(input, undefined, signals);
  const lowerCount = signals.filter((signal) => signal.recommendation === 'lower').length;
  const sameCount = signals.filter((signal) => signal.recommendation === 'same').length;
  const higherCount = signals.filter((signal) => signal.recommendation === 'higher').length;
  const weighted = signals.reduce((sum, signal) => sum + modelRoutingDirectionValue(signal.recommendation) * signal.confidence, 0);
  const totalConfidence = signals.reduce((sum, signal) => sum + signal.confidence, 0);
  const averageConfidence = signals.length ? totalConfidence / signals.length : 0;
  const directionalConfidence = totalConfidence > 0 ? Math.abs(weighted) / totalConfidence : 0;
  const recommendation: FrontierCodexModelRoutingRecommendation = weighted > 0.05
    ? 'higher'
    : weighted < -0.05
      ? 'lower'
      : 'same';
  const confidence = roundRoutingNumber(directionalConfidence * averageConfidence);
  const score = roundRoutingNumber(weighted);
  const reasons = uniqueStrings(signals.map((signal) => signal.reason));
  return {
    kind: FRONTIER_SWARM_CODEX_MODEL_ROUTING_FEEDBACK_KIND,
    version: FRONTIER_SWARM_CODEX_MODEL_ROUTING_FEEDBACK_VERSION,
    recommendation,
    confidence,
    score,
    signals,
    reasons,
    summary: {
      signalCount: signals.length,
      sourceCount: new Set(signals.map((signal) => signal.source)).size,
      lowerCount,
      sameCount,
      higherCount
    }
  };
}

export function resolveCodexModelRouting(
  job: FrontierSwarmJob,
  input: Pick<FrontierCodexSwarmRunOptions,
    | 'model'
    | 'modelPolicy'
    | 'forwardPlanModel'
    | 'modelRoutingFeedback'
    | 'adaptiveModelMin'
    | 'adaptiveModelMax'
  > = {}
): FrontierCodexModelRoutingDecision {
  const explicit = normalizeCodexModelFlag(input.model);
  if (explicit || input.model === false) {
    return createCodexModelRoutingDecision({
      policy: 'explicit',
      forwarded: !!explicit,
      baseModel: normalizeCodexMetricsModel(job.compute.model ?? FRONTIER_SWARM_CODEX_DEFAULT_MODEL),
      selectedModel: explicit,
      recommendation: 'same',
      confidence: explicit ? 1 : 0,
      routingScore: 0,
      reasons: explicit
        ? [`Explicit model ${explicit} was requested for this job.`]
        : ['Model forwarding was explicitly disabled for this job.'],
      hardCaps: { applied: [] }
    });
  }

  const policy = input.modelPolicy ?? (input.forwardPlanModel ? 'plan' : 'config-default');
  if (policy === 'config-default') {
    const baseModel = normalizeCodexMetricsModel(job.compute.model ?? FRONTIER_SWARM_CODEX_DEFAULT_MODEL);
    return createCodexModelRoutingDecision({
      policy,
      forwarded: false,
      baseModel,
      selectedModel: baseModel,
      recommendation: 'same',
      confidence: 0,
      routingScore: 0,
      reasons: ['The local Codex config owns model selection because model policy is config-default.'],
      hardCaps: { applied: [] }
    });
  }
  const baseModel = normalizeCodexModelFlag(job.compute.model ?? FRONTIER_SWARM_CODEX_DEFAULT_MODEL) ?? FRONTIER_SWARM_CODEX_DEFAULT_MODEL;
  if (policy === 'plan' || policy === 'explicit') {
    return createCodexModelRoutingDecision({
      policy,
      forwarded: policy === 'plan',
      baseModel,
      selectedModel: policy === 'plan' ? baseModel : undefined,
      recommendation: 'same',
      confidence: policy === 'plan' ? 1 : 0,
      routingScore: 0,
      reasons: policy === 'plan'
        ? [`Planned model ${baseModel} is forwarded because model policy is plan.`]
        : ['Model policy is explicit, but no explicit model override was provided.'],
      hardCaps: { applied: [] }
    });
  }
  return resolveAdaptiveCodexModelRouting(job, input, baseModel);
}

function resolveCodexModelFlag(
  job: FrontierSwarmJob,
  input: FrontierCodexSwarmRunOptions
): string | undefined {
  const decision = resolveCodexModelRouting(job, input);
  return decision.forwarded ? decision.selectedModel : undefined;
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
  if (policy === 'adaptive') {
    const decision = resolveCodexModelRouting(job, input);
    if (!decision.forwarded) return undefined;
    const selectedRank = codexAdaptiveModelRank(decision.selectedModel);
    const baseRank = codexAdaptiveModelRank(decision.baseModel);
    if (selectedRank !== undefined && baseRank !== undefined && selectedRank < baseRank) return 'medium';
    return job.compute.reasoningEffort ?? FRONTIER_SWARM_CODEX_DEFAULT_REASONING_EFFORT;
  }
  if (policy !== 'plan') return undefined;
  const effort = job.compute.reasoningEffort ?? FRONTIER_SWARM_CODEX_DEFAULT_REASONING_EFFORT;
  return effort ? String(effort).trim() : undefined;
}

function parseCodexModelRoutingFeedbackArtifact(text: string, file: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch {
    const records: unknown[] = [];
    for (const [index, line] of trimmed.split(/\r?\n/).entries()) {
      const entry = line.trim();
      if (!entry) continue;
      try {
        records.push(JSON.parse(entry));
      } catch (error) {
        throw new Error(`invalid model routing feedback JSON in ${file}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return records;
  }
}

function isCodexModelRoutingFeedbackSummary(value: unknown): value is FrontierCodexModelRoutingFeedbackSummary {
  return isObject(value)
    && value.kind === FRONTIER_SWARM_CODEX_MODEL_ROUTING_FEEDBACK_KIND
    && value.version === FRONTIER_SWARM_CODEX_MODEL_ROUTING_FEEDBACK_VERSION
    && (value.recommendation === 'lower' || value.recommendation === 'same' || value.recommendation === 'higher')
    && Array.isArray(value.signals);
}

function collectCodexModelRoutingFeedbackSignals(
  value: unknown,
  sourceHint: string | undefined,
  signals: FrontierCodexModelRoutingFeedbackSignal[],
  depth = 0
): void {
  if (depth > 5 || value == null) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectCodexModelRoutingFeedbackSignals(entry, sourceHint, signals, depth + 1);
    return;
  }
  if (!isObject(value)) return;
  if (isCodexModelRoutingFeedbackSummary(value)) {
    signals.push(...value.signals);
    return;
  }
  const source = normalizeModelRoutingSource(value, sourceHint);
  const signal = normalizeCodexModelRoutingSignal(value, source);
  if (signal) signals.push(signal);
  for (const key of [
    'tournament',
    'tournaments',
    'rsi',
    'feedback',
    'modelFeedback',
    'modelRoutingFeedback',
    'routingFeedback',
    'signals',
    'items',
    'results',
    'records',
    'recommendations',
    'artifacts',
    'entries'
  ]) {
    if (value[key] !== undefined) collectCodexModelRoutingFeedbackSignals(value[key], source, signals, depth + 1);
  }
}

function normalizeCodexModelRoutingSignal(
  value: Record<string, unknown>,
  source: string
): FrontierCodexModelRoutingFeedbackSignal | undefined {
  const explicit = normalizeModelRoutingRecommendation(readFirstString(
    value.recommendation,
    value.direction,
    value.recommendedDirection,
    value.modelRecommendation,
    value.action,
    value.tier,
    value.recommendedTier
  ));
  const winnerModel = readFirstString(value.winnerModel, value.winningModel, value.winner, value.bestModel, value.best);
  const loserModel = readFirstString(value.loserModel, value.losingModel, value.loser, value.baselineModel, value.baseline, value.previousModel);
  const recommendedModel = readFirstString(value.recommendedModel, value.model, value.selectedModel, value.targetModel);
  const baselineModel = readFirstString(value.baselineModel, value.baseline, value.currentModel, value.previousModel);
  const tournamentRecommendation = inferTournamentModelRecommendation(winnerModel ?? recommendedModel, loserModel ?? baselineModel);
  const rsiRecommendation = inferRsiModelRecommendation(value, source);
  const recommendation = explicit ?? tournamentRecommendation ?? rsiRecommendation;
  if (!recommendation) return undefined;
  const confidence = readRoutingConfidence(value, source);
  const score = readRoutingScore(value);
  const model = recommendedModel ?? winnerModel;
  const reason = readFirstString(value.reason, value.explanation, value.summary, value.message)
    ?? defaultModelRoutingFeedbackReason(source, recommendation, confidence, model);
  return {
    source,
    recommendation,
    confidence,
    reason,
    ...(model ? { model } : {}),
    ...(baselineModel ? { baselineModel } : {}),
    ...(winnerModel ? { winnerModel } : {}),
    ...(loserModel ? { loserModel } : {}),
    ...(score !== undefined ? { score } : {})
  };
}

function normalizeModelRoutingSource(value: Record<string, unknown>, sourceHint: string | undefined): string {
  const explicit = readFirstString(value.source, value.kind, value.type, value.artifactKind);
  const source = explicit ?? sourceHint ?? 'feedback';
  const normalized = source.toLowerCase();
  if (normalized.includes('tournament')) return 'tournament';
  if (normalized === 'rsi' || normalized.includes('rsi')) return 'rsi';
  return source;
}

function normalizeModelRoutingRecommendation(value: string | undefined): FrontierCodexModelRoutingRecommendation | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replaceAll('_', '-');
  if (['lower', 'downgrade', 'down', 'cheaper', 'cheap', 'mini', 'smaller', 'save', 'cost-saving', 'cost-saving-model'].includes(normalized)) return 'lower';
  if (['higher', 'upgrade', 'up', 'deeper', 'deep', 'larger', 'quality', 'quality-model', 'escalate'].includes(normalized)) return 'higher';
  if (['same', 'keep', 'hold', 'neutral', 'no-change', 'unchanged', 'baseline'].includes(normalized)) return 'same';
  return undefined;
}

function inferTournamentModelRecommendation(
  winnerModel: string | undefined,
  loserModel: string | undefined
): FrontierCodexModelRoutingRecommendation | undefined {
  const winnerRank = codexAdaptiveModelRank(winnerModel);
  const loserRank = codexAdaptiveModelRank(loserModel);
  if (winnerRank === undefined || loserRank === undefined) return undefined;
  if (winnerRank < loserRank) return 'lower';
  if (winnerRank > loserRank) return 'higher';
  return 'same';
}

function inferRsiModelRecommendation(
  value: Record<string, unknown>,
  source: string
): FrontierCodexModelRoutingRecommendation | undefined {
  if (source !== 'rsi') return undefined;
  const qualityRisk = readRoutingUnitNumber(value.qualityRisk, value.failureRisk, value.regressionRisk, value.errorRate);
  if (qualityRisk !== undefined && qualityRisk >= 0.65) return 'higher';
  const rsi = readRoutingUnitNumber(
    value.rsi,
    value.relativeSavingsIndex,
    value.resourceSavingsIndex,
    value.routingSavingsIndex,
    value.costPressure,
    value.savingsPressure,
    value.score
  );
  if (rsi === undefined) return undefined;
  if (rsi >= 0.65) return 'lower';
  if (rsi <= 0.35) return 'higher';
  return 'same';
}

function readRoutingConfidence(value: Record<string, unknown>, source: string): number {
  const direct = readRoutingUnitNumber(value.confidence, value.probability, value.weight, value.winRate, value.win_rate);
  if (direct !== undefined) return direct;
  if (source === 'tournament') return 0.7;
  if (source === 'rsi') return 0.6;
  return 0.5;
}

function readRoutingScore(value: Record<string, unknown>): number | undefined {
  const direct = readRoutingSignedNumber(value.routingScore, value.scoreDelta, value.delta, value.margin);
  return direct === undefined ? undefined : roundRoutingNumber(direct);
}

function readRoutingUnitNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = parseRoutingNumber(value);
    if (parsed === undefined) continue;
    return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
  }
  return undefined;
}

function readRoutingSignedNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = parseRoutingNumber(value);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function parseRoutingNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() ? Number(value.trim()) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function defaultModelRoutingFeedbackReason(
  source: string,
  recommendation: FrontierCodexModelRoutingRecommendation,
  confidence: number,
  model: string | undefined
): string {
  const modelText = model ? ` toward ${model}` : '';
  return `${source} feedback recommends ${recommendation} model routing${modelText} with ${Math.round(confidence * 100)}% confidence.`;
}

function resolveAdaptiveCodexModelRouting(
  job: FrontierSwarmJob,
  input: Pick<FrontierCodexSwarmRunOptions, 'modelRoutingFeedback' | 'adaptiveModelMin' | 'adaptiveModelMax'>,
  baseModel: string
): FrontierCodexModelRoutingDecision {
  const feedback = input.modelRoutingFeedback === undefined
    ? undefined
    : normalizeCodexModelRoutingFeedback(input.modelRoutingFeedback);
  const risk = scoreCodexAdaptiveJobRisk(job);
  const minModel = normalizeAdaptiveModelCap(input.adaptiveModelMin);
  const maxModel = normalizeAdaptiveModelCap(input.adaptiveModelMax);
  const minRank = minModel ? codexAdaptiveModelRank(minModel) : 0;
  const maxRank = maxModel ? codexAdaptiveModelRank(maxModel) : FRONTIER_SWARM_CODEX_ADAPTIVE_MODEL_LADDER.length - 1;
  if (minRank !== undefined && maxRank !== undefined && minRank > maxRank) {
    throw new Error(`adaptive model min ${minModel} cannot rank above max ${maxModel}`);
  }
  const feedbackScore = feedback?.summary.signalCount
    ? modelRoutingDirectionValue(feedback.recommendation) * Math.max(0.15, feedback.confidence) * 0.6
    : 0;
  const routingScore = roundRoutingNumber(risk.score + feedbackScore);
  const recommendation: FrontierCodexModelRoutingRecommendation = routingScore >= 0.25
    ? 'higher'
    : routingScore <= -0.2
      ? 'lower'
      : 'same';
  const baseRank = codexAdaptiveModelRank(baseModel);
  const targetRank = baseRank === undefined
    ? undefined
    : recommendation === 'higher'
      ? findHigherAdaptiveModelRank(baseRank)
      : recommendation === 'lower'
        ? findLowerAdaptiveModelRank(baseRank)
        : baseRank;
  const capped = applyAdaptiveModelCaps(targetRank ?? baseRank, minRank, maxRank);
  const selectedModel = capped.rank === undefined ? baseModel : FRONTIER_SWARM_CODEX_ADAPTIVE_MODEL_LADDER[capped.rank];
  const reasons = uniqueStrings([
    ...risk.reasons,
    feedback?.summary.signalCount
      ? `Feedback recommends ${feedback.recommendation} routing with ${Math.round(feedback.confidence * 100)}% confidence.`
      : 'No model-routing feedback artifact was provided.',
    recommendation === 'lower'
      ? 'Adaptive routing found this job eligible for a lower-cost model.'
      : recommendation === 'higher'
        ? 'Adaptive routing found this job risky enough to use a deeper model.'
        : 'Adaptive routing kept the planned model after scoring risk and feedback.',
    ...capped.reasons,
    ...priceComparisonReasons(baseModel, selectedModel)
  ]);
  return createCodexModelRoutingDecision({
    policy: 'adaptive',
    forwarded: true,
    baseModel,
    selectedModel,
    recommendation,
    confidence: Math.max(Math.abs(routingScore), feedback?.confidence ?? 0),
    routingScore,
    reasons,
    hardCaps: {
      ...(minModel ? { minModel } : {}),
      ...(maxModel ? { maxModel } : {}),
      applied: capped.applied
    },
    ...(feedback ? { feedback } : {})
  });
}

function createCodexModelRoutingDecision(input: {
  policy: FrontierCodexModelPolicy;
  forwarded: boolean;
  baseModel?: string;
  selectedModel?: string;
  recommendation: FrontierCodexModelRoutingRecommendation;
  confidence: number;
  routingScore: number;
  reasons: readonly string[];
  hardCaps: FrontierCodexModelRoutingDecision['hardCaps'];
  feedback?: FrontierCodexModelRoutingFeedbackSummary;
}): FrontierCodexModelRoutingDecision {
  const pricing = getCodexModelPricing(input.selectedModel);
  return {
    policy: input.policy,
    forwarded: input.forwarded,
    ...(input.baseModel ? { baseModel: input.baseModel } : {}),
    ...(input.selectedModel ? { selectedModel: input.selectedModel } : {}),
    recommendation: input.recommendation,
    confidence: roundRoutingNumber(Math.max(0, Math.min(1, input.confidence))),
    routingScore: roundRoutingNumber(input.routingScore),
    reasons: uniqueStrings([...input.reasons]),
    hardCaps: input.hardCaps,
    ...(pricing ? { pricing } : {}),
    ...(input.feedback ? { feedback: input.feedback } : {})
  };
}

function scoreCodexAdaptiveJobRisk(job: FrontierSwarmJob): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const changedSurfaceCount = uniqueStrings([...job.task.targetRefs, ...job.allowedWrites, ...job.ownedRegions, ...job.changedRegions]).length;
  const searchText = [
    job.id,
    job.title,
    job.task.objective,
    job.task.description,
    job.task.workKind,
    job.lane,
    job.layer,
    ...job.tags,
    ...job.task.tags,
    metadataSearchText(job.metadata),
    metadataSearchText(job.task.metadata)
  ].join(' ').toLowerCase();
  if (/\b(high-risk|risk-high|dangerous|security|auth|release|publish|migration|codec|wire-format|corruption|destructive|cross-package|multi-surface|conflict|merge)\b/.test(searchText)) {
    score += 0.5;
    reasons.push('Risk terms in the task metadata favor a deeper model.');
  }
  if (job.review.alwaysReview || job.review.requiredReviewers > 0) {
    score += 0.3;
    reasons.push('Review policy requires extra scrutiny, so adaptive routing raises model depth.');
  }
  if (changedSurfaceCount >= 4) {
    score += 0.2;
    reasons.push('The job touches several declared surfaces, increasing routing risk.');
  }
  if (job.resourceRequirements?.browser?.required) {
    score += 0.1;
    reasons.push('Browser resources make the job less deterministic than a pure source edit.');
  }
  if (/\b(simple|typo|docs?|readme|smoke|small|single-file|low-risk|narrow)\b/.test(searchText) || changedSurfaceCount <= 1) {
    score -= 0.45;
    reasons.push('The job is narrow enough for a lower-cost model candidate.');
  }
  if (job.budget?.maxCostUsd !== undefined && job.budget.maxCostUsd <= 0.25) {
    score -= 0.15;
    reasons.push('The job has a tight cost budget, so adaptive routing favors lower unit pricing.');
  }
  return { score: roundRoutingNumber(score), reasons };
}

function metadataSearchText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value).slice(0, 4096);
  } catch {
    return '';
  }
}

function normalizeAdaptiveModelCap(model: string | undefined): string | undefined {
  if (model === undefined) return undefined;
  const normalized = normalizeCodexModelFlag(model);
  if (!normalized) return undefined;
  if (codexAdaptiveModelRank(normalized) === undefined) {
    throw new Error(`adaptive model cap ${model} is not in the adaptive model ladder: ${FRONTIER_SWARM_CODEX_ADAPTIVE_MODEL_LADDER.join(', ')}`);
  }
  return normalized;
}

function applyAdaptiveModelCaps(
  rank: number | undefined,
  minRank: number | undefined,
  maxRank: number | undefined
): { rank: number | undefined; applied: string[]; reasons: string[] } {
  if (rank === undefined) return { rank, applied: [], reasons: [] };
  let capped = rank;
  const applied: string[] = [];
  const reasons: string[] = [];
  if (minRank !== undefined && capped < minRank) {
    capped = minRank;
    applied.push('min');
    reasons.push(`Hard minimum model cap kept routing at or above ${FRONTIER_SWARM_CODEX_ADAPTIVE_MODEL_LADDER[minRank]}.`);
  }
  if (maxRank !== undefined && capped > maxRank) {
    capped = maxRank;
    applied.push('max');
    reasons.push(`Hard maximum model cap kept routing at or below ${FRONTIER_SWARM_CODEX_ADAPTIVE_MODEL_LADDER[maxRank]}.`);
  }
  return { rank: capped, applied, reasons };
}

function priceComparisonReasons(baseModel: string | undefined, selectedModel: string | undefined): string[] {
  if (!baseModel || !selectedModel || baseModel === selectedModel) return [];
  const basePricing = getCodexModelPricing(baseModel);
  const selectedPricing = getCodexModelPricing(selectedModel);
  if (!basePricing || !selectedPricing) return [];
  const baseUnit = basePricing.inputUsdPerUnit + basePricing.outputUsdPerUnit;
  const selectedUnit = selectedPricing.inputUsdPerUnit + selectedPricing.outputUsdPerUnit;
  if (selectedUnit < baseUnit) return [`Selected ${selectedModel} because catalog unit pricing is lower than ${baseModel}.`];
  if (selectedUnit > baseUnit) return [`Selected ${selectedModel} despite higher catalog unit pricing because risk scoring favored quality.`];
  return [`Selected ${selectedModel}; catalog unit pricing matches ${baseModel}.`];
}

function findLowerAdaptiveModelRank(baseRank: number): number {
  for (let index = baseRank - 1; index >= 0; index -= 1) {
    if (getCodexModelPricing(FRONTIER_SWARM_CODEX_ADAPTIVE_MODEL_LADDER[index])) return index;
  }
  return Math.max(0, baseRank - 1);
}

function findHigherAdaptiveModelRank(baseRank: number): number {
  return Math.min(FRONTIER_SWARM_CODEX_ADAPTIVE_MODEL_LADDER.length - 1, baseRank + 1);
}

function codexAdaptiveModelRank(model: string | null | undefined): number | undefined {
  const normalized = normalizeCodexMetricsModel(model)?.toLowerCase();
  if (!normalized) return undefined;
  const index = FRONTIER_SWARM_CODEX_ADAPTIVE_MODEL_LADDER.findIndex((entry) => entry.toLowerCase() === normalized);
  return index >= 0 ? index : undefined;
}

function modelRoutingDirectionValue(recommendation: FrontierCodexModelRoutingRecommendation): number {
  if (recommendation === 'lower') return -1;
  if (recommendation === 'higher') return 1;
  return 0;
}

function roundRoutingNumber(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function getCodexModelPricing(model: string | null | undefined): FrontierCodexModelPricing | undefined {
  const key = normalizeCodexPricingModelKey(model);
  return key ? FRONTIER_SWARM_CODEX_MODEL_PRICING[key] : undefined;
}

export function normalizeCodexRunMetrics(input: FrontierCodexRunMetricsInput = {}): FrontierCodexRunMetrics {
  const usage = isObject(input.usage) ? input.usage : {};
  const metadata = isObject(input.metadata) ? input.metadata : {};
  const model = normalizeCodexMetricsModel(
    input.model
      ?? readStringField(usage, ['model'])
      ?? readStringField(metadata, ['model'])
  );
  const directInputTokens = tokenCount(input.inputTokens)
    ?? readNumberField(usage, ['inputTokens', 'input_tokens', 'promptTokens', 'prompt_tokens'])
    ?? readNumberField(metadata, ['inputTokens', 'input_tokens']);
  const directCachedInputTokens = tokenCount(input.cachedInputTokens)
    ?? readNumberField(usage, ['cachedInputTokens', 'cached_input_tokens', 'inputCachedTokens', 'input_cached_tokens', 'promptCachedTokens', 'prompt_cached_tokens'])
    ?? readNestedNumberField(usage, [
      ['inputTokenDetails', 'cachedTokens'],
      ['input_token_details', 'cached_tokens'],
      ['input_tokens_details', 'cached_tokens'],
      ['promptTokenDetails', 'cachedTokens'],
      ['prompt_token_details', 'cached_tokens'],
      ['prompt_tokens_details', 'cached_tokens']
    ])
    ?? readNumberField(metadata, ['cachedInputTokens', 'cached_input_tokens']);
  const directUncachedInputTokens = tokenCount(input.uncachedInputTokens)
    ?? readNumberField(usage, ['uncachedInputTokens', 'uncached_input_tokens', 'inputUncachedTokens', 'input_uncached_tokens'])
    ?? readNumberField(metadata, ['uncachedInputTokens', 'uncached_input_tokens']);
  const directOutputTokens = tokenCount(input.outputTokens)
    ?? readNumberField(usage, ['outputTokens', 'output_tokens', 'completionTokens', 'completion_tokens'])
    ?? readNumberField(metadata, ['outputTokens', 'output_tokens']);
  const explicitTotalTokens = tokenCount(input.totalTokens)
    ?? readNumberField(usage, ['totalTokens', 'total_tokens'])
    ?? readNumberField(metadata, ['totalTokens', 'total_tokens']);
  const derivedOutputTokens = directOutputTokens === undefined && explicitTotalTokens !== undefined && directInputTokens !== undefined
    ? Math.max(0, explicitTotalTokens - directInputTokens)
    : undefined;
  const outputTokens = directOutputTokens ?? derivedOutputTokens ?? 0;
  const outputTokensKnown = directOutputTokens !== undefined || derivedOutputTokens !== undefined;
  const derivedInputTokens = directInputTokens === undefined && explicitTotalTokens !== undefined && outputTokensKnown
    ? Math.max(0, explicitTotalTokens - outputTokens)
    : undefined;
  const componentInputTokens = directInputTokens === undefined && derivedInputTokens === undefined && (directCachedInputTokens !== undefined || directUncachedInputTokens !== undefined)
    ? (directCachedInputTokens ?? 0) + (directUncachedInputTokens ?? 0)
    : undefined;
  const inputTokens = directInputTokens ?? derivedInputTokens ?? componentInputTokens ?? 0;
  const inputTokensKnown = directInputTokens !== undefined || derivedInputTokens !== undefined || componentInputTokens !== undefined;
  const cachedInputTokens = directCachedInputTokens ?? (
    inputTokensKnown && directUncachedInputTokens !== undefined
      ? Math.max(0, inputTokens - directUncachedInputTokens)
      : 0
  );
  const cachedInputTokensKnown = directCachedInputTokens !== undefined || (inputTokensKnown && directUncachedInputTokens !== undefined);
  const uncachedInputTokens = directUncachedInputTokens ?? (
    inputTokensKnown
      ? Math.max(0, inputTokens - cachedInputTokens)
      : 0
  );
  const uncachedInputTokensKnown = directUncachedInputTokens !== undefined || (inputTokensKnown && directCachedInputTokens !== undefined);
  const totalTokens = explicitTotalTokens ?? inputTokens + outputTokens;
  const totalTokensKnown = explicitTotalTokens !== undefined || (inputTokensKnown && outputTokensKnown);
  const hasTokenUsage = inputTokens > 0 || cachedInputTokens > 0 || uncachedInputTokens > 0 || outputTokens > 0 || totalTokens > 0;
  const missingTokenFields = hasTokenUsage
    ? [
      !inputTokensKnown ? 'inputTokens' : undefined,
      !outputTokensKnown ? 'outputTokens' : undefined
    ].filter((value): value is string => !!value)
    : [];
  return {
    ...(model ? { model } : {}),
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    totalTokens,
    hasTokenUsage,
    inputTokensKnown,
    cachedInputTokensKnown,
    uncachedInputTokensKnown,
    outputTokensKnown,
    totalTokensKnown,
    tokenBreakdownComplete: hasTokenUsage && inputTokensKnown && outputTokensKnown,
    missingTokenFields
  };
}

export function estimateCodexRunCost(metrics: FrontierCodexRunMetricsInput | FrontierCodexRunMetrics): FrontierCodexRunCostEstimate {
  const normalized = 'hasTokenUsage' in metrics ? metrics : normalizeCodexRunMetrics(metrics);
  const base = {
    ...(normalized.model ? { model: normalized.model } : {}),
    currency: 'USD' as const,
    unitTokens: FRONTIER_SWARM_CODEX_MODEL_PRICING_UNIT_TOKENS,
    source: FRONTIER_SWARM_CODEX_MODEL_PRICING_SOURCE,
    sourceCheckedAt: FRONTIER_SWARM_CODEX_MODEL_PRICING_SOURCE_CHECKED_AT,
    inputTokens: normalized.inputTokens,
    cachedInputTokens: normalized.cachedInputTokens,
    uncachedInputTokens: normalized.uncachedInputTokens,
    outputTokens: normalized.outputTokens,
    totalTokens: normalized.totalTokens
  };
  if (!normalized.hasTokenUsage) {
    return { ...base, estimated: false, reason: 'missing-token-usage' };
  }
  if (!normalized.model) {
    return { ...base, estimated: false, reason: 'missing-model' };
  }
  const pricing = getCodexModelPricing(normalized.model);
  if (!pricing) {
    return { ...base, estimated: false, reason: 'unknown-model-pricing' };
  }
  const missingInputTokens = normalized.inputTokensKnown === false || normalized.missingTokenFields?.includes('inputTokens');
  const missingOutputTokens = normalized.outputTokensKnown === false || normalized.missingTokenFields?.includes('outputTokens');
  const uncachedInputCostUsd = roundUsd(normalized.uncachedInputTokens * pricing.inputUsdPerUnit / pricing.unitTokens);
  const cachedInputCostUsd = roundUsd(normalized.cachedInputTokens * pricing.cachedInputUsdPerUnit / pricing.unitTokens);
  const inputCostUsd = roundUsd(uncachedInputCostUsd + cachedInputCostUsd);
  const outputCostUsd = roundUsd(normalized.outputTokens * pricing.outputUsdPerUnit / pricing.unitTokens);
  const pricedBase = {
    ...base,
    pricingModel: pricing.model,
    pricing,
    ...(!missingInputTokens ? { uncachedInputCostUsd, cachedInputCostUsd, inputCostUsd } : {}),
    ...(!missingOutputTokens ? { outputCostUsd } : {})
  };
  if (missingInputTokens && missingOutputTokens) {
    return { ...pricedBase, estimated: false, reason: 'missing-token-breakdown' };
  }
  if (missingInputTokens) {
    return { ...pricedBase, estimated: false, reason: 'missing-input-tokens' };
  }
  if (missingOutputTokens) {
    return { ...pricedBase, estimated: false, reason: 'missing-output-tokens' };
  }
  return {
    ...pricedBase,
    estimated: true,
    estimatedCostUsd: roundUsd(inputCostUsd + outputCostUsd)
  };
}

export function createCodexResourceAllocation(
  job: FrontierSwarmJob,
  input: {
    cwd?: string;
    outDir: string;
    workspacePath?: string;
    lease?: FrontierSwarmLease;
    model?: string | false;
    modelPolicy?: FrontierCodexModelPolicy;
    forwardPlanModel?: boolean;
    modelRoutingFeedback?: FrontierCodexModelRoutingFeedbackInput;
    adaptiveModelMin?: string;
    adaptiveModelMax?: string;
  }
): FrontierCodexResourceAllocation {
  const requirements = job.resourceRequirements;
  const capabilities = uniqueStrings([...(job.capabilities ?? []), ...(requirements?.capabilities ?? [])]);
  const resources = { ...(requirements?.resources ?? {}) };
  const modelRouting = resolveCodexModelRouting(job, input);
  const model = modelRouting.selectedModel;
  const modelPricing = getCodexModelPricing(model);
  const env: Record<string, string> = {
    FRONTIER_SWARM_JOB_ID: job.id,
    FRONTIER_SWARM_TASK_ID: job.taskId,
    FRONTIER_SWARM_LANE: job.lane,
    FRONTIER_SWARM_CAPABILITIES: capabilities.join(',')
  };
  if (model) env.FRONTIER_SWARM_CODEX_MODEL = model;
  env.FRONTIER_SWARM_CODEX_MODEL_POLICY = modelRouting.policy;
  env.FRONTIER_SWARM_CODEX_MODEL_ROUTING_SCORE = String(modelRouting.routingScore);
  env.FRONTIER_SWARM_CODEX_MODEL_ROUTING_RECOMMENDATION = modelRouting.recommendation;
  const baseAllocation = {
    capabilities,
    resources,
    env,
    ...(model ? { model } : {}),
    ...(modelPricing ? { modelPricing } : {}),
    ...(!modelPricing ? { modelPricingUnknownReason: model ? 'unknown-model-pricing' as const : 'missing-model' as const } : {}),
    modelRouting
  };
  const browser = requirements?.browser;
  if (!browser) {
    env.FRONTIER_SWARM_RESOURCE_ALLOCATION = JSON.stringify({
      capabilities,
      resources,
      ...(model ? { model } : {}),
      ...(modelPricing ? { modelPricing } : {}),
      modelRouting
    });
    return baseAllocation;
  }
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
  env.FRONTIER_SWARM_RESOURCE_ALLOCATION = JSON.stringify({
    capabilities,
    resources,
    ...(model ? { model } : {}),
    ...(modelPricing ? { modelPricing } : {}),
    modelRouting,
    browser: browserAllocation
  });
  return {
    ...baseAllocation,
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
    '## Human Question Contract',
    '',
    ...bullets(CODEX_WORKER_HUMAN_QUESTION_CONTRACT),
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
  await fs.mkdir(path.dirname(input.paths.eventsPath), { recursive: true });
  await fs.mkdir(path.dirname(input.paths.stderrPath), { recursive: true });
  const eventMetrics = codexEventMetrics();
  const completedTurn = codexTurnCompletionDetector();
  const eventsStream = createWriteStream(input.paths.eventsPath, { flags: 'w' });
  const stderrStream = createWriteStream(input.paths.stderrPath, { flags: 'w' });
  return new Promise((resolve) => {
    let settled = false;
    let streamError: Error | undefined;
    let completedTurnSettleTimer: NodeJS.Timeout | undefined;
    let completedTurnKillTimer: NodeJS.Timeout | undefined;
    let completedTurnReadyAt: number | undefined;
    let completedTurnTerminated = false;
    const child = spawn(input.codexPath, input.args, {
      cwd: input.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...input.env }
    });
    const childPid = child.pid;
    let timer: NodeJS.Timeout;
    const completedTurnSettleMs = Math.max(0, input.completedTurnSettleMs ?? CODEX_COMPLETED_TURN_SETTLE_MS);
    const completedTurnSettlePollMs = Math.max(25, input.completedTurnSettlePollMs ?? CODEX_COMPLETED_TURN_SETTLE_POLL_MS);
    const completedTurnKillGraceMs = Math.max(0, input.completedTurnKillGraceMs ?? CODEX_COMPLETED_TURN_KILL_GRACE_MS);
    const clearCompletedTurnTimers = () => {
      if (completedTurnSettleTimer) clearTimeout(completedTurnSettleTimer);
      if (completedTurnKillTimer) clearTimeout(completedTurnKillTimer);
      completedTurnSettleTimer = undefined;
      completedTurnKillTimer = undefined;
    };
    const settle = async (result: FrontierCodexExecutorResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearCompletedTurnTimers();
      await Promise.all([finishWriteStream(eventsStream), finishWriteStream(stderrStream)]);
      if (childPid) {
        await finishCodexPidManifestEntry(input.paths.pidManifestPath, {
          pid: childPid,
          role: 'codex',
          jobId: input.job.id
        }, {
          finishedAt: Date.now(),
          exitCode: result.exitCode,
          ...(result.signal ? { signal: result.signal } : {})
        }).catch(() => {});
      }
      const metrics = eventMetrics.finish();
      resolve({
        ...result,
        lastMessage: result.lastMessage ?? await readOptionalText(input.paths.lastMessagePath),
        ...(streamError && !result.error ? { error: streamError } : {}),
        ...(metrics ? { metrics } : {})
      });
    };
    const settleCompletedTurnIfReady = async () => {
      if (settled || completedTurnTerminated || streamError || !completedTurn.completed || !childPid) return;
      const lastMessage = await readOptionalText(input.paths.lastMessagePath);
      const descendantPids = await listLiveProcessDescendantPids(childPid, input.cwd);
      const ready = !!lastMessage && descendantPids !== undefined && descendantPids.length === 0;
      if (!ready) {
        completedTurnReadyAt = undefined;
        if (!settled && !completedTurnTerminated) {
          completedTurnSettleTimer = setTimeout(() => {
            settleCompletedTurnIfReady().catch(() => {});
          }, completedTurnSettlePollMs);
        }
        return;
      }
      completedTurnReadyAt = completedTurnReadyAt ?? Date.now();
      const waitMs = completedTurnReadyAt + completedTurnSettleMs - Date.now();
      if (waitMs > 0) {
        completedTurnSettleTimer = setTimeout(() => {
          settleCompletedTurnIfReady().catch(() => {});
        }, Math.min(waitMs, completedTurnSettlePollMs));
        return;
      }
      completedTurnTerminated = true;
      child.kill('SIGTERM');
      completedTurnKillTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, completedTurnKillGraceMs);
    };
    const onStreamError = (error: Error) => {
      streamError = streamError ?? error;
      child.kill('SIGTERM');
    };
    eventsStream.on('error', onStreamError);
    stderrStream.on('error', onStreamError);
    if (childPid) {
      appendCodexPidManifest(input.paths.pidManifestPath, {
        pid: childPid,
        role: 'codex',
        status: 'running',
        jobId: input.job.id,
        startedAt: Date.now(),
        command: [input.codexPath, ...input.args]
      }).catch(() => {});
    }
    timer = setTimeout(() => child.kill('SIGTERM'), input.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      eventMetrics.push(chunk);
      completedTurn.push(chunk);
      if (completedTurn.completed && !completedTurnSettleTimer && !completedTurnTerminated) {
        completedTurnSettleTimer = setTimeout(() => {
          settleCompletedTurnIfReady().catch(() => {});
        }, 0);
      }
      writeChildLogChunk(eventsStream, chunk, child.stdout);
    });
    child.stderr.on('data', (chunk: Buffer) => writeChildLogChunk(stderrStream, chunk, child.stderr));
    child.stdin.end(input.prompt);
    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      const completedTurnSignalExit = completedTurnTerminated && code === null && (signal === 'SIGTERM' || signal === 'SIGKILL');
      settle({
        exitCode: streamError ? 1 : completedTurnSignalExit ? 0 : code ?? 1,
        ...(signal ? { signal } : {})
      }).catch(() => {});
    });
    child.on('error', (error: Error) => {
      settle({ exitCode: 1, error }).catch(() => {});
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
  const costSummary = createCodexDashboardCostSummary(input.run);
  const autonomousQueueHealth = createDashboardAutonomousQueueHealth(input.run, queueMetadata, input.autoDrain ?? null);
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
    costSummary,
    autonomousQueueHealth,
    queueMetadata,
    queueHealth: queueMetadata.queueHealth,
    mergeQueueHealth: queueMetadata.mergeQueueHealth,
    humanQuestions: queueMetadata.humanQuestions,
    humanAnswers: queueMetadata.humanAnswers,
    operatorSummary: queueMetadata.operatorSummary,
    autoDrain: input.autoDrain ?? null,
    autoDrainArtifacts: input.autoDrainArtifacts ?? input.autoDrain?.artifacts ?? null,
    eventStream: input.eventStream ?? null,
    pidManifestPath: input.pidManifestPath ?? null,
    proof: input.proof
  };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(dashboard, null, 2) + '\n');
}

function createDashboardAutonomousQueueHealth(
  run: FrontierSwarmRun,
  queueMetadata: FrontierCodexDashboardQueueMetadata,
  autoDrain: FrontierCodexSwarmAutoDrainResult | null
): FrontierCodexDashboardAutonomousQueueHealth {
  const workers = createDashboardAutonomousQueueWorkers(run);
  const activeWorkers = workers.filter((worker) => worker.active);
  const decisionHistory = createDashboardAutonomousDecisionHistory(autoDrain);
  const completedHistory = decisionHistory.filter((decision) => decision.queueImpact === 'completed-history');
  const rerunDecisionIds = decisionHistory
    .filter((decision) => decision.current && decision.queueImpact === 'rerun-work')
    .map((decision) => decision.id);
  const rerunWork = queueMetadata.mergeQueueHealth.rerunCandidates;
  const realBlockers = createDashboardAutonomousQueueBlockers(queueMetadata, decisionHistory);
  const queueBlockerCount = realBlockers.filter((blocker) => blocker.source === 'queue-block').length;
  const decisionBlockerCount = realBlockers.filter((blocker) => blocker.source === 'human-blocked-decision').length;
  const realBlockerCount = Math.max(queueMetadata.queueHealth.trueBlockerCount, queueBlockerCount) + decisionBlockerCount;
  const rerunWorkCount = Math.max(rerunWork.length, rerunDecisionIds.length);
  const humanQuestionCount = queueMetadata.humanQuestions.count;
  const completedWorkerCount = workers.filter((worker) => dashboardWorkerStatusIsCompleted(worker.resultStatus ?? worker.status)).length;
  const failedWorkerCount = workers.filter((worker) => (worker.resultStatus ?? worker.status) === 'failed').length;
  const blockedWorkerCount = workers.filter((worker) => (worker.resultStatus ?? worker.status) === 'blocked').length;
  const coordinatorReviewCount = queueMetadata.queueHealth.coordinatorReviewCount;
  const summary: FrontierCodexDashboardAutonomousQueueHealth['summary'] = {
    activeWorkerCount: activeWorkers.length,
    workerCount: workers.length,
    completedWorkerCount,
    failedWorkerCount,
    blockedWorkerCount,
    coordinatorReviewCount,
    coordinatorReviewAssignmentCount: queueMetadata.queueHealth.coordinatorReviewAssignmentCount,
    coordinatorReviewTaskCount: queueMetadata.queueHealth.coordinatorReviewTaskCount,
    completedHistoryCount: completedHistory.length,
    autonomousDecisionCount: decisionHistory.length,
    currentDecisionCount: decisionHistory.filter((decision) => decision.current).length,
    supersededDecisionCount: decisionHistory.filter((decision) => decision.superseded).length,
    appliedDecisionCount: decisionHistory.filter((decision) => decision.status === 'applied' || decision.status === 'committed').length,
    committedDecisionCount: decisionHistory.filter((decision) => decision.status === 'committed').length,
    rerunWorkCount,
    realBlockerCount,
    humanQuestionCount
  };
  const status: FrontierCodexDashboardOperatorQueueStatus = realBlockerCount > 0 || humanQuestionCount > 0
    ? 'blocked'
    : rerunWorkCount > 0
      ? 'warning'
      : activeWorkers.length > 0 || coordinatorReviewCount > 0
        ? 'info'
        : 'ok';
  const sections: FrontierCodexDashboardAutonomousQueueHealthSection[] = [
    createDashboardAutonomousQueueHealthSection({
      id: 'active-workers',
      label: 'Active workers',
      value: activeWorkers.length,
      detail: `${formatDashboardOperatorQueueCount(completedWorkerCount, 'completed worker')}, ${formatDashboardOperatorQueueCount(failedWorkerCount, 'failed worker')}, ${formatDashboardOperatorQueueCount(blockedWorkerCount, 'blocked worker')}`,
      status: activeWorkers.length > 0 ? 'info' : 'ok',
      action: activeWorkers.length > 0 ? 'Watch active worker evidence and result files before draining coordinator work.' : 'No worker slots are currently active.',
      sourceFields: ['run.jobs', 'run.results'],
      itemIds: activeWorkers.map((worker) => worker.jobId)
    }),
    createDashboardAutonomousQueueHealthSection({
      id: 'coordinator-review',
      label: 'Coordinator review',
      value: coordinatorReviewCount,
      detail: `${formatDashboardOperatorQueueCount(queueMetadata.queueHealth.coordinatorReviewAssignmentCount, 'review assignment')}, ${formatDashboardOperatorQueueCount(queueMetadata.queueHealth.coordinatorReviewTaskCount, 'review task')}`,
      status: coordinatorReviewCount > 0 ? 'info' : 'ok',
      action: 'Use coordinator-review artifacts as audit evidence; they are not active blockers by themselves.',
      sourceFields: ['queueHealth.coordinatorReviewCount', 'queueHealth.coordinatorReviewAssignmentCount', 'queueHealth.coordinatorReviewTaskCount'],
      itemIds: []
    }),
    createDashboardAutonomousQueueHealthSection({
      id: 'completed-history',
      label: 'Completed history',
      value: completedHistory.length,
      detail: `${formatDashboardOperatorQueueCount(summary.committedDecisionCount, 'committed decision')}, ${formatDashboardOperatorQueueCount(summary.supersededDecisionCount, 'superseded decision')}`,
      status: completedHistory.length > 0 ? 'ok' : 'info',
      action: 'Show committed, applied, recorded, rejected, and superseded decisions as history instead of active queue pressure.',
      sourceFields: ['autonomousQueueHealth.decisionHistory', 'queueHealth.appliedDecisionCount', 'queueHealth.committedDecisionCount'],
      itemIds: completedHistory.map((decision) => decision.id)
    }),
    createDashboardAutonomousQueueHealthSection({
      id: 'rerun-work',
      label: 'Rerun work',
      value: rerunWorkCount,
      detail: `${formatDashboardOperatorQueueCount(rerunWork.length, 'rerun candidate')}, ${formatDashboardOperatorQueueCount(queueMetadata.queueHealth.conflictRetryWork.length, 'conflict retry')}`,
      status: rerunWorkCount > 0 ? 'warning' : 'ok',
      action: 'Refresh stale or current-head conflict work as coordinator retry work; do not promote it to a human question.',
      sourceFields: ['mergeQueueHealth.rerunCandidates', 'queueHealth.conflictRetryWork', 'autonomousQueueHealth.decisionHistory'],
      itemIds: uniqueStrings([
        ...rerunWork.map((candidate) => candidate.taskId ?? candidate.queueItemIds[0] ?? candidate.jobId),
        ...rerunDecisionIds
      ]).sort()
    }),
    createDashboardAutonomousQueueHealthSection({
      id: 'real-blockers',
      label: 'Real blockers',
      value: realBlockerCount,
      detail: `${formatDashboardOperatorQueueCount(Math.max(queueMetadata.queueHealth.trueBlockerCount, queueBlockerCount), 'queue block action')}, ${formatDashboardOperatorQueueCount(decisionBlockerCount, 'blocked autonomous decision')}`,
      status: realBlockerCount > 0 ? 'blocked' : 'ok',
      action: 'Escalate only concrete queue blocks or non-question human-blocked decisions that local policy cannot resolve.',
      sourceFields: ['queueHealth.trueBlockerCount', 'mergeQueueHealth.coordinatorAssignments', 'autonomousQueueHealth.decisionHistory'],
      itemIds: realBlockers.map((blocker) => blocker.id)
    }),
    createDashboardAutonomousQueueHealthSection({
      id: 'human-questions',
      label: 'Human questions',
      value: humanQuestionCount,
      detail: `${formatDashboardOperatorQueueCount(queueMetadata.humanQuestions.answeredCount, 'answered question')}, ${formatDashboardOperatorQueueCount(queueMetadata.humanQuestions.routedDecisionCount, 'routed answer')}`,
      status: humanQuestionCount > 0 ? 'blocked' : 'ok',
      action: 'Route explicit structured human questions through the human answer log.',
      sourceFields: ['humanQuestions.count', 'humanQuestions.openDecisionIds', 'humanAnswers.routedDecisionIds'],
      itemIds: queueMetadata.humanQuestions.openDecisionIds
    })
  ];
  return {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_AUTONOMOUS_QUEUE_HEALTH_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_AUTONOMOUS_QUEUE_HEALTH_VERSION,
    source: queueMetadata.available || autoDrain ? 'run-and-auto-drain' : 'run-only',
    available: true,
    status,
    headline: createDashboardAutonomousQueueHealthHeadline(status, summary),
    sections,
    activeWorkers,
    workers,
    decisionHistory,
    completedHistory,
    rerunWork,
    realBlockers,
    humanQuestions: queueMetadata.humanQuestions,
    summary
  };
}

function createDashboardAutonomousQueueWorkers(run: FrontierSwarmRun): FrontierCodexDashboardAutonomousQueueWorker[] {
  const resultByJobId = new Map(run.results.map((result) => [result.jobId, result]));
  return run.jobs.map((job) => {
    const result = resultByJobId.get(job.id);
    const status = result?.status ?? job.status;
    const costTelemetry = createDashboardWorkerCostTelemetry(result?.metadata ?? job.metadata);
    return {
      jobId: job.id,
      taskId: job.taskId,
      lane: job.lane,
      ...(job.layer ? { layer: job.layer } : {}),
      title: job.title,
      status,
      active: dashboardWorkerStatusIsActive(status),
      ...(result ? { resultStatus: result.status } : {}),
      ...(result?.mergeReadiness ? { mergeReadiness: result.mergeReadiness } : {}),
      changedPaths: result?.changedPaths ?? [],
      evidencePaths: result?.evidencePaths ?? [],
      ...(costTelemetry ? { costTelemetry } : {})
    };
  }).sort((left, right) => left.jobId.localeCompare(right.jobId));
}

function dashboardWorkerStatusIsActive(status: string): boolean {
  return status === 'planned' || status === 'scheduled' || status === 'running';
}

function dashboardWorkerStatusIsCompleted(status: string): boolean {
  return status === 'completed' || status === 'verified';
}

function createDashboardAutonomousDecisionHistory(
  autoDrain: FrontierCodexSwarmAutoDrainResult | null
): FrontierCodexDashboardAutonomousDecisionHistoryItem[] {
  const entries: Array<{ decision: FrontierCodexAutonomousMergeDecision; index: number }> = [];
  for (const iteration of autoDrain?.iterations ?? []) {
    for (const decision of iteration.apply?.decisions ?? []) {
      entries.push({ decision, index: entries.length });
    }
  }
  const components = createDashboardAutonomousDecisionComponents(entries.map((entry) => entry.decision));
  const componentByKey = new Map<string, DashboardAutonomousDecisionComponent>();
  for (const component of components) {
    for (const key of component.keys) componentByKey.set(key, component);
  }
  return entries.map(({ decision }) => {
    const component = dashboardAutonomousDecisionAliasKeys(decision)
      .map((key) => componentByKey.get(key))
      .find((entry): entry is DashboardAutonomousDecisionComponent => !!entry);
    const latestDecision = component?.latest.decision ?? decision;
    const current = latestDecision.id === decision.id;
    const superseded = !current;
    const historyState: FrontierCodexDashboardAutonomousDecisionHistoryState = superseded ? 'superseded' : 'current';
    return {
      id: decision.id,
      jobId: decision.jobId,
      ...(decision.taskId ? { taskId: decision.taskId } : {}),
      queueItemIds: [...decision.queueItemIds],
      queueKeys: dashboardAutonomousDecisionAliasKeys(decision),
      status: decision.status,
      reason: decision.reason,
      historyState,
      current,
      superseded,
      ...(superseded ? { supersededByDecisionId: latestDecision.id, supersededByStatus: latestDecision.status } : {}),
      queueImpact: dashboardAutonomousDecisionQueueImpact(decision, current, autoDrain?.humanAnswers),
      bundlePath: decision.bundlePath,
      ...(decision.patchPath ? { patchPath: decision.patchPath } : {}),
      changedPaths: [...decision.changedPaths],
      changedRegions: [...decision.changedRegions],
      lockScope: decision.lockScope,
      lockKeys: [...decision.lockKeys],
      finishedAt: decision.finishedAt,
      ...(decision.commit ? { commit: decision.commit } : {})
    };
  }).sort((left, right) => left.finishedAt - right.finishedAt || left.id.localeCompare(right.id));
}

function dashboardAutonomousDecisionQueueImpact(
  decision: FrontierCodexAutonomousMergeDecision,
  current: boolean,
  routing: FrontierCodexHumanAnswerRoutingSummary | undefined
): FrontierCodexDashboardAutonomousDecisionQueueImpact {
  if (!current) return 'completed-history';
  if (decision.status === 'applied'
    || decision.status === 'committed'
    || decision.status === 'checked'
    || decision.status === 'skipped'
    || decision.status === 'rejected'
    || decision.status === 'failed') {
    return 'completed-history';
  }
  if (decision.status === 'rerun' || decision.status === 'conflict-blocked') return 'rerun-work';
  if (dashboardAutonomousDecisionIsExplicitHumanQuestion(decision)) {
    return dashboardHumanQuestionHasRoutedAnswer(decision, routing) ? 'completed-history' : 'human-question';
  }
  return 'real-blocker';
}

function createDashboardAutonomousQueueBlockers(
  queueMetadata: FrontierCodexDashboardQueueMetadata,
  decisionHistory: readonly FrontierCodexDashboardAutonomousDecisionHistoryItem[]
): FrontierCodexDashboardAutonomousQueueBlocker[] {
  const blockers = new Map<string, FrontierCodexDashboardAutonomousQueueBlocker>();
  for (const assignment of queueMetadata.mergeQueueHealth.coordinatorAssignments) {
    if (!assignment.open || assignment.assignedAction !== 'block') continue;
    blockers.set(`queue-block:${assignment.jobId}`, {
      id: `queue-block:${assignment.jobId}`,
      source: 'queue-block',
      jobId: assignment.jobId,
      ...(assignment.taskId ? { taskId: assignment.taskId } : {}),
      queueItemIds: [...assignment.queueItemIds],
      queueKeys: [...assignment.queueKeys],
      reason: assignment.reasons[0] ?? assignment.decision,
      changedPaths: [...assignment.changedPaths],
      changedRegions: [...assignment.changedRegions]
    });
  }
  for (const decision of decisionHistory) {
    if (!decision.current || decision.queueImpact !== 'real-blocker') continue;
    blockers.set(`human-blocked-decision:${decision.id}`, {
      id: `human-blocked-decision:${decision.id}`,
      source: 'human-blocked-decision',
      jobId: decision.jobId,
      ...(decision.taskId ? { taskId: decision.taskId } : {}),
      queueItemIds: [...decision.queueItemIds],
      queueKeys: [...decision.queueKeys],
      reason: decision.reason,
      changedPaths: [...decision.changedPaths],
      changedRegions: [...decision.changedRegions]
    });
  }
  return [...blockers.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function createDashboardAutonomousQueueHealthSection(input: {
  id: FrontierCodexDashboardAutonomousQueueHealthSectionId;
  label: string;
  value: number;
  detail: string;
  status: FrontierCodexDashboardOperatorQueueStatus;
  action: string;
  sourceFields: readonly string[];
  itemIds: readonly string[];
}): FrontierCodexDashboardAutonomousQueueHealthSection {
  return {
    id: input.id,
    label: input.label,
    value: input.value,
    detail: input.detail,
    status: input.status,
    action: input.action,
    sourceFields: [...input.sourceFields],
    itemIds: uniqueStrings(input.itemIds).sort()
  };
}

function createDashboardAutonomousQueueHealthHeadline(
  status: FrontierCodexDashboardOperatorQueueStatus,
  summary: FrontierCodexDashboardAutonomousQueueHealth['summary']
): string {
  if (status === 'blocked') {
    return `${formatDashboardOperatorQueueCount(summary.realBlockerCount, 'real blocker')} and ${formatDashboardOperatorQueueCount(summary.humanQuestionCount, 'human question')} need coordinator action.`;
  }
  if (status === 'warning') {
    return `${formatDashboardOperatorQueueCount(summary.rerunWorkCount, 'rerun item')} need coordinator retry work; ${formatDashboardOperatorQueueCount(summary.completedHistoryCount, 'completed decision')} recorded.`;
  }
  if (status === 'info') {
    const active = summary.activeWorkerCount > 0 ? formatDashboardOperatorQueueCount(summary.activeWorkerCount, 'active worker') : '';
    const review = summary.coordinatorReviewCount > 0 ? formatDashboardOperatorQueueCount(summary.coordinatorReviewCount, 'coordinator review artifact') : '';
    const detail = [active, review].filter((entry) => entry.length > 0).join(' and ');
    return `${detail} available; no true blockers are open.`;
  }
  return `Autonomous queue is clear; ${formatDashboardOperatorQueueCount(summary.completedHistoryCount, 'completed decision')} recorded.`;
}

function createCodexDashboardCostSummary(run: FrontierSwarmRun): FrontierCodexDashboardCostSummary {
  const costItems = collectCodexDashboardCostItems(run);
  const byModel = new Map<string, FrontierCodexDashboardCostModelSummary>();
  const unknownPricing: FrontierCodexDashboardCostUnknownPricing[] = [];
  const unknownCosts: FrontierCodexDashboardCostUnknownCost[] = [];
  const missingUsageJobIds: string[] = [];
  const summary: FrontierCodexDashboardCostSummary = {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_COST_SUMMARY_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_COST_SUMMARY_VERSION,
    source: 'run-results-and-jobs-metadata',
    available: costItems.length > 0,
    currency: 'USD',
    unitTokens: FRONTIER_SWARM_CODEX_MODEL_PRICING_UNIT_TOKENS,
    pricingSource: FRONTIER_SWARM_CODEX_MODEL_PRICING_SOURCE,
    pricingSourceCheckedAt: FRONTIER_SWARM_CODEX_MODEL_PRICING_SOURCE_CHECKED_AT,
    jobCount: costItems.length,
    jobsWithTokenUsage: 0,
    estimatedJobCount: 0,
    unknownPricingJobCount: 0,
    unknownCostJobCount: 0,
    incompleteTokenUsageJobCount: 0,
    missingUsageJobCount: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    uncachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costEstimateStatus: 'unestimated',
    byModel: [],
    unknownPricing,
    unknownCosts,
    missingUsageJobIds
  };
  for (const item of costItems) {
    const metrics = readCodexRunMetrics(item.metadata);
    const resourceModel = readCodexResourceAllocationModel(item.metadata);
    const estimate = metrics
      ? readCodexCostEstimate(item.metadata) ?? estimateCodexRunCost(metrics)
      : readCodexCostEstimate(item.metadata) ?? (resourceModel ? estimateCodexRunCost({ model: resourceModel }) : undefined);
    if (!metrics?.hasTokenUsage) {
      summary.missingUsageJobCount += 1;
      missingUsageJobIds.push(item.jobId);
      if (estimate) {
        summary.unknownCostJobCount += 1;
        if (isIncompleteTokenUsageCostReason(estimate.reason ?? 'missing-token-usage')) summary.incompleteTokenUsageJobCount += 1;
        unknownCosts.push({
          jobId: item.jobId,
          ...(estimate.model ? { model: estimate.model } : {}),
          reason: estimate.reason ?? 'missing-token-usage',
          missingTokenFields: ['inputTokens', 'outputTokens']
        });
      }
      continue;
    }
    summary.jobsWithTokenUsage += 1;
    summary.inputTokens += metrics.inputTokens;
    summary.cachedInputTokens += metrics.cachedInputTokens;
    summary.uncachedInputTokens += metrics.uncachedInputTokens;
    summary.outputTokens += metrics.outputTokens;
    summary.totalTokens += metrics.totalTokens;
    const model = metrics.model ?? estimate?.model ?? 'unknown';
    const modelSummary = byModel.get(model) ?? {
      model,
      jobCount: 0,
      estimatedJobCount: 0,
      unknownPricingJobCount: 0,
      unknownCostJobCount: 0,
      incompleteTokenUsageJobCount: 0,
      unestimatedJobCount: 0,
      costEstimateStatus: 'unestimated' as const,
      inputTokens: 0,
      cachedInputTokens: 0,
      uncachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    };
    modelSummary.jobCount += 1;
    modelSummary.inputTokens += metrics.inputTokens;
    modelSummary.cachedInputTokens += metrics.cachedInputTokens;
    modelSummary.uncachedInputTokens += metrics.uncachedInputTokens;
    modelSummary.outputTokens += metrics.outputTokens;
    modelSummary.totalTokens += metrics.totalTokens;
    if (estimate?.pricing) {
      modelSummary.pricing = estimate.pricing;
      modelSummary.pricingSource = estimate.source;
      modelSummary.pricingSourceCheckedAt = estimate.sourceCheckedAt;
    }
    if (estimate?.estimated) {
      summary.estimatedJobCount += 1;
      modelSummary.estimatedJobCount += 1;
      summary.inputCostUsd = roundUsd((summary.inputCostUsd ?? 0) + (estimate.inputCostUsd ?? 0));
      summary.cachedInputCostUsd = roundUsd((summary.cachedInputCostUsd ?? 0) + (estimate.cachedInputCostUsd ?? 0));
      summary.uncachedInputCostUsd = roundUsd((summary.uncachedInputCostUsd ?? 0) + (estimate.uncachedInputCostUsd ?? 0));
      summary.outputCostUsd = roundUsd((summary.outputCostUsd ?? 0) + (estimate.outputCostUsd ?? 0));
      summary.estimatedCostUsd = roundUsd((summary.estimatedCostUsd ?? 0) + (estimate.estimatedCostUsd ?? 0));
      modelSummary.estimatedCostUsd = roundUsd((modelSummary.estimatedCostUsd ?? 0) + (estimate.estimatedCostUsd ?? 0));
    } else {
      const reason = estimate?.reason ?? 'unknown-model-pricing';
      const missingTokenFields = metrics.missingTokenFields.length ? [...metrics.missingTokenFields] : undefined;
      summary.unknownCostJobCount += 1;
      modelSummary.unknownCostJobCount += 1;
      modelSummary.unknownCostReason ??= reason;
      modelSummary.unestimatedJobCount += 1;
      if (isIncompleteTokenUsageCostReason(reason)) {
        summary.incompleteTokenUsageJobCount += 1;
        modelSummary.incompleteTokenUsageJobCount += 1;
      }
      if (reason === 'unknown-model-pricing' || reason === 'missing-model') {
        summary.unknownPricingJobCount += 1;
        modelSummary.unknownPricingJobCount += 1;
        modelSummary.unknownPricingReason ??= reason;
        unknownPricing.push({
          jobId: item.jobId,
          ...(model !== 'unknown' ? { model } : {}),
          reason,
          ...(missingTokenFields ? { missingTokenFields } : {})
        });
      }
      unknownCosts.push({
        jobId: item.jobId,
        ...(model !== 'unknown' ? { model } : {}),
        reason,
        ...(missingTokenFields ? { missingTokenFields } : {})
      });
    }
    byModel.set(model, modelSummary);
  }
  for (const modelSummary of byModel.values()) {
    if (modelSummary.estimatedJobCount > 0 && modelSummary.unestimatedJobCount === 0) {
      modelSummary.costEstimateStatus = 'estimated';
    } else if (modelSummary.estimatedJobCount > 0) {
      modelSummary.costEstimateStatus = 'partial';
    } else if (modelSummary.incompleteTokenUsageJobCount > 0) {
      modelSummary.costEstimateStatus = 'partial';
    } else if (modelSummary.unknownPricingJobCount > 0) {
      modelSummary.costEstimateStatus = 'unknown-pricing';
    } else {
      modelSummary.costEstimateStatus = 'unestimated';
    }
  }
  if (summary.jobsWithTokenUsage > 0 && summary.estimatedJobCount === summary.jobsWithTokenUsage) {
    summary.costEstimateStatus = 'estimated';
  } else if (summary.estimatedJobCount > 0) {
    summary.costEstimateStatus = 'partial';
  } else if (summary.incompleteTokenUsageJobCount > 0) {
    summary.costEstimateStatus = 'partial';
  } else if (summary.unknownPricingJobCount > 0) {
    summary.costEstimateStatus = 'unknown-pricing';
  } else {
    summary.costEstimateStatus = 'unestimated';
  }
  summary.byModel = Array.from(byModel.values()).sort((left, right) => left.model.localeCompare(right.model));
  summary.unknownPricing = unknownPricing.sort((left, right) => left.jobId.localeCompare(right.jobId));
  summary.unknownCosts = unknownCosts.sort((left, right) => left.jobId.localeCompare(right.jobId));
  summary.missingUsageJobIds = missingUsageJobIds.sort();
  return summary;
}

function collectCodexDashboardCostItems(run: FrontierSwarmRun): FrontierCodexDashboardCostItem[] {
  const resultJobIds = new Set(run.results.map((result) => result.jobId));
  const items: FrontierCodexDashboardCostItem[] = run.results.map((result) => ({
    jobId: result.jobId,
    status: result.status,
    source: 'result',
    metadata: result.metadata
  }));
  for (const job of run.jobs) {
    if (resultJobIds.has(job.id)) continue;
    const metrics = readCodexRunMetrics(job.metadata);
    const estimate = readCodexCostEstimate(job.metadata);
    if (!metrics?.hasTokenUsage && !estimate && !readCodexResourceAllocationModel(job.metadata)) continue;
    items.push({
      jobId: job.id,
      status: job.status,
      source: 'job',
      metadata: job.metadata
    });
  }
  return items;
}

function isIncompleteTokenUsageCostReason(reason: FrontierCodexCostEstimateReason): boolean {
  return reason === 'missing-input-tokens'
    || reason === 'missing-output-tokens'
    || reason === 'missing-token-breakdown'
    || reason === 'missing-token-usage';
}

function createDashboardWorkerCostTelemetry(metadata: unknown): FrontierCodexDashboardWorkerCostTelemetry | undefined {
  const metrics = readCodexRunMetrics(metadata);
  const resourceModel = readCodexResourceAllocationModel(metadata);
  const estimate = metrics
    ? readCodexCostEstimate(metadata) ?? estimateCodexRunCost(metrics)
    : readCodexCostEstimate(metadata) ?? (resourceModel ? estimateCodexRunCost({ model: resourceModel }) : undefined);
  if (!metrics && !estimate) return undefined;
  const inputTokens = metrics?.inputTokens ?? estimate?.inputTokens ?? 0;
  const cachedInputTokens = metrics?.cachedInputTokens ?? estimate?.cachedInputTokens ?? 0;
  const uncachedInputTokens = metrics?.uncachedInputTokens ?? estimate?.uncachedInputTokens ?? 0;
  const outputTokens = metrics?.outputTokens ?? estimate?.outputTokens ?? 0;
  const totalTokens = metrics?.totalTokens ?? estimate?.totalTokens ?? 0;
  const inputTokensKnown = metrics?.inputTokensKnown ?? false;
  const cachedInputTokensKnown = metrics?.cachedInputTokensKnown ?? false;
  const uncachedInputTokensKnown = metrics?.uncachedInputTokensKnown ?? false;
  const outputTokensKnown = metrics?.outputTokensKnown ?? false;
  const totalTokensKnown = metrics?.totalTokensKnown ?? false;
  const missingTokenFields = metrics?.missingTokenFields ?? (estimate?.reason === 'missing-token-usage' || estimate?.reason === 'missing-token-breakdown'
    ? ['inputTokens', 'outputTokens']
    : estimate?.reason === 'missing-input-tokens'
      ? ['inputTokens']
      : estimate?.reason === 'missing-output-tokens'
        ? ['outputTokens']
        : []);
  return {
    costEstimateStatus: costEstimateStatusFromEstimate(estimate),
    estimated: estimate?.estimated ?? false,
    ...(estimate?.reason ? { reason: estimate.reason } : {}),
    ...(metrics?.model ?? estimate?.model ?? resourceModel ? { model: metrics?.model ?? estimate?.model ?? resourceModel } : {}),
    ...(estimate?.pricingModel ? { pricingModel: estimate.pricingModel } : {}),
    currency: estimate?.currency ?? 'USD',
    unitTokens: estimate?.unitTokens ?? FRONTIER_SWARM_CODEX_MODEL_PRICING_UNIT_TOKENS,
    pricingSource: estimate?.source ?? FRONTIER_SWARM_CODEX_MODEL_PRICING_SOURCE,
    pricingSourceCheckedAt: estimate?.sourceCheckedAt ?? FRONTIER_SWARM_CODEX_MODEL_PRICING_SOURCE_CHECKED_AT,
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    totalTokens,
    inputTokensKnown,
    cachedInputTokensKnown,
    uncachedInputTokensKnown,
    outputTokensKnown,
    totalTokensKnown,
    tokenBreakdownComplete: metrics?.tokenBreakdownComplete ?? false,
    missingTokenFields,
    ...(estimate?.inputCostUsd !== undefined ? { inputCostUsd: estimate.inputCostUsd } : {}),
    ...(estimate?.cachedInputCostUsd !== undefined ? { cachedInputCostUsd: estimate.cachedInputCostUsd } : {}),
    ...(estimate?.uncachedInputCostUsd !== undefined ? { uncachedInputCostUsd: estimate.uncachedInputCostUsd } : {}),
    ...(estimate?.outputCostUsd !== undefined ? { outputCostUsd: estimate.outputCostUsd } : {}),
    ...(estimate?.estimatedCostUsd !== undefined ? { estimatedCostUsd: estimate.estimatedCostUsd } : {}),
    ...(estimate?.pricing ? { pricing: estimate.pricing } : {})
  };
}

function readCodexResourceAllocationModel(metadata: unknown): string | undefined {
  if (!isObject(metadata) || !isObject(metadata.resourceAllocation)) return undefined;
  return normalizeCodexMetricsModel(readStringField(metadata.resourceAllocation, ['model']));
}

function costEstimateStatusFromEstimate(estimate: FrontierCodexRunCostEstimate | undefined): FrontierCodexDashboardCostEstimateStatus {
  if (estimate?.estimated) return 'estimated';
  if (estimate?.reason === 'unknown-model-pricing' || estimate?.reason === 'missing-model') return 'unknown-pricing';
  if (estimate?.reason && isIncompleteTokenUsageCostReason(estimate.reason)) {
    return estimate.inputCostUsd !== undefined || estimate.outputCostUsd !== undefined ? 'partial' : 'unestimated';
  }
  return 'unestimated';
}

function createDashboardQueueMetadata(
  artifacts: FrontierCodexAutoDrainArtifactMetadata | null,
  autoDrain: FrontierCodexSwarmAutoDrainResult | null
): FrontierCodexDashboardQueueMetadata {
  const iterations = artifacts?.iterations ?? [];
  const decisionSummary = summarizeDashboardAutonomousDecisions(autoDrain);
  const collectOnly = createDashboardCollectOnlyMetadata(autoDrain);
  const coordinatorAgentDrainWork = createDashboardCoordinatorAgentDrainWorkMetadata(artifacts);
  const actionCounts = createDashboardQueueActionCounts(artifacts, coordinatorAgentDrainWork, autoDrain);
  const unresolvedPressure = summarizeDashboardUnresolvedQueuePressure(autoDrain, artifacts);
  const activePressure = summarizeDashboardActiveQueuePressure(autoDrain, artifacts, collectOnly);
  const staleCount = unresolvedPressure.staleCount;
  const queueRerunCount = unresolvedPressure.queueRerunCount;
  const rerunCount = queueRerunCount + decisionSummary.rerunDecisionCount;
  const currentHeadConflictCount = decisionSummary.conflictBlockedDecisionCount;
  const staleOrRerunCount = Math.max(staleCount, queueRerunCount)
    + decisionSummary.rerunDecisionCount
    + currentHeadConflictCount;
  const humanAnswers = createDashboardHumanAnswers(autoDrain);
  const humanQuestions = createDashboardHumanQuestions(autoDrain, decisionSummary);
  const mergeQueueHealth = createDashboardMergeQueueHealth(autoDrain, artifacts, humanQuestions, collectOnly);
  const conflictRetryWork = decisionSummary.conflictRetryWork;
  const queueHealth: FrontierCodexDashboardQueueHealth = {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_HEALTH_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_HEALTH_VERSION,
    source: artifacts ? FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND : 'not-collected',
    available: !!artifacts,
    activeCoordinatorQueueCount: activePressure.activeCoordinatorQueueCount,
    leaseCount: activePressure.leaseCount,
    lockKeyCount: autoDrain?.lockKeys.length ?? 0,
    lockScopeCounts: autoDrain?.lockScopeCounts ?? { semantic: 0, path: 0, repo: 0 },
    localQueueCount: activePressure.localQueueCount,
    promotedCount: activePressure.promotedCount,
    appliedDecisionCount: decisionSummary.appliedDecisionCount,
    committedDecisionCount: decisionSummary.committedDecisionCount,
    staleOrRerunCount,
    staleCount,
    rerunCount,
    conflictBlockedDecisionCount: currentHeadConflictCount,
    currentHeadConflictCount,
    selectedCoordinatorCount: activePressure.selectedCoordinatorCount,
    deferredCoordinatorCount: activePressure.deferredCoordinatorCount,
    selectedPromoteCount: activePressure.selectedPromoteCount,
    deferredPromoteCount: activePressure.deferredPromoteCount,
    conflictRetryWork,
    trueBlockerCount: actionCounts.trueBlockerCount,
    rejectedCount: actionCounts.rejectCount,
    recordOnlyCount: actionCounts.recordOnlyCount,
    coordinatorReviewCount: artifacts?.reviewer.taskCount ?? 0,
    coordinatorReviewAssignmentCount: artifacts?.reviewer.assignmentCount ?? 0,
    coordinatorReviewTaskCount: artifacts?.reviewer.taskCount ?? 0,
    humanQuestionCount: humanQuestions.count,
    coordinatorDrainWorkCount: coordinatorAgentDrainWork.count,
    coordinatorDrainAssignmentCount: coordinatorAgentDrainWork.assignmentCount,
    coordinatorDrainTerminalCount: coordinatorAgentDrainWork.terminalCount,
    coordinatorDrainNonTerminalCount: coordinatorAgentDrainWork.nonTerminalCount,
    coordinatorDrainAppliedCount: coordinatorAgentDrainWork.appliedCount
  };
  const operatorSummary = createDashboardOperatorQueueSummary(queueHealth, humanQuestions, collectOnly);
  return {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_QUEUE_METADATA_VERSION,
    source: artifacts ? FRONTIER_SWARM_CODEX_AUTO_DRAIN_ARTIFACTS_KIND : 'not-collected',
    available: !!artifacts,
    ...(collectOnly ? { collectOnly } : {}),
    decisionCollapsePolicy: FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY,
    humanAnswers,
    paths: {
      autoDrain: artifacts ? [artifacts.autoDrainPath] : [],
      collections: compactArtifactPaths(iterations.map((iteration) => iteration.collectionPath)),
      mergeQueues: artifacts?.mergeQueue.paths ?? [],
      coordinatorAgentDrainWork: artifacts?.coordinatorAgentDrainWork?.paths ?? [],
      queueOverlays: compactArtifactPaths(iterations.map((iteration) => iteration.queueOverlayPath)),
      rerunManifests: artifacts?.rerunManifest.paths ?? [],
      humanAnswers: humanAnswers.paths
    },
    coordinatorAgentDrainWork,
    actionCounts: {
      ...actionCounts,
      conflictBlockedDecisionCount: currentHeadConflictCount,
      currentHeadConflictCount,
      deferredCoordinatorCount: activePressure.deferredCoordinatorCount,
      deferredPromoteCount: activePressure.deferredPromoteCount
    },
    conflictRetryWork,
    bucketCounts: {
      readyToApplyCount: artifacts?.grouping.readyToApplyCount ?? 0,
      coordinatorReviewCount: artifacts?.grouping.coordinatorReviewCount ?? 0,
      failedEvidenceCount: artifacts?.grouping.failedEvidenceCount ?? 0,
      staleAgainstHeadCount: artifacts?.grouping.staleAgainstHeadCount ?? 0,
      promotedPatchCandidateCount: artifacts?.mergeQueue.promotedPatchCandidateCount ?? 0
    },
    mergeQueueHealth,
    queueHealth,
    humanQuestions,
    operatorSummary
  };
}

function createDashboardCoordinatorAgentDrainWorkMetadata(
  artifacts: FrontierCodexAutoDrainArtifactMetadata | null
): FrontierCodexDashboardCoordinatorAgentDrainWorkMetadata {
  const source = artifacts?.coordinatorAgentDrainWork;
  return {
    paths: source?.paths ?? [],
    count: source?.count ?? 0,
    leaseCount: source?.leaseCount ?? 0,
    assignmentCount: source?.assignmentCount ?? 0,
    terminalCount: source?.terminalCount ?? 0,
    nonTerminalCount: source?.nonTerminalCount ?? 0,
    promotedWorkCount: source?.promotedWorkCount ?? 0,
    appliedCount: source?.appliedCount ?? 0,
    queuedCount: source?.queuedCount ?? 0,
    escalatedCount: source?.escalatedCount ?? 0,
    rerunCount: source?.rerunCount ?? 0,
    rejectedCount: source?.rejectedCount ?? 0,
    recordedCount: source?.recordedCount ?? 0,
    blockedCount: source?.blockedCount ?? 0
  };
}

function createDashboardMergeQueueHealth(
  autoDrain: FrontierCodexSwarmAutoDrainResult | null,
  artifacts: FrontierCodexAutoDrainArtifactMetadata | null,
  humanQuestions: FrontierCodexDashboardHumanQuestions,
  collectOnly?: FrontierCodexDashboardCollectOnlyMetadata
): FrontierCodexDashboardMergeQueueHealth {
  const latestIteration = autoDrain?.iterations.at(-1);
  const latestCollection = latestDashboardAutoDrainCollection(autoDrain);
  const latestQueue = latestCollection?.hierarchicalMergeQueue ?? latestIteration?.collection?.hierarchicalMergeQueue;
  const latestDrainWork = latestIteration?.coordinatorAgentDrainWork;
  const latestCodexDrain = latestIteration?.coordinatorAgentDrain;
  const terminalJobIds = new Set(autoDrain?.terminalJobIds ?? []);
  const blockedJobIds = new Set(autoDrain?.blockedJobIds ?? []);
  const resolvedQueueKeys = createDashboardResolvedQueueKeySet(autoDrain);
  const decisions = latestDashboardAutonomousDecisions((autoDrain?.iterations ?? []).flatMap((iteration) => iteration.apply?.decisions ?? []));
  const codexAssignmentsByJobId = new Map((latestCodexDrain?.assignments ?? []).map((assignment) => [assignment.jobId, assignment]));
  const queueAssignmentsByJobId = new Map((latestQueue?.assignments ?? []).map((assignment) => [assignment.jobId, assignment]));
  const drainAssignments = latestDrainWork?.assignments ?? [];
  const coordinatorAssignments = drainAssignments.length > 0
    ? drainAssignments.map((assignment) => createDashboardMergeQueueCoordinatorAssignmentFromDrain(
      assignment,
      codexAssignmentsByJobId.get(assignment.jobId),
      collectOnly,
      terminalJobIds,
      blockedJobIds,
      resolvedQueueKeys
    ))
    : (latestQueue?.assignments ?? []).map((assignment) => createDashboardMergeQueueCoordinatorAssignmentFromQueue(
      assignment,
      codexAssignmentsByJobId.get(assignment.jobId),
      collectOnly,
      terminalJobIds,
      blockedJobIds,
      resolvedQueueKeys
    ));
  const activeAssignments = coordinatorAssignments.filter((assignment) => assignment.open);
  const activeLeaseIds = new Set(activeAssignments.map((assignment) => assignment.leaseId).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0));
  const activeLeaseKeys = new Set(activeAssignments.flatMap((assignment) => [assignment.leaseKey, assignment.leaseScope]).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0));
  const activeQueueIds = new Set(activeAssignments.map((assignment) => assignment.queueId));
  const activeLeases = (latestDrainWork?.leases ?? [])
    .filter((lease) => activeLeaseIds.has(lease.id) || activeLeaseKeys.has(lease.leaseKey) || activeQueueIds.has(lease.queueId))
    .map(createDashboardMergeQueueLease);
  const activeLeaseQueueIds = new Set(activeLeases.map((lease) => lease.queueId));
  const activeLeaseScopeIds = new Set(activeLeases.map((lease) => lease.scopeId));
  const queueScopes = (latestQueue?.scopes ?? []).map((scope) => createDashboardMergeQueueScope(scope, coordinatorAssignments, activeLeaseQueueIds, activeLeaseScopeIds, activeLeaseKeys));
  const drainAssignmentByJobId = new Map(drainAssignments.map((assignment) => [assignment.jobId, assignment]));
  const terminalDecisions = [
    ...(latestDrainWork?.terminalDecisions ?? []).map((decision) => createDashboardMergeQueueTerminalDecisionFromDrain(decision, drainAssignmentByJobId.get(decision.jobId))),
    ...decisions
      .filter((decision) => autonomousDecisionIsTerminal(decision.status))
      .map(createDashboardMergeQueueTerminalDecisionFromAutonomous)
  ].sort((left, right) => `${left.jobId}:${left.source}:${left.id}`.localeCompare(`${right.jobId}:${right.source}:${right.id}`));
  const blockedHumanQuestions = decisions
    .filter(dashboardAutonomousDecisionIsExplicitHumanQuestion)
    .filter((decision) => !dashboardHumanQuestionHasRoutedAnswer(decision, autoDrain?.humanAnswers))
    .map((decision) => createDashboardMergeQueueHumanQuestion(decision, humanQuestions))
    .sort((left, right) => left.id.localeCompare(right.id));
  const realConflicts = createDashboardMergeQueueConflicts(latestIteration, latestQueue, decisions);
  const rerunCandidates = createDashboardMergeQueueRerunCandidates({
    latestCollection,
    latestQueue,
    decisions,
    terminalJobIds,
    blockedJobIds,
    resolvedQueueKeys
  });
  const appliedDecisions = decisions
    .filter((decision): decision is FrontierCodexAutonomousMergeDecision & { status: Extract<FrontierCodexAutonomousDecisionStatus, 'applied' | 'committed'> } => (
      decision.status === 'applied' || decision.status === 'committed'
    ))
    .map(createDashboardMergeQueueAppliedDecision)
    .sort((left, right) => left.finishedAt - right.finishedAt || left.id.localeCompare(right.id));
  return {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_MERGE_QUEUE_HEALTH_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_MERGE_QUEUE_HEALTH_VERSION,
    source: autoDrain ? FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND : 'not-collected',
    available: !!autoDrain || !!artifacts,
    activeLeases,
    queueScopes,
    coordinatorAssignments,
    terminalDecisions,
    blockedHumanQuestions,
    realConflicts,
    rerunCandidates,
    appliedDecisions,
    counts: {
      activeLeaseCount: activeLeases.length,
      queueScopeCount: queueScopes.length,
      coordinatorAssignmentCount: coordinatorAssignments.length,
      openCoordinatorAssignmentCount: activeAssignments.length,
      terminalDecisionCount: terminalDecisions.length,
      blockedHumanQuestionCount: blockedHumanQuestions.length,
      realConflictCount: realConflicts.length,
      rerunCandidateCount: rerunCandidates.length,
      appliedDecisionCount: appliedDecisions.length,
      committedDecisionCount: appliedDecisions.filter((decision) => decision.status === 'committed').length
    }
  };
}

function createDashboardMergeQueueLease(
  lease: FrontierSwarmCoordinatorAgentDrainWork['leases'][number]
): FrontierCodexDashboardMergeQueueLease {
  return {
    id: lease.id,
    queueId: lease.queueId,
    scopeId: lease.scopeId,
    scopeKind: lease.scopeKind,
    title: lease.title,
    leaseScope: lease.leaseScope,
    leaseKey: lease.leaseKey,
    ...(lease.parentQueueId ? { parentQueueId: lease.parentQueueId } : {}),
    ...(lease.lane ? { lane: lease.lane } : {}),
    changedPaths: [...lease.changedPaths],
    changedRegions: [...lease.changedRegions],
    jobIds: [...lease.jobIds],
    actions: Object.fromEntries(Object.entries(lease.actions).map(([action, jobIds]) => [action, [...jobIds].sort()]))
  };
}

function createDashboardMergeQueueScope(
  scope: FrontierSwarmHierarchicalMergeQueue['scopes'][number],
  assignments: readonly FrontierCodexDashboardMergeQueueCoordinatorAssignment[],
  activeLeaseQueueIds: ReadonlySet<string>,
  activeLeaseScopeIds: ReadonlySet<string>,
  activeLeaseKeys: ReadonlySet<string>
): FrontierCodexDashboardMergeQueueScope {
  const scopedAssignments = assignments.filter((assignment) => assignment.queueId === scope.id || assignment.promoteToQueueId === scope.id);
  return {
    id: scope.id,
    kind: scope.kind,
    ...(scope.parentId ? { parentId: scope.parentId } : {}),
    title: scope.title,
    ...(scope.lane ? { lane: scope.lane } : {}),
    leaseKey: scope.leaseKey,
    changedPaths: [...scope.changedPaths],
    changedRegions: [...scope.changedRegions],
    jobIds: [...scope.jobIds],
    assignmentCount: scopedAssignments.length,
    openAssignmentCount: scopedAssignments.filter((assignment) => assignment.open).length,
    activeLease: activeLeaseQueueIds.has(scope.id) || activeLeaseScopeIds.has(scope.id) || activeLeaseKeys.has(scope.leaseKey)
  };
}

function createDashboardMergeQueueCoordinatorAssignmentFromDrain(
  assignment: FrontierSwarmCoordinatorAgentDrainWork['assignments'][number],
  codexAssignment: FrontierCodexCoordinatorAgentDrainAssignment | undefined,
  collectOnly: FrontierCodexDashboardCollectOnlyMetadata | undefined,
  terminalJobIds: ReadonlySet<string>,
  blockedJobIds: ReadonlySet<string>,
  resolvedQueueKeys: ReadonlySet<string>
): FrontierCodexDashboardMergeQueueCoordinatorAssignment {
  const subject = { jobId: assignment.jobId, taskId: assignment.taskId, queueItemIds: assignment.queueItemIds };
  const subjectOpen = dashboardQueueSubjectIsOpen(subject, terminalJobIds, blockedJobIds, resolvedQueueKeys);
  const open = collectOnly ? subjectOpen : !assignment.terminal && subjectOpen;
  return {
    id: assignment.id,
    jobId: assignment.jobId,
    ...(assignment.taskId ? { taskId: assignment.taskId } : {}),
    ...(assignment.lane ? { lane: assignment.lane } : {}),
    ...(assignment.title ? { title: assignment.title } : {}),
    queueItemIds: [...assignment.queueItemIds],
    queueKeys: dashboardQueueSubjectAliasKeys(subject),
    queueId: assignment.queueId,
    queueKind: assignment.queueKind,
    rootQueueId: assignment.rootQueueId,
    parentQueueIds: [...assignment.parentQueueIds],
    ...(assignment.promoteToQueueId ? { promoteToQueueId: assignment.promoteToQueueId } : {}),
    leaseId: assignment.leaseId,
    leaseScope: assignment.leaseScope,
    leaseKey: assignment.leaseScope,
    assignedAction: assignment.assignedAction,
    decision: assignment.decision,
    classification: assignment.classification,
    terminal: assignment.terminal,
    open,
    ...(codexAssignment ? {
      selected: codexAssignment.selected,
      coordinatorDecision: codexAssignment.decision,
      selectionReason: codexAssignment.selectionReason
    } : {}),
    reasons: [...assignment.reasons],
    admitted: assignment.admitted,
    changedPaths: [...assignment.changedPaths],
    changedRegions: [...assignment.changedRegions],
    conflictingJobIds: [...assignment.conflictingJobIds]
  };
}

function createDashboardMergeQueueCoordinatorAssignmentFromQueue(
  assignment: FrontierSwarmHierarchicalMergeQueue['assignments'][number],
  codexAssignment: FrontierCodexCoordinatorAgentDrainAssignment | undefined,
  collectOnly: FrontierCodexDashboardCollectOnlyMetadata | undefined,
  terminalJobIds: ReadonlySet<string>,
  blockedJobIds: ReadonlySet<string>,
  resolvedQueueKeys: ReadonlySet<string>
): FrontierCodexDashboardMergeQueueCoordinatorAssignment {
  const parentScopeIds = dashboardStringArray((assignment as { parentScopeIds?: unknown }).parentScopeIds);
  const queueItemIds = dashboardStringArray((assignment as { queueItemIds?: unknown }).queueItemIds);
  const reasons = dashboardStringArray((assignment as { reasons?: unknown }).reasons);
  const changedPaths = dashboardStringArray((assignment as { changedPaths?: unknown }).changedPaths);
  const changedRegions = dashboardStringArray((assignment as { changedRegions?: unknown }).changedRegions);
  const conflictingJobIds = dashboardStringArray((assignment as { conflictingJobIds?: unknown }).conflictingJobIds);
  const scopeId = typeof (assignment as { scopeId?: unknown }).scopeId === 'string' && (assignment as { scopeId: string }).scopeId.length
    ? (assignment as { scopeId: string }).scopeId
    : 'unknown';
  const leaseKey = typeof (assignment as { leaseKey?: unknown }).leaseKey === 'string' && (assignment as { leaseKey: string }).leaseKey.length
    ? (assignment as { leaseKey: string }).leaseKey
    : scopeId;
  const subject = { jobId: assignment.jobId, taskId: assignment.taskId, queueItemIds };
  const terminal = AUTO_DRAIN_TERMINAL_QUEUE_ACTIONS.has(assignment.action);
  const subjectOpen = dashboardQueueSubjectIsOpen(subject, terminalJobIds, blockedJobIds, resolvedQueueKeys);
  const open = collectOnly ? subjectOpen : !terminal && subjectOpen;
  return {
    jobId: assignment.jobId,
    ...(assignment.taskId ? { taskId: assignment.taskId } : {}),
    ...(assignment.lane ? { lane: assignment.lane } : {}),
    ...(assignment.title ? { title: assignment.title } : {}),
    queueItemIds,
    queueKeys: dashboardQueueSubjectAliasKeys(subject),
    queueId: scopeId,
    parentQueueIds: parentScopeIds,
    ...(assignment.promoteToScopeId ? { promoteToQueueId: assignment.promoteToScopeId } : {}),
    leaseKey,
    assignedAction: assignment.action,
    decision: dashboardMergeQueueDecisionForAction(assignment.action),
    classification: terminal ? 'terminal' : 'non-terminal',
    terminal,
    open,
    ...(codexAssignment ? {
      selected: codexAssignment.selected,
      coordinatorDecision: codexAssignment.decision,
      selectionReason: codexAssignment.selectionReason
    } : {}),
    reasons,
    admitted: assignment.admitted,
    changedPaths,
    changedRegions,
    conflictingJobIds
  };
}

function dashboardStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => String(entry).trim()).filter((entry) => entry.length > 0)
    : [];
}

function dashboardMergeQueueDecisionForAction(action: FrontierSwarmMergeQueueAssignmentAction): string {
  if (action === 'apply-local') return 'applied';
  if (action === 'queue-local') return 'queued';
  if (action === 'promote') return 'escalated';
  if (action === 'rerun') return 'rerun';
  if (action === 'reject') return 'rejected';
  if (action === 'record-only') return 'recorded';
  if (action === 'block') return 'blocked';
  return action;
}

function createDashboardMergeQueueTerminalDecisionFromDrain(
  decision: FrontierSwarmCoordinatorAgentDrainWork['terminalDecisions'][number],
  assignment: FrontierSwarmCoordinatorAgentDrainWork['assignments'][number] | undefined
): FrontierCodexDashboardMergeQueueTerminalDecision {
  const subject = { jobId: decision.jobId, taskId: assignment?.taskId, queueItemIds: decision.queueItemIds };
  return {
    source: 'coordinator-agent-drain-work',
    id: decision.id,
    jobId: decision.jobId,
    ...(assignment?.taskId ? { taskId: assignment.taskId } : {}),
    queueItemIds: [...decision.queueItemIds],
    queueKeys: dashboardQueueSubjectAliasKeys(subject),
    status: decision.decision,
    assignedAction: decision.assignedAction,
    queueId: decision.queueId,
    leaseId: decision.leaseId,
    leaseScope: decision.leaseScope,
    reasons: [...decision.reasons],
    changedPaths: assignment ? [...assignment.changedPaths] : [],
    changedRegions: assignment ? [...assignment.changedRegions] : []
  };
}

function createDashboardMergeQueueTerminalDecisionFromAutonomous(
  decision: FrontierCodexAutonomousMergeDecision
): FrontierCodexDashboardMergeQueueTerminalDecision {
  return {
    source: 'autonomous-apply',
    id: decision.id,
    jobId: decision.jobId,
    ...(decision.taskId ? { taskId: decision.taskId } : {}),
    queueItemIds: [...decision.queueItemIds],
    queueKeys: dashboardAutonomousDecisionAliasKeys(decision),
    status: decision.status,
    lockScope: decision.lockScope,
    lockKeys: [...decision.lockKeys],
    reasons: [decision.reason],
    bundlePath: decision.bundlePath,
    ...(decision.patchPath ? { patchPath: decision.patchPath } : {}),
    changedPaths: [...decision.changedPaths],
    changedRegions: [...decision.changedRegions],
    finishedAt: decision.finishedAt,
    ...(decision.commit ? { commit: decision.commit } : {})
  };
}

function createDashboardMergeQueueHumanQuestion(
  decision: FrontierCodexAutonomousMergeDecision,
  humanQuestions: FrontierCodexDashboardHumanQuestions
): FrontierCodexDashboardMergeQueueHumanQuestion {
  const detail = [...humanQuestions.openQuestions, ...humanQuestions.answeredQuestions]
    .find((entry) => entry.decisionId === decision.id);
  return {
    id: decision.id,
    jobId: decision.jobId,
    ...(decision.taskId ? { taskId: decision.taskId } : {}),
    queueItemIds: [...decision.queueItemIds],
    queueKeys: dashboardAutonomousDecisionAliasKeys(decision),
    questionIds: dashboardHumanQuestionIds(decision),
    questionCodes: dashboardHumanQuestionCodes(decision),
    ...(detail?.questionContract ? { questionContract: detail.questionContract } : {}),
    reason: decision.reason,
    answered: detail?.answered ?? humanQuestions.answeredDecisionIds.includes(decision.id),
    answerIds: detail?.answerIds ?? [],
    answerRoutes: detail?.answerRoutes ?? [],
    answerTexts: detail?.answerTexts ?? [],
    answerEvidencePaths: detail?.answerEvidencePaths ?? [],
    bundlePath: decision.bundlePath,
    ...(decision.patchPath ? { patchPath: decision.patchPath } : {}),
    changedPaths: [...decision.changedPaths],
    changedRegions: [...decision.changedRegions],
    finishedAt: decision.finishedAt
  };
}

function createDashboardMergeQueueConflicts(
  latestIteration: FrontierCodexSwarmAutoDrainIteration | undefined,
  latestQueue: FrontierSwarmHierarchicalMergeQueue | undefined,
  decisions: readonly FrontierCodexAutonomousMergeDecision[]
): FrontierCodexDashboardMergeQueueConflict[] {
  const conflicts = new Map<string, FrontierCodexDashboardMergeQueueConflict>();
  for (const conflict of latestIteration?.grouping?.conflicts ?? []) {
    const key = `grouping:${conflict.kind}:${conflict.key}:${conflict.jobIds.join(':')}`;
    conflicts.set(key, {
      source: 'auto-drain-grouping',
      kind: conflict.kind,
      key: conflict.key,
      jobIds: [...conflict.jobIds],
      queueItemIds: [],
      queueKeys: conflict.jobIds.map((jobId) => `job:${jobId}`).sort(),
      changedPaths: [],
      changedRegions: [],
      reasons: ['auto-drain-grouping-conflict'],
      ...(conflict.value ? { value: conflict.value } : {})
    });
  }
  for (const assignment of latestQueue?.assignments ?? []) {
    const conflictingJobIds = dashboardStringArray((assignment as { conflictingJobIds?: unknown }).conflictingJobIds);
    if (!conflictingJobIds.length) continue;
    const queueItemIds = dashboardStringArray((assignment as { queueItemIds?: unknown }).queueItemIds);
    const changedPaths = dashboardStringArray((assignment as { changedPaths?: unknown }).changedPaths);
    const changedRegions = dashboardStringArray((assignment as { changedRegions?: unknown }).changedRegions);
    const reasons = dashboardStringArray((assignment as { reasons?: unknown }).reasons);
    const scopeId = typeof (assignment as { scopeId?: unknown }).scopeId === 'string' && (assignment as { scopeId: string }).scopeId.length
      ? (assignment as { scopeId: string }).scopeId
      : 'unknown';
    const leaseKey = typeof (assignment as { leaseKey?: unknown }).leaseKey === 'string' && (assignment as { leaseKey: string }).leaseKey.length
      ? (assignment as { leaseKey: string }).leaseKey
      : scopeId;
    const subject = { jobId: assignment.jobId, taskId: assignment.taskId, queueItemIds };
    const key = `queue:${scopeId}:${assignment.jobId}:${conflictingJobIds.join(':')}`;
    conflicts.set(key, {
      source: 'hierarchical-merge-queue',
      kind: 'queue-conflict',
      key,
      jobIds: uniqueStrings([assignment.jobId, ...conflictingJobIds]).sort(),
      ...(assignment.taskId ? { taskId: assignment.taskId } : {}),
      queueItemIds,
      queueKeys: dashboardQueueSubjectAliasKeys(subject),
      scopeId,
      leaseKey,
      changedPaths,
      changedRegions,
      reasons
    });
  }
  for (const decision of decisions.filter((entry) => entry.status === 'conflict-blocked')) {
    const key = `autonomous:${decision.id}`;
    conflicts.set(key, {
      source: 'autonomous-apply',
      kind: 'current-head-conflict',
      key,
      jobIds: [decision.jobId],
      ...(decision.taskId ? { taskId: decision.taskId } : {}),
      queueItemIds: [...decision.queueItemIds],
      queueKeys: dashboardAutonomousDecisionAliasKeys(decision),
      ...(decision.patchPath ? { patchPath: decision.patchPath } : {}),
      bundlePath: decision.bundlePath,
      changedPaths: [...decision.changedPaths],
      changedRegions: [...decision.changedRegions],
      reasons: [decision.reason],
      ...(decision.headBefore ? { headBefore: decision.headBefore } : {}),
      ...(decision.headAfter ? { headAfter: decision.headAfter } : {})
    });
  }
  return Array.from(conflicts.values()).sort((left, right) => `${left.source}:${left.key}`.localeCompare(`${right.source}:${right.key}`));
}

function createDashboardMergeQueueRerunCandidates(input: {
  latestCollection: FrontierCodexCollectResult | undefined;
  latestQueue: FrontierSwarmHierarchicalMergeQueue | undefined;
  decisions: readonly FrontierCodexAutonomousMergeDecision[];
  terminalJobIds: ReadonlySet<string>;
  blockedJobIds: ReadonlySet<string>;
  resolvedQueueKeys: ReadonlySet<string>;
}): FrontierCodexDashboardMergeQueueRerunCandidate[] {
  const candidates = new Map<string, FrontierCodexDashboardMergeQueueRerunCandidate>();
  const latestCollectionPath = dashboardCollectionArtifactPath(input.latestCollection, 'collectionPath', 'collection.json');
  const latestMergeQueuePath = dashboardCollectionArtifactPath(input.latestCollection, 'hierarchicalMergeQueuePath', 'hierarchical-merge-queue.json');
  const assignments = input.latestQueue?.assignments ?? [];
  const assignmentsByJobId = new Map(assignments.map((assignment) => [assignment.jobId, assignment]));
  const entriesByJobId = input.latestCollection ? collectionEntriesByJobId(input.latestCollection) : new Map<string, FrontierCodexCollectedBundle>();
  for (const entry of input.latestCollection?.buckets['stale-against-head'] ?? []) {
    const record = dashboardAutoDrainGroupingRecord(entry);
    if (!record) continue;
    const subject = { jobId: record.jobId, taskId: record.taskId, queueItemIds: record.queueItemIds };
    if (!record.changedPaths.length) continue;
    if (!dashboardQueueSubjectIsOpen(subject, input.terminalJobIds, input.blockedJobIds, input.resolvedQueueKeys)) continue;
    const assignment = assignmentsByJobId.get(record.jobId);
    mergeDashboardMergeQueueRerunCandidate(candidates, subject, {
      jobId: record.jobId,
      taskId: record.taskId,
      queueItemIds: record.queueItemIds,
      sourceKinds: assignment?.action === 'rerun' ? ['stale-against-head', 'queue-rerun'] : ['stale-against-head'],
      reasons: uniqueStrings(['stale-against-head', ...entry.bundle.reasons, ...(assignment?.reasons ?? [])]),
      sourcePatchPaths: autoDrainRerunPatchPathsForEntry(entry, record),
      sourceBundlePaths: autoDrainRerunBundlePathsForEntry(entry),
      sourceCollectionPaths: compactArtifactPaths([latestCollectionPath]),
      sourceMergeQueuePaths: compactArtifactPaths([latestMergeQueuePath]),
      targetRefs: record.changedPaths,
      changedRegions: record.changedRegions,
      queueActions: assignment ? [assignment.action] : [],
      conflictingJobIds: assignment?.conflictingJobIds ?? [],
      scopeIds: assignment ? [assignment.scopeId] : [],
      leaseKeys: assignment ? [assignment.leaseKey] : []
    });
  }
  for (const assignment of assignments.filter((entry) => entry.action === 'rerun')) {
    if (!dashboardQueueSubjectIsOpen(assignment, input.terminalJobIds, input.blockedJobIds, input.resolvedQueueKeys)) continue;
    const entry = entriesByJobId.get(assignment.jobId);
    if (!entry) continue;
    const record = dashboardAutoDrainGroupingRecord(entry);
    if (!record) continue;
    const assignmentChangedPaths = dashboardStringArray((assignment as { changedPaths?: unknown }).changedPaths);
    const assignmentChangedRegions = dashboardStringArray((assignment as { changedRegions?: unknown }).changedRegions);
    const assignmentQueueItemIds = dashboardStringArray((assignment as { queueItemIds?: unknown }).queueItemIds);
    const assignmentReasons = dashboardStringArray((assignment as { reasons?: unknown }).reasons);
    const assignmentConflictingJobIds = dashboardStringArray((assignment as { conflictingJobIds?: unknown }).conflictingJobIds);
    const assignmentScopeId = typeof (assignment as { scopeId?: unknown }).scopeId === 'string' && (assignment as { scopeId: string }).scopeId.length
      ? (assignment as { scopeId: string }).scopeId
      : 'unknown';
    const assignmentLeaseKey = typeof (assignment as { leaseKey?: unknown }).leaseKey === 'string' && (assignment as { leaseKey: string }).leaseKey.length
      ? (assignment as { leaseKey: string }).leaseKey
      : assignmentScopeId;
    if (!assignmentChangedPaths.length) continue;
    mergeDashboardMergeQueueRerunCandidate(candidates, assignment, {
      jobId: assignment.jobId,
      taskId: assignment.taskId ?? record.taskId,
      queueItemIds: assignmentQueueItemIds.length ? assignmentQueueItemIds : record.queueItemIds,
      sourceKinds: ['queue-rerun'],
      reasons: uniqueStrings(['queue-rerun', ...assignmentReasons]),
      sourcePatchPaths: autoDrainRerunPatchPathsForEntry(entry, record),
      sourceBundlePaths: autoDrainRerunBundlePathsForEntry(entry),
      sourceCollectionPaths: compactArtifactPaths([latestCollectionPath]),
      sourceMergeQueuePaths: compactArtifactPaths([latestMergeQueuePath]),
      targetRefs: assignmentChangedPaths,
      changedRegions: assignmentChangedRegions,
      queueActions: [assignment.action],
      conflictingJobIds: assignmentConflictingJobIds,
      scopeIds: [assignmentScopeId],
      leaseKeys: [assignmentLeaseKey]
    });
  }
  for (const decision of input.decisions.filter((entry) => classifyCodexAutonomousDecisionCollapse(entry).createsRerunWork)) {
    if (!decision.patchPath || !decision.changedPaths.length) continue;
    mergeDashboardMergeQueueRerunCandidate(candidates, decision, {
      jobId: decision.jobId,
      taskId: decision.taskId,
      queueItemIds: decision.queueItemIds.length ? decision.queueItemIds : [decision.taskId ?? decision.jobId],
      sourceKinds: [decision.status === 'conflict-blocked' ? 'conflict-blocked' : 'decision-rerun'],
      reasons: uniqueStrings([decision.status, decision.reason]),
      sourceHeads: compactArtifactPaths([sourceHeadForAutonomousDecision(decision)]),
      sourcePatchPaths: [decision.patchPath],
      sourceBundlePaths: [decision.bundlePath],
      decisionStatuses: [decision.status],
      targetRefs: decision.changedPaths,
      changedRegions: decision.changedRegions
    });
  }
  return Array.from(candidates.values()).sort((left, right) => dashboardMergeQueueRerunCandidateSubject(left).localeCompare(dashboardMergeQueueRerunCandidateSubject(right)));
}

function dashboardAutoDrainGroupingRecord(entry: FrontierCodexCollectedBundle): AutoDrainGroupingRecord | undefined {
  const bundle = entry.bundle as Partial<FrontierSwarmMergeBundle>;
  if (!Array.isArray(bundle.changedPaths) || !Array.isArray(bundle.changedRegions)) return undefined;
  return autoDrainGroupingRecord(entry);
}

function dashboardCollectionArtifactPath(
  collection: FrontierCodexCollectResult | undefined,
  key: keyof FrontierCodexCollectArtifacts,
  filename: string
): string | undefined {
  const artifactPath = collection?.artifacts?.[key];
  if (typeof artifactPath === 'string' && artifactPath.length > 0) return artifactPath;
  const outDir = collection && typeof (collection as { outDir?: unknown }).outDir === 'string'
    ? (collection as { outDir: string }).outDir
    : undefined;
  return outDir ? path.join(outDir, filename) : undefined;
}

function mergeDashboardMergeQueueRerunCandidate(
  candidates: Map<string, FrontierCodexDashboardMergeQueueRerunCandidate>,
  subject: { jobId: string; taskId?: string; queueItemIds?: readonly string[] },
  input: Partial<FrontierCodexDashboardMergeQueueRerunCandidate> & { jobId: string }
): void {
  const key = dashboardQueueSubjectKeys(subject)[0] ?? `job:${input.jobId}`;
  const existing = candidates.get(key);
  const base: FrontierCodexDashboardMergeQueueRerunCandidate = existing ?? {
    jobId: input.jobId,
    taskId: input.taskId,
    queueItemIds: [],
    queueKeys: [],
    sourceKinds: [],
    reasons: [],
    sourceHeads: [],
    sourcePatchPaths: [],
    sourceBundlePaths: [],
    sourceCollectionPaths: [],
    sourceMergeQueuePaths: [],
    sourceDecisionLogPaths: [],
    targetRefs: [],
    changedRegions: [],
    queueActions: [],
    decisionStatuses: [],
    conflictingJobIds: [],
    scopeIds: [],
    leaseKeys: []
  };
  const queueItemIds = uniqueStrings([...base.queueItemIds, ...(input.queueItemIds ?? [])]).sort();
  const mergedSubject = { jobId: base.jobId, taskId: base.taskId ?? input.taskId, queueItemIds };
  candidates.set(key, {
    ...base,
    taskId: base.taskId ?? input.taskId,
    queueItemIds,
    queueKeys: dashboardQueueSubjectAliasKeys(mergedSubject),
    sourceKinds: uniqueStrings([...base.sourceKinds, ...(input.sourceKinds ?? [])]) as FrontierCodexDashboardMergeQueueRerunSourceKind[],
    reasons: uniqueStrings([...base.reasons, ...(input.reasons ?? [])]).sort(),
    sourceHeads: compactArtifactPaths([...base.sourceHeads, ...(input.sourceHeads ?? [])]).sort(),
    sourcePatchPaths: compactArtifactPaths([...base.sourcePatchPaths, ...(input.sourcePatchPaths ?? [])]).sort(),
    sourceBundlePaths: compactArtifactPaths([...base.sourceBundlePaths, ...(input.sourceBundlePaths ?? [])]).sort(),
    sourceCollectionPaths: compactArtifactPaths([...base.sourceCollectionPaths, ...(input.sourceCollectionPaths ?? [])]).sort(),
    sourceMergeQueuePaths: compactArtifactPaths([...base.sourceMergeQueuePaths, ...(input.sourceMergeQueuePaths ?? [])]).sort(),
    sourceDecisionLogPaths: compactArtifactPaths([...base.sourceDecisionLogPaths, ...(input.sourceDecisionLogPaths ?? [])]).sort(),
    targetRefs: uniqueWorkspacePaths([...base.targetRefs, ...(input.targetRefs ?? [])]).sort(),
    changedRegions: uniqueStrings([...base.changedRegions, ...(input.changedRegions ?? [])]).sort(),
    queueActions: uniqueStrings([...base.queueActions, ...(input.queueActions ?? [])]) as FrontierSwarmMergeQueueAssignmentAction[],
    decisionStatuses: uniqueStrings([...base.decisionStatuses, ...(input.decisionStatuses ?? [])]) as FrontierCodexAutonomousDecisionStatus[],
    conflictingJobIds: uniqueStrings([...base.conflictingJobIds, ...(input.conflictingJobIds ?? [])]).sort(),
    scopeIds: uniqueStrings([...base.scopeIds, ...(input.scopeIds ?? [])]).sort(),
    leaseKeys: uniqueStrings([...base.leaseKeys, ...(input.leaseKeys ?? [])]).sort()
  });
}

function dashboardMergeQueueRerunCandidateSubject(candidate: FrontierCodexDashboardMergeQueueRerunCandidate): string {
  return candidate.taskId ?? candidate.queueItemIds[0] ?? candidate.jobId;
}

function createDashboardMergeQueueAppliedDecision(
  decision: FrontierCodexAutonomousMergeDecision & { status: Extract<FrontierCodexAutonomousDecisionStatus, 'applied' | 'committed'> }
): FrontierCodexDashboardMergeQueueAppliedDecision {
  return {
    id: decision.id,
    jobId: decision.jobId,
    ...(decision.taskId ? { taskId: decision.taskId } : {}),
    queueItemIds: [...decision.queueItemIds],
    queueKeys: dashboardAutonomousDecisionAliasKeys(decision),
    status: decision.status,
    reason: decision.reason,
    bundlePath: decision.bundlePath,
    ...(decision.patchPath ? { patchPath: decision.patchPath } : {}),
    changedPaths: [...decision.changedPaths],
    changedRegions: [...decision.changedRegions],
    lockScope: decision.lockScope,
    lockKeys: [...decision.lockKeys],
    finishedAt: decision.finishedAt,
    ...(decision.commit ? { commit: decision.commit } : {}),
    verification: decision.verification
  };
}

function createDashboardQueueActionCounts(
  artifacts: FrontierCodexAutoDrainArtifactMetadata | null,
  coordinatorAgentDrainWork: FrontierCodexDashboardCoordinatorAgentDrainWorkMetadata,
  autoDrain: FrontierCodexSwarmAutoDrainResult | null
): Omit<FrontierCodexDashboardQueueMetadata['actionCounts'], 'conflictBlockedDecisionCount' | 'currentHeadConflictCount' | 'deferredCoordinatorCount' | 'deferredPromoteCount'> {
  const historicalActionCounts = createHistoricalDashboardQueueActionCounts(artifacts, coordinatorAgentDrainWork);
  const latestActionCounts = createLatestDashboardQueueActionCounts(autoDrain);
  if (latestActionCounts) {
    return {
      ...latestActionCounts,
      applyLocalCount: Math.max(historicalActionCounts.applyLocalCount, latestActionCounts.applyLocalCount),
      queueLocalCount: Math.max(historicalActionCounts.queueLocalCount, latestActionCounts.queueLocalCount),
      promoteCount: Math.max(historicalActionCounts.promoteCount, latestActionCounts.promoteCount)
    };
  }
  return historicalActionCounts;
}

function createHistoricalDashboardQueueActionCounts(
  artifacts: FrontierCodexAutoDrainArtifactMetadata | null,
  coordinatorAgentDrainWork: FrontierCodexDashboardCoordinatorAgentDrainWorkMetadata
): Omit<FrontierCodexDashboardQueueMetadata['actionCounts'], 'conflictBlockedDecisionCount' | 'currentHeadConflictCount' | 'deferredCoordinatorCount' | 'deferredPromoteCount'> {
  if (coordinatorAgentDrainWork.assignmentCount > 0) {
    return {
      applyLocalCount: coordinatorAgentDrainWork.appliedCount,
      queueLocalCount: coordinatorAgentDrainWork.queuedCount,
      promoteCount: coordinatorAgentDrainWork.escalatedCount,
      rerunCount: coordinatorAgentDrainWork.rerunCount,
      rejectCount: coordinatorAgentDrainWork.rejectedCount,
      blockCount: coordinatorAgentDrainWork.blockedCount,
      trueBlockerCount: coordinatorAgentDrainWork.blockedCount,
      recordOnlyCount: coordinatorAgentDrainWork.recordedCount
    };
  }
  return {
    applyLocalCount: artifacts?.mergeQueue.applyLocalCount ?? 0,
    queueLocalCount: artifacts?.mergeQueue.queueLocalCount ?? 0,
    promoteCount: artifacts?.mergeQueue.promoteCount ?? 0,
    rerunCount: artifacts?.mergeQueue.rerunCount ?? 0,
    rejectCount: artifacts?.mergeQueue.rejectCount ?? 0,
    blockCount: artifacts?.mergeQueue.blockCount ?? 0,
    trueBlockerCount: artifacts?.mergeQueue.blockCount ?? 0,
    recordOnlyCount: artifacts?.mergeQueue.recordOnlyCount ?? 0
  };
}

function createLatestDashboardQueueActionCounts(
  autoDrain: FrontierCodexSwarmAutoDrainResult | null
): Omit<FrontierCodexDashboardQueueMetadata['actionCounts'], 'conflictBlockedDecisionCount' | 'currentHeadConflictCount' | 'deferredCoordinatorCount' | 'deferredPromoteCount'> | undefined {
  const latestCollection = latestDashboardAutoDrainCollection(autoDrain);
  const assignments = latestCollection?.hierarchicalMergeQueue?.assignments;
  if (!assignments) return undefined;
  const terminalJobIds = new Set(autoDrain?.terminalJobIds ?? []);
  const blockedJobIds = new Set(autoDrain?.blockedJobIds ?? []);
  const resolvedQueueKeys = createDashboardResolvedQueueKeySet(autoDrain);
  const answeredContinuationKeys = createDashboardAnsweredContinuationKeySet(autoDrain?.humanAnswers);
  return countDashboardQueueAssignments(
    assignments
      .filter((assignment) => dashboardQueueSubjectIsOpen(assignment, terminalJobIds, blockedJobIds, resolvedQueueKeys))
      .filter((assignment) => !dashboardQueueSubjectMatchesAnyKey(assignment, answeredContinuationKeys))
  );
}

function countDashboardQueueAssignments(
  assignments: readonly { action: FrontierSwarmMergeQueueAssignmentAction }[]
): Omit<FrontierCodexDashboardQueueMetadata['actionCounts'], 'conflictBlockedDecisionCount' | 'currentHeadConflictCount' | 'deferredCoordinatorCount' | 'deferredPromoteCount'> {
  const count = (action: FrontierSwarmMergeQueueAssignmentAction) =>
    assignments.filter((assignment) => assignment.action === action).length;
  const blockCount = count('block');
  return {
    applyLocalCount: count('apply-local'),
    queueLocalCount: count('queue-local'),
    promoteCount: count('promote'),
    rerunCount: count('rerun'),
    rejectCount: count('reject'),
    blockCount,
    trueBlockerCount: blockCount,
    recordOnlyCount: count('record-only')
  };
}

function summarizeDashboardActiveQueuePressure(
  autoDrain: FrontierCodexSwarmAutoDrainResult | null,
  artifacts: FrontierCodexAutoDrainArtifactMetadata | null,
  collectOnly?: FrontierCodexDashboardCollectOnlyMetadata
): {
  activeCoordinatorQueueCount: number;
  leaseCount: number;
  localQueueCount: number;
  promotedCount: number;
  selectedCoordinatorCount: number;
  deferredCoordinatorCount: number;
  selectedPromoteCount: number;
  deferredPromoteCount: number;
} {
  const fallback = {
    activeCoordinatorQueueCount: artifacts?.mergeQueue.count ?? 0,
    leaseCount: artifacts?.mergeQueue.scopeCount ?? 0,
    localQueueCount: artifacts?.mergeQueue.queueLocalCount ?? 0,
    promotedCount: artifacts?.mergeQueue.promoteCount ?? 0,
    selectedCoordinatorCount: artifacts?.coordinatorAgent.selectedCount ?? 0,
    deferredCoordinatorCount: artifacts?.coordinatorAgent.deferredCount ?? 0,
    selectedPromoteCount: 0,
    deferredPromoteCount: 0
  };
  const latestIteration = autoDrain?.iterations.at(-1);
  const latestDrainWork = latestIteration?.coordinatorAgentDrainWork;
  const latestDrainSummary = latestDrainWork?.summary;
  const latestCodexDrain = latestIteration?.coordinatorAgentDrain;
  if (latestDrainSummary && latestDrainSummary.assignmentCount > 0) {
    const terminalJobIds = new Set(autoDrain?.terminalJobIds ?? []);
    const blockedJobIds = new Set(autoDrain?.blockedJobIds ?? []);
    const resolvedQueueKeys = createDashboardResolvedQueueKeySet(autoDrain);
    const answeredContinuationKeys = createDashboardAnsweredContinuationKeySet(autoDrain?.humanAnswers);
    const subjectIsOpen = (subject: { jobId: string; taskId?: string; queueItemIds?: readonly string[] }) => (
      dashboardQueueSubjectIsOpen(subject, terminalJobIds, blockedJobIds, resolvedQueueKeys)
        && !dashboardQueueSubjectMatchesAnyKey(subject, answeredContinuationKeys)
    );
    const openDrainAssignments = Array.isArray(latestDrainWork?.assignments)
      ? latestDrainWork.assignments
        .filter(subjectIsOpen)
        .filter((assignment) => collectOnly || !assignment.terminal)
      : undefined;
    const openCodexAssignments = Array.isArray(latestCodexDrain?.assignments)
      ? latestCodexDrain.assignments.filter(subjectIsOpen)
      : undefined;
    const activeCoordinatorQueueCount = openDrainAssignments
      ? openDrainAssignments.length
      : collectOnly
        ? latestDrainSummary.assignmentCount
        : latestDrainSummary.nonTerminalCount;
    const openLeaseKeys = openDrainAssignments
      ? uniqueStrings(openDrainAssignments.map((assignment) => assignment.leaseId || assignment.leaseScope || assignment.queueId)).sort()
      : [];
    return {
      activeCoordinatorQueueCount,
      leaseCount: openDrainAssignments
        ? openLeaseKeys.length
        : activeCoordinatorQueueCount > 0 ? latestDrainSummary.leaseCount : 0,
      localQueueCount: openDrainAssignments
        ? openDrainAssignments.filter((assignment) => assignment.assignedAction === 'queue-local').length
        : latestDrainSummary.queuedCount,
      promotedCount: openDrainAssignments
        ? openDrainAssignments.filter((assignment) => assignment.assignedAction === 'promote').length
        : latestDrainSummary.promotedWorkCount,
      selectedCoordinatorCount: openCodexAssignments
        ? openCodexAssignments.filter((assignment) => assignment.selected).length
        : latestCodexDrain?.summary.selectedCount ?? 0,
      deferredCoordinatorCount: openCodexAssignments
        ? openCodexAssignments.filter((assignment) => !assignment.selected).length
        : latestCodexDrain?.summary.deferredCount ?? 0,
      selectedPromoteCount: openCodexAssignments
        ? openCodexAssignments.filter((assignment) => assignment.selected && assignment.queueAction === 'promote').length
        : latestCodexDrain?.summary.selectedPromoteCount ?? 0,
      deferredPromoteCount: openCodexAssignments
        ? openCodexAssignments.filter((assignment) => !assignment.selected && assignment.queueAction === 'promote').length
        : latestCodexDrain?.summary.deferredPromoteCount ?? 0
    };
  }
  if (!autoDrain) return fallback;
  const latestCollection = latestDashboardAutoDrainCollection(autoDrain);
  if (!latestCollection) return fallback;
  const assignments = latestCollection?.hierarchicalMergeQueue?.assignments ?? [];
  const terminalJobIds = new Set(autoDrain.terminalJobIds ?? []);
  const blockedJobIds = new Set(autoDrain.blockedJobIds ?? []);
  const resolvedQueueKeys = createDashboardResolvedQueueKeySet(autoDrain);
  const answeredContinuationKeys = createDashboardAnsweredContinuationKeySet(autoDrain.humanAnswers);
  const activeAssignments = assignments
    .filter((assignment) => dashboardQueueSubjectIsOpen(assignment, terminalJobIds, blockedJobIds, resolvedQueueKeys))
    .filter((assignment) => !dashboardQueueSubjectMatchesAnyKey(assignment, answeredContinuationKeys));
  const pressureActions = new Set<FrontierSwarmMergeQueueAssignmentAction>(['apply-local', 'queue-local', 'promote']);
  const pressureAssignments = activeAssignments.filter((assignment) => pressureActions.has(assignment.action));
  return {
    activeCoordinatorQueueCount: pressureAssignments.length,
    leaseCount: uniqueStrings(pressureAssignments.map((assignment) => assignment.scopeId)).length,
    localQueueCount: activeAssignments.filter((assignment) => assignment.action === 'queue-local').length,
    promotedCount: activeAssignments.filter((assignment) => assignment.action === 'promote').length,
    selectedCoordinatorCount: latestCodexDrain?.summary.selectedCount ?? 0,
    deferredCoordinatorCount: latestCodexDrain?.summary.deferredCount ?? 0,
    selectedPromoteCount: latestCodexDrain?.summary.selectedPromoteCount ?? 0,
    deferredPromoteCount: latestCodexDrain?.summary.deferredPromoteCount ?? 0
  };
}

function summarizeDashboardUnresolvedQueuePressure(
  autoDrain: FrontierCodexSwarmAutoDrainResult | null,
  artifacts: FrontierCodexAutoDrainArtifactMetadata | null
): { staleCount: number; queueRerunCount: number } {
  const latestCollection = latestDashboardAutoDrainCollection(autoDrain);
  if (!latestCollection) {
    return {
      staleCount: artifacts?.grouping.staleAgainstHeadCount ?? 0,
      queueRerunCount: artifacts?.mergeQueue.rerunCount ?? 0
    };
  }
  const terminalJobIds = new Set(autoDrain?.terminalJobIds ?? []);
  const blockedJobIds = new Set(autoDrain?.blockedJobIds ?? []);
  const resolvedQueueKeys = createDashboardResolvedQueueKeySet(autoDrain);
  const answeredContinuationKeys = createDashboardAnsweredContinuationKeySet(autoDrain?.humanAnswers);
  const staleJobIds = uniqueStrings(
    latestCollection.buckets['stale-against-head']
      .filter((entry) => dashboardCollectedBundleIsOpen(entry, terminalJobIds, blockedJobIds, resolvedQueueKeys))
      .filter((entry) => !dashboardCollectedBundleMatchesAnyKey(entry, answeredContinuationKeys))
      .map((entry) => entry.jobId)
  );
  const queueRerunJobIds = uniqueStrings(
    (latestCollection.hierarchicalMergeQueue?.assignments ?? [])
      .filter((assignment) => assignment.action === 'rerun')
      .filter((assignment) => dashboardQueueSubjectIsOpen(assignment, terminalJobIds, blockedJobIds, resolvedQueueKeys))
      .filter((assignment) => !dashboardQueueSubjectMatchesAnyKey(assignment, answeredContinuationKeys))
      .map((assignment) => assignment.jobId)
  );
  return {
    staleCount: staleJobIds.length,
    queueRerunCount: queueRerunJobIds.length
  };
}

function latestDashboardAutoDrainCollection(autoDrain: FrontierCodexSwarmAutoDrainResult | null): FrontierCodexCollectResult | undefined {
  const latestIteration = autoDrain?.iterations.at(-1);
  return latestIteration?.postApplyCollection ?? latestIteration?.collection;
}

function dashboardCollectedBundleIsOpen(
  entry: FrontierCodexCollectedBundle,
  terminalJobIds: ReadonlySet<string>,
  blockedJobIds: ReadonlySet<string>,
  resolvedQueueKeys: ReadonlySet<string>
): boolean {
  const bundle = (entry as FrontierCodexCollectedBundle & { bundle?: Partial<FrontierSwarmMergeBundle> }).bundle;
  const subject: { jobId: string; taskId?: string; queueItemIds?: readonly string[] } = { jobId: entry.jobId };
  if (typeof bundle?.taskId === 'string') subject.taskId = bundle.taskId;
  if (Array.isArray(bundle?.queueItemIds)) subject.queueItemIds = bundle.queueItemIds;
  return dashboardQueueSubjectIsOpen(subject, terminalJobIds, blockedJobIds, resolvedQueueKeys);
}

function dashboardQueueSubjectIsOpen(
  subject: { jobId: string; taskId?: string; queueItemIds?: readonly string[] },
  terminalJobIds: ReadonlySet<string>,
  blockedJobIds: ReadonlySet<string>,
  resolvedQueueKeys: ReadonlySet<string>
): boolean {
  if (terminalJobIds.has(subject.jobId) || blockedJobIds.has(subject.jobId)) return false;
  return dashboardQueueSubjectAliasKeys(subject).every((key) => !resolvedQueueKeys.has(key));
}

function dashboardCollectedBundleMatchesAnyKey(
  entry: FrontierCodexCollectedBundle,
  keys: ReadonlySet<string>
): boolean {
  if (keys.size === 0) return false;
  const bundle = (entry as FrontierCodexCollectedBundle & { bundle?: Partial<FrontierSwarmMergeBundle> }).bundle;
  const subject: { jobId: string; taskId?: string; queueItemIds?: readonly string[] } = { jobId: entry.jobId };
  if (typeof bundle?.taskId === 'string') subject.taskId = bundle.taskId;
  if (Array.isArray(bundle?.queueItemIds)) subject.queueItemIds = bundle.queueItemIds;
  return dashboardQueueSubjectMatchesAnyKey(subject, keys);
}

function dashboardQueueSubjectMatchesAnyKey(
  subject: { jobId: string; taskId?: string; queueItemIds?: readonly string[] },
  keys: ReadonlySet<string>
): boolean {
  if (keys.size === 0) return false;
  return dashboardQueueSubjectAliasKeys(subject).some((key) => keys.has(key));
}

function createDashboardAnsweredContinuationKeySet(
  routing: FrontierCodexHumanAnswerRoutingSummary | undefined
): Set<string> {
  const keys = new Set<string>();
  for (const continuation of routing?.routedContinuations ?? []) {
    for (const key of dashboardQueueSubjectAliasKeys(continuation)) keys.add(key);
    for (const questionCode of continuation.questionCodes) addHumanAnswerQuestionCodeKeys(keys, questionCode);
  }
  return keys;
}

function createDashboardResolvedQueueKeySet(autoDrain: FrontierCodexSwarmAutoDrainResult | null): Set<string> {
  return createResolvedAutonomousDecisionQueueKeySet((autoDrain?.iterations ?? []).flatMap((iteration) => iteration.apply?.decisions ?? []));
}

function createResolvedAutonomousDecisionQueueKeySet(decisions: readonly FrontierCodexAutonomousMergeDecision[]): Set<string> {
  const components = createDashboardAutonomousDecisionComponents(decisions);
  const resolved = new Set<string>();
  for (const component of components) {
    const decision = component.latest.decision;
    if (!autonomousDecisionResolvesPriorQueueDebt(decision.status)) continue;
    for (const key of component.keys) resolved.add(key);
  }
  return resolved;
}

function dashboardQueueSubjectKeys(subject: { jobId: string; taskId?: string; queueItemIds?: readonly string[] }): string[] {
  const queueItemIds = uniqueStrings((subject.queueItemIds ?? []).filter((entry) => entry.length > 0)).sort();
  if (queueItemIds.length) return queueItemIds.map((queueItemId) => `queue:${queueItemId}`);
  if (subject.taskId && subject.taskId.length > 0) return [`task:${subject.taskId}`];
  return [`job:${subject.jobId}`];
}

function dashboardQueueSubjectAliasKeys(subject: { jobId: string; taskId?: string; queueItemIds?: readonly string[] }): string[] {
  const queueItemIds = uniqueStrings((subject.queueItemIds ?? []).filter((entry) => entry.length > 0)).sort();
  return uniqueStrings([
    ...queueItemIds.map((queueItemId) => `queue:${queueItemId}`),
    subject.taskId && subject.taskId.length > 0 ? `task:${subject.taskId}` : '',
    `job:${subject.jobId}`
  ].filter((entry) => entry.length > 0));
}

function createDashboardCollectOnlyMetadata(autoDrain: FrontierCodexSwarmAutoDrainResult | null): FrontierCodexDashboardCollectOnlyMetadata | undefined {
  if (!autoDrain?.skippedReason) return undefined;
  const dirtyPaths = autoDrain.skippedReason === 'dirty-worktree' ? [...(autoDrain.dirtyPaths ?? [])].sort() : [];
  return {
    reason: autoDrain.skippedReason,
    dirtyPaths,
    dirtyPathCount: dirtyPaths.length
  };
}

function createDashboardOperatorQueueSummary(
  queueHealth: FrontierCodexDashboardQueueHealth,
  humanQuestions: FrontierCodexDashboardHumanQuestions,
  collectOnly?: FrontierCodexDashboardCollectOnlyMetadata
): FrontierCodexDashboardOperatorQueueSummary {
  const available = queueHealth.available;
  const queueBlockActionCount = Math.max(0, queueHealth.trueBlockerCount);
  const explicitHumanQuestionCount = Math.max(0, humanQuestions.count);
  const trueBlockerCount = queueBlockActionCount + explicitHumanQuestionCount;
  const coordinationDebtCount = queueHealth.currentHeadConflictCount + queueHealth.deferredCoordinatorCount;
  const status: FrontierCodexDashboardOperatorQueueStatus = !available
    ? 'unavailable'
    : trueBlockerCount > 0
      ? 'blocked'
      : queueHealth.staleOrRerunCount > 0 || coordinationDebtCount > 0
        ? 'warning'
        : queueHealth.appliedDecisionCount > 0
          ? 'ok'
          : queueHealth.activeCoordinatorQueueCount > 0 || queueHealth.localQueueCount > 0 || queueHealth.promotedCount > 0
            ? 'info'
            : 'ok';
  const headline = createDashboardOperatorQueueHeadline(status, queueHealth, humanQuestions, trueBlockerCount, queueBlockActionCount, collectOnly);
  const coordinatorQueueAction = collectOnly?.reason === 'dirty-worktree'
    ? 'Clean or isolate dirty paths, then rerun auto-drain apply for queued coordinator work.'
    : 'Inspect queue artifacts when work is waiting for autonomous coordination.';
  const conflictRetryDetail = formatDashboardConflictRetryWorkDetail(queueHealth.conflictRetryWork);
  const staleRerunAction = queueHealth.conflictRetryWork.length > 0
    ? 'Rerun or rebase current-head conflict work from the listed queue ids and patch paths; this is coordinator retry work, not a human question.'
    : 'Refresh stale workers or resolve current-head conflicts as coordinator work; escalate only explicit human-blocked or true-blocker entries.';
  return {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_OPERATOR_QUEUE_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_OPERATOR_QUEUE_VERSION,
    source: queueHealth.source,
    available,
    ...(collectOnly ? { collectOnly } : {}),
    status,
    headline,
    cards: [
      {
        id: 'coordinator-queues',
        label: 'Coordinator queues',
        value: queueHealth.activeCoordinatorQueueCount,
        detail: `${queueHealth.leaseCount} leases, ${queueHealth.lockKeyCount} locks`,
        status: queueHealth.activeCoordinatorQueueCount > 0 ? 'info' : 'ok',
        action: coordinatorQueueAction,
        sourceFields: ['queueHealth.activeCoordinatorQueueCount', 'queueHealth.leaseCount', 'queueHealth.lockKeyCount']
      },
      {
        id: 'applied-decisions',
        label: 'Applied decisions',
        value: queueHealth.appliedDecisionCount,
        detail: `${queueHealth.committedDecisionCount} committed, ${queueHealth.recordOnlyCount} recorded only`,
        status: queueHealth.appliedDecisionCount > 0 ? 'ok' : 'info',
        action: 'Review applied decision logs for landed autonomous work.',
        sourceFields: ['queueHealth.appliedDecisionCount', 'queueHealth.committedDecisionCount', 'queueHealth.recordOnlyCount']
      },
      {
        id: 'coordination-debt',
        label: 'Coordination debt',
        value: coordinationDebtCount,
        detail: `${formatDashboardOperatorQueueCount(queueHealth.currentHeadConflictCount, 'current-head conflict')}, ${formatDashboardOperatorQueueCount(queueHealth.deferredCoordinatorCount, 'deferred coordinator assignment')}, ${formatDashboardOperatorQueueCount(queueHealth.deferredPromoteCount, 'deferred promotion')}`,
        status: coordinationDebtCount > 0 ? 'warning' : 'ok',
        action: 'Drain deferred coordinator work or rerun conflict-blocked patches against the current head; do not treat this card as a human blocker.',
        sourceFields: ['queueHealth.currentHeadConflictCount', 'queueHealth.deferredCoordinatorCount', 'queueHealth.deferredPromoteCount']
      },
      {
        id: 'stale-rerun',
        label: 'Stale or rerun work',
        value: queueHealth.staleOrRerunCount,
        detail: `${queueHealth.staleCount} stale, ${queueHealth.rerunCount} rerun, ${queueHealth.conflictBlockedDecisionCount} current-head conflicts${conflictRetryDetail}`,
        status: queueHealth.staleOrRerunCount > 0 ? 'warning' : 'ok',
        action: staleRerunAction,
        sourceFields: ['queueHealth.staleOrRerunCount', 'queueHealth.staleCount', 'queueHealth.rerunCount', 'queueHealth.conflictBlockedDecisionCount', 'queueHealth.conflictRetryWork']
      },
      {
        id: 'true-blockers',
        label: 'True blockers',
        value: trueBlockerCount,
        detail: `${formatDashboardOperatorQueueCount(queueBlockActionCount, 'queue block action')}, ${formatDashboardOperatorQueueCount(explicitHumanQuestionCount, 'explicit human question')}`,
        status: trueBlockerCount > 0 ? 'blocked' : 'ok',
        action: 'Escalate only queue blocks or explicit questions that cannot be decided from repo context.',
        sourceFields: ['queueHealth.trueBlockerCount', 'humanQuestions.count']
      },
      {
        id: 'coordinator-review-artifacts',
        label: 'Coordinator review evidence',
        value: queueHealth.coordinatorReviewCount,
        detail: `${queueHealth.coordinatorReviewAssignmentCount} reviewer assignments, ${queueHealth.coordinatorReviewTaskCount} review tasks`,
        status: queueHealth.coordinatorReviewCount > 0 ? 'info' : 'ok',
        action: 'Use these artifacts to audit coordinator work; they are not active human blockers.',
        sourceFields: ['queueHealth.coordinatorReviewCount', 'queueHealth.coordinatorReviewAssignmentCount', 'queueHealth.coordinatorReviewTaskCount']
      }
    ],
    counts: {
      coordinatorQueues: queueHealth.activeCoordinatorQueueCount,
      leases: queueHealth.leaseCount,
      appliedDecisions: queueHealth.appliedDecisionCount,
      currentHeadConflicts: queueHealth.currentHeadConflictCount,
      deferredCoordinatorQueues: queueHealth.deferredCoordinatorCount,
      deferredPromoteQueues: queueHealth.deferredPromoteCount,
      staleOrRerun: queueHealth.staleOrRerunCount,
      trueBlockers: trueBlockerCount,
      humanQuestions: humanQuestions.count,
      coordinatorReviewArtifacts: queueHealth.coordinatorReviewCount
    }
  };
}

function createDashboardOperatorQueueHeadline(
  status: FrontierCodexDashboardOperatorQueueStatus,
  queueHealth: FrontierCodexDashboardQueueHealth,
  humanQuestions: FrontierCodexDashboardHumanQuestions,
  trueBlockerCount: number,
  queueBlockActionCount: number,
  collectOnly?: FrontierCodexDashboardCollectOnlyMetadata
): string {
  if (status === 'unavailable') return 'Queue data has not been collected yet.';
  if (status === 'blocked') {
    const sources = formatDashboardOperatorQueueBlockerSources(queueBlockActionCount, humanQuestions.count);
    return `${formatDashboardOperatorQueueCount(trueBlockerCount, 'true blocker')} (${sources}) ${trueBlockerCount === 1 ? 'needs' : 'need'} coordinator action.`;
  }
  if (collectOnly?.reason === 'dirty-worktree' && queueHealth.activeCoordinatorQueueCount > 0) {
    return `${formatDashboardOperatorQueueCount(queueHealth.activeCoordinatorQueueCount, 'coordinator queue item')} collected; apply is waiting for a clean worktree (${formatDashboardOperatorQueueCount(collectOnly.dirtyPathCount, 'dirty path')}).`;
  }
  if (status === 'warning') {
    return `Open coordinator debt: ${formatDashboardOperatorQueueWarningSources(queueHealth)}. Rerun, rebase, or drain this queue pressure as coordinator retry work, not a human blocker.`;
  }
  if (queueHealth.appliedDecisionCount > 0) {
    return `${queueHealth.appliedDecisionCount} autonomous decision${queueHealth.appliedDecisionCount === 1 ? '' : 's'} applied with no true blockers.`;
  }
  if (status === 'info') return 'Coordinator queues are available; no true blockers are open.';
  return 'No coordinator queue pressure is open.';
}

function formatDashboardOperatorQueueBlockerSources(queueBlockActionCount: number, humanQuestionCount: number): string {
  const sources = [
    humanQuestionCount > 0 ? formatDashboardOperatorQueueCount(humanQuestionCount, 'explicit human question') : '',
    queueBlockActionCount > 0 ? formatDashboardOperatorQueueCount(queueBlockActionCount, 'queue block action') : ''
  ].filter((entry) => entry.length > 0);
  if (sources.length === 0) return formatDashboardOperatorQueueCount(0, 'true blocker');
  if (sources.length === 1) return sources[0];
  return `${sources[0]} and ${sources[1]}`;
}

function formatDashboardOperatorQueueWarningSources(queueHealth: FrontierCodexDashboardQueueHealth): string {
  const staleOrRerunCount = Math.max(
    0,
    queueHealth.staleOrRerunCount - queueHealth.currentHeadConflictCount
  );
  const sources = [
    queueHealth.currentHeadConflictCount > 0 ? formatDashboardOperatorQueueCount(queueHealth.currentHeadConflictCount, 'current-head conflict') : '',
    queueHealth.deferredCoordinatorCount > 0 ? formatDashboardOperatorQueueCount(queueHealth.deferredCoordinatorCount, 'deferred coordinator assignment') : '',
    staleOrRerunCount > 0 ? formatDashboardOperatorQueueCount(staleOrRerunCount, 'stale or rerun item') : ''
  ].filter((entry) => entry.length > 0);
  if (sources.length === 0) return formatDashboardOperatorQueueCount(queueHealth.staleOrRerunCount, 'stale or rerun item');
  if (sources.length === 1) return sources[0];
  if (sources.length === 2) return `${sources[0]} and ${sources[1]}`;
  return `${sources.slice(0, -1).join(', ')}, and ${sources.at(-1)}`;
}

function formatDashboardOperatorQueueCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function formatDashboardConflictRetryWorkDetail(work: readonly FrontierCodexDashboardConflictRetryWork[]): string {
  if (!work.length) return '';
  const first = work[0];
  const queueId = first.queueItemIds[0] ?? first.taskId ?? first.jobId;
  const patchPath = first.patchPath ?? first.bundlePath;
  const more = work.length > 1 ? ` (+${work.length - 1} more)` : '';
  return `; conflict retry queue ${queueId} from ${patchPath}${more}`;
}

interface DashboardAutonomousDecisionSummary {
  appliedDecisionCount: number;
  committedDecisionCount: number;
  rerunDecisionCount: number;
  conflictBlockedDecisionCount: number;
  conflictRetryWork: FrontierCodexDashboardConflictRetryWork[];
  humanQuestionDecisionCount: number;
  humanQuestionOpenDecisionCount: number;
  humanQuestionIds: string[];
  humanQuestionCodes: string[];
  humanQuestionOpenDecisionIds: string[];
  humanQuestionAnsweredDecisionIds: string[];
  humanQuestionJobIds: string[];
  humanQuestionTaskIds: string[];
  humanQuestionReasons: string[];
  humanQuestionAnsweredJobIds: string[];
  humanQuestionAnsweredTaskIds: string[];
  humanQuestionOpenDetails: FrontierCodexDashboardHumanQuestionDetail[];
  humanQuestionAnsweredDetails: FrontierCodexDashboardHumanQuestionDetail[];
  humanAnswerConsumedCount: number;
  humanAnswerRoutedDecisionCount: number;
  humanAnswerRoutedDecisionIds: string[];
  humanAnswerRoutedJobIds: string[];
  humanAnswerRoutedTaskIds: string[];
  humanAnswerRoutedQuestionIds: string[];
  humanAnswerRoutedQuestionCodes: string[];
  humanAnswerIds: string[];
  humanAnswerRoutes: string[];
  humanAnswerLogPaths: string[];
  humanAnswerEvidencePaths: string[];
}

function summarizeDashboardAutonomousDecisions(autoDrain: FrontierCodexSwarmAutoDrainResult | null): DashboardAutonomousDecisionSummary {
  const decisions = latestDashboardAutonomousDecisions((autoDrain?.iterations ?? []).flatMap((iteration) => iteration.apply?.decisions ?? []));
  const humanAnswerRouting = autoDrain?.humanAnswers;
  const humanQuestionDecisions = decisions.filter(dashboardAutonomousDecisionIsExplicitHumanQuestion);
  const openHumanQuestionDecisions = humanQuestionDecisions.filter((decision) => !dashboardHumanQuestionHasRoutedAnswer(decision, humanAnswerRouting));
  const answeredHumanQuestionDecisions = humanQuestionDecisions.filter((decision) => dashboardHumanQuestionHasRoutedAnswer(decision, humanAnswerRouting));
  const humanQuestionOpenDetails = openHumanQuestionDecisions
    .map((decision) => createDashboardHumanQuestionDetail(decision, humanAnswerRouting))
    .filter((entry): entry is FrontierCodexDashboardHumanQuestionDetail => !!entry);
  const humanQuestionAnsweredDetails = answeredHumanQuestionDecisions
    .map((decision) => createDashboardHumanQuestionDetail(decision, humanAnswerRouting))
    .filter((entry): entry is FrontierCodexDashboardHumanQuestionDetail => !!entry);
  const conflictBlockedDecisions = decisions.filter((decision) => decision.status === 'conflict-blocked');
  return {
    appliedDecisionCount: decisions.filter((decision) => decision.status === 'applied' || decision.status === 'committed').length,
    committedDecisionCount: decisions.filter((decision) => decision.status === 'committed').length,
    rerunDecisionCount: decisions.filter((decision) => decision.status === 'rerun').length,
    conflictBlockedDecisionCount: conflictBlockedDecisions.length,
    conflictRetryWork: conflictBlockedDecisions.map(dashboardConflictRetryWorkFromDecision),
    humanQuestionDecisionCount: humanQuestionDecisions.length,
    humanQuestionOpenDecisionCount: openHumanQuestionDecisions.length,
    humanQuestionIds: uniqueStrings(openHumanQuestionDecisions.flatMap(dashboardHumanQuestionIds)).sort(),
    humanQuestionCodes: uniqueStrings(openHumanQuestionDecisions.flatMap(dashboardHumanQuestionCodes)).sort(),
    humanQuestionOpenDecisionIds: uniqueStrings(openHumanQuestionDecisions.map((decision) => decision.id)).sort(),
    humanQuestionAnsweredDecisionIds: uniqueStrings(answeredHumanQuestionDecisions.map((decision) => decision.id)).sort(),
    humanQuestionJobIds: uniqueStrings(openHumanQuestionDecisions.map((decision) => decision.jobId)).sort(),
    humanQuestionTaskIds: uniqueStrings(openHumanQuestionDecisions.map((decision) => decision.taskId).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)).sort(),
    humanQuestionReasons: uniqueStrings(openHumanQuestionDecisions.map((decision) => decision.reason).filter((entry) => entry.length > 0)).sort(),
    humanQuestionAnsweredJobIds: uniqueStrings(answeredHumanQuestionDecisions.map((decision) => decision.jobId)).sort(),
    humanQuestionAnsweredTaskIds: uniqueStrings(answeredHumanQuestionDecisions.map((decision) => decision.taskId).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)).sort(),
    humanQuestionOpenDetails,
    humanQuestionAnsweredDetails,
    humanAnswerConsumedCount: humanAnswerRouting?.consumedCount ?? 0,
    humanAnswerRoutedDecisionCount: humanAnswerRouting?.routedDecisionCount ?? 0,
    humanAnswerRoutedDecisionIds: humanAnswerRouting?.routedDecisionIds ?? [],
    humanAnswerRoutedJobIds: humanAnswerRouting?.routedJobIds ?? [],
    humanAnswerRoutedTaskIds: humanAnswerRouting?.routedTaskIds ?? [],
    humanAnswerRoutedQuestionIds: humanAnswerRouting?.answeredQuestionIds ?? [],
    humanAnswerRoutedQuestionCodes: humanAnswerRouting?.answeredQuestionCodes ?? [],
    humanAnswerIds: uniqueStrings((humanAnswerRouting?.routedDecisions ?? []).flatMap((decision) => decision.answerIds)).sort(),
    humanAnswerRoutes: uniqueStrings((humanAnswerRouting?.routedDecisions ?? []).flatMap((decision) => decision.answerRoutes)).sort(),
    humanAnswerLogPaths: humanAnswerRouting?.paths ?? [],
    humanAnswerEvidencePaths: humanAnswerRouting?.evidencePaths ?? []
  };
}

function dashboardConflictRetryWorkFromDecision(decision: FrontierCodexAutonomousMergeDecision): FrontierCodexDashboardConflictRetryWork {
  const queueItemIds = uniqueStrings(decision.queueItemIds.filter((entry) => entry.length > 0)).sort();
  return {
    jobId: decision.jobId,
    ...(decision.taskId ? { taskId: decision.taskId } : {}),
    queueItemIds,
    queueKeys: dashboardAutonomousDecisionAliasKeys(decision),
    ...(decision.patchPath ? { patchPath: decision.patchPath } : {}),
    bundlePath: decision.bundlePath,
    changedPaths: [...decision.changedPaths],
    changedRegions: [...decision.changedRegions],
    reason: decision.reason,
    finishedAt: decision.finishedAt
  };
}

function createDashboardHumanQuestionDetail(
  decision: FrontierCodexAutonomousMergeDecision,
  routing: FrontierCodexHumanAnswerRoutingSummary | undefined
): FrontierCodexDashboardHumanQuestionDetail | undefined {
  const questionContract = parseHumanQuestionContractLine(decision.reason);
  if (!questionContract) return undefined;
  const routed = routing?.routedDecisions.find((entry) => entry.decisionId === decision.id);
  const answered = dashboardHumanQuestionHasRoutedAnswer(decision, routing);
  return {
    id: decision.id,
    decisionId: decision.id,
    jobId: decision.jobId,
    ...(decision.taskId ? { taskId: decision.taskId } : {}),
    queueItemIds: [...decision.queueItemIds],
    questionIds: dashboardHumanQuestionIds(decision),
    questionCodes: dashboardHumanQuestionCodes(decision),
    questionContract,
    owner: questionContract.owner,
    surface: questionContract.surface,
    missingAuthority: questionContract.missingAuthority,
    question: questionContract.question,
    answerCode: questionContract.answerCode,
    reason: decision.reason,
    answered,
    answerIds: routed?.answerIds ?? [],
    answerRoutes: routed?.answerRoutes ?? [],
    answerTexts: routed?.answerTexts ?? [],
    answerEvidencePaths: routed?.answerEvidencePaths ?? []
  };
}

function createDashboardHumanQuestions(
  autoDrain: FrontierCodexSwarmAutoDrainResult | null,
  decisionSummary: DashboardAutonomousDecisionSummary
): FrontierCodexDashboardHumanQuestions {
  return {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_QUESTIONS_VERSION,
    source: autoDrain ? FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND : 'not-collected',
    available: !!autoDrain,
    count: decisionSummary.humanQuestionOpenDecisionCount,
    decisionCount: decisionSummary.humanQuestionDecisionCount,
    answeredCount: decisionSummary.humanAnswerRoutedDecisionCount,
    routedDecisionCount: decisionSummary.humanAnswerRoutedDecisionCount,
    questionIds: decisionSummary.humanQuestionIds,
    questionCodes: decisionSummary.humanQuestionCodes,
    openDecisionIds: decisionSummary.humanQuestionOpenDecisionIds,
    answeredDecisionIds: decisionSummary.humanQuestionAnsweredDecisionIds,
    jobIds: decisionSummary.humanQuestionJobIds,
    taskIds: decisionSummary.humanQuestionTaskIds,
    reasons: decisionSummary.humanQuestionReasons,
    answeredJobIds: decisionSummary.humanQuestionAnsweredJobIds,
    answeredTaskIds: decisionSummary.humanQuestionAnsweredTaskIds,
    routedDecisionIds: decisionSummary.humanAnswerRoutedDecisionIds,
    routedJobIds: decisionSummary.humanAnswerRoutedJobIds,
    routedTaskIds: decisionSummary.humanAnswerRoutedTaskIds,
    routedQuestionIds: decisionSummary.humanAnswerRoutedQuestionIds,
    routedQuestionCodes: decisionSummary.humanAnswerRoutedQuestionCodes,
    answerIds: decisionSummary.humanAnswerIds,
    answerRoutes: decisionSummary.humanAnswerRoutes,
    answerLogPaths: decisionSummary.humanAnswerLogPaths,
    answerEvidencePaths: decisionSummary.humanAnswerEvidencePaths,
    openQuestions: decisionSummary.humanQuestionOpenDetails,
    answeredQuestions: decisionSummary.humanQuestionAnsweredDetails
  };
}

function createDashboardHumanAnswers(autoDrain: FrontierCodexSwarmAutoDrainResult | null): FrontierCodexDashboardHumanAnswers {
  const routing = autoDrain?.humanAnswers;
  const answers = routing?.answers ?? [];
  const routedDecisions = routing?.routedDecisions ?? [];
  const routedContinuations = routing?.routedContinuations ?? [];
  const parseErrors = routing?.parseErrors ?? [];
  return {
    kind: FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_ANSWERS_KIND,
    version: FRONTIER_SWARM_CODEX_DASHBOARD_HUMAN_ANSWERS_VERSION,
    source: autoDrain ? FRONTIER_SWARM_CODEX_AUTO_DRAIN_KIND : 'not-collected',
    available: !!autoDrain,
    ...(routing ? { routingKind: routing.kind } : {}),
    ...(routing?.routingPath ? { routingPath: routing.routingPath } : {}),
    paths: routing?.paths ?? [],
    count: routing?.count ?? 0,
    answeredCount: routing?.count ?? 0,
    consumedCount: routing?.consumedCount ?? 0,
    routedDecisionCount: routing?.routedDecisionCount ?? 0,
    routedContinuationCount: routing?.routedContinuationCount ?? 0,
    ignoredCount: routing?.ignoredCount ?? 0,
    parseErrorCount: routing?.parseErrorCount ?? 0,
    answeredQuestionIds: routing?.answeredQuestionIds ?? [],
    answeredQuestionCodes: routing?.answeredQuestionCodes ?? [],
    routedDecisionIds: routing?.routedDecisionIds ?? [],
    routedContinuationIds: routing?.routedContinuationIds ?? [],
    routedJobIds: routing?.routedJobIds ?? [],
    routedTaskIds: routing?.routedTaskIds ?? [],
    routedQueueItemIds: routing?.routedQueueItemIds ?? [],
    answerIds: uniqueStrings(answers.map(humanActionAnswerIdentity)).sort(),
    answerRoutes: uniqueStrings(answers.flatMap((answer) => answer.routes)).sort(),
    evidencePaths: uniqueStrings(answers.flatMap((answer) => answer.evidencePaths)).sort(),
    answers,
    routedDecisions,
    routedContinuations,
    parseErrors
  };
}

function dashboardAutonomousDecisionIsExplicitHumanQuestion(decision: FrontierCodexAutonomousMergeDecision): boolean {
  return classifyCodexAutonomousDecisionCollapse(decision).humanNeeded;
}

function dashboardTextIsExplicitHumanQuestion(text: string): boolean {
  return parseHumanQuestionContractLine(text) !== undefined;
}

function parseHumanQuestionContractLine(text: string): FrontierCodexHumanQuestionContractFields | undefined {
  const raw = text.trim();
  if (!raw.toLowerCase().startsWith(DASHBOARD_EXPLICIT_HUMAN_QUESTION_REASON_PREFIX)) return undefined;
  const body = raw.slice(DASHBOARD_EXPLICIT_HUMAN_QUESTION_REASON_PREFIX.length).trim();
  if (!body) return undefined;
  const fields = new Map<string, string>();
  for (const part of body.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) return undefined;
    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (!key || !value || fields.has(key)) return undefined;
    fields.set(key, value);
  }
  for (const field of DASHBOARD_HUMAN_QUESTION_REQUIRED_FIELDS) {
    if (!fields.has(field)) return undefined;
  }
  const missingAuthority = fields.get('missing-authority')?.toLowerCase();
  if (!missingAuthority || !DASHBOARD_HUMAN_QUESTION_MISSING_AUTHORITY_VALUES.has(missingAuthority)) return undefined;
  const answerCode = fields.get('answer-code') ?? '';
  if (!humanQuestionAnswerCodeIsStructured(answerCode)) return undefined;
  return {
    raw,
    owner: fields.get('owner') ?? '',
    surface: fields.get('surface') ?? '',
    missingAuthority: missingAuthority as FrontierCodexHumanQuestionMissingAuthority,
    question: fields.get('question') ?? '',
    answerCode
  };
}

function humanQuestionAnswerCodeIsStructured(answerCode: string): boolean {
  const normalized = answerCode.trim();
  if (!normalized) return false;
  if (normalized === 'approve' || normalized === 'reject') return true;
  if (normalized === 'approve|reject' || normalized === 'reject|approve') return true;
  const match = /^(choose|provide):(.+)$/.exec(normalized);
  if (!match) return false;
  return match[2].split('|').every((option) => /^[a-z0-9][a-z0-9._:/-]*$/i.test(option.trim()));
}

function explicitHumanQuestionReasonFromBundle(bundle: FrontierSwarmMergeBundle): string | undefined {
  return bundle.reasons.find(dashboardTextIsExplicitHumanQuestion);
}

function latestDashboardAutonomousDecisions(
  decisions: readonly FrontierCodexAutonomousMergeDecision[]
): FrontierCodexAutonomousMergeDecision[] {
  // The ledger is append-only; dashboard debt is derived from the latest event per connected queue subject.
  return createDashboardAutonomousDecisionComponents(decisions)
    .map((component) => component.latest)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.decision);
}

interface DashboardAutonomousDecisionComponent {
  keys: Set<string>;
  latest: { decision: FrontierCodexAutonomousMergeDecision; index: number };
}

function createDashboardAutonomousDecisionComponents(
  decisions: readonly FrontierCodexAutonomousMergeDecision[]
): DashboardAutonomousDecisionComponent[] {
  const components: DashboardAutonomousDecisionComponent[] = [];
  const componentByKey = new Map<string, DashboardAutonomousDecisionComponent>();
  decisions.forEach((decision, index) => {
    const keys = dashboardAutonomousDecisionAliasKeys(decision);
    const existingComponents: DashboardAutonomousDecisionComponent[] = [];
    for (const key of keys) {
      const existing = componentByKey.get(key);
      if (existing && !existingComponents.includes(existing)) existingComponents.push(existing);
    }
    const component = existingComponents[0] ?? {
      keys: new Set<string>(),
      latest: { decision, index }
    };
    if (existingComponents.length === 0) {
      components.push(component);
    } else {
      for (const existing of existingComponents.slice(1)) {
        for (const key of existing.keys) {
          component.keys.add(key);
          componentByKey.set(key, component);
        }
        if (existing.latest.index > component.latest.index) component.latest = existing.latest;
        const existingIndex = components.indexOf(existing);
        if (existingIndex >= 0) components.splice(existingIndex, 1);
      }
    }
    for (const key of keys) {
      component.keys.add(key);
      componentByKey.set(key, component);
    }
    if (index >= component.latest.index) component.latest = { decision, index };
  });
  return components;
}

function dashboardAutonomousDecisionQueueKeys(decision: FrontierCodexAutonomousMergeDecision): string[] {
  return dashboardQueueSubjectKeys(decision);
}

function dashboardAutonomousDecisionAliasKeys(decision: FrontierCodexAutonomousMergeDecision): string[] {
  return dashboardQueueSubjectAliasKeys(decision);
}

function dashboardHumanQuestionIds(decision: FrontierCodexAutonomousMergeDecision): string[] {
  return [decision.id];
}

function dashboardHumanQuestionCodes(decision: FrontierCodexAutonomousMergeDecision): string[] {
  return dashboardAutonomousDecisionQueueKeys(decision);
}

function dashboardHumanQuestionHasRoutedAnswer(
  decision: FrontierCodexAutonomousMergeDecision,
  routing: FrontierCodexHumanAnswerRoutingSummary | undefined
): boolean {
  if (!routing?.available) return false;
  if (routing.routedDecisionIds.includes(decision.id)) return true;
  const answerKeys = new Set<string>();
  for (const questionId of routing.answeredQuestionIds) addHumanAnswerQuestionIdKeys(answerKeys, questionId);
  for (const questionCode of routing.answeredQuestionCodes) addHumanAnswerQuestionCodeKeys(answerKeys, questionCode);
  return dashboardHumanQuestionMatchKeys(decision).some((key) => answerKeys.has(key));
}

function createHumanQuestionContinuations(
  iterations: readonly FrontierCodexSwarmAutoDrainIteration[]
): FrontierCodexHumanQuestionContinuation[] {
  const latestIteration = iterations.at(-1);
  const latestCollection = latestIteration?.postApplyCollection ?? latestIteration?.collection;
  if (!latestCollection) return [];
  const entriesByJobId = collectionEntriesByJobId(latestCollection);
  const assignments = latestCollection.hierarchicalMergeQueue?.assignments ?? [];
  const continuations = new Map<string, FrontierCodexHumanQuestionContinuation>();
  for (const assignment of assignments) {
    if (assignment.action !== 'block') continue;
    const entry = entriesByJobId.get(assignment.jobId);
    if (!entry) continue;
    const reason = explicitHumanQuestionReasonFromBundle(entry.bundle)
      ?? assignment.reasons.find(dashboardTextIsExplicitHumanQuestion);
    if (!reason) continue;
    const continuation = createHumanQuestionContinuationFromCollectionEntry(entry, reason, [assignment.action], {
      taskId: assignment.taskId,
      queueItemIds: assignment.queueItemIds
    });
    continuations.set(continuation.id, continuation);
  }
  for (const entry of Object.values(latestCollection.buckets).flat()) {
    const reason = explicitHumanQuestionReasonFromBundle(entry.bundle);
    if (!reason) continue;
    const continuation = createHumanQuestionContinuationFromCollectionEntry(entry, reason, []);
    if (!continuations.has(continuation.id)) continuations.set(continuation.id, continuation);
  }
  return [...continuations.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function createHumanQuestionContinuationFromCollectionEntry(
  entry: FrontierCodexCollectedBundle,
  reason: string,
  queueActions: readonly FrontierSwarmMergeQueueAssignmentAction[],
  subjectOverride: { taskId?: string; queueItemIds?: readonly string[] } = {}
): FrontierCodexHumanQuestionContinuation {
  const mergePath = path.join(entry.outputDir, 'merge.json');
  const patchPath = resolveBundlePatchPath(entry.bundle, mergePath);
  const questionContract = parseHumanQuestionContractLine(reason);
  const taskId = subjectOverride.taskId ?? entry.bundle.taskId;
  const queueItemIds = uniqueStrings([
    ...(subjectOverride.queueItemIds ?? []),
    ...entry.bundle.queueItemIds,
    ...(taskId ? [taskId] : [])
  ]).sort();
  const subject = { jobId: entry.jobId, ...(taskId ? { taskId } : {}), queueItemIds };
  const questionCodes = dashboardQueueSubjectKeys(subject);
  const id = `frontier-swarm-codex-human-question-continuation:${stableHash([entry.jobId, taskId, queueItemIds, reason])}`;
  return {
    id,
    source: 'merge-queue',
    jobId: entry.jobId,
    ...(taskId ? { taskId } : {}),
    queueItemIds,
    questionIds: [id],
    questionCodes,
    ...(questionContract ? { questionContract } : {}),
    reason,
    bundlePath: mergePath,
    ...(patchPath ? { patchPath } : {}),
    changedPaths: [...entry.bundle.changedPaths],
    changedRegions: [...entry.bundle.changedRegions],
    allowedWrites: [...entry.bundle.allowedWrites],
    evidencePaths: [...entry.bundle.evidencePaths],
    queueActions: uniqueStrings(queueActions) as FrontierSwarmMergeQueueAssignmentAction[]
  };
}

async function createHumanAnswerRoutingSummary(input: {
  cwd: string;
  runDir: string;
  autoDrainOutDir: string;
  configuredPath?: string;
  routingPath: string;
  decisions: readonly FrontierCodexAutonomousMergeDecision[];
  continuations?: readonly FrontierCodexHumanQuestionContinuation[];
}): Promise<FrontierCodexHumanAnswerRoutingSummary> {
  const paths = await resolveHumanActionAnswerLogPaths(input);
  const parseErrors: Array<{ path: string; line: number; error: string }> = [];
  const answers: FrontierCodexHumanActionAnswer[] = [];
  for (const file of paths) {
    const text = await fs.readFile(file, 'utf8').catch((error) => {
      parseErrors.push({ path: file, line: 0, error: error instanceof Error ? error.message : String(error) });
      return '';
    });
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      try {
        const parsed = JSON.parse(line) as unknown;
        const answer = normalizeHumanActionAnswer(parsed, file, index + 1);
        if (answer) answers.push(answer);
      } catch (error) {
        parseErrors.push({ path: file, line: index + 1, error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  const answerKeyIndex = indexHumanActionAnswersByKey(answers);
  const routedDecisions: FrontierCodexHumanAnswerRoutedDecision[] = latestDashboardAutonomousDecisions(input.decisions)
    .filter(dashboardAutonomousDecisionIsExplicitHumanQuestion)
    .map((decision) => createHumanAnswerRoutedDecision(decision, answerKeyIndex))
    .filter((entry): entry is FrontierCodexHumanAnswerRoutedDecision => !!entry);
  const routedContinuations: FrontierCodexHumanAnswerRoutedContinuation[] = (input.continuations ?? [])
    .map((continuation) => createHumanAnswerRoutedContinuation(continuation, answerKeyIndex))
    .filter((entry): entry is FrontierCodexHumanAnswerRoutedContinuation => !!entry);
  const consumedAnswerKeys = new Set([
    ...routedDecisions.flatMap((decision) => decision.answerIds),
    ...routedContinuations.flatMap((continuation) => continuation.answerIds)
  ]);
  const routedAnswers = answers.map((answer) => ({
    ...answer,
    consumed: consumedAnswerKeys.has(humanActionAnswerIdentity(answer))
  }));
  const evidencePaths = uniqueStrings(routedAnswers.filter((answer) => answer.consumed).flatMap((answer) => answer.evidencePaths)).sort();
  const summary: FrontierCodexHumanAnswerRoutingSummary = {
    kind: FRONTIER_SWARM_CODEX_HUMAN_ANSWER_ROUTING_KIND,
    version: FRONTIER_SWARM_CODEX_HUMAN_ANSWER_ROUTING_VERSION,
    source: 'human-action-answers.jsonl',
    available: paths.length > 0,
    paths,
    ...(paths.length ? { routingPath: input.routingPath } : {}),
    count: routedAnswers.length,
    consumedCount: routedAnswers.filter((answer) => answer.consumed).length,
    routedDecisionCount: routedDecisions.length,
    routedContinuationCount: routedContinuations.length,
    ignoredCount: routedAnswers.filter((answer) => !answer.consumed).length,
    parseErrorCount: parseErrors.length,
    answeredQuestionIds: uniqueStrings([
      ...routedDecisions.flatMap((decision) => decision.questionIds),
      ...routedContinuations.flatMap((continuation) => continuation.questionIds)
    ]).sort(),
    answeredQuestionCodes: uniqueStrings([
      ...routedDecisions.flatMap((decision) => decision.questionCodes),
      ...routedContinuations.flatMap((continuation) => continuation.questionCodes)
    ]).sort(),
    routedDecisionIds: uniqueStrings(routedDecisions.map((decision) => decision.decisionId)).sort(),
    routedContinuationIds: uniqueStrings(routedContinuations.map((continuation) => continuation.continuationId)).sort(),
    routedJobIds: uniqueStrings([
      ...routedDecisions.map((decision) => decision.jobId),
      ...routedContinuations.map((continuation) => continuation.jobId)
    ]).sort(),
    routedTaskIds: uniqueStrings([
      ...routedDecisions.map((decision) => decision.taskId).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
      ...routedContinuations.map((continuation) => continuation.taskId).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    ]).sort(),
    routedQueueItemIds: uniqueStrings([
      ...routedDecisions.flatMap((decision) => decision.queueItemIds),
      ...routedContinuations.flatMap((continuation) => continuation.queueItemIds)
    ]).sort(),
    evidencePaths,
    answers: routedAnswers,
    routedDecisions,
    routedContinuations,
    parseErrors
  };
  if (paths.length) await writeJsonAtomic(input.routingPath, summary);
  return summary;
}

async function resolveHumanActionAnswerLogPaths(input: {
  cwd: string;
  runDir: string;
  autoDrainOutDir: string;
  configuredPath?: string;
}): Promise<string[]> {
  const candidates = input.configuredPath
    ? [resolveMaybeRelativePath(input.cwd, input.configuredPath)]
    : [
        ...DEFAULT_HUMAN_ACTION_ANSWER_LOG_FILENAMES.map((name) => path.join(input.runDir, name)),
        ...DEFAULT_HUMAN_ACTION_ANSWER_LOG_FILENAMES.map((name) => path.join(input.autoDrainOutDir, name))
      ];
  const existing: string[] = [];
  for (const candidate of uniqueStrings(candidates.map((entry) => path.resolve(input.cwd, entry)))) {
    if (await pathExists(candidate)) existing.push(candidate);
  }
  return existing;
}

function resolveMaybeRelativePath(cwd: string, file: string): string {
  return path.isAbsolute(file) ? file : path.resolve(cwd, file);
}

function normalizeHumanActionAnswer(value: unknown, sourcePath: string, line: number): FrontierCodexHumanActionAnswer | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const input = value as Record<string, unknown>;
  if (!humanActionAnswerIsConsumable(input)) return undefined;
  const questionIds = uniqueStrings([
    ...readStringValues(input.questionIds),
    ...readStringValues(input.questionId),
    ...readStringValues(input.question)
  ]).sort();
  const questionCodes = uniqueStrings([
    ...readStringValues(input.questionCodes),
    ...readStringValues(input.questionCode),
    ...readStringValues(input.code)
  ]).sort();
  const decisionIds = uniqueStrings([
    ...readStringValues(input.decisionIds),
    ...readStringValues(input.decisionId)
  ]).sort();
  const jobIds = uniqueStrings([
    ...readStringValues(input.jobIds),
    ...readStringValues(input.jobId)
  ]).sort();
  const taskIds = uniqueStrings([
    ...readStringValues(input.taskIds),
    ...readStringValues(input.taskId)
  ]).sort();
  const queueItemIds = uniqueStrings([
    ...readStringValues(input.queueItemIds),
    ...readStringValues(input.queueItemId)
  ]).sort();
  const routes = uniqueStrings([
    ...readStringValues(input.route),
    ...readStringValues(input.routing),
    ...readStringValues(input.action),
    ...readStringValues(input.status),
    ...readStringValues(input.decision)
  ]).sort();
  const evidencePaths = uniqueStrings([
    ...readStringValues(input.evidencePaths),
    ...readStringValues(input.evidencePath)
  ]).sort();
  const answer = readFirstString(input.answer, input.response, input.resolution, input.decision, input.value);
  return {
    ...(readFirstString(input.id, input.answerId) ? { id: readFirstString(input.id, input.answerId) } : {}),
    sourcePath,
    line,
    consumed: false,
    questionIds,
    questionCodes,
    decisionIds,
    jobIds,
    taskIds,
    queueItemIds,
    routes,
    evidencePaths,
    ...(answer ? { answer } : {})
  };
}

function humanActionAnswerIsConsumable(input: Record<string, unknown>): boolean {
  const status = readFirstString(input.status, input.state)?.trim().toLowerCase();
  if (status && ['open', 'pending', 'unanswered', 'needs-answer', 'needs-human-answer'].includes(status)) return false;
  return [
    input.questionId,
    input.questionIds,
    input.questionCode,
    input.questionCodes,
    input.decisionId,
    input.decisionIds,
    input.queueItemId,
    input.queueItemIds,
    input.taskId,
    input.taskIds,
    input.jobId,
    input.jobIds
  ].some((entry) => readStringValues(entry).length > 0);
}

function indexHumanActionAnswersByKey(answers: readonly FrontierCodexHumanActionAnswer[]): Map<string, FrontierCodexHumanActionAnswer[]> {
  const index = new Map<string, FrontierCodexHumanActionAnswer[]>();
  for (const answer of answers) {
    const keys = humanActionAnswerMatchKeys(answer);
    for (const key of keys) {
      const entries = index.get(key) ?? [];
      entries.push(answer);
      index.set(key, entries);
    }
  }
  return index;
}

function createHumanAnswerRoutedDecision(
  decision: FrontierCodexAutonomousMergeDecision,
  answerKeyIndex: Map<string, FrontierCodexHumanActionAnswer[]>
): FrontierCodexHumanAnswerRoutedDecision | undefined {
  const matches = uniqueHumanActionAnswers(
    dashboardHumanQuestionMatchKeys(decision).flatMap((key) => answerKeyIndex.get(key) ?? [])
  );
  if (!matches.length) return undefined;
  const questionContract = parseHumanQuestionContractLine(decision.reason);
  return {
    decisionId: decision.id,
    jobId: decision.jobId,
    ...(decision.taskId ? { taskId: decision.taskId } : {}),
    queueItemIds: [...decision.queueItemIds],
    questionIds: dashboardHumanQuestionIds(decision),
    questionCodes: dashboardHumanQuestionCodes(decision),
    ...(questionContract ? { questionContract } : {}),
    reason: decision.reason,
    answerIds: matches.map(humanActionAnswerIdentity),
    answerRoutes: uniqueStrings(matches.flatMap((answer) => answer.routes)).sort(),
    answerTexts: uniqueStrings(matches.map((answer) => answer.answer).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)).sort(),
    answerEvidencePaths: uniqueStrings(matches.flatMap((answer) => answer.evidencePaths)).sort()
  };
}

function createHumanAnswerRoutedContinuation(
  continuation: FrontierCodexHumanQuestionContinuation,
  answerKeyIndex: Map<string, FrontierCodexHumanActionAnswer[]>
): FrontierCodexHumanAnswerRoutedContinuation | undefined {
  const matches = uniqueHumanActionAnswers(
    humanQuestionContinuationMatchKeys(continuation).flatMap((key) => answerKeyIndex.get(key) ?? [])
  );
  if (!matches.length) return undefined;
  return {
    continuationId: continuation.id,
    source: continuation.source,
    jobId: continuation.jobId,
    ...(continuation.taskId ? { taskId: continuation.taskId } : {}),
    queueItemIds: [...continuation.queueItemIds],
    questionIds: [...continuation.questionIds],
    questionCodes: [...continuation.questionCodes],
    ...(continuation.questionContract ? { questionContract: continuation.questionContract } : {}),
    reason: continuation.reason,
    ...(continuation.bundlePath ? { bundlePath: continuation.bundlePath } : {}),
    ...(continuation.patchPath ? { patchPath: continuation.patchPath } : {}),
    answerIds: matches.map(humanActionAnswerIdentity),
    answerRoutes: uniqueStrings(matches.flatMap((answer) => answer.routes)).sort(),
    answerTexts: uniqueStrings(matches.map((answer) => answer.answer).filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)).sort(),
    answerEvidencePaths: uniqueStrings(matches.flatMap((answer) => answer.evidencePaths)).sort()
  };
}

function uniqueHumanActionAnswers(answers: readonly FrontierCodexHumanActionAnswer[]): FrontierCodexHumanActionAnswer[] {
  const seen = new Set<string>();
  const result: FrontierCodexHumanActionAnswer[] = [];
  for (const answer of answers) {
    const key = humanActionAnswerIdentity(answer);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(answer);
  }
  return result;
}

function humanActionAnswerIdentity(answer: FrontierCodexHumanActionAnswer): string {
  return answer.id ? `answer:${answer.id}` : `${answer.sourcePath}:${answer.line}`;
}

function humanActionAnswerMatchKeys(answer: FrontierCodexHumanActionAnswer): string[] {
  const keys = new Set<string>();
  for (const decisionId of answer.decisionIds) addHumanAnswerDecisionIdKeys(keys, decisionId);
  for (const questionId of answer.questionIds) addHumanAnswerQuestionIdKeys(keys, questionId);
  for (const questionCode of answer.questionCodes) addHumanAnswerQuestionCodeKeys(keys, questionCode);
  for (const queueItemId of answer.queueItemIds) addHumanAnswerQueueItemKeys(keys, queueItemId);
  for (const taskId of answer.taskIds) addHumanAnswerTaskKeys(keys, taskId);
  for (const jobId of answer.jobIds) addHumanAnswerJobKeys(keys, jobId);
  return [...keys].sort();
}

function dashboardHumanQuestionMatchKeys(decision: FrontierCodexAutonomousMergeDecision): string[] {
  const keys = new Set<string>();
  addHumanAnswerDecisionIdKeys(keys, decision.id);
  addHumanAnswerQuestionIdKeys(keys, decision.id);
  for (const code of dashboardHumanQuestionCodes(decision)) addHumanAnswerQuestionCodeKeys(keys, code);
  for (const queueItemId of decision.queueItemIds) addHumanAnswerQueueItemKeys(keys, queueItemId);
  if (decision.taskId) addHumanAnswerTaskKeys(keys, decision.taskId);
  addHumanAnswerJobKeys(keys, decision.jobId);
  return [...keys].sort();
}

function humanQuestionContinuationMatchKeys(continuation: FrontierCodexHumanQuestionContinuation): string[] {
  const keys = new Set<string>();
  for (const questionId of continuation.questionIds) addHumanAnswerQuestionIdKeys(keys, questionId);
  for (const questionCode of continuation.questionCodes) addHumanAnswerQuestionCodeKeys(keys, questionCode);
  for (const queueItemId of continuation.queueItemIds) addHumanAnswerQueueItemKeys(keys, queueItemId);
  if (continuation.taskId) addHumanAnswerTaskKeys(keys, continuation.taskId);
  addHumanAnswerJobKeys(keys, continuation.jobId);
  return [...keys].sort();
}

function addHumanAnswerDecisionIdKeys(keys: Set<string>, value: string): void {
  const normalized = value.trim();
  if (!normalized) return;
  keys.add(`decision:${normalized}`);
  keys.add(`question:${normalized}`);
  addPrefixedHumanAnswerKey(keys, normalized);
}

function addHumanAnswerQuestionIdKeys(keys: Set<string>, value: string): void {
  const normalized = value.trim();
  if (!normalized) return;
  keys.add(`question:${normalized}`);
  addPrefixedHumanAnswerKey(keys, normalized);
}

function addHumanAnswerQuestionCodeKeys(keys: Set<string>, value: string): void {
  const normalized = value.trim();
  if (!normalized) return;
  keys.add(`question-code:${normalized}`);
  keys.add(`question:${normalized}`);
  keys.add(`queue:${normalized}`);
  keys.add(`task:${normalized}`);
  keys.add(`job:${normalized}`);
  addPrefixedHumanAnswerKey(keys, normalized);
}

function addHumanAnswerQueueItemKeys(keys: Set<string>, value: string): void {
  const normalized = value.trim();
  if (!normalized) return;
  keys.add(`queue:${normalized}`);
  keys.add(`question:${normalized}`);
  addPrefixedHumanAnswerKey(keys, normalized);
}

function addHumanAnswerTaskKeys(keys: Set<string>, value: string): void {
  const normalized = value.trim();
  if (!normalized) return;
  keys.add(`task:${normalized}`);
  keys.add(`question:${normalized}`);
  addPrefixedHumanAnswerKey(keys, normalized);
}

function addHumanAnswerJobKeys(keys: Set<string>, value: string): void {
  const normalized = value.trim();
  if (!normalized) return;
  keys.add(`job:${normalized}`);
  keys.add(`question:${normalized}`);
  addPrefixedHumanAnswerKey(keys, normalized);
}

function addPrefixedHumanAnswerKey(keys: Set<string>, value: string): void {
  if (/^(decision|question|question-code|queue|task|job):/.test(value)) keys.add(value);
}

function readFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function readStringValues(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  return [];
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
  entries.push({ ...entry, status: entry.status ?? 'running' });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeJsonAtomic(file, { ...manifest, ...(runId ? { runId } : {}), entries });
}

export async function readCodexPidManifest(file: string): Promise<FrontierCodexPidManifest> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as FrontierCodexPidManifest;
}

async function finishCodexPidManifestEntry(
  file: string,
  match: { pid: number; role?: string; jobId?: string },
  update: { finishedAt: number; exitCode?: number; signal?: string },
  runId?: string
): Promise<void> {
  const absolute = path.resolve(file);
  const previous = pidManifestWriteQueues.get(absolute) ?? Promise.resolve();
  let next: Promise<void>;
  next = previous
    .catch(() => {})
    .then(() => finishCodexPidManifestEntryUnlocked(absolute, match, update, runId))
    .finally(() => {
      if (pidManifestWriteQueues.get(absolute) === next) pidManifestWriteQueues.delete(absolute);
    });
  pidManifestWriteQueues.set(absolute, next);
  return next;
}

async function finishCodexPidManifestEntryUnlocked(
  file: string,
  match: { pid: number; role?: string; jobId?: string },
  update: { finishedAt: number; exitCode?: number; signal?: string },
  runId?: string
): Promise<void> {
  const manifest = await readCodexPidManifest(file).catch(() => undefined);
  if (!manifest) return;
  const entries = manifest.entries.map((entry) => {
    if (!codexPidEntryMatches(entry, match)) return entry;
    return {
      ...entry,
      status: 'finished' as const,
      finishedAt: update.finishedAt,
      ...(update.exitCode !== undefined ? { exitCode: update.exitCode } : {}),
      ...(update.signal ? { signal: update.signal } : {})
    };
  });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeJsonAtomic(file, { ...manifest, ...(runId ? { runId } : {}), entries });
}

function codexPidEntryMatches(entry: FrontierCodexPidEntry, match: { pid: number; role?: string; jobId?: string }): boolean {
  if (entry.pid !== match.pid) return false;
  if (match.role !== undefined && entry.role !== match.role) return false;
  if (match.jobId !== undefined && entry.jobId !== match.jobId) return false;
  return true;
}

function codexPidEntryIsActive(entry: FrontierCodexPidEntry): boolean {
  return entry.finishedAt === undefined && entry.status !== 'finished';
}

export async function stopCodexSwarmRun(input: { run: string; signal?: NodeJS.Signals }): Promise<FrontierCodexStopResult> {
  const signal = input.signal ?? 'SIGTERM';
  const pidManifestPath = await resolvePidManifestPath(input.run);
  const manifest = await readCodexPidManifest(pidManifestPath);
  const stopped: number[] = [];
  const missing: number[] = [];
  const errors: Array<{ pid: number; error: string }> = [];
  for (const entry of manifest.entries.filter((item) => item.pid !== process.pid && codexPidEntryIsActive(item)).sort((left, right) => right.startedAt - left.startedAt)) {
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
  const collectionHead = await readCurrentGitHead(cwd);
  const buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]> = {
    'ready-to-apply': [],
    'coordinator-review': [],
    'failed-evidence': [],
    'stale-against-head': []
  };
  const collectedBundles: FrontierSwarmMergeBundle[] = [];
  const patchStatuses: Record<string, 'unknown' | 'applies' | 'missing' | 'stale'> = {};
  const ignoredCollectionSegments = [
    'collected',
    'patch-scores',
    'ready-to-apply',
    FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET,
    FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_BUCKET,
    'failed-evidence',
    'stale-against-head'
  ];
  const mergePaths = (await findFilesByName(runDir, 'merge.json'))
    .filter((mergePath) => !pathHasIgnoredSegment(path.relative(runDir, mergePath), ignoredCollectionSegments));
  const mergeRecordsByJob = new Map<string, CodexCollectMergeRecord>();
  for (const mergePath of mergePaths.sort()) {
    const bundle = normalizeCollectedMergeBundle(JSON.parse(await fs.readFile(mergePath, 'utf8')), mergePath);
    const existing = mergeRecordsByJob.get(bundle.jobId);
    const next = { mergePath, bundle };
    if (!existing || mergeRecordScore(next) > mergeRecordScore(existing)) mergeRecordsByJob.set(bundle.jobId, next);
  }
  const patchOnlyRecords = await collectPatchOnlyMergeRecords({
    runDir,
    cwd,
    ignoredCollectionSegments,
    existingJobIds: new Set(mergeRecordsByJob.keys())
  });
  for (const record of patchOnlyRecords) {
    if (!mergeRecordsByJob.has(record.bundle.jobId)) mergeRecordsByJob.set(record.bundle.jobId, record);
  }
  const patchOnlyJobIds = new Set(patchOnlyRecords.map((record) => record.bundle.jobId));
  const mergeRecords = Array.from(mergeRecordsByJob.values()).sort((left, right) => left.bundle.jobId.localeCompare(right.bundle.jobId));
  let promotedPatchCandidateCount = 0;
  for (const { mergePath, bundle, patchOnly } of mergeRecords) {
    const patchPath = resolveBundlePatchPath(bundle, mergePath);
    const patchExists = !!patchPath && await pathExists(patchPath);
    const staleAgainstHead = input.checkStale === false ? false : await bundlePatchIsStale(bundle, mergePath, cwd);
    const collectBundle = input.promotePatchCandidates && hasCollectBundleCoordinatorVerification(bundle, input)
      ? promoteCodexPatchCandidateBundle(bundle, { patchExists, staleAgainstHead })
      : bundle;
    if (collectBundle !== bundle) promotedPatchCandidateCount += 1;
    const bucket = classifyCodexCollectBucket(collectBundle, staleAgainstHead);
    const outputBundle = normalizeCodexCoordinatorReviewMergeBundle(collectBundle);
    const branchName = input.branchPrefix ? `${input.branchPrefix}/${slug(bundle.jobId)}` : bundle.branchName;
    const nextBundle = withCodexCollectionHeadMetadata({
      ...outputBundle,
      ...(branchName ? { branchName } : {}),
      staleAgainstHead: outputBundle.staleAgainstHead || staleAgainstHead,
      disposition: staleAgainstHead ? 'stale-against-head' : outputBundle.disposition,
      autoMergeable: bucket === 'ready-to-apply' && outputBundle.autoMergeable
    }, {
      currentHead: collectionHead,
      generatedAt,
      staleChecked: input.checkStale !== false,
      patchApplies: !staleAgainstHead && patchExists
    });
    collectedBundles.push(nextBundle);
    patchStatuses[nextBundle.jobId] = staleAgainstHead ? 'stale' : patchExists ? input.checkStale === false ? 'unknown' : 'applies' : 'missing';
    const outputDir = path.join(outDir, bucket, slug(bundle.jobId));
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'merge.json'), JSON.stringify(nextBundle, null, 2) + '\n');
    if (patchPath && await pathExists(patchPath)) await fs.copyFile(patchPath, path.join(outputDir, 'changes.patch')).catch(() => {});
    buckets[bucket].push({
      bucket,
      jobId: bundle.jobId,
      mergePath,
      ...(patchOnly ? { patchOnly: true } : {}),
      ...(patchOnly && patchPath ? { patchPath } : {}),
      outputDir,
      bundle: nextBundle
    });
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
  const queueOverlay = createCodexCollectionQueueOverlay({
    runId: path.basename(runDir),
    bundles: collectedBundles
  });
  const summary = {
    total: mergeRecords.length,
    'ready-to-apply': buckets['ready-to-apply'].length,
    'coordinator-review': buckets['coordinator-review'].length,
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
    mergeQueueRecordOnlyCount: hierarchicalMergeQueue.summary.recordOnlyCount,
    promotedPatchCandidateCount,
    patchOnlyCount: patchOnlyJobIds.size
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
      'coordinator-review': path.join(input.outDir, FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET),
      'failed-evidence': path.join(input.outDir, 'failed-evidence'),
      'stale-against-head': path.join(input.outDir, 'stale-against-head')
    },
    counts: {
      groupedBundleCount: input.summary.total,
      readyToApplyCount: input.summary['ready-to-apply'],
      coordinatorReviewCount: input.summary['coordinator-review'],
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
      promotedPatchCandidateCount: input.summary.promotedPatchCandidateCount ?? 0,
      patchOnlyCount: input.summary.patchOnlyCount ?? 0,
      patchCount: Object.values(input.patchStatuses).filter((status) => status !== 'missing').length
    }
  };
}

function collectArtifactsForSnapshot(collection: FrontierCodexCollectResult): FrontierCodexCollectArtifacts {
  if (collection.artifacts) return normalizeCodexCollectArtifactsForSnapshot(collection.artifacts, collection);
  return {
    collectionPath: path.join(collection.outDir, 'collection.json'),
    mergeIndexPath: path.join(collection.outDir, 'merge-index.json'),
    hierarchicalMergeQueuePath: path.join(collection.outDir, 'hierarchical-merge-queue.json'),
    queueOverlayPath: path.join(collection.outDir, 'queue-overlay.json'),
    mergeAdmissionPath: path.join(collection.outDir, 'merge-admission.json'),
    reviewerLanePlanPath: path.join(collection.outDir, 'reviewer-lane-plan.json'),
    patchStackPlanPath: path.join(collection.outDir, 'patch-stack-plan.json'),
    bucketDirs: {
      'ready-to-apply': path.join(collection.outDir, 'ready-to-apply'),
      'coordinator-review': path.join(collection.outDir, FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET),
      'failed-evidence': path.join(collection.outDir, 'failed-evidence'),
      'stale-against-head': path.join(collection.outDir, 'stale-against-head')
    },
    counts: {
      groupedBundleCount: collection.summary.total,
      readyToApplyCount: collection.summary['ready-to-apply'],
      coordinatorReviewCount: readCollectionCoordinatorReviewCount(collection.summary),
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
      promotedPatchCandidateCount: collection.summary.promotedPatchCandidateCount ?? 0,
      patchOnlyCount: collection.summary.patchOnlyCount ?? 0,
      patchCount: 0
    }
  };
}

function normalizeCodexCollectArtifactsForSnapshot(
  artifacts: FrontierCodexCollectArtifacts,
  collection: FrontierCodexCollectResult
): FrontierCodexCollectArtifacts {
  const counts = artifacts.counts as FrontierCodexCollectArtifacts['counts'] & { needsHumanPortCount?: number };
  return {
    ...artifacts,
    bucketDirs: {
      ...artifacts.bucketDirs,
      'coordinator-review': artifacts.bucketDirs['coordinator-review'] ?? path.join(collection.outDir, FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET)
    },
    counts: {
      ...artifacts.counts,
      coordinatorReviewCount: counts.coordinatorReviewCount ?? counts.needsHumanPortCount ?? readCollectionCoordinatorReviewCount(collection.summary)
    }
  };
}

function readCollectionCoordinatorReviewCount(
  summary: Partial<Record<FrontierCodexCollectBucket | FrontierCodexLegacyCollectBucket, number>>
): number {
  return summary[FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET]
    ?? summary[FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_BUCKET]
    ?? 0;
}

function createAutoDrainArtifactMetadata(input: {
  outDir: string;
  autoDrainPath: string;
  generatedAt?: number;
  iterations: readonly FrontierCodexSwarmAutoDrainIteration[];
  rerunManifest?: FrontierCodexAutoDrainRerunManifest;
}): FrontierCodexAutoDrainArtifactMetadata {
  const iterations: FrontierCodexAutoDrainArtifactIteration[] = input.iterations.map((iteration) => {
    const collectionArtifacts = collectArtifactsForSnapshot(iteration.collection);
    const applyPath = iteration.apply ? path.join(iteration.apply.outDir, 'autonomous-apply.json') : undefined;
    const autonomousQueueOverlayPath = iteration.apply ? path.join(iteration.apply.outDir, 'autonomous-queue-overlay.json') : undefined;
    const decisionProof = summarizeAutonomousDecisionProof(iteration.apply?.decisions ?? []);
    const finalGateSummary = summarizeAutonomousFinalGateRun(iteration.apply?.decisions ?? []);
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
      coordinatorAgentDrainWorkPath: iteration.coordinatorAgentDrainWorkPath,
      ...(iteration.postApplyCollectionPath ? { postApplyCollectionPath: iteration.postApplyCollectionPath } : {}),
      groupingPath: iteration.groupingPath,
      ...(applyPath ? { applyPath } : {}),
      ...(autonomousQueueOverlayPath ? { autonomousQueueOverlayPath } : {}),
      ...(iteration.apply?.decisionLogPath ? { decisionLogPath: iteration.apply.decisionLogPath } : {}),
      patchPaths,
      readyJobCount: iteration.readyJobIds.length,
      groupedBundleCount: collectionArtifacts.counts.groupedBundleCount,
      readyToApplyCount: collectionArtifacts.counts.readyToApplyCount,
      coordinatorReviewCount: collectionArtifacts.counts.coordinatorReviewCount,
      failedEvidenceCount: collectionArtifacts.counts.failedEvidenceCount,
      staleAgainstHeadCount: collectionArtifacts.counts.staleAgainstHeadCount,
      decisionCount: iteration.apply?.decisions.length ?? 0,
      committedDecisionCount: decisionProof.committedDecisionCount,
      gatedDecisionCount: decisionProof.gatedDecisionCount,
      verificationGateCount: decisionProof.verificationGateCount,
      requiredVerificationGateCount: decisionProof.requiredVerificationGateCount,
      finalGateSummary,
      finalGateOk: finalGateSummary.ok,
      finalGateState: finalGateSummary.state,
      failedRequiredGateCount: finalGateSummary.failedRequiredGateCount,
      skippedRequiredGateCount: finalGateSummary.skippedRequiredGateCount,
      finalGateContinuationDecisionCount: finalGateSummary.continuationDecisionCount,
      finalGateContinuationSkippedRequiredGateCount: finalGateSummary.continuationSkippedRequiredGateCount,
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
      mergeQueueRecordOnlyCount: collectionArtifacts.counts.mergeQueueRecordOnlyCount,
      promotedPatchCandidateCount: collectionArtifacts.counts.promotedPatchCandidateCount
    };
  });
  const admissionPaths = compactArtifactPaths(iterations.map((iteration) => iteration.mergeAdmissionPath));
  const coordinatorAgentPaths = compactArtifactPaths(iterations.map((iteration) => iteration.coordinatorAgentDrainPath));
  const coordinatorAgentDrainWorkPaths = compactArtifactPaths(iterations.map((iteration) => iteration.coordinatorAgentDrainWorkPath));
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
  const rerunManifestPaths = compactArtifactPaths([input.rerunManifest?.path]);
  const rerunManifestTerminalState = input.rerunManifest?.summary.terminalState ?? 'missing';
  const sum = (select: (iteration: FrontierCodexAutoDrainArtifactIteration) => number): number =>
    iterations.reduce((total, iteration) => total + select(iteration), 0);
  const finalGateSummary = summarizeAutonomousFinalGateRun(input.iterations.flatMap((iteration) => iteration.apply?.decisions ?? []));
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
      coordinatorReviewCount: sum((iteration) => iteration.coordinatorReviewCount),
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
    coordinatorAgentDrainWork: {
      paths: coordinatorAgentDrainWorkPaths,
      count: coordinatorAgentDrainWorkPaths.length,
      leaseCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.leaseCount, 0),
      assignmentCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.assignmentCount, 0),
      terminalCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.terminalCount, 0),
      nonTerminalCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.nonTerminalCount, 0),
      promotedWorkCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.promotedWorkCount, 0),
      appliedCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.appliedCount, 0),
      queuedCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.queuedCount, 0),
      escalatedCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.escalatedCount, 0),
      rerunCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.rerunCount, 0),
      rejectedCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.rejectedCount, 0),
      recordedCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.recordedCount, 0),
      blockedCount: input.iterations.reduce((total, iteration) => total + iteration.coordinatorAgentDrainWork.summary.blockedCount, 0)
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
      recordOnlyCount: sum((iteration) => iteration.mergeQueueRecordOnlyCount),
      promotedPatchCandidateCount: sum((iteration) => iteration.promotedPatchCandidateCount)
    },
    rerunManifest: {
      paths: rerunManifestPaths,
      count: rerunManifestPaths.length,
      taskCount: input.rerunManifest?.summary.taskCount ?? 0,
      terminalState: rerunManifestTerminalState,
      conflictBlockedCount: input.rerunManifest?.summary.conflictBlockedCount ?? 0,
      decisionRerunCount: input.rerunManifest?.summary.decisionRerunCount ?? 0,
      staleAgainstHeadCount: input.rerunManifest?.summary.staleAgainstHeadCount ?? 0,
      queueRerunCount: input.rerunManifest?.summary.queueRerunCount ?? 0,
      sourceHeadCount: input.rerunManifest?.summary.sourceHeadCount ?? 0,
      sourcePatchCount: input.rerunManifest?.summary.sourcePatchCount ?? 0,
      targetRefCount: input.rerunManifest?.summary.targetRefCount ?? 0,
      ...(input.rerunManifest?.currentHead ? { currentHead: input.rerunManifest.currentHead } : {}),
      ...(input.rerunManifest?.sourceHead ? { sourceHead: input.rerunManifest.sourceHead } : {})
    },
    iterations,
    finalGateSummary,
    summary: {
      pathCount: compactArtifactPaths([
        input.autoDrainPath,
        ...admissionPaths,
        ...coordinatorAgentPaths,
        ...coordinatorAgentDrainWorkPaths,
        ...mergeQueuePaths,
        ...groupingPaths,
        ...reviewerPaths,
        ...patchStackPaths,
        ...rerunManifestPaths
      ]).length,
      iterationCount: iterations.length,
      collectionCount: iterations.length,
      applyCount: iterations.filter((iteration) => !!iteration.applyPath).length,
      admissionCount: admissionPaths.length,
      coordinatorAgentDrainCount: coordinatorAgentPaths.length,
      coordinatorAgentDrainWorkCount: coordinatorAgentDrainWorkPaths.length,
      mergeQueuePlanCount: mergeQueuePaths.length,
      reviewerPlanCount: compactArtifactPaths(iterations.map((iteration) => iteration.reviewerLanePlanPath)).length,
      patchStackPlanCount: compactArtifactPaths(iterations.map((iteration) => iteration.patchStackPlanPath)).length,
      decisionCount: sum((iteration) => iteration.decisionCount),
      committedDecisionCount: sum((iteration) => iteration.committedDecisionCount),
      gatedDecisionCount: sum((iteration) => iteration.gatedDecisionCount),
      verificationGateCount: sum((iteration) => iteration.verificationGateCount),
      requiredVerificationGateCount: sum((iteration) => iteration.requiredVerificationGateCount),
      finalGateOk: finalGateSummary.ok,
      finalGateState: finalGateSummary.state,
      failedRequiredGateCount: finalGateSummary.failedRequiredGateCount,
      skippedRequiredGateCount: finalGateSummary.skippedRequiredGateCount,
      finalGateContinuationDecisionCount: finalGateSummary.continuationDecisionCount,
      finalGateContinuationSkippedRequiredGateCount: finalGateSummary.continuationSkippedRequiredGateCount,
      promotedPatchCandidateCount: sum((iteration) => iteration.promotedPatchCandidateCount),
      patchCount: compactArtifactPaths(iterations.flatMap((iteration) => iteration.patchPaths)).length,
      rerunManifestCount: rerunManifestPaths.length,
      rerunTaskCount: input.rerunManifest?.summary.taskCount ?? 0,
      rerunManifestTerminalState
    }
  };
}

interface AutoDrainRerunCandidate {
  jobId: string;
  taskId?: string;
  lane?: string;
  layer?: string;
  compute?: string;
  priority?: number;
  concurrencyKey?: string;
  title?: string;
  queueItemIds: string[];
  sourceKinds: FrontierCodexAutoDrainRerunSourceKind[];
  reasons: string[];
  sourceHead?: string;
  sourceHeads: string[];
  sourceArtifactPaths: string[];
  sourcePatchPaths: string[];
  sourceBundlePaths: string[];
  sourceCollectionPaths: string[];
  sourceMergeQueuePaths: string[];
  sourceDecisionLogPaths: string[];
  evidencePaths: string[];
  targetRefs: string[];
  changedRegions: string[];
  allowedWrites: string[];
  ownershipRegions: NonNullable<FrontierSwarmTaskInput['ownershipRegions']>;
  ownedRegions: string[];
  acceptance: string[];
  verification: NonNullable<FrontierSwarmTaskInput['verification']>;
  sourceTask?: FrontierCodexAutoDrainRerunSourceTaskMetadata;
  queueActions: FrontierSwarmMergeQueueAssignmentAction[];
  decisionStatuses: FrontierCodexAutonomousDecisionStatus[];
  conflictHeadBefore: string[];
  conflictHeadAfter: string[];
  conflictingJobIds: string[];
  scopeIds: string[];
  leaseKeys: string[];
  generatedAt: number;
}

async function writeAutoDrainRerunManifest(input: {
  cwd: string;
  outDir: string;
  autoDrainPath: string;
  generatedAt: number;
  iterations: readonly FrontierCodexSwarmAutoDrainIteration[];
  terminalJobIds: readonly string[];
  blockedJobIds: readonly string[];
}): Promise<FrontierCodexAutoDrainRerunManifest> {
  const manifestPath = path.join(input.outDir, 'rerun-manifest.json');
  const currentHead = await readCurrentGitHead(input.cwd);
  const manifest = createCodexAutoDrainRerunManifest({
    ...input,
    manifestPath,
    currentHead
  });
  await writeJsonAtomic(manifestPath, manifest);
  return manifest;
}

export interface FrontierCodexAutoDrainRerunManifestInput {
  outDir: string;
  autoDrainPath: string;
  manifestPath: string;
  generatedAt: number;
  currentHead?: string;
  iterations: readonly FrontierCodexAutoDrainRerunManifestIterationInput[];
  terminalJobIds: readonly string[];
  blockedJobIds: readonly string[];
}

export interface FrontierCodexAutoDrainRerunManifestIterationInput {
  collection: FrontierCodexCollectResult;
  postApplyCollection?: FrontierCodexCollectResult;
  apply?: FrontierCodexAutonomousApplyResult;
}

export function createCodexAutoDrainRerunManifest(input: FrontierCodexAutoDrainRerunManifestInput): FrontierCodexAutoDrainRerunManifest {
  const candidates = new Map<string, AutoDrainRerunCandidate>();
  const latestIteration = input.iterations.at(-1);
  const latestCollection = latestIteration?.postApplyCollection ?? latestIteration?.collection;
  const latestCollectionPath = latestCollection
    ? latestCollection.artifacts?.collectionPath ?? path.join(latestCollection.outDir, 'collection.json')
    : undefined;
  const latestMergeQueuePath = latestCollection
    ? latestCollection.artifacts?.hierarchicalMergeQueuePath ?? path.join(latestCollection.outDir, 'hierarchical-merge-queue.json')
    : undefined;
  const latestQueueOverlayPath = latestCollection
    ? latestCollection.artifacts?.queueOverlayPath ?? path.join(latestCollection.outDir, 'queue-overlay.json')
    : undefined;
  const latestSourceHeads = compactArtifactPaths([input.currentHead]);
  const terminalJobIds = new Set(input.terminalJobIds);
  const blockedJobIds = new Set(input.blockedJobIds);
  const decisionComponents = createDashboardAutonomousDecisionComponents(input.iterations.flatMap((iteration) => iteration.apply?.decisions ?? []));
  const decisions = decisionComponents
    .map((component) => component.latest)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.decision);
  const resolvedQueueKeys = createResolvedAutonomousDecisionQueueKeySet(
    input.iterations.flatMap((iteration) => iteration.apply?.decisions ?? [])
  );
  const decisionLogPathById = new Map<string, string>();
  const applyPathByDecisionId = new Map<string, string>();
  const autonomousQueueOverlayPathByDecisionId = new Map<string, string>();
  const collectedEntriesByJobId = new Map<string, FrontierCodexCollectedBundle>();
  const collectedEntriesBySubjectKey = new Map<string, FrontierCodexCollectedBundle>();
  for (const iteration of input.iterations) {
    for (const collection of [iteration.collection, iteration.postApplyCollection].filter((entry): entry is FrontierCodexCollectResult => entry !== undefined)) {
      for (const [jobId, entry] of collectionEntriesByJobId(collection)) {
        collectedEntriesByJobId.set(jobId, entry);
        const record = autoDrainGroupingRecord(entry);
        for (const key of dashboardQueueSubjectAliasKeys({ jobId: record.jobId, taskId: record.taskId, queueItemIds: record.queueItemIds })) {
          if (!collectedEntriesBySubjectKey.has(key)) collectedEntriesBySubjectKey.set(key, entry);
        }
      }
    }
    const applyPath = iteration.apply ? path.join(iteration.apply.outDir, 'autonomous-apply.json') : undefined;
    const autonomousQueueOverlayPath = iteration.apply ? path.join(iteration.apply.outDir, 'autonomous-queue-overlay.json') : undefined;
    for (const decision of iteration.apply?.decisions ?? []) {
      if (iteration.apply?.decisionLogPath) decisionLogPathById.set(decision.id, iteration.apply.decisionLogPath);
      if (applyPath) applyPathByDecisionId.set(decision.id, applyPath);
      if (autonomousQueueOverlayPath) autonomousQueueOverlayPathByDecisionId.set(decision.id, autonomousQueueOverlayPath);
    }
  }

  if (latestCollection) {
    const entriesByJobId = collectionEntriesByJobId(latestCollection);
    const assignments = latestCollection.hierarchicalMergeQueue?.assignments ?? [];
    const assignmentsByJobId = new Map(assignments.map((assignment) => [assignment.jobId, assignment]));
    for (const entry of latestCollection.buckets['stale-against-head']) {
      const record = autoDrainGroupingRecord(entry);
      if (!record.patchPath || !record.changedPaths.length) continue;
      const subject = { jobId: record.jobId, taskId: record.taskId, queueItemIds: record.queueItemIds };
      if (!dashboardQueueSubjectIsOpen(subject, terminalJobIds, blockedJobIds, resolvedQueueKeys)) continue;
      const assignment = assignmentsByJobId.get(record.jobId);
      const sourceTask = sourceTaskMetadataForAutoDrainEntry(entry);
      mergeAutoDrainRerunCandidate(candidates, subject, {
        jobId: record.jobId,
        taskId: record.taskId,
        lane: record.lane,
        sourceTask,
        queueItemIds: record.queueItemIds,
        sourceKinds: assignment?.action === 'rerun' ? ['stale-against-head', 'queue-rerun'] : ['stale-against-head'],
        reasons: uniqueStrings(['stale-against-head', ...entry.bundle.reasons, ...(assignment?.reasons ?? [])]),
        sourceHeads: latestSourceHeads,
        sourceArtifactPaths: compactArtifactPaths([latestQueueOverlayPath]),
        sourcePatchPaths: autoDrainRerunPatchPathsForEntry(entry, record),
        sourceBundlePaths: autoDrainRerunBundlePathsForEntry(entry),
        sourceCollectionPaths: latestCollectionPath ? [latestCollectionPath] : [],
        sourceMergeQueuePaths: latestMergeQueuePath ? [latestMergeQueuePath] : [],
        evidencePaths: entry.bundle.evidencePaths,
        targetRefs: record.changedPaths,
        changedRegions: record.changedRegions,
        allowedWrites: entry.bundle.allowedWrites,
        queueActions: assignment ? [assignment.action] : [],
        conflictingJobIds: assignment?.conflictingJobIds ?? [],
        scopeIds: assignment ? [assignment.scopeId] : [],
        leaseKeys: assignment ? [assignment.leaseKey] : []
      });
    }
    for (const assignment of assignments.filter((entry) => entry.action === 'rerun')) {
      if (!dashboardQueueSubjectIsOpen(assignment, terminalJobIds, blockedJobIds, resolvedQueueKeys)) continue;
      const entry = entriesByJobId.get(assignment.jobId);
      if (!entry) continue;
      const record = autoDrainGroupingRecord(entry);
      if (!record.patchPath || !assignment.changedPaths.length) continue;
      const sourceTask = sourceTaskMetadataForAutoDrainEntry(entry);
      mergeAutoDrainRerunCandidate(candidates, assignment, {
        jobId: assignment.jobId,
        taskId: assignment.taskId ?? record.taskId,
        lane: assignment.lane ?? record.lane,
        sourceTask,
        title: assignment.title,
        queueItemIds: assignment.queueItemIds.length ? assignment.queueItemIds : record.queueItemIds,
        sourceKinds: ['queue-rerun'],
        reasons: uniqueStrings(['queue-rerun', ...assignment.reasons]),
        sourceHeads: latestSourceHeads,
        sourceArtifactPaths: compactArtifactPaths([latestQueueOverlayPath]),
        sourcePatchPaths: autoDrainRerunPatchPathsForEntry(entry, record),
        sourceBundlePaths: autoDrainRerunBundlePathsForEntry(entry),
        sourceCollectionPaths: latestCollectionPath ? [latestCollectionPath] : [],
        sourceMergeQueuePaths: latestMergeQueuePath ? [latestMergeQueuePath] : [],
        evidencePaths: entry.bundle.evidencePaths,
        targetRefs: assignment.changedPaths,
        changedRegions: assignment.changedRegions,
        allowedWrites: entry.bundle.allowedWrites,
        queueActions: [assignment.action],
        conflictingJobIds: assignment.conflictingJobIds,
        scopeIds: [assignment.scopeId],
        leaseKeys: [assignment.leaseKey]
      });
    }
  }

  for (const decision of decisions.filter((entry) => classifyCodexAutonomousDecisionCollapse(entry).createsRerunWork)) {
    if (!decision.patchPath || !decision.changedPaths.length) continue;
    const sourceKind: FrontierCodexAutoDrainRerunSourceKind = decision.status === 'conflict-blocked' ? 'conflict-blocked' : 'decision-rerun';
    const sourceEntry = collectedEntriesByJobId.get(decision.jobId)
      ?? dashboardQueueSubjectAliasKeys(decision).map((key) => collectedEntriesBySubjectKey.get(key)).find((entry) => entry !== undefined);
    const sourceTask = sourceEntry ? sourceTaskMetadataForAutoDrainEntry(sourceEntry) : undefined;
    mergeAutoDrainRerunCandidate(candidates, decision, {
      jobId: decision.jobId,
      taskId: decision.taskId,
      sourceTask,
      queueItemIds: decision.queueItemIds.length ? decision.queueItemIds : [decision.taskId ?? decision.jobId],
      sourceKinds: [sourceKind],
      reasons: uniqueStrings([decision.status, decision.reason]),
      sourceHeads: compactArtifactPaths([sourceHeadForAutonomousDecision(decision)]),
      sourceArtifactPaths: compactArtifactPaths([
        applyPathByDecisionId.get(decision.id),
        autonomousQueueOverlayPathByDecisionId.get(decision.id)
      ]),
      sourcePatchPaths: [decision.patchPath],
      sourceBundlePaths: [decision.bundlePath],
      sourceDecisionLogPaths: compactArtifactPaths([decisionLogPathById.get(decision.id)]),
      targetRefs: decision.changedPaths,
      changedRegions: decision.changedRegions,
      decisionStatuses: [decision.status],
      conflictHeadBefore: compactArtifactPaths([decision.headBefore]),
      conflictHeadAfter: compactArtifactPaths([decision.headAfter])
    });
  }

  const tasks = Array.from(candidates.values())
    .filter((candidate) => candidate.sourcePatchPaths.length > 0 && candidate.targetRefs.length > 0)
    .sort((left, right) => autoDrainRerunTaskSubject(left).localeCompare(autoDrainRerunTaskSubject(right)))
    .map((candidate) => createAutoDrainRerunTask(candidate, input));
  const sourceHeads = compactArtifactPaths(tasks.flatMap((task) => task.metadata.rerun.sourceHeads)).sort();
  const sourcePatchPaths = compactArtifactPaths(tasks.flatMap((task) => task.metadata.rerun.sourcePatchPaths));
  const targetRefs = uniqueWorkspacePaths(tasks.flatMap((task) => task.targetRefs)).sort();
  const taskIds = uniqueStrings(tasks.map((task) => task.metadata.rerun.originalTaskId ?? task.id)).sort();
  const jobIds = uniqueStrings(tasks.map((task) => task.metadata.rerun.originalJobId)).sort();
  const terminalState: FrontierCodexAutoDrainRerunManifestTerminalState = tasks.length > 0 ? 'rerun-required' : 'drained';
  const summary = {
    taskCount: tasks.length,
    terminalState,
    conflictBlockedCount: tasks.filter((task) => task.metadata.rerun.sourceKinds.includes('conflict-blocked')).length,
    decisionRerunCount: tasks.filter((task) => task.metadata.rerun.sourceKinds.includes('decision-rerun')).length,
    staleAgainstHeadCount: tasks.filter((task) => task.metadata.rerun.sourceKinds.includes('stale-against-head')).length,
    queueRerunCount: tasks.filter((task) => task.metadata.rerun.sourceKinds.includes('queue-rerun')).length,
    sourceHeadCount: sourceHeads.length,
    sourcePatchCount: sourcePatchPaths.length,
    targetRefCount: targetRefs.length
  };
  return {
    kind: FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND,
    version: FRONTIER_SWARM_CODEX_RERUN_MANIFEST_VERSION,
    id: `frontier-swarm-codex-rerun-manifest:${stableHash([input.outDir, input.currentHead, tasks.map((task) => task.metadata.rerun)])}`,
    ...(latestCollection?.mergeIndex.runId ? { runId: latestCollection.mergeIndex.runId } : {}),
    path: input.manifestPath,
    outDir: input.outDir,
    sourceAutoDrainPath: input.autoDrainPath,
    generatedAt: input.generatedAt,
    ...(input.currentHead ? { currentHead: input.currentHead } : {}),
    ...(sourceHeads.length === 1 ? { sourceHead: sourceHeads[0] } : {}),
    sourceHeads,
    items: tasks,
    tasks,
    sourcePatchPaths,
    targetRefs,
    taskIds,
    jobIds,
    summary
  };
}

interface ContinuousRefillCandidate {
  task: FrontierSwarmTaskInput;
  taskId: string;
  source: FrontierCodexContinuousRefillTaskSource;
  index: number;
}

export function createCodexContinuousRefill(input: FrontierCodexContinuousRefillInput): FrontierCodexContinuousRefillResult {
  const generatedAt = input.generatedAt ?? Date.now();
  const desiredConcurrency = normalizeContinuousRefillCount(input.desiredConcurrency, 'desiredConcurrency');
  const activeWorkers = readContinuousRefillWorkers(input.activeWorkers);
  const activeWorkerCount = Math.max(
    normalizeContinuousRefillOptionalCount(input.activeWorkerCount) ?? 0,
    activeWorkers.filter(continuousRefillWorkerIsActive).length
  );
  const queuedTasks = coerceContinuousRefillTasks(input.queuedTasks);
  const queuedTaskCount = Math.max(
    normalizeContinuousRefillOptionalCount(input.queuedTaskCount) ?? 0,
    queuedTasks.length
  );
  const openConcurrency = Math.max(0, desiredConcurrency - activeWorkerCount - queuedTaskCount);
  const rerunManifests = [input.rerunManifest, ...(input.rerunManifests ?? [])]
    .filter((entry): entry is unknown => entry !== undefined);
  const rerunManifestTerminalStates = rerunManifests.map(readContinuousRefillRerunTerminalState);
  const rerunTasks = rerunManifests.flatMap((manifest) => coerceContinuousRefillTasks(manifest))
    .filter(continuousRefillTaskIsTodo);
  const backlogTasks = coerceContinuousRefillTasks(input.backlog);
  const backlogTodoTasks = backlogTasks.filter(continuousRefillTaskIsTodo);
  const excludedTaskIds = uniqueStrings([
    ...(input.excludeTaskIds ?? []),
    ...activeWorkers.flatMap(continuousRefillWorkerTaskAliases),
    ...queuedTasks.map((task) => task.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
  ]).sort();
  const excluded = new Set(excludedTaskIds);
  const candidates: ContinuousRefillCandidate[] = [];
  for (const task of rerunTasks) {
    if (!task.id || excluded.has(task.id) || candidates.some((candidate) => candidate.taskId === task.id)) continue;
    candidates.push({ task, taskId: task.id, source: 'rerun-manifest', index: candidates.length });
  }
  for (const task of backlogTodoTasks) {
    if (!task.id || excluded.has(task.id) || candidates.some((candidate) => candidate.taskId === task.id)) continue;
    candidates.push({ task, taskId: task.id, source: 'backlog', index: candidates.length });
  }
  const selectionLimit = Math.min(
    openConcurrency,
    normalizeContinuousRefillOptionalCount(input.maxTasks) ?? openConcurrency
  );
  const selected = selectionLimit > 0 ? candidates.slice(0, selectionLimit) : [];
  const state: FrontierCodexContinuousRefillState = selected.length > 0
    ? 'next-task-set'
    : candidates.length === 0
      ? 'drained'
      : 'capacity-full';
  const drained = state === 'drained';
  const reason = state === 'next-task-set'
    ? 'open-capacity-filled-from-rerun-or-backlog'
    : state === 'capacity-full'
      ? 'desired-concurrency-already-filled-by-active-or-queued-work'
      : 'no-rerun-or-backlog-work';
  const selectedTaskIds = selected.map((candidate) => candidate.taskId);
  const taskSet = selected.length > 0
    ? createContinuousRefillTaskSet({ generatedAt, selected })
    : undefined;
  const summary = {
    desiredConcurrency,
    activeWorkerCount,
    queuedTaskCount,
    openConcurrency,
    rerunManifestCount: rerunManifests.length,
    rerunTaskCount: rerunTasks.length,
    backlogTaskCount: backlogTasks.length,
    backlogTodoCount: backlogTodoTasks.length,
    availableTaskCount: candidates.length,
    selectedTaskCount: selected.length,
    drained
  };
  return {
    kind: FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_KIND,
    version: FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_VERSION,
    id: `frontier-swarm-codex-continuous-refill:${stableHash([generatedAt, summary, selectedTaskIds])}`,
    generatedAt,
    state,
    drained,
    desiredConcurrency,
    activeWorkerCount,
    queuedTaskCount,
    openConcurrency,
    availableTaskCount: candidates.length,
    selectedTaskCount: selected.length,
    selectedTaskIds,
    selectedTasks: selected.map((candidate) => ({
      taskId: candidate.taskId,
      source: candidate.source,
      index: candidate.index
    })),
    excludedTaskIds,
    rerunManifestTerminalStates,
    ...(taskSet ? { taskSet } : {}),
    reason,
    summary
  };
}

function createContinuousRefillTaskSet(input: {
  generatedAt: number;
  selected: readonly ContinuousRefillCandidate[];
}): FrontierCodexContinuousRefillTaskSet {
  const items = input.selected.map((candidate) => candidate.task);
  const taskIds = input.selected.map((candidate) => candidate.taskId);
  const rerunTaskCount = input.selected.filter((candidate) => candidate.source === 'rerun-manifest').length;
  const backlogTaskCount = input.selected.filter((candidate) => candidate.source === 'backlog').length;
  return {
    kind: FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_TASK_SET_KIND,
    version: FRONTIER_SWARM_CODEX_CONTINUOUS_REFILL_TASK_SET_VERSION,
    id: `frontier-swarm-codex-continuous-refill-task-set:${stableHash([input.generatedAt, taskIds])}`,
    generatedAt: input.generatedAt,
    source: 'continuous-refill',
    items,
    tasks: items,
    taskIds,
    summary: {
      taskCount: items.length,
      rerunTaskCount,
      backlogTaskCount
    }
  };
}

function coerceContinuousRefillTasks(value: unknown): FrontierSwarmTaskInput[] {
  if (!value) return [];
  if (isObject(value) && isObject(value.taskSet)) return coerceCodexSwarmTasksInput(value.taskSet);
  return coerceCodexSwarmTasksInput(value);
}

function readContinuousRefillRerunTerminalState(value: unknown): FrontierCodexAutoDrainRerunManifestTerminalState {
  if (!isObject(value)) return 'missing';
  const summary = isObject(value.summary) ? value.summary : {};
  const terminalState = summary.terminalState;
  if (terminalState === 'drained' || terminalState === 'rerun-required' || terminalState === 'missing') return terminalState;
  const taskCount = typeof summary.taskCount === 'number'
    ? summary.taskCount
    : coerceContinuousRefillTasks(value).length;
  return taskCount > 0 ? 'rerun-required' : 'drained';
}

function continuousRefillTaskIsTodo(task: FrontierSwarmTaskInput): boolean {
  return task.status === undefined || task.status === 'todo';
}

function readContinuousRefillWorkers(value: unknown): FrontierCodexContinuousRefillWorkerInput[] {
  if (!value) return [];
  const raw = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray(value.activeWorkers)
      ? value.activeWorkers
      : isObject(value) && Array.isArray(value.workers)
        ? value.workers
        : isObject(value) && Array.isArray(value.entries)
          ? value.entries
          : isObject(value) && Array.isArray(value.items)
            ? value.items
            : [];
  return raw.filter(isObject).map((worker) => ({
    ...(typeof worker.id === 'string' ? { id: worker.id } : {}),
    ...(typeof worker.jobId === 'string' ? { jobId: worker.jobId } : {}),
    ...(typeof worker.taskId === 'string' ? { taskId: worker.taskId } : {}),
    ...(typeof worker.status === 'string' ? { status: worker.status } : {}),
    ...(typeof worker.role === 'string' ? { role: worker.role } : {}),
    ...(typeof worker.finishedAt === 'number' ? { finishedAt: worker.finishedAt } : {})
  }));
}

function continuousRefillWorkerIsActive(worker: FrontierCodexContinuousRefillWorkerInput): boolean {
  if (worker.role === 'parent') return false;
  if (typeof worker.finishedAt === 'number') return false;
  const status = worker.status?.toLowerCase();
  if (!status) return true;
  return status === 'active'
    || status === 'running'
    || status === 'started'
    || status === 'leased'
    || status === 'in-progress'
    || status === 'queued';
}

function continuousRefillWorkerTaskAliases(worker: FrontierCodexContinuousRefillWorkerInput): string[] {
  return uniqueStrings([worker.taskId, worker.jobId].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0));
}

function normalizeContinuousRefillCount(value: unknown, field: string): number {
  const count = normalizeContinuousRefillOptionalCount(value);
  if (count === undefined) throw new Error(`${field} must be a non-negative number`);
  return count;
}

function normalizeContinuousRefillOptionalCount(value: unknown): number | undefined {
  if (value === undefined || value === null || value === false) return undefined;
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : undefined;
}

function mergeAutoDrainRerunCandidate(
  candidates: Map<string, AutoDrainRerunCandidate>,
  subject: { jobId: string; taskId?: string; queueItemIds?: readonly string[] },
  input: Partial<AutoDrainRerunCandidate> & { jobId: string }
): void {
  const key = dashboardQueueSubjectKeys(subject)[0] ?? `job:${input.jobId}`;
  const existing = candidates.get(key);
  const base: AutoDrainRerunCandidate = existing ?? {
    jobId: input.jobId,
    taskId: input.taskId,
    lane: input.lane,
    title: input.title,
    queueItemIds: [],
    sourceKinds: [],
    reasons: [],
    sourceHeads: [],
    sourceArtifactPaths: [],
    sourcePatchPaths: [],
    sourceBundlePaths: [],
    sourceCollectionPaths: [],
    sourceMergeQueuePaths: [],
    sourceDecisionLogPaths: [],
    evidencePaths: [],
    targetRefs: [],
    changedRegions: [],
    allowedWrites: [],
    ownershipRegions: [],
    ownedRegions: [],
    acceptance: [],
    verification: [],
    queueActions: [],
    decisionStatuses: [],
    conflictHeadBefore: [],
    conflictHeadAfter: [],
    conflictingJobIds: [],
    scopeIds: [],
    leaseKeys: [],
    generatedAt: input.generatedAt ?? Date.now()
  };
  const sourceTask = mergeRerunSourceTaskMetadata(base.sourceTask, input.sourceTask);
  const sourceHeads = compactArtifactPaths([...base.sourceHeads, ...(input.sourceHeads ?? [])]).sort();
  candidates.set(key, {
    ...base,
    taskId: base.taskId ?? input.taskId,
    lane: sourceTask?.lane ?? base.lane ?? input.lane,
    layer: sourceTask?.layer ?? base.layer ?? input.layer,
    compute: sourceTask?.compute ?? base.compute ?? input.compute,
    priority: sourceTask?.priority ?? base.priority ?? input.priority,
    concurrencyKey: sourceTask?.concurrencyKey ?? base.concurrencyKey ?? input.concurrencyKey,
    title: base.title ?? input.title ?? sourceTask?.title,
    queueItemIds: uniqueStrings([...base.queueItemIds, ...(input.queueItemIds ?? [])]).sort(),
    sourceKinds: uniqueStrings([...base.sourceKinds, ...(input.sourceKinds ?? [])]) as FrontierCodexAutoDrainRerunSourceKind[],
    reasons: uniqueStrings([...base.reasons, ...(input.reasons ?? [])]).sort(),
    sourceHead: sourceHeads.length === 1 ? sourceHeads[0] : undefined,
    sourceHeads,
    sourceArtifactPaths: compactArtifactPaths([...base.sourceArtifactPaths, ...(input.sourceArtifactPaths ?? [])]).sort(),
    sourcePatchPaths: compactArtifactPaths([...base.sourcePatchPaths, ...(input.sourcePatchPaths ?? [])]).sort(),
    sourceBundlePaths: compactArtifactPaths([...base.sourceBundlePaths, ...(input.sourceBundlePaths ?? [])]).sort(),
    sourceCollectionPaths: compactArtifactPaths([...base.sourceCollectionPaths, ...(input.sourceCollectionPaths ?? [])]).sort(),
    sourceMergeQueuePaths: compactArtifactPaths([...base.sourceMergeQueuePaths, ...(input.sourceMergeQueuePaths ?? [])]).sort(),
    sourceDecisionLogPaths: compactArtifactPaths([...base.sourceDecisionLogPaths, ...(input.sourceDecisionLogPaths ?? [])]).sort(),
    evidencePaths: compactArtifactPaths([...base.evidencePaths, ...(input.evidencePaths ?? [])]).slice(0, 100),
    targetRefs: uniqueWorkspacePaths([...base.targetRefs, ...(input.targetRefs ?? []), ...(sourceTask?.targetRefs ?? [])]).sort(),
    changedRegions: uniqueStrings([...base.changedRegions, ...(input.changedRegions ?? []), ...(sourceTask?.changedRegions ?? [])]).sort(),
    allowedWrites: uniqueStrings([...base.allowedWrites, ...(input.allowedWrites ?? []), ...(sourceTask?.allowedWrites ?? [])]).sort(),
    ownershipRegions: mergeRerunOwnershipRegions(base.ownershipRegions, input.ownershipRegions, sourceTask?.ownershipRegions),
    ownedRegions: uniqueStrings([...base.ownedRegions, ...(input.ownedRegions ?? []), ...(sourceTask?.ownedRegions ?? [])]).sort(),
    acceptance: uniqueStrings([...base.acceptance, ...(input.acceptance ?? []), ...(sourceTask?.acceptance ?? [])]),
    verification: uniqueRerunVerificationCommands(base.verification, input.verification, sourceTask?.verification),
    ...(sourceTask ? { sourceTask } : {}),
    queueActions: uniqueStrings([...base.queueActions, ...(input.queueActions ?? [])]) as FrontierSwarmMergeQueueAssignmentAction[],
    decisionStatuses: uniqueStrings([...base.decisionStatuses, ...(input.decisionStatuses ?? [])]) as FrontierCodexAutonomousDecisionStatus[],
    conflictHeadBefore: compactArtifactPaths([...base.conflictHeadBefore, ...(input.conflictHeadBefore ?? [])]).sort(),
    conflictHeadAfter: compactArtifactPaths([...base.conflictHeadAfter, ...(input.conflictHeadAfter ?? [])]).sort(),
    conflictingJobIds: uniqueStrings([...base.conflictingJobIds, ...(input.conflictingJobIds ?? [])]).sort(),
    scopeIds: uniqueStrings([...base.scopeIds, ...(input.scopeIds ?? [])]).sort(),
    leaseKeys: uniqueStrings([...base.leaseKeys, ...(input.leaseKeys ?? [])]).sort()
  });
}

function createAutoDrainRerunTask(
  candidate: AutoDrainRerunCandidate,
  input: {
    autoDrainPath: string;
    generatedAt: number;
    currentHead?: string;
  }
): FrontierCodexAutoDrainRerunTask {
  const originalTaskId = candidate.taskId ?? candidate.queueItemIds[0] ?? candidate.jobId;
  const id = autoDrainRerunTaskId(originalTaskId);
  const targetRefs = uniqueWorkspacePaths(candidate.targetRefs).sort();
  const sourceKinds = uniqueStrings(candidate.sourceKinds) as FrontierCodexAutoDrainRerunSourceKind[];
  const sourceHeads = compactArtifactPaths(candidate.sourceHeads).sort();
  const reasonLabel = sourceKinds.includes('conflict-blocked')
    ? 'current-head conflict'
    : sourceKinds.includes('decision-rerun')
      ? 'autonomous rerun decision'
      : 'stale-against-head queue debt';
  const sourceHeadContext = sourceHeads.length === 1
    ? ` from source head ${sourceHeads[0]}`
    : sourceHeads.length > 1
      ? ` from ${sourceHeads.length} source heads`
      : '';
  const sourceRefs = compactArtifactPaths([
    ...(candidate.sourceTask?.sourceRefs ?? []),
    ...candidate.sourcePatchPaths,
    ...candidate.sourceBundlePaths,
    ...candidate.sourceDecisionLogPaths,
    ...candidate.sourceArtifactPaths,
    ...candidate.sourceCollectionPaths,
    ...candidate.sourceMergeQueuePaths
  ]);
  const ownedRegions = uniqueStrings(candidate.ownedRegions.length ? candidate.ownedRegions : candidate.changedRegions).sort();
  const allowedWrites = candidate.sourceTask?.allowedWrites.length
    ? uniqueStrings(candidate.sourceTask.allowedWrites).sort()
    : candidate.allowedWrites.length
      ? uniqueStrings(candidate.allowedWrites).sort()
      : targetRefs;
  const verification = uniqueRerunVerificationCommands(candidate.verification);
  const rerun: FrontierCodexAutoDrainRerunTaskMetadata = {
    source: FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND,
    sourceAutoDrainPath: input.autoDrainPath,
    sourceCollectionPaths: [...candidate.sourceCollectionPaths],
    sourceMergeQueuePaths: [...candidate.sourceMergeQueuePaths],
    sourceDecisionLogPaths: [...candidate.sourceDecisionLogPaths],
    originalJobId: candidate.jobId,
    ...(candidate.taskId ? { originalTaskId: candidate.taskId } : {}),
    queueItemIds: candidate.queueItemIds.length ? [...candidate.queueItemIds] : [originalTaskId],
    ...(candidate.lane ? { lane: candidate.lane } : {}),
    ...(candidate.layer ? { layer: candidate.layer } : {}),
    ...(candidate.compute ? { compute: candidate.compute } : {}),
    ...(candidate.priority !== undefined ? { priority: candidate.priority } : {}),
    ...(candidate.concurrencyKey ? { concurrencyKey: candidate.concurrencyKey } : {}),
    sourceKinds,
    reasons: [...candidate.reasons],
    ...(input.currentHead ? { currentHead: input.currentHead } : {}),
    ...(sourceHeads.length === 1 ? { sourceHead: sourceHeads[0] } : {}),
    sourceHeads,
    sourcePatchPaths: [...candidate.sourcePatchPaths],
    sourceBundlePaths: [...candidate.sourceBundlePaths],
    evidencePaths: [...candidate.evidencePaths],
    targetRefs,
    changedRegions: [...candidate.changedRegions],
    verification,
    queueActions: uniqueStrings(candidate.queueActions) as FrontierSwarmMergeQueueAssignmentAction[],
    decisionStatuses: uniqueStrings(candidate.decisionStatuses) as FrontierCodexAutonomousDecisionStatus[],
    conflictHeadBefore: [...candidate.conflictHeadBefore],
    conflictHeadAfter: [...candidate.conflictHeadAfter],
    conflictingJobIds: [...candidate.conflictingJobIds],
    scopeIds: [...candidate.scopeIds],
    leaseKeys: [...candidate.leaseKeys],
    ...(candidate.sourceTask ? { sourceTask: candidate.sourceTask } : {}),
    generatedAt: input.generatedAt
  };
  return {
    id,
    title: `Rerun ${originalTaskId}`,
    objective: `Rerun ${originalTaskId}${sourceHeadContext} against ${input.currentHead ? `current head ${input.currentHead}` : 'the current checkout'} after ${reasonLabel}.`,
    kind: 'agent-task',
    status: 'todo',
    ...(candidate.lane ? { lane: candidate.lane } : {}),
    ...(candidate.layer ? { layer: candidate.layer } : {}),
    ...(candidate.compute ? { compute: candidate.compute } : {}),
    ...(candidate.concurrencyKey ? { concurrencyKey: candidate.concurrencyKey } : {}),
    ...(candidate.priority !== undefined ? { priority: candidate.priority } : {}),
    sourceRefs,
    targetRefs,
    allowedWrites,
    ownershipRegions: [...candidate.ownershipRegions],
    ownedRegions,
    changedRegions: [...candidate.changedRegions],
    acceptance: [...candidate.acceptance],
    verification,
    tags: uniqueStrings(['auto-drain-rerun', ...sourceKinds.map((kind) => `auto-drain-${kind}`)]),
    metadata: {
      source: FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND,
      rerun
    }
  };
}

function autoDrainRerunPatchPathsForEntry(entry: FrontierCodexCollectedBundle, record: AutoDrainGroupingRecord): string[] {
  return compactArtifactPaths([
    record.patchPath,
    record.patchPath ? path.join(entry.outputDir, 'changes.patch') : undefined
  ]);
}

function autoDrainRerunBundlePathsForEntry(entry: FrontierCodexCollectedBundle): string[] {
  return compactArtifactPaths([
    entry.mergePath,
    path.join(entry.outputDir, 'merge.json')
  ]);
}

function autoDrainRerunTaskSubject(candidate: AutoDrainRerunCandidate): string {
  return candidate.taskId ?? candidate.queueItemIds[0] ?? candidate.jobId;
}

function autoDrainRerunTaskId(taskId: string): string {
  const rerunSuffix = 'rerun-current-head';
  return slug(taskId.endsWith(`-${rerunSuffix}`) ? taskId : `${taskId}-${rerunSuffix}`);
}

function sourceHeadForAutonomousDecision(decision: FrontierCodexAutonomousMergeDecision): string | undefined {
  return decision.status === 'rerun'
    ? decision.headAfter ?? decision.headBefore
    : decision.headBefore ?? decision.headAfter;
}

async function readCurrentGitHead(cwd: string): Promise<string | undefined> {
  const result = await runProcess('git', ['rev-parse', 'HEAD'], { cwd, allowFailure: true });
  const head = result.stdout.trim();
  return result.status === 0 && /^[0-9a-f]{40}$/.test(head) ? head : undefined;
}

function compactArtifactPaths(paths: readonly (string | undefined)[]): string[] {
  return uniqueStrings(paths.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0));
}

function collectBucketDirectoryNames(bucket: FrontierCodexCollectBucket | FrontierCodexLegacyCollectBucket | 'all'): string[] {
  if (bucket === 'all') {
    return [
      'ready-to-apply',
      FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET,
      'failed-evidence',
      'stale-against-head',
      FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_BUCKET
    ];
  }
  if (bucket === FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET || bucket === FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_BUCKET) {
    return [FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET, FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_BUCKET];
  }
  return [bucket];
}

function collectBucketRoots(collectionDir: string, bucket: FrontierCodexCollectBucket | FrontierCodexLegacyCollectBucket | 'all'): string[] {
  return uniqueStrings(collectBucketDirectoryNames(bucket)).map((entry) => path.join(collectionDir, entry));
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
  const roots = collectBucketRoots(collectionDir, bucket);
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
  let sourceCollection: FrontierCodexCollectResult | undefined;
  const collectionDir = input.collection
    ? path.resolve(cwd, input.collection)
    : (sourceCollection = await collectCodexSwarmRun({
      run: String(input.run ?? ''),
      cwd,
      outDir: path.join(baseOutDir, 'collection'),
      checkStale: input.checkStale ?? true,
      branchPrefix: input.branchPrefix,
      promotePatchCandidates: shouldAutonomousApplyPromotePatchCandidates(input),
      promotionFocusedCommands: input.focusedCommands,
      promotionGlobalCommands: input.globalCommands,
      promotionGlobalGlobs: input.globalGlobs
    })).outDir;
  sourceCollection ??= await readCodexCollectResult(collectionDir);
  const outDir = baseOutDir;
  const decisionLogPath = path.resolve(cwd, input.decisionLogPath ?? path.join(outDir, 'autonomous-merge-decisions.jsonl'));
  const lockPath = input.lockPath
    ? path.resolve(cwd, input.lockPath)
    : await defaultAutonomousApplyLockPath(cwd, outDir);
  const packageGateOrder = await loadFrontierPackageGateOrder(cwd);
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
        lock,
        packageGateOrder,
        priorDecisions: decisions
      });
      decisions.push(decision);
      await appendAutonomousDecision(decisionLogPath, decision);
    }
  } finally {
    await releaseAutonomousApplyLock(lock).catch(() => {});
  }

  const decisionReadbacks = attachCodexAutonomousDecisionLeaseReadbacks(decisions);
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
  const decisionProof = summarizeAutonomousDecisionProof(decisions);
  const finalGateSummary = summarizeAutonomousFinalGateRun(decisions);
  const applyForRerunManifest: FrontierCodexAutonomousApplyResult = {
    kind: FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND,
    version: FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_VERSION,
    ok: decisions.every((decision) => (
      (decision.status === 'checked' || decision.status === 'applied' || decision.status === 'committed' || decision.status === 'skipped')
        && decision.finalGateSummary.ok
    )),
    cwd,
    collectionDir,
    outDir,
    generatedAt,
    dryRun,
    decisionLogPath,
    lockPath,
    decisions,
    decisionReadbacks,
    lockRecoveries: [...lock.recoveries],
    lockKeys: lockSummary.lockKeys,
    lockScopeCounts: lockSummary.lockScopeCounts,
    queueOverlay,
    finalGateSummary,
    summary: {
      ...summary,
      total: decisions.length,
      gatedDecisionCount: decisionProof.gatedDecisionCount,
      verificationGateCount: decisionProof.verificationGateCount,
      requiredVerificationGateCount: decisionProof.requiredVerificationGateCount,
      finalGateOk: finalGateSummary.ok,
      finalGateState: finalGateSummary.state,
      failedRequiredGateCount: finalGateSummary.failedRequiredGateCount,
      skippedRequiredGateCount: finalGateSummary.skippedRequiredGateCount,
      finalGateContinuationDecisionCount: finalGateSummary.continuationDecisionCount,
      finalGateContinuationSkippedRequiredGateCount: finalGateSummary.continuationSkippedRequiredGateCount,
      rerunManifestCount: 0,
      rerunTaskCount: 0,
      rerunManifestTerminalState: 'missing',
      lockRecoveryCount: lock.recoveries.length
    }
  };
  sourceCollection ??= await synthesizeCodexCollectResultForAutonomousApply({
    collectionDir,
    decisions,
    generatedAt
  });
  const autonomousApplyPath = path.join(outDir, 'autonomous-apply.json');
  const rerunManifest = await writeExplicitDrainRerunManifest({
    cwd,
    outDir,
    autonomousApplyPath,
    generatedAt,
    collection: sourceCollection,
    apply: applyForRerunManifest
  });
  const result: FrontierCodexAutonomousApplyResult = {
    ...applyForRerunManifest,
    rerunManifest,
    summary: {
      ...applyForRerunManifest.summary,
      rerunManifestCount: 1,
      rerunTaskCount: rerunManifest.summary.taskCount,
      rerunManifestTerminalState: rerunManifest.summary.terminalState
    }
  };
  await fs.writeFile(autonomousApplyPath, JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'autonomous-queue-overlay.json'), JSON.stringify(queueOverlay, null, 2) + '\n');
  return result;
}

async function readCodexCollectResult(collectionDir: string): Promise<FrontierCodexCollectResult | undefined> {
  const collectionPath = path.join(collectionDir, 'collection.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(collectionPath, 'utf8'));
  } catch {
    return undefined;
  }
  if (!isObject(parsed) || parsed.kind !== FRONTIER_SWARM_CODEX_COLLECTION_KIND) return undefined;
  return parsed as unknown as FrontierCodexCollectResult;
}

async function synthesizeCodexCollectResultForAutonomousApply(input: {
  collectionDir: string;
  decisions: readonly FrontierCodexAutonomousMergeDecision[];
  generatedAt: number;
}): Promise<FrontierCodexCollectResult> {
  const buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]> = {
    'ready-to-apply': [],
    'coordinator-review': [],
    'failed-evidence': [],
    'stale-against-head': []
  };
  const bundles: FrontierSwarmMergeBundle[] = [];
  for (const decision of input.decisions) {
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(decision.bundlePath, 'utf8'));
    } catch {
      continue;
    }
    const bundle = normalizeCollectedMergeBundle(raw, decision.bundlePath);
    bundles.push(bundle);
    buckets['ready-to-apply'].push({
      bucket: 'ready-to-apply',
      jobId: bundle.jobId,
      mergePath: decision.bundlePath,
      outputDir: path.dirname(decision.bundlePath),
      bundle
    });
  }
  const runId = readRunIdFromDecisions(input.decisions) ?? path.basename(path.dirname(input.collectionDir));
  const patchStatuses = Object.fromEntries(bundles.map((bundle) => [bundle.jobId, bundle.patchPath ? 'unknown' : 'missing'])) as Record<string, 'unknown' | 'applies' | 'missing' | 'stale'>;
  const mergeIndex = createSwarmMergeIndex({ runId, bundles, patchStatuses });
  const mergeAdmission = createSwarmMergeAdmission({
    index: mergeIndex,
    maxReady: buckets['ready-to-apply'].length,
    allowRisks: ['low', 'medium', 'unknown'],
    generatedAt: input.generatedAt,
    metadata: { source: FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND }
  });
  const hierarchicalMergeQueue = createSwarmHierarchicalMergeQueue({
    index: mergeIndex,
    admission: mergeAdmission,
    generatedAt: input.generatedAt,
    metadata: { source: FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND }
  });
  const reviewerLanePlan = createSwarmReviewerLanePlan({
    index: mergeIndex,
    admission: mergeAdmission,
    generatedAt: input.generatedAt,
    metadata: { source: FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND }
  });
  const patchStackPlan = createSwarmPatchStackPlan({
    index: mergeIndex,
    generatedAt: input.generatedAt,
    metadata: { source: FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND }
  });
  const queueOverlay = createCodexCollectionQueueOverlay({ runId, bundles });
  const summary = {
    total: bundles.length,
    'ready-to-apply': buckets['ready-to-apply'].length,
    'coordinator-review': 0,
    'failed-evidence': 0,
    'stale-against-head': 0,
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
    mergeQueueRecordOnlyCount: hierarchicalMergeQueue.summary.recordOnlyCount,
    promotedPatchCandidateCount: 0,
    patchOnlyCount: 0
  };
  const artifacts = createCollectArtifacts({
    outDir: input.collectionDir,
    summary,
    patchStatuses,
    mergeAdmission,
    hierarchicalMergeQueue,
    reviewerLanePlan,
    patchStackPlan
  });
  return {
    kind: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
    version: FRONTIER_SWARM_CODEX_COLLECTION_VERSION,
    ok: true,
    runDir: path.dirname(input.collectionDir),
    outDir: input.collectionDir,
    generatedAt: input.generatedAt,
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
}

async function writeExplicitDrainRerunManifest(input: {
  cwd: string;
  outDir: string;
  autonomousApplyPath: string;
  generatedAt: number;
  collection: FrontierCodexCollectResult;
  apply: FrontierCodexAutonomousApplyResult;
}): Promise<FrontierCodexAutoDrainRerunManifest> {
  const manifestPath = path.join(input.outDir, 'rerun-manifest.json');
  const currentHead = await readCurrentGitHead(input.cwd);
  const manifest = createCodexAutoDrainRerunManifest({
    outDir: input.outDir,
    autoDrainPath: input.autonomousApplyPath,
    manifestPath,
    generatedAt: input.generatedAt,
    currentHead,
    iterations: [{
      collection: input.collection,
      apply: input.apply
    }],
    terminalJobIds: input.apply.decisions
      .filter((decision) => autonomousDecisionIsTerminal(decision.status))
      .map((decision) => decision.jobId),
    blockedJobIds: input.apply.decisions
      .filter((decision) => autonomousDecisionBlocksAutoDrain(decision.status))
      .map((decision) => decision.jobId)
  });
  await writeJsonAtomic(manifestPath, manifest);
  return manifest;
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
  const roots = collectBucketRoots(collectionDir, bucket);
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
  recoveries: FrontierCodexAutonomousApplyLockRecovery[];
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
  packageGateOrder: FrontierPackageGateOrder;
  priorDecisions: readonly FrontierCodexAutonomousMergeDecision[];
}): Promise<FrontierCodexAutonomousMergeDecision> {
  const startedAt = Date.now();
  const commands: FrontierCodexAutonomousMergeDecision['commands'] = [];
  const patchPath = await resolveApplyPatchPath(input.bundle, input.mergePath);
  const queueItemIds = input.bundle.queueItemIds.length ? [...input.bundle.queueItemIds] : [input.bundle.taskId ?? input.bundle.jobId];
  const lockKeys = deriveCodexAutonomousApplyLockKeys(input.bundle);
  const collectionHead = readCodexCollectionHead(input.bundle);
  const plannedVerificationCommands = autonomousVerificationCommands(input.bundle, input.input, input.packageGateOrder);
  const verificationRuns: AutonomousVerificationRun[] = [];
  const finish = (
    status: FrontierCodexAutonomousDecisionStatus,
    reason: string,
    extra: {
      headBefore?: string;
      headAfter?: string;
      leaseHead?: string;
      commit?: string;
      rollbackEvidence?: FrontierCodexAutonomousRollbackEvidence;
      error?: string;
    } = {}
  ): FrontierCodexAutonomousMergeDecision => {
    const decision: Omit<FrontierCodexAutonomousMergeDecision, 'leaseReadback'> = {
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
      ...(extra.commit ? { commit: extra.commit } : {}),
      lockPath: input.lock.lockPath,
      lockToken: input.lock.token,
      ...(input.lock.recoveries.length ? { lockRecoveries: [...input.lock.recoveries] } : {}),
      verification: summarizeAutonomousDecisionVerification(plannedVerificationCommands, verificationRuns),
      finalGateSummary: summarizeAutonomousDecisionFinalGates(plannedVerificationCommands, verificationRuns),
      ...(extra.rollbackEvidence ? { rollbackEvidence: cloneAutonomousRollbackEvidence(extra.rollbackEvidence) } : {}),
      commands,
      ...(extra.error ? { error: extra.error } : {})
    };
    return {
      ...decision,
      leaseReadback: createCodexAutonomousDecisionLeaseReadback(decision, {
        collectionHead,
        leaseHead: extra.leaseHead
      })
    };
  };

  if (input.bundle.staleAgainstHead || input.bundle.disposition === 'stale-against-head') {
    return finish('rerun', 'bundle is stale against the current repository head');
  }
  if (!input.bundle.changedPaths.length || input.bundle.disposition === 'discovery-only') {
    return finish('skipped', 'bundle has no source patch to apply');
  }
  if (!patchPath) {
    return finish('rejected', 'missing patch');
  }
  const explicitHumanQuestionReason = explicitHumanQuestionReasonFromBundle(input.bundle);
  if (explicitHumanQuestionReason) {
    return finish('human-blocked', explicitHumanQuestionReason);
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
  if (collectionHead && collectionHead !== headBefore) {
    if (check.status !== 0) {
      const replay = await replayAutonomousPatchAtCollectionHead({
        cwd: input.cwd,
        jobId: input.bundle.jobId,
        collectionHead,
        patchPath,
        commands
      });
      if (replay.status !== 'conflict') {
        return finish(
          'rerun',
          `repository head changed since bundle collection and ${replay.reason}`,
          { headBefore: collectionHead, headAfter: headBefore, leaseHead: headBefore }
        );
      }
      return finish(
        'conflict-blocked',
        'repository head changed since bundle collection and git apply --check failed',
        { headBefore: collectionHead, headAfter: headBefore, leaseHead: headBefore }
      );
    }
    const revalidation = revalidateAutonomousHeadMoveCandidate({
      collectionHead,
      currentHead: headBefore,
      candidate: {
        jobId: input.bundle.jobId,
        lockScope: lockKeys.scope,
        lockKeys: lockKeys.keys,
        changedPaths: input.bundle.changedPaths
      },
      priorDecisions: input.priorDecisions
    });
    if (!revalidation.ok) {
      return finish('rerun', revalidation.reason, { headBefore: collectionHead, headAfter: headBefore, leaseHead: headBefore });
    }
  }
  if (check.status !== 0) return finish('conflict-blocked', 'git apply --check failed', { headBefore, leaseHead: headBefore });
  const checkedHead = await readGitHead(input.cwd, commands);
  if (checkedHead && checkedHead !== headBefore) {
    return finish(
      'rerun',
      'repository head changed while checking patch',
      { headBefore, headAfter: checkedHead, leaseHead: headBefore }
    );
  }
  if (input.dryRun) return finish('checked', 'patch checked under autonomous apply lock', { headBefore, headAfter: checkedHead ?? headBefore, leaseHead: headBefore });

  const branchName = input.branchPrefix ? `${input.branchPrefix}/${slug(input.bundle.jobId)}` : input.bundle.branchName;
  if (branchName) {
    const branch = await runLoggedProcess('git', ['switch', '-c', branchName], input.cwd);
    commands.push(branch);
    if (branch.status !== 0) return finish('failed', 'git switch -c failed', { headBefore, leaseHead: headBefore });
  }
  const apply = await runLoggedProcess('git', ['apply', patchPath], input.cwd);
  commands.push(apply);
  if (apply.status !== 0) return finish('failed', 'git apply failed', { headBefore, leaseHead: headBefore });

  const gates = plannedVerificationCommands;
  for (let gateIndex = 0; gateIndex < gates.length; gateIndex += 1) {
    const gate = gates[gateIndex];
    const gateCwd = gate.cwd ? path.resolve(input.cwd, gate.cwd) : input.cwd;
    const run = await runLoggedProcess(gate.command, gate.args, gateCwd);
    commands.push(run);
    verificationRuns.push({ index: gateIndex, name: autonomousVerificationCommandName(gate), required: gate.required !== false, status: run.status });
    if (run.status !== 0 && gate.required !== false) {
      const rollbackEvidence = await rollbackAutonomousAppliedPatch({
        cwd: input.cwd,
        patchPath,
        changedPaths: input.bundle.changedPaths,
        commands,
        forceCleanChangedPaths: !input.input.allowDirty
      });
      if (!rollbackEvidence.ok) {
        return finish('failed', `verification failed and rollback left dirty changed paths: ${gate.name}`, {
          headBefore,
          headAfter: rollbackEvidence.headAfter,
          leaseHead: headBefore,
          rollbackEvidence,
          error: `required gate failed: ${gate.name}`
        });
      }
      return finish('rejected', `verification failed: ${gate.name}`, {
        headBefore,
        headAfter: rollbackEvidence.headAfter,
        leaseHead: headBefore,
        rollbackEvidence,
        error: `required gate failed: ${gate.name}`
      });
    }
  }

  if (!input.commit) {
    const headAfter = await readGitHead(input.cwd, commands);
    return finish('applied', gates.length ? 'patch applied and verification passed' : 'patch applied after git apply check', {
      headBefore,
      headAfter,
      leaseHead: headBefore
    });
  }
  const preCommitHead = await readGitHead(input.cwd, commands);
  if (!preCommitHead) {
    const rollback = await runLoggedProcess('git', ['apply', '-R', patchPath], input.cwd);
    commands.push(rollback);
    const headAfterRollback = await readGitHead(input.cwd, commands);
    return finish('failed', rollback.status === 0 ? 'unable to re-read repository head before commit; patch rolled back' : 'unable to re-read repository head before commit and rollback failed', {
      headBefore,
      headAfter: headAfterRollback,
      leaseHead: headBefore,
      error: 'unable to read repository head before commit'
    });
  }
  if (preCommitHead !== headBefore) {
    const rollback = await runLoggedProcess('git', ['apply', '-R', patchPath], input.cwd);
    commands.push(rollback);
    return finish(rollback.status === 0 ? 'rerun' : 'failed', rollback.status === 0 ? 'repository head changed before commit; patch rolled back for rerun' : 'repository head changed before commit and rollback failed', {
      headBefore,
      headAfter: preCommitHead,
      leaseHead: headBefore,
      ...(rollback.status === 0 ? {} : { error: 'repository head changed before commit and rollback failed' })
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
      leaseHead: headBefore,
      error: 'git add failed'
    });
  }
  const committedReason = gates.length ? 'patch committed and verification passed' : 'patch committed after git apply check';
  const commitMessage = formatAutonomousApplyCommitMessage({
    bundle: input.bundle,
    bundlePath: input.mergePath,
    queueItemIds,
    lockScope: lockKeys.scope,
    lockKeys: lockKeys.keys,
    status: 'committed',
    reason: committedReason
  });
  const commit = await runLoggedProcess('git', ['commit', '-m', commitMessage], input.cwd);
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
      leaseHead: headBefore,
      error: 'git commit failed'
    });
  }
  const headAfter = await readGitHead(input.cwd, commands);
  return finish('committed', committedReason, {
    headBefore,
    headAfter,
    leaseHead: headBefore,
    ...(headAfter ? { commit: headAfter } : {})
  });
}

function formatAutonomousApplyCommitMessage(input: {
  bundle: FrontierSwarmMergeBundle;
  bundlePath: string;
  queueItemIds: readonly string[];
  lockScope: FrontierCodexAutonomousLockScope;
  lockKeys: readonly string[];
  status: FrontierCodexAutonomousDecisionStatus;
  reason: string;
}): string {
  const subjectId = formatCommitMessageValue(input.bundle.taskId ?? input.bundle.jobId);
  return [
    `Autonomous apply: ${subjectId}`,
    '',
    `Decision: ${FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_KIND}@${FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_VERSION}`,
    `Status: ${input.status}`,
    `Reason: ${formatCommitMessageValue(input.reason)}`,
    `Job: ${formatCommitMessageValue(input.bundle.jobId)}`,
    `Task: ${formatCommitMessageValue(input.bundle.taskId)}`,
    'Queue items:',
    ...formatCommitMessageList(input.queueItemIds),
    `Lock scope: ${input.lockScope}`,
    'Lock keys:',
    ...formatCommitMessageList(input.lockKeys),
    `Bundle: ${formatCommitMessageValue(input.bundlePath)}`
  ].join('\n');
}

function formatCommitMessageList(values: readonly string[]): string[] {
  return values.length
    ? values.map((value) => `- ${formatCommitMessageValue(value)}`)
    : ['- (none)'];
}

function formatCommitMessageValue(value: string | undefined): string {
  const normalized = value?.replace(/[\r\n\t]+/g, ' ').trim();
  return normalized || '(none)';
}

interface FrontierPackageGateCatalogEntry {
  id: string;
  name?: string;
  deps: string[];
  candidates: string[];
}

interface FrontierPackageGateAlias {
  id: string;
  alias: string;
  rank: number;
}

interface FrontierPackageGateOrder {
  rankById: Map<string, number>;
  dependencyIdsById: Map<string, string[]>;
  pathAliases: FrontierPackageGateAlias[];
  aliases: FrontierPackageGateAlias[];
}

async function loadFrontierPackageGateOrder(cwd: string): Promise<FrontierPackageGateOrder> {
  const catalog = await readFrontierPackageGateCatalog(cwd);
  if (catalog.length) return createFrontierPackageGateOrder(catalog);
  return createFrontierPackageGateOrder(FRONTIER_SWARM_CODEX_FALLBACK_PACKAGE_GATE_ORDER.map((id) => ({
    id,
    name: `@shapeshift-labs/${id}`,
    deps: id === 'frontier-swarm-codex' ? ['frontier-swarm'] : [],
    candidates: [`packages/${id}`]
  })));
}

async function readFrontierPackageGateCatalog(cwd: string): Promise<FrontierPackageGateCatalogEntry[]> {
  const catalogPath = path.join(cwd, 'config', 'release-train.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  } catch {
    return [];
  }
  const packages = isObject(parsed) && Array.isArray(parsed.packages) ? parsed.packages : [];
  return packages.filter(isObject).map((entry) => ({
    id: typeof entry.id === 'string' ? entry.id : '',
    name: typeof entry.name === 'string' ? entry.name : undefined,
    deps: readStringArray(entry.deps),
    candidates: readStringArray(entry.candidates)
  })).filter((entry) => entry.id.length > 0);
}

function createFrontierPackageGateOrder(catalog: readonly FrontierPackageGateCatalogEntry[]): FrontierPackageGateOrder {
  const entryById = new Map(catalog.map((entry) => [entry.id, entry]));
  const orderedIds = dependencyOrderedFrontierPackageIds(catalog);
  const rankById = new Map(orderedIds.map((id, index) => [id, index]));
  const dependencyIdsById = new Map<string, string[]>();
  for (const entry of catalog) {
    dependencyIdsById.set(entry.id, entry.deps.filter((dep) => entryById.has(dep)));
  }
  const aliases: FrontierPackageGateAlias[] = [];
  const pathAliases: FrontierPackageGateAlias[] = [];
  for (const id of orderedIds) {
    const entry = entryById.get(id);
    if (!entry) continue;
    const rank = rankById.get(id) ?? Number.MAX_SAFE_INTEGER;
    const pathCandidates = uniqueStrings([
      `packages/${id}`,
      ...entry.candidates
    ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0));
    const candidates = uniqueStrings([
      id,
      entry.name,
      `@shapeshift-labs/${id}`,
      ...pathCandidates
    ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0));
    for (const candidate of candidates) {
      const alias = normalizePackageGateAlias(candidate);
      if (alias) aliases.push({ id, alias, rank });
    }
    for (const candidate of pathCandidates) {
      const alias = normalizePackageGateAlias(candidate);
      if (alias) pathAliases.push({ id, alias, rank });
    }
  }
  aliases.sort((left, right) => right.alias.length - left.alias.length || left.alias.localeCompare(right.alias));
  pathAliases.sort((left, right) => right.alias.length - left.alias.length || left.alias.localeCompare(right.alias));
  return { rankById, dependencyIdsById, pathAliases, aliases };
}

function dependencyOrderedFrontierPackageIds(catalog: readonly FrontierPackageGateCatalogEntry[]): string[] {
  const entryById = new Map(catalog.map((entry) => [entry.id, entry]));
  const inputOrder = new Map(catalog.map((entry, index) => [entry.id, index]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: string[] = [];
  let cycle = false;
  const visit = (id: string) => {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      cycle = true;
      return;
    }
    const entry = entryById.get(id);
    if (!entry) return;
    visiting.add(id);
    for (const dep of entry.deps.filter((candidate) => entryById.has(candidate)).sort((left, right) => (inputOrder.get(left) ?? 0) - (inputOrder.get(right) ?? 0))) {
      visit(dep);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(id);
  };
  for (const entry of catalog) visit(entry.id);
  return cycle ? catalog.map((entry) => entry.id) : ordered;
}

function autonomousVerificationCommands(
  bundle: FrontierSwarmMergeBundle,
  input: FrontierCodexAutonomousApplyInput,
  packageGateOrder: FrontierPackageGateOrder
): FrontierSwarmCommand[] {
  const focused = selectFocusedVerificationCommandsForBundle(
    normalizeScoreCommands(input.focusedCommands ?? []),
    bundle,
    packageGateOrder
  );
  const global = bundle.changedPaths.some((file) => (input.globalGlobs ?? []).some((glob) => matchesGlob(file, glob)))
    ? normalizeScoreCommands(input.globalCommands ?? [])
    : [];
  return dependencyOrderPackageVerificationCommands([...focused, ...global], packageGateOrder);
}

function selectFocusedVerificationCommandsForBundle(
  commands: readonly FrontierSwarmCommand[],
  bundle: FrontierSwarmMergeBundle,
  packageGateOrder: FrontierPackageGateOrder
): FrontierSwarmCommand[] {
  const changedPackageIds = packageGateIdsForChangedPaths(bundle.changedPaths, packageGateOrder);
  if (!changedPackageIds.size) return [...commands];
  const selectedPackageIds = dependencyClosurePackageGateIds(changedPackageIds, packageGateOrder);
  return commands.filter((command) => {
    const packageId = inferFrontierPackageGateId(command, packageGateOrder);
    return !packageId || selectedPackageIds.has(packageId);
  });
}

function dependencyOrderPackageVerificationCommands(commands: readonly FrontierSwarmCommand[], packageGateOrder: FrontierPackageGateOrder): FrontierSwarmCommand[] {
  const annotated = commands.map((command, index) => ({
    command,
    index,
    packageId: inferFrontierPackageGateId(command, packageGateOrder)
  }));
  const packageCommands = annotated
    .filter((entry) => typeof entry.packageId === 'string')
    .sort((left, right) => (
      (packageGateOrder.rankById.get(left.packageId ?? '') ?? Number.MAX_SAFE_INTEGER)
      - (packageGateOrder.rankById.get(right.packageId ?? '') ?? Number.MAX_SAFE_INTEGER)
      || left.index - right.index
    ));
  let nextPackageCommand = 0;
  return annotated.map((entry) => {
    if (!entry.packageId) return entry.command;
    return packageCommands[nextPackageCommand++].command;
  });
}

function inferFrontierPackageGateId(command: FrontierSwarmCommand, packageGateOrder: FrontierPackageGateOrder): string | undefined {
  const fromMetadata = inferFrontierPackageGateIdFromMetadata(command.metadata, packageGateOrder);
  if (fromMetadata) return fromMetadata;
  return inferFrontierPackageGateIdFromText([
    command.cwd,
    command.name,
    command.command,
    ...command.args
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0).join(' '), packageGateOrder);
}

function inferFrontierPackageGateIdFromMetadata(metadata: unknown, packageGateOrder: FrontierPackageGateOrder): string | undefined {
  const metadataCandidates = frontierPackageGateMetadataCandidates(metadata);
  for (const candidate of metadataCandidates) {
    const fromMetadata = inferFrontierPackageGateIdFromText(candidate, packageGateOrder);
    if (fromMetadata) return fromMetadata;
  }
  return undefined;
}

function frontierPackageGateMetadataCandidates(metadata: unknown): string[] {
  if (!isObject(metadata)) return [];
  return [
    metadata.package,
    metadata.packageId,
    metadata.packageName,
    metadata.packagePath,
    metadata.frontierPackage,
    metadata.frontierPackageId,
    metadata.frontierPackageName
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function packageGateIdsForChangedPaths(changedPaths: readonly string[], packageGateOrder: FrontierPackageGateOrder): Set<string> {
  const packageIds = new Set<string>();
  for (const file of changedPaths) {
    const normalized = normalizePackageGateAlias(file);
    if (!normalized) continue;
    for (const alias of packageGateOrder.pathAliases) {
      if (normalized === alias.alias || normalized.startsWith(`${alias.alias}/`)) {
        packageIds.add(alias.id);
        break;
      }
    }
  }
  return packageIds;
}

function dependencyClosurePackageGateIds(packageIds: ReadonlySet<string>, packageGateOrder: FrontierPackageGateOrder): Set<string> {
  const selected = new Set<string>();
  const visit = (id: string) => {
    if (selected.has(id)) return;
    selected.add(id);
    for (const dep of packageGateOrder.dependencyIdsById.get(id) ?? []) visit(dep);
  };
  for (const id of packageIds) visit(id);
  return selected;
}

function inferFrontierPackageGateIdFromText(value: string, packageGateOrder: FrontierPackageGateOrder): string | undefined {
  const normalized = normalizePackageGateAlias(value);
  if (!normalized) return undefined;
  for (const alias of packageGateOrder.aliases) {
    if (packageGateAliasMatches(normalized, alias.alias)) return alias.id;
  }
  return undefined;
}

function normalizePackageGateAlias(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\/$/, '').trim().toLowerCase();
}

function packageGateAliasMatches(text: string, alias: string): boolean {
  let start = text.indexOf(alias);
  while (start >= 0) {
    const end = start + alias.length;
    if (packageGateAliasBoundary(text[start - 1]) && packageGateAliasBoundary(text[end])) return true;
    start = text.indexOf(alias, start + 1);
  }
  return false;
}

function packageGateAliasBoundary(value: string | undefined): boolean {
  return value === undefined || !/[a-z0-9@/_]/i.test(value);
}

type AutonomousVerificationRun = { index: number; name: string; required: boolean; status: number };

function summarizeAutonomousDecisionVerification(
  planned: readonly FrontierSwarmCommand[],
  runs: readonly AutonomousVerificationRun[]
): FrontierCodexAutonomousDecisionVerification {
  const finalGateSummary = summarizeAutonomousDecisionFinalGates(planned, runs);
  return {
    planned: planned.length,
    run: runs.length,
    required: planned.filter((command) => command.required !== false).length,
    passed: finalGateSummary.passed,
    failed: finalGateSummary.failedRequired,
    skipped: finalGateSummary.skipped,
    skippedRequired: finalGateSummary.skippedRequired,
    names: planned.map(autonomousVerificationCommandName),
    passedNames: [...finalGateSummary.passedNames].sort(),
    failedNames: [...finalGateSummary.failedRequiredGateNames].sort(),
    skippedNames: [...finalGateSummary.skippedNames].sort(),
    skippedRequiredNames: [...finalGateSummary.skippedRequiredGateNames].sort()
  };
}

function summarizeAutonomousDecisionFinalGates(
  planned: readonly FrontierSwarmCommand[],
  runs: readonly AutonomousVerificationRun[]
): FrontierCodexAutonomousDecisionFinalGateSummary {
  const runByIndex = new Map(runs.map((run) => [run.index, run]));
  const gates = planned.map((command, index): FrontierCodexAutonomousFinalGateEntry => {
    const run = runByIndex.get(index);
    const status: FrontierCodexAutonomousFinalGateStatus = !run
      ? 'skipped'
      : run.status === 0
        ? 'passed'
        : 'failed';
    return {
      index: index + 1,
      name: autonomousVerificationCommandName(command),
      command: [command.command, ...command.args],
      required: command.required !== false,
      status,
      ...(run ? { exitCode: run.status } : {})
    };
  });
  const failedRequiredGates = gates.filter((gate) => gate.required && gate.status === 'failed');
  const skippedRequiredGates = gates.filter((gate) => gate.required && gate.status === 'skipped');
  const state: FrontierCodexAutonomousFinalGateState = planned.length === 0
    ? 'not-configured'
    : failedRequiredGates.length > 0
      ? 'failed'
      : skippedRequiredGates.length > 0
        ? 'skipped-required'
        : 'passed';
  return {
    ok: failedRequiredGates.length === 0 && skippedRequiredGates.length === 0,
    state,
    planned: planned.length,
    run: runs.length,
    required: gates.filter((gate) => gate.required).length,
    passed: gates.filter((gate) => gate.status === 'passed').length,
    failed: gates.filter((gate) => gate.status === 'failed').length,
    failedRequired: failedRequiredGates.length,
    skipped: gates.filter((gate) => gate.status === 'skipped').length,
    skippedRequired: skippedRequiredGates.length,
    names: gates.map((gate) => gate.name),
    passedNames: uniqueStrings(gates.filter((gate) => gate.status === 'passed').map((gate) => gate.name)),
    failedNames: uniqueStrings(gates.filter((gate) => gate.status === 'failed').map((gate) => gate.name)),
    failedRequiredGateNames: uniqueStrings(failedRequiredGates.map((gate) => gate.name)),
    skippedNames: uniqueStrings(gates.filter((gate) => gate.status === 'skipped').map((gate) => gate.name)),
    skippedRequiredGateNames: uniqueStrings(skippedRequiredGates.map((gate) => gate.name)),
    gates
  };
}

function autonomousVerificationCommandName(command: FrontierSwarmCommand): string {
  const named = command.name?.trim();
  return named || [command.command, ...command.args].join(' ');
}

async function readGitHead(cwd: string, commands: FrontierCodexAutonomousMergeDecision['commands']): Promise<string | undefined> {
  const rev = await runLoggedProcess('git', ['rev-parse', 'HEAD'], cwd);
  commands.push(rev);
  if (rev.status !== 0) return undefined;
  return rev.stdoutTail[rev.stdoutTail.length - 1]?.trim();
}

async function rollbackAutonomousAppliedPatch(input: {
  cwd: string;
  patchPath: string;
  changedPaths: readonly string[];
  commands: FrontierCodexAutonomousMergeDecision['commands'];
  forceCleanChangedPaths: boolean;
}): Promise<FrontierCodexAutonomousRollbackEvidence> {
  const changedPaths = uniqueWorkspacePaths(input.changedPaths);
  const cleanupCommands: FrontierCodexAutonomousRollbackEvidence['cleanupCommands'] = [];
  const rollback = await runLoggedProcess('git', ['apply', '-R', input.patchPath], input.cwd);
  input.commands.push(rollback);
  let dirtyProbe = await gitStatusForAutonomousChangedPaths(input.cwd, changedPaths, input.commands);
  let dirtyPaths = dirtyProbe.dirtyPaths;
  if (dirtyPaths.length && input.forceCleanChangedPaths) {
    const restore = await runLoggedProcess('git', ['restore', '--staged', '--worktree', '--', ...changedPaths], input.cwd);
    input.commands.push(restore);
    cleanupCommands.push({ command: [...restore.command], status: restore.status });
    dirtyProbe = await gitStatusForAutonomousChangedPaths(input.cwd, changedPaths, input.commands);
    dirtyPaths = dirtyProbe.dirtyPaths;
  }
  if (dirtyPaths.length && input.forceCleanChangedPaths) {
    const clean = await runLoggedProcess('git', ['clean', '-fd', '--', ...changedPaths], input.cwd);
    input.commands.push(clean);
    cleanupCommands.push({ command: [...clean.command], status: clean.status });
    dirtyProbe = await gitStatusForAutonomousChangedPaths(input.cwd, changedPaths, input.commands);
    dirtyPaths = dirtyProbe.dirtyPaths;
  }
  const headAfter = await readGitHead(input.cwd, input.commands);
  return {
    attempted: true,
    ok: dirtyProbe.status === 0 && dirtyPaths.length === 0,
    patchPath: input.patchPath,
    changedPaths,
    reverseApplyStatus: rollback.status,
    cleanupCommands,
    dirtyPaths,
    cleanChangedPaths: dirtyProbe.status === 0 && dirtyPaths.length === 0,
    ...(headAfter ? { headAfter } : {})
  };
}

async function gitStatusForAutonomousChangedPaths(
  cwd: string,
  changedPaths: readonly string[],
  commands: FrontierCodexAutonomousMergeDecision['commands']
): Promise<{ status: number; dirtyPaths: string[] }> {
  if (!changedPaths.length) return { status: 0, dirtyPaths: [] };
  const args = ['status', '--porcelain', '--untracked-files=all', '--', ...changedPaths];
  const result = await runProcess('git', args, { cwd, allowFailure: true });
  commands.push({
    command: ['git', ...args],
    status: result.status,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr)
  });
  return {
    status: result.status,
    dirtyPaths: result.status === 0 ? parseGitStatusPorcelainPaths(result.stdout) : [...changedPaths]
  };
}

function parseGitStatusPorcelainPaths(stdout: string): string[] {
  const paths: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue;
    const pathText = line.slice(3).trim();
    const renameIndex = pathText.indexOf(' -> ');
    if (renameIndex >= 0) {
      paths.push(unquoteGitStatusPath(pathText.slice(0, renameIndex)));
      paths.push(unquoteGitStatusPath(pathText.slice(renameIndex + 4)));
    } else {
      paths.push(unquoteGitStatusPath(pathText));
    }
  }
  return uniqueWorkspacePaths(paths);
}

function unquoteGitStatusPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === 'string' ? parsed : trimmed;
  } catch {
    return trimmed;
  }
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
  const recoveries: FrontierCodexAutonomousApplyLockRecovery[] = [];
  await fs.mkdir(path.dirname(input.lockPath), { recursive: true });
  for (;;) {
    const acquiredAt = Date.now();
    const lock: FrontierCodexAutonomousApplyLock = {
      cwd: input.cwd,
      lockPath: input.lockPath,
      token: randomUUID(),
      acquiredAt,
      expiresAt: acquiredAt + staleMs,
      dryRun: input.dryRun,
      recoveries: [...recoveries]
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
      const recovery = await recoverAutonomousApplyLockIfSafe(input.lockPath, staleMs);
      if (recovery === 'missing') continue;
      if (recovery) {
        recoveries.push(recovery);
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`timed out waiting for autonomous apply lock: ${input.lockPath}`);
      await sleep(250);
    }
  }
}

async function recoverAutonomousApplyLockIfSafe(lockPath: string, staleMs: number): Promise<FrontierCodexAutonomousApplyLockRecovery | 'missing' | undefined> {
  const inspected = await inspectAutonomousApplyLock(lockPath, staleMs);
  if (inspected.missing) return 'missing';
  if (!inspected.recovery) return undefined;
  const latestText = await fs.readFile(lockPath, 'utf8').catch(() => undefined);
  const latestStat = await fs.stat(lockPath).catch(() => undefined);
  if (latestText === undefined && !latestStat) return 'missing';
  if (latestText !== inspected.text) return undefined;
  try {
    await fs.rm(lockPath, { force: true });
  } catch {
    return undefined;
  }
  return inspected.recovery;
}

async function inspectAutonomousApplyLock(lockPath: string, staleMs: number): Promise<{
  text: string;
  missing?: boolean;
  recovery?: FrontierCodexAutonomousApplyLockRecovery;
}> {
  const recoveredAt = Date.now();
  const text = await fs.readFile(lockPath, 'utf8').catch(() => undefined);
  const stat = await fs.stat(lockPath).catch(() => undefined);
  if (text === undefined && !stat) return { text: '', missing: true };
  const lockText = text ?? '';
  const previous: FrontierCodexAutonomousApplyLockRecovery['previous'] = {
    ...(stat ? { mtimeMs: stat.mtimeMs, ageMs: Math.max(0, recoveredAt - stat.mtimeMs) } : {})
  };
  let parsed: {
    token?: unknown;
    pid?: unknown;
    cwd?: unknown;
    dryRun?: unknown;
    acquiredAt?: unknown;
    expiresAt?: unknown;
  } | undefined;
  if (lockText) {
    try {
      parsed = JSON.parse(lockText) as typeof parsed;
      if (typeof parsed?.token === 'string') previous.token = parsed.token;
      if (typeof parsed?.pid === 'number' && Number.isSafeInteger(parsed.pid)) previous.pid = parsed.pid;
      if (typeof parsed?.cwd === 'string') previous.cwd = parsed.cwd;
      if (typeof parsed?.dryRun === 'boolean') previous.dryRun = parsed.dryRun;
      if (typeof parsed?.acquiredAt === 'number') previous.acquiredAt = parsed.acquiredAt;
      if (typeof parsed?.expiresAt === 'number') previous.expiresAt = parsed.expiresAt;
    } catch (error) {
      previous.parseError = error instanceof Error ? error.message : String(error);
    }
  }

  const ownerProbe = typeof previous.pid === 'number'
    ? probeAutonomousApplyLockOwner(previous.pid)
    : undefined;
  if (ownerProbe?.status === 'gone') {
    return {
      text: lockText,
      recovery: { lockPath, recoveredAt, reason: 'owner-pid-gone', staleMs, previous, ownerProbe }
    };
  }
  if (ownerProbe?.status === 'alive' || ownerProbe?.status === 'unknown') return { text: lockText };
  if (typeof previous.expiresAt === 'number' && previous.expiresAt < recoveredAt) {
    return {
      text: lockText,
      recovery: { lockPath, recoveredAt, reason: 'expired', staleMs, previous }
    };
  }
  if (stat && recoveredAt - stat.mtimeMs > staleMs) {
    return {
      text: lockText,
      recovery: { lockPath, recoveredAt, reason: 'mtime-expired', staleMs, previous }
    };
  }
  return { text: lockText };
}

function probeAutonomousApplyLockOwner(pid: number): FrontierCodexAutonomousApplyLockRecovery['ownerProbe'] {
  if (!Number.isSafeInteger(pid) || pid <= 0) return { pid, status: 'unknown', code: 'invalid-pid' };
  try {
    process.kill(pid, 0);
    return { pid, status: 'alive' };
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : undefined;
    if (code === 'ESRCH') return { pid, status: 'gone', code };
    return { pid, status: 'unknown', ...(code ? { code } : {}) };
  }
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

function createCodexCollectionQueueOverlay(input: Parameters<typeof createSwarmQueueOverlay>[0]): FrontierSwarmQueueOverlay {
  return normalizeCodexCoordinatorReviewQueueOverlay(createSwarmQueueOverlay(input));
}

function normalizeCodexCoordinatorReviewQueueOverlay(overlay: FrontierSwarmQueueOverlay): FrontierSwarmQueueOverlay {
  const entries: FrontierSwarmQueueOverlay['entries'] = overlay.entries.map((entry) => ({
    ...entry,
    status: entry.status === FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_BUCKET
      ? FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET
      : entry.status,
    reasons: entry.reasons.map(normalizeCodexCoordinatorReviewReason)
  }));
  const byQueueItemId = groupAutonomousQueueOverlayEntries(entries);
  return {
    ...overlay,
    entries,
    byQueueItemId,
    summary: {
      ...overlay.summary,
      needsHumanPortCount: entries.filter((entry) => entry.status === FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_BUCKET).length,
      coordinatorReviewCount: entries.filter((entry) => entry.status === FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET).length
    } as FrontierSwarmQueueOverlay['summary'] & { coordinatorReviewCount: number }
  };
}

function normalizeCodexCoordinatorReviewMergeBundle(bundle: FrontierSwarmMergeBundle): FrontierSwarmMergeBundle {
  return {
    ...bundle,
    reasons: bundle.reasons.map(normalizeCodexCoordinatorReviewReason)
  };
}

function normalizeCodexCoordinatorReviewReason(reason: string): string {
  return reason === FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_REASON
    ? FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_REASON
    : reason;
}

function isCodexCoordinatorReviewReason(reason: string): boolean {
  return reason === FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_REASON
    || reason === FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_REASON;
}

function createAutonomousQueueOverlay(input: {
  decisions: readonly FrontierCodexAutonomousMergeDecision[];
  generatedAt: number;
  runId?: string;
}): FrontierSwarmQueueOverlay {
  const currentDecisions = createDashboardAutonomousDecisionComponents(input.decisions)
    .map((component) => component.latest)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.decision);
  const currentDecisionIds = new Set(currentDecisions.map((decision) => decision.id));
  const supersededDecisions = input.decisions.filter((decision) => !currentDecisionIds.has(decision.id));
  const entryRows: Array<{ entry: FrontierSwarmQueueOverlay['entries'][number]; decision: FrontierCodexAutonomousMergeDecision }> = [];
  for (const decision of currentDecisions) {
    const queueItemIds = decision.queueItemIds.length ? decision.queueItemIds : [decision.taskId ?? decision.jobId];
    const collapse = classifyCodexAutonomousDecisionCollapse(decision);
    for (const queueItemId of queueItemIds) {
      entryRows.push({
        decision,
        entry: {
          queueItemId,
          jobId: decision.jobId,
          status: collapse.queueStatus,
          mergeReadiness: collapse.mergeReadiness,
          disposition: collapse.disposition,
          riskLevel: collapse.riskLevel,
          ...(decision.patchPath ? { patchPath: decision.patchPath } : {}),
          evidencePaths: [decision.bundlePath],
          changedPaths: [...decision.changedPaths],
          changedRegions: [...decision.changedRegions],
          reasons: [normalizeCodexCoordinatorReviewReason(decision.reason)],
          generatedAt: decision.finishedAt
        }
      });
    }
  }
  const entries = entryRows.map((row) => row.entry);
  const byQueueItemId = groupAutonomousQueueOverlayEntries(entries);
  const lockSummary = summarizeAutonomousDecisionLockScopes(input.decisions);
  const activeReviewCount = entryRows.filter((row) => autonomousQueueOverlayDecisionBucket(row.decision) === 'active-review').length;
  const terminalCount = entryRows.filter((row) => autonomousQueueOverlayDecisionBucket(row.decision) === 'terminal').length;
  const conflictRetryCount = entryRows.filter((row) => autonomousQueueOverlayDecisionBucket(row.decision) === 'conflict-retry').length;
  const humanNeededCount = entryRows.filter((row) => autonomousQueueOverlayDecisionBucket(row.decision) === 'human-needed').length;
  const failedTriageCount = entryRows.filter((row) => autonomousQueueOverlayDecisionBucket(row.decision) === 'failed-triage').length;
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
      needsHumanPortCount: entries.filter((entry) => entry.status === FRONTIER_SWARM_CODEX_LEGACY_HUMAN_PORT_BUCKET).length,
      coordinatorReviewCount: entries.filter((entry) => entry.status === FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET).length,
      failedEvidenceCount: entries.filter((entry) => entry.status === 'failed-evidence').length,
      staleAgainstHeadCount: entries.filter((entry) => entry.status === 'stale-against-head').length,
      discoveryOnlyCount: entries.filter((entry) => entry.status === 'discovery-only').length
    } as FrontierSwarmQueueOverlay['summary'] & { coordinatorReviewCount: number },
    metadata: {
      source: FRONTIER_SWARM_CODEX_AUTONOMOUS_APPLY_KIND,
      terminalCount,
      activeReviewCount,
      conflictRetryCount,
      humanNeededCount,
      failedTriageCount,
      currentDecisionCount: currentDecisions.length,
      supersededDecisionCount: supersededDecisions.length,
      decisionHistoryCount: input.decisions.length,
      currentDecisionStatusCounts: countAutonomousDecisionStatuses(currentDecisions),
      allDecisionStatusCounts: countAutonomousDecisionStatuses(input.decisions),
      queueStatusCounts: countAutonomousQueueOverlayStatuses(entries),
      statusBuckets: {
        activeReview: {
          label: 'Active review',
          count: activeReviewCount,
          description: 'Latest checked decisions still need a non-dry autonomous apply pass and remain active coordinator review.'
        },
        terminal: {
          label: 'Terminal outcomes',
          count: terminalCount,
          description: 'Latest applied, committed, rejected, or skipped decisions are collapsed out of active review debt.'
        },
        conflictRetry: {
          label: 'Conflict retry',
          count: conflictRetryCount,
          description: 'Latest rerun or conflict-blocked decisions stay visible as coordinator retry work, not human-needed blockers.'
        },
        humanNeeded: {
          label: 'Human needed',
          count: humanNeededCount,
          description: 'Latest human-blocked decisions are the only autonomous decisions that represent external authority or policy questions.'
        },
        failedTriage: {
          label: 'Failed triage',
          count: failedTriageCount,
          description: 'Latest failed or non-question human-blocked decisions need coordinator triage before they become rerun, rejected, conflict-blocked, or explicit human questions.'
        },
        supersededHistory: {
          label: 'Superseded history',
          count: supersededDecisions.length,
          description: 'Older decisions sharing queue, task, or job aliases are preserved in the ledger but hidden from active overlay entries.'
        }
      },
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
  return classifyCodexAutonomousDecisionCollapse(status).queueStatus;
}

function mergeReadinessFromAutonomousDecision(status: FrontierCodexAutonomousDecisionStatus): string {
  return classifyCodexAutonomousDecisionCollapse(status).mergeReadiness;
}

function dispositionFromAutonomousDecision(status: FrontierCodexAutonomousDecisionStatus): string {
  return classifyCodexAutonomousDecisionCollapse(status).disposition;
}

function groupAutonomousQueueOverlayEntries(entries: readonly FrontierSwarmQueueOverlay['entries'][number][]): Record<string, FrontierSwarmQueueOverlay['entries'][number][]> {
  const out: Record<string, FrontierSwarmQueueOverlay['entries'][number][]> = {};
  for (const entry of entries) out[entry.queueItemId] = [...(out[entry.queueItemId] ?? []), entry];
  return out;
}

function autonomousQueueOverlayDecisionBucket(decision: FrontierCodexAutonomousMergeDecision): 'active-review' | 'terminal' | 'conflict-retry' | 'human-needed' | 'failed-triage' {
  const collapse = classifyCodexAutonomousDecisionCollapse(decision);
  if (collapse.dashboardCategory === 'ready-to-apply') return 'active-review';
  if (collapse.dashboardCategory === 'rerun-work') return 'conflict-retry';
  if (collapse.dashboardCategory === 'human-needed') return 'human-needed';
  if (collapse.dashboardCategory === 'automation-blocker') return 'failed-triage';
  return 'terminal';
}

function countAutonomousDecisionStatuses(decisions: readonly FrontierCodexAutonomousMergeDecision[]): Record<string, number> {
  return countStringValues(decisions.map((decision) => decision.status));
}

function countAutonomousQueueOverlayStatuses(entries: readonly FrontierSwarmQueueOverlay['entries'][number][]): Record<string, number> {
  return countStringValues(entries.map((entry) => entry.status));
}

function countStringValues(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
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

function createCodexRerunSourceTaskMetadata(job: FrontierSwarmJob): FrontierCodexAutoDrainRerunSourceTaskMetadata {
  const rawTask = normalizeRerunSourceTaskMetadata(readRawTask(job));
  const taskSnapshot: FrontierCodexAutoDrainRerunSourceTaskMetadata = {
    id: job.task.id,
    title: job.task.title,
    lane: job.task.lane ?? job.lane,
    ...(job.task.layer ?? job.layer ? { layer: job.task.layer ?? job.layer } : {}),
    compute: job.task.compute ?? job.compute.id,
    priority: job.priority,
    concurrencyKey: job.concurrencyKey,
    sourceRefs: [...job.task.sourceRefs],
    targetRefs: [...job.task.targetRefs],
    allowedWrites: [...job.task.allowedWrites],
    ownershipRegions: cloneRerunJsonArray<NonNullable<FrontierSwarmTaskInput['ownershipRegions']>[number]>(job.task.ownershipRegions),
    ownedRegions: [...job.task.ownedRegions],
    changedRegions: [...job.changedRegions],
    acceptance: [...job.acceptance],
    verification: cloneRerunJsonArray<NonNullable<FrontierSwarmTaskInput['verification']>[number]>(job.verification)
  };
  return mergeRerunSourceTaskMetadata(taskSnapshot, rawTask) ?? taskSnapshot;
}

function sourceTaskMetadataForAutoDrainEntry(entry: FrontierCodexCollectedBundle): FrontierCodexAutoDrainRerunSourceTaskMetadata {
  const bundle = entry.bundle;
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const codex = isObject(metadata[FRONTIER_SWARM_CODEX_METADATA_KEY]) ? metadata[FRONTIER_SWARM_CODEX_METADATA_KEY] : {};
  const sourceTask = mergeRerunSourceTaskMetadata(
    normalizeRerunSourceTaskMetadata(codex.sourceTask),
    normalizeRerunSourceTaskMetadata(metadata.sourceTask),
    normalizeRerunSourceTaskMetadata(metadata.source)
  );
  if (sourceTask) return sourceTask;
  const fallback: FrontierCodexAutoDrainRerunSourceTaskMetadata = {
    ...(bundle.taskId ? { id: bundle.taskId } : {}),
    ...(bundle.title ? { title: bundle.title } : {}),
    ...(bundle.lane ? { lane: bundle.lane } : {}),
    sourceRefs: [],
    targetRefs: uniqueWorkspacePaths(bundle.changedPaths).sort(),
    allowedWrites: uniqueStrings(bundle.allowedWrites).sort(),
    ownershipRegions: [],
    ownedRegions: [],
    changedRegions: uniqueStrings(bundle.changedRegions).sort(),
    acceptance: [],
    verification: []
  };
  return fallback;
}

function normalizeRerunSourceTaskMetadata(value: unknown): FrontierCodexAutoDrainRerunSourceTaskMetadata | undefined {
  if (!isObject(value)) return undefined;
  const id = readFirstString(value.id, value.taskId, value.originalTaskId, value.sourceTaskId);
  const title = readFirstString(value.title);
  const lane = readFirstString(value.lane);
  const layer = readFirstString(value.layer);
  const compute = readFirstString(value.compute);
  const concurrencyKey = readFirstString(value.concurrencyKey);
  const priority = typeof value.priority === 'number' && Number.isFinite(value.priority) ? value.priority : undefined;
  const sourceRefs = compactArtifactPaths([
    ...readStringValues(value.sourceRefs),
    ...readStringValues(value.legacySourcePaths)
  ]);
  const targetRefs = uniqueWorkspacePaths([
    ...readStringValues(value.targetRefs),
    ...readStringValues(value.ownedFiles),
    ...readStringValues(value.files)
  ]).sort();
  const allowedWrites = uniqueStrings([
    ...readStringValues(value.allowedWrites),
    ...readStringValues(value.allowedGlobs),
    ...readStringValues(value.ownedFiles),
    ...readStringValues(value.files)
  ]).sort();
  const ownershipRegions = cloneRerunJsonArray<NonNullable<FrontierSwarmTaskInput['ownershipRegions']>[number]>(value.ownershipRegions);
  const ownedRegions = uniqueStrings(readStringValues(value.ownedRegions)).sort();
  const changedRegions = uniqueStrings(readStringValues(value.changedRegions)).sort();
  const acceptance = uniqueStrings([
    ...readStringValues(value.acceptance),
    ...readRerunAcceptanceChecks(value.acceptanceChecks)
  ]);
  const verification = readRerunVerification(value.verification);
  const hasUsefulValue = [
    id,
    title,
    lane,
    layer,
    compute,
    concurrencyKey,
    priority,
    sourceRefs.length,
    targetRefs.length,
    allowedWrites.length,
    ownershipRegions.length,
    ownedRegions.length,
    changedRegions.length,
    acceptance.length,
    verification.length
  ].some(Boolean);
  if (!hasUsefulValue) return undefined;
  return {
    ...(id ? { id } : {}),
    ...(title ? { title } : {}),
    ...(lane ? { lane } : {}),
    ...(layer ? { layer } : {}),
    ...(compute ? { compute } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(concurrencyKey ? { concurrencyKey } : {}),
    sourceRefs,
    targetRefs,
    allowedWrites,
    ownershipRegions,
    ownedRegions,
    changedRegions,
    acceptance,
    verification
  };
}

function mergeRerunSourceTaskMetadata(
  ...sources: readonly (FrontierCodexAutoDrainRerunSourceTaskMetadata | undefined)[]
): FrontierCodexAutoDrainRerunSourceTaskMetadata | undefined {
  const values = sources.filter((source): source is FrontierCodexAutoDrainRerunSourceTaskMetadata => source !== undefined);
  if (!values.length) return undefined;
  const first = values[0];
  return {
    ...(first.id ? { id: first.id } : {}),
    ...(first.title ? { title: first.title } : {}),
    ...(first.lane ? { lane: first.lane } : {}),
    ...(first.layer ? { layer: first.layer } : {}),
    ...(first.compute ? { compute: first.compute } : {}),
    ...(first.priority !== undefined ? { priority: first.priority } : {}),
    ...(first.concurrencyKey ? { concurrencyKey: first.concurrencyKey } : {}),
    ...values.slice(1).reduce<Partial<FrontierCodexAutoDrainRerunSourceTaskMetadata>>((acc, source) => ({
      id: acc.id ?? source.id,
      title: acc.title ?? source.title,
      lane: acc.lane ?? source.lane,
      layer: acc.layer ?? source.layer,
      compute: acc.compute ?? source.compute,
      priority: acc.priority ?? source.priority,
      concurrencyKey: acc.concurrencyKey ?? source.concurrencyKey
    }), {
      id: first.id,
      title: first.title,
      lane: first.lane,
      layer: first.layer,
      compute: first.compute,
      priority: first.priority,
      concurrencyKey: first.concurrencyKey
    }),
    sourceRefs: compactArtifactPaths(values.flatMap((source) => source.sourceRefs)),
    targetRefs: uniqueWorkspacePaths(values.flatMap((source) => source.targetRefs)).sort(),
    allowedWrites: uniqueStrings(values.flatMap((source) => source.allowedWrites)).sort(),
    ownershipRegions: mergeRerunOwnershipRegions(...values.map((source) => source.ownershipRegions)),
    ownedRegions: uniqueStrings(values.flatMap((source) => source.ownedRegions)).sort(),
    changedRegions: uniqueStrings(values.flatMap((source) => source.changedRegions)).sort(),
    acceptance: uniqueStrings(values.flatMap((source) => source.acceptance)),
    verification: uniqueRerunVerificationCommands(...values.map((source) => source.verification))
  };
}

function readRerunAcceptanceChecks(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (!isObject(entry)) return [];
    const check = readFirstString(entry.description, entry.id);
    return check ? [check] : [];
  });
}

function readRerunVerification(value: unknown): NonNullable<FrontierSwarmTaskInput['verification']> {
  if (!Array.isArray(value)) return [];
  return cloneRerunJsonArray<NonNullable<FrontierSwarmTaskInput['verification']>[number]>(
    value.filter((entry) => typeof entry === 'string' || isObject(entry))
  );
}

function mergeRerunOwnershipRegions(
  ...groups: readonly (readonly unknown[] | undefined)[]
): NonNullable<FrontierSwarmTaskInput['ownershipRegions']> {
  const values = groups.flatMap((group) => group ?? []) as NonNullable<FrontierSwarmTaskInput['ownershipRegions']>;
  return uniqueRerunJsonArray<NonNullable<FrontierSwarmTaskInput['ownershipRegions']>[number]>(values);
}

function uniqueRerunVerificationCommands(
  ...groups: readonly (readonly unknown[] | undefined)[]
): NonNullable<FrontierSwarmTaskInput['verification']> {
  const values = groups.flatMap((group) => group ?? []) as NonNullable<FrontierSwarmTaskInput['verification']>;
  const out: NonNullable<FrontierSwarmTaskInput['verification']>[number][] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = typeof value === 'string'
      ? value
      : JSON.stringify({
        name: value.name,
        command: value.command,
        args: value.args ?? [],
        cwd: value.cwd
      });
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cloneRerunJsonValue(value));
  }
  return out;
}

function uniqueRerunJsonArray<T>(values: readonly T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = typeof value === 'string' ? value : JSON.stringify(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cloneRerunJsonValue(value));
  }
  return out;
}

function cloneRerunJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value.map((entry) => cloneRerunJsonValue(entry)) as T[] : [];
}

function cloneRerunJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function codexModelPricing(
  model: string,
  inputUsdPerUnit: number,
  cachedInputUsdPerUnit: number,
  outputUsdPerUnit: number
): FrontierCodexModelPricing {
  return {
    model,
    currency: 'USD',
    unitTokens: FRONTIER_SWARM_CODEX_MODEL_PRICING_UNIT_TOKENS,
    inputUsdPerUnit,
    cachedInputUsdPerUnit,
    outputUsdPerUnit,
    source: FRONTIER_SWARM_CODEX_MODEL_PRICING_SOURCE,
    sourceCheckedAt: FRONTIER_SWARM_CODEX_MODEL_PRICING_SOURCE_CHECKED_AT
  };
}

function normalizeCodexPricingModelKey(model: string | null | undefined): string | undefined {
  const value = normalizeCodexMetricsModel(model);
  return value ? value.toLowerCase() : undefined;
}

function normalizeCodexMetricsModel(model: string | null | undefined): string | undefined {
  if (model == null) return undefined;
  const value = String(model).trim();
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'auto' || normalized === 'default' || normalized === 'config' || normalized === 'config-default') return undefined;
  return value;
}

function tokenCount(value: unknown): number | undefined {
  const numberValue = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(numberValue) || numberValue < 0) return undefined;
  return Math.floor(numberValue);
}

function readStringField(source: Record<string, unknown>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = source[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function readNumberField(source: Record<string, unknown>, names: readonly string[]): number | undefined {
  for (const name of names) {
    const value = tokenCount(source[name]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function readNestedNumberField(source: Record<string, unknown>, paths: readonly (readonly string[])[]): number | undefined {
  for (const pathParts of paths) {
    let current: unknown = source;
    for (const part of pathParts) {
      if (!isObject(current)) {
        current = undefined;
        break;
      }
      current = current[part];
    }
    const value = tokenCount(current);
    if (value !== undefined) return value;
  }
  return undefined;
}

function roundUsd(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 1_000_000_000_000) / 1_000_000_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function readCodexRunMetrics(metadata: unknown): FrontierCodexRunMetrics | undefined {
  if (!isObject(metadata) || !isObject(metadata.codexRunMetrics)) return undefined;
  const resourceAllocation = isObject(metadata.resourceAllocation) ? metadata.resourceAllocation : {};
  const model = normalizeCodexMetricsModel(
    (metadata.codexRunMetrics as FrontierCodexRunMetricsInput).model
      ?? readStringField(resourceAllocation, ['model'])
  );
  return normalizeCodexRunMetrics({
    ...(metadata.codexRunMetrics as FrontierCodexRunMetricsInput),
    ...(model ? { model } : {})
  });
}

function readCodexCostEstimate(metadata: unknown): FrontierCodexRunCostEstimate | undefined {
  if (!isObject(metadata) || !isObject(metadata.codexCostEstimate)) return undefined;
  return metadata.codexCostEstimate as unknown as FrontierCodexRunCostEstimate;
}

function extractCodexRunMetricsFromEventText(text: string): FrontierCodexRunMetricsInput | undefined {
  const metrics = codexEventMetrics();
  metrics.push(text);
  return metrics.finish();
}

interface CodexEventMetricsAccumulator {
  push(chunk: Buffer | string): void;
  finish(): FrontierCodexRunMetricsInput | undefined;
}

interface CodexTurnCompletionDetector {
  readonly completed: boolean;
  push(chunk: Buffer | string): void;
}

function codexEventMetrics(): CodexEventMetricsAccumulator {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let droppingLongLine = false;
  let latest: FrontierCodexRunMetrics | undefined;
  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !mightContainCodexMetric(trimmed)) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }
    for (const candidate of collectCodexRunMetricCandidates(parsed)) {
      const metrics = normalizeCodexRunMetrics(candidate);
      if (metrics.hasTokenUsage) latest = metrics;
    }
  };
  const appendText = (text: string) => {
    let start = 0;
    while (start < text.length) {
      const newline = text.indexOf('\n', start);
      const end = newline === -1 ? text.length : newline;
      const segment = text.slice(start, end);
      if (!droppingLongLine) {
        if (pending.length + segment.length <= CODEX_EVENT_METRICS_MAX_LINE_CHARS) {
          pending += segment;
        } else {
          pending = '';
          droppingLongLine = true;
        }
      }
      if (newline === -1) break;
      if (!droppingLongLine) processLine(pending);
      pending = '';
      droppingLongLine = false;
      start = newline + 1;
    }
  };
  return {
    push(chunk: Buffer | string) {
      appendText(typeof chunk === 'string' ? chunk : decoder.write(chunk));
    },
    finish() {
      const tail = decoder.end();
      if (tail) appendText(tail);
      if (pending && !droppingLongLine) processLine(pending);
      pending = '';
      droppingLongLine = false;
      return latest;
    }
  };
}

function codexTurnCompletionDetector(): CodexTurnCompletionDetector {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let droppingLongLine = false;
  let completed = false;
  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('turn.completed')) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (hasCodexTurnCompletedEvent(parsed)) completed = true;
  };
  const appendText = (text: string) => {
    let start = 0;
    while (start < text.length) {
      const newline = text.indexOf('\n', start);
      const end = newline === -1 ? text.length : newline;
      const segment = text.slice(start, end);
      if (!droppingLongLine) {
        if (pending.length + segment.length <= CODEX_EVENT_METRICS_MAX_LINE_CHARS) {
          pending += segment;
        } else {
          pending = '';
          droppingLongLine = true;
        }
      }
      if (newline === -1) break;
      if (!droppingLongLine) processLine(pending);
      pending = '';
      droppingLongLine = false;
      start = newline + 1;
    }
  };
  return {
    get completed() {
      return completed;
    },
    push(chunk: Buffer | string) {
      appendText(typeof chunk === 'string' ? chunk : decoder.write(chunk));
    }
  };
}

function hasCodexTurnCompletedEvent(value: unknown, depth = 0): boolean {
  if (!isObject(value) || depth > 5) return false;
  if (value.type === 'turn.completed') return true;
  for (const key of ['event', 'message', 'data', 'payload', 'result']) {
    if (hasCodexTurnCompletedEvent(value[key], depth + 1)) return true;
  }
  return false;
}

function mightContainCodexMetric(line: string): boolean {
  return /token|usage|metrics|run_metrics/i.test(line);
}

function writeChildLogChunk(stream: WriteStream, chunk: Buffer, source: NodeJS.ReadableStream): void {
  if (stream.destroyed) return;
  if (stream.write(chunk)) return;
  source.pause();
  stream.once('drain', () => source.resume());
}

async function finishWriteStream(stream: WriteStream): Promise<void> {
  if (stream.destroyed) return;
  await new Promise<void>((resolve) => stream.end(resolve));
}

async function listLiveProcessDescendantPids(rootPid: number, cwd: string): Promise<number[] | undefined> {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) return undefined;
  const result = await runProcess('ps', ['-eo', 'pid=,ppid='], { cwd, allowFailure: true }).catch(() => undefined);
  // Some sandboxed workers cannot inspect the process table. In that case there
  // are no known descendants, so the completed-turn settle path still stays
  // bounded after the normal nonzero-exit settle window.
  if (!result || result.status !== 0) return [];
  const childrenByParent = new Map<number, number[]>();
  for (const line of result.stdout.split(/\r?\n/)) {
    const [pidText, ppidText] = line.trim().split(/\s+/, 2);
    const pid = Number(pidText);
    const ppid = Number(ppidText);
    if (!Number.isSafeInteger(pid) || !Number.isSafeInteger(ppid) || pid <= 0 || ppid <= 0) continue;
    const children = childrenByParent.get(ppid) ?? [];
    children.push(pid);
    childrenByParent.set(ppid, children);
  }
  const descendants: number[] = [];
  const seen = new Set<number>([rootPid]);
  const pending = [rootPid];
  while (pending.length) {
    const parentPid = pending.pop()!;
    for (const childPid of childrenByParent.get(parentPid) ?? []) {
      if (seen.has(childPid)) continue;
      seen.add(childPid);
      descendants.push(childPid);
      pending.push(childPid);
    }
  }
  return descendants;
}

function collectCodexRunMetricCandidates(value: unknown, depth = 0): FrontierCodexRunMetricsInput[] {
  if (!isObject(value) || depth > 5) return [];
  const candidates: FrontierCodexRunMetricsInput[] = [];
  if (hasCodexTokenCounterCandidate(value)) candidates.push(value as FrontierCodexRunMetricsInput);
  for (const key of ['usage', 'tokenUsage', 'token_usage', 'metrics', 'runMetrics', 'run_metrics', 'data', 'message', 'response', 'result']) {
    const child = value[key];
    if (isObject(child)) candidates.push(...collectCodexRunMetricCandidates(child, depth + 1));
  }
  return candidates;
}

function hasCodexTokenCounterCandidate(value: Record<string, unknown>): boolean {
  if (hasCodexTokenCounterField(value)) return true;
  for (const key of ['usage', 'tokenUsage', 'token_usage', 'metrics', 'runMetrics', 'run_metrics']) {
    const child = value[key];
    if (isObject(child) && hasCodexTokenCounterField(child)) return true;
  }
  return false;
}

function hasCodexTokenCounterField(value: Record<string, unknown>): boolean {
  return readNumberField(value, [
    'inputTokens',
    'input_tokens',
    'promptTokens',
    'prompt_tokens',
    'cachedInputTokens',
    'cached_input_tokens',
    'uncachedInputTokens',
    'uncached_input_tokens',
    'outputTokens',
    'output_tokens',
    'completionTokens',
    'completion_tokens',
    'totalTokens',
    'total_tokens'
  ]) !== undefined || readNestedNumberField(value, [
    ['inputTokenDetails', 'cachedTokens'],
    ['input_token_details', 'cached_tokens'],
    ['input_tokens_details', 'cached_tokens'],
    ['promptTokenDetails', 'cachedTokens'],
    ['prompt_token_details', 'cached_tokens'],
    ['prompt_tokens_details', 'cached_tokens']
  ]) !== undefined;
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

function isGeneratedPatchRejectLeftoverPath(file: string): boolean {
  const normalized = file.trim().replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0')) return false;
  const name = normalized.split('/').filter(Boolean).pop()?.toLowerCase() ?? normalized.toLowerCase();
  return GENERATED_PATCH_REJECT_LEFTOVER_SUFFIXES.some((suffix) => name.endsWith(suffix))
    || isGeneratedBuildArtifactPath(normalized);
}

function isGeneratedBuildArtifactPath(file: string): boolean {
  const normalized = file.trim().replace(/\\/g, '/').toLowerCase();
  if (!normalized || normalized.includes('\0')) return false;
  return normalized.endsWith('.tsbuildinfo');
}

async function gitChangedPaths(cwd: string): Promise<string[]> {
  const result = await runProcess('git', ['status', '--porcelain'], { cwd, allowFailure: true });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const value = line.slice(3);
    return value.includes(' -> ') ? value.split(' -> ') : [value];
  });
}

async function collectChangedPaths(
  cwd: string,
  baseline: WorkspaceFileSnapshot | undefined,
  plan: FrontierCodexWorkspacePlan,
  options: { ignoreGeneratedFailedEvidencePaths?: boolean } = {}
): Promise<ChangedPathCollection> {
  if (!baseline) return filterWorkspaceChangedPaths(await gitChangedPaths(cwd), plan, options);
  const after = await snapshotWorkspaceFiles(cwd);
  return filterWorkspaceChangedPaths(diffWorkspaceFiles(baseline, after), plan, options);
}

async function collectJobChangedPaths(input: {
  workspace: string;
  fileSnapshot: WorkspaceFileSnapshot | undefined;
  workspacePlan: FrontierCodexWorkspacePlan;
  executionChangedPaths?: readonly string[];
  collectGitStatus?: boolean;
  ignoreGeneratedFailedEvidencePaths?: boolean;
}): Promise<ChangedPathCollection> {
  const filterOptions = { ignoreGeneratedFailedEvidencePaths: input.ignoreGeneratedFailedEvidencePaths };
  const hasExecutionPaths = input.executionChangedPaths !== undefined;
  const executionCollection = hasExecutionPaths
    ? filterWorkspaceChangedPaths(input.executionChangedPaths ?? [], input.workspacePlan, filterOptions)
    : undefined;
  const useSnapshotProof = input.collectGitStatus !== false
    && !!input.fileSnapshot
    && (input.workspacePlan.mode === 'copy' || input.workspacePlan.mode === 'snapshot');
  if (executionCollection && useSnapshotProof) {
    return mergeChangedPathCollections(
      executionCollection,
      await collectChangedPaths(input.workspace, input.fileSnapshot, input.workspacePlan, filterOptions)
    );
  }
  if (executionCollection) return executionCollection;
  if (input.collectGitStatus === false) return { changedPaths: [], ignoredChangedPaths: [], generatedFailedEvidencePaths: [] };
  return collectChangedPaths(input.workspace, input.fileSnapshot, input.workspacePlan, filterOptions);
}

function mergeChangedPathCollections(left: ChangedPathCollection, right: ChangedPathCollection): ChangedPathCollection {
  return {
    changedPaths: uniqueWorkspacePaths([...left.changedPaths, ...right.changedPaths]),
    ignoredChangedPaths: uniqueWorkspacePaths([...left.ignoredChangedPaths, ...right.ignoredChangedPaths]),
    generatedFailedEvidencePaths: uniqueWorkspacePaths([...left.generatedFailedEvidencePaths, ...right.generatedFailedEvidencePaths])
  };
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

function filterWorkspaceChangedPaths(
  paths: readonly string[],
  plan: FrontierCodexWorkspacePlan,
  options: { ignoreGeneratedFailedEvidencePaths?: boolean } = {}
): ChangedPathCollection {
  const changedPaths: string[] = [];
  const ignoredChangedPaths: string[] = [];
  const generatedFailedEvidencePaths: string[] = [];
  for (const file of uniqueWorkspacePaths(paths)) {
    if (isIgnoredWorkspaceChangedPath(file, plan)) ignoredChangedPaths.push(file);
    else if (options.ignoreGeneratedFailedEvidencePaths && isGeneratedPatchRejectLeftoverPath(file)) {
      ignoredChangedPaths.push(file);
      generatedFailedEvidencePaths.push(file);
    }
    else changedPaths.push(file);
  }
  return { changedPaths, ignoredChangedPaths, generatedFailedEvidencePaths };
}

function isIgnoredWorkspaceChangedPath(file: string, plan: FrontierCodexWorkspacePlan): boolean {
  if (plan.mode !== 'copy' && plan.mode !== 'snapshot') return false;
  if (isGeneratedBuildArtifactPath(file)) return true;
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
    allocation.model ? `model=${allocation.model}` : undefined,
    allocation.modelPricing ? formatModelPricingAllocation(allocation.modelPricing) : undefined,
    allocation.modelPricingUnknownReason ? `modelPricingUnknownReason=${allocation.modelPricingUnknownReason}` : undefined,
    allocation.modelRouting
      ? `modelRouting policy=${allocation.modelRouting.policy} selectedModel=${allocation.modelRouting.selectedModel ?? 'none'} recommendation=${allocation.modelRouting.recommendation} confidence=${allocation.modelRouting.confidence} routingScore=${allocation.modelRouting.routingScore}`
      : undefined,
    ...(allocation.modelRouting?.reasons ?? []).map((reason) => `modelRoutingReason=${reason}`),
    Object.keys(allocation.env).length ? `env=${Object.keys(allocation.env).sort().join(',')}` : undefined
  ].filter((value): value is string => !!value);
  return entries.length ? entries : ['none'];
}

function formatModelPricingAllocation(pricing: FrontierCodexModelPricing): string {
  return [
    `modelPricing=${pricing.model}`,
    `inputUsdPerUnit=${pricing.inputUsdPerUnit}`,
    `cachedInputUsdPerUnit=${pricing.cachedInputUsdPerUnit}`,
    `outputUsdPerUnit=${pricing.outputUsdPerUnit}`,
    `unitTokens=${pricing.unitTokens}`
  ].join(' ');
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
type SemanticImportImportablePath = SemanticImportSelectedPath & { absolute: string; bytes: number };
type SemanticImportSelection = {
  selected: SemanticImportSelectedPath[];
  eligibleCount: number;
  omittedCount: number;
  maxFiles: number;
  maxBytes: number;
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
    maxFiles: Math.max(0, Math.floor(options.maxFiles ?? DEFAULT_SEMANTIC_IMPORT_MAX_FILES)),
    maxBytes: Math.max(0, Math.floor(options.maxBytes ?? DEFAULT_SEMANTIC_IMPORT_MAX_BYTES))
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
    maxFiles,
    maxBytes: options.maxBytes
  };
}

function createEmptySemanticImportSelection(
  options: Required<Pick<FrontierCodexSemanticImportOptions, 'maxFiles' | 'maxBytes'>> & FrontierCodexSemanticImportOptions
): SemanticImportSelection {
  return {
    selected: [],
    eligibleCount: 0,
    omittedCount: 0,
    maxFiles: options.maxFiles,
    maxBytes: options.maxBytes
  };
}

async function readSemanticImportSource(
  file: string,
  maxBytes: number,
  knownBytes: number
): Promise<{ ok: true; sourceText: string; bytes: number } | { ok: false; reason: 'too-large'; bytes: number }> {
  const readLimit = Math.max(1, Math.min(maxBytes + 1, knownBytes + 1));
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(readLimit);
    const { bytesRead } = await handle.read(buffer, 0, readLimit, 0);
    const bytes = Math.max(knownBytes, bytesRead);
    if (bytesRead > maxBytes) return { ok: false, reason: 'too-large', bytes };
    return { ok: true, sourceText: buffer.subarray(0, bytesRead).toString('utf8'), bytes };
  } finally {
    await handle.close();
  }
}

async function finalizeCodexSemanticImportSidecar(
  job: FrontierSwarmJob,
  importPath: string,
  records: FrontierCodexSemanticImportRecord[],
  selection: SemanticImportSelection
): Promise<{ path: string; sidecar: FrontierCodexSemanticImportSidecar }> {
  const sidecar = createSemanticImportSidecar(job, records, selection);
  try {
    await fs.writeFile(importPath, JSON.stringify(sidecar, null, 2) + '\n');
    return { path: importPath, sidecar };
  } catch (error) {
    const fallback = createSemanticImportSidecar(job, [{
      path: '<semantic-import>',
      status: 'error',
      reason: 'semantic-import-sidecar-write-failed',
      error: formatSemanticImportError(error)
    }], selection);
    await fs.writeFile(importPath, JSON.stringify(fallback, null, 2) + '\n').catch(() => undefined);
    return { path: importPath, sidecar: fallback };
  }
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
      maxBytes: selection?.maxBytes ?? DEFAULT_SEMANTIC_IMPORT_MAX_BYTES,
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
    id: semanticImportJsonValue(loss?.id),
    severity: semanticImportJsonValue(loss?.severity),
    phase: semanticImportJsonValue(loss?.phase),
    kind: semanticImportJsonValue(loss?.kind),
    message: semanticImportJsonValue(loss?.message),
    nodeId: semanticImportJsonValue(loss?.nodeId),
    span: semanticImportJsonValue(loss?.span)
  }));
}

function summarizeSemanticMergeCandidate(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: semanticImportJsonValue(value.kind),
    readiness: semanticImportJsonValue(value.readiness),
    touchedSymbols: semanticImportArray(value.touchedSymbols, SEMANTIC_IMPORT_MAX_ARRAY_ITEMS),
    touchedSemanticNodes: semanticImportArray(value.touchedSemanticNodes, SEMANTIC_IMPORT_MAX_ARRAY_ITEMS),
    nativeSpans: semanticImportArray(value.nativeSpans, SEMANTIC_IMPORT_MAX_ARRAY_ITEMS),
    conflictKeys: semanticImportArray(value.conflictKeys, 100),
    reasons: semanticImportArray(value.reasons, SEMANTIC_IMPORT_MAX_ARRAY_ITEMS)
  };
}

function semanticImportUniversalAstHash(api: FrontierLangSemanticImportApi, universalAst: unknown): string | undefined {
  if (!api.ok || !api.hashUniversalAstEnvelope || !universalAst) return undefined;
  try {
    return semanticImportString(api.hashUniversalAstEnvelope(universalAst));
  } catch {
    return undefined;
  }
}

function formatSemanticImportError(error: unknown): string {
  if (error instanceof Error) return semanticImportString(error.message || error.name) ?? error.name;
  return semanticImportString(error) ?? 'unknown semantic import error';
}

function semanticImportString(value: unknown, maxChars = SEMANTIC_IMPORT_MAX_STRING_CHARS): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...<truncated ${text.length - maxChars} chars>`;
}

function semanticImportArray(value: unknown, maxItems: number): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map((item) => semanticImportJsonValue(item));
}

function semanticImportJsonValue(value: unknown, depth = 0): unknown {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') return semanticImportString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol' || typeof value === 'function') return String(value);
  if (depth >= 3) return semanticImportString(value);
  if (Array.isArray(value)) {
    const out = value.slice(0, SEMANTIC_IMPORT_MAX_ARRAY_ITEMS).map((item) => semanticImportJsonValue(item, depth + 1));
    if (value.length > SEMANTIC_IMPORT_MAX_ARRAY_ITEMS) {
      out.push({ truncatedItems: value.length - SEMANTIC_IMPORT_MAX_ARRAY_ITEMS });
    }
    return out;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, item] of entries.slice(0, SEMANTIC_IMPORT_MAX_OBJECT_KEYS)) {
      out[semanticImportString(key, 128) ?? 'key'] = semanticImportJsonValue(item, depth + 1);
    }
    if (entries.length > SEMANTIC_IMPORT_MAX_OBJECT_KEYS) out.truncatedKeys = entries.length - SEMANTIC_IMPORT_MAX_OBJECT_KEYS;
    return out;
  }
  return semanticImportString(value);
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

async function collectPatchOnlyMergeRecords(input: {
  runDir: string;
  cwd: string;
  ignoredCollectionSegments: readonly string[];
  existingJobIds: ReadonlySet<string>;
}): Promise<CodexCollectMergeRecord[]> {
  const patchPaths = (await findFilesByName(input.runDir, 'changes.patch'))
    .filter((patchPath) => !pathHasIgnoredSegment(path.relative(input.runDir, patchPath), input.ignoredCollectionSegments))
    .sort();
  const records: CodexCollectMergeRecord[] = [];
  const seenJobIds = new Set(input.existingJobIds);
  for (const patchPath of patchPaths) {
    if (await pathExists(path.join(path.dirname(patchPath), 'merge.json'))) continue;
    const bundle = await synthesizePatchOnlyMergeBundle({
      runDir: input.runDir,
      cwd: input.cwd,
      patchPath
    });
    if (seenJobIds.has(bundle.jobId)) continue;
    seenJobIds.add(bundle.jobId);
    records.push({ mergePath: patchPath, bundle, patchOnly: true, patchPath: bundle.patchPath ?? patchPath });
  }
  return records;
}

async function synthesizePatchOnlyMergeBundle(input: {
  runDir: string;
  cwd: string;
  patchPath: string;
}): Promise<FrontierSwarmMergeBundle> {
  const jobDir = inferPatchOnlyJobDir(input.runDir, input.patchPath);
  const patchText = await fs.readFile(input.patchPath, 'utf8').catch(() => '');
  const evidencePath = await firstExistingPath([
    path.join(path.dirname(input.patchPath), 'evidence.json'),
    path.join(jobDir, 'evidence', 'evidence.json')
  ]);
  const evidence = evidencePath ? await readJsonObjectFile(evidencePath) : {};
  const promptPath = await firstExistingPath([path.join(jobDir, 'prompt.md')]);
  const prompt = promptPath ? await readOptionalText(promptPath) : undefined;
  const promptTask = prompt ? readPatchOnlyPromptTask(prompt) : {};
  const evidenceChangedPaths = uniqueStrings([
    ...stringArray(evidence.changedPaths),
    ...stringArray(evidence.changedFiles)
  ]).sort();
  const allowedWriteCheck = isObject(evidence.allowedWriteCheck) ? evidence.allowedWriteCheck : {};
  const allowedWrites = uniqueStrings([
    ...stringArray(evidence.allowedWrites),
    ...stringArray(evidence.allowedWriteGlobs),
    ...stringArray(allowedWriteCheck.allowedGlobs),
    ...stringArray(promptTask.allowedWrites)
  ]).sort();
  const allowedWriteOk = readPatchOnlyAllowedWriteOk(evidence, allowedWriteCheck);
  const statusText = readFirstString(evidence.status, evidence.result, evidence.outcome)?.toLowerCase();
  const evidenceFailed = !!statusText && ['failed', 'fail', 'error', 'errored', 'rejected'].includes(statusText);
  const evidenceBlocked = !!statusText && ['blocked', 'human-blocked'].includes(statusText);
  const patchNormalization = await normalizePatchOnlyPatch({
    patchPath: input.patchPath,
    patchText,
    cwd: input.cwd,
    evidenceChangedPaths,
    allowedWrites,
    ignoreGeneratedFailedEvidencePaths: evidenceFailed || evidenceBlocked || allowedWriteOk === false
  });
  const generatedFailedEvidencePaths = patchNormalization.generatedFailedEvidencePaths;
  const changedPaths = uniqueStrings(patchNormalization.changedPaths).sort();
  let ownershipViolations = allowedWrites.length
    ? changedPaths.filter((file) => !allowedWrites.some((glob) => matchesGlob(file, glob))).sort()
    : [];
  if (allowedWriteOk === false && ownershipViolations.length === 0 && generatedFailedEvidencePaths.length === 0) {
    ownershipViolations = changedPaths.length ? [...changedPaths] : ['patch-only-output'];
  }
  const hasPatchContent = patchText.trim().length > 0;
  const generatedFailedEvidence = generatedFailedEvidencePaths.length > 0 && (evidenceFailed || evidenceBlocked || allowedWriteOk === false);
  const failedEvidence = evidenceFailed || generatedFailedEvidence || ownershipViolations.length > 0;
  const blockedEvidence = !failedEvidence && evidenceBlocked;
  const discoveryOnly = !failedEvidence && !blockedEvidence && (!hasPatchContent || changedPaths.length === 0);
  const status: FrontierSwarmMergeBundle['status'] = failedEvidence
    ? 'failed'
    : blockedEvidence ? 'blocked' : 'completed';
  const mergeReadiness: FrontierSwarmMergeBundle['mergeReadiness'] = failedEvidence
    ? 'rejected'
    : blockedEvidence ? 'blocked' : discoveryOnly ? 'discovery-only' : 'patch-candidate';
  const disposition: FrontierSwarmMergeBundle['disposition'] = failedEvidence
    ? 'rejected'
    : blockedEvidence ? 'blocked' : discoveryOnly ? 'discovery-only' : 'needs-port';
  const riskLevel: FrontierSwarmRiskLevel = failedEvidence || blockedEvidence ? 'high' : 'unknown';
  const handoffArtifacts = await discoverCodexHandoffArtifacts({ root: jobDir }).catch(() => []);
  const evidencePaths = uniqueStrings([
    path.dirname(input.patchPath),
    input.patchPath,
    ...(evidencePath ? [evidencePath] : []),
    ...(promptPath ? [promptPath] : []),
    ...handoffArtifacts.map((artifact) => artifact.path)
  ]).sort();
  const jobId = readFirstString(evidence.jobId, promptTask.jobId) ?? inferPatchOnlyJobId(input.runDir, input.patchPath);
  const taskId = readFirstString(evidence.taskId, promptTask.taskId);
  const lane = readFirstString(evidence.lane, promptTask.lane);
  const title = readFirstString(evidence.title, promptTask.title);
  const changedRegions = uniqueStrings([
    ...stringArray(evidence.changedRegions),
    ...stringArray(promptTask.changedRegions)
  ]).sort();
  const queueItemIds = uniqueStrings([
    ...stringArray(evidence.queueItemIds),
    ...(taskId ? [taskId] : [])
  ]).sort();
  return {
    kind: FRONTIER_SWARM_MERGE_BUNDLE_KIND,
    version: FRONTIER_SWARM_MERGE_BUNDLE_VERSION,
    id: `swarm-merge-bundle:${stableHash(['patch-only', jobId, input.patchPath, patchText])}`,
    runId: path.basename(input.runDir),
    jobId,
    ...(taskId ? { taskId } : {}),
    ...(lane ? { lane } : {}),
    ...(title ? { title } : {}),
    generatedAt: Date.now(),
    status,
    mergeReadiness,
    disposition,
    riskLevel,
    autoMergeable: false,
    changedPaths,
    changedRegions,
    ownedFilesTouched: allowedWriteOk === true && ownershipViolations.length === 0 ? [...changedPaths] : [],
    allowedWrites,
    ownershipViolations,
    patchPath: patchNormalization.patchPath,
    patchHash: stableHash(patchNormalization.patchText),
    evidencePaths,
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds,
    staleAgainstHead: false,
    reasons: patchOnlyBundleReasons({
      disposition,
      discoveryOnly,
      failedEvidence,
      blockedEvidence,
      ownershipViolations,
      generatedFailedEvidencePaths
    }),
    metadata: {
      patchOnlyCollection: {
        source: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
        reason: 'changes.patch existed without merge.json',
        jobDir,
        patchPath: patchNormalization.patchPath,
        originalPatchPath: input.patchPath,
        ...(evidencePath ? { evidencePath } : {}),
        ...(promptPath ? { promptPath } : {}),
        ...(statusText ? { evidenceStatus: statusText } : {}),
        changedPathSource: patchNormalization.changedPathSource,
        ...(generatedFailedEvidencePaths.length ? {
          generatedFailedEvidenceReason: 'patch-reject-leftover',
          generatedFailedEvidencePaths
        } : {}),
        ...(patchNormalization.normalized ? { normalizedPatchPath: patchNormalization.patchPath } : {}),
        allowedWriteEvidence: allowedWriteOk === undefined ? 'unknown' : allowedWriteOk,
        cwd: input.cwd
      }
    }
  };
}

async function normalizePatchOnlyPatch(input: {
  patchPath: string;
  patchText: string;
  cwd: string;
  evidenceChangedPaths: readonly string[];
  allowedWrites: readonly string[];
  ignoreGeneratedFailedEvidencePaths?: boolean;
}): Promise<{
  patchPath: string;
  patchText: string;
  changedPaths: string[];
  changedPathSource: 'patch' | 'normalized-patch' | 'evidence' | 'unknown';
  normalized: boolean;
  generatedFailedEvidencePaths: string[];
}> {
  const rawPatchChangedPaths = changedPathsFromPatchText(input.patchText);
  const patchChangedPaths = input.ignoreGeneratedFailedEvidencePaths
    ? rawPatchChangedPaths.filter((file) => !isGeneratedPatchRejectLeftoverPath(file))
    : rawPatchChangedPaths;
  const evidenceChangedPaths = input.ignoreGeneratedFailedEvidencePaths
    ? input.evidenceChangedPaths.filter((file) => !isGeneratedPatchRejectLeftoverPath(file))
    : [...input.evidenceChangedPaths];
  const generatedFailedEvidencePaths = input.ignoreGeneratedFailedEvidencePaths
    ? uniqueStrings([
      ...rawPatchChangedPaths.filter(isGeneratedPatchRejectLeftoverPath),
      ...input.evidenceChangedPaths.filter(isGeneratedPatchRejectLeftoverPath)
    ]).sort()
    : [];
  const normalizedChangedPaths = uniqueStrings(patchChangedPaths
    .map((file) => normalizePatchOnlyChangedPath(file, input))
    .filter((file): file is string => !!file)).sort();
  const patchViolations = input.allowedWrites.length
    ? normalizedChangedPaths.filter((file) => !input.allowedWrites.some((glob) => matchesGlob(file, glob)))
    : [];
  const evidenceViolations = input.allowedWrites.length
    ? evidenceChangedPaths.filter((file) => !input.allowedWrites.some((glob) => matchesGlob(file, glob)))
    : [];
  const useEvidencePaths = evidenceChangedPaths.length > 0
    && evidenceViolations.length === 0
    && (normalizedChangedPaths.length === 0 || patchViolations.length > 0);
  const changedPaths = useEvidencePaths ? [...evidenceChangedPaths].sort() : normalizedChangedPaths;
  if (!input.patchText.trim()) {
    return {
      patchPath: input.patchPath,
      patchText: input.patchText,
      changedPaths,
      changedPathSource: changedPaths.length ? useEvidencePaths ? 'evidence' : 'patch' : 'unknown',
      normalized: false,
      generatedFailedEvidencePaths
    };
  }
  const normalizedText = rewritePatchOnlyPatchHeaders(input.patchText, input);
  if (normalizedText === input.patchText) {
    return {
      patchPath: input.patchPath,
      patchText: input.patchText,
      changedPaths,
      changedPathSource: changedPaths.length ? useEvidencePaths ? 'evidence' : 'patch' : 'unknown',
      normalized: false,
      generatedFailedEvidencePaths
    };
  }
  const normalizedPath = path.join(path.dirname(input.patchPath), 'changes.normalized.patch');
  await fs.writeFile(normalizedPath, normalizedText);
  const normalizedPaths = input.ignoreGeneratedFailedEvidencePaths
    ? changedPathsFromPatchText(normalizedText).filter((file) => !isGeneratedPatchRejectLeftoverPath(file))
    : changedPathsFromPatchText(normalizedText);
  return {
    patchPath: normalizedPath,
    patchText: normalizedText,
    changedPaths: normalizedPaths.length ? normalizedPaths : changedPaths,
    changedPathSource: 'normalized-patch',
    normalized: true,
    generatedFailedEvidencePaths
  };
}

function rewritePatchOnlyPatchHeaders(text: string, context: {
  cwd: string;
  evidenceChangedPaths: readonly string[];
  allowedWrites: readonly string[];
}): string {
  let changed = false;
  const lines = text.split(/\r?\n/).map((line) => {
    const diffMatch = /^diff --git (.+?) (.+)$/.exec(line);
    if (diffMatch) {
      const left = normalizePatchOnlyChangedPath(diffMatch[1], context);
      const right = normalizePatchOnlyChangedPath(diffMatch[2], context);
      if (left && right && (`a/${left}` !== diffMatch[1] || `b/${right}` !== diffMatch[2])) {
        changed = true;
        return `diff --git a/${left} b/${right}`;
      }
      return line;
    }
    const fileMatch = /^(---|\+\+\+) (.+)$/.exec(line);
    if (!fileMatch) return line;
    const marker = fileMatch[1];
    const value = fileMatch[2];
    if (value === '/dev/null') return line;
    const normalized = normalizePatchOnlyChangedPath(value, context);
    if (!normalized) return line;
    const next = `${marker} ${marker === '---' ? 'a' : 'b'}/${normalized}`;
    if (next !== line) changed = true;
    return next;
  });
  return changed ? lines.join('\n') : text;
}

function normalizePatchOnlyChangedPath(file: string, context: {
  cwd: string;
  evidenceChangedPaths: readonly string[];
  allowedWrites: readonly string[];
}): string | undefined {
  const normalized = normalizePatchChangedPath(file);
  if (!normalized) return undefined;
  const candidates = uniqueStrings([
    normalized,
    ...patchOnlyRelativePathCandidates(normalized, context)
  ]);
  for (const candidate of candidates) {
    if (context.evidenceChangedPaths.includes(candidate)) return candidate;
    if (context.allowedWrites.some((glob) => matchesGlob(candidate, glob))) return candidate;
  }
  return normalized;
}

function patchOnlyRelativePathCandidates(file: string, context: {
  cwd: string;
  evidenceChangedPaths: readonly string[];
  allowedWrites: readonly string[];
}): string[] {
  const candidates: string[] = [];
  const absolute = file.startsWith('/') ? file : path.resolve('/', file);
  if (absolute.startsWith(`${context.cwd}/`)) candidates.push(path.relative(context.cwd, absolute).replace(/\\/g, '/'));
  for (const evidencePath of context.evidenceChangedPaths) {
    if (file === evidencePath || file.endsWith(`/${evidencePath}`)) candidates.push(evidencePath);
  }
  for (const glob of context.allowedWrites) {
    const prefix = globStaticPrefix(glob);
    if (!prefix) continue;
    const index = file.indexOf(prefix);
    if (index >= 0) candidates.push(file.slice(index));
  }
  return candidates.filter(Boolean);
}

function globStaticPrefix(glob: string): string {
  const firstGlob = glob.search(/[*?[\]{}]/);
  const prefix = (firstGlob >= 0 ? glob.slice(0, firstGlob) : glob).replace(/\\/g, '/');
  const slash = prefix.lastIndexOf('/');
  return slash >= 0 ? prefix.slice(0, slash + 1) : prefix;
}

function patchOnlyBundleReasons(input: {
  disposition: FrontierSwarmMergeBundle['disposition'];
  discoveryOnly: boolean;
  failedEvidence: boolean;
  blockedEvidence: boolean;
  ownershipViolations: readonly string[];
  generatedFailedEvidencePaths: readonly string[];
}): string[] {
  if (input.failedEvidence) return uniqueStrings([
    'rejected',
    ...(input.generatedFailedEvidencePaths.length ? ['generated-failed-evidence'] : []),
    ...input.ownershipViolations.map((file) => `ownership-violation:${file}`)
  ]).sort();
  if (input.blockedEvidence) return ['blocked'];
  if (input.discoveryOnly || input.disposition === 'discovery-only') return ['patch-only-record-only'];
  return [FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_REASON];
}

function inferPatchOnlyJobDir(runDir: string, patchPath: string): string {
  const parent = path.dirname(patchPath);
  if (path.basename(parent) === 'evidence') return path.dirname(parent);
  const relative = path.relative(runDir, patchPath).replace(/\\/g, '/');
  const first = relative.split('/').filter(Boolean)[0];
  return first && first !== path.basename(patchPath) ? path.join(runDir, first) : parent;
}

function inferPatchOnlyJobId(runDir: string, patchPath: string): string {
  const relative = path.relative(runDir, patchPath).replace(/\\/g, '/');
  const parts = relative.split('/').filter(Boolean);
  const evidenceIndex = parts.lastIndexOf('evidence');
  if (evidenceIndex > 0) return parts[evidenceIndex - 1];
  if (parts.length > 1) return parts[0];
  return path.basename(path.dirname(patchPath));
}

function changedPathsFromPatchText(text: string): string[] {
  const paths = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const diffMatch = /^diff --git (.+?) (.+)$/.exec(line);
    if (diffMatch) {
      addPatchChangedPath(paths, diffMatch[1]);
      addPatchChangedPath(paths, diffMatch[2]);
      continue;
    }
    const fileMatch = /^(?:---|\+\+\+) (.+)$/.exec(line);
    if (fileMatch) addPatchChangedPath(paths, fileMatch[1]);
  }
  return [...paths].sort();
}

function addPatchChangedPath(paths: Set<string>, value: string): void {
  const normalized = normalizePatchChangedPath(value);
  if (normalized) paths.add(normalized);
}

function normalizePatchChangedPath(value: string): string | undefined {
  let file = value.trim();
  if (!file || file === '/dev/null') return undefined;
  if ((file.startsWith('"') && file.endsWith('"')) || (file.startsWith("'") && file.endsWith("'"))) file = file.slice(1, -1);
  if (file.startsWith('a/') || file.startsWith('b/')) file = file.slice(2);
  if (!file || file === '/dev/null') return undefined;
  const tabIndex = file.indexOf('\t');
  if (tabIndex >= 0) file = file.slice(0, tabIndex);
  return file.replace(/\\/g, '/');
}

async function firstExistingPath(paths: readonly string[]): Promise<string | undefined> {
  for (const file of paths) {
    if (await pathExists(file)) return file;
  }
  return undefined;
}

async function readJsonObjectFile(file: string): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function readPatchOnlyPromptTask(prompt: string): Record<string, unknown> {
  const marker = 'Raw task JSON:';
  const markerIndex = prompt.indexOf(marker);
  const rawTask = markerIndex >= 0 ? parsePromptRawTaskJson(prompt.slice(markerIndex + marker.length)) : {};
  return {
    ...rawTask,
    jobId: readPromptHeader(prompt, 'Job') ?? readStringField(rawTask, ['jobId']),
    taskId: readPromptHeader(prompt, 'Task') ?? readStringField(rawTask, ['id', 'taskId']),
    lane: readPromptHeader(prompt, 'Lane') ?? readStringField(rawTask, ['lane']),
    title: readStringField(rawTask, ['title'])
  };
}

function parsePromptRawTaskJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text.trim());
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function readPromptHeader(prompt: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}:\\s*(.+)$`, 'm').exec(prompt);
  return match?.[1]?.trim() || undefined;
}

function readPatchOnlyAllowedWriteOk(evidence: Record<string, unknown>, allowedWriteCheck: Record<string, unknown>): boolean | undefined {
  for (const value of [
    evidence.changedPathsWithinAllowedGlobs,
    evidence.changedPathsInsideAllowedWrites,
    evidence.changedPathsWithinAllowedWrites,
    evidence.stayedInsideAllowedGlobs,
    evidence.stayedInsideAllowedWrites,
    evidence.withinAllowedGlobs,
    evidence.withinAllowedWrites,
    allowedWriteCheck.stayedInsideAllowedGlobs,
    allowedWriteCheck.stayedInsideAllowedWrites,
    allowedWriteCheck.changedPathsWithinAllowedGlobs,
    allowedWriteCheck.changedPathsInsideAllowedWrites,
    allowedWriteCheck.changedPathsWithinAllowedWrites
  ]) {
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function withCodexCollectionHeadMetadata(
  bundle: FrontierSwarmMergeBundle,
  input: { currentHead?: string; generatedAt: number; staleChecked: boolean; patchApplies: boolean }
): FrontierSwarmMergeBundle {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const codex = isObject(metadata[FRONTIER_SWARM_CODEX_METADATA_KEY]) ? metadata[FRONTIER_SWARM_CODEX_METADATA_KEY] : {};
  const collection = isObject(codex.collection) ? codex.collection : {};
  return {
    ...bundle,
    metadata: {
      ...metadata,
      [FRONTIER_SWARM_CODEX_METADATA_KEY]: {
        ...codex,
        collection: {
          ...collection,
          source: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
          generatedAt: input.generatedAt,
          staleChecked: input.staleChecked,
          patchApplies: input.patchApplies,
          ...(input.currentHead ? { head: input.currentHead } : {})
        }
      }
    } as FrontierSwarmMergeBundle['metadata']
  };
}

function readCodexCollectionHead(bundle: FrontierSwarmMergeBundle): string | undefined {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : undefined;
  const codex = metadata && isObject(metadata[FRONTIER_SWARM_CODEX_METADATA_KEY])
    ? metadata[FRONTIER_SWARM_CODEX_METADATA_KEY]
    : undefined;
  const collection = codex && isObject(codex.collection) ? codex.collection : undefined;
  return readGitSha(collection?.head)
    ?? readGitSha(codex?.collectionHead)
    ?? readGitSha(metadata?.collectionHead)
    ?? readGitSha(metadata?.sourceHead);
}

function readGitSha(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : undefined;
}

function normalizeCollectedMergeBundle(value: unknown, mergePath: string): FrontierSwarmMergeBundle {
  const input = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const jobId = typeof input.jobId === 'string' && input.jobId ? input.jobId : path.basename(path.dirname(mergePath));
  const changedPaths = stringArray(input.changedPaths);
  const status = typeof input.status === 'string' ? input.status as FrontierSwarmMergeBundle['status'] : 'completed';
  const autoMergeable = Boolean(input.autoMergeable);
  const metadata = isObject(input.metadata) ? input.metadata as FrontierSwarmMergeBundle['metadata'] : undefined;
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
    reasons: stringArray(input.reasons),
    ...(metadata ? { metadata } : {})
  };
}

function mergeRecordScore(record: CodexCollectMergeRecord): number {
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
  return FRONTIER_SWARM_CODEX_COORDINATOR_REVIEW_BUCKET;
}

function promoteCodexPatchCandidateBundle(
  bundle: FrontierSwarmMergeBundle,
  input: { patchExists: boolean; staleAgainstHead: boolean }
): FrontierSwarmMergeBundle {
  if (!isPromotableCodexPatchCandidate(bundle, input)) return bundle;
  return {
    ...bundle,
    mergeReadiness: 'verified-patch',
    disposition: 'auto-mergeable',
    riskLevel: bundle.riskLevel,
    autoMergeable: true,
    reasons: bundle.reasons.filter((reason) => !isCodexCoordinatorReviewReason(reason)),
    metadata: {
      ...(bundle.metadata ?? {}),
      coordinatorPatchCandidatePromotion: {
        source: 'frontier-swarm-codex.auto-drain',
        originalMergeReadiness: bundle.mergeReadiness,
        originalDisposition: bundle.disposition,
        originalRiskLevel: bundle.riskLevel,
        reason: 'owned patch candidate will be verified by coordinator gates before landing'
      }
    }
  };
}

function isPromotableCodexPatchCandidate(
  bundle: FrontierSwarmMergeBundle,
  input: { patchExists: boolean; staleAgainstHead: boolean }
): boolean {
  if (!input.patchExists || input.staleAgainstHead || bundle.staleAgainstHead) return false;
  if (bundle.status !== 'completed' && bundle.status !== 'verified') return false;
  if (bundle.disposition !== 'needs-port' || bundle.mergeReadiness !== 'patch-candidate') return false;
  if (!bundle.changedPaths.length || bundle.changedPaths.length > 8) return false;
  if (bundle.ownershipViolations.length || bundle.commandsFailed.length) return false;
  if (!bundle.allowedWrites.length) return false;
  if (!bundle.changedPaths.every((file) => bundle.allowedWrites.some((glob) => matchesGlob(file, glob)))) return false;
  const owned = new Set(bundle.ownedFilesTouched);
  if (!bundle.changedPaths.every((file) => owned.has(file))) return false;
  if (bundle.reasons.some((reason) => !isCodexCoordinatorReviewReason(reason))) return false;
  return true;
}

function hasCollectBundleCoordinatorVerification(
  bundle: FrontierSwarmMergeBundle,
  input: FrontierCodexCollectInput
): boolean {
  if (hasAutoDrainVerificationCommands(input.promotionFocusedCommands)) return true;
  if (!hasAutoDrainVerificationCommands(input.promotionGlobalCommands)) return false;
  return bundle.changedPaths.some((file) => (input.promotionGlobalGlobs ?? []).some((glob) => matchesGlob(file, glob)));
}

function hasAutoDrainVerificationCommands(commands: readonly (string | FrontierSwarmCommand)[] | undefined): boolean {
  return normalizeScoreCommands(commands ?? []).some((command) => command.required !== false);
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
