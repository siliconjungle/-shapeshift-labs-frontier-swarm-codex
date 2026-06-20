import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initPatchRepo, patchText, patchTextFor, writeMerge, writePatchMerge } from './collection-noise-fixtures.mjs';

export async function runCollectionApplySmoke(root) {
  if (!await exists(path.join(root, 'dist/index.js'))) return;
  const { applyCodexSwarmCollection, collectCodexSwarmRun } = await import(path.join(root, 'dist/index.js'));
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'frontier-swarm-codex-apply-'));
  const applyRunDir = path.join(tmp, 'apply-run');
  await writeApplyMergeSet(applyRunDir);

  const applyCollection = await collectCodexSwarmRun({
    run: applyRunDir,
    outDir: path.join(tmp, 'apply-collected'),
    cwd: root,
    checkStale: false
  });
  assert.strictEqual(applyCollection.summary.total, 6);
  assert.strictEqual(applyCollection.summary['ready-to-apply'], 2);
  assert.strictEqual(applyCollection.summary['needs-human-port'], 1);
  assert.strictEqual(applyCollection.summary['rerun-work'], 1);
  assert.strictEqual(applyCollection.summary['failed-evidence'], 2);
  assert.strictEqual(applyCollection.summary['stale-against-head'], 0);
  assert.strictEqual(applyCollection.buckets['rerun-work'][0]?.jobId, 'failed-job');
  assert.ok(applyCollection.buckets['failed-evidence'].some((entry) => entry.jobId === 'no-source-failed-job'));
  assert.ok(applyCollection.buckets['failed-evidence'].some((entry) => entry.jobId === 'generated-failed-evidence-job'));
  await assertEmptyPatchFailsAsEvidence({ root, tmp, collectCodexSwarmRun });

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
    needsHumanCount: 1,
    failedCount: 2,
    rerunCount: 1,
    staleCount: 0
  });

  await writeCombinedLedger(applyCollection, appliedLedger, committedLedger);
  const landedCollection = await collectCodexSwarmRun({
    run: applyRunDir,
    outDir: applyCollection.outDir,
    cwd: root,
    checkStale: false
  });
  assertLandedCollection(landedCollection);
}

async function writeApplyMergeSet(applyRunDir) {
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
}

async function assertEmptyPatchFailsAsEvidence({ root, tmp, collectCodexSwarmRun }) {
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
}

async function writeCombinedLedger(applyCollection, appliedLedger, committedLedger) {
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
}

function assertLandedCollection(landedCollection) {
  assert.strictEqual(landedCollection.summary['ready-to-apply'], 2);
  assert.strictEqual(landedCollection.summary['needs-human-port'], 1);
  assert.strictEqual(landedCollection.summary['rerun-work'], 1);
  assert.strictEqual(landedCollection.summary['failed-evidence'], 2);
  assert.strictEqual(landedCollection.summary['stale-against-head'], 0);
  assert.strictEqual(landedCollection.summary.landed, 3);
  assert.deepStrictEqual([...landedCollection.summary.landedJobIds].sort(), ['commit-ready-job', 'needs-human-job', 'ready-job']);
  assert.strictEqual(landedCollection.summary.applyLedger.applied, 2);
  assert.strictEqual(landedCollection.summary.applyLedger.committed, 1);
  assert.strictEqual(landedCollection.summary.applyLedger.failed, 0);
  assert.deepStrictEqual(landedCollection.summary.applyLedger.landedEntries.map((entry) => entry.status).sort(), ['applied', 'applied', 'committed']);
  assert.strictEqual(landedCollection.summary.landedHealth.successfulOutputCount, 3);
  assert.strictEqual(landedCollection.summary.landedHealth.landedNeedsHumanReviewCount, 1);
  assert.strictEqual(landedCollection.summary.landedHealth.remainingNeedsHumanReviewCount, 0);
  assert.strictEqual(landedCollection.summary.landedHealth.remainingFailedEvidenceCount, 2);
  assert.strictEqual(landedCollection.summary.landedHealth.reviewPressureCount, 3);
  assert.strictEqual(landedCollection.qualitySignals.landed.successfulOutputCount, 3);
  assert.strictEqual(landedCollection.qualitySignals.needsPort.landedJobCount, 1);
  assert.deepStrictEqual(landedCollection.qualitySignals.needsPort.landedJobIds, ['needs-human-job']);
  assert.strictEqual(landedCollection.qualitySignals.needsPort.remainingJobCount, 0);
  assert.deepStrictEqual(landedCollection.qualitySignals.needsPort.remainingJobIds, []);
  assert.strictEqual(landedCollection.qualitySignals.failure.remainingJobCount, 2);
  assert.deepStrictEqual([...landedCollection.qualitySignals.failure.remainingJobIds].sort(), ['generated-failed-evidence-job', 'no-source-failed-job']);
  assert.deepStrictEqual(landedCollection.dashboard.summary.applyLedger, landedCollection.summary.applyLedger);
  assert.strictEqual(landedCollection.dashboard.summary.applyLedgerLandedCount, 3);
  assert.deepStrictEqual([...landedCollection.dashboard.summary.landedJobIds].sort(), ['commit-ready-job', 'needs-human-job', 'ready-job']);
  assert.deepStrictEqual(landedCollection.dashboard.summary.collectionQualitySignals, landedCollection.qualitySignals);
  assert.strictEqual(landedCollection.dashboard.summary.collectionLandedSuccessCount, 3);
  assert.strictEqual(landedCollection.dashboard.summary.collectionLandedNeedsHumanReviewCount, 1);
  assert.strictEqual(landedCollection.dashboard.summary.collectionRemainingNeedsHumanReviewCount, 0);
  assert.strictEqual(landedCollection.dashboard.summary.collectionRemainingFailedEvidenceCount, 2);
  assert.strictEqual(landedCollection.dashboard.summary.collectionReviewPressureCount, 3);
  assert.deepStrictEqual(landedCollection.dashboard.metadata.applyLedger, landedCollection.summary.applyLedger);
  assert.deepStrictEqual(landedCollection.dashboard.metadata.landedHealth, landedCollection.summary.landedHealth);
  assert.deepStrictEqual(landedCollection.compactDashboard.applyLedger, landedCollection.summary.applyLedger);
  assert.strictEqual(landedCollection.compactDashboard.landedCount, 3);
  assert.deepStrictEqual([...landedCollection.compactDashboard.landedJobIds].sort(), ['commit-ready-job', 'needs-human-job', 'ready-job']);
  assert.deepStrictEqual(landedCollection.compactDashboard.landedHealth, landedCollection.summary.landedHealth);
  assert.strictEqual(landedCollection.compactDashboard.successfulOutputCount, 3);
  assert.strictEqual(landedCollection.compactDashboard.landedNeedsHumanReviewCount, 1);
  assert.strictEqual(landedCollection.compactDashboard.remainingNeedsHumanReviewCount, 0);
  assert.strictEqual(landedCollection.compactDashboard.remainingFailedEvidenceCount, 2);
  assert.strictEqual(landedCollection.compactDashboard.reviewPressureCount, 3);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
