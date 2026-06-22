import assert from 'node:assert';
import {
  continueCodexSwarmLoop,
  createCodexSwarmPlan,
  execFileP,
  fs,
  manifestInput,
  path,
  readCodexRunEvents,
  renderCodexPrompt
} from './context.mjs';

export async function testHumanActionAnswers({ tmp }) {
  const collectionDir = path.join(tmp, 'human-answer-collection');
  await fs.mkdir(collectionDir, { recursive: true });
  const collection = createHumanQuestionCollection(collectionDir);
  await fs.writeFile(path.join(collectionDir, 'collection.json'), JSON.stringify(collection, null, 2) + '\n');
  await fs.writeFile(path.join(collectionDir, 'human-action-answers.jsonl'), JSON.stringify({
    code: 'Q-RETRY',
    answer: 'yes, retry after ten minutes',
    answeredAt: '2026-06-16T00:00:00.000Z'
  }) + '\n');

  const continuation = await continueCodexSwarmLoop({
    collection: collectionDir,
    outDir: path.join(tmp, 'human-answer-continuation'),
    backlog: {
      id: 'human-answer-backlog',
      entries: [{
        id: 'runtime-action',
        title: 'Runtime action',
        taskId: 'runtime-action',
        status: 'ready',
        lane: 'runtime',
        targetRefs: ['src/runtime/action.ts']
      }]
    },
    manifest: manifestInput,
    tasks: { items: [{ id: 'runtime-action', lane: 'runtime', targetRefs: ['src/runtime/action.ts'] }] },
    routingMode: 'fill'
  });

  assert.strictEqual(continuation.summary.humanActions.actionCount, 1);
  assert.strictEqual(continuation.summary.humanActions.answerCount, 1);
  assert.strictEqual(continuation.summary.humanActions.answeredActionCount, 1);
  assert.strictEqual(continuation.summary.humanActions.openActionCount, 0);
  assert.strictEqual(continuation.summary.terminalOutcomeProjection.answeredHumanBlockerEntryCount, 1);
  assert.strictEqual(continuation.summary.terminalOutcomeProjection.answeredHumanBlockerTaskCount, 1);
  assert.strictEqual(continuation.nextBacklog.entries[0].status, 'ready');
  assert.ok(continuation.nextBacklog.entries[0].tags.includes('human-answer:answered'));
  assert.strictEqual(continuation.nextBacklog.entries[0].metadata.terminalOutcome.humanAnswer.answer, 'yes, retry after ten minutes');
  assert.ok(continuation.summary.nextJobTaskIds.includes('runtime-action'));
  const nextJob = continuation.nextPlan.jobs.find((job) => job.taskId === 'runtime-action');
  assert.strictEqual(nextJob.task.metadata.terminalOutcome.humanAnswer.answer, 'yes, retry after ten minutes');
  const nextPrompt = renderCodexPrompt(nextJob, { workspacePath: tmp, paths: promptPaths(tmp) });
  assert.ok(nextPrompt.includes('Resolved human answers:'));
  assert.ok(nextPrompt.includes('Q-RETRY Choose retry policy: yes, retry after ten minutes'));
  assert.ok(nextPrompt.includes('Do not ask the same human question again'));
  const nextTasks = JSON.parse(await fs.readFile(continuation.nextTasksPath, 'utf8'));
  assert.strictEqual(nextTasks.items[0].metadata.terminalOutcome.humanAnswer.answer, 'yes, retry after ten minutes');
  assert.strictEqual(continuation.humanActions[0].status, 'answered');
  assert.strictEqual(continuation.humanActions[0].answer, 'yes, retry after ten minutes');
  assert.ok(await fileExists(continuation.humanActionStatePath));

  const distributedContinuation = await continueCodexSwarmLoop({
    collection: collectionDir,
    outDir: path.join(tmp, 'human-answer-distributed-continuation'),
    humanAnswers: [{ code: 'Q-RETRY', answer: 'distributed yes' }],
    distributedRun: true,
    manifest: manifestInput,
    tasks: { items: [{ id: 'runtime-action', lane: 'runtime', targetRefs: ['src/runtime/action.ts'] }] },
    routingMode: 'fill'
  });
  assert.ok(distributedContinuation.distributedRun);
  assert.ok(distributedContinuation.runEventsPath.endsWith(path.join('.frontier-run', collection.dashboard.plan.runId, 'run-events.jsonl')));
  assert.strictEqual(distributedContinuation.summary.paths.distributedRunDir, distributedContinuation.distributedRun.paths.runDir);
  const continuationEvents = await readCodexRunEvents(distributedContinuation.runEventsPath);
  assert.ok(continuationEvents.some((event) => event.payload?.node?.kind === 'human-question' && event.payload.node.status === 'answered' && event.payload.node.answer === 'distributed yes'));
  assert.ok(continuationEvents.some((event) => event.payload?.decision?.decision === 'human-question' && event.payload.decision.metadata?.answer === 'distributed yes'));
  assert.ok(continuationEvents.some((event) => event.payload?.decision?.metadata?.source === 'frontier-swarm-codex.continuation' && event.payload.decision.metadata.nextJobCount === 1));

  const cli = new URL('../../dist/cli.js', import.meta.url).pathname;
  const cliAnswerPath = path.join(tmp, 'human-answer-cli.json');
  const cliManifestPath = path.join(tmp, 'human-answer-manifest.json');
  const cliTasksPath = path.join(tmp, 'human-answer-tasks.json');
  await fs.writeFile(cliAnswerPath, JSON.stringify([{ code: 'Q-RETRY', answer: 'no' }], null, 2) + '\n');
  await fs.writeFile(cliManifestPath, JSON.stringify(manifestInput, null, 2) + '\n');
  await fs.writeFile(cliTasksPath, JSON.stringify({ items: [{ id: 'runtime-action', lane: 'runtime', targetRefs: ['src/runtime/action.ts'] }] }, null, 2) + '\n');
  const cliOut = path.join(tmp, 'human-answer-cli-continuation');
  const cliContinuation = await execFileP(process.execPath, [
    cli,
    'continue',
    '--collection',
    collectionDir,
    '--human-answers',
    cliAnswerPath,
    '--manifest',
    cliManifestPath,
    '--tasks',
    cliTasksPath,
    '--outDir',
    cliOut
  ], { cwd: tmp });
  const parsed = JSON.parse(cliContinuation.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.summary.humanActions.answerCount, 2);
  assert.strictEqual(parsed.summary.humanActions.openActionCount, 0);

  const lifetimeAnswerDir = path.join(tmp, 'agent-runs', 'loom-ui-human-actions');
  await fs.mkdir(lifetimeAnswerDir, { recursive: true });
  await fs.writeFile(path.join(lifetimeAnswerDir, 'human-action-answers.jsonl'), JSON.stringify({
    type: 'human-action.answer',
    code: 'Q-RETRY',
    answer: 'use the lifetime dashboard answer',
    at: Date.parse('2026-06-16T00:01:00.000Z'),
    source: 'frontier-loom-ui'
  }) + '\n');
  const lifetimeContinuation = await continueCodexSwarmLoop({
    collection: collectionDir,
    cwd: tmp,
    outDir: path.join(tmp, 'human-answer-lifetime-continuation'),
    manifest: manifestInput,
    tasks: { items: [{ id: 'runtime-action', lane: 'runtime', targetRefs: ['src/runtime/action.ts'] }] },
    routingMode: 'fill'
  });
  assert.ok(lifetimeContinuation.summary.humanActions.answerPaths.some((entry) => entry.endsWith('agent-runs/loom-ui-human-actions/human-action-answers.jsonl')));
  assert.strictEqual(lifetimeContinuation.humanActions[0].answer, 'use the lifetime dashboard answer');
}

