import assert from 'node:assert';
import {
  collectCodexSwarmRun,
  fs,
  path,
  renderCodexPrompt,
  runCodexSwarm
} from './context.mjs';

export async function testContextBudget({ plan, tmp, paths }) {
  testPromptWriteContract(plan, tmp, paths);
  await testAdaptiveFeedbackRoutingSignals(plan, tmp);
  await testFailBeforeLaunch(plan, tmp);
  await testActualUsageWarning(plan, tmp);
}

function testPromptWriteContract(plan, tmp, paths) {
  const prompt = renderCodexPrompt(plan.jobs[0], { workspacePath: tmp, paths });
  assert.ok(prompt.includes('Source edits: only allowed write globs.'));
  assert.ok(prompt.includes('For out-of-scope or cross-stream needs, write an evidence handoff naming target lane, target files, and rationale; do not patch them.'));
  assert.ok(prompt.includes('Strict runs restore unauthorized source writes before verification and mark the job failed.'));
  assert.ok(prompt.includes('Cite real commands/evidence; never fake success.'));
}

async function testAdaptiveFeedbackRoutingSignals(plan, tmp) {
  const feedbackPath = path.join(tmp, 'adaptive-feedback-routing-signals.json');
  await fs.writeFile(feedbackPath, JSON.stringify({
    observations: [{
      kind: 'healthy-throughput',
      severity: 'info',
      value: 1,
      metadata: {
        taskKind: 'runtime action',
        workKind: 'runtime action',
        lane: 'runtime',
        modelTier: 'deep'
      }
    }]
  }, null, 2) + '\n');
  const { readAdaptiveFeedbackObservations } = await import('../../dist/codex-adaptive-feedback.js');
  const observations = await readAdaptiveFeedbackObservations({
    outDir: tmp,
    cwd: tmp,
    adaptiveFeedbackPath: feedbackPath,
    adaptiveObservations: [{
      kind: 'log-noise',
      severity: 'warning',
      metadata: {
        routingKey: {
          taskKind: 'source audit',
          workKind: 'source audit',
          lane: 'static-check',
          modelTier: 'fast'
        }
      }
    }, {
      kind: 'healthy-throughput',
      severity: 'info',
      metadata: {
        routing: {
          taskKind: ' implementation ',
          workKind: ' adaptive-routing ',
          lane: ' routing-feedback ',
          modelTier: ' deep '
        }
      }
    }]
  });
  assert.strictEqual(observations.length, 3);
  assert.strictEqual(observations[0].lane, 'static-check');
  assert.strictEqual(observations[0].metadata.routingKey.taskKind, 'source audit');
  assert.strictEqual(observations[0].metadata.routingKey.workKind, 'source audit');
  assert.strictEqual(observations[0].metadata.routingKey.modelTier, 'fast');
  assert.strictEqual(observations[1].lane, 'routing-feedback');
  assert.strictEqual(observations[1].metadata.routingKey.taskKind, 'implementation');
  assert.strictEqual(observations[1].metadata.routingKey.workKind, 'adaptive-routing');
  assert.strictEqual(observations[1].metadata.routingKey.modelTier, 'deep');
  assert.strictEqual(observations[2].lane, 'runtime');
  assert.strictEqual(observations[2].metadata.routingKey.taskKind, 'runtime action');
  assert.strictEqual(observations[2].metadata.routingKey.workKind, 'runtime action');
  assert.strictEqual(observations[2].metadata.routingKey.modelTier, 'deep');
  const tournamentStrategyObservation = (await readAdaptiveFeedbackObservations({
    outDir: tmp,
    cwd: tmp,
    adaptiveObservations: [{
      kind: 'healthy-throughput',
      severity: 'info',
      metadata: {
        tournamentStrategy: {
          routingKey: {
            taskKind: 'implementation',
            workKind: 'routing-feedback',
            lane: 'routing-feedback',
            modelTier: 'deep'
          }
        }
      }
    }]
  }))[0];
  assert.strictEqual(tournamentStrategyObservation.lane, 'routing-feedback');
  assert.strictEqual(tournamentStrategyObservation.metadata.routingKey.taskKind, 'implementation');
  assert.strictEqual(tournamentStrategyObservation.metadata.routingKey.workKind, 'routing-feedback');
  assert.strictEqual(tournamentStrategyObservation.metadata.workKind, 'routing-feedback');

  const { createCodexTournamentStrategyMetadata } = await import('../../dist/codex-tournament-strategy.js');
  const job = {
    ...plan.jobs[0],
    lane: ` ${plan.jobs[0].lane} `,
    task: {
      ...plan.jobs[0].task,
      workKind: ` ${plan.jobs[0].task.workKind} `
    },
    compute: {
      ...plan.jobs[0].compute,
      metadata: { ...(plan.jobs[0].compute.metadata ?? {}), modelTier: ' deep ' }
    }
  };
  const strategy = createCodexTournamentStrategyMetadata({
    job,
    workspaceMode: 'current',
    customPrompt: false,
    logSummary: {
      eventBytes: 10,
      stderrBytes: 0,
      eventBytesTruncated: 0,
      stderrBytesTruncated: 0,
      eventBytesWritten: 10,
      stderrBytesWritten: 0
    }
  });
  assert.strictEqual(strategy.taskKind, plan.jobs[0].task.workKind);
  assert.strictEqual(strategy.workKind, plan.jobs[0].task.workKind);
  assert.strictEqual(strategy.lane, plan.jobs[0].lane);
  assert.strictEqual(strategy.modelTier, 'deep');
  assert.deepStrictEqual(strategy.routingKey, {
    taskKind: plan.jobs[0].task.workKind,
    workKind: plan.jobs[0].task.workKind,
    lane: plan.jobs[0].lane,
    modelTier: 'deep'
  });

  const adaptiveSource = await fs.readFile(new URL('../../src/codex-adaptive-feedback.ts', import.meta.url), 'utf8');
  assert.ok(adaptiveSource.includes('routingKey'));
  assert.ok(adaptiveSource.includes('taskKind'));
  assert.ok(adaptiveSource.includes('workKind'));
  assert.ok(adaptiveSource.includes('modelTier'));
  const tournamentSource = await fs.readFile(new URL('../../src/codex-tournament-strategy.ts', import.meta.url), 'utf8');
  assert.ok(tournamentSource.includes('routingKey'));
  assert.ok(tournamentSource.includes('workKind'));
  assert.ok(tournamentSource.includes('modelTierForJob'));
}

