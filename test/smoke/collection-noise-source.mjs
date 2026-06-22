import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function runCollectionSourceSmoke(root) {
  const collectBundles = await readOptional(path.join(root, 'src/collect-bundles.ts'));
  const collectBundleReasons = await readOptional(path.join(root, 'src/collect-bundle-reasons.ts'));
  const collectBundleStaleness = await readOptional(path.join(root, 'src/collect-bundle-staleness.ts'));
  const collectBundleSources = [collectBundles, collectBundleReasons, collectBundleStaleness].join('\n');
  const contextBudgetSource = await readOptional(path.join(root, 'src/context-budget.ts'));
  const collect = [
    await fs.readFile(path.join(root, 'src/collect.ts'), 'utf8'),
    await readOptional(path.join(root, 'src/collect-artifact-store.ts')) ?? '',
    await readOptional(path.join(root, 'src/collect-finalize.ts')) ?? '',
    await readOptional(path.join(root, 'src/collect-landed.ts')) ?? '',
    await readOptional(path.join(root, 'src/collect-noise.ts')) ?? ''
  ].join('\n');
  const collectDashboard = await readOptional(path.join(root, 'src/collect-dashboard.ts'));
  const collectDashboardQuality = await readOptional(path.join(root, 'src/collect-dashboard-quality.ts'));
  const collectDashboardSources = [collectDashboard, collectDashboardQuality].join('\n');
  const typesCollection = [
    await fs.readFile(path.join(root, 'src/types-collection.ts'), 'utf8'),
    await readOptional(path.join(root, 'src/types-collection-quality.ts')) ?? '',
    await readOptional(path.join(root, 'src/types-collection-score.ts')) ?? ''
  ].join('\n');

  assertReasonClassSourceTokens(collectBundleSources);
  assertCollectionSourceTokens(collect);
  assertDashboardSourceTokens(collectDashboardSources);
  assertContextBudgetSourceTokens(contextBudgetSource);
  assertCollectionTypeTokens(typesCollection);
  assertNoiseClassificationRegexes(collectBundleSources, collectDashboardSources);
}

function assertReasonClassSourceTokens(collectBundleSources) {
  if (!collectBundleSources.trim()) return;
  for (const token of [
    'export function collectFailureReasonClasses',
    'workspace.invalid-git-index',
    'patch.missing-head-blob',
    'patch.missing-head-blob.generated',
    'generated.tsbuildinfo-change',
    'generated.workspace-setup',
    'workspace.ignored-noise',
    'workspace.ignored-noise.ownership-violation',
    'ownership.source-violation',
    'export function compactCollectFailureReasonClasses',
    'export function infrastructureNoiseFailureReasonClass',
    'export function sourceBlockerFailureReasonClass',
    'infrastructure-noise',
    'source-blocker',
    'export function ignoredWorkspaceNoisePath',
    'sourceOwnershipViolationsForReasons',
    'ignoredWorkspaceNoiseOwnershipViolationsForReasons',
    'stale.cleared-by-freshness-check'
  ]) {
    assert.match(collectBundleSources, new RegExp(escapeRegExp(token)), `missing reason class token: ${token}`);
  }
}

