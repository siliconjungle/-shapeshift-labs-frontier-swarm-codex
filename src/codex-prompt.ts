import path from 'node:path';
import type { FrontierSwarmCommand, FrontierSwarmJob, FrontierSwarmLease } from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_DEFAULT_MODEL,
  FRONTIER_SWARM_CODEX_DEFAULT_REASONING_EFFORT
} from './constants.js';
import { stableHash, uniqueWorkspacePaths } from './common.js';
import { createCodexEvidenceResourceHints } from './codex-evidence-capabilities.js';
export { createCodexEvidenceResourceHints } from './codex-evidence-capabilities.js';
export type {
  FrontierCodexEvidenceCapability,
  FrontierCodexEvidenceResourceHints
} from './codex-evidence-capabilities.js';
import type {
  FrontierCodexBrowserAllocation,
  FrontierCodexJobPaths,
  FrontierCodexResourceAllocation,
  FrontierCodexSwarmRunOptions
} from './index.js';

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

export function createCodexResourceAllocation(
  job: FrontierSwarmJob,
  input: { cwd?: string; outDir: string; workspacePath?: string; lease?: FrontierSwarmLease }
): FrontierCodexResourceAllocation {
  const requirements = job.resourceRequirements;
  const hints = createCodexEvidenceResourceHints(job);
  const capabilities = hints.capabilities;
  const resources = hints.resources;
  const env: Record<string, string> = {
    FRONTIER_SWARM_JOB_ID: job.id,
    FRONTIER_SWARM_TASK_ID: job.taskId,
    FRONTIER_SWARM_LANE: job.lane,
    FRONTIER_SWARM_CAPABILITIES: capabilities.join(',')
  };
  const browser = requirements?.browser;
  if (!browser) {
    env.FRONTIER_SWARM_RESOURCE_ALLOCATION = JSON.stringify({ capabilities, resources });
    return { capabilities, resources, env };
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
    'Source edits: only allowed write globs. For out-of-scope or cross-stream needs, write an evidence handoff naming target lane, target files, and rationale; do not patch them. Strict runs restore unauthorized source writes before verification and mark the job failed. Cite real commands/evidence; never fake success.',
    'Cross-stream handoff artifacts must live under this job evidence directory and include: target lane, target files, rationale, suggested verification commands, expected result, evidence path, and any follow-up owner or dependency.',
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

function resolveCodexModelFlag(job: FrontierSwarmJob, input: FrontierCodexSwarmRunOptions): string | undefined {
  const explicit = normalizeCodexModelFlag(input.model);
  if (explicit || input.model === false) return explicit;
  const policy = input.modelPolicy ?? (input.forwardPlanModel ? 'plan' : 'config-default');
  if (policy === 'plan') return normalizeCodexModelFlag(job.compute.model ?? FRONTIER_SWARM_CODEX_DEFAULT_MODEL);
  return undefined;
}

function resolveCodexReasoningEffort(job: FrontierSwarmJob, input: FrontierCodexSwarmRunOptions): string | undefined {
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

function shouldSkipGitRepoCheck(input: FrontierCodexSwarmRunOptions): boolean {
  const workspace = input.workspace;
  if (!workspace) return false;
  if (workspace.skipGitRepoCheck !== undefined) return workspace.skipGitRepoCheck;
  return workspace.mode === 'copy' || workspace.mode === 'snapshot';
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
