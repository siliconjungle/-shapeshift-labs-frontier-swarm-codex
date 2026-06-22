import assert from 'node:assert';
import {
  applyCodexSwarmCollection,
  execFileP,
  fs,
  path,
  scoreCodexSwarmPatches
} from './context.mjs';
import { testStrictAdmissionRejectsMissingQueueOutcome } from './apply-admission.mjs';
import { assertApplyEvidence } from './apply-evidence.mjs';
import { readySemanticImport } from './apply-score-fixtures.mjs';
import { testWeakSemanticAdmissionScore } from './apply-score-semantic.mjs';

export async function testApplyAndScore({ tmp }, mergeBundle) {
  const applyRepo = path.join(tmp, 'apply-repo');
  await fs.mkdir(path.join(applyRepo, 'src'), { recursive: true });
  await fs.writeFile(path.join(applyRepo, 'src', 'apply.ts'), 'old\n');
  await execFileP('git', ['init'], { cwd: applyRepo });
  const readyDir = path.join(tmp, 'ready-collection', 'ready-to-apply', 'apply-job');
  await fs.mkdir(readyDir, { recursive: true });
  await fs.writeFile(path.join(readyDir, 'changes.patch'), [
    'diff --git a/src/apply.ts b/src/apply.ts',
    '--- a/src/apply.ts',
    '+++ b/src/apply.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(readyDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    jobId: 'apply-job',
    taskId: 'apply-task',
    status: 'verified',
    mergeReadiness: 'verified-patch',
    disposition: 'auto-mergeable',
    riskLevel: 'low',
    autoMergeable: true,
    changedPaths: ['src/apply.ts'],
    changedRegions: [],
    ownedFilesTouched: ['src/apply.ts'],
    patchPath: 'changes.patch',
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds: ['apply-task'],
    staleAgainstHead: false,
    semanticImport: readySemanticImport,
    metadata: { ...mergeBundle.metadata, semanticImport: readySemanticImport },
    reasons: []
  }, null, 2) + '\n');
  await writeReadyQueueOutcomeModel(path.join(tmp, 'ready-collection'), readyDir);

  const applyDryRun = await applyCodexSwarmCollection({ collection: path.join(tmp, 'ready-collection'), cwd: applyRepo });
  assert.strictEqual(applyDryRun.ok, true);
  assert.strictEqual(applyDryRun.dryRun, true);
  assert.strictEqual(applyDryRun.summary.checked, 1);
  assert.strictEqual(applyDryRun.entries[0].dryRun, true);
  assert.strictEqual(applyDryRun.admission.mode, 'strict');
  assert.strictEqual(applyDryRun.admission.accepted, 1);
  assert.strictEqual(applyDryRun.entries[0].admission.status, 'accepted');
  assert.ok(applyDryRun.entries[0].semanticLease.granted);
  assert.strictEqual(applyDryRun.entries[0].semanticLease.fence.ok, true);
  await assertApplyEvidence(applyDryRun, { gateKinds: ['git-apply-check'], decisions: ['record-only'] });
  assert.strictEqual(await fs.readFile(path.join(applyRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
  await testStrictAdmissionRejectsMissingQueueOutcome(applyRepo, tmp, readyDir);
  await testScore(applyRepo, tmp);
  await testScoreIndexOnlyCollection(applyRepo, tmp, readyDir);
  await testScoreDedupesCollectedAndIndexedBundle(applyRepo, tmp, readyDir);
  await testMissingSemanticScore(applyRepo, tmp, readyDir);
  await testWeakSemanticAdmissionScore({ applyRepo, tmp, readyDir, readySemanticImport });
  await assert.rejects(
    () => applyCodexSwarmCollection({ collection: path.join(tmp, 'ready-collection'), cwd: applyRepo, dryRun: false }),
    /dirty worktree/
  );
  await testCommitApply(tmp);
  await testScoreCalibration(applyRepo, tmp);
}

async function writeReadyQueueOutcomeModel(collectionDir, readyDir) {
  const queueOutcomeModel = {
    kind: 'frontier.swarm.queue-outcome-model',
    version: 1,
    id: 'queue-outcome-model:apply-test',
    generatedAt: Date.now(),
    decisions: [{
      id: 'queue-decision:apply-job-ready',
      subjectId: 'apply-task',
      subjectAliases: ['apply-job', 'job:apply-job', 'apply-task', 'task:apply-task', 'queue:apply-task'],
      jobId: 'apply-job',
      taskId: 'apply-task',
      queueItemIds: ['apply-task'],
      category: 'continuation',
      outcome: 'ready',
      decision: 'ready',
      terminal: false,
      closesSubject: false,
      coordinatorReview: false,
      humanBlocked: false,
      staleOrRerun: false,
      conflict: false,
      reviewDebt: false,
      reasons: ['ready-to-apply'],
      conflictingJobIds: [],
      generatedAt: Date.now()
    }],
    subjects: [],
    latestDecisions: [],
    supersededDecisions: [],
    visibleReviewDebt: [],
    visibleHumanBlockers: [],
    visibleReruns: [],
    visibleConflicts: [],
    bySubjectId: {},
    subjectIdByAlias: {},
    latestDecisionIdByAlias: {}
  };
  await fs.writeFile(path.join(collectionDir, 'queue-outcome-model.json'), JSON.stringify(queueOutcomeModel, null, 2) + '\n');
  await fs.writeFile(path.join(collectionDir, 'collection.json'), JSON.stringify({
    buckets: {
      'ready-to-apply': [{
        bucket: 'ready-to-apply',
        jobId: 'apply-job',
        mergePath: path.join(readyDir, 'merge.json'),
        outputDir: readyDir
      }],
      'research-complete': [],
      'needs-human-port': [],
      'rerun-work': [],
      'failed-evidence': [],
      'stale-against-head': []
    },
    queueOutcomeModel
  }, null, 2) + '\n');
}

async function testScoreIndexOnlyCollection(applyRepo, tmp, readyDir) {
  const indexOnlyCollection = path.join(tmp, 'index-only-collection');
  await fs.mkdir(indexOnlyCollection, { recursive: true });
  await fs.writeFile(path.join(indexOnlyCollection, 'collection.json'), JSON.stringify({
    buckets: {
      'ready-to-apply': [{
        bucket: 'ready-to-apply',
        jobId: 'apply-job',
        mergePath: path.join(readyDir, 'merge.json'),
        outputDir: readyDir
      }],
      'needs-human-port': [],
      'failed-evidence': [],
      'stale-against-head': []
    }
  }, null, 2) + '\n');
  const indexOnlyScore = await scoreCodexSwarmPatches({
    collection: indexOnlyCollection,
    cwd: applyRepo,
    workspaceIncludes: ['src']
  });
  assert.strictEqual(indexOnlyScore.summary.total, 1);
  assert.strictEqual(indexOnlyScore.summary['accepted-clean'], 1);
}

async function testScoreDedupesCollectedAndIndexedBundle(applyRepo, tmp, readyDir) {
  const mixedCollection = path.join(tmp, 'mixed-score-collection');
  const copiedDir = path.join(mixedCollection, 'ready-to-apply', 'apply-job');
  await fs.mkdir(copiedDir, { recursive: true });
  await fs.copyFile(path.join(readyDir, 'changes.patch'), path.join(copiedDir, 'changes.patch'));
  await fs.copyFile(path.join(readyDir, 'merge.json'), path.join(copiedDir, 'merge.json'));
  await fs.writeFile(path.join(mixedCollection, 'collection.json'), JSON.stringify({
    buckets: {
      'ready-to-apply': [{
        bucket: 'ready-to-apply',
        jobId: 'apply-job',
        mergePath: path.join(readyDir, 'merge.json'),
        outputDir: readyDir
      }],
      'needs-human-port': [],
      'failed-evidence': [],
      'stale-against-head': []
    }
  }, null, 2) + '\n');
  const mixedScore = await scoreCodexSwarmPatches({
    collection: mixedCollection,
    cwd: applyRepo,
    workspaceIncludes: ['src']
  });
  assert.strictEqual(mixedScore.summary.total, 1);
  assert.strictEqual(mixedScore.summary['accepted-clean'], 1);
  assert.strictEqual(mixedScore.entries[0].bundlePath, path.join(copiedDir, 'merge.json'));
}

async function testScore(applyRepo, tmp) {
  await fs.mkdir(path.join(applyRepo, 'research', 'repos'), { recursive: true });
  await fs.writeFile(path.join(applyRepo, 'research', 'repos', 'heavy.bin'), 'do not copy\n');
  const patchScore = await scoreCodexSwarmPatches({
    collection: path.join(tmp, 'ready-collection'),
    cwd: applyRepo,
    workspaceIncludes: ['src'],
    focusedCommands: [{ name: 'assert-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
  });
  assert.strictEqual(patchScore.ok, true);
  assert.strictEqual(patchScore.summary['accepted-clean'], 1);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.present, true);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.cleanEligible, true);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.sourceMapMappings, 1);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.dependencyRelations, 1);
  assert.deepStrictEqual(patchScore.entries[0].semanticEvidence.dependencyPredicates, ['calls']);
  assert.deepStrictEqual(patchScore.entries[0].semanticEvidence.dependencyEdgeHints, ['re-export:./public.ts']);
  assert.ok(patchScore.entries[0].semanticEvidence.reasons.includes('semantic dependency edge changes public exports'));
  assert.strictEqual(patchScore.entries[0].semanticEvidence.universalAstLayers, 2);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.proofSpecObligations, 1);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.proofSpecFailedObligations, 0);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.paradigmSemanticsRecords, 3);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.paradigmSemanticsLoweringRecords, 1);
  assert.ok(patchScore.entries[0].semanticEvidence.universalAstLayerNames.includes('semanticSymbols'));
  assert.strictEqual(await fs.readFile(path.join(applyRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');

  const cliScore = await execFileP(process.execPath, [
    new URL('../../dist/cli.js', import.meta.url).pathname,
    'score',
    '--collection',
    path.join(tmp, 'ready-collection'),
    '--workspace-include',
    'src',
    '--focused-command',
    "node -e \"const fs=require('fs'); const label='a,b'; if(label !== 'a,b' || fs.existsSync('research/repos/heavy.bin') || fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);\""
  ], { cwd: applyRepo });
  assert.strictEqual(JSON.parse(cliScore.stdout).ok, true);
}

async function testMissingSemanticScore(applyRepo, tmp, readyDir) {
  const missingSemanticCollection = path.join(tmp, 'missing-semantic-collection');
  const missingSemanticDir = path.join(missingSemanticCollection, 'ready-to-apply', 'missing-semantic-job');
  await fs.mkdir(missingSemanticDir, { recursive: true });
  await fs.writeFile(path.join(missingSemanticDir, 'changes.patch'), await fs.readFile(path.join(readyDir, 'changes.patch'), 'utf8'));
  const missingSemanticBundle = {
    ...JSON.parse(await fs.readFile(path.join(readyDir, 'merge.json'), 'utf8')),
    id: 'missing-semantic-bundle',
    jobId: 'missing-semantic-job',
    taskId: 'missing-semantic-task',
    queueItemIds: ['missing-semantic-task']
  };
  delete missingSemanticBundle.semanticImport;
  delete missingSemanticBundle.metadata;
  await fs.writeFile(path.join(missingSemanticDir, 'merge.json'), JSON.stringify(missingSemanticBundle, null, 2) + '\n');
  const missingSemanticScore = await scoreCodexSwarmPatches({
    collection: missingSemanticCollection,
    cwd: applyRepo,
    workspaceIncludes: ['src'],
    focusedCommands: [{ name: 'assert-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
  });
  assert.strictEqual(missingSemanticScore.ok, true);
  assert.strictEqual(missingSemanticScore.summary['accepted-needs-port'], 1);
  assert.strictEqual(missingSemanticScore.entries[0].semanticEvidence.present, false);
  assert.strictEqual(missingSemanticScore.entries[0].semanticEvidence.cleanEligible, false);
  assert.strictEqual(missingSemanticScore.entries[0].score, 60);
  assert.ok(missingSemanticScore.entries[0].reasons.includes('missing semantic import sidecar'));
}

async function testCommitApply(tmp) {
  const cleanApplyRepo = path.join(tmp, 'clean-apply-repo');
  await fs.mkdir(path.join(cleanApplyRepo, 'src'), { recursive: true });
  await execFileP('git', ['init'], { cwd: cleanApplyRepo });
  await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: cleanApplyRepo });
  await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: cleanApplyRepo });
  await fs.writeFile(path.join(cleanApplyRepo, 'src', 'apply.ts'), 'old\n');
  await execFileP('git', ['add', '--', 'src/apply.ts'], { cwd: cleanApplyRepo });
  await execFileP('git', ['commit', '-m', 'Initial apply fixture'], { cwd: cleanApplyRepo });
  const committedApply = await applyCodexSwarmCollection({ collection: path.join(tmp, 'ready-collection'), cwd: cleanApplyRepo, dryRun: false, branchPrefix: 'codex/tiny', commit: true });
  assert.strictEqual(committedApply.ok, true);
  assert.strictEqual(committedApply.dryRun, false);
  assert.strictEqual(committedApply.summary.committed, 1);
  assert.strictEqual(committedApply.entries[0].status, 'committed');
  assert.strictEqual(committedApply.entries[0].branchName, 'codex/tiny/apply-job');
  assert.match(committedApply.entries[0].commit, /^[0-9a-f]{40}$/);
  await assertApplyEvidence(committedApply, { gateKinds: ['git-branch', 'git-apply-check', 'git-apply', 'git-add', 'git-commit'], decisions: ['apply'] });
  assert.strictEqual(await fs.readFile(path.join(cleanApplyRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
  assert.strictEqual((await execFileP('git', ['branch', '--show-current'], { cwd: cleanApplyRepo })).stdout.trim(), 'codex/tiny/apply-job');
  assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: cleanApplyRepo })).stdout, '');
}

async function testScoreCalibration(applyRepo, tmp) {
  const patchScore = await scoreCodexSwarmPatches({
    collection: path.join(tmp, 'ready-collection'),
    cwd: applyRepo,
    workspaceIncludes: ['src']
  });
  assert.strictEqual(patchScore.calibration.source, 'apply-ledger');
  assert.deepStrictEqual(patchScore.calibration.landedJobIds, ['apply-job']);
  assert.deepStrictEqual(patchScore.calibration.truePositiveCleanJobIds, ['apply-job']);
  assert.strictEqual(patchScore.calibration.precision, 1);
  assert.strictEqual(patchScore.calibration.recall, 1);
}
