import assert from 'node:assert';
import {
  collectCodexSwarmRun,
  fs,
  path,
  readCodexDashboardSnapshot,
  runCodexSwarm
} from './context.mjs';

export async function testHumanActionArtifacts({ plan, tmp }) {
  const runDir = path.join(tmp, 'human-action-run');
  const result = await runCodexSwarm(plan, {
    outDir: runDir,
    cwd: tmp,
    dryRun: false,
    executor: async (input) => {
      const questionPath = path.join(input.paths.evidenceDir, 'human-question.json');
      await fs.mkdir(input.paths.evidenceDir, { recursive: true });
      await fs.writeFile(questionPath, JSON.stringify({
        code: 'Q-RETRY',
        title: 'Choose retry policy',
        question: 'Should stalled workers be retried automatically after ten minutes?',
        detail: 'The worker cannot choose this product policy safely.',
        requestedAnswer: 'Answer Q-RETRY with yes or no.',
        options: [{ label: 'yes' }, { label: 'no' }]
      }, null, 2) + '\n');
      await fs.writeFile(input.paths.lastMessagePath, 'asked human question\n');
      return { exitCode: 0, changedPaths: [], lastMessage: 'asked human question' };
    }
  });
  assert.strictEqual(result.ok, true);
  assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('human-question.json')));
  assert.strictEqual(result.run.results[0].metadata.humanActions[0].code, 'Q-RETRY');
  assert.strictEqual(result.humanActionEventsPath, path.join(runDir, 'human-actions.jsonl'));
  assert.strictEqual(result.humanActionStatePath, path.join(runDir, 'human-actions-state.json'));
  assert.strictEqual(result.modelTelemetryPath, path.join(runDir, 'model-telemetry.jsonl'));
  assert.strictEqual(result.modelTelemetrySummaryPath, path.join(runDir, 'model-telemetry-summary.json'));

  const humanEvents = (await fs.readFile(result.humanActionEventsPath, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.strictEqual(humanEvents.length, 1);
  assert.strictEqual(humanEvents[0].eventType, 'human-action.opened');
  assert.strictEqual(humanEvents[0].code, 'Q-RETRY');

  const brokerState = JSON.parse(await fs.readFile(result.humanActionStatePath, 'utf8'));
  assert.strictEqual(brokerState.kind, 'frontier.swarm-codex.human-action-state');
  assert.strictEqual(brokerState.actionCount, 1);
  assert.strictEqual(brokerState.openActionCount, 1);
  assert.strictEqual(brokerState.actions[0].code, 'Q-RETRY');

  const telemetryRecords = (await fs.readFile(result.modelTelemetryPath, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.strictEqual(telemetryRecords.length, 1);
  assert.strictEqual(telemetryRecords[0].humanActionCount, 1);
  assert.strictEqual(telemetryRecords[0].openHumanActionCount, 1);
  const telemetrySummary = JSON.parse(await fs.readFile(result.modelTelemetrySummaryPath, 'utf8'));
  assert.strictEqual(telemetrySummary.humanActionCount, 1);
  assert.strictEqual(telemetrySummary.openHumanActionCount, 1);

  const runSnapshot = await readCodexDashboardSnapshot({ run: runDir });
  assert.strictEqual(runSnapshot.humanActions.length, 1);
  assert.strictEqual(runSnapshot.humanActions[0].code, 'Q-RETRY');
  assert.strictEqual(runSnapshot.summary.humanActionBrokerOpenCount, 1);

  const collection = await collectCodexSwarmRun({ run: runDir, checkStale: false });
  const dashboardActions = collection.dashboard.metadata.humanActions;
  assert.strictEqual(dashboardActions.length, 1);
  assert.strictEqual(dashboardActions[0].code, 'Q-RETRY');
  assert.strictEqual(collection.metadata.humanActionState.openActionCount, 1);
  assert.strictEqual(collection.dashboard.metadata.humanActionState.openActionCount, 1);
  assert.strictEqual(collection.dashboard.summary.humanActionBrokerOpenCount, 1);
  assert.strictEqual(collection.dashboard.summary.modelTelemetryRecordCount, 1);

  const snapshot = await readCodexDashboardSnapshot({ collection: collection.outDir });
  assert.strictEqual(snapshot.humanActions.length, 1);
  assert.strictEqual(snapshot.humanActions[0].code, 'Q-RETRY');
  assert.strictEqual(snapshot.humanActions[0].requestedAnswer, 'Answer Q-RETRY with yes or no.');

  const nonBlockingRunDir = path.join(tmp, 'human-action-nonblocking-run');
  const nonBlockingResult = await runCodexSwarm(plan, {
    outDir: nonBlockingRunDir,
    cwd: tmp,
    dryRun: false,
    executor: async (input) => {
      const questionPath = path.join(input.paths.evidenceDir, 'human-question.json');
      await fs.mkdir(input.paths.evidenceDir, { recursive: true });
      await fs.writeFile(questionPath, JSON.stringify({
        code: 'Q-NONBLOCKING',
        title: 'Record safe assumption',
        question: 'Should the worker use the existing retry default?',
        detail: 'This is answerable from repository defaults and should not interrupt the human.',
        safeToProceedWithoutAnswer: true,
        requestedAnswer: 'No answer needed.'
      }, null, 2) + '\n');
      await fs.writeFile(input.paths.lastMessagePath, 'recorded non-blocking question-shaped evidence\n');
      return { exitCode: 0, changedPaths: [], lastMessage: 'recorded non-blocking question-shaped evidence' };
    }
  });
  assert.strictEqual(nonBlockingResult.ok, true);
  assert.strictEqual(nonBlockingResult.run.results[0].metadata.humanActions[0].status, 'dismissed');
  assert.strictEqual(nonBlockingResult.run.results[0].metadata.humanActions[0].humanQuestionInvalidReason, 'safe-to-proceed-without-answer');
  const nonBlockingBrokerState = JSON.parse(await fs.readFile(nonBlockingResult.humanActionStatePath, 'utf8'));
  assert.strictEqual(nonBlockingBrokerState.actionCount, 1);
  assert.strictEqual(nonBlockingBrokerState.openActionCount, 0);
  assert.strictEqual(nonBlockingBrokerState.dismissedActionCount, 1);
  const nonBlockingCollection = await collectCodexSwarmRun({ run: nonBlockingRunDir, checkStale: false });
  const nonBlockingSnapshot = await readCodexDashboardSnapshot({ collection: nonBlockingCollection.outDir });
  assert.strictEqual(nonBlockingSnapshot.humanActions.length, 0);
}
