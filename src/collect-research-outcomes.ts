import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';

export function isCompletedResearchEvidenceBundle(
  bundle: FrontierSwarmMergeBundle,
  input: { staleAgainstHead: boolean; hasActionablePatch: boolean }
): boolean {
  if (input.staleAgainstHead || input.hasActionablePatch) return false;
  if (bundle.changedPaths.length > 0 || bundle.ownershipViolations.length > 0 || bundle.commandsFailed.length > 0) return false;
  if (bundle.status === 'failed' || bundle.status === 'blocked' || bundle.disposition === 'rejected' || bundle.disposition === 'blocked') return false;
  if (!bundleHasResearchOutcomeSignal(bundle)) return false;
  return bundleHasUsefulEvidence(bundle);
}

function bundleHasResearchOutcomeSignal(bundle: FrontierSwarmMergeBundle): boolean {
  return bundle.disposition === 'discovery-only'
    || bundle.mergeReadiness === 'discovery-only'
    || bundle.disposition === 'evidence-only'
    || bundle.mergeReadiness === 'evidence-only'
    || bundle.status === 'evidence-only'
    || bundle.reasons.some((reason) => normalizedReasonIncludes(reason, [
      'discovery-only',
      'discovery complete',
      'discovery-complete',
      'evidence-only',
      'research-complete',
      'research complete',
      'gap-analysis',
      'gap analysis',
      'synthesized',
      'synthesis'
    ]));
}

function bundleHasUsefulEvidence(bundle: FrontierSwarmMergeBundle): boolean {
  return bundle.commandsPassed.length > 0
    || (bundle.traceShards ?? []).length > 0
    || bundle.evidencePaths.some((entry) => {
      const lower = entry.toLowerCase();
      return !lower.endsWith('.patch')
        && !lower.endsWith('.diff')
        && !lower.endsWith('/changes.patch')
        && !lower.endsWith('\\changes.patch');
    });
}

function normalizedReasonIncludes(reason: string, needles: readonly string[]): boolean {
  const normalized = reason.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return needles.some((needle) => normalized.includes(needle.toLowerCase().replace(/[^a-z0-9]+/g, '-')));
}
