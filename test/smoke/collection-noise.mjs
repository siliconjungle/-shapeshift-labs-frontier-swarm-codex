import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const collectBundles = await readOptional(path.join(root, 'src/collect-bundles.ts'));
const contextBudgetSource = await readOptional(path.join(root, 'src/context-budget.ts'));
const collect = await fs.readFile(path.join(root, 'src/collect.ts'), 'utf8');
const collectDashboard = await readOptional(path.join(root, 'src/collect-dashboard.ts'));
const typesCollection = await fs.readFile(path.join(root, 'src/types-collection.ts'), 'utf8');

if (collectBundles) {
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
    assert.match(collectBundles, new RegExp(escapeRegExp(token)), `missing reason class token: ${token}`);
  }
}

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
  /const incompleteModes = uniqueArtifactStoreModes\(\[[\s\S]+artifactStoreIncompleteModes\(fullResult\.status\)[\s\S]+artifactStoreIncompleteModes\(compactResult\.status\)/,
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

if (collectDashboard) {
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
    'collectionQuarantinedChangedPathSignalCount',
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
    'isIgnoredWorkspaceNoiseOnlyFailureJob',
    'compactReasonClassesForFailureJob'
  ]) {
    assert.match(collectDashboard, new RegExp(escapeRegExp(token)), `dashboard quality KPI token missing: ${token}`);
  }
  assert.match(
    collectDashboard,
    /collectionOwnershipViolationSignalCount: collectionQualitySignals\.ownership\.sourceViolationCount/,
    'top-level ownership signal count should report source ownership blockers, not ignored workspace setup noise'
  );
}

if (contextBudgetSource) {
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
  'sourceViolationCount',
  'ignoredWorkspaceNoisePathCount',
  'FrontierCodexLandedHealthSummary',
  'landedHealth?: FrontierCodexLandedHealthSummary',
  'landedBucketCounts',
  'remainingNeedsHumanReviewCount',
  'reviewPressureJobIds'
]) {
  assert.match(typesCollection, new RegExp(escapeRegExp(token)), `collection quality type token missing: ${token}`);
}

if (collectBundles) {
  assert.match(
    collectBundles,
    /normalized\.includes\('\.tsbuildinfo'\)\) classes\.push\('generated\.tsbuildinfo-change'\)/,
    'tsbuildinfo paths should receive a generated change class'
  );
  assert.match(
    collectBundles,
    /generatedWorkspaceSetupReason\(normalized\)[\s\S]+generated\.workspace-setup/,
    'generated setup evidence should receive a generated setup reason class'
  );
  assert.match(
    collectBundles,
    /pathHasIgnoredSegment\(normalized,[\s\S]+node_modules[\s\S]+\)/,
    'ignored workspace noise paths should classify exact ignored segments'
  );
  assert.match(
    collectBundles,
    /missingHeadBlobPath[\s\S]+ignoredWorkspaceNoisePath\(missingHeadBlobPath\)[\s\S]+patch\.missing-head-blob\.generated/,
    'missing HEAD blobs on generated paths should receive a generated missing-blob class'
  );
  assert.match(
    collectBundles,
    /invalidGitIndexReason\(normalized\)[\s\S]+workspace\.invalid-git-index/,
    'invalid .git/index noise should receive an invalid index class'
  );
  assert.match(
    collectBundles,
    /generatedMissingHeadBlob = reasonClasses\.includes\('patch\.missing-head-blob\.generated'\)/,
    'invalid index and generated missing-blob classes should be compacted as infrastructure noise'
  );
  assert.match(
    collectDashboard,
    /failedEvidenceCount: failureJobEntries\.filter/,
    'failed-evidence dashboard counts should be based on non-noise failure entries'
  );
  assert.match(
    collectBundles,
    /ignoredWorkspaceNoiseOnlyFailure\(bundle\)[\s\S]+return 'needs-human-port'/,
    'ignored workspace noise-only failures should not be collected as failed evidence'
  );
  assert.match(
    collectBundles,
    /nonActionableFailedEvidence\(bundle,[\s\S]+return 'needs-human-port'/,
    'failed worker output without a patch or source changes should not be collected as failed evidence'
  );
  assert.match(
    collectBundles,
    /generated-failed-evidence/,
    'generated failed evidence residue should be treated as non-actionable worker output'
  );
}

