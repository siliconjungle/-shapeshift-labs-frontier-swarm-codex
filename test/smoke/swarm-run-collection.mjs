import assert from 'node:assert';
import {
  collectCodexSwarmRun,
  createBrowserPlan,
  execFileP,
  exists,
  fs,
  path,
  runCodexSwarm
} from './context.mjs';

export async function testSwarmRunCollection({ plan, tmp }) {
  const result = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'run'),
    cwd: tmp,
    maxConcurrency: 2,
    adaptiveConcurrency: true,
    semanticImport: true,
    semanticImportExpected: true,
    dryRun: false,
    executor: async (input) => {
      assert.strictEqual(input.resourceAllocation.env.FRONTIER_SWARM_JOB_ID, input.job.id);
      assert.strictEqual(input.env.FRONTIER_SWARM_TASK_ID, input.job.taskId);
      await fs.mkdir(path.join(tmp, 'src', 'runtime'), { recursive: true });
      await fs.writeFile(path.join(tmp, 'src', 'runtime', 'action.ts'), 'export function helper() { return 1; }\nexport function action() { return helper(); }\n');
      await fs.writeFile(input.paths.lastMessagePath, 'done\n');
      return { exitCode: 0, changedPaths: ['src/runtime/action.ts'], lastMessage: 'done' };
    }
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.run.results[0].ownershipViolations.length, 0);
  assert.ok(result.proof.hash);
  assert.ok(await exists(path.join(tmp, 'run', 'coordinator-dashboard.json')));
  assert.ok(await exists(path.join(tmp, 'run', 'adaptive-load.json')));
  assert.ok(await exists(path.join(tmp, 'run', 'pids.json')));
  assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('resource-allocation.json')));
  assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('workspace-proof.json')));
  assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('merge.json')));
  assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('patch-intent.json')));
  assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('log-summary.json')));

  const jobEvidencePath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('evidence.json'));
  assert.ok(jobEvidencePath);
  const jobEvidence = JSON.parse(await fs.readFile(jobEvidencePath, 'utf8'));
  assert.strictEqual(jobEvidence.kind, 'frontier.swarm-codex.job-evidence');
  assert.strictEqual(jobEvidence.readyToPortHunkCount, jobEvidence.patchHunks.length);
  assert.ok(jobEvidence.patchIntentPath.endsWith('patch-intent.json'));
  const patchIntentPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('patch-intent.json'));
  const patchIntent = JSON.parse(await fs.readFile(patchIntentPath, 'utf8'));
  assert.strictEqual(patchIntent.kind, 'frontier.swarm-codex.patch-intent');
  assert.strictEqual(patchIntent.semanticImportQuality.expected, true);
  assert.strictEqual(typeof patchIntent.semanticImportQuality.expectedSatisfied, 'boolean');
  assert.ok(Array.isArray(patchIntent.semanticImportQuality.expectedMissingReasonCodes));
  assert.strictEqual(patchIntent.safeToPortManually, true);
  const logSummaryPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('log-summary.json'));
  const logSummary = JSON.parse(await fs.readFile(logSummaryPath, 'utf8'));
  assert.strictEqual(logSummary.eventBytesTruncated, 0);

  const semanticImportsPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
  assert.ok(semanticImportsPath);
  const semanticImports = JSON.parse(await fs.readFile(semanticImportsPath, 'utf8'));
  assert.strictEqual(semanticImports.kind, 'frontier.swarm-codex.semantic-imports');
  assert.strictEqual(semanticImports.summary.total, 1);
  assert.strictEqual(semanticImports.summary.selected, 1);
  assert.strictEqual(semanticImports.summary.eligible, 1);
  assert.strictEqual(semanticImports.summary.omitted, 0);
  assert.strictEqual(semanticImports.summary.imported + semanticImports.summary.errors, 1);
  assert.ok(semanticImports.summary.sourceMapCount >= 1);
  assert.ok(semanticImports.summary.sourceMapMappingCount >= 1);
  assert.ok(semanticImports.summary.lossCount >= 1);
  assert.ok(semanticImports.summary.semanticIndex.symbols >= 1);
  assert.ok(semanticImports.summary.dependencies.total >= 1);
  assert.ok(semanticImports.summary.dependencies.calls >= 1);
  assert.ok(semanticImports.records[0].dependencies.total >= 1);
  assert.ok(semanticImports.summary.universalAstLayers);
  assert.ok(Array.isArray(semanticImports.summary.universalAstLayers.names));
  assert.ok(semanticImports.summary.proofSpec);
  assert.strictEqual(semanticImports.summary.proofSpec.failed, 0);
  assert.ok(semanticImports.summary.readiness['ready-with-losses'] >= 1 || semanticImports.summary.readiness.ready >= 1);
  assert.strictEqual(semanticImports.summary.nativeCompiles.total, 1);
  assert.strictEqual(semanticImports.summary.nativeCompiles.preserved, 1);
  assert.strictEqual(semanticImports.summary.semanticSliceAdmissions.total, 1);
  assert.strictEqual(semanticImports.summary.semanticSliceAdmissions.rejected, 0);
  assert.ok(semanticImports.summary.semanticSliceAdmissions.averageScore > 0);
  assert.strictEqual(semanticImports.summary.semanticImportExpected, true);
  assert.strictEqual(typeof semanticImports.summary.semanticImportExpectedSatisfied, 'boolean');
  assert.ok(Array.isArray(semanticImports.summary.semanticImportExpectedMissingReasonCodes));
  assert.ok(semanticImports.records[0].semanticSlice);
  assert.strictEqual(semanticImports.records[0].semanticSliceAdmission.autoMergeClaim, false);
  assert.strictEqual(semanticImports.records[0].semanticSliceAdmission.mergeScore.schema, 'frontier.lang.semanticMergeScore.v1');
  assert.strictEqual(result.run.results[0].mergeReadiness, 'patch-candidate');
  assert.strictEqual(result.run.results[0].metadata.semanticImport.total, 1);
  assert.ok(result.run.results[0].metadata.semanticImport.semanticSidecars.ownershipRegions >= 1);
  assert.ok(result.run.results[0].metadata.semanticImport.dependencies.total >= 1);
  assert.ok(result.run.results[0].metadata.semanticImport.universalAstLayers.total >= 0);
  assert.strictEqual(result.run.results[0].metadata.semanticImport.proofSpec.failed, 0);

  const mergeBundlePath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('merge.json'));
  const mergeBundle = JSON.parse(await fs.readFile(mergeBundlePath, 'utf8'));
  assert.strictEqual(mergeBundle.disposition, 'needs-port');
  assert.deepStrictEqual(mergeBundle.queueItemIds, ['runtime-action']);
  assert.strictEqual(mergeBundle.semanticImport.total, 1);
  assert.ok(mergeBundle.semanticImport.sourceProjections.total >= 1);
  assert.ok(mergeBundle.semanticImport.nativeCompiles.total >= 1);
  assert.strictEqual(mergeBundle.metadata.semanticImport.total, 1);
  assert.ok(mergeBundle.metadata.semanticImport.sourceMapCount >= 1);
  assert.ok(mergeBundle.metadata.semanticImport.dependencies.total >= 1);
  assert.ok(Array.isArray(mergeBundle.metadata.semanticImport.universalAstLayers.names));
  assert.strictEqual(mergeBundle.metadata.semanticImport.proofSpec.failed, 0);
  assert.strictEqual(mergeBundle.metadata.semanticImport.semanticImportExpected, true);
  assert.ok(Array.isArray(mergeBundle.metadata.semanticImport.semanticImportExpectedMissingReasonCodes));

  await testSemanticImportFallbackFromTaskRefs(plan, tmp);
  await testCollectedRun(tmp);
  await testNoIndexCollection(tmp, mergeBundle);
  await testBrowserRun(tmp);
  return { mergeBundle };
}

