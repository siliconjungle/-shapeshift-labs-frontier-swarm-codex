import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FRONTIER_SWARM_MERGE_BUNDLE_KIND,
  FRONTIER_SWARM_MERGE_BUNDLE_VERSION,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmPatchStatus
} from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexCollectBucket } from './index.js';
import { isObject, pathExists, pathHasIgnoredSegment, resolveBundlePatchPath, runProcess, tail, uniqueStrings } from './common.js';

export interface FrontierCodexPatchStaleness {
  stale: boolean;
  patchStatus: FrontierSwarmPatchStatus;
  reasons: string[];
  reasonClasses: string[];
  fresh: boolean;
}

export type FrontierCodexCollectCompactReasonClass =
  | 'infrastructure-noise'
  | 'source-blocker'
  | 'patch-port-required'
  | 'stale-state'
  | 'unknown-failure';

export async function bundlePatchStaleness(
  bundle: FrontierSwarmMergeBundle,
  mergePath: string,
  cwd: string
): Promise<FrontierCodexPatchStaleness> {
  const patchPath = resolveBundlePatchPath(bundle, mergePath);
  if (!patchPath || !await pathExists(patchPath)) return patchStalenessResult(false, 'missing', ['missing patch'], false);
  const patch = await fs.readFile(patchPath, 'utf8').catch(() => '');
  if (!patch.trim()) return patchStalenessResult(false, 'missing', ['empty patch'], false);
  const result = await runProcess('git', ['apply', '--check', patchPath], { cwd, allowFailure: true });
  if (result.status === 0) return patchStalenessResult(false, 'applies', ['patch applies to working tree'], true);
  const cached = await runProcess('git', ['apply', '--check', '--cached', patchPath], { cwd, allowFailure: true });
  if (cached.status === 0) {
    return patchStalenessResult(false, 'dirty-workspace-conflict', ['patch applies to index but not dirty working tree'], true);
  }
  const baseStatus = await patchBaseHashStatus(patch, cwd);
  if (!baseStatus.known) {
    return patchStalenessResult(
      false,
      'needs-port',
      ['patch does not expose comparable base hashes; coordinator review must port it', ...baseStatus.reasons, ...tail(result.stderr || result.stdout, 3)],
      false
    );
  }
  if (baseStatus.known && baseStatus.mismatched === 0) {
    return patchStalenessResult(
      false,
      'needs-port',
      ['patch base hashes match HEAD or working tree content but textual apply failed', ...baseStatus.reasons, ...tail(result.stderr || result.stdout, 3)],
      true
    );
  }
  return patchStalenessResult(
    false,
    'needs-port',
    ['patch base hashes differ from HEAD and working tree content; manual port required', ...baseStatus.reasons, ...tail(result.stderr || result.stdout, 3)],
    false
  );
}


function patchStalenessResult(
  stale: boolean,
  patchStatus: FrontierSwarmPatchStatus,
  reasons: readonly string[],
  fresh: boolean
): FrontierCodexPatchStaleness {
  const normalizedReasons = uniqueStrings([...reasons]);
  return {
    stale,
    patchStatus,
    reasons: normalizedReasons,
    reasonClasses: collectFailureReasonClasses(normalizedReasons, patchStatus),
    fresh
  };
}