if (await exists(path.join(root, 'dist/index.js'))) {
  const { applyCodexSwarmCollection, collectCodexSwarmRun } = await import(path.join(root, 'dist/index.js'));
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'frontier-swarm-codex-quality-'));
  const runDir = path.join(tmp, 'run');
  await writeMerge(runDir, 'failed-job', {
    status: 'failed',
    disposition: 'rejected',
    mergeReadiness: 'blocked',
    changedPaths: ['src/failed.ts'],
    commandsFailed: [{ name: 'smoke', command: ['node', 'test.mjs'], status: 1, required: true }],
    metadata: {
      logSummary: {
        eventsPath: path.join(runDir, 'failed-job', 'events.jsonl'),
        stderrPath: path.join(runDir, 'failed-job', 'stderr.log'),
        eventBytes: 100,
        stderrBytes: 40,
        eventBytesWritten: 80,
        stderrBytesWritten: 35,
        eventBytesTruncated: 20,
        stderrBytesTruncated: 5
      },
      contextBudget: contextBudgetReport('failed-job', 'failed', ['large prompt'], ['actual input tokens 50 exceeded max budget 40'], 50)
    }
  });
  await writeMerge(runDir, 'needs-port-job', {
    disposition: 'needs-port',
    mergeReadiness: 'verified-patch',
    changedPaths: ['src/needs-port.ts']
  });
  await writeMerge(runDir, 'stale-job', {
    disposition: 'stale-against-head',
    staleAgainstHead: true,
    changedPaths: ['src/stale.ts']
  });
  await writeMerge(runDir, 'ownership-job', {
    status: 'failed',
    disposition: 'blocked',
    mergeReadiness: 'blocked',
    changedPaths: ['src/owned.ts'],
    ownershipViolations: ['dist/generated.js'],
    reasons: ['quarantined-disallowed-changes'],
    metadata: {
      workspacePatchQuarantine: {
        quarantinedChangedPaths: ['dist/generated.js']
      },
      contextBudget: contextBudgetReport('ownership-job', 'warning', ['source refs 99 exceeded warn budget 64'], [], 25)
    }
  });
  await writeMerge(runDir, 'invalid-index-job', {
    status: 'failed',
    disposition: 'rejected',
    mergeReadiness: 'blocked',
    changedPaths: [],
    reasons: ['fatal: .git/index: index file smaller than expected']
  });
  await writeMerge(runDir, 'generated-blob-job', {
    status: 'failed',
    disposition: 'rejected',
    mergeReadiness: 'blocked',
    changedPaths: [],
    reasons: ['missing HEAD blob for dist/cache.tsbuildinfo']
  });
  await writeMerge(runDir, 'generated-setup-job', {
    status: 'failed',
    disposition: 'rejected',
    mergeReadiness: 'blocked',
    changedPaths: [],
    ownershipViolations: ['.gitignore', 'loom.json'],
    reasons: ['generated_setup', 'quarantined-disallowed-changes'],
    metadata: {
      workspacePatchQuarantine: {
        quarantinedChangedPaths: ['.gitignore', 'loom.json']
      }
    }
  });
  await writeMerge(runDir, 'source-ownership-job', {
    status: 'failed',
    disposition: 'blocked',
    mergeReadiness: 'blocked',
    changedPaths: ['src/forbidden.ts'],
    ownershipViolations: ['src/forbidden.ts'],
    reasons: ['quarantined-disallowed-changes'],
    metadata: {
      workspacePatchQuarantine: {
        quarantinedChangedPaths: ['src/forbidden.ts']
      }
    }
  });
  await writeMerge(runDir, 'restored-source-job', {
    status: 'blocked',
    disposition: 'blocked',
    mergeReadiness: 'blocked',
    changedPaths: [],
    ownershipViolations: ['src/restored.ts'],
    reasons: ['restored-disallowed-changes'],
    metadata: {
      ownershipRestore: [
        { path: 'src/restored.ts', action: 'restored', reason: 'restored from source root' }
      ]
    }
  });

  const collection = await collectCodexSwarmRun({
    run: runDir,
    outDir: path.join(tmp, 'collected'),
    cwd: root,
    checkStale: false
  });
  const signals = collection.qualitySignals;
  assert.deepStrictEqual(collection.dashboard.summary.collectionQualitySignals, signals);
  assert.strictEqual(signals.failure.jobCount, 3);
  assert.strictEqual(signals.failure.failedEvidenceCount, 3);
  assert.strictEqual(signals.failure.statusFailedCount, 6);
  assert.strictEqual(signals.failure.ignoredWorkspaceNoiseJobCount, 4);
  assert.deepStrictEqual([...signals.failure.ignoredWorkspaceNoiseJobIds].sort(), ['generated-blob-job', 'generated-setup-job', 'invalid-index-job', 'ownership-job']);
  assert.ok(signals.failure.reasonClasses.includes('ownership.source-violation'));
  assert.ok(!signals.failure.reasonClasses.includes('workspace.ignored-noise'));
  assert.ok(signals.failure.compactReasonClasses.includes('source-blocker'));
  assert.ok(!signals.failure.compactReasonClasses.includes('infrastructure-noise'));
  assert.strictEqual(signals.failure.sourceBlockerJobCount, 3);
  assert.deepStrictEqual(signals.failure.sourceBlockerJobIds, ['failed-job', 'restored-source-job', 'source-ownership-job']);
  assert.strictEqual(signals.failure.infrastructureNoiseJobCount, 4);
  assert.deepStrictEqual([...signals.failure.infrastructureNoiseJobIds].sort(), ['generated-blob-job', 'generated-setup-job', 'invalid-index-job', 'ownership-job']);
  assert.deepStrictEqual([...signals.failure.ignoredWorkspaceNoiseReasonClasses].sort(), [
    'generated.tsbuildinfo-change',
    'generated.workspace-setup',
    'patch.missing-head-blob.generated',
    'workspace.ignored-noise',
    'workspace.ignored-noise.ownership-violation',
    'workspace.invalid-git-index'
  ]);
  assert.strictEqual(signals.failure.requiredFailedCommandCount, 1);
  assert.deepStrictEqual([...signals.needsPort.jobIds].sort(), ['generated-blob-job', 'generated-setup-job', 'invalid-index-job', 'needs-port-job', 'ownership-job']);
  assert.deepStrictEqual(signals.stale.jobIds, ['stale-job']);
  assert.strictEqual(signals.ownership.violationCount, 5);
  assert.strictEqual(signals.ownership.sourceViolationCount, 2);
  assert.strictEqual(signals.ownership.ignoredWorkspaceNoiseViolationCount, 3);
  assert.deepStrictEqual(signals.ownership.sourcePaths, ['src/restored.ts', 'src/forbidden.ts']);
  assert.deepStrictEqual(signals.ownership.ignoredWorkspaceNoisePaths, ['.gitignore', 'loom.json', 'dist/generated.js']);
  assert.deepStrictEqual(signals.ownership.sourceJobIds, ['restored-source-job', 'source-ownership-job']);
  assert.deepStrictEqual(signals.ownership.ignoredWorkspaceNoiseJobIds, ['generated-setup-job', 'ownership-job']);
  assert.strictEqual(signals.quarantine.pathCount, 4);
  assert.strictEqual(signals.quarantine.sourcePathCount, 1);
  assert.strictEqual(signals.quarantine.ignoredWorkspaceNoisePathCount, 3);
  assert.deepStrictEqual(signals.quarantine.sourcePaths, ['src/forbidden.ts']);
  assert.deepStrictEqual(signals.quarantine.ignoredWorkspaceNoisePaths, ['.gitignore', 'loom.json', 'dist/generated.js']);
  assert.deepStrictEqual(signals.quarantine.jobIds, ['generated-setup-job', 'ownership-job', 'source-ownership-job']);
  assert.deepStrictEqual(signals.quarantine.sourceJobIds, ['source-ownership-job']);
  assert.deepStrictEqual(signals.quarantine.ignoredWorkspaceNoiseJobIds, ['generated-setup-job', 'ownership-job']);
  assert.deepStrictEqual(collection.noiseBreakdown, signals.noiseBreakdown);
  assert.deepStrictEqual(collection.dashboard.summary.collectionNoiseBreakdown, collection.noiseBreakdown);
  assert.deepStrictEqual(collection.dashboard.metadata.collectionNoiseBreakdown, collection.noiseBreakdown);
  assert.deepStrictEqual(collection.compactDashboard.collectionNoiseBreakdown, collection.noiseBreakdown);
  assert.strictEqual(collection.noiseBreakdown.restored.pathCount, 1);
  assert.strictEqual(collection.noiseBreakdown.restored.jobCount, 1);
  assert.deepStrictEqual(collection.noiseBreakdown.restored.paths, ['src/restored.ts']);
  assert.deepStrictEqual(collection.noiseBreakdown.restored.jobIds, ['restored-source-job']);
  assert.strictEqual(collection.noiseBreakdown.quarantined.pathCount, 4);
  assert.strictEqual(collection.noiseBreakdown.generatedNoise.pathCount, 4);
  assert.deepStrictEqual([...collection.noiseBreakdown.generatedNoise.paths].sort(), ['.gitignore', 'dist/cache.tsbuildinfo', 'dist/generated.js', 'loom.json']);
  assert.strictEqual(collection.noiseBreakdown.ignoredWorkspaceNoise.pathCount, 0);
  assert.strictEqual(collection.noiseBreakdown.ignoredWorkspaceNoise.jobCount, 0);
  assert.strictEqual(collection.noiseBreakdown.sourceOwnershipViolations.pathCount, 2);
  assert.deepStrictEqual(collection.noiseBreakdown.sourceOwnershipViolations.paths, ['src/restored.ts', 'src/forbidden.ts']);
  assert.strictEqual(collection.dashboard.summary.collectionRestoredChangedPathSignalCount, 1);
  assert.strictEqual(collection.dashboard.summary.collectionGeneratedNoiseSignalCount, 4);
  assert.strictEqual(collection.dashboard.summary.collectionIgnoredWorkspaceNoiseSignalCount, 0);
  assert.strictEqual(collection.dashboard.summary.collectionSourceOwnershipViolationCount, 2);
  assert.strictEqual(collection.compactDashboard.restoredChangedPathCount, 1);
  assert.strictEqual(collection.compactDashboard.generatedNoisePathCount, 4);
  assert.strictEqual(collection.compactDashboard.ignoredWorkspaceNoisePathCount, 0);
  assert.strictEqual(collection.compactDashboard.sourceOwnershipViolationCount, 2);
  assert.strictEqual(signals.contextBudget.warningCount, 1);
  assert.strictEqual(signals.contextBudget.failedCount, 1);
  assert.deepStrictEqual(signals.contextBudget.failedJobIds, ['failed-job']);
  assert.strictEqual(signals.contextBudget.maxActualInputTokens, 50);
  assert.strictEqual(signals.contextBudget.maxCachedInputTokens, 20);
  assert.strictEqual(signals.contextBudget.maxUncachedInputTokens, 30);
  assert.strictEqual(signals.logTruncation.truncatedJobCount, 1);
  assert.strictEqual(signals.logTruncation.bytesTruncated, 25);
  assert.deepStrictEqual(signals.logTruncation.jobIds, ['failed-job']);
  assert.strictEqual(collection.dashboard.summary.collectionFailureSignalCount, 3);
  assert.strictEqual(collection.dashboard.summary.collectionSourceBlockerSignalCount, 3);
  assert.strictEqual(collection.dashboard.summary.collectionInfrastructureNoiseSignalCount, 4);
  assert.strictEqual(collection.dashboard.summary.collectionNeedsPortSignalCount, 5);
  assert.strictEqual(collection.dashboard.summary.collectionStaleSignalCount, 1);
  assert.strictEqual(collection.dashboard.summary.collectionOwnershipViolationSignalCount, 2);
  assert.strictEqual(collection.dashboard.summary.collectionQuarantinedChangedPathSignalCount, 4);
  assert.strictEqual(collection.dashboard.summary.collectionContextBudgetWarningSignalCount, 1);
  assert.strictEqual(collection.dashboard.summary.collectionContextBudgetFailedSignalCount, 1);
  assert.strictEqual(collection.dashboard.summary.collectionLogTruncatedJobSignalCount, 1);
  assert.strictEqual(collection.dashboard.summary.collectionLogBytesTruncatedSignalCount, 25);
  assert.deepStrictEqual(collection.dashboard.summary.collectionAutosplitRerunGuidance, [
    'guidance: autosplit context-budget jobs before rerun; keep sourceRefs/targetRefs lane-local and prompt evidence compact',
    'guidance: autosplit sourceRefs by package or ownership lane; rerun narrow shards instead of one broad worker',
    'guidance: rerun truncated-log jobs with compact log summaries and exact failure windows, not raw logs'
  ]);
  assert.strictEqual(collection.artifactStoreStatus.ok, true);
  assert.match(collection.artifactStoreStatus.mode, /^(full|compact)$/);
  assert.strictEqual(typeof collection.artifactStoreStatus.timeoutMs, 'number');
  assert.strictEqual(collection.artifactStoreStatus.guard.ok, true);
  assert.strictEqual(collection.metadata.collectExitGuard.ok, true);
  assert.deepStrictEqual(collection.metadata.collectExitGuard, collection.artifactStoreStatus.guard);

  const applyRunDir = path.join(tmp, 'apply-run');
  await writePatchMerge(applyRunDir, 'ready-job', {
    disposition: 'auto-mergeable',
    autoMergeable: true,
    patchText: patchText('base', 'ready')
  });
  await writePatchMerge(applyRunDir, 'commit-ready-job', {
    disposition: 'auto-mergeable',
    autoMergeable: true,
    changedPath: 'tracked-commit.txt',
    patchText: patchTextFor('tracked-commit.txt', 'base', 'committed')
  });
  await writePatchMerge(applyRunDir, 'needs-human-job', {
    disposition: 'needs-port',
    autoMergeable: false,
    patchText: patchText('base', 'review')
  });
  await writePatchMerge(applyRunDir, 'failed-job', {
    status: 'failed',
    disposition: 'blocked',
    autoMergeable: false,
    commandsFailed: [{ command: ['node', 'test.mjs'], status: 1, required: true }],
    patchText: patchText('base', 'failed')
  });
  await writeMerge(applyRunDir, 'no-source-failed-job', {
    status: 'failed',
    mergeReadiness: 'rejected',
    disposition: 'rejected',
    changedPaths: [],
    patchPath: undefined,
    reasons: ['worker-exit-nonzero:1', 'no-source-changes']
  });
  await writeMerge(applyRunDir, 'generated-failed-evidence-job', {
    status: 'failed',
    mergeReadiness: 'rejected',
    disposition: 'rejected',
    changedPaths: [],
    patchPath: undefined,
    reasons: ['generated-failed-evidence:changes.patch.orig']
  });

  const applyCollection = await collectCodexSwarmRun({
    run: applyRunDir,
    outDir: path.join(tmp, 'apply-collected'),
    cwd: root,
    checkStale: false
  });
  assert.strictEqual(applyCollection.summary.total, 6);
  assert.strictEqual(applyCollection.summary['ready-to-apply'], 2);
  assert.strictEqual(applyCollection.summary['needs-human-port'], 3);
  assert.strictEqual(applyCollection.summary['rerun-work'], 1);
  assert.strictEqual(applyCollection.summary['failed-evidence'], 0);
  assert.strictEqual(applyCollection.summary['stale-against-head'], 0);
  assert.strictEqual(applyCollection.buckets['rerun-work'][0]?.jobId, 'failed-job');
  assert.ok(applyCollection.buckets['needs-human-port'].some((entry) => entry.jobId === 'no-source-failed-job'));
  assert.ok(applyCollection.buckets['needs-human-port'].some((entry) => entry.jobId === 'generated-failed-evidence-job'));

  const emptyPatchRunDir = path.join(tmp, 'empty-patch-run');
  await writePatchMerge(emptyPatchRunDir, 'empty-patch-failed-job', {
    status: 'failed',
    disposition: 'blocked',
    autoMergeable: false,
    commandsFailed: [{ command: ['node', 'test.mjs'], status: 1, required: true }],
    patchText: ''
  });
  const emptyPatchCollection = await collectCodexSwarmRun({
    run: emptyPatchRunDir,
    outDir: path.join(tmp, 'empty-patch-collected'),
    cwd: root,
    checkStale: false
  });
  assert.strictEqual(emptyPatchCollection.summary.total, 1);
  assert.strictEqual(emptyPatchCollection.summary['rerun-work'], 0);
  assert.strictEqual(emptyPatchCollection.summary['failed-evidence'], 1);
  assert.strictEqual(emptyPatchCollection.buckets['failed-evidence'][0]?.jobId, 'empty-patch-failed-job');

  const applyRepo = await initPatchRepo(path.join(tmp, 'apply-repo'));
  const appliedLedger = await applyCodexSwarmCollection({
    collection: applyCollection.outDir,
    cwd: applyRepo,
    dryRun: false,
    allowDirty: false,
    jobIds: ['ready-job']
  });
  assert.strictEqual(appliedLedger.ok, true);
  assert.strictEqual(appliedLedger.summary.total, 1);
  assert.strictEqual(appliedLedger.summary.applied, 1);
  assert.strictEqual(appliedLedger.summary.committed, 0);
  assert.strictEqual(appliedLedger.summary.failed, 0);
  assert.ok(appliedLedger.entries.every((entry) => entry.status === 'applied'));
  assert.ok(appliedLedger.entries.every((entry) => entry.bundlePath.includes(`${path.sep}ready-to-apply${path.sep}`)));
  assert.ok(appliedLedger.entries.every((entry) => !entry.bundlePath.includes(`${path.sep}needs-human-port${path.sep}`)));
  assert.ok(appliedLedger.entries.every((entry) => !entry.bundlePath.includes(`${path.sep}failed-evidence${path.sep}`)));

  const commitRepo = await initPatchRepo(path.join(tmp, 'commit-repo'));
  const committedLedger = await applyCodexSwarmCollection({
    collection: applyCollection.outDir,
    cwd: commitRepo,
    dryRun: false,
    allowDirty: false,
    commit: true,
    jobIds: ['commit-ready-job']
  });
  assert.strictEqual(committedLedger.ok, true);
  assert.strictEqual(committedLedger.summary.total, 1);
  assert.strictEqual(committedLedger.summary.applied, 0);
  assert.strictEqual(committedLedger.summary.committed, 1);
  assert.strictEqual(committedLedger.summary.failed, 0);
  assert.match(committedLedger.entries[0].commit, /^[0-9a-f]{40}$/);

  assert.deepStrictEqual({
    landedSuccessCount: appliedLedger.summary.applied + committedLedger.summary.committed,
    needsHumanCount: applyCollection.summary['needs-human-port'],
    failedCount: applyCollection.summary['failed-evidence'] + appliedLedger.summary.failed + committedLedger.summary.failed,
    rerunCount: applyCollection.summary['rerun-work'],
    staleCount: applyCollection.summary['stale-against-head']
  }, {
    landedSuccessCount: 2,
    needsHumanCount: 3,
    failedCount: 0,
    rerunCount: 1,
    staleCount: 0
  });

  const needsHumanLandedEntry = {
    ...appliedLedger.entries[0],
    jobId: 'needs-human-job',
    status: 'applied',
    bundlePath: path.join(applyCollection.outDir, 'needs-human-port', 'needs-human-job', 'merge.json'),
    patchPath: path.join(applyCollection.outDir, 'needs-human-port', 'needs-human-job', 'changes.patch'),
    commands: []
  };
  const combinedLedger = {
    ...committedLedger,
    ok: appliedLedger.ok && committedLedger.ok,
    collectionDir: applyCollection.outDir,
    outDir: path.join(applyCollection.outDir, 'apply-ledger'),
    entries: [...appliedLedger.entries, ...committedLedger.entries, needsHumanLandedEntry],
    summary: {
      total: appliedLedger.summary.total + committedLedger.summary.total + 1,
      checked: appliedLedger.summary.checked + committedLedger.summary.checked,
      applied: appliedLedger.summary.applied + committedLedger.summary.applied + 1,
      committed: appliedLedger.summary.committed + committedLedger.summary.committed,
      skipped: appliedLedger.summary.skipped + committedLedger.summary.skipped,
      failed: appliedLedger.summary.failed + committedLedger.summary.failed
    }
  };
  await fs.mkdir(combinedLedger.outDir, { recursive: true });
  await fs.writeFile(path.join(combinedLedger.outDir, 'apply-ledger.json'), JSON.stringify(combinedLedger, null, 2) + '\n');

  const landedCollection = await collectCodexSwarmRun({
    run: applyRunDir,
    outDir: applyCollection.outDir,
    cwd: root,
    checkStale: false
  });
  assert.strictEqual(landedCollection.summary['ready-to-apply'], 2);
  assert.strictEqual(landedCollection.summary['needs-human-port'], 3);
  assert.strictEqual(landedCollection.summary['rerun-work'], 1);
  assert.strictEqual(landedCollection.summary['failed-evidence'], 0);
  assert.strictEqual(landedCollection.summary['stale-against-head'], 0);
  assert.strictEqual(landedCollection.summary.landed, 3);
  assert.deepStrictEqual([...landedCollection.summary.landedJobIds].sort(), ['commit-ready-job', 'needs-human-job', 'ready-job']);
  assert.strictEqual(landedCollection.summary.applyLedger.applied, 2);
  assert.strictEqual(landedCollection.summary.applyLedger.committed, 1);
  assert.strictEqual(landedCollection.summary.applyLedger.failed, 0);
  assert.deepStrictEqual(
    landedCollection.summary.applyLedger.landedEntries.map((entry) => entry.status).sort(),
    ['applied', 'applied', 'committed']
  );
  assert.strictEqual(landedCollection.summary.landedHealth.successfulOutputCount, 3);
  assert.strictEqual(landedCollection.summary.landedHealth.landedNeedsHumanReviewCount, 1);
  assert.strictEqual(landedCollection.summary.landedHealth.remainingNeedsHumanReviewCount, 2);
  assert.strictEqual(landedCollection.summary.landedHealth.remainingFailedEvidenceCount, 0);
  assert.strictEqual(landedCollection.summary.landedHealth.reviewPressureCount, 3);
  assert.strictEqual(landedCollection.qualitySignals.landed.successfulOutputCount, 3);
  assert.strictEqual(landedCollection.qualitySignals.needsPort.landedJobCount, 1);
  assert.deepStrictEqual(landedCollection.qualitySignals.needsPort.landedJobIds, ['needs-human-job']);
  assert.strictEqual(landedCollection.qualitySignals.needsPort.remainingJobCount, 2);
  assert.deepStrictEqual([...landedCollection.qualitySignals.needsPort.remainingJobIds].sort(), ['generated-failed-evidence-job', 'no-source-failed-job']);
  assert.deepStrictEqual(landedCollection.dashboard.summary.applyLedger, landedCollection.summary.applyLedger);
  assert.strictEqual(landedCollection.dashboard.summary.applyLedgerLandedCount, 3);
  assert.deepStrictEqual([...landedCollection.dashboard.summary.landedJobIds].sort(), ['commit-ready-job', 'needs-human-job', 'ready-job']);
  assert.deepStrictEqual(landedCollection.dashboard.summary.collectionQualitySignals, landedCollection.qualitySignals);
  assert.strictEqual(landedCollection.dashboard.summary.collectionLandedSuccessCount, 3);
  assert.strictEqual(landedCollection.dashboard.summary.collectionLandedNeedsHumanReviewCount, 1);
  assert.strictEqual(landedCollection.dashboard.summary.collectionRemainingNeedsHumanReviewCount, 2);
  assert.strictEqual(landedCollection.dashboard.summary.collectionRemainingFailedEvidenceCount, 0);
  assert.strictEqual(landedCollection.dashboard.summary.collectionReviewPressureCount, 3);
  assert.deepStrictEqual(landedCollection.dashboard.metadata.applyLedger, landedCollection.summary.applyLedger);
  assert.deepStrictEqual(landedCollection.dashboard.metadata.landedHealth, landedCollection.summary.landedHealth);
  assert.deepStrictEqual(landedCollection.compactDashboard.applyLedger, landedCollection.summary.applyLedger);
  assert.strictEqual(landedCollection.compactDashboard.landedCount, 3);
  assert.deepStrictEqual([...landedCollection.compactDashboard.landedJobIds].sort(), ['commit-ready-job', 'needs-human-job', 'ready-job']);
  assert.deepStrictEqual(landedCollection.compactDashboard.landedHealth, landedCollection.summary.landedHealth);
  assert.strictEqual(landedCollection.compactDashboard.successfulOutputCount, 3);
  assert.strictEqual(landedCollection.compactDashboard.landedNeedsHumanReviewCount, 1);
  assert.strictEqual(landedCollection.compactDashboard.remainingNeedsHumanReviewCount, 2);
  assert.strictEqual(landedCollection.compactDashboard.reviewPressureCount, 3);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

