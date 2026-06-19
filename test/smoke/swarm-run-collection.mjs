import assert from 'node:assert';
import { collectCodexSwarmRun, createCodexCleanupPlan, createBrowserPlan, exists, execFileP, fs, path, queryCodexSwarmCollection, runCodexSwarm } from './context.mjs';
import { testNoIndexCollection } from './swarm-run-no-index.mjs';
import { testWorkspaceOnlyCollection } from './workspace-only-collection.mjs';

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
  const collectionDir = await testCollectedRun(tmp);
  await testWorkspaceOnlyCollection(tmp);
  await testNoIndexCollection(tmp, mergeBundle);
  await testBrowserRun(tmp);
  return { mergeBundle, collectionDir };
}

async function testSemanticImportFallbackFromTaskRefs(plan, tmp) {
  const remapPlan = JSON.parse(JSON.stringify(plan));
  for (const job of remapPlan.jobs) {
    job.task.targetRefs = ['snes/packages/domain/src/runtime/action.ts'];
    job.task.allowedWrites = [];
    job.allowedWrites = [];
  }
  const fallbackRun = await runCodexSwarm(remapPlan, {
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
  assert.strictEqual(semanticImports.records[0].path, 'src/runtime/action.ts');
  assert.strictEqual(semanticImports.records[0].requestedPath, 'snes/packages/domain/src/runtime/action.ts');
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
  assert.strictEqual(collection.strategyTournament.kind, 'frontier.swarm.strategy-tournament');
  assert.strictEqual(collection.strategyTournament.summary.matchCount, 1);
  assert.strictEqual(collection.strategyTournament.summary.topStrategyId, 'runtime');
  assert.strictEqual(collection.strategyHistory.kind, 'frontier.swarm.strategy-tournament-history');
  assert.strictEqual(collection.tournamentAdaptiveFeedback.kind, 'frontier.swarm.tournament-adaptive-feedback');
  assert.strictEqual(collection.evidenceIndex.summary.jobCount, 1);
  assert.strictEqual(collection.admission.summary.deferredCount, 1);
  assert.strictEqual(collection.dashboard.summary.jobCount, 1);
  assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json')));
  assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'evidence.json')));
  assert.ok(await exists(path.join(collection.outDir, 'merge-index.json')));
  assert.ok(await exists(path.join(collection.outDir, 'queue-overlay.json')));
  assert.ok(await exists(path.join(collection.outDir, 'strategy-tournament.json')));
  assert.ok(await exists(path.join(collection.outDir, 'strategy-history.json')));
  assert.ok(await exists(path.join(collection.outDir, 'tournament-adaptive-feedback.json')));
  assert.ok(await exists(path.join(collection.outDir, 'evidence-index.json')));
  assert.ok(await exists(path.join(collection.outDir, 'merge-admission.json')));
  assert.ok(await exists(path.join(collection.outDir, 'coordinator-query.json')));
  assert.ok(await exists(path.join(collection.outDir, 'compact-dashboard.json')));
  assert.ok(await exists(path.join(collection.outDir, 'queue-outcome-model.json')));
  assert.ok(await exists(path.join(collection.outDir, 'terminal-state.json')));
  assert.strictEqual(collection.queueOutcomeModel.kind, 'frontier.swarm.queue-outcome-model');
  assert.strictEqual(collection.queueOutcomeModel.summary.visibleReviewDebtCount, 1);
  assert.strictEqual(collection.terminalState.kind, 'frontier.swarm.terminal-state-reconciliation');
  assert.strictEqual(collection.terminalState.summary.activeItemCount, 1);
  assert.strictEqual(collection.terminalState.summary.terminalCount, 0);
  assert.strictEqual(collection.compactDashboard.kind, 'frontier.swarm-codex.compact-dashboard');
  assert.strictEqual(collection.compactDashboard.tournament.matchCount, 1);
  assert.strictEqual(collection.compactDashboard.tournament.topStrategyId, 'runtime');
  assert.strictEqual(collection.compactDashboard.semanticImport.presentCount, 1);
  assert.strictEqual(collection.compactDashboard.semanticImport.expected, true);
  assert.strictEqual(collection.compactDashboard.semanticImport.expectedUnsatisfiedCount, 0);
  assert.strictEqual(collection.semanticImport.selectedCount, 1);
  assert.strictEqual(collection.semanticImport.eligibleCount, 1);
  assert.strictEqual(collection.semanticImport.importedCount, 1);
  assert.strictEqual(collection.semanticImport.candidateCount, 1);
  assert.strictEqual(collection.semanticImport.warningCount, 0);
  assert.strictEqual(collection.artifactStore.kind, 'frontier.swarm-codex.artifact-store');
  assert.ok(collection.artifactStore.summary.artifactCount >= 8);
  assert.ok((collection.artifactStore.summary.zstdCount ?? 0) + collection.artifactStore.summary.gzipCount >= 1);
  assert.ok(await exists(path.join(collection.outDir, 'artifact-store', 'artifacts.jsonl')));
  assert.ok(await exists(path.join(collection.outDir, 'artifact-store', 'artifact-index.sql')));
  assert.ok(await exists(path.join(collection.outDir, 'collected-and-indexed.json')));
  const semanticArtifact = collection.artifactStore.records.find((record) => record.relativePath.endsWith('semantic-imports.json'));
  assert.ok(semanticArtifact);
  assert.strictEqual(semanticArtifact.kind, 'semantic-imports');
  assert.ok(semanticArtifact.tags.includes('semantic-import'));
  assert.strictEqual(semanticArtifact.metadata.semanticRecordCount, 1);
  assert.ok(semanticArtifact.metadata.semanticDependencyPredicates.includes('calls'));
  assert.ok((await fs.readFile(path.join(collection.outDir, 'artifact-store', 'artifact-index.sql'), 'utf8')).includes('metadata_json'));
  assert.ok(collection.compactDashboard.semanticImport.universalAstLayerCount >= 0);
  assert.ok(collection.compactDashboard.semanticImport.dependencyRelationCount >= 1);
  assert.ok(collection.compactDashboard.semanticImport.dependencyPredicates.includes('calls'));
  assert.ok(Array.isArray(collection.compactDashboard.semanticImport.universalAstLayerNames));
  assert.strictEqual(collection.compactDashboard.semanticImport.proofSpecFailedObligations, 0);
  const collectedMergeBundle = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json'), 'utf8'));
  assert.strictEqual(collectedMergeBundle.branchName, 'codex/swarm-slice/runtime-runtime-action');
  assert.strictEqual(collectedMergeBundle.metadata.collect.semanticImportQuality.selected, 1);
  assert.strictEqual(collectedMergeBundle.metadata.collect.semanticImportQuality.eligible, 1);
  assert.strictEqual(collectedMergeBundle.metadata.collect.semanticImportQuality.imported, 1);
  assert.strictEqual(collectedMergeBundle.metadata.collect.semanticImportQuality.candidates, 1);
  assert.ok(collectedMergeBundle.metadata.collect.semanticImportQuality.symbols >= 1);
  assert.ok(collectedMergeBundle.metadata.collect.semanticImportQuality.ownershipRegions >= 1);
  assert.deepStrictEqual(collectedMergeBundle.metadata.collect.semanticImportQuality.warnings, []);
  const collectedEvidence = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'evidence.json'), 'utf8'));
  assert.strictEqual(collectedEvidence.semanticImportQuality.selected, 1);
  assert.strictEqual(collectedEvidence.semanticImportQuality.eligible, 1);
  assert.strictEqual(collectedEvidence.semanticImportQuality.imported, 1);
  assert.strictEqual(collectedEvidence.semanticImportQuality.candidates, 1);
  assert.ok(collectedEvidence.semanticImportQuality.symbols >= 1);
  assert.ok(collectedEvidence.semanticImportQuality.ownershipRegions >= 1);
  const evidenceIndex = JSON.parse(await fs.readFile(path.join(collection.outDir, 'evidence-index.json'), 'utf8'));
  assert.strictEqual(evidenceIndex.entries[0].facets.semanticSelected, 1);
  assert.strictEqual(evidenceIndex.entries[0].facets.semanticEligible, 1);
  assert.strictEqual(evidenceIndex.entries[0].facets.semanticImported, 1);
  assert.strictEqual(evidenceIndex.entries[0].facets.semanticCandidates, 1);
  assert.strictEqual(evidenceIndex.entries[0].facets.semanticWarningCount, 0);
  const coordinatorQuery = JSON.parse(await fs.readFile(path.join(collection.outDir, 'coordinator-query.json'), 'utf8'));
  assert.strictEqual(coordinatorQuery.kind, 'frontier.swarm.coordinator-dashboard');
  assert.ok(coordinatorQuery.summary.semanticDependencyRelationCount >= 1);
  assert.strictEqual(coordinatorQuery.summary.semanticImportSelectedCount, 1);
  assert.strictEqual(coordinatorQuery.summary.semanticImportEligibleCount, 1);
  assert.strictEqual(coordinatorQuery.summary.semanticImportImportedCount, 1);
  assert.strictEqual(coordinatorQuery.summary.semanticImportCandidateCount, 1);
  assert.strictEqual(coordinatorQuery.jobs[0].semanticImportQuality.selected, 1);
  assert.strictEqual(coordinatorQuery.jobs[0].semanticImportQuality.eligible, 1);
  assert.strictEqual(coordinatorQuery.jobs[0].semanticImportQuality.imported, 1);
  assert.strictEqual(coordinatorQuery.jobs[0].semanticImportQuality.candidates, 1);
  assert.ok(coordinatorQuery.jobs[0].primaryEvidencePath.endsWith('evidence.json'));
  const artifactQuery = await queryCodexSwarmCollection({ collection: collection.outDir, q: 'runtime', semantic: true });
  assert.strictEqual(artifactQuery.kind, 'frontier.swarm-codex.query');
  assert.strictEqual(artifactQuery.jobs.length, 1);
  assert.ok(artifactQuery.artifacts.length >= 1);
  const semanticArtifactQuery = await queryCodexSwarmCollection({ collection: collection.outDir, kind: 'semantic-imports', semantic: true });
  assert.strictEqual(semanticArtifactQuery.artifacts[0].kind, 'semantic-imports');
  const cli = new URL('../../dist/cli.js', import.meta.url).pathname;
  const cliQuery = JSON.parse((await execFileP(process.execPath, [
    cli,
    'query',
    '--collection',
    collection.outDir,
    '--path',
    'runtime',
    '--semantic'
  ])).stdout);
  assert.strictEqual(cliQuery.jobs.length, 1);
  await testSafeCleanup(tmp, collection.outDir);
  return collection.outDir;
}