async function testSemanticImportFallbackFromTaskRefs(plan, tmp) {
  const fallbackRun = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'task-ref-run'),
    cwd: tmp,
    maxConcurrency: 1,
    semanticImport: true,
    semanticImportExpected: true,
    dryRun: false,
    executor: async (input) => {
      await fs.mkdir(path.join(tmp, 'src', 'runtime'), { recursive: true });
      await fs.writeFile(path.join(tmp, 'src', 'runtime', 'action.ts'), 'export function helper() { return 2; }\nexport function action() { return helper(); }\n');
      await fs.writeFile(input.paths.lastMessagePath, 'task refs only\n');
      return { exitCode: 0, changedPaths: [], lastMessage: 'task refs only' };
    }
  });
  assert.strictEqual(fallbackRun.ok, true);
  const semanticImportsPath = fallbackRun.run.results[0].evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
  assert.ok(semanticImportsPath);
  const semanticImports = JSON.parse(await fs.readFile(semanticImportsPath, 'utf8'));
  assert.strictEqual(semanticImports.summary.selected, 1);
  assert.strictEqual(semanticImports.summary.eligible, 1);
  assert.strictEqual(semanticImports.summary.imported + semanticImports.summary.errors, 1);
  assert.ok(semanticImports.summary.semanticIndex.symbols >= 1);
  assert.ok(semanticImports.summary.dependencies.total >= 1);
  assert.strictEqual(fallbackRun.run.results[0].mergeReadiness, 'discovery-only');
}

