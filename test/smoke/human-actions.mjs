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

  const collection = await collectCodexSwarmRun({ run: runDir, checkStale: false });
  const dashboardActions = collection.dashboard.metadata.humanActions;
  assert.strictEqual(dashboardActions.length, 1);
  assert.strictEqual(dashboardActions[0].code, 'Q-RETRY');

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
  const nonBlockingCollection = await collectCodexSwarmRun({ run: nonBlockingRunDir, checkStale: false });
  const nonBlockingSnapshot = await readCodexDashboardSnapshot({ collection: nonBlockingCollection.outDir });
  assert.strictEqual(nonBlockingSnapshot.humanActions.length, 0);
}
