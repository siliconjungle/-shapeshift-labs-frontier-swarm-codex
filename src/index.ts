import { spawn } from 'node:child_process';
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
  createSwarmMergeBundle,
  createSwarmMergeIndex,
  createSwarmQueueOverlay,
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
  type FrontierSwarmMergeBundle,
  type FrontierSwarmMergeIndex,
  type FrontierSwarmLease,
  type FrontierSwarmManifestInput,
  type FrontierSwarmPlan,
  type FrontierSwarmPlanInput,
  type FrontierSwarmQueueOverlay,
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
export const FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND = 'frontier.swarm-codex.patch-score';
export const FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION = 1;
export const FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND = 'frontier.swarm-codex.semantic-imports';
export const FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_VERSION = 1;

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
  onJobStarted?: FrontierCodexJobStartedHook;
  onJobFinished?: FrontierCodexJobFinishedHook;
  onSwarmFinished?: FrontierCodexSwarmFinishedHook;
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
  semanticSidecar?: unknown;
  sourceProjection?: unknown;
  nativeCompile?: unknown;
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
    semanticSidecars: {
      total: number;
      symbols: number;
      ownershipRegions: number;
      patchHints: number;
      empty: number;
    };
    sourceProjections: {
      total: number;
      preserved: number;
      stubs: number;
      ready: number;
      needsReview: number;
      blocked: number;
    };
    nativeCompiles: {
      total: number;
      emitted: number;
      preserved: number;
      targetStubs: number;
      ready: number;
      needsReview: number;
      blocked: number;
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
  const outDir = path.resolve(options.cwd ?? process.cwd(), options.outDir);
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
  const ok = run.summary.failedCount === 0 && run.summary.blockedCount === 0 && run.summary.ownershipViolationCount === 0;
  await appendFileSwarmEvent(eventStream, {
    type: 'swarm.finished',
    runId: run.id,
    data: { ok, summary: run.summary }
  });
  await fs.writeFile(path.join(outDir, 'swarm-results.json'), JSON.stringify({ ok, outDir, run, proof }, null, 2) + '\n');
  await writeSwarmCoordinatorSnapshot(options.coordinatorSnapshotPath ? path.resolve(options.cwd ?? process.cwd(), options.coordinatorSnapshotPath) : path.join(outDir, 'coordinator-dashboard.json'), {
    ok,
    outDir,
    plan,
    run,
    proof,
    eventStream,
    pidManifestPath
  });
  const result = { ok, outDir, plan, run, proof };
  await options.onSwarmFinished?.({ result });
  return result;
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
    ...(semanticImport ? { semanticImport: semanticImport.sidecar.summary } : {}),
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
    ...(semanticImport ? { semanticImport: semanticImport.sidecar.summary } : {}),
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
      const semanticSidecar = api.createSemanticImportSidecar
        ? api.createSemanticImportSidecar(importResult, {
          targetPath: file.path,
          metadata: {
            swarmJobId: input.job.id,
            swarmTaskId: input.job.taskId,
            swarmLane: input.job.lane
          }
        })
        : undefined;
      const sourceProjection = api.projectNativeImportToSource
        ? api.projectNativeImportToSource(importResult, { sourceText, sourcePath: file.path })
        : undefined;
      const nativeCompile = api.compileNativeSource
        ? api.compileNativeSource(importResult, { target: file.language, sourceText, sourcePath: file.path, emitOnBlocked: true })
        : undefined;
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
        semanticSidecar: summarizeLangSemanticImportSidecar(semanticSidecar),
        sourceProjection: summarizeNativeSourceProjection(sourceProjection),
        nativeCompile: summarizeNativeSourceCompile(nativeCompile),
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
    eventStream: input.eventStream ?? null,
    pidManifestPath: input.pidManifestPath ?? null,
    proof: input.proof
  };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(dashboard, null, 2) + '\n');
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
  const queueOverlay = createSwarmQueueOverlay({
    runId: path.basename(runDir),
    bundles: collectedBundles
  });
  const summary = {
    total: mergeRecords.length,
    'ready-to-apply': buckets['ready-to-apply'].length,
    'needs-human-port': buckets['needs-human-port'].length,
    'failed-evidence': buckets['failed-evidence'].length,
    'stale-against-head': buckets['stale-against-head'].length
  };
  const result: FrontierCodexCollectResult = {
    kind: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
    version: FRONTIER_SWARM_CODEX_COLLECTION_VERSION,
    ok: summary['failed-evidence'] === 0 && summary['stale-against-head'] === 0,
    runDir,
    outDir,
    generatedAt,
    buckets,
    mergeIndex,
    queueOverlay,
    summary
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'collection.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'merge-index.json'), JSON.stringify(mergeIndex, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'queue-overlay.json'), JSON.stringify(queueOverlay, null, 2) + '\n');
  return result;
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
  const result = await runProcess('git', ['status', '--porcelain'], { cwd, allowFailure: true });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).map((line) => line.slice(3));
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
    if (result.stdout.trim()) chunks.push(result.stdout);
  }
  return chunks.join('\n');
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
  createSemanticImportSidecar?(importResult: unknown, options?: Record<string, unknown>): any;
  projectNativeImportToSource?(importResult: unknown, options?: Record<string, unknown>): any;
  compileNativeSource?(importResult: unknown, options?: Record<string, unknown>): any;
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
      ...(typeof api.createSemanticImportSidecar === 'function' ? { createSemanticImportSidecar: api.createSemanticImportSidecar } : {}),
      ...(typeof api.projectNativeImportToSource === 'function' ? { projectNativeImportToSource: api.projectNativeImportToSource } : {}),
      ...(typeof api.compileNativeSource === 'function' ? { compileNativeSource: api.compileNativeSource } : {}),
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
  const semanticSidecars = records.reduce((totals, record) => {
    const summary = record.semanticSidecar as { symbols?: number; ownershipRegions?: number; patchHints?: number; emptySemanticIndex?: boolean } | undefined;
    if (!summary) return totals;
    totals.total += 1;
    totals.symbols += summary.symbols ?? 0;
    totals.ownershipRegions += summary.ownershipRegions ?? 0;
    totals.patchHints += summary.patchHints ?? 0;
    if (summary.emptySemanticIndex) totals.empty += 1;
    return totals;
  }, { total: 0, symbols: 0, ownershipRegions: 0, patchHints: 0, empty: 0 });
  const sourceProjections = records.reduce((totals, record) => {
    const summary = record.sourceProjection as { mode?: string; readiness?: string } | undefined;
    if (!summary) return totals;
    totals.total += 1;
    if (summary.mode === 'preserved-source') totals.preserved += 1;
    if (summary.mode === 'native-source-stubs') totals.stubs += 1;
    if (summary.readiness === 'ready' || summary.readiness === 'ready-with-losses') totals.ready += 1;
    else if (summary.readiness === 'blocked') totals.blocked += 1;
    else totals.needsReview += 1;
    return totals;
  }, { total: 0, preserved: 0, stubs: 0, ready: 0, needsReview: 0, blocked: 0 });
  const nativeCompiles = records.reduce((totals, record) => {
    const summary = record.nativeCompile as { ok?: boolean; outputMode?: string; readiness?: string } | undefined;
    if (!summary) return totals;
    totals.total += 1;
    if (summary.ok) totals.emitted += 1;
    if (summary.outputMode === 'preserved-source') totals.preserved += 1;
    if (summary.outputMode === 'target-stubs') totals.targetStubs += 1;
    if (summary.readiness === 'ready' || summary.readiness === 'ready-with-losses') totals.ready += 1;
    else if (summary.readiness === 'blocked') totals.blocked += 1;
    else totals.needsReview += 1;
    return totals;
  }, { total: 0, emitted: 0, preserved: 0, targetStubs: 0, ready: 0, needsReview: 0, blocked: 0 });
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
      semanticSidecars,
      sourceProjections,
      nativeCompiles,
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

