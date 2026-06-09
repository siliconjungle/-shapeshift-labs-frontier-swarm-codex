import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FRONTIER_SWARM_MERGE_BUNDLE_KIND,
  FRONTIER_SWARM_MERGE_BUNDLE_VERSION,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmPatchStatus
} from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexCollectBucket } from './index.js';
import { isObject, pathExists, resolveBundlePatchPath, runProcess, tail, uniqueStrings } from './common.js';

export interface FrontierCodexPatchStaleness {
  stale: boolean;
  patchStatus: FrontierSwarmPatchStatus;
  reasons: string[];
  fresh: boolean;
}

export async function bundlePatchStaleness(
  bundle: FrontierSwarmMergeBundle,
  mergePath: string,
  cwd: string
): Promise<FrontierCodexPatchStaleness> {
  const patchPath = resolveBundlePatchPath(bundle, mergePath);
  if (!patchPath || !await pathExists(patchPath)) return { stale: false, patchStatus: 'missing', reasons: ['missing patch'], fresh: false };
  const patch = await fs.readFile(patchPath, 'utf8').catch(() => '');
  if (!patch.trim()) return { stale: false, patchStatus: 'missing', reasons: ['empty patch'], fresh: false };
  const result = await runProcess('git', ['apply', '--check', patchPath], { cwd, allowFailure: true });
  if (result.status === 0) return { stale: false, patchStatus: 'applies', reasons: ['patch applies to working tree'], fresh: true };
  const cached = await runProcess('git', ['apply', '--check', '--cached', patchPath], { cwd, allowFailure: true });
  if (cached.status === 0) {
    return {
      stale: false,
      patchStatus: 'dirty-workspace-conflict',
      reasons: ['patch applies to index but not dirty working tree'],
      fresh: true
    };
  }
  const baseStatus = await patchBaseHashStatus(patch, cwd);
  if (!baseStatus.known) {
    return {
      stale: false,
      patchStatus: 'needs-port',
      reasons: ['patch does not expose comparable base hashes; coordinator review must port it', ...baseStatus.reasons],
      fresh: false
    };
  }
  if (baseStatus.known && baseStatus.mismatched === 0) {
    return {
      stale: false,
      patchStatus: 'needs-port',
      reasons: ['patch base hashes match HEAD or working tree content but textual apply failed', ...baseStatus.reasons],
      fresh: true
    };
  }
  return {
    stale: false,
    patchStatus: 'needs-port',
    reasons: uniqueStrings(['patch base hashes differ from HEAD and working tree content; manual port required', ...baseStatus.reasons, ...tail(result.stderr || result.stdout, 3)]),
    fresh: false
  };
}


async function patchBaseHashStatus(patch: string, cwd: string): Promise<{ known: boolean; mismatched: number; reasons: string[] }> {
  const entries = parsePatchBaseHashes(patch, cwd);
  if (entries.length === 0) return { known: false, mismatched: 0, reasons: ['no patch base hashes available'] };
  let mismatched = 0;
  const reasons: string[] = [];
  for (const entry of entries) {
    const head = await runProcess('git', ['rev-parse', `HEAD:${entry.path}`], { cwd, allowFailure: true });
    const headHash = head.stdout.trim();
    if (head.status === 0 && headHash.startsWith(entry.oldHash)) continue;
    const worktree = await runProcess('git', ['hash-object', '--', entry.path], { cwd, allowFailure: true });
    const worktreeHash = worktree.stdout.trim();
    if (worktree.status === 0 && worktreeHash.startsWith(entry.oldHash)) {
      reasons.push(`base hash matches working tree content for ${entry.path}`);
      continue;
    }
    mismatched += 1;
    reasons.push(head.status !== 0 ? `missing HEAD blob for ${entry.path}` : `base hash mismatch for ${entry.path}`);
  }
  return { known: true, mismatched, reasons };
}


