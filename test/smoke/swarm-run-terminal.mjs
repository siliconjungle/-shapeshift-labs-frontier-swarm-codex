import assert from 'node:assert';
import { collectCodexSwarmRun, createCodexCleanupPlan, createBrowserPlan, exists, execFileP, fs, path, runCodexSwarm } from './context.mjs';

export async function testResearchCompleteCollection(tmp) {
  const runDir = path.join(tmp, 'research-complete-run');
  await writeNoPatchResearchJob(runDir, {
    jobId: 'gap-analysis-worker',
    taskId: 'gap-analysis-task',
    lane: 'research',
    mergeReadiness: 'discovery-only',
    disposition: 'discovery-only',
    evidenceFile: 'semantic-merge-gap-summary.md',
    evidenceText: '# Gap summary\n\nUseful synthesized research with no source patch.\n',
    reasons: ['gap-analysis', 'synthesized']
  });
  await writeNoPatchResearchJob(runDir, {
    jobId: 'semantic-gap-analysis-worker',
    taskId: 'semantic-gap-analysis-task',
    lane: 'analysis',
    mergeReadiness: 'needs-port',
    disposition: 'needs-port',
    evidenceFile: 'semantic-gap-analysis.md',
    evidenceText: '# Semantic gap analysis\n\nThe worker found no source patch but produced useful gap evidence.\n',
    metadata: { task: { workKind: 'gap-analysis' } },
    reasons: ['gap-analysis', 'semantic import expected evidence unsatisfied: missing-sidecar']
  });
  await writeNoPatchResearchJob(runDir, {
    jobId: 'evidence-only-worker',
    taskId: 'evidence-only-task',
    lane: 'research',
    status: 'evidence-only',
    mergeReadiness: 'evidence-only',
    disposition: 'evidence-only',
    evidenceFile: 'evidence-only-summary.md',
    evidenceText: '# Evidence-only output\n\nUseful evidence without a source patch.\n',
    reasons: ['evidence-only']
  });
  await writePatchBearingImplementationJob(runDir);
  const collection = await collectCodexSwarmRun({
    run: runDir,
    outDir: path.join(tmp, 'research-complete-collected'),
    checkStale: false
  });
  assert.strictEqual(collection.summary.total, 4);
  assert.strictEqual(collection.summary['research-complete'], 3);
  assert.strictEqual(collection.summary['needs-human-port'], 1);
  assert.strictEqual(collection.queueOutcomeModel.summary.terminalCount, 3);
  assert.strictEqual(collection.queueOutcomeModel.summary.visibleReviewDebtCount, 1);
  const decisionsByJob = new Map(collection.queueOutcomeModel.latestDecisions.map((decision) => [decision.jobId, decision]));
  for (const jobId of ['gap-analysis-worker', 'semantic-gap-analysis-worker', 'evidence-only-worker']) {
    const decision = decisionsByJob.get(jobId);
    assert.strictEqual(decision.decision, 'research-complete');
    assert.strictEqual(decision.category, 'terminal');
    assert.strictEqual(decision.terminal, true);
    assert.strictEqual(decision.reviewDebt, false);
    assert.ok(await exists(path.join(collection.outDir, 'research-complete', jobId, 'merge.json')));
    const collectedEvidence = JSON.parse(await fs.readFile(path.join(collection.outDir, 'research-complete', jobId, 'evidence.json'), 'utf8'));
    assert.strictEqual(collectedEvidence.metadata.bucket, 'research-complete');
  }
  const patchDecision = decisionsByJob.get('patch-bearing-implementation');
  assert.strictEqual(patchDecision.decision, 'needs-port');
  assert.strictEqual(patchDecision.category, 'coordinator-review');
  assert.strictEqual(patchDecision.reviewDebt, true);
  assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'patch-bearing-implementation', 'merge.json')));
  assert.strictEqual(collection.terminalState.summary.activeItemCount, 1);
  assert.strictEqual(collection.terminalState.summary.terminalCount, 3);
  assert.strictEqual(collection.terminalState.summary.terminalUnresolvedCount, 0);
}

async function writeNoPatchResearchJob(runDir, input) {
  const jobDir = path.join(runDir, input.jobId);
  const evidenceDir = path.join(jobDir, 'evidence');
  const evidencePath = path.join(evidenceDir, input.evidenceFile);
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(evidencePath, input.evidenceText);
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify({
    jobId: input.jobId,
    taskId: input.taskId,
    lane: input.lane,
    status: input.status ?? 'completed',
    mergeReadiness: input.mergeReadiness,
    disposition: input.disposition,
    riskLevel: 'low',
    autoMergeable: false,
    changedPaths: [],
    changedRegions: [],
    ownedFilesTouched: [],
    allowedWrites: [],
    ownershipViolations: [],
    evidencePaths: [evidencePath],
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds: [input.taskId],
    staleAgainstHead: false,
    reasons: input.reasons,
    ...(input.metadata ? { metadata: input.metadata } : {})
  }, null, 2) + '\n');
}

async function writePatchBearingImplementationJob(runDir) {
  const jobId = 'patch-bearing-implementation';
  const taskId = 'patch-bearing-task';
  const jobDir = path.join(runDir, jobId);
  const evidenceDir = path.join(jobDir, 'evidence');
  const evidencePath = path.join(evidenceDir, 'implementation-notes.md');
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(evidencePath, '# Implementation notes\n\nThis worker has an actionable source patch.\n');
  await fs.writeFile(path.join(jobDir, 'changes.patch'), [
    'diff --git a/src/runtime/patch-bearing.ts b/src/runtime/patch-bearing.ts',
    'new file mode 100644',
    'index 0000000..1111111',
    '--- /dev/null',
    '+++ b/src/runtime/patch-bearing.ts',
    '@@ -0,0 +1 @@',
    '+export const patchBearing = true;',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify({
    jobId,
    taskId,
    lane: 'runtime',
    status: 'completed',
    mergeReadiness: 'patch-candidate',
    disposition: 'needs-port',
    riskLevel: 'medium',
    autoMergeable: false,
    changedPaths: ['src/runtime/patch-bearing.ts'],
    changedRegions: [],
    ownedFilesTouched: ['src/runtime/patch-bearing.ts'],
    allowedWrites: ['src/runtime/**'],
    ownershipViolations: [],
    patchPath: 'changes.patch',
    evidencePaths: [evidencePath],
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds: [taskId],
    staleAgainstHead: false,
    reasons: ['gap-analysis']
  }, null, 2) + '\n');
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
