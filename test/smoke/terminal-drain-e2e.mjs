import assert from 'node:assert';
import { collectCodexSwarmRun, fs, path } from './context.mjs';
import { patchTextFor, writeMerge, writePatchMerge } from './collection-noise-fixtures.mjs';
import { editScriptSemanticImportSummary } from './semantic-import-quality-fixtures.mjs';

export async function testTerminalDrainMixedOracle({ tmp }) {
  const runDir = path.join(tmp, 'terminal-drain-mixed-run');
  const outDir = path.join(tmp, 'terminal-drain-mixed-collected');
  await writeTerminalDrainMergeSet(runDir);
  await writeAppliedLedger(outDir, 'applied-patch');

  const collection = await collectCodexSwarmRun({
    run: runDir,
    outDir,
    checkStale: false,
    semanticImportExpected: true
  });

  assert.strictEqual(collection.summary.total, 8);
  assert.strictEqual(collection.summary['ready-to-apply'], 2);
  assert.strictEqual(collection.summary['research-complete'], 1);
  assert.strictEqual(collection.summary['needs-human-port'], 2);
  assert.strictEqual(collection.summary['rerun-work'], 1);
  assert.strictEqual(collection.summary['failed-evidence'], 1);
  assert.strictEqual(collection.summary['stale-against-head'], 1);

  const decisions = new Map(collection.queueOutcomeModel.latestDecisions.map((decision) => [decision.jobId, decision]));
  assertOutcome(decisions, 'applied-patch', { category: 'terminal', outcome: 'applied', terminal: true, reviewDebt: false });
  assertOutcome(decisions, 'ready-patch', { category: 'continuation', outcome: 'continued', terminal: false, reviewDebt: false });
  assertOutcome(decisions, 'research-only', { category: 'terminal', outcome: 'research-complete', terminal: true, reviewDebt: false });
  assertOutcome(decisions, 'rerun-patch', { category: 'stale-rerun', outcome: 'rerun', terminal: false, reviewDebt: false });
  assertOutcome(decisions, 'stale-output', { category: 'stale-rerun', outcome: 'rerun', terminal: false, reviewDebt: false });
  assertOutcome(decisions, 'no-change-output', { category: 'terminal', outcome: 'no-change', terminal: true, reviewDebt: false });
  assertOutcome(decisions, 'semantic-conflict', { category: 'conflict', outcome: 'conflict-blocked', terminal: false, reviewDebt: true });
  assertOutcome(decisions, 'ambiguous-human-needed', { category: 'coordinator-review', outcome: 'needs-port', terminal: false, reviewDebt: true });

  assert.strictEqual(collection.queueOutcomeModel.summary.coordinatorReviewCount, 1);
  assert.strictEqual(collection.queueOutcomeModel.summary.visibleReviewDebtCount, 2);
  assert.strictEqual(collection.queueOutcomeModel.summary.visibleConflictCount, 1);
  assert.strictEqual(collection.queueOutcomeModel.summary.visibleRerunCount, 2);
  assert.strictEqual(collection.queueOutcomeModel.summary.visibleHumanBlockedCount, 0);
  assert.deepStrictEqual(collection.queueOutcomeModel.visibleReviewDebt.map((decision) => decision.jobId).sort(), [
    'ambiguous-human-needed',
    'semantic-conflict'
  ]);
  assert.deepStrictEqual(collection.queueOutcomeModel.visibleConflicts.map((decision) => decision.jobId), ['semantic-conflict']);
  assert.deepStrictEqual(collection.queueOutcomeModel.visibleReruns.map((decision) => decision.jobId).sort(), ['rerun-patch', 'stale-output']);

  assert.strictEqual(collection.landedHealth.appliedJobCount, 1);
  assert.deepStrictEqual(collection.landedHealth.appliedJobIds, ['applied-patch']);
  assert.strictEqual(collection.terminalState.summary.visibleReviewDebtCount, 2);
  assert.strictEqual(collection.terminalState.summary.visibleRerunCount, 2);
  assert.strictEqual(collection.terminalState.summary.visibleConflictCount, 1);

  assert.ok(await exists(path.join(collection.outDir, 'ready-to-apply', 'applied-patch', 'merge.json')));
  assert.ok(await exists(path.join(collection.outDir, 'ready-to-apply', 'ready-patch', 'merge.json')));
  assert.ok(await exists(path.join(collection.outDir, 'research-complete', 'research-only', 'merge.json')));
  assert.ok(await exists(path.join(collection.outDir, 'rerun-work', 'rerun-patch', 'merge.json')));
  assert.ok(await exists(path.join(collection.outDir, 'stale-against-head', 'stale-output', 'merge.json')));
  assert.ok(await exists(path.join(collection.outDir, 'failed-evidence', 'no-change-output', 'merge.json')));
  assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'semantic-conflict', 'merge.json')));
  assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'ambiguous-human-needed', 'merge.json')));
}

