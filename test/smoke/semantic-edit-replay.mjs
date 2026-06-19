import assert from 'node:assert';
import {
  emptySemanticEditReplaySummary,
  mergeSemanticEditReplaySummaries,
  summarizeSemanticEditReplay
} from '../../dist/index.js';

export async function testSemanticEditReplaySummary() {
  const summary = summarizeSemanticEditReplay({
    kind: 'frontier.lang.semanticEditReplay',
    status: 'accepted-clean',
    currentHash: 'hash:current',
    outputHash: 'hash:output',
    admission: { status: 'accepted-clean', action: 'apply' },
    appliedOperations: ['edit-run'],
    skippedOperations: [],
    summary: { edits: 1, applied: 1, alreadyApplied: 0, conflicts: 0, stale: 0, blocked: 0 },
    edits: [{
      operationId: 'edit-run',
      status: 'applied',
      semanticKey: 'semantic-edit:replaceBody:modified:function:run',
      semanticIdentityHash: 'hash:semantic-identity',
      sourceIdentityHash: 'hash:source-identity',
      editContentHash: 'hash:edit-content',
      sourcePath: 'src/runtime.ts',
      symbolName: 'run'
    }]
  });
  assert.strictEqual(summary.acceptedClean, 1);
  assert.strictEqual(summary.editCount, 1);
  assert.strictEqual(summary.appliedEditCount, 1);
  assert.deepStrictEqual(summary.operationIds, ['edit-run']);
  assert.deepStrictEqual(summary.semanticKeys, ['semantic-edit:replaceBody:modified:function:run']);
  assert.deepStrictEqual(summary.currentHashes, ['hash:current']);
  assert.deepStrictEqual(summary.outputHashes, ['hash:output']);
  const conflict = summarizeSemanticEditReplay({
    kind: 'frontier.lang.semanticEditReplay',
    status: 'conflict',
    edits: [{ status: 'conflict', reasonCodes: ['current-symbol-anchor-content-mismatch'] }],
    admission: { status: 'conflict', reasonCodes: ['current-symbol-anchor-content-mismatch'] }
  });
  const merged = mergeSemanticEditReplaySummaries([emptySemanticEditReplaySummary(), summary, conflict]);
  assert.strictEqual(merged.total, 2);
  assert.strictEqual(merged.acceptedClean, 1);
  assert.strictEqual(merged.conflicts, 1);
  assert.deepStrictEqual(merged.reasonCodes, ['current-symbol-anchor-content-mismatch']);
}
