import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FRONTIER_SWARM_DEFAULT_MODEL,
  FRONTIER_SWARM_DEFAULT_REASONING_EFFORT,
  checkSwarmOwnership,
  completeSwarmJob,
  createSwarmMergeBundle,
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
  type FrontierSwarmLease,
  type FrontierSwarmManifestInput,
  type FrontierSwarmPlan,
  type FrontierSwarmPlanInput,
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

export type FrontierCodexModelPolicy = 'config-default' | 'plan' | 'explicit';

const DEFAULT_WORKSPACE_INCLUDES = ['AGENTS.md', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'config'];
const DEFAULT_WORKSPACE_EXCLUDES = [
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.frontier-framework',
  'agent-runs',
  'test/roms',
  'target'
];

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
  onJobStarted?: FrontierCodexJobStartedHook;
  onJobFinished?: FrontierCodexJobFinishedHook;
  onSwarmFinished?: FrontierCodexSwarmFinishedHook;
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
  workspaceProofPath: string;
  patchPath: string;
  mergeBundlePath: string;
  pidManifestPath: string;
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
  summary: Record<FrontierCodexCollectBucket, number> & { total: number };
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
  const hookInput = {
    job,
    cwd: options.cwd ?? process.cwd(),
    outDir,
    workspacePath: workspace,
    workspacePlan,
    paths
  };
  await options.prepareJobWorkspace?.(hookInput);
  const fileSnapshot = shouldSnapshotWorkspaceChanges(workspacePlan, options)
    ? await snapshotWorkspaceFiles(workspace)
    : undefined;
  const basePrompt = renderCodexPrompt(job, { workspacePath: workspace, paths });
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
    data: { workspace: workspacePlan.path, capabilities: job.capabilities, resourceRequirements: job.resourceRequirements }
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
    evidencePaths: [paths.evidenceDir, paths.workspaceProofPath, paths.mergeBundlePath, ...(patchPath ? [patchPath] : [])],
    ...(patchPath ? { patchPath } : {}),
    queueItemIds: [job.taskId],
    verification,
    lastMessage: execution.lastMessage,
    error: execution.error,
    metadata: lease ? { leaseId: lease.id, leaseToken: lease.token, fencingToken: lease.fencingToken } : undefined
  };
  const mergeBundle = createSwarmMergeBundle({
    runId: options.eventStream?.runId,
    job,
    result,
    ...(patchPath ? { patchPath } : {}),
    evidencePaths: [paths.evidenceDir, paths.workspaceProofPath],
    queueItemIds: [job.taskId]
  });
  await fs.writeFile(paths.mergeBundlePath, JSON.stringify(mergeBundle, null, 2) + '\n');
  return result;
}

export function buildCodexArgs(
  job: FrontierSwarmJob,
  input: FrontierCodexSwarmRunOptions & { workspacePath: string; paths: FrontierCodexJobPaths }
): string[] {
  const model = resolveCodexModelFlag(job, input);
  const effort = resolveCodexReasoningEffort(job, input);
  const sandbox = job.compute.sandbox ?? input.sandbox ?? 'workspace-write';
  const args = [
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
  const approval = normalizeCodexApprovalPolicy(input.approval);
  if (approval) args.push('--ask-for-approval', approval);
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

export function renderCodexPrompt(
  job: FrontierSwarmJob,
  input: { workspacePath: string; paths: FrontierCodexJobPaths }
): string {
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
    const child = spawn(input.codexPath, input.args, { cwd: input.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
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
  const manifest = await readCodexPidManifest(file).catch(() => ({
    kind: FRONTIER_SWARM_CODEX_PID_MANIFEST_KIND,
    version: FRONTIER_SWARM_CODEX_PID_MANIFEST_VERSION,
    ...(runId ? { runId } : {}),
    entries: []
  } satisfies FrontierCodexPidManifest));
  const entries = manifest.entries.filter((existing) => existing.pid !== entry.pid || existing.jobId !== entry.jobId);
  entries.push(entry);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ ...manifest, ...(runId ? { runId } : {}), entries }, null, 2) + '\n');
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
  const mergePaths = await findFilesByName(runDir, 'merge.json');
  for (const mergePath of mergePaths.sort()) {
    const bundle = JSON.parse(await fs.readFile(mergePath, 'utf8')) as FrontierSwarmMergeBundle;
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
    const outputDir = path.join(outDir, bucket, slug(bundle.jobId));
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'merge.json'), JSON.stringify(nextBundle, null, 2) + '\n');
    const patchPath = resolveBundlePatchPath(nextBundle, mergePath);
    if (patchPath && await pathExists(patchPath)) await fs.copyFile(patchPath, path.join(outputDir, 'changes.patch')).catch(() => {});
    buckets[bucket].push({ bucket, jobId: bundle.jobId, mergePath, outputDir, bundle: nextBundle });
  }
  const summary = {
    total: mergePaths.length,
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
    summary
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'collection.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
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
