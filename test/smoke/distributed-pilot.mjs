import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  path,
  fs,
  readCodexRunEvents
} from './context.mjs';
import { runCodexDistributedPilot } from '../../dist/index.js';

const execFileAsync = promisify(execFile);

export async function testDistributedPilot({ tmp }) {
  const outDir = path.join(tmp, 'distributed-pilot-api');
  const proof = await runCodexDistributedPilot({
    outDir,
    runId: 'distributed-pilot-smoke',
    generatedAt: '2026-06-22T00:00:00.000Z'
  });
  assertPilotProof(proof);

  const repoAEvents = await readCodexRunEvents(proof.repos[0].runEventsPath);
  const repoBEvents = await readCodexRunEvents(proof.repos[1].runEventsPath);
  assert.strictEqual(new Set(repoAEvents.map((event) => event.runId)).size, 1);
  assert.strictEqual(new Set(repoBEvents.map((event) => event.runId)).size, 1);
  assert.ok(repoAEvents.some((event) => event.type === 'decision.recorded'));
  assert.ok(repoBEvents.some((event) => event.parents.includes(proof.causalAckParentId)));

  const queueSummary = JSON.parse(await fs.readFile(proof.artifacts.queueSummaryPath, 'utf8'));
  assert.strictEqual(queueSummary.evidence.kind, 'frontier.queue.evidence');
  assert.ok(queueSummary.terminalOutcomeCount >= 1);
  assert.ok(queueSummary.overlay.summary.entryCount >= 1);

  const lease = JSON.parse(await fs.readFile(proof.artifacts.semanticLeasePath, 'utf8'));
  assert.strictEqual(lease.granted, true);
  assert.strictEqual(lease.fenceValid, true);
  assert.ok(lease.fence.leaseId);

  const gateSummary = JSON.parse(await fs.readFile(proof.artifacts.gateSummaryPath, 'utf8'));
  assert.strictEqual(gateSummary.kind, 'frontier.test.gate-evidence');
  assert.strictEqual(gateSummary.failed, 0);
  assert.ok(gateSummary.passed >= 1);

  const telemetrySummary = JSON.parse(await fs.readFile(proof.artifacts.modelTelemetrySummaryPath, 'utf8'));
  assert.strictEqual(telemetrySummary.kind, 'frontier.swarm-codex.model-telemetry-summary');
  assert.ok(telemetrySummary.recordCount >= 1);

  const controller = JSON.parse(await fs.readFile(proof.artifacts.liveRoutingControllerPath, 'utf8'));
  assert.strictEqual(controller.kind, 'frontier.swarm.routing-controller');

  const cliOutDir = path.join(tmp, 'distributed-pilot-cli');
  const { stdout } = await execFileAsync(process.execPath, [
    path.resolve('dist/cli.js'),
    'distributed-pilot',
    '--out-dir',
    cliOutDir,
    '--run-id',
    'distributed-pilot-cli-smoke'
  ], { cwd: path.resolve('.') });
  const cliProof = JSON.parse(stdout);
  assertPilotProof(cliProof);
  await fs.stat(cliProof.proofPath);
}

function assertPilotProof(proof) {
  assert.strictEqual(proof.kind, 'frontier.swarm-codex.distributed-pilot');
  assert.strictEqual(proof.ok, true);
  assert.strictEqual(proof.repoCount, 2);
  assert.strictEqual(proof.gitRepoCount, 2);
  assert.strictEqual(proof.actorCount, 2);
  assert.strictEqual(proof.sharedRunId, true);
  assert.ok(proof.causalAckParentId);
  assert.ok(proof.sync.exchangeCount >= 2);
  assert.ok(proof.sync.acceptedEventCount > 0);
  assert.strictEqual(proof.sync.conflictCount, 0);
  for (const expected of [
    'packageMaintenance',
    'distributedRunPilot',
    'durableQueue',
    'semanticLeases',
    'coordinatorApplyEngine',
    'gateContract',
    'dashboardProjection',
    'telemetryRouting'
  ]) {
    assert.strictEqual(proof.coverage[expected], true, `missing pilot coverage for ${expected}`);
  }
  for (const repo of proof.repos) {
    assert.ok(repo.gitDirExists, `${repo.id} should be a git repository`);
    assert.ok(repo.eventCount >= 10, `${repo.id} should have synced events`);
    assert.deepStrictEqual(repo.runIds, [proof.runId], `${repo.id} should contain only the pilot run id`);
    assert.ok(repo.actorIds.includes('pilot:a'), `${repo.id} should include repo-a actor events`);
    assert.ok(repo.actorIds.includes('pilot:b'), `${repo.id} should include repo-b actor events`);
    assert.ok(repo.dashboardCounts.decision >= 1, `${repo.id} dashboard should include decisions`);
  }
}
