import type {
  createSwarmProof,
  FrontierSwarmEventStream,
  FrontierSwarmJob,
  FrontierSwarmJobResultInput,
  FrontierSwarmLease,
  FrontierSwarmManifestInput,
  FrontierSwarmPlan,
  FrontierSwarmPlanInput,
  FrontierSwarmRun,
  FrontierSwarmTaskInput
} from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSemanticImportOptions } from './types-semantic.js';
import type { FrontierCodexLogSummary } from './types-evidence.js';
import type { FrontierCodexWorkspacePlan } from './types-workspace.js';

export type FrontierCodexModelPolicy = 'config-default' | 'plan' | 'explicit';

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

export interface FrontierCodexAdaptiveConcurrencyOptions {
  enabled?: boolean;
  mode?: 'observe' | 'conservative' | 'balanced' | 'aggressive' | string;
  minConcurrency?: number;
  maxConcurrency?: number;
  writePlan?: boolean;
}

export interface FrontierCodexCompactLogOptions {
  enabled?: boolean;
  maxEventBytes?: number;
  maxStderrBytes?: number;
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
  compactLogs?: FrontierCodexCompactLogOptions;
}

export interface FrontierCodexExecutorResult {
  exitCode: number;
  signal?: string;
  changedPaths?: readonly string[];
  lastMessage?: string;
  logSummary?: FrontierCodexLogSummary;
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
  compactLogs?: boolean | FrontierCodexCompactLogOptions;
  semanticImportExpected?: boolean;
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
}

export interface FrontierCodexSwarmCliInput {
  manifest: unknown;
  tasks: unknown;
  plan?: FrontierSwarmPlanInput;
}
