import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  getWorkspaceNoisePathReason,
  isWorkspaceNoisePath,
  normalizeWorkspacePath,
  runProcess,
  workspacePathMatches,
  uniqueWorkspacePaths
} from './common.js';
import type {
  FrontierCodexSwarmRunOptions,
  FrontierCodexWorkspaceIgnoredChangedPathReason,
  FrontierCodexWorkspaceIgnoredChangedPathReasonCode,
  FrontierCodexWorkspacePlan
} from './index.js';

export type FrontierCodexWorkspaceFileSnapshot = Map<string, string>;

export interface FrontierCodexChangedPathCollection {
  observedChangedPaths: string[];
  changedPaths: string[];
  ignoredChangedPaths: string[];
  ignoredChangedPathReasons: FrontierCodexWorkspaceIgnoredChangedPathReason[];
}

export function emptyChangedPathCollection(): FrontierCodexChangedPathCollection {
  return {
    observedChangedPaths: [],
    changedPaths: [],
    ignoredChangedPaths: [],
    ignoredChangedPathReasons: []
  };
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

export function snapshotContainsWorkspacePath(snapshot: FrontierCodexWorkspaceFileSnapshot, file: string): boolean {
  if (snapshot.has(file)) return true;
  const prefix = file.replace(/\/$/, '') + '/';
  for (const entry of snapshot.keys()) {
    if (entry.startsWith(prefix)) return true;
  }
  return false;
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

async function gitChangedPaths(cwd: string): Promise<string[]> {
  const result = await runProcess('git', ['status', '--porcelain'], { cwd, allowFailure: true });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const value = line.slice(3);
    return value.includes(' -> ') ? value.split(' -> ') : [value];
  });
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
