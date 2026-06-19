import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmCommand } from '@shapeshift-labs/frontier-swarm';
import {
  getWorkspaceNoisePathReason,
  isWorkspaceNoisePath,
  normalizeWorkspacePath,
  pathExists,
  runProcess,
  shouldPruneWorkspaceWriteFenceTraversal,
  tail,
  workspacePathMatches,
  uniqueWorkspacePaths
} from './common.js';
import type {
  FrontierCodexJobPaths,
  FrontierCodexSwarmRunOptions,
  FrontierCodexWorkspaceIgnoredChangedPathReason,
  FrontierCodexWorkspaceIgnoredChangedPathReasonCode,
  FrontierCodexWorkspacePlan,
  FrontierCodexWorkspaceWriteFenceSummary
} from './index.js';

export type FrontierCodexWorkspaceFileSnapshot = Map<string, string>;

export interface FrontierCodexChangedPathCollection {
  observedChangedPaths: string[];
  changedPaths: string[];
  ignoredChangedPaths: string[];
  ignoredChangedPathReasons: FrontierCodexWorkspaceIgnoredChangedPathReason[];
}

export interface FrontierCodexWorkspaceRestoreRecord {
  path: string;
  action: 'restored' | 'deleted' | 'missing' | 'skipped';
  reason: string;
}

export interface FrontierCodexWorkspaceWriteFenceRecord {
  path: string;
  absolutePath: string;
  kind: 'file' | 'directory';
  originalMode: number;
  fencedMode: number;
}

export interface FrontierCodexWorkspaceWriteFenceState {
  summary: FrontierCodexWorkspaceWriteFenceSummary;
  records: FrontierCodexWorkspaceWriteFenceRecord[];
}

export function emptyChangedPathCollection(): FrontierCodexChangedPathCollection {
  return {
    observedChangedPaths: [],
    changedPaths: [],
    ignoredChangedPaths: [],
    ignoredChangedPathReasons: []
  };
}

export async function applyWorkspacePreExecWriteFence(input: {
  workspace: string;
  workspacePlan: FrontierCodexWorkspacePlan;
  allowedWrites: readonly string[];
  writableRoots?: readonly string[];
  enabled?: boolean;
}): Promise<FrontierCodexWorkspaceWriteFenceState> {
  const writableRoots = uniqueWriteFenceRoots(input.writableRoots ?? input.allowedWrites);
  const skipped = skippedWriteFenceReason(input.enabled !== false, input.workspacePlan);
  if (skipped) return { records: [], summary: createWriteFenceSummary({ mode: 'none', skippedReason: skipped, writableRoots }) };
  const records: FrontierCodexWorkspaceWriteFenceRecord[] = [];
  await walkWorkspaceWriteFence(input.workspace, input.workspace, writableRoots, records);
  return {
    records,
    summary: createWriteFenceSummary({
      mode: 'chmod-readonly',
      applied: records.length > 0,
      lockedPathCount: records.length,
      sampleLockedPaths: records.slice(0, 20).map((entry) => entry.path),
      writableRoots
    })
  };
}

export async function restoreWorkspacePreExecWriteFence(
  state: FrontierCodexWorkspaceWriteFenceState
): Promise<FrontierCodexWorkspaceWriteFenceSummary> {
  let restoredPathCount = 0;
  let failedRestoreCount = 0;
  for (const record of [...state.records].reverse()) {
    try {
      await fs.chmod(record.absolutePath, record.originalMode);
      restoredPathCount += 1;
    } catch {
      failedRestoreCount += 1;
    }
  }
  return { ...state.summary, restoredPathCount, failedRestoreCount };
}

export function shouldSnapshotWorkspaceChanges(plan: FrontierCodexWorkspacePlan, options: FrontierCodexSwarmRunOptions): boolean {
  return options.collectGitStatus !== false && (plan.mode === 'copy' || plan.mode === 'snapshot');
}

export async function snapshotWorkspaceFiles(root: string): Promise<FrontierCodexWorkspaceFileSnapshot> {
  const snapshot: FrontierCodexWorkspaceFileSnapshot = new Map();
  await walkWorkspaceFiles(root, root, snapshot);
  return snapshot;
}

export async function collectChangedPaths(
  cwd: string,
  baseline: FrontierCodexWorkspaceFileSnapshot | undefined,
  plan: FrontierCodexWorkspacePlan
): Promise<FrontierCodexChangedPathCollection> {
  if (!baseline) return filterWorkspaceChangedPaths(await gitChangedPaths(cwd), plan);
  const after = await snapshotWorkspaceFiles(cwd);
  return filterWorkspaceChangedPathsFromSnapshots(diffWorkspaceFiles(baseline, after), plan, baseline, after);
}

