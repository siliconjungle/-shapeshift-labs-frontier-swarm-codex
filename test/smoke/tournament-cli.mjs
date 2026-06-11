import assert from 'node:assert';
import {
  compareCodexSwarmTournaments,
  createCodexSwarmTournamentHistory,
  execFileP,
  fs,
  path,
  queryCodexSwarmTournament,
  runCodexSwarm
} from './context.mjs';

export async function testTournamentCli({ plan, tmp }) {
  const collection = path.join(tmp, 'run', 'collected');
  const tournamentPath = path.join(collection, 'strategy-tournament.json');
  const apiQuery = await queryCodexSwarmTournament({
    collection,
    strategyId: 'style:default-prompt:current:semantic-symbols',
    view: 'standings'
  });
  assert.strictEqual(apiQuery.kind, 'frontier.swarm-codex.tournament-query');
  assert.strictEqual(apiQuery.standings.length, 1);
  assert.strictEqual(apiQuery.semanticImport.summary.selectedCount, 1);
  assert.strictEqual(apiQuery.semanticImport.summary.eligibleCount, 1);
  assert.strictEqual(apiQuery.semanticImport.summary.importedCount, 1);
  assert.strictEqual(apiQuery.semanticImport.summary.candidateCount, 1);
  assert.strictEqual(apiQuery.semanticImport.jobs[0].semanticImportQuality.selected, 1);
  assert.strictEqual(apiQuery.semanticImport.jobs[0].semanticImportQuality.candidates, 1);
  const apiBandit = await queryCodexSwarmTournament({ collection, view: 'bandit', limit: 1 });
  assert.strictEqual(apiBandit.view, 'bandit');
  assert.strictEqual(apiBandit.bandit.kind, 'frontier.swarm.contextual-bandit-recommendations');
  assert.ok(apiBandit.bandit.summary.recommendationCount >= 1);
  assert.strictEqual(apiBandit.bandit.summary.shownRecommendationCount, 1);

  const history = await createCodexSwarmTournamentHistory({ tournaments: [tournamentPath] });
  assert.strictEqual(history.history.summary.tournamentCount, 1);
  const comparison = await compareCodexSwarmTournaments({
    baseline: tournamentPath,
    current: tournamentPath,
    scoreThreshold: 1
  });
  assert.strictEqual(comparison.comparison.summary.stableCount, 1);

  const cli = new URL('../../dist/cli.js', import.meta.url).pathname;
  const query = JSON.parse((await execFileP(process.execPath, [
    cli,
    'tournament',
    'query',
    '--collection',
    collection,
    '--strategy',
    'style:default-prompt:current:semantic-symbols',
    '--view',
    'standings',
    '--limit',
    '1'
  ])).stdout);
  assert.strictEqual(query.summary.matchCount, 1);
  assert.strictEqual(query.standings.length, 1);
  assert.strictEqual(query.semanticImport.summary.selectedCount, 1);
  assert.strictEqual(query.semanticImport.jobs[0].semanticImportQuality.imported, 1);
  const banditQuery = JSON.parse((await execFileP(process.execPath, [
    cli,
    'tournament',
    'query',
    '--collection',
    collection,
    '--view',
    'bandit',
    '--limit',
    '1'
  ])).stdout);
  assert.strictEqual(banditQuery.view, 'bandit');
  assert.strictEqual(banditQuery.bandit.recommendations.length, 1);
  assert.strictEqual(banditQuery.semanticImport.summary.importedCount, 1);

  const cliHistory = JSON.parse((await execFileP(process.execPath, [
    cli,
    'tournament',
    'history',
    '--collection',
    collection
  ])).stdout);
  assert.strictEqual(cliHistory.history.summary.tournamentCount, 1);

  await writePatchScoreCalibrationFixture(collection);
  const feedbackOut = path.join(tmp, 'tournament-feedback');
  const feedback = JSON.parse((await execFileP(process.execPath, [
    cli,
    'tournament',
    'feedback',
    '--collection',
    collection,
    '--score-floor',
    '100',
    '--outDir',
    feedbackOut
  ])).stdout);
  assert.strictEqual(feedback.kind, 'frontier.swarm.tournament-adaptive-feedback');
  assert.ok(feedback.observations.length >= 1);
  assert.ok(feedback.observations.some((entry) => entry.metadata?.source === 'patch-score-calibration'));
  assert.ok(feedback.observations.some((entry) => entry.kind === 'semantic-weak'));
  assert.strictEqual(feedback.metadata.calibrationFeedback.falsePositiveClean, 1);
  assert.strictEqual(feedback.metadata.calibrationFeedback.falsePositiveSemanticAutoMergeCandidates, 1);
  assert.ok(await existsFile(path.join(feedbackOut, 'tournament-feedback.json')));

  const customFeedback = path.join(tmp, 'custom-tournament-feedback.json');
  await fs.writeFile(customFeedback, JSON.stringify({
    observations: [{
      kind: 'log-noise',
      severity: 'warning',
      at: 1,
      value: 5,
      reason: 'fixture feedback'
    }]
  }, null, 2) + '\n');
  await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'feedback-run'),
    cwd: tmp,
    maxConcurrency: 2,
    adaptiveConcurrency: true,
    adaptiveFeedbackPath: customFeedback,
    dryRun: true
  });
  const adaptive = JSON.parse(await fs.readFile(path.join(tmp, 'feedback-run', 'adaptive-load.json'), 'utf8'));
  assert.ok(adaptive.latest.observations.some((entry) => entry.reasons.includes('fixture feedback')));
}

async function existsFile(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function writePatchScoreCalibrationFixture(collection) {
  await fs.mkdir(path.join(collection, 'patch-scores'), { recursive: true });
  await fs.writeFile(path.join(collection, 'patch-scores', 'patch-score.json'), JSON.stringify({
    calibration: {
      source: 'apply-ledger',
      landedJobIds: ['landed-clean'],
      predictedCleanJobIds: ['landed-clean', 'false-clean'],
      truePositiveCleanJobIds: ['landed-clean'],
      falsePositiveCleanJobIds: ['false-clean'],
      falseNegativeCleanJobIds: [],
      landedNeedsPortJobIds: [],
      semanticAutoMergeCandidateJobIds: ['landed-clean', 'false-semantic'],
      landedSemanticAutoMergeCandidateJobIds: ['landed-clean'],
      falsePositiveSemanticAutoMergeCandidateJobIds: ['false-semantic'],
      semanticAutoMergeCandidatePrecision: 0.5,
      precision: 0.5,
      recall: 1,
      summary: {
        landed: 1,
        predictedClean: 2,
        truePositiveClean: 1,
        falsePositiveClean: 1,
        falseNegativeClean: 0,
        landedNeedsPort: 0,
        semanticAutoMergeCandidates: 2,
        landedSemanticAutoMergeCandidates: 1,
        falsePositiveSemanticAutoMergeCandidates: 1
      }
    }
  }, null, 2) + '\n');
}