export function collectFailureReasonClasses(
  reasons: readonly string[],
  patchStatus?: FrontierSwarmPatchStatus
): string[] {
  const classes: string[] = [];
  if (patchStatus) classes.push(`patch-status.${patchStatus}`);
  for (const reason of reasons) {
    const normalized = reason.toLowerCase();
    if (normalized === 'missing patch') classes.push('patch.missing');
    if (normalized === 'empty patch') classes.push('patch.empty');
    if (normalized.includes('patch applies to working tree')) classes.push('patch.applies');
    if (normalized.includes('patch applies to index but not dirty working tree')) classes.push('patch.dirty-workspace-conflict');
    if (normalized.includes('stale check disabled')) classes.push('stale.check-disabled');
    if (normalized.includes('stale-against-head cleared by patch freshness check')) classes.push('stale.cleared-by-freshness-check');
    if (normalized.includes('no patch base hashes available')) classes.push('patch.no-base-hashes');
    if (normalized.includes('textual apply failed')) classes.push('patch.textual-apply-failed');
    if (normalized.includes('base hash mismatch')) classes.push('patch.base-hash-mismatch');
    if (normalized.includes('base hash matches working tree content')) classes.push('patch.base-hash-matches-worktree');
    if (invalidGitIndexReason(normalized)) classes.push('workspace.invalid-git-index');
    if (ownershipViolationReason(normalized)) classes.push('ownership.violation');
    if (generatedWorkspaceSetupReason(normalized)) classes.push('generated.workspace-setup');
    if (normalized.includes('source ownership violations present')) classes.push('ownership.source-violation');
    if (normalized.includes('ignored workspace noise ownership violations present')) {
      classes.push('workspace.ignored-noise');
      classes.push('workspace.ignored-noise.ownership-violation');
    }
    if (normalized.includes('quarantined-disallowed-changes')) classes.push('workspace.quarantine');
    if (normalized.includes('restored-disallowed-changes')) classes.push('workspace.restore-disallowed-changes');
    if (normalized.includes('.tsbuildinfo')) classes.push('generated.tsbuildinfo-change');
    const missingHeadBlobPath = missingHeadBlobReasonPath(reason);
    if (missingHeadBlobPath) {
      classes.push('patch.missing-head-blob');
      if (ignoredWorkspaceNoisePath(missingHeadBlobPath)) classes.push('patch.missing-head-blob.generated');
    }
  }
  return uniqueStrings(classes);
}


export function compactCollectFailureReasonClasses(reasonClasses: readonly string[]): FrontierCodexCollectCompactReasonClass[] {
  const classes: FrontierCodexCollectCompactReasonClass[] = [];
  const generatedMissingHeadBlob = reasonClasses.includes('patch.missing-head-blob.generated');
  for (const reasonClass of reasonClasses) {
    if (infrastructureNoiseFailureReasonClass(reasonClass)) classes.push('infrastructure-noise');
    else if (sourceBlockerFailureReasonClass(reasonClass) && !(reasonClass === 'patch.missing-head-blob' && generatedMissingHeadBlob)) {
      classes.push('source-blocker');
    } else if (staleFailureReasonClass(reasonClass)) {
      classes.push('stale-state');
    } else if (patchPortFailureReasonClass(reasonClass)) {
      classes.push('patch-port-required');
    }
  }
  return uniqueStrings(classes) as FrontierCodexCollectCompactReasonClass[];
}


export function infrastructureNoiseFailureReasonClass(reasonClass: string): boolean {
  return reasonClass === 'workspace.invalid-git-index'
    || reasonClass === 'workspace.ignored-noise'
    || reasonClass.startsWith('workspace.ignored-noise.')
    || reasonClass.startsWith('generated.')
    || reasonClass.endsWith('.generated');
}


export function sourceBlockerFailureReasonClass(reasonClass: string): boolean {
  return reasonClass === 'ownership.source-violation'
    || reasonClass === 'patch.missing'
    || reasonClass === 'patch.empty'
    || reasonClass === 'patch.missing-head-blob'
    || reasonClass === 'patch.base-hash-mismatch';
}


function staleFailureReasonClass(reasonClass: string): boolean {
  return reasonClass.startsWith('stale.');
}


function patchPortFailureReasonClass(reasonClass: string): boolean {
  return reasonClass === 'patch.no-base-hashes'
    || reasonClass === 'patch.textual-apply-failed'
    || reasonClass === 'patch.base-hash-matches-worktree'
    || reasonClass === 'patch.dirty-workspace-conflict'
    || reasonClass.startsWith('patch-status.');
}


function invalidGitIndexReason(reason: string): boolean {
  return (reason.includes('.git/index') || reason.includes('.git\\index') || reason.includes('index file'))
    && (
      reason.includes('fatal:')
      || reason.includes('error:')
      || reason.includes('invalid')
      || reason.includes('corrupt')
      || reason.includes('smaller than expected')
      || reason.includes('unknown index entry')
    );
}


function ownershipViolationReason(reason: string): boolean {
  return reason === 'ownership-violations'
    || reason === 'ownership violations present'
    || reason.includes('ownership violation');
}


