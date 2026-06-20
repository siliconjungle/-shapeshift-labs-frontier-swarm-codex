import assert from 'node:assert';
import { collectCodexSwarmRun, createCodexCleanupPlan, createBrowserPlan, exists, execFileP, fs, path, runCodexSwarm } from './context.mjs';

export async function testResearchCompleteCollection(tmp) {
  const runDir = path.join(tmp, 'research-complete-run');
  const jobId = 'gap-analysis-worker';
  const jobDir = path.join(runDir, jobId);
  const evidenceDir = path.join(jobDir, 'evidence');
  const researchPath = path.join(evidenceDir, 'semantic-merge-gap-summary.md');
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(researchPath, '# Gap summary\n\nUseful synthesized research with no source patch.\n');
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify({
    jobId,
    taskId: 'gap-analysis-task',
    lane: 'research',
    status: 'completed',
    mergeReadiness: 'discovery-only',
    disposition: 'discovery-only',
    riskLevel: 'low',
    autoMergeable: false,
    changedPaths: [],
    changedRegions: [],
    ownedFilesTouched: [],
    allowedWrites: [],
    ownershipViolations: [],
    evidencePaths: [researchPath],
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds: ['gap-analysis-task'],
    staleAgainstHead: false,
    reasons: ['gap-analysis', 'synthesized']
  }, null, 2) + '\n');
  const collection = await collectCodexSwarmRun({
    run: runDir,
    outDir: path.join(tmp, 'research-complete-collected'),
    checkStale: false
  });
  assert.strictEqual(collection.summary.total, 1);
  assert.strictEqual(collection.summary['research-complete'], 1);
  assert.strictEqual(collection.summary['needs-human-port'], 0);
  assert.strictEqual(collection.queueOutcomeModel.summary.terminalCount, 1);
  assert.strictEqual(collection.queueOutcomeModel.summary.visibleReviewDebtCount, 0);
  assert.strictEqual(collection.queueOutcomeModel.latestDecisions[0].decision, 'research-complete');
  assert.strictEqual(collection.queueOutcomeModel.latestDecisions[0].category, 'terminal');
  assert.strictEqual(collection.terminalState.summary.activeItemCount, 0);
  assert.strictEqual(collection.terminalState.summary.terminalCount, 1);
  assert.strictEqual(collection.terminalState.summary.terminalUnresolvedCount, 0);
  assert.ok(await exists(path.join(collection.outDir, 'research-complete', jobId, 'merge.json')));
  const collectedEvidence = JSON.parse(await fs.readFile(path.join(collection.outDir, 'research-complete', jobId, 'evidence.json'), 'utf8'));
  assert.strictEqual(collectedEvidence.metadata.bucket, 'research-complete');
}

export async function testSafeCleanup(tmp, collectionDir) {
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
export async function testBrowserRun(tmp) {
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