export function filterWorkspaceChangedPaths(
  paths: readonly string[],
  plan: FrontierCodexWorkspacePlan
): FrontierCodexChangedPathCollection {
  return filterWorkspaceChangedPathsWithEmptyMarkers(paths, plan, new Set());
}

function filterWorkspaceChangedPathsFromSnapshots(
  paths: readonly string[],
  plan: FrontierCodexWorkspacePlan,
  before: FrontierCodexWorkspaceFileSnapshot,
  after: FrontierCodexWorkspaceFileSnapshot
): FrontierCodexChangedPathCollection {
  return filterWorkspaceChangedPathsWithEmptyMarkers(paths, plan, deletedChildEmptyDirectoryMarkers(paths, before, after));
}

function filterWorkspaceChangedPathsWithEmptyMarkers(
  paths: readonly string[],
  plan: FrontierCodexWorkspacePlan,
  emptyDirectoryMarkers: ReadonlySet<string>
): FrontierCodexChangedPathCollection {
  const observedChangedPaths = uniqueWorkspaceChangedPaths(paths, plan);
  const changedPaths: string[] = [];
  const ignoredChangedPaths: string[] = [];
  const ignoredChangedPathReasons: FrontierCodexWorkspaceIgnoredChangedPathReason[] = [];
  for (const file of observedChangedPaths) {
    const reasonCode = emptyDirectoryMarkers.has(file)
      ? 'empty_directory_marker'
      : getIgnoredWorkspaceChangedPathReason(file, plan);
    if (reasonCode) {
      ignoredChangedPaths.push(file);
      ignoredChangedPathReasons.push({ path: file, reasonCode });
    } else {
      changedPaths.push(file);
    }
  }
  return { observedChangedPaths, changedPaths, ignoredChangedPaths, ignoredChangedPathReasons };
}

function deletedChildEmptyDirectoryMarkers(
  paths: readonly string[],
  before: FrontierCodexWorkspaceFileSnapshot,
  after: FrontierCodexWorkspaceFileSnapshot
): Set<string> {
  const out = new Set<string>();
  const changed = uniqueWorkspacePaths(paths);
  const beforePaths = Array.from(before.keys());
  for (const file of changed) {
    const marker = after.get(file);
    if (!marker?.startsWith('empty-dir')) continue;
    if (before.has(file)) continue;
    const prefix = file.replace(/\/+$/, '') + '/';
    if (beforePaths.some((candidate) => candidate.startsWith(prefix))) out.add(file);
  }
  return out;
}

export function mergeWorkspaceChangedPathCollections(
  collections: readonly FrontierCodexChangedPathCollection[]
): FrontierCodexChangedPathCollection {
  const ignoredReasonByKey = new Map<string, FrontierCodexWorkspaceIgnoredChangedPathReason>();
  for (const collection of collections) {
    for (const reason of collection.ignoredChangedPathReasons) {
      ignoredReasonByKey.set(`${reason.path}:${reason.reasonCode}`, reason);
    }
  }
  return {
    observedChangedPaths: uniqueWorkspacePaths(collections.flatMap((collection) => collection.observedChangedPaths)),
    changedPaths: uniqueWorkspacePaths(collections.flatMap((collection) => collection.changedPaths)),
    ignoredChangedPaths: uniqueWorkspacePaths(collections.flatMap((collection) => collection.ignoredChangedPaths)),
    ignoredChangedPathReasons: Array.from(ignoredReasonByKey.values())
  };
}

export function createIgnoredWorkspaceChangedPathReasons(
  paths: readonly string[],
  plan: FrontierCodexWorkspacePlan
): FrontierCodexWorkspaceIgnoredChangedPathReason[] {
  const reasons: FrontierCodexWorkspaceIgnoredChangedPathReason[] = [];
  for (const file of uniqueWorkspaceChangedPaths(paths, plan)) {
    const reasonCode = getIgnoredWorkspaceChangedPathReason(file, plan);
    if (reasonCode) reasons.push({ path: file, reasonCode });
  }
  return reasons;
}

export function getIgnoredWorkspaceChangedPathReason(
  file: string,
  plan: FrontierCodexWorkspacePlan
): FrontierCodexWorkspaceIgnoredChangedPathReasonCode | undefined {
  if (plan.mode !== 'copy' && plan.mode !== 'snapshot') return undefined;
  const noiseReason = getWorkspaceNoisePathReason(file);
  if (noiseReason) return noiseReason;
  if (isGeneratedWorkspaceSetupFile(file) && !isExplicitWorkspaceInput(file, plan)) return 'generated_setup';
  if (plan.excludes.some((entry) => workspacePathMatches(file, entry))) return 'workspace_exclude';
  if (plan.artifactIncludes.some((entry) => workspacePathMatches(file, entry))) return 'artifact_include';
  if (plan.linkPaths.some((entry) => workspacePathMatches(file, entry))) return 'linked_path';
  return undefined;
}

