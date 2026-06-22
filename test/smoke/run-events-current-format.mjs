import assert from 'node:assert';
import { createCodexSwarmPlan, fs, path, readCodexRunEvents, runCodexSwarm } from './context.mjs';

export async function testRunEventsCurrentFormat({ tmp }) {
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'run-events-current-format',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/**'] }]
    },
    tasks: {
      items: [{
        id: 'current-run-task',
        lane: 'runtime',
        ownedFiles: ['src/current.txt'],
        verification: [{ name: 'current-ok', command: 'node', args: ['-e', 'process.exit(0)'] }]
      }]
    }
  });
  const jobId = plan.jobs[0].id;
  const taskId = plan.jobs[0].taskId;
  const outDir = path.join(tmp, 'run-events-current-format-run');
  const runEventsPath = path.join(outDir, 'run-events.jsonl');
  const runDashboardPath = path.join(outDir, 'run-dashboard.json');
  const liveEventsPath = path.join(outDir, 'live-run-graph-events.jsonl');
  let sawPlanEventsWhileExecutorRunning = false;

  const result = await runCodexSwarm(plan, {
    outDir,
    cwd: tmp,
    maxConcurrency: 1,
    dependencyHealth: false,
    runVerification: true,
    executor: async (input) => {
      const partial = await readCodexRunEvents(runEventsPath);
      sawPlanEventsWhileExecutorRunning = partial.some((event) => event.type === 'run.created');
      await fs.writeFile(input.paths.lastMessagePath, 'current run events done\n');
      return { exitCode: 0, changedPaths: [], lastMessage: 'current run events done' };
    }
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.runEventsPath, runEventsPath);
  assert.strictEqual(result.runDashboardPath, runDashboardPath);
  assert.strictEqual(result.queueStatePath, path.join(outDir, 'queue-state.json'));
  assert.strictEqual(result.queueEventsPath, path.join(outDir, 'queue-events.jsonl'));
  assert.strictEqual(result.queueSummaryPath, path.join(outDir, 'queue-summary.json'));
  assert.strictEqual(sawPlanEventsWhileExecutorRunning, true);
  assert.strictEqual(await exists(liveEventsPath), false);
  assert.strictEqual(await exists(result.queueStatePath), true);
  assert.strictEqual(await exists(result.queueEventsPath), true);
  assert.strictEqual(await exists(result.queueSummaryPath), true);

  const queueState = JSON.parse(await fs.readFile(result.queueStatePath, 'utf8'));
  assert.strictEqual(queueState.kind, 'frontier.queue.state');
  assert.strictEqual(queueState.jobs.length, 1);
  assert.strictEqual(queueState.jobs[0].status, 'completed');
  assert.strictEqual(queueState.terminalOutcomes.length, 1);
  const queueEvents = (await fs.readFile(result.queueEventsPath, 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.ok(queueEvents.some((event) => event.type === 'queue.job.leased'));
  assert.ok(queueEvents.some((event) => event.type === 'queue.job.completed'));
  const queueSummary = JSON.parse(await fs.readFile(result.queueSummaryPath, 'utf8'));
  assert.strictEqual(queueSummary.kind, 'frontier.swarm-codex.queue-runtime');
  assert.strictEqual(queueSummary.inspection.completed, 1);
  assert.deepStrictEqual(queueSummary.terminalSwarmJobIds, [jobId]);

  const verificationGateEvidence = result.run.results[0].metadata.verificationGateEvidence;
  const gateExecutionsPath = verificationGateEvidence.gateExecutionsPath;
  const gateSummaryPath = verificationGateEvidence.gateSummaryPath;

  const gateExecutions = (await fs.readFile(gateExecutionsPath, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.strictEqual(gateExecutions.length, 1);
  assert.strictEqual(gateExecutions[0].kind, 'frontier.test.gate-execution');
  assert.strictEqual(gateExecutions[0].id, `gate.verify.${jobId}.1.current-ok`);
  assert.strictEqual(gateExecutions[0].gateKind, 'test');
  assert.strictEqual(gateExecutions[0].status, 'passed');
  assert.strictEqual(gateExecutions[0].metadata.source, 'frontier-swarm-codex.verification');
  assert.strictEqual(gateExecutions[0].metadata.jobId, jobId);
  assert.strictEqual(gateExecutions[0].metadata.taskId, taskId);
  assert.deepStrictEqual(gateExecutions[0].packageScope, ['@shapeshift-labs/frontier-swarm-codex', 'runtime']);

  const gateSummary = JSON.parse(await fs.readFile(gateSummaryPath, 'utf8'));
  assert.strictEqual(gateSummary.kind, 'frontier.test.gate-evidence');
  assert.strictEqual(gateSummary.total, 1);
  assert.strictEqual(gateSummary.passed, 1);

  const runEvents = await readCodexRunEvents(runEventsPath);
  const runEventTypes = runEvents.map((event) => event.type);
  for (const type of ['run.created', 'node.created', 'edge.created', 'artifact.attached', 'decision.recorded']) {
    assert.ok(runEventTypes.includes(type), `missing frontier-run event: ${type}`);
  }

  const runDashboard = JSON.parse(await fs.readFile(runDashboardPath, 'utf8'));
  assert.strictEqual(runDashboard.kind, 'frontier.run.dashboard');
  assert.strictEqual(runDashboard.runId, result.run.id);
  assert.ok(runDashboard.counts.task >= 1);
  assert.ok(runDashboard.counts.attempt >= 1);
  assert.ok(runDashboard.counts.decision >= 1);

  const dashboard = JSON.parse(await fs.readFile(path.join(outDir, 'coordinator-dashboard.json'), 'utf8'));
  assert.strictEqual(dashboard.metadata.runEventsPath, runEventsPath);
  assert.strictEqual(dashboard.metadata.runDashboardPath, runDashboardPath);
  assert.strictEqual(dashboard.metadata.queueStatePath, result.queueStatePath);
  assert.strictEqual(dashboard.metadata.queueEventsPath, result.queueEventsPath);
  assert.strictEqual(dashboard.metadata.queueSummaryPath, result.queueSummaryPath);
  assert.strictEqual('liveRunGraphEventsPath' in dashboard.metadata, false);
  assert.strictEqual(dashboard.metadata.artifactPaths.coordinatorDashboard, path.join(outDir, 'coordinator-dashboard.json'));
  assert.strictEqual(dashboard.metadata.artifactPaths.runEvents, runEventsPath);
  assert.strictEqual(dashboard.metadata.artifactPaths.runDashboard, runDashboardPath);
  assert.strictEqual(dashboard.metadata.artifactPaths.queueState, result.queueStatePath);
  assert.strictEqual(dashboard.metadata.artifactPaths.queueEvents, result.queueEventsPath);
  assert.strictEqual(dashboard.metadata.artifactPaths.queueSummary, result.queueSummaryPath);
  assert.strictEqual('liveRunGraphEvents' in dashboard.metadata.artifactPaths, false);
  assert.strictEqual(dashboard.metadata.runSource.mode, 'frontier-run-events');
  assert.strictEqual(dashboard.metadata.runSource.format, 'jsonl');
  assert.strictEqual(dashboard.metadata.runSource.runEventsPath, runEventsPath);
  assert.strictEqual(dashboard.metadata.runSource.runDashboardPath, runDashboardPath);
  assert.strictEqual(verificationGateEvidence.kind, 'frontier-swarm-codex.verification-gate-evidence');
  assert.strictEqual(verificationGateEvidence.gateExecutionCount, 1);
  assert.strictEqual(verificationGateEvidence.gateExecutionsPath, gateExecutionsPath);
  assert.strictEqual(verificationGateEvidence.gateSummaryPath, gateSummaryPath);
  assert.ok(result.run.results[0].evidencePaths.includes(gateExecutionsPath));
  assert.ok(result.run.results[0].evidencePaths.includes(gateSummaryPath));
}

async function exists(file) {
  try {
    await fs.stat(file);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}