async function testCollectedRun(tmp) {
  const collection = await collectCodexSwarmRun({
    run: path.join(tmp, 'run'),
    checkStale: false,
    semanticImportExpected: true,
    branchPrefix: 'codex/swarm-slice'
  });
  assert.strictEqual(collection.summary.total, 1);
  assert.strictEqual(collection.summary['needs-human-port'], 1);
  assert.strictEqual(collection.mergeIndex.summary.entryCount, 1);
  assert.strictEqual(collection.queueOverlay.summary.entryCount, 1);
  assert.strictEqual(collection.evidenceIndex.summary.jobCount, 1);
  assert.strictEqual(collection.admission.summary.deferredCount, 1);
  assert.strictEqual(collection.dashboard.summary.jobCount, 1);
  assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json')));
  assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'evidence.json')));
  assert.ok(await exists(path.join(collection.outDir, 'merge-index.json')));
  assert.ok(await exists(path.join(collection.outDir, 'queue-overlay.json')));
  assert.ok(await exists(path.join(collection.outDir, 'evidence-index.json')));
  assert.ok(await exists(path.join(collection.outDir, 'merge-admission.json')));
  assert.ok(await exists(path.join(collection.outDir, 'coordinator-query.json')));
  assert.ok(await exists(path.join(collection.outDir, 'compact-dashboard.json')));
  assert.strictEqual(collection.compactDashboard.kind, 'frontier.swarm-codex.compact-dashboard');
  assert.strictEqual(collection.compactDashboard.semanticImport.presentCount, 1);
  assert.strictEqual(collection.compactDashboard.semanticImport.expected, true);
  assert.strictEqual(collection.compactDashboard.semanticImport.expectedUnsatisfiedCount, 0);
  assert.ok(collection.compactDashboard.semanticImport.universalAstLayerCount >= 0);
  assert.ok(collection.compactDashboard.semanticImport.dependencyRelationCount >= 1);
  assert.ok(collection.compactDashboard.semanticImport.dependencyPredicates.includes('calls'));
  assert.ok(Array.isArray(collection.compactDashboard.semanticImport.universalAstLayerNames));
  assert.strictEqual(collection.compactDashboard.semanticImport.proofSpecFailedObligations, 0);
  const collectedMergeBundle = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json'), 'utf8'));
  assert.strictEqual(collectedMergeBundle.branchName, 'codex/swarm-slice/runtime-runtime-action');
  const coordinatorQuery = JSON.parse(await fs.readFile(path.join(collection.outDir, 'coordinator-query.json'), 'utf8'));
  assert.strictEqual(coordinatorQuery.kind, 'frontier.swarm.coordinator-dashboard');
  assert.ok(coordinatorQuery.summary.semanticDependencyRelationCount >= 1);
  assert.ok(coordinatorQuery.jobs[0].primaryEvidencePath.endsWith('evidence.json'));
}

