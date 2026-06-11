import assert from 'node:assert';
import {
  emptySemanticEditProjectionSummary,
  mergeSemanticEditProjectionSummaries,
  summarizeSemanticEditProjection,
  summarizeSemanticEditScript
} from '../../dist/index.js';

export async function testSemanticEditProjectionSummary() {
  const summary = summarizeSemanticEditProjection({
    kind: 'frontier.lang.semanticEditProjection',
    status: 'projected',
    projectedHash: 'hash:worker',
    workerHash: 'hash:worker',
    admission: { status: 'auto-merge-candidate' },
    appliedOperations: 1,
    skippedOperations: 0,
    edits: [{
      operationId: 'edit-run',
      status: 'applied',
      headStart: 10,
      headEnd: 14,
      workerStart: 10,
      workerEnd: 18,
      anchorKey: 'source#src/runtime.ts#function#run',
      conflictKey: 'region:source#src/runtime.ts#function#run',
      symbolName: 'run',
      sourcePath: 'src/runtime.ts',
      semanticKey: 'semantic-edit:replaceBody:modified:function:run',
      semanticIdentityHash: 'hash:semantic-identity',
      sourceIdentityHash: 'hash:source-identity',
      operationContentHash: 'hash:operation-content',
      editContentHash: 'hash:edit-content',
      semanticTransformKey: 'transform:javascript:rust:run',
      semanticTransformIdentityHash: 'hash:transform-identity',
      semanticTransformContentHash: 'hash:transform-content',
      projectionIdentityHash: 'hash:projection-identity',
      sourceLanguage: 'javascript',
      targetLanguage: 'rust',
      targetPath: 'src/runtime.rs',
      deletedBytes: 4,
      replacementBytes: 8,
      replacementTextHash: 'hash:replacement'
    }]
  });
  assert.strictEqual(summary.total, 1);
  assert.strictEqual(summary.projected, 1);
  assert.strictEqual(summary.editCount, 1);
  assert.strictEqual(summary.appliedEditCount, 1);
  assert.strictEqual(summary.alreadyAppliedEditCount, 0);
  assert.strictEqual(summary.deletedBytes, 4);
  assert.strictEqual(summary.replacementBytes, 8);
  assert.deepStrictEqual(summary.anchorKeys, ['source#src/runtime.ts#function#run']);
  assert.deepStrictEqual(summary.conflictKeys, ['region:source#src/runtime.ts#function#run']);
  assert.deepStrictEqual(summary.symbolNames, ['run']);
  assert.deepStrictEqual(summary.sourcePaths, ['src/runtime.ts']);
  assert.deepStrictEqual(summary.semanticKeys, ['semantic-edit:replaceBody:modified:function:run']);
  assert.deepStrictEqual(summary.semanticIdentityHashes, ['hash:semantic-identity']);
  assert.deepStrictEqual(summary.sourceIdentityHashes, ['hash:source-identity']);
  assert.deepStrictEqual(summary.operationContentHashes, ['hash:operation-content']);
  assert.deepStrictEqual(summary.editContentHashes, ['hash:edit-content']);
  assert.deepStrictEqual(summary.semanticTransformKeys, ['transform:javascript:rust:run']);
  assert.deepStrictEqual(summary.semanticTransformIdentityHashes, ['hash:transform-identity']);
  assert.deepStrictEqual(summary.semanticTransformContentHashes, ['hash:transform-content']);
  assert.deepStrictEqual(summary.projectionIdentityHashes, ['hash:projection-identity']);
  assert.deepStrictEqual(summary.transformSourceLanguages, ['javascript']);
  assert.deepStrictEqual(summary.transformTargetLanguages, ['rust']);
  assert.deepStrictEqual(summary.transformTargetPaths, ['src/runtime.rs']);
  assert.strictEqual(summary.projectedSourceMatchesWorker, 1);
  const merged = mergeSemanticEditProjectionSummaries([emptySemanticEditProjectionSummary(), summary]);
  assert.strictEqual(merged.editCount, 1);
  assert.strictEqual(merged.replacementBytes, 8);
  assert.deepStrictEqual(merged.anchorKeys, ['source#src/runtime.ts#function#run']);
  assert.deepStrictEqual(merged.semanticKeys, ['semantic-edit:replaceBody:modified:function:run']);
  assert.deepStrictEqual(merged.semanticTransformContentHashes, ['hash:transform-content']);
  assert.strictEqual(merged.empty, false);
  const scriptSummary = summarizeSemanticEditScript({
    kind: 'frontier.lang.semanticEditScript',
    operations: [{
      kind: 'replaceBody',
      status: 'portable',
      semanticKey: 'semantic-edit:replaceBody:modified:function:run',
      semanticIdentityHash: 'hash:semantic-identity',
      sourceIdentityHash: 'hash:source-identity',
      operationContentHash: 'hash:operation-content'
    }]
  });
  assert.deepStrictEqual(scriptSummary.semanticKeys, ['semantic-edit:replaceBody:modified:function:run']);
  assert.deepStrictEqual(scriptSummary.operationContentHashes, ['hash:operation-content']);
}