async function writeMerge(runDir, jobId, input) {
  const dir = path.join(runDir, jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'merge.json'), JSON.stringify({
    jobId,
    taskId: jobId,
    lane: 'collector-quality',
    status: 'completed',
    mergeReadiness: 'patch-candidate',
    disposition: 'needs-port',
    riskLevel: 'medium',
    autoMergeable: false,
    changedPaths: [],
    changedRegions: [],
    ownedFilesTouched: [],
    allowedWrites: [],
    ownershipViolations: [],
    evidencePaths: [],
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds: [jobId],
    staleAgainstHead: false,
    reasons: [],
    ...input
  }, null, 2) + '\n');
}

async function writePatchMerge(runDir, jobId, input) {
  const dir = path.join(runDir, jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'changes.patch'), input.patchText);
  await writeMerge(runDir, jobId, {
    status: input.status ?? 'completed',
    disposition: input.disposition,
    autoMergeable: input.autoMergeable,
    changedPaths: [input.changedPath ?? 'tracked.txt'],
    patchPath: 'changes.patch',
    traceShards: [],
    semanticPatchBundles: [],
    commandsFailed: input.commandsFailed ?? []
  });
}

function patchText(before, after) {
  return patchTextFor('tracked.txt', before, after);
}

function patchTextFor(file, before, after) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    `-${before}`,
    `+${after}`,
    ''
  ].join('\n');
}

