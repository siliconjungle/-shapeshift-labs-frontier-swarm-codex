import assert from 'node:assert';
import { collectCodexSwarmRun, fs, path } from './context.mjs';
import {
  cleanEditScriptSemanticImportSummary,
  editScriptSemanticImportSummary,
  factSemanticImportSummary
} from './semantic-import-quality-fixtures.mjs';

export async function testSemanticAdmissionGates({ tmp }, mergeBundle) {
  const runDir = path.join(tmp, 'semantic-admission-gates-run');
  await writeSemanticAdmissionGateJob(runDir, mergeBundle, {
    jobId: 'semantic-gate-success',
    changedPath: 'src/runtime/semantic-gate-success.ts',
    semanticImport: semanticGateReadySummary()
  });
  await writeSemanticAdmissionGateJob(runDir, mergeBundle, {
    jobId: 'semantic-gate-missing',
    changedPath: 'src/runtime/semantic-gate-missing.ts',
    semanticImport: semanticGateBaseSummary()
  });
  await writeSemanticAdmissionGateJob(runDir, mergeBundle, {
    jobId: 'semantic-conflict-sidecar',
    changedPath: 'src/runtime/semantic-conflict-sidecar.ts',
    semanticImport: semanticGateConflictSummary()
  });
  const evidenceOnlyDir = path.join(runDir, 'semantic-evidence-only');
  await fs.mkdir(evidenceOnlyDir, { recursive: true });
  await fs.writeFile(path.join(evidenceOnlyDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'semantic-evidence-only-bundle',
    jobId: 'semantic-evidence-only',
    taskId: 'semantic-evidence-only-task',
    queueItemIds: ['semantic-evidence-only-task'],
    status: 'failed',
    mergeReadiness: 'blocked',
    disposition: 'blocked',
    autoMergeable: false,
    changedPaths: [],
    patchPath: undefined,
    semanticImport: undefined,
    metadata: {},
    reasons: ['no-source-changes', 'generated-failed-evidence']
  }, null, 2) + '\n');

  const collection = await collectCodexSwarmRun({
    run: runDir,
    checkStale: false,
    semanticImportExpected: true,
    outDir: path.join(runDir, 'collected')
  });

  assert.strictEqual(collection.summary['ready-to-apply'], 1);
  assert.strictEqual(collection.summary['needs-human-port'], 2);
  assert.strictEqual(collection.summary['failed-evidence'], 1);
  assert.strictEqual(collection.summary['rerun-work'], 0);
  assert.ok(await existsCollectedMerge(collection.outDir, 'ready-to-apply', 'semantic-gate-success'));
  assert.ok(await existsCollectedMerge(collection.outDir, 'needs-human-port', 'semantic-gate-missing'));
  assert.ok(await existsCollectedMerge(collection.outDir, 'needs-human-port', 'semantic-conflict-sidecar'));
  assert.ok(await existsCollectedMerge(collection.outDir, 'failed-evidence', 'semantic-evidence-only'));

  const successMerge = await readCollectedMerge(collection.outDir, 'ready-to-apply', 'semantic-gate-success');
  assert.strictEqual(successMerge.disposition, 'auto-mergeable');
  assert.strictEqual(successMerge.autoMergeable, true);
  const missingMerge = await readCollectedMerge(collection.outDir, 'needs-human-port', 'semantic-gate-missing');
  assert.strictEqual(missingMerge.autoMergeable, false);
  assert.ok(missingMerge.reasons.includes('auto-merge candidate missing explicit semantic edit gate success'));
  const conflictMerge = await readCollectedMerge(collection.outDir, 'needs-human-port', 'semantic-conflict-sidecar');
  assert.strictEqual(conflictMerge.autoMergeable, false);
  assert.ok(conflictMerge.reasons.includes('semantic edit script conflicts: 1'));

  const evidenceIndex = JSON.parse(await fs.readFile(path.join(collection.outDir, 'evidence-index.json'), 'utf8'));
  const entriesByJob = new Map(evidenceIndex.entries.filter((entry) => entry.topic === 'merge-admission').map((entry) => [entry.jobId, entry]));
  assert.strictEqual(entriesByJob.get('semantic-gate-success').facets.semanticCollectAdmissionStatus, 'ready');
  assert.strictEqual(entriesByJob.get('semantic-gate-success').facets.semanticCollectAdmissionGatePassed, true);
  assert.strictEqual(entriesByJob.get('semantic-gate-missing').facets.semanticCollectAdmissionStatus, 'review');
  assert.strictEqual(entriesByJob.get('semantic-conflict-sidecar').facets.semanticCollectAdmissionStatus, 'review');
  assert.strictEqual(entriesByJob.get('semantic-evidence-only').facets.semanticCollectAdmissionStatus, 'not-applicable');

  const outcomesByJob = new Map(collection.queueOutcomeModel.decisions.map((decision) => [decision.jobId, decision]));
  assert.strictEqual(outcomesByJob.get('semantic-gate-success').decision, 'ready');
  assert.strictEqual(outcomesByJob.get('semantic-gate-success').outcome, 'continued');
  assert.strictEqual(outcomesByJob.get('semantic-gate-missing').outcome, 'needs-port');
  assert.strictEqual(outcomesByJob.get('semantic-conflict-sidecar').category, 'conflict');
  assert.strictEqual(outcomesByJob.get('semantic-conflict-sidecar').outcome, 'conflict-blocked');
  assert.strictEqual(outcomesByJob.get('semantic-evidence-only').category, 'terminal');
  assert.strictEqual(outcomesByJob.get('semantic-evidence-only').outcome, 'no-change');
}