function missingHeadBlobReasonPath(reason: string): string | undefined {
  const match = /^missing HEAD blob for (.+)$/i.exec(reason.trim());
  return match?.[1]?.trim();
}


export function ignoredWorkspaceNoisePath(file: string): boolean {
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  return normalized.endsWith('.tsbuildinfo')
    || pathHasIgnoredSegment(normalized, [
      '.git',
      '.cache',
      '.turbo',
      '.next',
      'coverage',
      'dist',
      'build',
      'generated',
      'node_modules',
      '.frontier-framework',
      'agent-runs',
      'target'
    ]);
}


export function sourceOwnershipViolations(paths: readonly string[]): string[] {
  return sourceOwnershipViolationsForReasons(paths, []);
}


export function ignoredWorkspaceNoiseOwnershipViolations(paths: readonly string[]): string[] {
  return ignoredWorkspaceNoiseOwnershipViolationsForReasons(paths, []);
}


export function sourceOwnershipViolationsForReasons(paths: readonly string[], reasons: readonly string[]): string[] {
  return paths.filter((entry) => !ignoredWorkspaceNoisePath(entry) && !generatedWorkspaceSetupOwnershipPath(entry, reasons));
}


export function ignoredWorkspaceNoiseOwnershipViolationsForReasons(paths: readonly string[], reasons: readonly string[]): string[] {
  return paths.filter((entry) => ignoredWorkspaceNoisePath(entry) || generatedWorkspaceSetupOwnershipPath(entry, reasons));
}


function ownershipReasonDetails(paths: readonly string[], reasons: readonly string[] = []): string[] {
  if (!paths.length) return [];
  return [
    ...(sourceOwnershipViolationsForReasons(paths, reasons).length ? ['source ownership violations present'] : []),
    ...(ignoredWorkspaceNoiseOwnershipViolationsForReasons(paths, reasons).length ? ['ignored workspace noise ownership violations present'] : [])
  ];
}


function ignoredWorkspaceNoiseOnlyFailure(bundle: FrontierSwarmMergeBundle): boolean {
  if (bundle.commandsFailed.length > 0) return false;
  if (sourceOwnershipViolationsForReasons(bundle.ownershipViolations, bundle.reasons).length > 0) return false;
  const reasonClasses = collectFailureReasonClasses(bundle.reasons);
  const compactReasonClasses = compactCollectFailureReasonClasses(reasonClasses);
  const hasInfrastructureNoise = compactReasonClasses.includes('infrastructure-noise')
    || ignoredWorkspaceNoiseOwnershipViolationsForReasons(bundle.ownershipViolations, bundle.reasons).length > 0;
  if (!hasInfrastructureNoise) return false;
  if (compactReasonClasses.includes('source-blocker')) return false;
  return bundle.reasons.every((reason) => {
    if (ignoredWorkspaceNoiseFailureReason(reason)) return true;
    return collectFailureReasonClasses([reason]).some((reasonClass) => infrastructureNoiseFailureReasonClass(reasonClass));
  });
}


function ignoredWorkspaceNoiseFailureReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return normalized === 'failed'
    || normalized === 'rejected'
    || normalized === 'blocked'
    || normalized === 'ownership-violations'
    || normalized === 'ownership violations present'
    || normalized === 'ignored workspace noise ownership violations present'
    || generatedWorkspaceSetupReason(normalized)
    || normalized === 'quarantined-disallowed-changes'
    || normalized === 'restored-disallowed-changes'
    || normalized === 'stale check disabled'
    || normalized.startsWith('patch-status.');
}


function generatedWorkspaceSetupReason(reason: string): boolean {
  return reason === 'generated_setup'
    || reason.includes('generated setup')
    || reason.includes('generated workspace setup');
}