async function initPatchRepo(repo) {
  await fs.mkdir(repo, { recursive: true });
  await execFileP('git', ['init'], { cwd: repo });
  await execFileP('git', ['config', 'user.email', 'frontier@example.invalid'], { cwd: repo });
  await execFileP('git', ['config', 'user.name', 'Frontier Test'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'tracked.txt'), 'base\n');
  await fs.writeFile(path.join(repo, 'tracked-commit.txt'), 'base\n');
  await execFileP('git', ['add', 'tracked.txt', 'tracked-commit.txt'], { cwd: repo });
  await execFileP('git', ['commit', '-m', 'initial'], { cwd: repo });
  return repo;
}

function execFileP(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function contextBudgetReport(jobId, status, warnings, errors, inputTokens) {
  return {
    kind: 'frontier.swarm-codex.context-budget',
    version: 1,
    generatedAt: 1,
    jobId,
    taskId: jobId,
    lane: 'collector-quality',
    status,
    action: status === 'failed' ? 'fail-after-run' : status === 'warning' ? 'warn' : 'allow',
    options: {
      enabled: true,
      mode: status === 'failed' ? 'fail' : 'warn'
    },
    measured: {
      promptBytes: inputTokens * 4,
      promptChars: inputTokens * 4,
      estimatedInputTokens: inputTokens,
      sourceRefCount: 0,
      targetRefCount: 0,
      allowedWriteCount: 0,
      workspaceIncludeCount: 0,
      workspaceMode: 'copy'
    },
    usage: {
      source: 'smoke',
      inputTokens,
      cachedInputTokens: Math.max(0, inputTokens - 30),
      uncachedInputTokens: Math.min(inputTokens, 30)
    },
    warnings,
    errors
  };
}