async function testFailBeforeLaunch(plan, tmp) {
  let executorCalled = false;
  const result = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'context-budget-fail'),
    cwd: tmp,
    maxConcurrency: 1,
    dependencyHealth: false,
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
  assert.ok(evidence.contextBudget.errors.some((entry) => entry.includes('autosplit oversized prompt/log context')));
  const intent = await readIntent(result);
  assert.strictEqual(intent.contextBudget.action, 'fail-before-launch');
  assert.ok(intent.warnings.some((entry) => entry.includes('estimated input tokens')));
  assert.ok(intent.warnings.some((entry) => entry.includes('autosplit oversized prompt/log context')));
  const collection = await collectCodexSwarmRun({ run: path.join(tmp, 'context-budget-fail'), checkStale: false });
  assert.strictEqual(collection.summary['failed-evidence'], 1);
  assert.strictEqual(collection.compactDashboard.contextBudget.failedCount, 1);
}

async function testActualUsageWarning(plan, tmp) {
  const result = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'context-budget-usage'),
    cwd: tmp,
    maxConcurrency: 1,
    dependencyHealth: false,
    contextBudget: { mode: 'warn', warnActualInputTokens: 10 },
    executor: async (input) => {
      await fs.writeFile(input.paths.eventsPath, JSON.stringify({
        usage: {
          input_tokens: 555,
          input_tokens_details: { cached_tokens: 100 },
          output_tokens: 7
        }
      }) + '\n');
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
  assert.strictEqual(budget.usage.cachedInputTokens, 100);
  assert.strictEqual(budget.usage.uncachedInputTokens, 455);
  assert.ok(budget.warnings.some((entry) => entry.includes('actual input tokens')));
  assert.ok(budget.warnings.some((entry) => entry.includes('autosplit oversized prompt/log context')));
  assert.ok(budget.warnings.some((entry) => entry.includes('uncached prompt and log deltas')));
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
