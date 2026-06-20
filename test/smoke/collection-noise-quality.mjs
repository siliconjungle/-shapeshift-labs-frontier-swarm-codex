import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { contextBudgetReport, writeMerge } from './collection-noise-fixtures.mjs';

export async function runCollectionQualitySmoke(root) {
  if (!await exists(path.join(root, 'dist/index.js'))) return;
  const { collectCodexSwarmRun } = await import(path.join(root, 'dist/index.js'));
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'frontier-swarm-codex-quality-'));
  const runDir = path.join(tmp, 'run');
  await writeQualityMergeSet(runDir);

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
}

async function writeQualityMergeSet(runDir) {
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
  await writeMerge(runDir, 'needs-port-job', { disposition: 'needs-port', mergeReadiness: 'verified-patch', changedPaths: ['src/needs-port.ts'] });
  await writeMerge(runDir, 'stale-job', { disposition: 'stale-against-head', staleAgainstHead: true, changedPaths: ['src/stale.ts'] });
  await writeMerge(runDir, 'ownership-job', {
    status: 'failed',
    disposition: 'blocked',
    mergeReadiness: 'blocked',
    changedPaths: ['src/owned.ts'],
    ownershipViolations: ['dist/generated.js'],
    reasons: ['quarantined-disallowed-changes'],
    metadata: {
      workspacePatchQuarantine: { quarantinedChangedPaths: ['dist/generated.js'] },
      contextBudget: contextBudgetReport('ownership-job', 'warning', ['source refs 99 exceeded warn budget 64'], [], 25)
    }
  });
  await writeMerge(runDir, 'invalid-index-job', { status: 'failed', disposition: 'rejected', mergeReadiness: 'blocked', changedPaths: [], reasons: ['fatal: .git/index: index file smaller than expected'] });
  await writeMerge(runDir, 'generated-blob-job', { status: 'failed', disposition: 'rejected', mergeReadiness: 'blocked', changedPaths: [], reasons: ['missing HEAD blob for dist/cache.tsbuildinfo'] });
  await writeMerge(runDir, 'generated-setup-job', {
    status: 'failed',
    disposition: 'rejected',
    mergeReadiness: 'blocked',
    changedPaths: [],
    ownershipViolations: ['.gitignore', 'loom.json'],
    reasons: ['generated_setup', 'quarantined-disallowed-changes'],
    metadata: { workspacePatchQuarantine: { quarantinedChangedPaths: ['.gitignore', 'loom.json'] } }
  });
  await writeMerge(runDir, 'source-ownership-job', {
    status: 'failed',
    disposition: 'blocked',
    mergeReadiness: 'blocked',
    changedPaths: ['src/forbidden.ts'],
    ownershipViolations: ['src/forbidden.ts'],
    reasons: ['quarantined-disallowed-changes'],
    metadata: { workspacePatchQuarantine: { quarantinedChangedPaths: ['src/forbidden.ts'] } }
  });
  await writeMerge(runDir, 'restored-source-job', {
    status: 'blocked',
    disposition: 'blocked',
    mergeReadiness: 'blocked',
    changedPaths: [],
    ownershipViolations: ['src/restored.ts'],
    reasons: ['restored-disallowed-changes'],
    metadata: { ownershipRestore: [{ path: 'src/restored.ts', action: 'restored', reason: 'restored from source root' }] }
  });
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
