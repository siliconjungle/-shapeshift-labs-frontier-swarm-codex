import type {
  createSwarmProof,
  FrontierSwarmEventStream,
  FrontierSwarmJob,
  FrontierSwarmJobResultInput,
  FrontierSwarmLease,
  FrontierSwarmBacklog,
  FrontierSwarmBacklogInput,
  FrontierSwarmBacklogTaskPlanInput,
  FrontierSwarmManifestInput,
  FrontierSwarmAdaptiveObservationInput,
  FrontierSwarmModelRoutingFeedback,
  FrontierSwarmModelRoutingFeedbackInput,
  FrontierSwarmModelRoutingMode,
  FrontierSwarmModelRoutingPolicy,
  FrontierSwarmModelRoutingPolicyInput,
  FrontierSwarmModelRoutingPolicySignal,
  FrontierSwarmModelRoutingPolicySignalInput,
  FrontierSwarmPlan,
  FrontierSwarmPlanInput,
  FrontierSwarmRun,
  FrontierSwarmTaskInput
} from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSemanticImportOptions } from './types-semantic.js';
import type { FrontierCodexLogSummary } from './types-evidence.js';
import type { FrontierCodexWorkspacePlan } from './types-workspace.js';
import type { FrontierCodexDependencyHealthOptions } from './types-dependency-health.js';

export type FrontierCodexModelPolicy = 'config-default' | 'plan' | 'explicit';

export type FrontierCodexSwarmWorkspaceMode = 'current' | 'git-worktree' | 'snapshot' | 'copy';

export type FrontierCodexAllowedWriteEnforcement = 'audit' | 'strict' | 'off';

export interface FrontierCodexAllowedWritePolicyContract {
  mode: FrontierCodexAllowedWriteEnforcement;
  observesHostWorkspaceChanges: boolean;
  filtersWorkspaceNoiseBeforeOwnership: boolean;
  quarantinesDisallowedChanges: boolean;
  restoresDisallowedSourcePaths: boolean;
  appliesPreExecFence: boolean;
}

export interface FrontierCodexAllowedWritePolicyOptions {
  /**
   * Defaults to `audit` for compatibility in direct API usage. The CLI selects
   * `strict` by default for disposable copy/snapshot workspaces and preserves
   * `audit` for current/git-worktree workspaces unless callers opt in.
   *
   * `audit` preserves the historical contract: runner-owned/noise paths are
   * ignored before ownership checks, while real ownership violations still fail
   * the job and are quarantined from patch candidates.
   *
   * `strict` treats executor-reported paths as hints only and runs ownership
   * against host-observed, non-noise workspace mutations before caller filters.
   * Ignored workspace noise is still recorded in proofs, while disallowed
   * source paths remain excluded from patch and semantic-import candidates.
   *
   * `off` is an explicit CLI escape hatch for disabling host-observed write
   * fence collection. Executor-reported paths and any lower-level ownership
   * checks still apply.
   */
  mode?: FrontierCodexAllowedWriteEnforcement;
}

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
  allowedWritePolicy?: FrontierCodexAllowedWritePolicyOptions;
}

export interface FrontierCodexAdaptiveConcurrencyOptions {
  enabled?: boolean;
  mode?: 'observe' | 'conservative' | 'balanced' | 'aggressive' | string;
  minConcurrency?: number;
  maxConcurrency?: number;
  writePlan?: boolean;
}

export interface FrontierCodexResourceSchedulingOptions {
  enabled?: boolean;
  browserConcurrency?: number;
  staticCheckConcurrency?: number;
  apiCheckConcurrency?: number;
  fuzzerConcurrency?: number;
  laneConcurrency?: Record<string, number>;
  capabilityConcurrency?: Record<string, number>;
  resourceQuotas?: Record<string, number>;
}

export interface FrontierCodexCompactLogOptions {
  enabled?: boolean;
  maxEventBytes?: number;
  maxStderrBytes?: number;
}

export type FrontierCodexWorkerTimeoutKind = 'total' | 'no-output';

export interface FrontierCodexWorkerOutputProgress {
  startedAt: number;
  lastOutputAt?: number;
  eventBytes: number;
  stderrBytes: number;
  eventBytesWritten: number;
  stderrBytesWritten: number;
}

export interface FrontierCodexContextBudgetOptions {
  enabled?: boolean;
  mode?: 'off' | 'warn' | 'fail';
  warnPromptBytes?: number;
  maxPromptBytes?: number;
  warnEstimatedInputTokens?: number;
  maxEstimatedInputTokens?: number;
  warnActualInputTokens?: number;
  maxActualInputTokens?: number;
  maxSourceRefs?: number;
  maxTargetRefs?: number;
  maxWorkspaceIncludes?: number;
}

