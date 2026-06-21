import assert from 'node:assert';
import { pathToFileURL } from 'node:url';
import {
  summarizeJsTsSafeMergeApply,
  summarizeKernelSafeMergeRecord,
  summarizeKernelSafeMergeRecords,
  summarizeSemanticMergeAdmission
} from '../../dist/semantic-merge-admission.js';

export async function testSemanticMergeAdmissionSummaries() {
  const safe = summarizeSemanticMergeAdmission({
    kind: 'frontier.lang.semanticMergeAdmission',
    version: 1,
    id: 'admission_safe',
    candidateId: 'candidate_safe',
    classification: 'safe',
    autoMergeable: true,
    conflictKeys: ['symbol:step'],
    conflictKeyKinds: ['symbol'],
    evidence: [{ id: 'evidence_tests', kind: 'test', status: 'passed', reasonCodes: ['focused-tests'] }],
    losses: [],
    reasons: ['Stable conflict key and passed replay evidence.']
  });
  assert.strictEqual(safe.status, 'safe');
  assert.strictEqual(safe.autoMergeable, true);
  assert.strictEqual(safe.safe, true);
  assert.strictEqual(safe.reviewRequired, false);
  assert.strictEqual(safe.blocked, false);
  assert.strictEqual(safe.conflictKeys, 1);
  assert.deepStrictEqual(safe.conflictKeyKinds, ['symbol']);
  assert.strictEqual(safe.passedEvidence, 1);
  assert.deepStrictEqual(safe.reasonCodes, ['focused-tests']);

  const safeWithLosses = summarizeSemanticMergeAdmission({
    semanticMergeAdmission: {
      classification: 'safe-with-losses',
      autoMergeable: false,
      conflictKeys: ['native:src/runtime.ts:1:1:1:20:node_step'],
      evidence: [{ id: 'evidence_review_note', status: 'passed' }],
      losses: [{ id: 'loss_comment_trivia', severity: 'warning', reasonCodes: ['comment-trivia-loss'] }]
    }
  });
  assert.strictEqual(safeWithLosses.status, 'safe-with-losses');
  assert.strictEqual(safeWithLosses.safe, true);
  assert.strictEqual(safeWithLosses.autoMergeable, false);
  assert.strictEqual(safeWithLosses.losses, 1);
  assert.strictEqual(safeWithLosses.blockingLosses, 0);
  assert.strictEqual(safeWithLosses.nonBlockingLosses, 1);
  assert.deepStrictEqual(safeWithLosses.conflictKeyKinds, ['native-span']);

  const reviewRequired = summarizeSemanticMergeAdmission({
    kind: 'frontier.lang.semanticMergeAdmission',
    classification: 'review-required',
    conflictKeys: [],
    evidence: [{ id: 'evidence_unknown', status: 'unknown' }],
    reasons: ['Candidate has no stable semantic merge conflict keys.']
  });
  assert.strictEqual(reviewRequired.status, 'review-required');
  assert.strictEqual(reviewRequired.reviewRequired, true);
  assert.strictEqual(reviewRequired.unknownEvidence, 1);
  assert.deepStrictEqual(reviewRequired.reasons, ['Candidate has no stable semantic merge conflict keys.']);

  const blocked = summarizeSemanticMergeAdmission({
    kind: 'frontier.lang.semanticMergeAdmission',
    classification: 'safe',
    autoMergeable: true,
    evidence: [{ id: 'evidence_replay', status: 'failed', reasons: ['replay failed'] }],
    losses: [{ id: 'loss_parse', severity: 'error' }]
  });
  assert.strictEqual(blocked.status, 'blocked');
  assert.strictEqual(blocked.blocked, true);
  assert.strictEqual(blocked.safe, false);
  assert.strictEqual(blocked.failedEvidence, 1);
  assert.strictEqual(blocked.blockingLosses, 1);

  const safeApply = summarizeJsTsSafeMergeApply({
    kind: 'frontier.lang.jsTsSafeMergeApply',
    id: 'apply_clean',
    status: 'safe-apply',
    action: 'apply',
    autoApplyCandidate: true,
    edits: [{ status: 'applied', operationId: 'op_step', semanticKey: 'semantic-edit:replaceBody:function:step', sourcePath: 'src/runtime.ts' }],
    evidence: [{ id: 'gate_smoke', kind: 'test', status: 'passed' }]
  });
  assert.strictEqual(safeApply.status, 'safe-apply');
  assert.strictEqual(safeApply.safeToApply, true);
  assert.strictEqual(safeApply.autoApplyCandidate, true);
  assert.strictEqual(safeApply.applied, 1);
  assert.deepStrictEqual(safeApply.operationIds, ['op_step']);
  assert.deepStrictEqual(safeApply.semanticKeys, ['semantic-edit:replaceBody:function:step']);
  assert.deepStrictEqual(safeApply.sourcePaths, ['src/runtime.ts']);

  const noOp = summarizeJsTsSafeMergeApply({
    kind: 'frontier.lang.semanticEditReplay',
    status: 'already-applied',
    admission: { action: 'skip' },
    summary: { edits: 1, alreadyApplied: 1 },
    edits: [{ status: 'already-applied', operationId: 'op_done' }]
  });
  assert.strictEqual(noOp.status, 'no-op');
  assert.strictEqual(noOp.noOp, true);
  assert.strictEqual(noOp.safeToApply, false);
  assert.strictEqual(noOp.alreadyApplied, 1);

  const stale = summarizeJsTsSafeMergeApply({
    jsTsSafeMergeApply: {
      status: 'stale',
      action: 'rerun-semantic-import',
      edits: [{ status: 'stale', reasonCodes: ['current-source-hash-mismatch'] }]
    }
  });
  assert.strictEqual(stale.status, 'stale');
  assert.strictEqual(stale.stale, true);
  assert.strictEqual(stale.staleEdits, 1);
  assert.deepStrictEqual(stale.reasonCodes, ['current-source-hash-mismatch']);

  const applyReviewRequired = summarizeJsTsSafeMergeApply({
    kind: 'frontier.lang.jsTsSafeMergeApply',
    status: 'review-required',
    admission: { reviewRequired: true, action: 'human-review' },
    edits: [{ status: 'conflict', reasonCodes: ['overlapping-anchor'] }]
  });
  assert.strictEqual(applyReviewRequired.status, 'blocked-evidence');
  assert.strictEqual(applyReviewRequired.blocked, true);
  assert.strictEqual(applyReviewRequired.conflicts, 1);

  const explicitReviewRequired = summarizeJsTsSafeMergeApply({
    status: 'review-required',
    admission: { reviewRequired: true, action: 'human-review' },
    summary: { edits: 1, reasonCodes: ['manual-review'] }
  });
  assert.strictEqual(explicitReviewRequired.status, 'review-required');
  assert.strictEqual(explicitReviewRequired.reviewRequired, true);
  assert.deepStrictEqual(explicitReviewRequired.reasonCodes, ['manual-review']);

  const blockedEvidence = summarizeJsTsSafeMergeApply({
    kind: 'frontier.lang.jsTsSafeMergeApply',
    status: 'safe-apply',
    evidence: [{ id: 'gate_typecheck', kind: 'test', status: 'failed', reasonCodes: ['typecheck-failed'] }]
  });
  assert.strictEqual(blockedEvidence.status, 'blocked-evidence');
  assert.strictEqual(blockedEvidence.blocked, true);
  assert.strictEqual(blockedEvidence.failedEvidence, 1);
  assert.deepStrictEqual(blockedEvidence.reasonCodes, ['typecheck-failed']);

  assert.strictEqual(summarizeKernelSafeMergeRecord({ semanticMergeAdmission: { classification: 'safe', autoMergeable: true } }).recordKind, 'semantic-merge-admission');
  assert.strictEqual(summarizeKernelSafeMergeRecord({ jsTsSafeMergeApply: { status: 'no-op' } }).recordKind, 'js-ts-safe-merge-apply');
  assert.deepStrictEqual(
    summarizeKernelSafeMergeRecords([
      { semanticMergeAdmission: { classification: 'safe', autoMergeable: true } },
      { jsTsSafeMergeApply: { status: 'no-op' } },
      { notKernelSafeMerge: true }
    ]).map((entry) => entry.recordKind),
    ['semantic-merge-admission', 'js-ts-safe-merge-apply']
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await testSemanticMergeAdmissionSummaries();
}
