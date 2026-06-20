import assert from 'node:assert';
import { createCodexSwarmPlan, fs, path, runCodexSwarm } from './context.mjs';

export async function testLiveRunGraphEvents({ tmp }) {
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'live-run-graph-events',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/**'] }]
    },
    tasks: {
      items: [{
        id: 'live-task',
        lane: 'runtime',
        ownedFiles: ['src/live.txt'],
        verification: [{ name: 'live-ok', command: 'node', args: ['-e', 'process.exit(0)'] }]
      }]
    }
  });
  const outDir = path.join(tmp, 'live-run-graph-events-run');
  const liveEventsPath = path.join(outDir, 'live-run-graph-events.jsonl');
  let sawStartedWhileExecutorRunning = false;

  const result = await runCodexSwarm(plan, {
    outDir,
    cwd: tmp,
    maxConcurrency: 1,
    dependencyHealth: false,
    runVerification: true,
    executor: async (input) => {
      const partial = await readLiveEvents(liveEventsPath);
      sawStartedWhileExecutorRunning = partial.some((event) => event.type === 'job.started' && event.jobId === input.job.id);
      await fs.writeFile(input.paths.lastMessagePath, 'live graph done\n');
      return { exitCode: 0, changedPaths: [], lastMessage: 'live graph done' };
    }
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(sawStartedWhileExecutorRunning, true);
  const events = await readLiveEvents(liveEventsPath);
  const types = events.map((event) => event.type);
  for (const type of ['run.started', 'job.started', 'evidence.discovered', 'gate.result', 'terminal.outcome', 'job.finished', 'run.finished']) {
    assert.ok(types.includes(type), `missing live graph event: ${type}`);
  }

  const started = events.find((event) => event.type === 'job.started');
  assert.ok(started.nodes.some((node) => node.kind === 'job' && node.status === 'running'));
  const evidence = events.find((event) => event.type === 'evidence.discovered');
  assert.ok(evidence.nodes.some((node) => node.kind === 'evidence' && node.path.endsWith('evidence.json')));
  const gate = events.find((event) => event.type === 'gate.result');
  assert.strictEqual(gate.nodes[0].kind, 'gate');
  assert.strictEqual(gate.nodes[0].status, 'passed');
  const terminal = events.find((event) => event.type === 'terminal.outcome');
  assert.strictEqual(terminal.nodes[0].kind, 'decision');
  assert.strictEqual(terminal.nodes[0].status, 'completed');
  const finished = events.find((event) => event.type === 'job.finished');
  assert.ok(finished.nodes.some((node) => node.kind === 'candidate'));

  const dashboard = JSON.parse(await fs.readFile(path.join(outDir, 'coordinator-dashboard.json'), 'utf8'));
  assert.strictEqual(dashboard.metadata.liveRunGraphEventsPath, liveEventsPath);
  assert.strictEqual(dashboard.metadata.artifactPaths.coordinatorDashboard, path.join(outDir, 'coordinator-dashboard.json'));
  assert.strictEqual(dashboard.metadata.artifactPaths.liveRunGraphEvents, liveEventsPath);
  assert.strictEqual(dashboard.metadata.runSource.mode, 'live-run-graph-events');
  assert.strictEqual(dashboard.metadata.runSource.format, 'jsonl');
  assert.strictEqual(dashboard.metadata.runSource.liveRunGraphEventsPath, liveEventsPath);
  assert.strictEqual(discoverLiveRunGraphEventsPath(dashboard), liveEventsPath);
  assert.strictEqual((await readLiveEvents(discoverLiveRunGraphEventsPath(dashboard))).length, events.length);
}

async function readLiveEvents(file) {
  const text = await fs.readFile(file, 'utf8');
  return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function discoverLiveRunGraphEventsPath(dashboard) {
  return dashboard.metadata?.artifactPaths?.liveRunGraphEvents
    ?? dashboard.metadata?.runSource?.liveRunGraphEventsPath
    ?? dashboard.metadata?.liveRunGraphEventsPath;
}
