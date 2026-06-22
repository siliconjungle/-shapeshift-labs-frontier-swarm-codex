import assert from 'node:assert';
import { createCodexSwarmPlan, fs, path, runCodexSwarm } from './context.mjs';

export async function testLiveRoutingController({ tmp }) {
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'live-routing-controller',
      compute: [
        { id: 'fast', kind: 'codex', model: 'gpt-5.4-mini', reasoningEffort: 'medium', metadata: { modelTier: 'cheap' } },
        { id: 'deep', kind: 'codex', model: 'gpt-5.5', reasoningEffort: 'xhigh', metadata: { modelTier: 'deep' } }
      ],
      lanes: [{ id: 'runtime', allowedGlobs: ['src/**'] }],
      policy: { defaultCompute: 'fast', defaultConcurrency: 1 }
    },
    tasks: {
      items: [
        { id: 'first-fast-fails', lane: 'runtime', kind: 'implementation', ownedFiles: ['src/first.ts'] },
        { id: 'second-reroutes', lane: 'runtime', kind: 'implementation', ownedFiles: ['src/second.ts'] }
      ]
    }
  });
  assert.deepStrictEqual(plan.jobs.map((job) => job.compute.id), ['fast', 'fast']);
  const outDir = path.join(tmp, 'live-routing-run');
  const launched = [];
  const result = await runCodexSwarm(plan, {
    outDir,
    cwd: tmp,
    maxConcurrency: 1,
    dependencyHealth: false,
    liveRouting: { enabled: true, routingMode: 'fill', minSamples: 1 },
    executor: async (input) => {
      launched.push({ jobId: input.job.id, taskId: input.job.taskId, computeId: input.job.compute.id });
      await fs.writeFile(input.paths.lastMessagePath, `${input.job.id} via ${input.job.compute.id}\n`);
      if (input.job.taskId === 'first-fast-fails') {
        return { exitCode: 1, changedPaths: [], lastMessage: 'fast failed' };
      }
      return { exitCode: 0, changedPaths: [], lastMessage: 'deep completed' };
    }
  });

  assert.deepStrictEqual(launched.map((entry) => entry.computeId), ['fast', 'deep']);
  assert.strictEqual(result.liveRoutingPolicyPath, path.join(outDir, 'model-routing-policy.live.json'));
  assert.strictEqual(result.liveRoutingControllerPath, path.join(outDir, 'routing-controller.json'));
  assert.strictEqual(result.liveRoutingHistoryPath, path.join(outDir, 'routing-controller-history.json'));
  assert.strictEqual(await exists(result.liveRoutingPolicyPath), true);
  assert.strictEqual(await exists(result.liveRoutingControllerPath), true);
  assert.strictEqual(await exists(result.liveRoutingHistoryPath), true);
  assert.strictEqual(result.plan.jobs[0].compute.id, 'fast');
  assert.strictEqual(result.plan.jobs[1].compute.id, 'deep');
  assert.strictEqual(result.liveRoutingController.kind, 'frontier.swarm.routing-controller');
  assert.ok(result.liveRoutingController.policy.signals.some((signal) => signal.mode === 'avoid' && signal.computeId === 'fast'));
  assert.ok(result.liveRoutingController.policy.signals.some((signal) => signal.mode === 'prefer' && signal.computeId === 'deep'));

  const policy = JSON.parse(await fs.readFile(result.liveRoutingPolicyPath, 'utf8'));
  const controller = JSON.parse(await fs.readFile(result.liveRoutingControllerPath, 'utf8'));
  const history = JSON.parse(await fs.readFile(result.liveRoutingHistoryPath, 'utf8'));
  assert.strictEqual(policy.kind, 'frontier.swarm.model-routing-policy');
  assert.strictEqual(controller.id, result.liveRoutingController.id);
  assert.strictEqual(history.kind, 'frontier.swarm-codex.live-routing-history');
  assert.ok(history.controllerCount >= 1);
  assert.ok(history.controllers.some((entry) => entry.summary.changedComputeCount === 1));

  const telemetryRecords = (await fs.readFile(result.modelTelemetryPath, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.deepStrictEqual(telemetryRecords.map((record) => record.computeId), ['fast', 'deep']);
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
