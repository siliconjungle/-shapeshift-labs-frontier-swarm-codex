import assert from 'node:assert';
import { collectCodexSwarmRun, execFileP, fs, path, queryCodexSwarmCollection, scoreCodexSwarmPatches } from './context.mjs';
import { summarizeSemanticLineageEvidence } from '../../dist/semantic-import-lineage.js';

export async function testSemanticLineageCollection({ tmp }, mergeBundle) {
  const runDir = path.join(tmp, 'lineage-semantic-run');
  const jobDir = path.join(runDir, 'lineage-worker');
  const semanticImport = lineageSemanticImportSummary();
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'lineage-worker-bundle',
    jobId: 'lineage-worker',
    taskId: 'lineage-task',
    changedPaths: ['src/runtime/moved.ts'],
    evidencePaths: ['semantic-imports.json'],
    patchPath: undefined,
    semanticImport,
    metadata: { semanticImport }
  }, null, 2) + '\n');
  const collection = await collectCodexSwarmRun({
    run: runDir,
    checkStale: false,
    semanticImportExpected: true,
    outDir: path.join(runDir, 'collected')
  });
  assert.strictEqual(collection.compactDashboard.semanticImport.semanticLineageEvents, 1);
  assert.strictEqual(collection.compactDashboard.semanticImport.semanticLineageMoved, 1);
  assert.strictEqual(collection.compactDashboard.semanticImport.semanticLineageNeedsReview, 1);
  const query = await queryCodexSwarmCollection({ collection: collection.outDir, lineage: true, readiness: 'ready-to-port' });
  assert.strictEqual(query.jobs.length, 1);
  assert.strictEqual(query.jobs[0].jobId, 'lineage-worker');
  const cli = new URL('../../dist/cli.js', import.meta.url).pathname;
  const cliCollect = JSON.parse((await execFileP(process.execPath, [
    cli,
    'collect',
    '--run',
    runDir,
    '--outDir',
    path.join(runDir, 'cli-collected'),
    '--semantic-import-expected'
  ])).stdout);
  assert.strictEqual(cliCollect.summary.total, 1);
  assert.strictEqual(cliCollect.semanticImport.semanticLineageEvents, 1);
  assert.strictEqual(cliCollect.buckets, undefined);
  assert.ok(cliCollect.outputs.collection.endsWith('/collection.json'));
  const cliQuery = JSON.parse((await execFileP(process.execPath, [
    cli,
    'query',
    '--collection',
    collection.outDir,
    '--lineage',
    '--readiness',
    'ready-to-port'
  ])).stdout);
  assert.strictEqual(cliQuery.jobs.length, 1);
  const score = await scoreCodexSwarmPatches({ collection: collection.outDir, cwd: tmp, bucket: 'all' });
  assert.strictEqual(score.entries[0].semanticEvidence.semanticLineageEvents, 1);
  assert.strictEqual(score.entries[0].semanticEvidence.semanticLineageMoved, 1);
  assert.ok(score.entries[0].semanticEvidence.reasons.includes('semantic lineage needs review'));
  assertCompactLineageCollectionSignalsStayReviewRequired();
}

function lineageSemanticImportSummary() {
  return {
    total: 1,
    selected: 1,
    eligible: 1,
    imported: 1,
    sourceMapMappingCount: 1,
    semanticIndex: { symbols: 2, facts: 1 },
    semanticSidecars: { ownershipRegions: 1, patchHints: 1 },
    dependencies: { total: 1, predicates: ['calls'] },
    semanticLineage: {
      total: 1,
      inferredEvents: 1,
      moved: 1,
      renamed: 0,
      deleted: 0,
      ambiguous: 0,
      unmatchedAdded: 0,
      unchangedAnchors: 2,
      beforeSymbols: 2,
      afterSymbols: 2,
      readiness: { 'needs-review': 1 },
      eventKinds: ['moved'],
      reasonCodes: ['stable-anchor-moved'],
      reviewRequired: true
    },
    semanticImportExpected: true,
    semanticImportExpectedSatisfied: true,
    semanticImportExpectedMissingReasonCodes: []
  };
}

function assertCompactLineageCollectionSignalsStayReviewRequired() {
  const compact = summarizeSemanticLineageEvidence({
    eventKinds: ['unmatched-added'],
    reasonCodes: ['unmatched-added-anchor-review'],
    needsReview: 4
  });
  assert.strictEqual(compact.inferredEvents, 1);
  assert.strictEqual(compact.unmatchedAdded, 1);
  assert.strictEqual(compact.needsReview, 4);
  assert.strictEqual(compact.reviewRequired, true);
  assert.strictEqual(compact.readiness['needs-review'], 4);
}