async function testSafeCleanup(tmp, collectionDir) {
  const workspacePath = path.join(tmp, 'agent-worktrees', 'frontier-swarm-codex', 'cleanup-job');
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.writeFile(path.join(workspacePath, 'scratch.txt'), 'temporary workspace\n');
  const proofDir = path.join(tmp, 'run', 'jobs', 'cleanup-job');
  await fs.mkdir(proofDir, { recursive: true });
  await fs.writeFile(path.join(proofDir, 'workspace-proof.json'), JSON.stringify({
    manifest: { mode: 'copy', path: workspacePath }
  }, null, 2) + '\n');
  const dryRun = await createCodexCleanupPlan({ run: path.join(tmp, 'run'), collection: collectionDir, keepActive: false });
  assert.strictEqual(dryRun.dryRun, true);
  assert.strictEqual(dryRun.indexed, true);
  assert.strictEqual(dryRun.summary.candidateCount, 1);
  assert.ok(await exists(workspacePath));
  const cleanup = await createCodexCleanupPlan({ run: path.join(tmp, 'run'), collection: collectionDir, keepActive: false, dryRun: false });
  assert.strictEqual(cleanup.summary.deletedCount, 1);
  assert.strictEqual(await exists(workspacePath), false);
  const cli = new URL('../../dist/cli.js', import.meta.url).pathname;
  const cliCleanup = JSON.parse((await execFileP(process.execPath, [
    cli,
    'cleanup',
    '--run',
    path.join(tmp, 'run'),
    '--collection',
    collectionDir,
    '--keep-active',
    'false'
  ])).stdout);
  assert.strictEqual(cliCleanup.kind, 'frontier.swarm-codex.cleanup-plan');
  assert.strictEqual(cliCleanup.summary.candidateCount, 0);
  assert.ok(await exists(path.join(collectionDir, 'collected-and-indexed.json')));
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
