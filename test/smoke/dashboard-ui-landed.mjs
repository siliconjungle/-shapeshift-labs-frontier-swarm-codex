import assert from 'node:assert';
import {
  createCodexDashboardSteeringIntent,
  fs,
  path,
  queryCodexSwarmCollection,
  readCodexDashboardSnapshot,
  writeCodexDashboardSteeringIntent
} from './context.mjs';

export async function runDashboardLandedAndSteeringSmoke(context, collectionDir) {
  await assertLegacyCollection(context.tmp);
  await assertLandedCollection(context.tmp);
  await assertSteeringIntent(context.tmp, collectionDir);
}

async function assertLegacyCollection(tmp) {
  const collectionDir = path.join(tmp, 'legacy-collection');
  await fs.mkdir(collectionDir, { recursive: true });
  await fs.writeFile(path.join(collectionDir, 'collection.json'), JSON.stringify({
    ok: true,
    summary: { total: 1, 'ready-to-apply': 1, 'needs-human-port': 0, 'failed-evidence': 0, 'stale-against-head': 0 },
    buckets: {
      'ready-to-apply': [{
        bucket: 'ready-to-apply',
        jobId: 'legacy-job',
        outputDir: collectionDir,
        bundle: {
          jobId: 'legacy-job',
          taskId: 'legacy-task',
          lane: 'runtime',
          status: 'completed',
          mergeReadiness: 'verified-patch',
          disposition: 'ready-to-apply',
          changedPaths: [],
          ownershipViolations: [],
          evidencePaths: [],
          reasons: [],
          metadata: {
            contextBudget: {
              status: 'ok',
              measured: { promptBytes: 1000, estimatedInputTokens: 250 },
              usage: { inputTokens: 400, cachedInputTokens: 125, uncachedInputTokens: 275 },
              warnings: [],
              errors: []
            },
            logSummary: { eventBytes: 20, eventBytesTruncated: 0, stderrBytes: 5, stderrBytesTruncated: 0 }
          }
        }
      }],
      'needs-human-port': [],
      'failed-evidence': [],
      'stale-against-head': []
    }
  }, null, 2) + '\n');
  const snapshot = await readCodexDashboardSnapshot({ collection: collectionDir });
  assert.strictEqual(snapshot.health.summary.readyToApplyJobCount, 1);
  assert.strictEqual(snapshot.health.summary.notReadyToApplyJobCount, 0);
  assert.strictEqual(snapshot.timeSeries.summary.missingTimestampJobCount, 1);
  assert.strictEqual(snapshot.timeSeries.summary.terminalJobCount, 0);
  assert.strictEqual(snapshot.timeSeries.summary.contextLoadJobCount, 1);
  assert.strictEqual(snapshot.timeSeries.summary.logVolumeJobCount, 1);
  assert.deepStrictEqual(snapshot.timeSeries.points, []);
}

async function assertLandedCollection(tmp) {
  const collectionDir = path.join(tmp, 'landed-collection');
  const applyLedger = createApplyLedger(collectionDir);
  await fs.mkdir(collectionDir, { recursive: true });
  await fs.writeFile(path.join(collectionDir, 'collection.json'), JSON.stringify({
    ok: true,
    summary: {
      total: 2,
      'ready-to-apply': 0,
      'needs-human-port': 2,
      'failed-evidence': 0,
      'stale-against-head': 0,
      landed: 2,
      landedJobIds: ['applied-job', 'committed-job'],
      applyLedger
    },
    buckets: { 'ready-to-apply': [], 'needs-human-port': [], 'failed-evidence': [], 'stale-against-head': [] }
  }, null, 2) + '\n');
  await fs.writeFile(path.join(collectionDir, 'coordinator-query.json'), JSON.stringify({
    summary: {
      jobCount: 2,
      readyToApplyCount: 0,
      needsHumanPortCount: 2,
      failedEvidenceCount: 0,
      staleAgainstHeadCount: 0,
      averageMergeScore: 0.8,
      applyLedger,
      landedJobIds: ['applied-job', 'committed-job']
    },
    jobs: [landedJob('applied-job', 'applied-task', 'src/runtime/applied.ts'), landedJob('committed-job', 'committed-task', 'src/runtime/committed.ts')]
  }, null, 2) + '\n');
  const snapshot = await readCodexDashboardSnapshot({ collection: collectionDir });
  assert.strictEqual(snapshot.summary.landed, 2);
  assert.strictEqual(snapshot.summary.applyLedgerLandedCount, 2);
  assert.deepStrictEqual(snapshot.summary.landedJobIds, ['applied-job', 'committed-job']);
  assert.deepStrictEqual(snapshot.summary.applyLedger, applyLedger);
  const landedQuery = await queryCodexSwarmCollection({ collection: collectionDir, landed: true });
  assert.deepStrictEqual(landedQuery.jobs.map((job) => job.jobId).sort(), ['applied-job', 'committed-job']);
  assert.strictEqual(landedQuery.summary.queryable.landed.landed, 2);
  assert.strictEqual(landedQuery.summary.queryable.landed.matchedLandedJobCount, 2);
  assert.strictEqual(landedQuery.summary.landed.matchedLandedRatio, 1);
}

