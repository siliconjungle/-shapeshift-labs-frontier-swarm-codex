import assert from 'node:assert';
import { collectCodexSwarmRun, fs, path } from './context.mjs';

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
  assert.strictEqual(semanticImport.expectedUnsatisfiedCount, 2);
  assert.strictEqual(semanticImport.semanticFactCount, 3);
  assert.ok(semanticImport.semanticFactPredicates.includes('controlFlow'));
  assert.strictEqual(semanticImport.semanticFactSummary.effect, 1);
  assert.ok(semanticImport.expectedMissingReasonCodes.includes('expected-semantic-import-empty'));
  assert.ok(semanticImport.expectedMissingReasonCodes.includes('expected-semantic-import-missing'));
  assert.ok(semanticImport.warnings.includes('semantic import expected but empty'));
  assert.ok(semanticImport.warnings.includes('semantic import expected but missing'));
  assert.strictEqual(emptyQuality.expectedSatisfied, false);
  assert.ok(emptyQuality.expectedMissingReasonCodes.includes('expected-semantic-import-empty'));
  assert.ok(emptyQuality.warnings.includes('semantic import expected but empty'));
  assert.strictEqual(missingQuality.expectedSatisfied, false);
  assert.ok(missingQuality.expectedMissingReasonCodes.includes('expected-semantic-import-missing'));
  assert.ok(missingQuality.warnings.includes('semantic import expected but missing'));
  assert.strictEqual(factQuality.semanticFacts, 3);
  assert.ok(factQuality.semanticFactPredicates.includes('mutation'));
  assert.strictEqual(factQuality.semanticFactSummary.controlFlow, 1);

  const emptyEvidence = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'empty-semantic-worker', 'evidence.json'), 'utf8'));
  assert.ok(emptyEvidence.semanticImportQuality.warnings.includes('semantic import expected but empty'));
  const missingEvidence = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'missing-semantic-worker', 'evidence.json'), 'utf8'));
  assert.ok(missingEvidence.semanticImportQuality.warnings.includes('semantic import expected but missing'));

  const coordinatorQuery = JSON.parse(await fs.readFile(path.join(collection.outDir, 'coordinator-query.json'), 'utf8'));
  const queryQualityByJob = new Map(coordinatorQuery.jobs.map((entry) => [entry.jobId, entry.semanticImportQuality]));
  assert.ok(queryQualityByJob.get('empty-semantic-worker').warnings.includes('semantic import expected but empty'));
  assert.ok(queryQualityByJob.get('missing-semantic-worker').warnings.includes('semantic import expected but missing'));
  assert.strictEqual(queryQualityByJob.get('fact-semantic-worker').semanticFacts, 3);
  assert.strictEqual(coordinatorQuery.summary.semanticImportFactCount, 3);
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
