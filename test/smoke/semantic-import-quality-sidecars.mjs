import assert from 'node:assert';
import {
  createSemanticImportSidecar,
  summarizeSafeMergeApplyRecord,
  summarizeSemanticMergeAdmission
} from '../../dist/semantic-import-sidecar.js';

export function assertSemanticImportQualitySidecars() {
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

  const semanticMergeAdmission = summarizeSemanticMergeAdmission({
    kind: 'frontier.lang.semanticMergeAdmission',
    id: 'merge-admission:partial',
    candidateId: 'merge-candidate:partial',
    classification: 'safe-with-losses',
    autoMergeable: false,
    conflictKeys: ['region:src/runtime/partial.ts#run'],
    conflictKeyKinds: ['region'],
    reasons: ['Non-blocking loss evidence is present.'],
    evidence: [{ id: 'evidence:partial', status: 'passed' }],
    losses: [{ id: 'loss:partial', severity: 'warning' }],
    metadata: { candidateReadiness: 'ready-with-losses' }
  });
  const safeMergeApply = summarizeSafeMergeApplyRecord({
    kind: 'frontier.lang.jsTsSafeMergeApply',
    id: 'safe-merge-apply:partial',
    candidateId: 'merge-candidate:partial',
    admissionId: 'merge-admission:partial',
    language: 'typescript',
    sourcePath: 'src/runtime/partial.ts',
    status: 'accepted-clean',
    action: 'apply',
    readiness: 'ready',
    applied: true,
    edits: [{ id: 'edit:partial' }],
    operations: [{ id: 'operation:partial' }],
    evidence: [{ id: 'evidence:apply', status: 'passed' }]
  });
  assert.strictEqual(semanticMergeAdmission.classification, 'safe-with-losses');
  assert.strictEqual(semanticMergeAdmission.evidenceStatuses.passed, 1);
  assert.strictEqual(semanticMergeAdmission.lossesBySeverity.warning, 1);
  assert.strictEqual(safeMergeApply.status, 'accepted-clean');
  assert.strictEqual(safeMergeApply.applied, true);
  assert.strictEqual(safeMergeApply.editCount, 1);

  const kernelAdmissionSidecar = createSemanticImportSidecar({
    id: 'kernel-admission-worker',
    taskId: 'kernel-admission-task',
    lane: 'semantic'
  }, [{
    path: 'src/runtime/kernel-admission.ts',
    language: 'typescript',
    status: 'imported',
    bytes: 128,
    semanticMergeAdmission,
    safeMergeApply
  }], {
    selected: [{ path: 'src/runtime/kernel-admission.ts', language: 'typescript' }],
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
  assert.strictEqual(kernelAdmissionSidecar.records[0].semanticMergeAdmission.classification, 'safe-with-losses');
  assert.strictEqual(kernelAdmissionSidecar.records[0].safeMergeApply.status, 'accepted-clean');
  assert.strictEqual(kernelAdmissionSidecar.summary.semanticMergeAdmissions.total, 1);
  assert.strictEqual(kernelAdmissionSidecar.summary.semanticMergeAdmissions.safeWithLosses, 1);
  assert.strictEqual(kernelAdmissionSidecar.summary.semanticMergeAdmissions.byClassification['safe-with-losses'], 1);
  assert.deepStrictEqual(kernelAdmissionSidecar.summary.semanticMergeAdmissions.conflictKeyKinds, ['region']);
  assert.strictEqual(kernelAdmissionSidecar.summary.safeMergeApplies.total, 1);
  assert.strictEqual(kernelAdmissionSidecar.summary.safeMergeApplies.applied, 1);
  assert.strictEqual(kernelAdmissionSidecar.summary.safeMergeApplies.byStatus['accepted-clean'], 1);
}
