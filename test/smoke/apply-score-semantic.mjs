import assert from 'node:assert';
import {
  fs,
  path,
  scoreCodexSwarmPatches
} from './context.mjs';

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
      id: 'semantic-edit-needs-port-portable-bundle',
      jobId: 'semantic-edit-needs-port-portable-job',
      taskId: 'semantic-edit-needs-port-portable-task',
      queueItemIds: ['semantic-edit-needs-port-portable-task'],
      mergeReadiness: 'patch-candidate',
      disposition: 'needs-port',
      autoMergeable: false,
      semanticImport: semanticEditPortableImport(readySemanticImport),
      metadata: { semanticImport: semanticEditPortableImport(readySemanticImport) }
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
  assert.strictEqual(score.summary['accepted-clean'], 2);
  assert.strictEqual(score.summary['accepted-needs-port'], 3);
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
  assert.strictEqual(byJob.get('semantic-edit-portable-job').status, 'accepted-clean');
  assert.strictEqual(byJob.get('semantic-edit-portable-job').semanticEvidence.cleanEligible, true);
  assert.strictEqual(byJob.get('semantic-edit-portable-job').semanticEvidence.semanticEditScript.portable, 1);
  assert.strictEqual(byJob.get('semantic-edit-portable-job').semanticEvidence.semanticEditScript.autoMergeCandidates, 1);
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
  assert.ok(calibrated.calibration.landedSemanticAutoMergeCandidateJobIds.includes('semantic-edit-needs-port-portable-job'));
  assert.strictEqual(calibrated.calibration.semanticAutoMergeCandidatePrecision, 0.5);
}

async function writeSemanticFixture({ collection, readyDir, bundle }) {
  const dir = path.join(collection, 'ready-to-apply', bundle.jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'changes.patch'), await fs.readFile(path.join(readyDir, 'changes.patch'), 'utf8'));
  await fs.writeFile(path.join(dir, 'merge.json'), JSON.stringify(bundle, null, 2) + '\n');
}

function emptySemanticImport() {
  return {
    total: 0,
    selected: 0,
    eligible: 0,
    omitted: 0,
    imported: 0,
    skipped: 0,
    errors: 0,
    sourceMapCount: 0,
    sourceMapMappingCount: 0,
    lossCount: 0,
    lossesBySeverity: {},
    semanticIndex: { documents: 0, symbols: 0, occurrences: 0, relations: 0, facts: 0 },
    dependencies: { total: 0, predicates: [] },
    semanticSidecars: { total: 0, symbols: 0, ownershipRegions: 0, patchHints: 0, empty: 1 },
    universalAstLayers: { total: 0, names: [], ids: [], byName: {}, empty: true },
    proofSpec: { total: 0, obligations: 0, failed: 0, stale: 0, open: 0, unknown: 0, discharged: 0 },
    paradigmSemantics: { total: 0, groups: [], loweringRecords: 0 },
    readiness: {},
    semanticImportExpected: true,
    semanticImportExpectedSatisfied: false,
    semanticImportExpectedMissingReasonCodes: ['expected-semantic-import-empty']
  };
}

function weakPatchHintSemanticImport(readySemanticImport) {
  const semanticImport = JSON.parse(JSON.stringify(readySemanticImport));
  semanticImport.semanticSidecars.patchHints = 0;
  semanticImport.semanticImportExpected = true;
  semanticImport.semanticImportExpectedSatisfied = false;
  semanticImport.semanticImportExpectedMissingReasonCodes = ['missing-patch-hints'];
  return semanticImport;
}

function semanticEditConflictImport(readySemanticImport) {
  const semanticImport = JSON.parse(JSON.stringify(readySemanticImport));
  semanticImport.semanticEditScripts = {
    total: 1,
    operations: 1,
    autoMergeCandidates: 0,
    portable: 0,
    alreadyApplied: 0,
    needsPort: 0,
    conflicts: 0,
    stale: 0,
    blocked: 0,
    candidates: 0,
    reviewRequired: 1,
    autoApplyCandidates: 0,
    byStatus: { conflict: 1 },
    byKind: { replaceBody: 1 },
    admission: { conflict: 1 },
    actions: ['block'],
    reasonCodes: ['head-anchor-changed-since-base'],
    conflictKeys: ['region:source#src/apply.ts#body#apply'],
    evidenceIds: ['evidence_semantic_edit_conflict'],
    empty: false
  };
  return semanticImport;
}

function semanticEditPortableImport(readySemanticImport) {
  const semanticImport = JSON.parse(JSON.stringify(readySemanticImport));
  semanticImport.semanticEditScripts = {
    total: 1,
    operations: 1,
    autoMergeCandidates: 1,
    portable: 1,
    alreadyApplied: 0,
    needsPort: 0,
    conflicts: 0,
    stale: 0,
    blocked: 0,
    candidates: 0,
    reviewRequired: 0,
    autoApplyCandidates: 1,
    byStatus: { portable: 1 },
    byKind: { replaceBody: 1 },
    admission: { 'auto-merge-candidate': 1, portable: 1 },
    actions: ['apply'],
    reasonCodes: [],
    conflictKeys: [],
    evidenceIds: ['evidence_semantic_edit_portable'],
    empty: false
  };
  return semanticImport;
}