function assertCollectionSourceTokens(collect) {
  for (const token of [
    'reasonClasses: collectFailureReasonClasses',
    'const collectReasonClasses = uniqueStrings',
    'reasonClasses: collectReasonClasses',
    'DEFAULT_ARTIFACT_STORE_TIMEOUT_MS',
    'createBoundedCodexArtifactStore',
    'runArtifactStoreWorker',
    'runCompactArtifactStoreWorker',
    'withArtifactStoreGuard',
    'collectExitGuard',
    'artifact-store-guard-incomplete',
    'incompleteModes',
    'fallbackReason',
    'killArtifactStoreWorker',
    'artifact-store-timeout',
    'compress: false',
    'sqlite: false',
    'COMPACT_ARTIFACT_STORE_MAX_BYTES',
    'createLandedHealthSummary',
    'attachLandedHealthSummary',
    'collectionLandedSuccessCount',
    'collectionRemainingNeedsHumanReviewCount',
    'successfulOutputCount',
    'reviewPressureCount',
    'createCollectionNoiseBreakdown',
    'attachCollectionNoiseBreakdown',
    'collectionNoiseBreakdown',
    'collectionRestoredChangedPathSignalCount',
    'collectionGeneratedNoiseSignalCount',
    'collectionIgnoredWorkspaceNoiseSignalCount',
    'collectionSourceOwnershipViolationCount',
    'SIGTERM',
    'SIGKILL'
  ]) {
    assert.match(collect, new RegExp(escapeRegExp(token)), `collection output does not expose: ${token}`);
  }
  assert.match(
    collect,
    /incompleteModes:\s*uniqueArtifactStoreModes\(\[[\s\S]*artifactStoreIncompleteModes\(fullResult\.status\)[\s\S]*artifactStoreIncompleteModes\(compactResult\.status\)/,
    'fallback artifact-store status should carry incomplete guard modes from full and compact workers'
  );
  assert.match(
    collect,
    /fallbackReason: fullResult\.status\.reason \?\? fullResult\.status\.guard\.reason/,
    'fallback artifact-store guard should expose the original full-worker reason'
  );
  assert.match(
    collect,
    /const guardComplete = input\.outcome !== 'incomplete' && incompleteModes\.length === 0/,
    'artifact-store guard completion should remain false while any attempted mode is incomplete'
  );
  assert.match(
    collect,
    /return status\.guard\.incompleteModes \?\? \[\];/,
    'incomplete artifact-store modes should only describe guards that did not finish'
  );
}

function assertDashboardSourceTokens(collectDashboardSources) {
  if (!collectDashboardSources.trim()) return;
  for (const token of [
    'collectionQualitySignals',
    'collectionAutosplitRerunGuidance',
    'compactAutosplitRerunGuidance',
    'collectionFailureSignalCount',
    'collectionSourceBlockerSignalCount',
    'collectionInfrastructureNoiseSignalCount',
    'collectionNeedsPortSignalCount',
    'collectionStaleSignalCount',
    'collectionOwnershipViolationSignalCount',
    'collectionIgnoredWorkspaceNoiseOwnershipViolationSignalCount',
    'collectionQuarantinedChangedPathSignalCount',
    'collectionIgnoredWorkspaceNoiseQuarantinedChangedPathSignalCount',
    'collectionContextBudgetWarningSignalCount',
    'collectionContextBudgetFailedSignalCount',
    'collectionLogTruncatedJobSignalCount',
    'collectionLogBytesTruncatedSignalCount',
    'ignoredWorkspaceNoiseJobCount',
    'compactReasonClasses',
    'sourceBlockerJobCount',
    'infrastructureNoiseJobCount',
    'sourceViolationCount',
    'ignoredWorkspaceNoisePathCount',
    'ignoredWorkspaceNoiseCompactReasonClasses',
    'rawJobCount',
    'rawJobIds',
    'isIgnoredWorkspaceNoiseOnlyFailureJob',
    'compactReasonClassesForFailureJob'
  ]) {
    assert.match(collectDashboardSources, new RegExp(escapeRegExp(token)), `dashboard quality KPI token missing: ${token}`);
  }
  assert.match(
    collectDashboardSources,
    /collectionOwnershipViolationSignalCount: collectionQualitySignals\.ownership\.sourceViolationCount/,
    'top-level ownership signal count should report source ownership blockers, not ignored workspace setup noise'
  );
  assert.match(
    collectDashboardSources,
    /collectionQuarantinedChangedPathSignalCount: collectionQualitySignals\.quarantine\.sourcePathCount/,
    'top-level quarantine signal count should report source quarantine blockers, not ignored workspace setup noise'
  );
}

function assertContextBudgetSourceTokens(contextBudgetSource) {
  if (!contextBudgetSource) return;
  for (const token of [
    'contextBudgetGuidance',
    'autosplit oversized prompt/log context',
    'autosplit sourceRefs by package or lane',
    'uncached prompt and log deltas',
    "key === 'cachedinputtokens' || key === 'cachedtokens'"
  ]) {
    assert.match(contextBudgetSource, new RegExp(escapeRegExp(token)), `context budget guidance token missing: ${token}`);
  }
}

function assertCollectionTypeTokens(typesCollection) {
  for (const token of [
    'FrontierCodexCollectQualitySignals',
    'qualitySignals: FrontierCodexCollectQualitySignals',
    'FrontierCodexArtifactStoreStatus',
    'FrontierCodexArtifactStoreGuardStatus',
    'FrontierCodexCollectionMetadata',
    'artifactStoreStatus?: FrontierCodexArtifactStoreStatus',
    'metadata?: FrontierCodexCollectionMetadata',
    'noiseBreakdown: FrontierCodexCollectionNoiseBreakdown',
    'collectExitGuard?: FrontierCodexArtifactStoreGuardStatus',
    'guard: FrontierCodexArtifactStoreGuardStatus',
    'fallback-completed',
    'incomplete',
    'attemptedModes',
    'incompleteModes',
    'fallbackUsed',
    'fallbackReason',
    'artifactStoreMode?: FrontierCodexArtifactStoreMode',
    'artifactStoreTimeoutMs?: number',
    'logTruncation',
    'contextBudget',
    'quarantine',
    'ownership',
    'noiseBreakdown?: FrontierCodexCollectionNoiseBreakdown',
    'FrontierCodexCollectionNoiseBreakdown',
    'FrontierCodexCollectionNoiseSignal',
    'generatedNoise',
    'ignoredWorkspaceNoise',
    'sourceOwnershipViolations',
    'reasonClassCounts',
    'compactReasonClassCounts',
    'sourceBlockerJobCount',
    'infrastructureNoiseJobCount',
    'ignoredWorkspaceNoiseJobCount',
    'ignoredWorkspaceNoiseCompactReasonClasses',
    'sourceViolationCount',
    'ignoredWorkspaceNoisePathCount',
    'rawJobCount',
    'rawJobIds',
    'FrontierCodexLandedHealthSummary',
    'landedHealth?: FrontierCodexLandedHealthSummary',
    'landedBucketCounts',
    'remainingNeedsHumanReviewCount',
    'reviewPressureJobIds'
  ]) {
    assert.match(typesCollection, new RegExp(escapeRegExp(token)), `collection quality type token missing: ${token}`);
  }
}

function assertNoiseClassificationRegexes(collectBundleSources, collectDashboardSources) {
  if (!collectBundleSources.trim()) return;
  assert.match(collectBundleSources, /normalized\.includes\('\.tsbuildinfo'\)\) classes\.push\('generated\.tsbuildinfo-change'\)/);
  assert.match(collectBundleSources, /generatedWorkspaceSetupReason\(normalized\)[\s\S]+generated\.workspace-setup/);
  assert.match(collectBundleSources, /pathHasIgnoredSegment\(normalized,[\s\S]+node_modules[\s\S]+\)/);
  assert.match(collectBundleSources, /missingHeadBlobPath[\s\S]+ignoredWorkspaceNoisePath\(missingHeadBlobPath\)[\s\S]+patch\.missing-head-blob\.generated/);
  assert.match(collectBundleSources, /invalidGitIndexReason\(normalized\)[\s\S]+workspace\.invalid-git-index/);
  assert.match(collectBundleSources, /generatedMissingHeadBlob = reasonClasses\.includes\('patch\.missing-head-blob\.generated'\)/);
  assert.match(collectDashboardSources, /failedEvidenceCount: failureJobEntries\.filter/);
  assert.match(collectBundleSources, /ignoredWorkspaceNoiseOnlyFailure\(bundle\)[\s\S]+return 'needs-human-port'/);
  assert.match(collectBundleSources, /nonActionableFailedEvidence\(bundle,[\s\S]+return 'failed-evidence'/);
  assert.match(collectBundleSources, /generated-failed-evidence/);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}