async function writeTerminalDrainMergeSet(runDir) {
  await writePatchMerge(runDir, 'applied-patch', {
    disposition: 'auto-mergeable',
    autoMergeable: true,
    changedPath: 'tracked-applied.txt',
    patchText: patchTextFor('tracked-applied.txt', 'base', 'applied')
  });
  await writePatchMerge(runDir, 'ready-patch', {
    disposition: 'auto-mergeable',
    autoMergeable: true,
    changedPath: 'tracked-ready.txt',
    patchText: patchTextFor('tracked-ready.txt', 'base', 'ready')
  });
  await writeResearchOnlyMerge(runDir);
  await writePatchMerge(runDir, 'rerun-patch', {
    status: 'failed',
    disposition: 'blocked',
    autoMergeable: false,
    changedPath: 'tracked-rerun.txt',
    patchText: patchTextFor('tracked-rerun.txt', 'base', 'rerun'),
    commandsFailed: [{ command: ['node', 'test.mjs'], status: 1, required: true }]
  });
  await writeMerge(runDir, 'stale-output', {
    disposition: 'stale-against-head',
    mergeReadiness: 'blocked',
    changedPaths: ['src/stale-output.ts'],
    staleAgainstHead: true,
    reasons: ['stale-against-head']
  });
  await writeMerge(runDir, 'no-change-output', {
    status: 'failed',
    mergeReadiness: 'rejected',
    disposition: 'rejected',
    changedPaths: [],
    reasons: ['no-source-changes', 'non-actionable-worker-output']
  });
  await writePatchMerge(runDir, 'semantic-conflict', {
    disposition: 'auto-mergeable',
    autoMergeable: true,
    changedPath: 'src/runtime/semantic-conflict.ts',
    patchText: patchTextFor('src/runtime/semantic-conflict.ts', 'base', 'conflict'),
    semanticImport: editScriptSemanticImportSummary()
  });
  await writePatchMerge(runDir, 'ambiguous-human-needed', {
    disposition: 'needs-port',
    autoMergeable: false,
    changedPath: 'src/runtime/ambiguous-human-needed.ts',
    patchText: patchTextFor('src/runtime/ambiguous-human-needed.ts', 'base', 'ambiguous')
  });
}

async function writeResearchOnlyMerge(runDir) {
  const evidenceDir = path.join(runDir, 'research-only', 'evidence');
  const evidencePath = path.join(evidenceDir, 'research-summary.md');
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(evidencePath, '# Research summary\n\nNo source patch is needed for this shard.\n');
  await writeMerge(runDir, 'research-only', {
    lane: 'research',
    mergeReadiness: 'discovery-only',
    disposition: 'discovery-only',
    changedPaths: [],
    evidencePaths: [evidencePath],
    reasons: ['gap-analysis', 'research-complete']
  });
}

async function writeAppliedLedger(outDir, jobId) {
  const ledgerDir = path.join(outDir, 'apply-ledger');
  await fs.mkdir(ledgerDir, { recursive: true });
  await fs.writeFile(path.join(ledgerDir, 'apply-ledger.json'), JSON.stringify({
    generatedAt: 1,
    dryRun: false,
    collectionDir: outDir,
    entries: [{
      jobId,
      status: 'applied',
      bundlePath: path.join(outDir, 'ready-to-apply', jobId, 'merge.json'),
      patchPath: path.join(outDir, 'ready-to-apply', jobId, 'changes.patch')
    }],
    summary: {
      total: 1,
      checked: 0,
      applied: 1,
      committed: 0,
      skipped: 0,
      failed: 0
    }
  }, null, 2) + '\n');
}

function assertOutcome(decisions, jobId, expected) {
  const decision = decisions.get(jobId);
  assert.ok(decision, `missing queue outcome decision for ${jobId}`);
  assert.strictEqual(decision.category, expected.category, `${jobId} category`);
  assert.strictEqual(decision.outcome, expected.outcome, `${jobId} outcome`);
  assert.strictEqual(decision.terminal, expected.terminal, `${jobId} terminal`);
  assert.strictEqual(decision.reviewDebt, expected.reviewDebt, `${jobId} reviewDebt`);
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
