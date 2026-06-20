import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { isObject } from './common.js';

const RESEARCH_OUTCOME_SIGNALS = [
  'discovery-only',
  'discovery complete',
  'discovery-complete',
  'evidence-only',
  'evidence only',
  'research',
  'research-complete',
  'research complete',
  'gap-analysis',
  'gap analysis',
  'synthesized',
  'synthesis'
] as const;

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
    || bundle.reasons.some((reason) => normalizedReasonIncludes(reason, RESEARCH_OUTCOME_SIGNALS))
    || bundleResearchMetadataSignals(bundle).some((signal) => normalizedReasonIncludes(signal, RESEARCH_OUTCOME_SIGNALS));
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

function bundleResearchMetadataSignals(bundle: FrontierSwarmMergeBundle): string[] {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const task = objectField(metadata, 'task');
  const source = objectField(metadata, 'source');
  const routing = objectField(metadata, 'routing');
  const routingKey = objectField(metadata, 'routingKey');
  const tournamentStrategy = objectField(metadata, 'tournamentStrategy');
  return [
    bundle.lane,
    stringField(metadata, 'workKind'),
    stringField(metadata, 'taskKind'),
    stringField(task, 'workKind'),
    stringField(task, 'kind'),
    stringField(source, 'workKind'),
    stringField(source, 'kind'),
    stringField(routing, 'workKind'),
    stringField(routingKey, 'workKind'),
    stringField(tournamentStrategy, 'workKind')
  ].filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function objectField(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];
  return isObject(value) ? value : {};
}

function stringField(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value ? value : undefined;
}
