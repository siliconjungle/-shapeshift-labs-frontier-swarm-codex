import assert from 'node:assert';
import { fs, path, readCodexRunEvents } from './context.mjs';

export async function assertApplyEvidence(applyResult, expected) {
  assert.equal(typeof applyResult.gateExecutionsPath, 'string');
  assert.equal(typeof applyResult.gateSummaryPath, 'string');
  assert.equal(typeof applyResult.runEventsPath, 'string');
  assert.equal(typeof applyResult.runDashboardPath, 'string');
  assert.ok(applyResult.evidence.gateExecutionCount >= expected.gateKinds.length);
  assert.ok(applyResult.evidence.runEventCount >= 2);
  const gateExecutions = (await fs.readFile(applyResult.gateExecutionsPath, 'utf8'))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.ok(gateExecutions.every((record) => record.kind === 'frontier.test.gate-execution'));
  for (const kind of expected.gateKinds) {
    assert.ok(gateExecutions.some((record) => record.gateKind === kind), `missing gate kind ${kind}`);
  }
  const summary = JSON.parse(await fs.readFile(applyResult.gateSummaryPath, 'utf8'));
  assert.equal(summary.kind, 'frontier.test.gate-evidence');
  assert.equal(summary.total, gateExecutions.length);
  const runEvents = await readCodexRunEvents(applyResult.runEventsPath);
  assert.ok(runEvents.some((event) => event.type === 'run.created'));
  for (const decision of expected.decisions) {
    assert.ok(runEvents.some((event) => event.type === 'decision.recorded' && event.payload.decision?.decision === decision), `missing run decision ${decision}`);
  }
  const dashboard = JSON.parse(await fs.readFile(applyResult.runDashboardPath, 'utf8'));
  assert.equal(dashboard.kind, 'frontier.run.dashboard');
  const onDiskLedger = JSON.parse(await fs.readFile(path.join(applyResult.outDir, 'apply-ledger.json'), 'utf8'));
  assert.equal(onDiskLedger.gateExecutionsPath, applyResult.gateExecutionsPath);
  assert.equal(onDiskLedger.runEventsPath, applyResult.runEventsPath);
}
