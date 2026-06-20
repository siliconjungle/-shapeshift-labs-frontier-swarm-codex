import type { FrontierSwarmCoordinatorDashboard, FrontierSwarmMergeBundle, FrontierSwarmPatchStatus } from '@shapeshift-labs/frontier-swarm';
import { isObject, pathHasIgnoredSegment, uniqueStrings } from './common.js';
import { collectFailureReasonClasses, ignoredWorkspaceNoisePath, sourceOwnershipViolationsForReasons } from './collect-bundles.js';
import type { FrontierCodexCollectionNoiseBreakdown, FrontierCodexCollectQualitySignals } from './index.js';

const COLLECTION_NOISE_SAMPLE_LIMIT = 12;

export function attachCollectionNoiseBreakdown(
  dashboard: FrontierSwarmCoordinatorDashboard,
  compactDashboard: unknown,
  qualitySignals: FrontierCodexCollectQualitySignals,
  noiseBreakdown: FrontierCodexCollectionNoiseBreakdown
): void {
  const mutableDashboard = dashboard as FrontierSwarmCoordinatorDashboard & { metadata?: Record<string, unknown> };
  const dashboardMetadata = mutableDashboard as unknown as { metadata?: Record<string, unknown> };
  qualitySignals.noiseBreakdown = noiseBreakdown;
  const summary = mutableDashboard.summary as Record<string, unknown>;
  summary.collectionNoiseBreakdown = noiseBreakdown;
  summary.collectionQualitySignals = qualitySignals;
  summary.collectionRestoredChangedPathSignalCount = noiseBreakdown.restored.pathCount;
  summary.collectionRestoredChangedPathJobCount = noiseBreakdown.restored.jobCount;
  summary.collectionGeneratedNoiseSignalCount = noiseBreakdown.generatedNoise.pathCount;
  summary.collectionGeneratedNoiseJobCount = noiseBreakdown.generatedNoise.jobCount;
  summary.collectionIgnoredWorkspaceNoiseSignalCount = noiseBreakdown.ignoredWorkspaceNoise.pathCount;
  summary.collectionIgnoredWorkspaceNoiseJobCount = noiseBreakdown.ignoredWorkspaceNoise.jobCount;
  summary.collectionSourceOwnershipViolationCount = noiseBreakdown.sourceOwnershipViolations.pathCount;
  summary.collectionSourceOwnershipViolationJobCount = noiseBreakdown.sourceOwnershipViolations.jobCount;
  dashboardMetadata.metadata = { ...(dashboardMetadata.metadata ?? {}), collectionNoiseBreakdown: noiseBreakdown };
  Object.assign(compactDashboard as Record<string, unknown>, {
    collectionNoiseBreakdown: noiseBreakdown,
    restoredChangedPathCount: noiseBreakdown.restored.pathCount,
    restoredChangedPathJobCount: noiseBreakdown.restored.jobCount,
    generatedNoisePathCount: noiseBreakdown.generatedNoise.pathCount,
    generatedNoiseJobCount: noiseBreakdown.generatedNoise.jobCount,
    ignoredWorkspaceNoisePathCount: noiseBreakdown.ignoredWorkspaceNoise.pathCount,
    ignoredWorkspaceNoiseJobCount: noiseBreakdown.ignoredWorkspaceNoise.jobCount,
    sourceOwnershipViolationCount: noiseBreakdown.sourceOwnershipViolations.pathCount,
    sourceOwnershipViolationJobCount: noiseBreakdown.sourceOwnershipViolations.jobCount
  });
}

export function createCollectionNoiseBreakdown(bundles: readonly FrontierSwarmMergeBundle[]): FrontierCodexCollectionNoiseBreakdown {
  const restored: CollectionNoiseSignalInput[] = [];
  const quarantined: CollectionNoiseSignalInput[] = [];
  const generatedNoise: CollectionNoiseSignalInput[] = [];
  const ignoredWorkspaceNoise: CollectionNoiseSignalInput[] = [];
  const sourceOwnershipViolations: CollectionNoiseSignalInput[] = [];
  for (const bundle of bundles) {
    const reasonClasses = bundleCollectReasonClasses(bundle);
    const restoredPaths = bundleRestoredSourcePaths(bundle);
    const quarantinedPaths = bundleQuarantinedChangedPaths(bundle);
    const ownershipPaths = uniqueStrings(bundle.ownershipViolations);
    const reasonGeneratedPaths = bundle.reasons.map((reason) => missingHeadBlobReasonPath(reason)).filter((entry): entry is string => Boolean(entry));
    const candidatePaths = uniqueStrings([...restoredPaths, ...quarantinedPaths, ...ownershipPaths, ...reasonGeneratedPaths]);
    const generatedPaths = candidatePaths.filter((entry) => generatedNoisePath(entry, bundle.reasons));
    const ignoredPaths = candidatePaths.filter((entry) => ignoredWorkspaceNoisePath(entry) && !generatedNoisePath(entry, bundle.reasons));
    const generatedReasonClasses = reasonClasses.filter(generatedNoiseReasonClass);
    restored.push({ jobId: bundle.jobId, paths: restoredPaths, reasonClasses: reasonClasses.filter((entry) => entry === 'workspace.restore-disallowed-changes') });
    quarantined.push({ jobId: bundle.jobId, paths: quarantinedPaths, reasonClasses: reasonClasses.filter((entry) => entry === 'workspace.quarantine') });
    generatedNoise.push({ jobId: bundle.jobId, paths: generatedPaths, reasonClasses: generatedReasonClasses });
    ignoredWorkspaceNoise.push({ jobId: bundle.jobId, paths: ignoredPaths, reasonClasses: ignoredPaths.length > 0 || generatedPaths.length === 0 && generatedReasonClasses.length === 0 ? reasonClasses.filter(ignoredWorkspaceNoiseReasonClass) : [] });
    sourceOwnershipViolations.push({ jobId: bundle.jobId, paths: sourceOwnershipViolationsForReasons(ownershipPaths, bundle.reasons), reasonClasses: reasonClasses.filter((entry) => entry === 'ownership.source-violation') });
  }
  return {
    restored: collectionNoiseSignal(restored),
    quarantined: collectionNoiseSignal(quarantined),
    generatedNoise: collectionNoiseSignal(generatedNoise),
    ignoredWorkspaceNoise: collectionNoiseSignal(ignoredWorkspaceNoise),
    sourceOwnershipViolations: collectionNoiseSignal(sourceOwnershipViolations)
  };
}

