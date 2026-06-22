import assert from 'node:assert';
import { collectCodexSwarmRun, exists, fs, path } from './context.mjs';
import {
  cleanEditScriptSemanticImportSummary,
  editScriptSemanticImportSummary,
  factSemanticImportSummary
} from './semantic-import-quality-fixtures.mjs';

export async function testSemanticAdmissionSidecars({ tmp }, mergeBundle) {
  const runDir = path.join(tmp, 'semantic-admission-sidecars-run');
  await writeSemanticSidecarAdmissionJob(runDir, mergeBundle, {
    jobId: 'semantic-sidecar-safe',
    changedPath: 'src/runtime/semantic-sidecar-safe.ts',
    semanticImport: cleanEditScriptSemanticImportSummary(),
    sidecarStatus: 'safe',
    readiness: 'ready',
    action: 'admit',
    risk: 'low',
    reasonCode: 'semantic-sidecar-safe',
    commandsPassed: [{ name: 'semantic-safe-smoke', command: ['node', 'semantic-safe-smoke.mjs'] }]
  });
  await writeSemanticSidecarAdmissionJob(runDir, mergeBundle, {
    jobId: 'semantic-sidecar-review',
    changedPath: 'src/runtime/semantic-sidecar-review.ts',
    semanticImport: {
      ...factSemanticImportSummary(),
      readiness: { 'needs-review': 1 }
    },
    sidecarStatus: 'review',
    readiness: 'needs-review',
    action: 'prioritize',
    risk: 'medium',
    reasonCode: 'semantic-sidecar-review-required'
  });
  await writeSemanticSidecarAdmissionJob(runDir, mergeBundle, {
    jobId: 'semantic-sidecar-conflict',
    changedPath: 'src/runtime/semantic-sidecar-conflict.ts',
    semanticImport: editScriptSemanticImportSummary(),
    sidecarStatus: 'conflict',
    readiness: 'blocked',
    action: 'reject',
    risk: 'high',
    reasonCode: 'semantic-sidecar-symbol-conflict',
    conflictKey: 'region:source#src/runtime/semantic-sidecar-conflict.ts#function#run'
  });

  const collection = await collectCodexSwarmRun({
    run: runDir,
    checkStale: false,
    semanticImportExpected: true,
    outDir: path.join(runDir, 'collected')
  });

  const collectedEntries = Object.values(collection.buckets).flat();
  assert.strictEqual(collectedEntries.length, 3);
  assert.strictEqual(await exists(path.join(collection.outDir, 'run-graph.json')), false);
  assert.strictEqual('runGraph' in collection, false);

  const byJob = new Map(collectedEntries.map((entry) => [entry.jobId, entry]));
  for (const jobId of ['semantic-sidecar-safe', 'semantic-sidecar-review', 'semantic-sidecar-conflict']) {
    const entry = byJob.get(jobId);
    assert.ok(entry);
    assert.ok(entry.bundle.semanticImport);
    assert.strictEqual(typeof entry.bundle.semanticImport, 'object');
  }
}

async function writeSemanticSidecarAdmissionJob(runDir, mergeBundle, input) {
  const jobDir = path.join(runDir, input.jobId);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'changes.patch'), semanticSidecarAdmissionPatch(input.changedPath));
  await fs.writeFile(path.join(jobDir, 'semantic-imports.json'), JSON.stringify(semanticSidecarEvidence(input), null, 2) + '\n');
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: `${input.jobId}-bundle`,
    jobId: input.jobId,
    taskId: `${input.jobId}-task`,
    queueItemIds: [`${input.jobId}-task`],
    status: 'completed',
    mergeReadiness: 'verified-patch',
    disposition: 'auto-mergeable',
    autoMergeable: true,
    changedPaths: [input.changedPath],
    changedRegions: [],
    ownedFilesTouched: [],
    allowedWrites: [input.changedPath],
    ownershipViolations: [],
    patchPath: 'changes.patch',
    patchHash: `${input.jobId}-patch-hash`,
    evidencePaths: ['semantic-imports.json'],
    commandsPassed: input.commandsPassed ?? [],
    commandsFailed: [],
    traceShards: [],
    metadata: { semanticImport: input.semanticImport },
    semanticImport: input.semanticImport,
    reasons: []
  }, null, 2) + '\n');
}

function semanticSidecarEvidence(input) {
  const region = {
    id: `${input.jobId}-region`,
    key: `source#${input.changedPath}#function#run`,
    sourcePath: input.changedPath,
    symbolName: 'run',
    symbolKind: 'function',
    precision: 'exact',
    readiness: input.readiness
  };
  return {
    kind: 'frontier.swarm-codex.semantic-imports',
    version: 1,
    generatedAt: 123,
    jobId: input.jobId,
    taskId: `${input.jobId}-task`,
    records: [{
      path: input.changedPath,
      language: 'typescript',
      status: 'imported',
      importId: `${input.jobId}-import`,
      mergeCandidate: {
        id: `${input.jobId}-candidate`,
        readiness: input.readiness,
        risk: input.risk,
        operationCount: 1,
        mergeable: input.sidecarStatus === 'safe',
        reasons: [input.reasonCode],
        reasonCodes: [input.reasonCode],
        conflictKeys: input.conflictKey ? [input.conflictKey] : []
      },
      semanticSidecar: {
        id: `${input.jobId}-lang-sidecar`,
        readiness: input.readiness,
        ownershipRegions: 1,
        patchHints: 1,
        semanticImportExpectedSatisfied: input.sidecarStatus === 'safe',
        semanticImportExpectedMissingReasonCodes: input.sidecarStatus === 'safe' ? [] : [input.reasonCode],
        sampleOwnershipRegions: [region]
      },
      semanticSlice: {
        id: `${input.jobId}-slice`,
        readiness: input.readiness,
        conflictKeys: input.conflictKey ? [input.conflictKey] : []
      },
      semanticSliceAdmission: {
        id: `${input.jobId}-slice-admission`,
        action: input.action,
        readiness: input.readiness,
        risk: input.risk,
        reviewRequired: input.sidecarStatus !== 'safe',
        reasonCodes: [input.reasonCode],
        mergeScore: {
          schema: 'frontier.lang.semanticMergeScore.v1',
          value: input.sidecarStatus === 'safe' ? 98 : input.sidecarStatus === 'review' ? 54 : 0,
          sortKey: `${input.sidecarStatus}:${input.jobId}`
        }
      }
    }],
    summary: input.semanticImport
  };
}

function semanticSidecarAdmissionPatch(file) {
  return [
    `diff --git a/${file} b/${file}`,
    'index 1111111..2222222 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    '-export const value = 1;',
    '+export const value = 2;',
    ''
  ].join('\n');
}
