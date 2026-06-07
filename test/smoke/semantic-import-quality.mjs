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
  const collection = await collectCodexSwarmRun({
    run: runDir,
    checkStale: false,
    semanticImportExpected: true,
    outDir: path.join(runDir, 'collected')
  });
  const semanticImport = collection.compactDashboard.semanticImport;
  const topQuality = collection.compactDashboard.topJobs[0].semanticImportQuality;
  assert.strictEqual(semanticImport.expectedUnsatisfiedCount, 1);
  assert.ok(semanticImport.expectedMissingReasonCodes.includes('expected-semantic-import-empty'));
  assert.strictEqual(topQuality.expectedSatisfied, false);
  assert.ok(topQuality.expectedMissingReasonCodes.includes('expected-semantic-import-empty'));
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
