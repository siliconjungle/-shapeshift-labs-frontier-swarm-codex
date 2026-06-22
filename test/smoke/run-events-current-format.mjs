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
  assert.strictEqual(sawPlanEventsWhileExecutorRunning, true);
  assert.strictEqual(await exists(liveEventsPath), false);

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
  assert.strictEqual('liveRunGraphEventsPath' in dashboard.metadata, false);
  assert.strictEqual(dashboard.metadata.artifactPaths.coordinatorDashboard, path.join(outDir, 'coordinator-dashboard.json'));
  assert.strictEqual(dashboard.metadata.artifactPaths.runEvents, runEventsPath);
  assert.strictEqual(dashboard.metadata.artifactPaths.runDashboard, runDashboardPath);
  assert.strictEqual('liveRunGraphEvents' in dashboard.metadata.artifactPaths, false);
  assert.strictEqual(dashboard.metadata.runSource.mode, 'frontier-run-events');
  assert.strictEqual(dashboard.metadata.runSource.format, 'jsonl');
  assert.strictEqual(dashboard.metadata.runSource.runEventsPath, runEventsPath);
  assert.strictEqual(dashboard.metadata.runSource.runDashboardPath, runDashboardPath);
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
