import type { FrontierSwarmMergeBundle, FrontierSwarmPatchStatus } from '@shapeshift-labs/frontier-swarm';
import { pathHasIgnoredSegment, uniqueStrings } from './common.js';

export type FrontierCodexCollectCompactReasonClass =
  | 'infrastructure-noise'
  | 'source-blocker'
  | 'patch-port-required'
  | 'stale-state'
  | 'unknown-failure';

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
    if (normalized.includes('stale-worker')) classes.push('stale.worker-stopped');
    if (normalized.includes('worker-no-output-progress')) classes.push('stale.worker-no-output-progress');
    if (normalized.startsWith('worker-timeout:')) classes.push('stale.worker-timeout');
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

export function ownershipReasonDetails(paths: readonly string[], reasons: readonly string[] = []): string[] {
  if (!paths.length) return [];
  return [
    ...(sourceOwnershipViolationsForReasons(paths, reasons).length ? ['source ownership violations present'] : []),
    ...(ignoredWorkspaceNoiseOwnershipViolationsForReasons(paths, reasons).length ? ['ignored workspace noise ownership violations present'] : [])
  ];
}

export function ignoredWorkspaceNoiseOnlyFailure(bundle: FrontierSwarmMergeBundle): boolean {
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

function nonActionableFailedEvidenceReason(reason: string): boolean {
  const normalized = reason.toLowerCase();
  return normalized.includes('no-source-changes')
    || normalized.includes('no source changes')
    || normalized.includes('non-actionable-worker-output')
    || normalized.includes('failed-output-recorded')
    || normalized.includes('blocked-output-recorded')
    || normalized.includes('generated-failed-evidence');
}