function summarizeLangSemanticImportSidecar(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    id: value.id,
    imports: value.summary?.imports,
    symbols: value.summary?.symbols,
    ownershipRegions: value.summary?.ownershipRegions,
    sourceMapMappings: value.summary?.sourceMapMappings,
    readiness: value.summary?.readiness,
    emptySemanticIndex: value.summary?.emptySemanticIndex,
    patchHints: Array.isArray(value.patchHints) ? value.patchHints.length : 0,
    sampleOwnershipRegions: Array.isArray(value.ownershipRegions)
      ? value.ownershipRegions.slice(0, 12).map((region: any) => ({
        id: region?.id,
        key: region?.key,
        sourcePath: region?.sourcePath,
        symbolName: region?.symbolName,
        symbolKind: region?.symbolKind,
        sourceSpan: region?.sourceSpan,
        precision: region?.precision
      }))
      : []
  };
}

function summarizeNativeSourceProjection(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    id: value.id,
    language: value.language,
    sourcePath: value.sourcePath,
    mode: value.mode,
    outputHash: value.outputHash,
    declarationCount: Array.isArray(value.declarations) ? value.declarations.length : 0,
    lossCount: Array.isArray(value.losses) ? value.losses.length : 0,
    readiness: value.readiness?.readiness,
    sourceHashVerified: value.metadata?.sourceHashVerified,
    exactSourceAvailable: value.metadata?.exactSourceAvailable
  };
}

function summarizeNativeSourceCompile(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    id: value.id,
    ok: value.ok,
    language: value.language,
    target: value.target,
    sourcePath: value.sourcePath,
    outputMode: value.outputMode,
    outputHash: value.outputHash,
    lossCount: Array.isArray(value.losses) ? value.losses.length : 0,
    readiness: value.readiness?.readiness,
    targetCoverage: value.targetCoverage ? {
      target: value.targetCoverage.target,
      lossClass: value.targetCoverage.lossClass,
      supported: value.targetCoverage.supported,
      readiness: value.targetCoverage.readiness
    } : undefined
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
        if (entry.name === 'collected' || entry.name === 'node_modules' || entry.name === '.git') continue;
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
