import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_KIND,
  FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_VERSION,
  FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_KIND,
  FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_VERSION
} from './constants.js';
import {
  copyWorkspacePath,
  isObject,
  normalizeWorkspacePath,
  pathExists,
  readStringArray,
  runProcess,
  stableHash,
  uniqueWorkspacePaths
} from './common.js';
import { createIgnoredWorkspaceChangedPathReasons } from './codex-workspace-changes.js';
import type {
  FrontierCodexSwarmRunOptions,
  FrontierCodexSwarmWorkspaceMode,
  FrontierCodexWorkspaceIgnoredChangedPathReason,
  FrontierCodexWorkspaceManifest,
  FrontierCodexWorkspacePlan,
  FrontierCodexWorkspaceProof,
  FrontierCodexWorkspaceWriteFenceSummary
} from './index.js';

const DEFAULT_WORKSPACE_INCLUDES = ['AGENTS.md', 'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'config'];
const DEFAULT_WORKSPACE_EXCLUDES = [
  '.git',
  '.cache',
  '.turbo',
  '.next',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.frontier-framework',
  'agent-runs',
  'target'
];

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
  const workspace = options.workspace ?? { mode: 'current' as FrontierCodexSwarmWorkspaceMode };
  const mode = workspace.mode ?? 'current';
  const root = path.resolve(cwd, workspace.root ?? path.join('agent-worktrees', 'frontier-swarm-codex'));
  const allowedWritePolicy = normalizeAllowedWritePolicy(options.allowedWritePolicy ?? workspace.allowedWritePolicy);
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
      allowedWritePolicy,
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
  const replaceGeneratedWorkspace = mode === 'copy' || mode === 'snapshot';
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
    allowedWritePolicy,
    linkNodeModules: workspace.linkNodeModules ?? (mode !== 'git-worktree'),
    replace: workspace.replace ?? replaceGeneratedWorkspace,
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
    allowedWritePolicy: { ...plan.allowedWritePolicy },
    linkNodeModules: plan.linkNodeModules,
    skipGitRepoCheck: plan.skipGitRepoCheck
  };
}

export async function createSwarmWorkspaceProof(
  plan: FrontierCodexWorkspacePlan,
  input: {
    ignoredChangedPaths?: readonly string[];
    ignoredChangedPathReasons?: readonly FrontierCodexWorkspaceIgnoredChangedPathReason[];
    observedChangedPaths?: readonly string[];
    reportedChangedPaths?: readonly string[];
    preExecWriteFence?: FrontierCodexWorkspaceWriteFenceSummary;
    generatedAt?: number;
  } = {}
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
  const ignoredChangedPathReasons = uniqueIgnoredChangedPathReasons(
    input.ignoredChangedPathReasons ?? createIgnoredWorkspaceChangedPathReasons(ignoredChangedPaths, plan)
  );
  const observedChangedPaths = uniqueWorkspacePaths(input.observedChangedPaths ?? []);
  const reportedChangedPaths = uniqueWorkspacePaths(input.reportedChangedPaths ?? []);
  const preExecWriteFence = input.preExecWriteFence;
  return {
    kind: FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_KIND,
    version: FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_VERSION,
    id: 'codex-workspace-proof:' + stableHash([manifest.id, copiedPaths, linkedPaths, missingRequired, missingOptional, ignoredChangedPaths, ignoredChangedPathReasons, observedChangedPaths, reportedChangedPaths, preExecWriteFence, generatedAt]),
    generatedAt,
    manifest,
    copiedPaths: uniqueWorkspacePaths(copiedPaths),
    linkedPaths,
    missingRequired,
    missingOptional,
    ignoredChangedPaths,
    ignoredChangedPathReasons,
    observedChangedPaths,
    reportedChangedPaths,
    ...(preExecWriteFence ? { preExecWriteFence } : {}),
    summary: {
      copiedCount: uniqueWorkspacePaths(copiedPaths).length,
      linkedCount: linkedPaths.length,
      missingRequiredCount: missingRequired.length,
      missingOptionalCount: missingOptional.length,
      ignoredChangedPathCount: ignoredChangedPaths.length,
      ignoredChangedPathReasonCounts: countIgnoredChangedPathReasons(ignoredChangedPathReasons),
      observedChangedPathCount: observedChangedPaths.length,
      reportedChangedPathCount: reportedChangedPaths.length
    }
  };
}

function normalizeAllowedWritePolicy(
  value: FrontierCodexSwarmRunOptions['allowedWritePolicy']
): Required<NonNullable<FrontierCodexSwarmRunOptions['allowedWritePolicy']>> {
  return { mode: value?.mode === 'strict' ? 'strict' : 'audit' };
}

function uniqueIgnoredChangedPathReasons(
  reasons: readonly FrontierCodexWorkspaceIgnoredChangedPathReason[]
): FrontierCodexWorkspaceIgnoredChangedPathReason[] {
  const out: FrontierCodexWorkspaceIgnoredChangedPathReason[] = [];
  const seen = new Set<string>();
  for (const reason of reasons) {
    const path = normalizeWorkspacePath(reason.path);
    if (!path) continue;
    const key = `${path}:${reason.reasonCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path, reasonCode: reason.reasonCode });
  }
  return out;
}

function countIgnoredChangedPathReasons(
  reasons: readonly FrontierCodexWorkspaceIgnoredChangedPathReason[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reason of reasons) counts[reason.reasonCode] = (counts[reason.reasonCode] ?? 0) + 1;
  return counts;
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
