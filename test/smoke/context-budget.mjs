import assert from 'node:assert';
import {
  collectCodexSwarmRun,
  fs,
  path,
  runCodexSwarm
} from './context.mjs';

export async function testContextBudget({ plan, tmp }) {
  await testFailBeforeLaunch(plan, tmp);
  await testActualUsageWarning(plan, tmp);
}

async function testFailBeforeLaunch(plan, tmp) {
  let executorCalled = false;
  const result = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'context-budget-fail'),
    cwd: tmp,
    maxConcurrency: 1,
    contextBudget: { mode: 'fail', maxEstimatedInputTokens: 1 },
    executor: async () => {
      executorCalled = true;
      return { exitCode: 0, changedPaths: [] };
    }
  });
  assert.strictEqual(executorCalled, false);
  assert.strictEqual(result.ok, false);
  const evidence = await readEvidence(result);
  assert.strictEqual(evidence.contextBudget.status, 'failed');
  assert.ok(evidence.contextBudget.errors.some((entry) => entry.includes('estimated input tokens')));
  const intent = await readIntent(result);
  assert.strictEqual(intent.contextBudget.action, 'fail-before-launch');
  assert.ok(intent.warnings.some((entry) => entry.includes('estimated input tokens')));
  const collection = await collectCodexSwarmRun({ run: path.join(tmp, 'context-budget-fail'), checkStale: false });
  assert.strictEqual(collection.summary['failed-evidence'], 1);
  assert.strictEqual(collection.compactDashboard.contextBudget.failedCount, 1);
}

async function testActualUsageWarning(plan, tmp) {
  const result = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'context-budget-usage'),
    cwd: tmp,
    maxConcurrency: 1,
    contextBudget: { mode: 'warn', warnActualInputTokens: 10 },
    executor: async (input) => {
      await fs.writeFile(input.paths.eventsPath, JSON.stringify({ usage: { input_tokens: 555, output_tokens: 7 } }) + '\n');
      await fs.writeFile(input.paths.lastMessagePath, 'usage warning\n');
      return { exitCode: 0, changedPaths: [], lastMessage: 'usage warning' };
    }
  });
  assert.strictEqual(result.ok, true);
  const budgetPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('context-budget.json'));
  assert.ok(budgetPath);
  const budget = JSON.parse(await fs.readFile(budgetPath, 'utf8'));
  assert.strictEqual(budget.status, 'warning');
  assert.strictEqual(budget.usage.inputTokens, 555);
  assert.ok(budget.warnings.some((entry) => entry.includes('actual input tokens')));
}

async function readEvidence(result) {
  const file = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('evidence.json'));
  assert.ok(file);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function readIntent(result) {
  const file = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('patch-intent.json'));
  assert.ok(file);
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