function createApplyLedger(collectionDir) {
  return {
    path: path.join(collectionDir, 'apply-ledger', 'apply-ledger.json'),
    generatedAt: 1700000100000,
    dryRun: false,
    total: 2,
    checked: 0,
    applied: 1,
    committed: 1,
    skipped: 0,
    failed: 0,
    landed: 2,
    appliedJobIds: ['applied-job'],
    committedJobIds: ['committed-job'],
    landedJobIds: ['applied-job', 'committed-job'],
    failedJobIds: [],
    landedEntries: [
      {
        jobId: 'applied-job',
        status: 'applied',
        bundlePath: path.join(collectionDir, 'ready-to-apply', 'applied-job', 'merge.json'),
        patchPath: path.join(collectionDir, 'ready-to-apply', 'applied-job', 'changes.patch')
      },
      {
        jobId: 'committed-job',
        status: 'committed',
        bundlePath: path.join(collectionDir, 'ready-to-apply', 'committed-job', 'merge.json'),
        commit: '0123456789abcdef0123456789abcdef01234567'
      }
    ]
  };
}

function landedJob(jobId, taskId, changedPath) {
  return {
    jobId,
    taskId,
    lane: 'runtime',
    status: 'completed',
    liveness: 'finished',
    disposition: 'needs-port',
    mergeReadiness: 'verified-patch',
    mergeScore: 0.8,
    changedPaths: [changedPath],
    ownershipViolations: [],
    staleAgainstHead: false,
    tests: { failed: 0, requiredFailed: 0 },
    evidencePaths: [],
    semanticImportQuality: {
      expected: false,
      warnings: [],
      semanticEditAdmission: { status: 'needs-port', autoMergeCandidate: false, cleanEligible: false, reasons: [] },
      semanticEditScript: {},
      semanticEditProjection: {},
      semanticEditReplay: {}
    }
  };
}

async function assertSteeringIntent(tmp, collectionDir) {
  const intent = createCodexDashboardSteeringIntent({
    collection: collectionDir,
    routingMode: 'observe',
    maxConcurrency: 8,
    laneFocus: ['runtime', 'runtime'],
    modelTierPreference: 'fast',
    nextWaveNote: 'Prefer fast model for smoke runtime follow-up.'
  });
  assert.strictEqual(intent.kind, 'frontier.swarm-codex.steering-intent');
  assert.deepStrictEqual(intent.laneFocus, ['runtime']);
  assert.strictEqual(intent.maxConcurrency, 8);
  assert.strictEqual(intent.routingMode, 'observe');

  const write = await writeCodexDashboardSteeringIntent({ cwd: tmp, outDir: 'steering', intent });
  assert.strictEqual(write.ok, true);
  assert.ok(write.file.startsWith(path.join(tmp, 'steering')));
  assert.deepStrictEqual(JSON.parse(await fs.readFile(write.file, 'utf8')).laneFocus, ['runtime']);
}