function parsePatchBaseHashes(patch: string, cwd: string): Array<{ path: string; oldHash: string }> {
  const lines = patch.split(/\r?\n/);
  const entries: Array<{ path: string; oldHash: string }> = [];
  let currentPath: string | undefined;
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const parts = line.split(/\s+/);
      currentPath = normalizePatchBasePath(parts[2], cwd) ?? normalizePatchBasePath(parts[3], cwd);
      continue;
    }
    if (!currentPath || !line.startsWith('index ')) continue;
    const match = /^index\s+([0-9a-f]+)\.\.([0-9a-f]+)/i.exec(line);
    if (match?.[1] && match[1] !== '0000000') entries.push({ path: currentPath, oldHash: match[1] });
  }
  return entries;
}


function normalizePatchBasePath(token: string | undefined, cwd: string): string | undefined {
  if (!token || token === '/dev/null') return undefined;
  let value = token;
  if (value.startsWith('a/') || value.startsWith('b/')) value = value.slice(2);
  if (value === '/dev/null') return undefined;
  if (path.isAbsolute(value)) {
    const relative = path.relative(cwd, value);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative.replace(/\\/g, '/');
    return undefined;
  }
  const rootedValue = path.join(path.parse(cwd).root, value);
  const rootedRelative = path.relative(cwd, rootedValue);
  if (rootedRelative && !rootedRelative.startsWith('..') && !path.isAbsolute(rootedRelative)) return rootedRelative.replace(/\\/g, '/');
  return value.replace(/\\/g, '/');
}


export function normalizeCollectedMergeBundle(value: unknown, mergePath: string): FrontierSwarmMergeBundle {
  const input = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const jobId = typeof input.jobId === 'string' && input.jobId ? input.jobId : path.basename(path.dirname(mergePath));
  const changedPaths = stringArray(input.changedPaths);
  const status = typeof input.status === 'string' ? input.status as FrontierSwarmMergeBundle['status'] : 'completed';
  const autoMergeable = Boolean(input.autoMergeable);
  const disposition = typeof input.disposition === 'string'
    ? input.disposition as FrontierSwarmMergeBundle['disposition']
    : autoMergeable ? 'auto-mergeable' : status === 'failed' ? 'rejected' : 'needs-port';
  const bundle = {
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
    ...(isObject(input.semanticImport) ? { semanticImport: input.semanticImport as unknown as FrontierSwarmMergeBundle['semanticImport'] } : {}),
    ...(isObject(input.metadata) ? { metadata: input.metadata as FrontierSwarmMergeBundle['metadata'] } : {})
  } as FrontierSwarmMergeBundle;
  if (Array.isArray(input.traceShards)) {
    (bundle as FrontierSwarmMergeBundle & { traceShards?: unknown[] }).traceShards = input.traceShards;
  }
  return bundle;
}


export function mergeRecordScore(record: { mergePath: string; bundle: FrontierSwarmMergeBundle }): number {
  return (record.mergePath.includes('/evidence/') ? 100 : 0)
    + record.bundle.changedPaths.length
    + record.bundle.evidencePaths.length
    + record.bundle.commandsPassed.length
    + record.bundle.commandsFailed.length;
}


function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}


export function classifyCodexCollectBucket(bundle: FrontierSwarmMergeBundle, staleAgainstHead: boolean): FrontierCodexCollectBucket {
  if (staleAgainstHead) return 'stale-against-head';
  if (bundle.disposition === 'rejected' || bundle.disposition === 'blocked' || bundle.commandsFailed.length > 0 || bundle.status === 'failed') {
    return 'failed-evidence';
  }
  if (bundle.disposition === 'auto-mergeable' && bundle.autoMergeable) return 'ready-to-apply';
  return 'needs-human-port';
}


export function normalizeCollectedStaleAgainstHead(
  bundle: FrontierSwarmMergeBundle,
  staleness: FrontierCodexPatchStaleness,
  checkStale: boolean
): boolean {
  const inheritedStale = bundle.staleAgainstHead || bundle.disposition === 'stale-against-head';
  if (!checkStale) return inheritedStale;
  if (staleness.stale) return true;
  if (staleness.fresh) return false;
  return inheritedStale;
}


export function normalizeCollectedDisposition(
  bundle: FrontierSwarmMergeBundle,
  staleAgainstHead: boolean
): FrontierSwarmMergeBundle['disposition'] {
  if (staleAgainstHead) return 'stale-against-head';
  if (bundle.disposition === 'stale-against-head') return 'needs-port';
  return bundle.disposition;
}