export function normalizeCollectedReasons(
  bundleReasons: readonly string[],
  staleReasons: readonly string[],
  patchStatus: FrontierSwarmPatchStatus,
  staleAgainstHead: boolean,
  bundle: FrontierSwarmMergeBundle
): string[] {
  const reasons = patchStatus === 'applies' ? [...bundleReasons] : uniqueStrings([...bundleReasons, ...staleReasons]);
  const filtered = staleAgainstHead ? reasons : reasons.filter((reason) => reason !== 'stale-against-head');
  if (!staleAgainstHead && (bundle.staleAgainstHead || bundle.disposition === 'stale-against-head') && patchStatus !== 'missing') {
    filtered.push('stale-against-head cleared by patch freshness check');
  }
  return uniqueStrings(filtered);
}

interface CollectionNoiseSignalInput {
  jobId: string;
  paths: readonly string[];
  reasonClasses: readonly string[];
}

function collectionNoiseSignal(entries: readonly CollectionNoiseSignalInput[]): FrontierCodexCollectionNoiseBreakdown['restored'] {
  const activeEntries = entries.filter((entry) => entry.paths.length > 0 || entry.reasonClasses.length > 0);
  const paths = uniqueStrings(activeEntries.flatMap((entry) => [...entry.paths]));
  const reasonClasses = activeEntries.flatMap((entry) => [...entry.reasonClasses]);
  const jobIds = uniqueStrings(activeEntries.map((entry) => entry.jobId));
  return { jobCount: jobIds.length, pathCount: paths.length, paths: paths.slice(0, COLLECTION_NOISE_SAMPLE_LIMIT), jobIds: jobIds.slice(0, COLLECTION_NOISE_SAMPLE_LIMIT), reasonClasses: uniqueStrings(reasonClasses).slice(0, COLLECTION_NOISE_SAMPLE_LIMIT), reasonClassCounts: countCollectionNoiseStrings(reasonClasses) };
}

function countCollectionNoiseStrings(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function bundleCollectReasonClasses(bundle: FrontierSwarmMergeBundle): string[] {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const collect = isObject(metadata.collect) ? metadata.collect : {};
  return uniqueStrings([...stringArray(collect.reasonClasses), ...collectFailureReasonClasses(bundle.reasons)]);
}

function bundleRestoredSourcePaths(bundle: FrontierSwarmMergeBundle): string[] {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  return uniqueStrings(pathRecordArray(metadata.ownershipRestore));
}

function bundleQuarantinedChangedPaths(bundle: FrontierSwarmMergeBundle): string[] {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const quarantine = isObject(metadata.workspacePatchQuarantine) ? metadata.workspacePatchQuarantine : {};
  const paths = stringArray(quarantine.quarantinedChangedPaths);
  if (paths.length > 0) return uniqueStrings(paths);
  return bundle.reasons.includes('quarantined-disallowed-changes') ? uniqueStrings(bundle.ownershipViolations) : [];
}

function pathRecordArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => typeof entry === 'string' ? [entry] : isObject(entry) && typeof entry.path === 'string' ? [entry.path] : []);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function generatedNoiseReasonClass(reasonClass: string): boolean {
  return reasonClass.startsWith('generated.') || reasonClass.endsWith('.generated');
}

function ignoredWorkspaceNoiseReasonClass(reasonClass: string): boolean {
  return reasonClass === 'workspace.ignored-noise' || reasonClass.startsWith('workspace.ignored-noise.');
}

function generatedNoisePath(file: string, reasons: readonly string[]): boolean {
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  return normalized.endsWith('.tsbuildinfo') || generatedWorkspaceSetupOwnershipPath(normalized, reasons) || pathHasIgnoredSegment(normalized, ['.next', '.nuxt', '.svelte-kit', '.turbo', '.vite', '.parcel-cache', 'coverage', 'dist', 'build', 'generated', 'target']);
}

function generatedWorkspaceSetupOwnershipPath(file: string, reasons: readonly string[]): boolean {
  if (!reasons.some((reason) => generatedWorkspaceSetupReason(reason.toLowerCase()))) return false;
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  return normalized === '.gitignore' || normalized === '.loomignore' || normalized === 'loom.json';
}

function generatedWorkspaceSetupReason(reason: string): boolean {
  return reason === 'generated_setup' || reason.includes('generated setup') || reason.includes('generated workspace setup');
}

function missingHeadBlobReasonPath(reason: string): string | undefined {
  const match = /^missing HEAD blob for (.+)$/i.exec(reason.trim());
  return match?.[1]?.trim();
}
