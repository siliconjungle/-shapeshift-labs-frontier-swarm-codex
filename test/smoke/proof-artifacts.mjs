import assert from 'node:assert';
import { collectCodexSwarmRun, exists, fs, path } from './context.mjs';
import {
  FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE,
  FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE
} from '../../dist/index.js';

export async function testPlaywrightRuntimeProofArtifactCollection({ tmp }, mergeBundle) {
  const runDir = path.join(tmp, 'proof-artifact-collection-run');
  const jobDir = path.join(runDir, 'browser-proof-worker');
  const evidenceDir = path.join(jobDir, 'evidence');
  const proofArtifactPath = path.join(evidenceDir, 'playwright-runtime-proof.json');
  const runtimeEvidence = createRuntimeEvidence();
  const builderFields = createBuilderFields(runtimeEvidence);
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(proofArtifactPath, JSON.stringify(createProofArtifact(runtimeEvidence, builderFields), null, 2) + '\n');
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'browser-proof-worker-bundle',
    jobId: 'browser-proof-worker',
    taskId: 'browser-proof-task',
    queueItemIds: ['browser-proof-task'],
    lane: 'browser',
    status: 'completed',
    mergeReadiness: 'evidence-only',
    disposition: 'evidence-only',
    autoMergeable: false,
    changedPaths: [],
    evidencePaths: [proofArtifactPath],
    commandsPassed: [{ name: 'playwright proof', command: ['node', 'proof.mjs'], status: 0 }],
    metadata: { proofRoute: { routeNext: FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE, sourceJobId: 'html-css-worker' } }
  }, null, 2) + '\n');

  const collection = await collectCodexSwarmRun({
    run: runDir,
    outDir: path.join(runDir, 'collected'),
    checkStale: false
  });
  assert.strictEqual(collection.summary.proofArtifactCount, 1);
  assert.strictEqual(collection.summary.proofArtifactPassedCount, 1);
  assert.strictEqual(collection.summary.proofArtifactValidatorCandidateCount, 1);
  assert.ok(collection.proofArtifactsPath.endsWith(FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE));
  assert.ok(await exists(collection.proofArtifactsPath));
  assert.strictEqual(collection.proofArtifacts.summary.validatorCandidateCount, 1);
  assert.strictEqual(collection.proofArtifacts.records[0].validatorReadiness, 'candidate');
  assert.strictEqual(collection.proofArtifacts.records[0].runtimeEvidenceBound, true);
  assert.strictEqual(collection.proofArtifacts.records[0].sourcePath, 'src/styles.css');
  assert.deepStrictEqual(collection.proofArtifacts.records[0].languageValidators, ['createCssCascadeRuntimeProof']);
  assert.ok(collection.evidenceIndex.entries.some((entry) =>
    entry.kind === 'playwright-runtime-proof-artifact' &&
    entry.status === 'candidate' &&
    entry.path === proofArtifactPath
  ));
  assert.ok(collection.artifactStore.records.some((record) =>
    record.path === proofArtifactPath &&
    record.kind === 'playwright-runtime-proof-artifact' &&
    record.tags.includes('runtime-evidence-bound')
  ));
  assert.ok(collection.artifactStore.records.some((record) =>
    record.relativePath === FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE &&
    record.kind === 'coordinator-index'
  ));
}

function createRuntimeEvidence() {
  return {
    kind: 'frontier.playwright.runtime-proof-evidence',
    version: 1,
    status: 'passed',
    runtimeCommand: 'playwright test css-cascade-runtime.spec.ts',
    runtimeProbeId: 'css:button:media-cascade',
    runtimeEvidenceHash: 'fnv1a32:runtimeproof',
    runtimeSignals: ['css-cascade-runtime'],
    evidenceHashInputKind: 'provided',
    runtimeEvidenceBound: true,
    browserRuntimeEquivalenceClaim: false,
    browserCascadeEquivalenceClaim: false,
    browserRenderEquivalenceClaim: false,
    semanticEquivalenceClaim: false,
    autoMergeClaim: false,
    evidence: {
      command: 'playwright test css-cascade-runtime.spec.ts',
      probeId: 'css:button:media-cascade',
      evidenceHash: 'fnv1a32:runtimeproof',
      signals: ['css-cascade-runtime']
    }
  };
}

function createBuilderFields(runtimeEvidence) {
  return {
    runtimeCommand: runtimeEvidence.runtimeCommand,
    runtimeProbeId: runtimeEvidence.runtimeProbeId,
    runtimeEvidenceHash: runtimeEvidence.runtimeEvidenceHash,
    runtimeSignals: runtimeEvidence.runtimeSignals,
    runtimeEvidence: runtimeEvidence.evidence,
    runtimeEvidenceBound: true,
    browserRuntimeEquivalenceClaim: false,
    browserCascadeEquivalenceClaim: false,
    browserRenderEquivalenceClaim: false,
    semanticEquivalenceClaim: false,
    autoMergeClaim: false
  };
}

function createProofArtifact(runtimeEvidence, builderFields) {
  return {
    kind: 'frontier.playwright.runtime-proof-artifact',
    version: 1,
    id: 'proof-artifact-1',
    generatedAt: 123,
    status: 'passed',
    runKind: 'frontier.playwright.assertion-runtime-proof-run',
    runId: 'proof-run',
    proofRunId: 'proof-run-1',
    runtimeEvidence,
    builderFields,
    proofBuilderInput: {
      sourcePath: 'src/styles.css',
      reasonCode: 'css-atrule-new-scope-unsupported',
      side: 'worker',
      shapeKey: 'at-rule:media::(min-width: 700px)',
      workerSourceText: '@media (min-width: 700px) { .button { color: red; } }\n',
      outputSourceText: '@media (min-width: 700px) { .button { color: red; } }\n',
      ...builderFields
    },
    sourceTextHashes: { worker: 'fnv1a32:worker', output: 'fnv1a32:output' },
    assertions: [{
      id: 'button-color',
      kind: 'computed-style',
      status: 'passed',
      selector: 'button[data-action]',
      property: 'color',
      expected: 'rgb(255, 0, 0)',
      actual: 'rgb(255, 0, 0)'
    }],
    runtimeEvidenceBound: true,
    browserRuntimeEquivalenceClaim: false,
    browserCascadeEquivalenceClaim: false,
    browserRenderEquivalenceClaim: false,
    semanticEquivalenceClaim: false,
    autoMergeClaim: false
  };
}
