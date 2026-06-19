import assert from 'node:assert';
import { collectCodexSwarmRun, fs, path, queryCodexSwarmCollection } from './context.mjs';
import {
  cleanEditScriptSemanticImportSummary,
  editScriptSemanticImportSummary,
  emptyExpectedSemanticImportSummary,
  factSemanticImportSummary,
  zeroLineageSemanticImportSummary
} from './semantic-import-quality-fixtures.mjs';
import { createSemanticImportSidecar } from '../../dist/semantic-import-sidecar.js';

const EXPECTED_ZERO_LINEAGE_WARNING = 'semantic import has symbols but no inferred semantic lineage for expected before-source diff';

export async function testSemanticImportQuality({ tmp }, mergeBundle) {
  const frontierLangUnavailableSidecar = createSemanticImportSidecar({
    id: 'frontier-lang-unavailable-worker',
    taskId: 'frontier-lang-unavailable-task',
    lane: 'semantic'
  }, [{
    path: 'src/runtime/unavailable.ts',
    language: 'typescript',
    status: 'skipped',
    reason: 'frontier-lang-unavailable'
  }], {
    selected: [{ path: 'src/runtime/unavailable.ts', language: 'typescript' }],
    candidateCount: 1,
    ignoredCount: 0,
    includeFilteredCount: 0,
    excludeFilteredCount: 0,
    unsupportedLanguageCount: 0,
    fallbackCount: 0,
    eligibleCount: 1,
    omittedCount: 0,
    maxFiles: 1
  }, true);
  assert.strictEqual(frontierLangUnavailableSidecar.summary.errors, 0);
  assert.strictEqual(frontierLangUnavailableSidecar.summary.skipped, 1);
  assert.strictEqual(frontierLangUnavailableSidecar.summary.semanticImportExpected, true);
  assert.strictEqual(frontierLangUnavailableSidecar.summary.semanticImportExpectedSatisfied, false);
  assert.ok(frontierLangUnavailableSidecar.summary.semanticImportExpectedMissingReasonCodes.includes('missing-imports'));
  assert.ok(frontierLangUnavailableSidecar.summary.semanticImportExpectedMissingReasonCodes.includes('frontier-lang-unavailable'));
  assert.strictEqual(frontierLangUnavailableSidecar.summary.readiness['tooling-unavailable'], 1);
  assert.strictEqual(frontierLangUnavailableSidecar.summary.readiness['semantic-sidecar-unavailable'], 1);
  assert.strictEqual(frontierLangUnavailableSidecar.summary.readiness['universal-ast-unavailable'], 1);
  assert.strictEqual(frontierLangUnavailableSidecar.summary.readiness['proof-spec-unavailable'], 1);

  const partialSemanticSidecar = createSemanticImportSidecar({
    id: 'partial-semantic-worker',
    taskId: 'partial-semantic-task',
    lane: 'semantic'
  }, [{
    path: 'src/runtime/partial.ts',
    language: 'typescript',
    status: 'imported',
    bytes: 128,
    sourceMapMappingCount: 1,
    evidenceCount: 1,
    semanticIndex: { documents: 1, symbols: 2, occurrences: 2, relations: 0, facts: 0 },
    semanticSidecar: { symbols: 2, ownershipRegions: 1, patchHints: 0 },
    universalAstLayers: { names: ['losslessSource'], ids: [], byName: { losslessSource: 1 } },
    proofSpec: { open: 1, byStatus: { open: 1 } },
    sourceProjection: { mode: 'native-source-stubs', readiness: 'ready-with-losses' },
    nativeCompile: { ok: true, outputMode: 'target-stubs', readiness: 'needs-review' },
    mergeCandidate: { readiness: 'ready-with-losses' }
  }], {
    selected: [{ path: 'src/runtime/partial.ts', language: 'typescript' }],
    candidateCount: 1,
    ignoredCount: 0,
    includeFilteredCount: 0,
    excludeFilteredCount: 0,
    unsupportedLanguageCount: 0,
    fallbackCount: 0,
    eligibleCount: 1,
    omittedCount: 0,
    maxFiles: 1
  }, true);
  assert.strictEqual(partialSemanticSidecar.summary.semanticImportExpectedSatisfied, false);
  assert.ok(partialSemanticSidecar.summary.semanticImportExpectedMissingReasonCodes.includes('semantic-sidecar-partial'));
  assert.ok(partialSemanticSidecar.summary.semanticImportExpectedMissingReasonCodes.includes('semantic-sidecar-missing-patch-hints'));
  assert.strictEqual(partialSemanticSidecar.summary.universalAstLayers.total, 1);
  assert.strictEqual(partialSemanticSidecar.summary.proofSpec.total, 1);
  assert.strictEqual(partialSemanticSidecar.summary.readiness['ready-with-losses'], 1);
  assert.strictEqual(partialSemanticSidecar.summary.readiness['semantic-sidecar-partial'], 1);
  assert.strictEqual(partialSemanticSidecar.summary.readiness['universal-ast-ready'], 1);
  assert.strictEqual(partialSemanticSidecar.summary.readiness['proof-spec-present'], 1);
  assert.strictEqual(partialSemanticSidecar.summary.readiness['proof-spec-open'], 1);
  assert.strictEqual(partialSemanticSidecar.summary.readiness['source-projection-ready-with-losses'], 1);
  assert.strictEqual(partialSemanticSidecar.summary.readiness['source-projection-stubbed'], 1);
  assert.strictEqual(partialSemanticSidecar.summary.readiness['native-compile-needs-review'], 1);
  assert.strictEqual(partialSemanticSidecar.summary.readiness['native-compile-emitted'], 1);
  assert.strictEqual(partialSemanticSidecar.summary.readiness['native-compile-target-stubs'], 1);

  const runDir = path.join(tmp, 'empty-semantic-run');
  const jobDir = path.join(runDir, 'empty-semantic-worker');
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'empty-semantic-worker-bundle',
    jobId: 'empty-semantic-worker',
    taskId: 'empty-semantic-task',
    changedPaths: ['src/runtime/empty.ts'],
    evidencePaths: ['semantic-imports.json'],
    patchPath: undefined,
    semanticImport: emptyExpectedSemanticImportSummary(),
    metadata: { semanticImport: emptyExpectedSemanticImportSummary() }
  }, null, 2) + '\n');
  const missingJobDir = path.join(runDir, 'missing-semantic-worker');
  await fs.mkdir(missingJobDir, { recursive: true });
  await fs.writeFile(path.join(missingJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'missing-semantic-worker-bundle',
    jobId: 'missing-semantic-worker',
    taskId: 'missing-semantic-task',
    changedPaths: ['src/runtime/missing.ts'],
    evidencePaths: [],
    semanticImport: undefined,
    metadata: {},
    patchPath: undefined
  }, null, 2) + '\n');
  const factJobDir = path.join(runDir, 'fact-semantic-worker');
  await fs.mkdir(factJobDir, { recursive: true });
  await fs.writeFile(path.join(factJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'fact-semantic-worker-bundle',
    jobId: 'fact-semantic-worker',
    taskId: 'fact-semantic-task',
    changedPaths: ['src/runtime/facts.ts'],
    evidencePaths: ['semantic-imports.json'],
    patchPath: undefined,
    semanticImport: factSemanticImportSummary(),
    metadata: { semanticImport: factSemanticImportSummary() }
  }, null, 2) + '\n');
  const zeroLineageJobDir = path.join(runDir, 'zero-lineage-semantic-worker');
  await fs.mkdir(zeroLineageJobDir, { recursive: true });
  await fs.writeFile(path.join(zeroLineageJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'zero-lineage-semantic-worker-bundle',
    jobId: 'zero-lineage-semantic-worker',
    taskId: 'zero-lineage-semantic-task',
    changedPaths: ['src/runtime/lineage-zero.ts'],
    evidencePaths: ['semantic-imports.json'],
    patchPath: undefined,
    semanticImport: zeroLineageSemanticImportSummary(),
    metadata: { semanticImport: zeroLineageSemanticImportSummary() }
  }, null, 2) + '\n');
  const editScriptJobDir = path.join(runDir, 'semantic-edit-script-worker');
  await fs.mkdir(editScriptJobDir, { recursive: true });
  await fs.writeFile(path.join(editScriptJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'semantic-edit-script-worker-bundle',
    jobId: 'semantic-edit-script-worker',
    taskId: 'semantic-edit-script-task',
    changedPaths: ['src/runtime/edit-script.ts'],
    evidencePaths: ['semantic-imports.json'],
    patchPath: undefined,
    semanticImport: editScriptSemanticImportSummary(),
    metadata: { semanticImport: editScriptSemanticImportSummary() }
  }, null, 2) + '\n');
  const cleanEditScriptJobDir = path.join(runDir, 'semantic-edit-clean-worker');
  await fs.mkdir(cleanEditScriptJobDir, { recursive: true });
  await fs.writeFile(path.join(cleanEditScriptJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'semantic-edit-clean-worker-bundle',
    jobId: 'semantic-edit-clean-worker',
    taskId: 'semantic-edit-clean-task',
    changedPaths: ['src/runtime/edit-script-clean.ts'],
    evidencePaths: ['semantic-imports.json'],
    patchPath: undefined,
    semanticImport: cleanEditScriptSemanticImportSummary(),
    metadata: { semanticImport: cleanEditScriptSemanticImportSummary() }
  }, null, 2) + '\n');
  const duplicateCleanJobDir = path.join(runDir, 'semantic-edit-clean-duplicate-worker');
  await fs.mkdir(duplicateCleanJobDir, { recursive: true });
  await fs.writeFile(path.join(duplicateCleanJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'semantic-edit-clean-duplicate-worker-bundle',
    jobId: 'semantic-edit-clean-duplicate-worker',
    taskId: 'semantic-edit-clean-duplicate-task',
    changedPaths: ['src/runtime/edit-script-clean-copy.ts'],
    evidencePaths: ['semantic-imports.json'],
    patchPath: undefined,
    semanticImport: cleanEditScriptSemanticImportSummary(),
    metadata: { semanticImport: cleanEditScriptSemanticImportSummary() }
  }, null, 2) + '\n');
  const collection = await collectCodexSwarmRun({
    run: runDir,
    checkStale: false,
    semanticImportExpected: true,
    outDir: path.join(runDir, 'collected')
  });
  const semanticImport = collection.compactDashboard.semanticImport;
  const qualityByJob = new Map(collection.compactDashboard.topJobs.map((entry) => [entry.jobId, entry.semanticImportQuality]));
  const emptyQuality = qualityByJob.get('empty-semantic-worker');
  const missingQuality = qualityByJob.get('missing-semantic-worker');
  const factQuality = qualityByJob.get('fact-semantic-worker');
  const zeroLineageQuality = qualityByJob.get('zero-lineage-semantic-worker');
  assert.strictEqual(semanticImport.expectedUnsatisfiedCount, 2);
  assert.strictEqual(semanticImport.semanticFactCount, 12);
  assert.ok(semanticImport.semanticFactPredicates.includes('controlFlow'));
  assert.strictEqual(semanticImport.semanticFactSummary.effect, 4);
  assert.ok(semanticImport.expectedMissingReasonCodes.includes('expected-semantic-import-empty'));
  assert.ok(semanticImport.expectedMissingReasonCodes.includes('expected-semantic-import-missing'));
  assert.ok(semanticImport.warnings.includes('semantic import expected but empty'));
  assert.ok(semanticImport.warnings.includes('semantic import expected but missing'));
  assert.ok(semanticImport.warnings.includes(EXPECTED_ZERO_LINEAGE_WARNING));
  assert.strictEqual(semanticImport.semanticEditScripts.conflicts, 1);
  assert.strictEqual(semanticImport.semanticEditScripts.autoMergeCandidates, 3);
  assert.strictEqual(semanticImport.semanticEditScripts.portable, 3);
  assert.strictEqual(semanticImport.semanticEditReplays.acceptedClean, 2);
  assert.strictEqual(semanticImport.semanticEditAdmission.statusCounts.conflict, 1);
  assert.strictEqual(semanticImport.semanticEditAdmission.statusCounts['auto-merge-candidate'], 2);
  assert.strictEqual(semanticImport.semanticEditAdmission.autoMergeCandidateCount, 2);
  assert.strictEqual(semanticImport.semanticEditScriptAdmission.autoMergeCandidateCount, 3);
  assert.strictEqual(semanticImport.semanticEditScriptAdmission.cleanEligibleCandidateCount, 3);
  assert.strictEqual(collection.semanticPatchBundleOverlaps.available, true);
  assert.strictEqual(collection.semanticPatchBundleOverlaps.duplicateCount, 1);
  assert.strictEqual(collection.semanticPatchBundleOverlaps.statusCounts.duplicate, 1);
  assert.deepStrictEqual(collection.semanticPatchBundleOverlaps.top[0].overlapKinds.includes('operation-content'), true);
  assert.deepStrictEqual(collection.semanticPatchBundleOverlaps.top[0].overlapKinds.includes('transform-content'), true);
  assert.deepStrictEqual(collection.semanticEditAdmission, semanticImport.semanticEditAdmission);
  assert.deepStrictEqual(collection.semanticEditScriptAdmission, semanticImport.semanticEditScriptAdmission);
  assert.deepStrictEqual(collection.compactDashboard.semanticEditAdmission, semanticImport.semanticEditAdmission);
  assert.deepStrictEqual(collection.compactDashboard.semanticEditScriptAdmission, semanticImport.semanticEditScriptAdmission);
  assert.strictEqual(collection.compactDashboard.semanticEditReplay.acceptedClean, 2);
  assert.strictEqual(emptyQuality.expectedSatisfied, false);
  assert.ok(emptyQuality.expectedMissingReasonCodes.includes('expected-semantic-import-empty'));
  assert.ok(emptyQuality.warnings.includes('semantic import expected but empty'));
  assert.strictEqual(missingQuality.expectedSatisfied, false);
  assert.ok(missingQuality.expectedMissingReasonCodes.includes('expected-semantic-import-missing'));
  assert.ok(missingQuality.warnings.includes('semantic import expected but missing'));
  assert.strictEqual(factQuality.semanticFacts, 3);
  assert.ok(factQuality.semanticFactPredicates.includes('mutation'));
  assert.strictEqual(factQuality.semanticFactSummary.controlFlow, 1);
  assert.strictEqual(zeroLineageQuality.expectedSatisfied, true);
  assert.deepStrictEqual(zeroLineageQuality.expectedMissingReasonCodes, []);
  assert.strictEqual(zeroLineageQuality.semanticLineageEvents, 0);
  assert.ok(zeroLineageQuality.warnings.includes(EXPECTED_ZERO_LINEAGE_WARNING));

  const emptyEvidence = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'empty-semantic-worker', 'evidence.json'), 'utf8'));
  assert.ok(emptyEvidence.semanticImportQuality.warnings.includes('semantic import expected but empty'));
  const missingEvidence = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'missing-semantic-worker', 'evidence.json'), 'utf8'));
  assert.ok(missingEvidence.semanticImportQuality.warnings.includes('semantic import expected but missing'));
  const zeroLineageEvidence = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'zero-lineage-semantic-worker', 'evidence.json'), 'utf8'));
  assert.strictEqual(zeroLineageEvidence.semanticImportQuality.expectedSatisfied, true);
  assert.ok(zeroLineageEvidence.semanticImportQuality.warnings.includes(EXPECTED_ZERO_LINEAGE_WARNING));

  const coordinatorQuery = JSON.parse(await fs.readFile(path.join(collection.outDir, 'coordinator-query.json'), 'utf8'));
  const queryQualityByJob = new Map(coordinatorQuery.jobs.map((entry) => [entry.jobId, entry.semanticImportQuality]));
  assert.ok(queryQualityByJob.get('empty-semantic-worker').warnings.includes('semantic import expected but empty'));
  assert.ok(queryQualityByJob.get('missing-semantic-worker').warnings.includes('semantic import expected but missing'));
  assert.strictEqual(queryQualityByJob.get('fact-semantic-worker').semanticFacts, 3);
  assert.strictEqual(queryQualityByJob.get('zero-lineage-semantic-worker').expectedSatisfied, true);
  assert.ok(queryQualityByJob.get('zero-lineage-semantic-worker').warnings.includes(EXPECTED_ZERO_LINEAGE_WARNING));
  assert.strictEqual(coordinatorQuery.summary.semanticImportFactCount, 12);
  assert.strictEqual(coordinatorQuery.summary.semanticEditScriptConflicts, 1);
  assert.strictEqual(coordinatorQuery.summary.semanticEditReplayAcceptedClean, 2);
  assert.strictEqual(coordinatorQuery.summary.semanticEditAdmission.statusCounts.conflict, 1);
  assert.strictEqual(coordinatorQuery.summary.semanticEditAdmission.statusCounts['auto-merge-candidate'], 2);
  assert.strictEqual(coordinatorQuery.summary.semanticEditScriptAdmission.autoMergeCandidateCount, 3);
  assert.strictEqual(coordinatorQuery.summary.semanticEditScriptAdmission.cleanEligibleCandidateCount, 3);
  assert.strictEqual(coordinatorQuery.summary.semanticEditReplays.acceptedClean, 2);
  assert.strictEqual(coordinatorQuery.summary.semanticPatchBundleOverlaps.duplicateCount, 1);
  assert.strictEqual(collection.compactDashboard.semanticPatchBundleOverlaps.duplicateCount, 1);
  assert.strictEqual(queryQualityByJob.get('semantic-edit-script-worker').semanticEditAdmission.status, 'conflict');
  assert.strictEqual(queryQualityByJob.get('semantic-edit-clean-worker').semanticEditAdmission.status, 'auto-merge-candidate');
  assert.strictEqual(coordinatorQuery.jobs.find((entry) => entry.jobId === 'semantic-edit-clean-worker').semanticEditAdmission.status, 'auto-merge-candidate');

  const conflictQuery = await queryCodexSwarmCollection({
    collection: collection.outDir,
    semanticEditStatus: 'conflict'
  });
  assert.strictEqual(conflictQuery.jobs.length, 1);
  assert.strictEqual(conflictQuery.jobs[0].jobId, 'semantic-edit-script-worker');
  assert.ok(conflictQuery.evidence.some((entry) => entry.jobId === 'semantic-edit-script-worker'));
  const admissionQuery = await queryCodexSwarmCollection({
    collection: collection.outDir,
    semanticEditAdmission: 'auto-merge-candidate'
  });
  assert.strictEqual(admissionQuery.jobs.length, 3);
  assert.deepStrictEqual(admissionQuery.jobs.map((entry) => entry.jobId).sort(), [
    'semantic-edit-clean-duplicate-worker',
    'semantic-edit-clean-worker',
    'semantic-edit-script-worker'
  ]);
  assert.strictEqual(admissionQuery.summary.semanticEditAdmission.autoMergeCandidateCount, 2);
  assert.strictEqual(admissionQuery.summary.semanticEditScriptAdmission.autoMergeCandidateCount, 3);
  const duplicateOverlapQuery = await queryCodexSwarmCollection({
    collection: collection.outDir,
    semanticBundleOverlap: 'duplicate'
  });
  assert.deepStrictEqual(duplicateOverlapQuery.jobs.map((entry) => entry.jobId).sort(), [
    'semantic-edit-clean-duplicate-worker',
    'semantic-edit-clean-worker'
  ]);
  assert.strictEqual(duplicateOverlapQuery.summary.semanticPatchBundleOverlaps.duplicateCount, 1);
  const semanticKeyQuery = await queryCodexSwarmCollection({
    collection: collection.outDir,
    semanticEditKey: 'semantic-edit:replaceBody:modified:function:cleanRun'
  });
  assert.deepStrictEqual(semanticKeyQuery.jobs.map((entry) => entry.jobId).sort(), [
    'semantic-edit-clean-duplicate-worker',
    'semantic-edit-clean-worker'
  ]);
  assert.ok(semanticKeyQuery.evidence.some((entry) => entry.jobId === 'semantic-edit-clean-worker'));
  assert.ok(semanticKeyQuery.artifacts.some((entry) => entry.jobId === 'semantic-edit-clean-worker'));
  assert.deepStrictEqual(semanticKeyQuery.summary.semanticEditProjection.semanticKeys, [
    'semantic-edit:replaceBody:modified:function:cleanRun'
  ]);
  assert.deepStrictEqual(semanticKeyQuery.summary.semanticEditProjection.semanticTransformContentHashes, [
    'hash:transform-content-clean'
  ]);
  assert.strictEqual(semanticKeyQuery.summary.semanticEditReplay.acceptedClean, 2);
  assert.deepStrictEqual(semanticKeyQuery.summary.semanticEditReplay.operationIds, ['semantic_edit_op_clean']);
  const replayQuery = await queryCodexSwarmCollection({
    collection: collection.outDir,
    semanticEditReplay: 'accepted-clean'
  });
  assert.deepStrictEqual(replayQuery.jobs.map((entry) => entry.jobId).sort(), [
    'semantic-edit-clean-duplicate-worker',
    'semantic-edit-clean-worker'
  ]);
  assert.ok(replayQuery.evidence.some((entry) => entry.jobId === 'semantic-edit-clean-worker'));
  assert.ok(replayQuery.artifacts.some((entry) => entry.jobId === 'semantic-edit-clean-worker'));
  const contentHashQuery = await queryCodexSwarmCollection({
    collection: collection.outDir,
    editContentHash: 'hash:edit-content-clean'
  });
  assert.deepStrictEqual(contentHashQuery.jobs.map((entry) => entry.jobId).sort(), [
    'semantic-edit-clean-duplicate-worker',
    'semantic-edit-clean-worker'
  ]);
  const operationHashQuery = await queryCodexSwarmCollection({
    collection: collection.outDir,
    operationContentHash: 'hash:operation-content-clean'
  });
  assert.deepStrictEqual(operationHashQuery.jobs.map((entry) => entry.jobId).sort(), [
    'semantic-edit-clean-duplicate-worker',
    'semantic-edit-clean-worker'
  ]);
  assert.ok(operationHashQuery.evidence.some((entry) => entry.jobId === 'semantic-edit-clean-worker'));
  const transformHashQuery = await queryCodexSwarmCollection({
    collection: collection.outDir,
    semanticTransformContentHash: 'hash:transform-content-clean'
  });
  assert.deepStrictEqual(transformHashQuery.jobs.map((entry) => entry.jobId).sort(), [
    'semantic-edit-clean-duplicate-worker',
    'semantic-edit-clean-worker'
  ]);
  assert.ok(transformHashQuery.evidence.some((entry) => entry.jobId === 'semantic-edit-clean-worker'));
}