function generatedWorkspaceSetupOwnershipPath(file: string, reasons: readonly string[]): boolean {
  if (!reasons.some((reason) => generatedWorkspaceSetupReason(reason.toLowerCase()))) return false;
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  return normalized === '.gitignore' || normalized === '.loomignore' || normalized === 'loom.json';
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
  const ownershipViolations = stringArray(input.ownershipViolations);
  const status = typeof input.status === 'string' ? input.status as FrontierSwarmMergeBundle['status'] : 'completed';
  const autoMergeable = Boolean(input.autoMergeable);
  const disposition = typeof input.disposition === 'string'
    ? input.disposition as FrontierSwarmMergeBundle['disposition']
    : autoMergeable ? 'auto-mergeable' : status === 'failed' ? 'rejected' : 'needs-port';
  const inputReasons = stringArray(input.reasons);
  const reasons = uniqueStrings([...inputReasons, ...ownershipReasonDetails(ownershipViolations, inputReasons)]);
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
    ownershipViolations,
    ...(typeof input.patchPath === 'string' ? { patchPath: input.patchPath } : {}),
    ...(typeof input.patchHash === 'string' ? { patchHash: input.patchHash } : {}),
    evidencePaths: stringArray(input.evidencePaths),
    commandsPassed: Array.isArray(input.commandsPassed) ? input.commandsPassed as FrontierSwarmMergeBundle['commandsPassed'] : [],
    commandsFailed: Array.isArray(input.commandsFailed) ? input.commandsFailed as FrontierSwarmMergeBundle['commandsFailed'] : [],
    traceShards: Array.isArray(input.traceShards) ? input.traceShards as FrontierSwarmMergeBundle['traceShards'] : [],
    queueItemIds: stringArray(input.queueItemIds),
    ...(typeof input.branchName === 'string' ? { branchName: input.branchName } : {}),
    ...(typeof input.commit === 'string' ? { commit: input.commit } : {}),
    staleAgainstHead: Boolean(input.staleAgainstHead),
    reasons,
    ...(isObject(input.semanticImport) ? { semanticImport: input.semanticImport as unknown as FrontierSwarmMergeBundle['semanticImport'] } : {}),
    ...(isObject(input.metadata) ? { metadata: input.metadata as FrontierSwarmMergeBundle['metadata'] } : {})
  } as FrontierSwarmMergeBundle;
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
  if (bundle.changedPaths.length > 0 && bundle.patchPath && (bundle.disposition === 'rejected' || bundle.commandsFailed.length > 0 || bundle.status === 'failed')) {
    return 'rerun-work';
  }
  if (bundle.ownershipViolations.length > 0 && bundle.changedPaths.length > 0 && bundle.patchPath) return 'rerun-work';
  if (nonActionableFailedEvidence(bundle, { staleAgainstHead })) return 'needs-human-port';
  if (bundle.disposition === 'rejected' || bundle.disposition === 'blocked' || bundle.commandsFailed.length > 0 || bundle.status === 'failed') {
    if (ignoredWorkspaceNoiseOnlyFailure(bundle)) return 'needs-human-port';
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
  staleAgainstHead: boolean,
  patchExists = Boolean(bundle.patchPath)
): FrontierSwarmMergeBundle['disposition'] {
  if (staleAgainstHead) return 'stale-against-head';
  if (nonActionableFailedEvidence(bundle, { staleAgainstHead, hasActionablePatch: patchExists })) return 'needs-port';
  if (ignoredWorkspaceNoiseOnlyFailure(bundle)) return 'needs-port';
  if (bundle.disposition === 'stale-against-head') return 'needs-port';
  return bundle.disposition;
}

export function nonActionableFailedEvidence(
  bundle: FrontierSwarmMergeBundle,
  input: { staleAgainstHead: boolean; hasActionablePatch?: boolean }
): boolean {
  if (input.staleAgainstHead || bundle.staleAgainstHead) return false;
  if (input.hasActionablePatch ?? Boolean(bundle.patchPath)) return false;
  if (bundle.changedPaths.length > 0 || bundle.ownershipViolations.length > 0 || bundle.commandsFailed.length > 0) return false;
  if (!bundle.reasons.some(nonActionableFailedEvidenceReason)) return false;
  return bundle.disposition === 'blocked'
    || bundle.disposition === 'rejected'
    || bundle.mergeReadiness === 'blocked'
    || bundle.mergeReadiness === 'rejected'
    || bundle.status === 'failed'
    || bundle.status === 'blocked';
}

function nonActionableFailedEvidenceReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return normalized.includes('no-source-changes')
    || normalized.includes('no source changes')
    || normalized.includes('non-actionable-worker-output')
    || normalized.includes('failed-output-recorded')
    || normalized.includes('blocked-output-recorded');
}