async function testNoIndexCollection(tmp, mergeBundle) {
  const noIndexRepo = path.join(tmp, 'no-index-repo');
  await fs.mkdir(path.join(noIndexRepo, 'src'), { recursive: true });
  await execFileP('git', ['init'], { cwd: noIndexRepo });
  await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: noIndexRepo });
  await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: noIndexRepo });
  await fs.writeFile(path.join(noIndexRepo, 'src', 'foo.ts'), 'old\n');
  await execFileP('git', ['add', '--', 'src/foo.ts'], { cwd: noIndexRepo });
  await execFileP('git', ['commit', '-m', 'Initial no-index fixture'], { cwd: noIndexRepo });
  const noIndexOldHash = (await execFileP('git', ['rev-parse', 'HEAD:src/foo.ts'], { cwd: noIndexRepo })).stdout.trim();
  const noIndexRunDir = path.join(noIndexRepo, 'agent-runs', 'copy-run');
  const noIndexJobDir = path.join(noIndexRunDir, 'copy-worker');
  await fs.mkdir(noIndexJobDir, { recursive: true });
  await fs.writeFile(path.join(noIndexJobDir, 'changes.patch'), [
    `diff --git a${path.join(noIndexRepo, 'src', 'foo.ts')} b${path.join(noIndexRepo, 'agent-worktrees', 'copy-worker', 'src', 'foo.ts')}`,
    `index ${noIndexOldHash}..1234567 100644`,
    `--- a${path.join(noIndexRepo, 'src', 'foo.ts')}`,
    `+++ b${path.join(noIndexRepo, 'agent-worktrees', 'copy-worker', 'src', 'foo.ts')}`,
    '@@ -1 +1 @@',
    '-old',
    '+new',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(noIndexJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'copy-worker-bundle',
    jobId: 'copy-worker',
    taskId: 'copy-task',
    status: 'completed',
    mergeReadiness: 'patch-candidate',
    disposition: 'needs-port',
    autoMergeable: false,
    changedPaths: ['src/foo.ts'],
    ownedFilesTouched: ['src/foo.ts'],
    patchPath: 'changes.patch',
    staleAgainstHead: false,
    reasons: []
  }, null, 2) + '\n');
  const noIndexCollection = await collectCodexSwarmRun({ run: noIndexRunDir, cwd: noIndexRepo, outDir: path.join(noIndexRunDir, 'collected') });
  assert.strictEqual(noIndexCollection.summary['stale-against-head'], 0);
  assert.strictEqual(noIndexCollection.summary['needs-human-port'], 1);
  const noIndexCollectedBundle = JSON.parse(await fs.readFile(path.join(noIndexCollection.outDir, 'needs-human-port', 'copy-worker', 'merge.json'), 'utf8'));
  assert.strictEqual(noIndexCollectedBundle.staleAgainstHead, false);
  assert.ok(noIndexCollectedBundle.reasons.some((reason) => reason.includes('patch base hashes match HEAD')));
  await testBaseHashDriftCollection(noIndexRepo, noIndexOldHash, mergeBundle);
}

async function testBaseHashDriftCollection(repo, oldHash, mergeBundle) {
  await fs.writeFile(path.join(repo, 'src', 'foo.ts'), 'current\n');
  await execFileP('git', ['add', '--', 'src/foo.ts'], { cwd: repo });
  await execFileP('git', ['commit', '-m', 'Move coordinator head'], { cwd: repo });
  const driftRunDir = path.join(repo, 'agent-runs', 'drift-run');
  const driftJobDir = path.join(driftRunDir, 'drift-worker');
  await fs.mkdir(driftJobDir, { recursive: true });
  await fs.writeFile(path.join(driftJobDir, 'changes.patch'), [
    'diff --git a/src/foo.ts b/src/foo.ts',
    `index ${oldHash}..1234567 100644`,
    '--- a/src/foo.ts',
    '+++ b/src/foo.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(driftJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'drift-worker-bundle',
    jobId: 'drift-worker',
    taskId: 'drift-task',
    disposition: 'needs-port',
    autoMergeable: false,
    changedPaths: ['src/foo.ts'],
    ownedFilesTouched: ['src/foo.ts'],
    patchPath: 'changes.patch',
    staleAgainstHead: false,
    reasons: []
  }, null, 2) + '\n');
  const driftCollection = await collectCodexSwarmRun({ run: driftRunDir, cwd: repo, outDir: path.join(driftRunDir, 'collected') });
  assert.strictEqual(driftCollection.summary['stale-against-head'], 0);
  assert.strictEqual(driftCollection.summary['needs-human-port'], 1);
  const driftBundle = JSON.parse(await fs.readFile(path.join(driftCollection.outDir, 'needs-human-port', 'drift-worker', 'merge.json'), 'utf8'));
  assert.ok(driftBundle.reasons.some((reason) => reason.includes('manual port required')));
}

async function testBrowserRun(tmp) {
  const browserRun = await runCodexSwarm(createBrowserPlan(), {
    outDir: path.join(tmp, 'browser-run'),
    cwd: tmp,
    dryRun: false,
    executor: async (input) => {
      assert.strictEqual(input.resourceAllocation.browser.port, '4177');
      assert.strictEqual(input.env.PORT, '4177');
      assert.ok(await exists(input.resourceAllocation.browser.profileDir));
      await fs.writeFile(input.paths.lastMessagePath, 'browser done\n');
      return { exitCode: 0, changedPaths: ['e2e.mjs'], lastMessage: 'browser done' };
    }
  });
  assert.strictEqual(browserRun.ok, true);
  const browserResourcePath = browserRun.run.results[0].evidencePaths.find((entry) => entry.endsWith('resource-allocation.json'));
  const browserResourceEvidence = JSON.parse(await fs.readFile(browserResourcePath, 'utf8'));
  assert.strictEqual(browserResourceEvidence.browser.port, '4177');
}