export function quarantineWorkspacePatchCandidatePaths(
  changedPaths: readonly string[],
  ownershipViolations: readonly string[]
): { patchCandidateChangedPaths: string[]; quarantinedChangedPaths: string[] } {
  const violations = new Set(ownershipViolations);
  const patchCandidateChangedPaths: string[] = [];
  const quarantinedChangedPaths: string[] = [];
  for (const file of uniqueWorkspacePaths(changedPaths)) {
    if (violations.has(file)) quarantinedChangedPaths.push(file);
    else patchCandidateChangedPaths.push(file);
  }
  return { patchCandidateChangedPaths, quarantinedChangedPaths };
}

export async function restoreWorkspaceChangedPaths(input: {
  workspace: string;
  sourceRoot: string;
  workspacePlan: FrontierCodexWorkspacePlan;
  baseline?: FrontierCodexWorkspaceFileSnapshot;
  changedPaths: readonly string[];
}): Promise<FrontierCodexWorkspaceRestoreRecord[]> {
  const paths = uniqueWorkspacePaths(input.changedPaths);
  if (!paths.length) return [];
  if (input.workspacePlan.mode !== 'copy' && input.workspacePlan.mode !== 'snapshot') {
    return paths.map((file) => ({
      path: file,
      action: 'skipped',
      reason: `workspace mode ${input.workspacePlan.mode} is not isolated`
    }));
  }

  const records: FrontierCodexWorkspaceRestoreRecord[] = [];
  for (const file of paths) {
    const source = path.join(input.sourceRoot, file);
    const target = path.join(input.workspace, file);
    const sourceExists = await pathExists(source);
    const targetExists = await pathExists(target);
    const existedAtBaseline = input.baseline ? snapshotContainsWorkspacePath(input.baseline, file) : undefined;
    if (input.baseline && !existedAtBaseline) {
      if (targetExists) {
        await fs.rm(target, { recursive: true, force: true });
        await pruneUnauthorizedEmptyParents(input.workspace, file, input.baseline);
        records.push({ path: file, action: 'deleted', reason: 'removed unauthorized new path' });
      } else {
        records.push({ path: file, action: 'missing', reason: 'path absent in workspace baseline and workspace' });
      }
    } else if (sourceExists) {
      await fs.rm(target, { recursive: true, force: true });
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(source, target, { recursive: true, force: true, verbatimSymlinks: true });
      records.push({ path: file, action: 'restored', reason: 'restored from source root' });
    } else if (targetExists) {
      await fs.rm(target, { recursive: true, force: true });
      if (input.baseline) await pruneUnauthorizedEmptyParents(input.workspace, file, input.baseline);
      records.push({ path: file, action: 'deleted', reason: 'removed unauthorized path missing from source root' });
    } else {
      records.push({ path: file, action: 'missing', reason: 'path absent in source and workspace' });
    }
  }
  return records;
}

function snapshotContainsWorkspacePath(snapshot: FrontierCodexWorkspaceFileSnapshot, file: string): boolean {
  if (snapshot.has(file)) return true;
  const prefix = file.replace(/\/$/, '') + '/';
  for (const entry of snapshot.keys()) {
    if (entry.startsWith(prefix)) return true;
  }
  return false;
}

