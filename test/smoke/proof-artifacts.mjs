import assert from 'node:assert';
import { collectCodexSwarmRun, continueCodexSwarmLoop, exists, fs, path } from './context.mjs';
import {
  FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE,
  FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_ADMISSION_FILE,
  FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_FILE,
  FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_ROUTE,
  FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE
} from '../../dist/index.js';

export async function testPlaywrightRuntimeProofArtifactCollection({ tmp }, mergeBundle) {
  const runDir = path.join(tmp, 'proof-artifact-collection-run');
  const jobDir = path.join(runDir, 'browser-proof-worker');
  const evidenceDir = path.join(jobDir, 'evidence');
  const proofArtifactPath = path.join(evidenceDir, 'playwright-runtime-proof.json');
  const sourceDir = path.join(tmp, 'proof-artifact-source-parent');
  const sourceMergePath = path.join(sourceDir, 'merge.json');
  const runtimeEvidence = createRuntimeEvidence();
  const builderFields = createBuilderFields(runtimeEvidence);
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.mkdir(sourceDir, { recursive: true });
  await fs.writeFile(sourceMergePath, JSON.stringify({
    ...mergeBundle,
    id: 'html-css-worker-bundle',
    jobId: 'html-css-worker',
    taskId: 'html-css-task',
    queueItemIds: ['html-css-task'],
    status: 'completed',
    mergeReadiness: 'verified-patch',
    disposition: 'needs-port',
    autoMergeable: false,
    changedPaths: ['src/styles.css'],
    evidencePaths: []
  }, null, 2) + '\n');
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
    metadata: {
      proofRoute: { routeNext: FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE, sourceJobId: 'html-css-worker' },
      sourceBundle: { jobId: 'html-css-worker', taskId: 'html-css-task', bucket: 'needs-human-port', mergePath: sourceMergePath }
    }
  }, null, 2) + '\n');

  const collection = await collectCodexSwarmRun({
    run: runDir,
    outDir: path.join(runDir, 'collected'),
    checkStale: false
  });
  assert.strictEqual(collection.summary.proofArtifactCount, 1);
  assert.strictEqual(collection.summary.proofArtifactPassedCount, 1);
  assert.strictEqual(collection.summary.proofArtifactValidatorCandidateCount, 1);
  assert.strictEqual(collection.summary.proofReadmissionCount, 1);
  assert.strictEqual(collection.summary.proofReadmissionAdmittedCount, 1);
  assert.strictEqual(collection.summary.proofReadmissionSourceLinkedCount, 1);
  assert.strictEqual(collection.summary.proofParentAdmissionCount, 1);
  assert.strictEqual(collection.summary.proofParentAdmissionReadyCount, 1);
  assert.strictEqual(collection.summary.proofParentAdmissionBlockedCount, 0);
  assert.strictEqual(collection.summary.proofParentRecheckTaskCount, 1);
  assert.ok(collection.proofArtifactsPath.endsWith(FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE));
  assert.ok(collection.proofParentAdmissionPath.endsWith(FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_ADMISSION_FILE));
  assert.ok(collection.proofParentRecheckBacklogPath.endsWith(FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_FILE));
  assert.ok(await exists(collection.proofArtifactsPath));
  assert.ok(await exists(collection.proofParentAdmissionPath));
  assert.ok(await exists(collection.proofParentRecheckBacklogPath));
  assert.strictEqual(collection.proofReadmission.summary.admitted, 1);
  assert.strictEqual(collection.proofReadmission.summary.sourceLinked, 1);
  assert.strictEqual(collection.proofReadmission.records[0].status, 'admitted');
  assert.strictEqual(collection.proofReadmission.records[0].sourceBundle.jobId, 'html-css-worker');
  assert.strictEqual(collection.proofParentAdmission.summary.readyForParentRecheck, 1);
  assert.strictEqual(collection.proofParentAdmission.records[0].status, 'ready-for-parent-recheck');
  assert.strictEqual(collection.proofParentAdmission.records[0].action, 'recheck-parent-bundle');
  assert.strictEqual(collection.proofParentAdmission.records[0].sourceJobId, 'html-css-worker');
  assert.strictEqual(collection.proofParentAdmission.records[0].resolvedSourceMergePath, sourceMergePath);
  assert.deepStrictEqual(collection.proofParentAdmission.records[0].sourceBundleChangedPaths, ['src/styles.css']);
  assert.strictEqual(collection.proofParentRecheckBacklog.entries.length, 1);
  assert.strictEqual(collection.proofParentRecheckBacklog.entries[0].lane, 'coordinator');
  assert.ok(collection.proofParentRecheckBacklog.entries[0].tags.includes(FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_ROUTE));
  assert.strictEqual(collection.proofParentRecheckBacklog.entries[0].metadata.proofParentAdmission.sourceJobId, 'html-css-worker');
  assert.strictEqual(collection.proofArtifacts.summary.validatorCandidateCount, 1);
  assert.strictEqual(collection.proofArtifacts.records[0].validatorReadiness, 'candidate');
  assert.strictEqual(collection.proofArtifacts.records[0].sourceBundle.jobId, 'html-css-worker');
  assert.strictEqual(collection.proofArtifacts.records[0].runtimeEvidenceBound, true);
  assert.strictEqual(collection.proofArtifacts.records[0].sourcePath, 'src/styles.css');
  assert.deepStrictEqual(collection.proofArtifacts.records[0].languageValidators, ['createCssCascadeRuntimeProof']);
  assert.ok(collection.evidenceIndex.entries.some((entry) =>
    entry.kind === 'playwright-runtime-proof-artifact' &&
    entry.status === 'candidate' &&
    entry.path === proofArtifactPath
  ));
  assert.ok(collection.evidenceIndex.entries.some((entry) =>
    entry.kind === 'playwright-proof-readmission' &&
    entry.status === 'admitted' &&
    entry.path === proofArtifactPath &&
    entry.facets.sourceJobId === 'html-css-worker'
  ));
  assert.ok(collection.evidenceIndex.entries.some((entry) =>
    entry.kind === 'playwright-proof-parent-admission' &&
    entry.status === 'ready-for-parent-recheck' &&
    entry.facets.sourceJobId === 'html-css-worker' &&
    entry.facets.action === 'recheck-parent-bundle'
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
  assert.ok(collection.artifactStore.records.some((record) =>
    record.relativePath === FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_ADMISSION_FILE &&
    record.kind === 'coordinator-index'
  ));
  assert.ok(collection.artifactStore.records.some((record) =>
    record.relativePath === FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_FILE &&
    record.kind === 'coordinator-index'
  ));

  const continuation = await continueCodexSwarmLoop({
    collection: collection.outDir,
    outDir: path.join(tmp, 'proof-parent-recheck-continuation'),
    childBacklogNames: [FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_FILE],
    backlog: { id: 'proof-parent-recheck-base', entries: [] },
    routingPolicy: { id: 'proof-parent-recheck-routing', defaultMode: 'fill' },
    manifest: {
      id: 'proof-parent-recheck-manifest',
      lanes: [{
        id: 'coordinator',
        capabilities: ['semantic-merge.parent-recheck'],
        allowedGlobs: ['src/**', 'agent-runs/**']
      }]
    },
    tasks: { items: [] }
  });
  assert.ok(continuation.childBacklogPaths.includes(collection.proofParentRecheckBacklogPath));
  assert.strictEqual(continuation.summary.childBacklogEntryCount, 1);
  assert.strictEqual(continuation.summary.nextJobLaneCounts.coordinator, 1);
  assert.ok(continuation.nextPlan.jobs.some((job) => job.taskId === collection.proofParentRecheckBacklog.entries[0].taskId));
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
  const base = '.button { color: red; }\n';
  const worker = '@media (min-width: 700px) { .button { color: red; } }\n';
  const output = '@media (min-width: 700px) {\n  .button {\n    color: red;\n  }\n}\n';
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
      base,
      worker,
      head: base,
      output,
      baseSourceText: base,
      workerSourceText: worker,
      headSourceText: base,
      outputSourceText: output,
      scopedCascadeGraphHash: 'hash_scoped_cascade',
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