function createHumanQuestionCollection(collectionDir) {
  const plan = createCodexSwarmPlan({
    manifest: manifestInput,
    tasks: { items: [{ id: 'runtime-action', lane: 'runtime', targetRefs: ['src/runtime/action.ts'] }] }
  });
  const generatedAt = Date.parse('2026-06-16T00:00:00.000Z');
  return {
    kind: 'frontier-swarm-codex.collection',
    version: 1,
    ok: true,
    runDir: collectionDir,
    outDir: collectionDir,
    generatedAt,
    buckets: { 'ready-to-apply': [], 'needs-human-port': [], 'rerun-work': [], 'failed-evidence': [], 'stale-against-head': [] },
    mergeIndex: { entries: [], generatedAt },
    queueOverlay: { entries: [], summary: { total: 0 } },
    queueOutcomeModel: {
      latestDecisionIdByAlias: { 'runtime-action': 'decision-runtime-action', 'task:runtime-action': 'decision-runtime-action' },
      decisions: [{
        id: 'decision-runtime-action',
        subjectId: 'runtime-action',
        decision: 'human-question',
        category: 'human-blocked',
        outcome: 'human-question',
        terminal: false,
        closesSubject: false,
        coordinatorReview: false,
        humanBlocked: true,
        conflict: false,
        reviewDebt: false,
        reasons: ['human-question'],
        generatedAt
      }],
      summary: { latestDecisionCount: 1 }
    },
    strategyTournament: { summary: { strategyCount: 0, gameCount: 0, matchCount: 0, verifiedCount: 0, rejectedCount: 0, undefinedCount: 0, sampleConfidence: 0, decisionGrade: 'none' } },
    strategyHistory: { entries: [] },
    tournamentAdaptiveFeedback: { summary: { observationCount: 0, recommendationCount: 0 }, observations: [], recommendations: [] },
    evidenceIndex: { entries: [] },
    admission: { decisions: [], summary: {} },
    dashboard: {
      generatedAt,
      plan,
      metadata: {
        humanActions: [{
          kind: 'human-question',
          type: 'question',
          status: 'open',
          priority: 'blocking',
          code: 'Q-RETRY',
          title: 'Choose retry policy',
          question: 'Should stalled workers be retried automatically after ten minutes?',
          requestedAnswer: 'Answer Q-RETRY with yes or no.',
          taskId: 'runtime-action',
          jobId: 'runtime-runtime-action',
          lane: 'runtime'
        }]
      }
    },
    compactDashboard: {},
    semanticImport: {},
    semanticEditAdmission: {},
    semanticEditScriptAdmission: {},
    semanticPatchBundleOverlaps: {},
    qualitySignals: {},
    noiseBreakdown: {},
    summary: { total: 0, 'ready-to-apply': 0, 'needs-human-port': 0, 'rerun-work': 0, 'failed-evidence': 0, 'stale-against-head': 0 }
  };
}

async function fileExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function promptPaths(tmp) {
  const jobDir = path.join(tmp, 'answered-human-prompt-job');
  return {
    jobDir,
    promptPath: path.join(jobDir, 'prompt.md'),
    eventsPath: path.join(jobDir, 'events.jsonl'),
    stderrPath: path.join(jobDir, 'stderr.log'),
    lastMessagePath: path.join(jobDir, 'last.md'),
    evidenceDir: path.join(jobDir, 'evidence'),
    resourceAllocationPath: path.join(jobDir, 'resource-allocation.json'),
    contextBudgetPath: path.join(jobDir, 'context-budget.json'),
    workspaceProofPath: path.join(jobDir, 'workspace-proof.json'),
    patchPath: path.join(jobDir, 'changes.patch'),
    mergeBundlePath: path.join(jobDir, 'merge.json'),
    patchIntentPath: path.join(jobDir, 'patch-intent.json'),
    logSummaryPath: path.join(jobDir, 'log-summary.json'),
    pidManifestPath: path.join(jobDir, 'pids.json')
  };
}