async function pruneUnauthorizedEmptyParents(
  workspace: string,
  file: string,
  baseline: FrontierCodexWorkspaceFileSnapshot
): Promise<void> {
  let current = path.dirname(file);
  while (current && current !== '.' && !path.isAbsolute(current)) {
    if (snapshotContainsWorkspacePath(baseline, current)) return;
    const absolute = path.join(workspace, current);
    try {
      await fs.rmdir(absolute);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}

export function normalizeWorkspaceChangedPath(file: string, plan: FrontierCodexWorkspacePlan): string | undefined {
  const value = String(file ?? '').trim();
  if (!value) return undefined;
  if (path.isAbsolute(value)) {
    return normalizeWorkspacePath(path.relative(plan.path, value).replace(/\\/g, '/'));
  }
  return normalizeWorkspacePath(value);
}

export function uniqueWorkspaceChangedPaths(paths: readonly string[], plan: FrontierCodexWorkspacePlan): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const file of paths) {
    const normalized = normalizeWorkspaceChangedPath(file, plan);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export async function writeCodexPatchFile(input: {
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
  const diff = input.workspacePlan.mode === 'copy' || input.workspacePlan.mode === 'snapshot'
    ? await noIndexWorkspacePatch(input.sourceRoot, input.workspace, changedPaths)
    : input.workspacePlan.mode === 'git-worktree'
      ? await noIndexWorkspacePatch(input.sourceRoot, input.workspace, changedPaths)
      : await gitDiffPatch(input.workspace, changedPaths);
  await fs.writeFile(input.paths.patchPath, diff);
  return diff.trim().length ? input.paths.patchPath : undefined;
}

export async function runVerification(
  commands: readonly FrontierSwarmCommand[],
  cwd: string
): Promise<Array<{ name: string; command: string[]; status: number; durationMs: number; stdoutTail: string[]; stderrTail: string[]; required: boolean }>> {
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

const WRITE_FENCE_LIMITATIONS = [
  'chmod-readonly is a best-effort pre-exec fence, not a security sandbox',
  'a worker running as the same OS user can chmod owned paths back to writable',
  'workspace root and allowed-write ancestors may remain writable so allowed new files can be created',
  'symlinks and heavyweight dependency/run artifact trees are not traversed; strict post-exec restore is the durable enforcement'
];

async function walkWorkspaceWriteFence(
  root: string,
  current: string,
  allowedWrites: readonly string[],
  records: FrontierCodexWorkspaceWriteFenceRecord[]
): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replace(/\\/g, '/');
    if (!relative || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (shouldPruneWorkspaceWriteFenceTraversal(relative)) {
        await fenceWorkspacePath(absolute, relative, 'directory', allowedWrites, records);
        continue;
      }
      await walkWorkspaceWriteFence(root, absolute, allowedWrites, records);
      await fenceWorkspacePath(absolute, relative, 'directory', allowedWrites, records);
    } else if (entry.isFile()) {
      await fenceWorkspacePath(absolute, relative, 'file', allowedWrites, records);
    }
  }
}

async function fenceWorkspacePath(
  absolutePath: string,
  relativePath: string,
  kind: 'file' | 'directory',
  allowedWrites: readonly string[],
  records: FrontierCodexWorkspaceWriteFenceRecord[]
): Promise<void> {
  const keepWritable = kind === 'directory'
    ? allowedWrites.some((entry) => writeEntryCoversDirectory(relativePath, entry))
    : allowedWrites.some((entry) => writeEntryCoversFile(relativePath, entry));
  if (keepWritable) return;
  const stat = await fs.lstat(absolutePath).catch(() => undefined);
  if (!stat) return;
  const originalMode = stat.mode & 0o7777;
  const fencedMode = originalMode & ~0o222;
  if (fencedMode === originalMode) return;
  await fs.chmod(absolutePath, fencedMode).catch(() => {});
  const after = await fs.lstat(absolutePath).catch(() => undefined);
  if (!after || (after.mode & 0o222) !== 0) return;
  records.push({ path: relativePath, absolutePath, kind, originalMode, fencedMode });
}

function writeEntryCoversFile(file: string, entry: string): boolean {
  const parsed = parseWriteFenceEntry(entry);
  if (!parsed) return false;
  if (parsed.all) return true;
  return file === parsed.prefix || file.startsWith(parsed.prefix + '/');
}

function writeEntryCoversDirectory(directory: string, entry: string): boolean {
  const parsed = parseWriteFenceEntry(entry);
  if (!parsed) return false;
  if (parsed.all) return true;
  return directory === parsed.prefix
    || directory.startsWith(parsed.prefix + '/')
    || parsed.prefix.startsWith(directory + '/');
}

function parseWriteFenceEntry(entry: string): { all: true } | { all: false; prefix: string } | undefined {
  const raw = String(entry ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!raw || raw.includes('\0') || path.isAbsolute(raw) || path.win32.isAbsolute(raw)) return undefined;
  if (raw === '*' || raw === '**' || raw === '**/*') return { all: true };
  const starIndex = raw.indexOf('*');
  const staticPart = writeFenceStaticRoot(raw, starIndex);
  const prefix = normalizeWorkspacePath(staticPart);
  return prefix ? { all: false, prefix } : undefined;
}

function writeFenceStaticRoot(raw: string, starIndex: number): string {
  if (starIndex < 0) return raw.replace(/\/+$/, '');
  const staticPart = raw.slice(0, starIndex);
  if (staticPart.endsWith('/')) return staticPart.replace(/\/+$/, '');
  const segmentEnd = staticPart.lastIndexOf('/');
  if (segmentEnd < 0) return '';
  return staticPart.slice(0, segmentEnd).replace(/\/+$/, '');
}

function skippedWriteFenceReason(enabled: boolean, plan: FrontierCodexWorkspacePlan): string | undefined {
  if (!enabled) return 'worker execution skipped';
  if (plan.allowedWritePolicy.mode !== 'strict') return 'allowed write policy is audit';
  if (plan.mode !== 'copy' && plan.mode !== 'snapshot') return `workspace mode ${plan.mode} is not isolated`;
  return undefined;
}

function createWriteFenceSummary(input: {
  mode: FrontierCodexWorkspaceWriteFenceSummary['mode'];
  applied?: boolean;
  skippedReason?: string;
  lockedPathCount?: number;
  sampleLockedPaths?: string[];
  writableRoots: readonly string[];
}): FrontierCodexWorkspaceWriteFenceSummary {
  return {
    mode: input.mode,
    applied: input.applied ?? false,
    ...(input.skippedReason ? { skippedReason: input.skippedReason } : {}),
    lockedPathCount: input.lockedPathCount ?? 0,
    restoredPathCount: 0,
    failedRestoreCount: 0,
    sampleLockedPaths: input.sampleLockedPaths ?? [],
    writableRoots: uniqueWriteFenceRoots(input.writableRoots),
    limitations: WRITE_FENCE_LIMITATIONS
  };
}

function uniqueWriteFenceRoots(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const root = String(value ?? '').trim();
    if (!root || seen.has(root)) continue;
    seen.add(root);
    out.push(root);
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
    if (result.stdout.trim()) chunks.push(rewriteNoIndexPatchPaths(result.stdout, file, { sourceExists, targetExists }));
  }
  return chunks.join('\n');
}

function rewriteNoIndexPatchPaths(
  patch: string,
  file: string,
  input: { sourceExists: boolean; targetExists: boolean }
): string {
  const oldPath = input.sourceExists ? `a/${file}` : '/dev/null';
  const newPath = input.targetExists ? `b/${file}` : '/dev/null';
  return patch.split(/\r?\n/).map((line) => {
    if (line.startsWith('diff --git ')) return `diff --git a/${file} b/${file}`;
    if (line.startsWith('--- ')) return `--- ${oldPath}`;
    if (line.startsWith('+++ ')) return `+++ ${newPath}`;
    return line;
  }).join('\n');
}

function isGeneratedWorkspaceSetupFile(file: string): boolean {
  return file === 'loom.json' || file === '.loomignore' || file === '.gitignore';
}

function isExplicitWorkspaceInput(file: string, plan: FrontierCodexWorkspacePlan): boolean {
  const inputs = [...plan.includes, ...plan.artifactIncludes, ...plan.requiredIncludes, ...plan.optionalIncludes];
  return inputs.some((entry) => file === entry || file.startsWith(entry.replace(/\/$/, '') + '/'));
}

async function walkWorkspaceFiles(root: string, current: string, snapshot: FrontierCodexWorkspaceFileSnapshot): Promise<void> {
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
      if (isWorkspaceNoisePath(relative)) {
        snapshot.set(relative, snapshotMarker('ignored-dir'));
        continue;
      }
      const beforeSize = snapshot.size;
      await walkWorkspaceFiles(root, absolute, snapshot);
      if (relative && snapshot.size === beforeSize) snapshot.set(relative, snapshotMarker('empty-dir'));
      continue;
    }
    if (stat.isFile()) {
      snapshot.set(relative, isWorkspaceNoisePath(relative)
        ? await snapshotFileMarker('ignored-file', absolute, stat)
        : await snapshotFileMarker('file', absolute, stat));
    }
  }
}

async function snapshotFileMarker(kind: string, absolute: string, stat: { size: number }): Promise<string> {
  try {
    const hash = createHash('sha256').update(await fs.readFile(absolute)).digest('hex');
    return `${kind}:${stat.size}:${hash}`;
  } catch {
    return `${kind}:${stat.size}:unreadable`;
  }
}

function snapshotMarker(kind: string): string {
  return kind;
}

function diffWorkspaceFiles(before: FrontierCodexWorkspaceFileSnapshot, after: FrontierCodexWorkspaceFileSnapshot): string[] {
  const changed = new Set<string>();
  for (const [file, marker] of after) {
    if (before.get(file) !== marker) changed.add(file);
  }
  for (const file of before.keys()) {
    if (!after.has(file)) changed.add(file);
  }
  return Array.from(changed).sort();
}