export interface FrontierCodexAdaptiveFeedbackRoutingKey {
  taskKind?: string;
  lane?: string;
  modelTier?: string;
}

export interface FrontierCodexAdaptiveFeedbackObservationMetadata {
  routingKey?: FrontierCodexAdaptiveFeedbackRoutingKey;
  taskKind?: string;
  workKind?: string;
  lane?: string;
  modelTier?: string;
  [key: string]: unknown;
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

export interface FrontierCodexJobPaths {
  jobDir: string;
  promptPath: string;
  eventsPath: string;
  stderrPath: string;
  lastMessagePath: string;
  evidenceDir: string;
  resourceAllocationPath: string;
  contextBudgetPath: string;
  workspaceProofPath: string;
  patchPath: string;
  mergeBundlePath: string;
  patchIntentPath: string;
  logSummaryPath: string;
  pidManifestPath: string;
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
  noOutputTimeoutMs?: number;
  compactLogs?: FrontierCodexCompactLogOptions;
}

export interface FrontierCodexExecutorResult {
  exitCode: number;
  signal?: string;
  changedPaths?: readonly string[];
  lastMessage?: string;
  logSummary?: FrontierCodexLogSummary;
  timedOut?: boolean;
  timeoutKind?: FrontierCodexWorkerTimeoutKind;
  timeoutMs?: number;
  noOutputMs?: number;
  lastOutputAt?: number;
  outputProgress?: FrontierCodexWorkerOutputProgress;
  deferredReason?: 'usage-limit' | string;
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

export interface FrontierCodexSwarmRunOptions {
  outDir: string;
  cwd?: string;
  codexPath?: string;
  maxConcurrency?: number;
  adaptiveConcurrency?: boolean | FrontierCodexAdaptiveConcurrencyOptions;
  resourceScheduling?: boolean | FrontierCodexResourceSchedulingOptions;
  compactLogs?: boolean | FrontierCodexCompactLogOptions;
  contextBudget?: boolean | FrontierCodexContextBudgetOptions;
  dependencyHealth?: boolean | FrontierCodexDependencyHealthOptions;
  semanticImportExpected?: boolean;
  adaptiveFeedbackPath?: string;
  adaptiveObservations?: readonly FrontierSwarmAdaptiveObservationInput[];
  workspace?: FrontierCodexSwarmWorkspaceInput;
  allowedWritePolicy?: FrontierCodexAllowedWritePolicyOptions;
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
  jobNoOutputTimeoutMs?: number;
  addDirs?: readonly string[];
  executor?: FrontierCodexExecutor;
  eventStream?: FrontierSwarmEventStream;
  runEventsPath?: string | false; runDashboardPath?: string | false;
  liveRunGraphEventsPath?: string | false;
  coordinatorSnapshotPath?: string;
  pidManifestPath?: string;
  prepareJobWorkspace?: FrontierCodexJobWorkspaceHook;
  renderJobPrompt?: FrontierCodexJobPromptHook;
  changedPathFilter?: FrontierCodexChangedPathFilter;
  semanticImport?: boolean | FrontierCodexSemanticImportOptions;
  onJobStarted?: FrontierCodexJobStartedHook;
  onJobFinished?: FrontierCodexJobFinishedHook;
  onSwarmFinished?: FrontierCodexSwarmFinishedHook;
}

export interface FrontierCodexSwarmRunResult {
  ok: boolean;
  outDir: string;
  plan: FrontierSwarmPlan;
  run: FrontierSwarmRun;
  proof: ReturnType<typeof createSwarmProof>;
  runEventsPath?: string;
  runDashboardPath?: string;
}

export interface FrontierCodexSwarmCliInput {
  manifest: unknown;
  tasks: unknown;
  plan?: FrontierSwarmPlanInput;
  backlog?: FrontierSwarmBacklog | FrontierSwarmBacklogInput | unknown;
  backlogPlan?: Omit<FrontierSwarmBacklogTaskPlanInput, 'backlog' | 'tasks'>;
  routingPolicy?: FrontierSwarmModelRoutingPolicyInput | FrontierSwarmModelRoutingPolicy | unknown;
  routingSignals?: readonly (FrontierSwarmModelRoutingPolicySignalInput | FrontierSwarmModelRoutingPolicySignal)[];
  routingFeedback?: readonly (FrontierSwarmModelRoutingFeedbackInput | FrontierSwarmModelRoutingFeedback)[];
  routingMode?: FrontierSwarmModelRoutingMode;
  routingContext?: FrontierSwarmPlanInput['routingContext'];
}
