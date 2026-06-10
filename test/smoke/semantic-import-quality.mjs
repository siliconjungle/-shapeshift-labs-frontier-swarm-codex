import assert from 'node:assert';
import { collectCodexSwarmRun, fs, path, queryCodexSwarmCollection } from './context.mjs';

const EXPECTED_ZERO_LINEAGE_WARNING = 'semantic import has symbols but no inferred semantic lineage for expected before-source diff';

export async function testSemanticImportQuality({ tmp }, mergeBundle) {
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
  assert.strictEqual(semanticImport.semanticFactCount, 6);
  assert.ok(semanticImport.semanticFactPredicates.includes('controlFlow'));
  assert.strictEqual(semanticImport.semanticFactSummary.effect, 2);
  assert.ok(semanticImport.expectedMissingReasonCodes.includes('expected-semantic-import-empty'));
  assert.ok(semanticImport.expectedMissingReasonCodes.includes('expected-semantic-import-missing'));
  assert.ok(semanticImport.warnings.includes('semantic import expected but empty'));
  assert.ok(semanticImport.warnings.includes('semantic import expected but missing'));
  assert.ok(semanticImport.warnings.includes(EXPECTED_ZERO_LINEAGE_WARNING));
  assert.strictEqual(semanticImport.semanticEditScripts.conflicts, 1);
  assert.strictEqual(semanticImport.semanticEditScripts.autoMergeCandidates, 1);
  assert.strictEqual(semanticImport.semanticEditScripts.portable, 1);
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
  assert.strictEqual(coordinatorQuery.summary.semanticImportFactCount, 6);
  assert.strictEqual(coordinatorQuery.summary.semanticEditScriptConflicts, 1);

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
  assert.strictEqual(admissionQuery.jobs.length, 1);
  assert.strictEqual(admissionQuery.jobs[0].jobId, 'semantic-edit-script-worker');
}

function emptyExpectedSemanticImportSummary() {
  return {
    total: 0,
    selected: 0,
    eligible: 0,
    imported: 0,
    sourceMapMappingCount: 0,
    semanticIndex: { symbols: 0 },
    semanticSidecars: { ownershipRegions: 0, patchHints: 0 },
    dependencies: { total: 0, predicates: [] },
    semanticImportExpected: true,
    semanticImportExpectedSatisfied: false,
    semanticImportExpectedMissingReasonCodes: ['expected-semantic-import-empty']
  };
}

function factSemanticImportSummary() {
  return {
    total: 1,
    selected: 1,
    eligible: 1,
    imported: 1,
    sourceMapMappingCount: 1,
    semanticIndex: { symbols: 2, facts: 3 },
    semanticFacts: {
      total: 3,
      predicates: ['controlFlow', 'effect', 'mutation'],
      byPredicate: { controlFlow: 1, effect: 1, mutation: 1 }
    },
    semanticSidecars: { ownershipRegions: 1, patchHints: 1 },
    dependencies: { total: 1, predicates: ['calls'] },
    semanticImportExpected: true,
    semanticImportExpectedSatisfied: true,
    semanticImportExpectedMissingReasonCodes: []
  };
}

function zeroLineageSemanticImportSummary() {
  return {
    total: 1,
    selected: 1,
    eligible: 1,
    imported: 1,
    sourceMapMappingCount: 1,
    semanticIndex: { symbols: 2, facts: 0 },
    semanticSidecars: { ownershipRegions: 1, patchHints: 1 },
    dependencies: { total: 1, predicates: ['calls'] },
    universalAstLayers: { total: 1, names: ['program'], ids: ['layer:program'] },
    semanticLineage: {
      total: 0,
      inferredEvents: 0,
      moved: 0,
      renamed: 0,
      deleted: 0,
      ambiguous: 0,
      unmatchedAdded: 0,
      unchangedAnchors: 1,
      beforeSymbols: 2,
      afterSymbols: 2,
      blocked: 0,
      needsReview: 0,
      ready: 0,
      readiness: {},
      eventKinds: [],
      reasonCodes: [],
      reviewRequired: false,
      empty: false
    },
    semanticImportExpected: true,
    semanticImportExpectedSatisfied: true,
    semanticImportExpectedMissingReasonCodes: []
  };
}

function editScriptSemanticImportSummary() {
  return {
    ...factSemanticImportSummary(),
    semanticEditScripts: {
      total: 2,
      operations: 2,
      autoMergeCandidates: 1,
      portable: 1,
      alreadyApplied: 0,
      needsPort: 0,
      conflicts: 1,
      stale: 0,
      blocked: 0,
      candidates: 0,
      reviewRequired: 1,
      autoApplyCandidates: 1,
      byStatus: { conflict: 1, portable: 1 },
      byKind: { replaceBody: 2 },
      admission: { conflict: 1, 'auto-merge-candidate': 1 },
      actions: ['block', 'apply'],
      reasonCodes: ['head-anchor-changed-since-base'],
      conflictKeys: ['region:source#src/runtime/edit-script.ts#body#run'],
      evidenceIds: ['evidence_semantic_edit_script'],
      empty: false
    }
  };
}