async function writeSemanticAdmissionGateJob(runDir, mergeBundle, input) {
  const jobDir = path.join(runDir, input.jobId);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'changes.patch'), semanticGatePatch(input.changedPath));
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
    patchPath: 'changes.patch',
    evidencePaths: ['semantic-imports.json'],
    semanticImport: input.semanticImport,
    metadata: { semanticImport: input.semanticImport },
    reasons: []
  }, null, 2) + '\n');
}

function semanticGateReadySummary() {
  const summary = semanticGateBaseSummary(cleanEditScriptSemanticImportSummary());
  return {
    ...summary,
    semanticEditProjections: {
      ...summary.semanticEditProjections,
      total: 1,
      autoMergeCandidates: 1,
      appliedOperations: 1,
      skippedOperations: 0,
      admission: { ...summary.semanticEditProjections.admission, 'auto-merge-candidate': 1 },
      statusCounts: { projected: 1 },
      empty: false
    }
  };
}

function semanticGateConflictSummary() {
  return semanticGateBaseSummary(editScriptSemanticImportSummary());
}

function semanticGateBaseSummary(summary = factSemanticImportSummary()) {
  return {
    ...summary,
    lossCount: 0,
    lossesBySeverity: {},
    universalAstLayers: { total: 1, names: ['program'], ids: ['layer:program'], byName: { program: 1 }, empty: false },
    proofSpec: { total: 1, obligations: 1, discharged: 1, failed: 0, stale: 0, open: 0, unknown: 0 },
    sourceProjections: { total: 1, preserved: 1, stubs: 0, ready: 1, needsReview: 0, blocked: 0 },
    nativeCompiles: { total: 1, emitted: 1, preserved: 1, targetStubs: 0, ready: 1, needsReview: 0, blocked: 0 },
    semanticSliceAdmissions: { total: 1, admitted: 1, prioritized: 1, rejected: 0, averageScore: 1, byAction: { admit: 1 }, byRisk: { low: 1 } },
    readiness: { ready: 1 }
  };
}

function semanticGatePatch(file) {
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

async function existsCollectedMerge(outDir, bucket, jobId) {
  try {
    await fs.access(path.join(outDir, bucket, jobId, 'merge.json'));
    return true;
  } catch {
    return false;
  }
}

async function readCollectedMerge(outDir, bucket, jobId) {
  return JSON.parse(await fs.readFile(path.join(outDir, bucket, jobId, 'merge.json'), 'utf8'));
}
