import assert from 'node:assert';
import {
  emptySemanticEditProjectionSummary,
  mergeSemanticEditProjectionSummaries,
  summarizeSemanticEditProjection
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
  assert.strictEqual(summary.projectedSourceMatchesWorker, 1);
  const merged = mergeSemanticEditProjectionSummaries([emptySemanticEditProjectionSummary(), summary]);
  assert.strictEqual(merged.editCount, 1);
  assert.strictEqual(merged.replacementBytes, 8);
  assert.strictEqual(merged.empty, false);
}
