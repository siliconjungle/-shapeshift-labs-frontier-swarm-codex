import assert from 'node:assert';
import {
  fs,
  path,
  scoreCodexSwarmPatches
} from './context.mjs';
import {
  emptySemanticImport,
  semanticEditBlockedProjectionImport,
  semanticEditConflictImport,
  semanticEditMismatchProjectionImport,
  semanticEditMixedReviewImport,
  semanticEditPortableImport,
  semanticEditProjectedPortableImport,
  semanticEditReplayedPortableImport,
  weakPatchHintSemanticImport
} from './apply-score-semantic-fixtures.mjs';

export async function testWeakSemanticAdmissionScore({ applyRepo, tmp, readyDir, readySemanticImport }) {
  const collection = path.join(tmp, 'weak-semantic-collection');
  const baseBundle = JSON.parse(await fs.readFile(path.join(readyDir, 'merge.json'), 'utf8'));
  await writeSemanticFixture({
    collection,
    readyDir,
    bundle: {
      ...baseBundle,
      id: 'empty-semantic-bundle',
      jobId: 'empty-semantic-job',
      taskId: 'empty-semantic-task',
      queueItemIds: ['empty-semantic-task'],
      semanticImport: emptySemanticImport(),
      metadata: { semanticImport: emptySemanticImport() }
    }
  });
  await writeSemanticFixture({
    collection,
    readyDir,
    bundle: {
      ...baseBundle,
      id: 'weak-semantic-bundle',
      jobId: 'weak-semantic-job',
      taskId: 'weak-semantic-task',
      queueItemIds: ['weak-semantic-task'],
      semanticImport: weakPatchHintSemanticImport(readySemanticImport),
      metadata: { semanticImport: weakPatchHintSemanticImport(readySemanticImport) }
    }
  });
  await writeSemanticFixture({
    collection,
    readyDir,
    bundle: {
      ...baseBundle,
      id: 'semantic-edit-conflict-bundle',
      jobId: 'semantic-edit-conflict-job',
      taskId: 'semantic-edit-conflict-task',
      queueItemIds: ['semantic-edit-conflict-task'],
      semanticImport: semanticEditConflictImport(readySemanticImport),
      metadata: { semanticImport: semanticEditConflictImport(readySemanticImport) }
    }
  });
  await writeSemanticFixture({
    collection,
    readyDir,
    bundle: {
      ...baseBundle,
      id: 'semantic-edit-portable-bundle',
      jobId: 'semantic-edit-portable-job',
      taskId: 'semantic-edit-portable-task',
      queueItemIds: ['semantic-edit-portable-task'],
      semanticImport: semanticEditPortableImport(readySemanticImport),
      metadata: { semanticImport: semanticEditPortableImport(readySemanticImport) }
    }
  });
  await writeSemanticFixture({
    collection,
    readyDir,
    bundle: {
      ...baseBundle,
      id: 'semantic-edit-projected-portable-bundle',
      jobId: 'semantic-edit-projected-portable-job',
      taskId: 'semantic-edit-projected-portable-task',
      queueItemIds: ['semantic-edit-projected-portable-task'],
      semanticImport: semanticEditProjectedPortableImport(readySemanticImport),
      metadata: { semanticImport: semanticEditProjectedPortableImport(readySemanticImport) }
    }
  });
  await writeSemanticFixture({
    collection,
    readyDir,
    bundle: {
      ...baseBundle,
      id: 'semantic-edit-replayed-portable-bundle',
      jobId: 'semantic-edit-replayed-portable-job',
      taskId: 'semantic-edit-replayed-portable-task',
      queueItemIds: ['semantic-edit-replayed-portable-task'],
      mergeReadiness: 'patch-candidate',
      disposition: 'needs-port',
      autoMergeable: false,
      semanticImport: semanticEditReplayedPortableImport(readySemanticImport),
      metadata: { semanticImport: semanticEditReplayedPortableImport(readySemanticImport) }
    }
  });
  await writeSemanticFixture({
    collection,
    readyDir,
    bundle: {
      ...baseBundle,
      id: 'semantic-edit-blocked-projection-bundle',
      jobId: 'semantic-edit-blocked-projection-job',
      taskId: 'semantic-edit-blocked-projection-task',
      queueItemIds: ['semantic-edit-blocked-projection-task'],
      semanticImport: semanticEditBlockedProjectionImport(readySemanticImport),
      metadata: { semanticImport: semanticEditBlockedProjectionImport(readySemanticImport) }
    }
  });
  await writeSemanticFixture({
    collection,
    readyDir,
    bundle: {
      ...baseBundle,
      id: 'semantic-edit-mismatch-projection-bundle',
      jobId: 'semantic-edit-mismatch-projection-job',
      taskId: 'semantic-edit-mismatch-projection-task',
      queueItemIds: ['semantic-edit-mismatch-projection-task'],
      semanticImport: semanticEditMismatchProjectionImport(readySemanticImport),
      metadata: { semanticImport: semanticEditMismatchProjectionImport(readySemanticImport) }
    }
  });
  await writeSemanticFixture({
    collection,
    readyDir,
    bundle: {
      ...baseBundle,
      id: 'semantic-edit-mixed-review-bundle',
      jobId: 'semantic-edit-mixed-review-job',
      taskId: 'semantic-edit-mixed-review-task',
      queueItemIds: ['semantic-edit-mixed-review-task'],
      semanticImport: semanticEditMixedReviewImport(readySemanticImport),
      metadata: { semanticImport: semanticEditMixedReviewImport(readySemanticImport) }
    }
  });
  await writeSemanticFixture({
    collection,
    readyDir,
    bundle: {
      ...baseBundle,
      id: 'semantic-edit-needs-port-portable-bundle',
      jobId: 'semantic-edit-needs-port-portable-job',
      taskId: 'semantic-edit-needs-port-portable-task',
      queueItemIds: ['semantic-edit-needs-port-portable-task'],
      mergeReadiness: 'patch-candidate',
      disposition: 'needs-port',
      autoMergeable: false,
      semanticImport: semanticEditProjectedPortableImport(readySemanticImport),
      metadata: { semanticImport: semanticEditProjectedPortableImport(readySemanticImport) }
    }
  });
  const score = await scoreCodexSwarmPatches({
    collection,
    cwd: applyRepo,
    workspaceIncludes: ['src'],
    focusedCommands: [{ name: 'assert-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
  });
  const byJob = new Map(score.entries.map((entry) => [entry.jobId, entry]));
  assert.strictEqual(score.ok, true);
  assert.strictEqual(score.summary['accepted-clean'], 4);
  assert.strictEqual(score.summary['accepted-needs-port'], 6);
  assert.strictEqual(byJob.get('empty-semantic-job').status, 'accepted-needs-port');
  assert.strictEqual(byJob.get('empty-semantic-job').semanticEvidence.cleanEligible, false);
  assert.strictEqual(byJob.get('empty-semantic-job').score, 40);
  assert.ok(byJob.get('empty-semantic-job').reasons.includes('empty semantic import sidecar'));
  assert.strictEqual(byJob.get('weak-semantic-job').status, 'accepted-needs-port');
  assert.strictEqual(byJob.get('weak-semantic-job').semanticEvidence.cleanEligible, false);
  assert.ok(byJob.get('weak-semantic-job').reasons.includes('semantic sidecar has no patch hints'));
  assert.strictEqual(byJob.get('semantic-edit-conflict-job').status, 'accepted-needs-port');
  assert.strictEqual(byJob.get('semantic-edit-conflict-job').semanticEvidence.cleanEligible, false);
  assert.strictEqual(byJob.get('semantic-edit-conflict-job').semanticEvidence.semanticEditScript.conflicts, 1);
  assert.ok(byJob.get('semantic-edit-conflict-job').reasons.includes('semantic edit script conflicts: 1'));
  assert.strictEqual(byJob.get('semantic-edit-portable-job').status, 'accepted-needs-port');
  assert.strictEqual(byJob.get('semantic-edit-portable-job').semanticEvidence.cleanEligible, false);
  assert.strictEqual(byJob.get('semantic-edit-portable-job').semanticEvidence.semanticEditOperationCleanEligible, false);
  assert.ok(byJob.get('semantic-edit-portable-job').reasons.includes('semantic edit projection missing'));
  assert.strictEqual(byJob.get('semantic-edit-portable-job').semanticEvidence.semanticEditScript.portable, 1);
  assert.strictEqual(byJob.get('semantic-edit-portable-job').semanticEvidence.semanticEditScript.autoMergeCandidates, 1);
  assert.strictEqual(byJob.get('semantic-edit-projected-portable-job').status, 'accepted-clean');
  assert.strictEqual(byJob.get('semantic-edit-projected-portable-job').semanticEvidence.cleanEligible, true);
  assert.strictEqual(byJob.get('semantic-edit-projected-portable-job').semanticEvidence.semanticEditOperationCleanEligible, true);
  assert.strictEqual(byJob.get('semantic-edit-projected-portable-job').semanticEvidence.semanticEditProjection.projectedSourceMatchesWorker, 1);
  assert.strictEqual(byJob.get('semantic-edit-projected-portable-job').semanticEvidence.semanticEditProjection.editCount, 1);
  assert.strictEqual(byJob.get('semantic-edit-projected-portable-job').semanticEvidence.semanticEditProjection.appliedEditCount, 1);
  assert.strictEqual(byJob.get('semantic-edit-projected-portable-job').semanticEvidence.semanticEditProjection.replacementBytes, 4);
  assert.deepStrictEqual(byJob.get('semantic-edit-projected-portable-job').semanticEvidence.semanticEditProjection.symbolNames, ['apply']);
  assert.deepStrictEqual(byJob.get('semantic-edit-projected-portable-job').semanticEvidence.semanticEditProjection.sourcePaths, ['src/apply.ts']);
  assert.deepStrictEqual(byJob.get('semantic-edit-projected-portable-job').semanticEvidence.semanticEditProjection.semanticKeys, ['semantic-edit:replaceBody:modified:function:apply']);
  assert.deepStrictEqual(byJob.get('semantic-edit-projected-portable-job').semanticEvidence.semanticEditProjection.semanticIdentityHashes, ['hash:semantic-identity-apply']);
  assert.strictEqual(byJob.get('semantic-edit-replayed-portable-job').status, 'accepted-clean');
  assert.strictEqual(byJob.get('semantic-edit-replayed-portable-job').semanticEvidence.semanticEditReplay.acceptedClean, 1);
  assert.deepStrictEqual(byJob.get('semantic-edit-replayed-portable-job').semanticEvidence.semanticEditReplay.operationIds, ['semantic_edit_op_apply']);
  assert.ok(byJob.get('semantic-edit-replayed-portable-job').reasons.includes('semantic edit replay promoted bundle to auto-merge candidate'));
  assert.strictEqual(byJob.get('semantic-edit-blocked-projection-job').status, 'accepted-needs-port');
  assert.strictEqual(byJob.get('semantic-edit-blocked-projection-job').semanticEvidence.semanticEditOperationCleanEligible, false);
  assert.strictEqual(byJob.get('semantic-edit-blocked-projection-job').semanticEvidence.semanticEditProjection.blocked, 1);
  assert.strictEqual(byJob.get('semantic-edit-blocked-projection-job').semanticEvidence.semanticEditProjection.editCount, 0);
  assert.ok(byJob.get('semantic-edit-blocked-projection-job').reasons.includes('semantic edit projection blocked: 1'));
  assert.strictEqual(byJob.get('semantic-edit-mismatch-projection-job').status, 'accepted-needs-port');
  assert.strictEqual(byJob.get('semantic-edit-mismatch-projection-job').semanticEvidence.semanticEditOperationCleanEligible, false);
  assert.strictEqual(byJob.get('semantic-edit-mismatch-projection-job').semanticEvidence.semanticEditProjection.projectedSourceMismatchesWorker, 1);
  assert.ok(byJob.get('semantic-edit-mismatch-projection-job').reasons.includes('semantic edit projection worker mismatch: 1'));
  assert.strictEqual(byJob.get('semantic-edit-mixed-review-job').status, 'accepted-clean');
  assert.strictEqual(byJob.get('semantic-edit-mixed-review-job').semanticEvidence.cleanEligible, false);
  assert.strictEqual(byJob.get('semantic-edit-mixed-review-job').semanticEvidence.semanticEditOperationCleanEligible, true);
  assert.ok(byJob.get('semantic-edit-mixed-review-job').reasons.includes('semantic edit operation auto-merge candidate accepted with review-only sidecar records'));
  assert.strictEqual(byJob.get('semantic-edit-needs-port-portable-job').status, 'accepted-clean');
  assert.strictEqual(byJob.get('semantic-edit-needs-port-portable-job').semanticEvidence.semanticEditAdmission.status, 'auto-merge-candidate');
  assert.strictEqual(byJob.get('semantic-edit-needs-port-portable-job').semanticEvidence.semanticEditAdmission.autoMergeCandidate, true);
  assert.ok(byJob.get('semantic-edit-needs-port-portable-job').reasons.includes('semantic edit script promoted bundle to auto-merge candidate'));
  await fs.mkdir(path.join(collection, 'apply-ledger'), { recursive: true });
  await fs.writeFile(path.join(collection, 'apply-ledger', 'apply-ledger.json'), JSON.stringify({
    entries: [{ jobId: 'semantic-edit-needs-port-portable-job', status: 'applied' }]
  }, null, 2) + '\n');
  const calibrated = await scoreCodexSwarmPatches({
    collection,
    cwd: applyRepo,
    workspaceIncludes: ['src'],
    focusedCommands: [{ name: 'assert-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
  });
  assert.ok(calibrated.calibration.semanticAutoMergeCandidateJobIds.includes('semantic-edit-needs-port-portable-job'));
  assert.ok(calibrated.calibration.semanticAutoMergeCandidateJobIds.includes('semantic-edit-replayed-portable-job'));
  assert.ok(calibrated.calibration.landedSemanticAutoMergeCandidateJobIds.includes('semantic-edit-needs-port-portable-job'));
  assert.strictEqual(calibrated.calibration.semanticAutoMergeCandidatePrecision, 0.25);
}

async function writeSemanticFixture({ collection, readyDir, bundle }) {
  const dir = path.join(collection, 'ready-to-apply', bundle.jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'changes.patch'), await fs.readFile(path.join(readyDir, 'changes.patch'), 'utf8'));
  await fs.writeFile(path.join(dir, 'merge.json'), JSON.stringify(bundle, null, 2) + '\n');
}
