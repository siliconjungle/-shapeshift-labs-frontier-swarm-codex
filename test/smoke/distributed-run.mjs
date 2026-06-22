import assert from 'node:assert';
import {
  createCodexSwarmPlan,
  fs,
  path,
  readCodexRunEvents,
  runCodexSwarm,
  syncCodexRunEventPeers
} from './context.mjs';

export async function testDistributedRun({ tmp }) {
  const sourceRoot = path.join(tmp, 'distributed-source');
  await fs.mkdir(path.join(sourceRoot, 'src'), { recursive: true });
  await fs.writeFile(path.join(sourceRoot, 'src', 'a.txt'), 'a\n');
  await fs.writeFile(path.join(sourceRoot, 'src', 'b.txt'), 'b\n');
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'distributed-run-production',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/**'] }]
    },
    tasks: {
      items: [
        { id: 'distributed-a', lane: 'runtime', ownedFiles: ['src/a.txt'] },
        { id: 'distributed-b', lane: 'runtime', ownedFiles: ['src/b.txt'] }
      ]
    }
  });
  const outDir = path.join(tmp, 'distributed-run-production');
  const result = await runCodexSwarm(plan, {
    outDir,
    cwd: sourceRoot,
    maxConcurrency: 2,
    dependencyHealth: false,
    distributedRun: true,
    liveRouting: true,
    workspace: {
      mode: 'copy',
      root: path.join(tmp, 'distributed-workspaces'),
      includes: ['src'],
      replace: true,
      skipGitRepoCheck: true
    },
    executor: async (input) => {
      await fs.writeFile(input.paths.lastMessagePath, `${input.job.id} done\n`);
      if (input.job.taskId === 'distributed-a') {
        await fs.mkdir(input.paths.evidenceDir, { recursive: true });
        await fs.writeFile(path.join(input.paths.evidenceDir, 'human-question.json'), JSON.stringify({
          code: 'Q-DIST',
          title: 'Distributed run decision',
          question: 'Should the distributed run continue after the first wave?',
          requestedAnswer: 'Answer Q-DIST with continue or stop.',
          options: [{ label: 'continue', value: 'continue' }, { label: 'stop', value: 'stop' }]
        }, null, 2) + '\n');
      }
      return { exitCode: 0, changedPaths: [], lastMessage: `${input.job.id} done` };
    }
  });

  assert.strictEqual(result.ok, true);
  assert.ok(result.distributedRun);
  assert.strictEqual(result.distributedRun.proof.kind, 'frontier.swarm-codex.distributed-run');
  assert.strictEqual(result.distributedRun.proof.ok, true);
  assert.strictEqual(result.distributedRun.workerRunRecords.length, 2);
  assert.ok(result.runEventsPath.endsWith(path.join('.frontier-run', plan.runId, 'run-events.jsonl')));
  assert.strictEqual(result.queueStatePath, result.distributedRun.paths.queueStatePath);
  assert.strictEqual(result.humanActionStatePath, result.distributedRun.paths.humanActionStatePath);
  assert.strictEqual(result.modelTelemetrySummaryPath, result.distributedRun.paths.modelTelemetrySummaryPath);
  assert.strictEqual(result.runSync.summary.peerCount, 2);
  assert.strictEqual(result.distributedRun.proof.coverage.realWorkerRunEvents, true);
  assert.strictEqual(result.distributedRun.proof.coverage.distributedSync, true);
  assert.strictEqual(result.distributedRun.proof.coverage.queueBacked, true);
  assert.strictEqual(result.distributedRun.proof.coverage.humanQuestionProjection, true);

  const coordinatorEvents = await readCodexRunEvents(result.runEventsPath);
  assert.ok(coordinatorEvents.some((event) => event.type === 'run.created'));
  assert.ok(coordinatorEvents.some((event) => event.payload?.node?.kind === 'human-question' && event.payload.node.code === 'Q-DIST'));
  assert.ok(coordinatorEvents.some((event) => event.payload?.decision?.decision === 'human-question'));

  const workerRunDirs = new Set();
  for (const worker of result.distributedRun.workerRunRecords) {
    assert.ok(worker.runDir.includes(path.join('.frontier-run', plan.runId)));
    workerRunDirs.add(worker.runDir);
    const workerEvents = await readCodexRunEvents(worker.runEventsPath);
    assert.ok(workerEvents.length > 0);
    assert.ok(workerEvents.some((event) => event.type === 'run.created'), 'worker ledger should receive coordinator events after sync');
    const workerDashboard = JSON.parse(await fs.readFile(worker.runDashboardPath, 'utf8'));
    assert.strictEqual(workerDashboard.runId, plan.runId);
  }
  assert.strictEqual(workerRunDirs.size, 2);

  const queueSummary = JSON.parse(await fs.readFile(result.queueSummaryPath, 'utf8'));
  assert.strictEqual(queueSummary.enabled, true);
  assert.strictEqual(queueSummary.inspection.completed, 2);
  assert.strictEqual(queueSummary.terminalOutcomeCount, 2);
  assert.strictEqual(queueSummary.activeLeaseCount, 0);

  const humanActionState = JSON.parse(await fs.readFile(result.humanActionStatePath, 'utf8'));
  assert.strictEqual(humanActionState.actionCount, 1);
  assert.strictEqual(humanActionState.openActionCount, 1);
  assert.strictEqual(humanActionState.actions[0].code, 'Q-DIST');

  const telemetrySummary = JSON.parse(await fs.readFile(result.modelTelemetrySummaryPath, 'utf8'));
  assert.strictEqual(telemetrySummary.recordCount, 2);
  assert.strictEqual(telemetrySummary.humanActionCount, 1);

  const proof = JSON.parse(await fs.readFile(result.distributedRun.proofPath, 'utf8'));
  assert.strictEqual(proof.ok, true);
  assert.strictEqual(proof.workers.length, 2);
  assert.ok(proof.workers.every((worker) => worker.syncedToCoordinator));

  const duplicateSync = await syncCodexRunEventPeers({
    run: result.distributedRun.paths.runDir,
    peers: result.distributedRun.workerRunRecords.map((record) => record.runDir),
    direction: 'bidirectional',
    runSyncEvidencePath: path.join(outDir, 'duplicate-sync-evidence.json'),
    runSyncHistoryPath: path.join(outDir, 'duplicate-sync-history.jsonl')
  });
  assert.strictEqual(duplicateSync.ok, true);
  assert.strictEqual(duplicateSync.summary.conflictCount, 0);
  assert.strictEqual(duplicateSync.summary.acceptedEventCount, 0);
  assert.strictEqual(duplicateSync.summary.hasWork, false);

  const partialPeer = path.join(tmp, 'distributed-partial-peer');
  await fs.mkdir(partialPeer, { recursive: true });
  await fs.writeFile(path.join(partialPeer, 'run-events.jsonl'), JSON.stringify(coordinatorEvents[0]) + '\n');
  const partialSync = await syncCodexRunEventPeers({
    run: result.distributedRun.paths.runDir,
    peers: [partialPeer],
    direction: 'push',
    runSyncEvidencePath: path.join(outDir, 'partial-sync-evidence.json'),
    runSyncHistoryPath: path.join(outDir, 'partial-sync-history.jsonl')
  });
  assert.strictEqual(partialSync.ok, true);
  assert.strictEqual(partialSync.summary.conflictCount, 0);
  assert.ok(partialSync.summary.pushedEventCount > 0);
  assert.strictEqual((await readCodexRunEvents(path.join(partialPeer, 'run-events.jsonl'))).length, coordinatorEvents.length);

  await assertDistributedRunDeadLetters({ tmp, sourceRoot });
}

async function assertDistributedRunDeadLetters({ tmp, sourceRoot }) {
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'distributed-run-dead-letter',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/**'] }]
    },
    tasks: {
      items: [{ id: 'dead-letter-task', lane: 'runtime', ownedFiles: ['src/a.txt'] }]
    }
  });
  const outDir = path.join(tmp, 'distributed-run-dead-letter');
  const result = await runCodexSwarm(plan, {
    outDir,
    cwd: sourceRoot,
    maxConcurrency: 1,
    dependencyHealth: false,
    distributedRun: true,
    workspace: {
      mode: 'copy',
      root: path.join(tmp, 'distributed-dead-workspaces'),
      includes: ['src'],
      replace: true,
      skipGitRepoCheck: true
    },
    executor: async (input) => {
      await fs.writeFile(input.paths.lastMessagePath, 'failed intentionally\n');
      return { exitCode: 1, changedPaths: [], lastMessage: 'failed intentionally', error: 'intentional test failure' };
    }
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.distributedRun.workerRunRecords.length, 1);
  const queueSummary = JSON.parse(await fs.readFile(result.queueSummaryPath, 'utf8'));
  assert.strictEqual(queueSummary.inspection.dead, 1);
  assert.strictEqual(queueSummary.terminalOutcomeCount, 1);
  assert.strictEqual(queueSummary.activeLeaseCount, 0);
  const proof = JSON.parse(await fs.readFile(result.distributedRun.proofPath, 'utf8'));
  assert.strictEqual(proof.coverage.realWorkerRunEvents, true);
  assert.strictEqual(proof.coverage.distributedSync, true);
  assert.strictEqual(proof.runSync.summary.conflictCount, 0);
}
