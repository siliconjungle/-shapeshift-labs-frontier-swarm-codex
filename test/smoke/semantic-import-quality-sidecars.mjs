import assert from 'node:assert';
import { createSemanticImportSidecar } from '../../dist/semantic-import-sidecar.js';

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
}
