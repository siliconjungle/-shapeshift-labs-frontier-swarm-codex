import assert from 'node:assert';
import {
  continueCodexSwarmLoop,
  execFileP,
  exists,
  fs,
  manifestInput,
  path
} from './context.mjs';

export async function testContinuation(context, collectionDir) {
  const { tmp } = context;
  const childBacklogPath = path.join(collectionDir, 'needs-human-port', 'runtime-runtime-action', 'backlog-children.json');
  await fs.writeFile(childBacklogPath, JSON.stringify({
    id: 'runtime-child-backlog',
    entries: [{
      id: 'runtime-follow-up',
      title: 'Runtime follow-up task',
      entryKind: 'task',
      status: 'ready',
      lane: 'runtime',
      groupId: 'runtime-group',
      parentEntryId: 'runtime-action',
      targetRefs: ['src/runtime/follow-up.ts']
    }]
  }, null, 2) + '\n');
  const continuation = await continueCodexSwarmLoop({
    collection: collectionDir,
    outDir: path.join(tmp, 'continuation'),
    backlog: {
      id: 'runtime-base-backlog',
      entries: [{
        id: 'runtime-action',
        title: 'Runtime action',
        taskId: 'runtime-action',
        status: 'ready',
        lane: 'runtime',
        targetRefs: ['src/runtime/action.ts']
      }]
    },
    routingPolicy: {
      id: 'runtime-routing-policy',
      defaultMode: 'fill'
    },
    manifest: manifestInput,
    tasks: {
      items: [{
        id: 'runtime-action',
        title: 'Runtime action',
        status: 'ready',
        lane: 'runtime',
        workKind: 'runtime action',
        targetRefs: ['src/runtime/action.ts']
      }]
    },
    backlogPlan: {
      recursive: true,
      maxDepth: 1,
      childArtifactPath: 'backlog-children.json'
    },
    routingMode: 'fill',
    repository: 'frontier-swarm-codex-smoke',
    package: '@shapeshift-labs/frontier-swarm-codex'
  });

  assert.strictEqual(continuation.ok, true);
  assert.strictEqual(continuation.summary.childBacklogCount, 1);
  assert.deepStrictEqual(continuation.childBacklogNames, ['backlog-children.json', 'proof-route-backlog.json', 'child-backlog.json', 'children-backlog.json']);
  assert.strictEqual(continuation.summary.childBacklogEntryCount, 1);
  assert.strictEqual(continuation.summary.feedbackCount, 1);
  assert.strictEqual(continuation.summary.totalRoutingFeedbackCount, 1);
  assert.strictEqual(continuation.summary.terminalOutcomeProjection.reviewEntryCount, 1);
  assert.strictEqual(continuation.summary.terminalOutcomeProjection.reviewTaskCount, 1);
  assert.strictEqual(continuation.summary.routingPreferences.defaultMode, 'fill');
  assert.strictEqual(continuation.summary.routingPreferences.feedbackCount, 1);
  assert.ok(continuation.summary.nextJobTaskIds.includes('runtime-follow-up'));
  assert.ok(!continuation.summary.nextJobTaskIds.includes('runtime-action'));
  assert.strictEqual(continuation.summary.nextJobLaneCounts.runtime, 1);
  assert.strictEqual(continuation.summary.collectionBucketCounts.total, 1);
  assert.strictEqual(typeof continuation.summary.tournamentCounts.matchCount, 'number');
  assert.strictEqual(typeof continuation.summary.tournamentFeedbackCounts.recommendationCount, 'number');
  assert.strictEqual(continuation.summary.paths.outDir, continuation.outDir);
  assert.strictEqual(continuation.summary.paths.collectionDir, collectionDir);
  assert.strictEqual(continuation.summary.paths.backlogPath, continuation.backlogPath);
  assert.ok(continuation.summary.tournamentObservationCount >= 0);
  assert.ok(continuation.summary.tournamentRecommendationCount >= 0);
  assert.ok(continuation.childBacklogPaths.includes(childBacklogPath));
  assert.ok(continuation.summary.paths.childBacklogPaths.includes(childBacklogPath));
  assert.ok(continuation.nextBacklog.entries.some((entry) => entry.id === 'runtime-follow-up'));
  assert.strictEqual(continuation.nextBacklog.entries.find((entry) => entry.id === 'runtime-action')?.status, 'coordinator-review');
  assert.strictEqual(continuation.nextRoutingPolicy.feedback.length, 1);
  assert.ok(continuation.nextRoutingPolicy.metadata.tournamentSummary);
  assert.strictEqual(continuation.nextRoutingPolicy.feedback[0].scope, 'package');
  assert.strictEqual(continuation.nextRoutingPolicy.feedback[0].package, '@shapeshift-labs/frontier-swarm-codex');
  assert.ok(continuation.nextRoutingPolicy.feedback[0].metadata.tournamentSummary);
  assert.ok(Array.isArray(continuation.nextRoutingPolicy.feedback[0].metadata.adaptiveRecommendations));
  assert.strictEqual(continuation.nextRoutingPolicy.feedback[0].metadata.collection.bucket, 'needs-human-port');
  assert.strictEqual(continuation.nextRoutingPolicy.feedback[0].metadata.routingDimensions.workKind, 'runtime action');
  assert.strictEqual(continuation.nextRoutingPolicy.feedback[0].evidenceQuality.metadata.collectionBucket, 'needs-human-port');
  assert.ok(continuation.nextPlan.jobs.some((job) => job.taskId === 'runtime-follow-up'));
  assert.strictEqual(continuation.summary.nextJobRouting.routedJobCount, continuation.summary.nextJobCount);
  assert.strictEqual(typeof continuation.summary.nextJobRouting.policyFeedbackMatchCount, 'number');
  assert.ok(continuation.summary.nextJobRouting.routedJobIds.includes(continuation.nextPlan.jobs.find((job) => job.taskId === 'runtime-follow-up').id));
  assert.ok(continuation.nextPlan.jobs.find((job) => job.taskId === 'runtime-follow-up').metadata.modelRoute);
  assert.ok(!continuation.nextPlan.graph.issues.some((issue) => issue.code === 'missing-job-dependency'));
  assert.strictEqual(path.basename(continuation.backlogPath), 'backlog.next.json');
  assert.strictEqual(path.basename(continuation.routingPolicyPath), 'model-routing-policy.next.json');
  assert.strictEqual(path.basename(continuation.nextPlanPath), 'next-plan.json');
  assert.ok(await exists(continuation.backlogPath));
  assert.ok(await exists(continuation.routingPolicyPath));
  assert.ok(await exists(continuation.nextPlanPath));
  const persistedBacklog = await readJson(continuation.backlogPath);
  const persistedRoutingPolicy = await readJson(continuation.routingPolicyPath);
  const persistedNextPlan = await readJson(continuation.nextPlanPath);
  assert.ok(persistedBacklog.entries.some((entry) => entry.id === 'runtime-follow-up'));
  assert.strictEqual(persistedBacklog.entries.find((entry) => entry.id === 'runtime-action')?.status, 'coordinator-review');
  assert.ok(persistedRoutingPolicy.feedback.some((entry) => entry.jobId === 'runtime-runtime-action'));
  assert.ok(persistedNextPlan.jobs.some((job) => job.taskId === 'runtime-follow-up'));
  assert.ok(!persistedNextPlan.jobs.some((job) => job.taskId === 'runtime-action'));

  const closedCollectionDir = path.join(tmp, 'closed-collection');
  await fs.mkdir(closedCollectionDir, { recursive: true });
  const closedCollection = await readJson(path.join(collectionDir, 'collection.json'));
  closedCollection.outDir = closedCollection.runDir = closedCollectionDir;
  for (const decision of closedCollection.queueOutcomeModel.decisions) {
    Object.assign(decision, { decision: 'checked', category: 'terminal', outcome: 'checked', terminal: true, closesSubject: true, coordinatorReview: false, reviewDebt: false });
  }
  closedCollection.queueOutcomeModel.visibleReviewDebt = [];
  closedCollection.queueOutcomeModel.summary.visibleReviewDebtCount = 0;
  await fs.writeFile(path.join(closedCollectionDir, 'collection.json'), JSON.stringify(closedCollection, null, 2) + '\n');
  const closedContinuation = await continueCodexSwarmLoop({
    collection: closedCollectionDir,
    outDir: path.join(tmp, 'closed-continuation'),
    backlog: {
      id: 'closed-runtime-backlog',
      entries: [{
        id: 'runtime-action',
        title: 'Runtime action',
        taskId: 'runtime-action',
        status: 'ready',
        lane: 'runtime',
        targetRefs: ['src/runtime/action.ts']
      }]
    },
    routingPolicy: { id: 'closed-routing-policy', defaultMode: 'fill' },
    manifest: manifestInput,
    tasks: {
      items: [{
        id: 'runtime-action',
        title: 'Runtime action',
        status: 'ready',
        lane: 'runtime',
        targetRefs: ['src/runtime/action.ts']
      }]
    },
    repository: 'frontier-swarm-codex-smoke',
    package: '@shapeshift-labs/frontier-swarm-codex'
  });
  assert.strictEqual(closedContinuation.summary.terminalOutcomeProjection.closedEntryCount, 1);
  assert.strictEqual(closedContinuation.summary.terminalOutcomeProjection.closedTaskCount, 1);
  assert.strictEqual(closedContinuation.nextBacklog.entries[0].status, 'verified');
  assert.deepStrictEqual(closedContinuation.summary.nextJobTaskIds, []);

  const cliFixture = {
    backlog: path.join(tmp, 'cli-backlog.json'),
    routingPolicy: path.join(tmp, 'cli-routing-policy.json'),
    manifest: path.join(tmp, 'cli-manifest.json'),
    tasks: path.join(tmp, 'cli-tasks.json'),
    outDir: path.join(tmp, 'cli-continuation')
  };
  await fs.writeFile(cliFixture.backlog, JSON.stringify({ id: 'cli-runtime-backlog', entries: [] }, null, 2) + '\n');
  await fs.writeFile(cliFixture.routingPolicy, JSON.stringify({ id: 'cli-routing-policy', defaultMode: 'fill' }, null, 2) + '\n');
  await fs.writeFile(cliFixture.manifest, JSON.stringify(manifestInput, null, 2) + '\n');
  await fs.writeFile(cliFixture.tasks, JSON.stringify({ items: [] }, null, 2) + '\n');
  const cli = new URL('../../dist/cli.js', import.meta.url).pathname;
  const cliContinuation = await execFileP(process.execPath, [
    cli,
    'continue',
    '--collection',
    collectionDir,
    '--backlog',
    cliFixture.backlog,
    '--routing-policy',
    cliFixture.routingPolicy,
    '--manifest',
    cliFixture.manifest,
    '--tasks',
    cliFixture.tasks,
    '--outDir',
    cliFixture.outDir,
    '--routing-mode',
    'fill'
  ], { cwd: tmp });
  const parsed = JSON.parse(cliContinuation.stdout);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.summary.childBacklogCount, 1);
  assert.strictEqual(parsed.summary.childBacklogEntryCount, 1);
  assert.ok(parsed.summary.tournamentRecommendationCount >= 0);
  assert.ok(parsed.summary.nextJobTaskIds.includes('runtime-follow-up'));
  assert.ok(parsed.nextPlan.jobs.some((job) => job.taskId === 'runtime-follow-up'));
  assert.ok(!parsed.nextPlan.graph.issues.some((issue) => issue.code === 'missing-job-dependency'));

  const nextWaveFixture = {
    backlog: path.join(tmp, 'next-wave-backlog.json'),
    routingPolicy: path.join(tmp, 'next-wave-routing-policy.json'),
    manifest: path.join(tmp, 'next-wave-manifest.json'),
    tasks: path.join(tmp, 'next-wave-tasks.json'),
    outDir: path.join(tmp, 'next-wave-continuation')
  };
  await fs.writeFile(nextWaveFixture.backlog, JSON.stringify({ id: 'next-wave-runtime-backlog', entries: [] }, null, 2) + '\n');
  await fs.writeFile(nextWaveFixture.routingPolicy, JSON.stringify({ id: 'next-wave-routing-policy', defaultMode: 'fill' }, null, 2) + '\n');
  await fs.writeFile(nextWaveFixture.manifest, JSON.stringify(manifestInput, null, 2) + '\n');
  await fs.writeFile(nextWaveFixture.tasks, JSON.stringify({
    items: [{
      id: 'runtime-from-tasks',
      title: 'Runtime task from tasks file',
      lane: 'runtime',
      workKind: 'test',
      targetRefs: ['src/runtime/from-tasks.ts']
    }]
  }, null, 2) + '\n');
  const nextWave = await execFileP(process.execPath, [
    cli,
    'next-wave',
    '--collection',
    collectionDir,
    '--backlog',
    nextWaveFixture.backlog,
    '--routing-policy',
    nextWaveFixture.routingPolicy,
    '--manifest',
    nextWaveFixture.manifest,
    '--tasks',
    nextWaveFixture.tasks,
    '--outDir',
    nextWaveFixture.outDir,
    '--routing-mode',
    'fill'
  ], { cwd: tmp });
  const parsedNextWave = JSON.parse(nextWave.stdout);
  assert.strictEqual(parsedNextWave.ok, true);
  assert.strictEqual(parsedNextWave.summary.childBacklogCount, 1);
  assert.strictEqual(path.basename(parsedNextWave.backlogPath), 'backlog.next.json');
  assert.strictEqual(path.basename(parsedNextWave.routingPolicyPath), 'model-routing-policy.next.json');
  assert.strictEqual(path.basename(parsedNextWave.nextPlanPath), 'next-plan.json');
  const nextWaveBacklog = await readJson(parsedNextWave.backlogPath);
  const nextWaveRoutingPolicy = await readJson(parsedNextWave.routingPolicyPath);
  const nextWavePlan = await readJson(parsedNextWave.nextPlanPath);
  assert.ok(nextWaveBacklog.entries.some((entry) => entry.id === 'runtime-follow-up'));
  assert.ok(nextWaveRoutingPolicy.feedback.some((entry) => entry.taskId === 'runtime-action'));
  assert.ok(nextWavePlan.jobs.some((job) => job.taskId === 'runtime-follow-up'));
  assert.ok(nextWavePlan.jobs.some((job) => job.taskId === 'runtime-from-tasks'));

  const planFixture = {
    backlog: path.join(tmp, 'cli-plan-backlog.json'),
    manifest: path.join(tmp, 'cli-plan-manifest.json'),
    outDir: path.join(tmp, 'cli-plan-output')
  };
  await fs.writeFile(planFixture.backlog, JSON.stringify({
    id: 'cli-plan-backlog',
    entries: [{
      id: 'cli-feature',
      title: 'CLI backlog feature',
      objective: 'Break this feature into executable child tasks.',
      entryKind: 'feature',
      status: 'ready',
      priority: 5,
      lane: 'intake',
      sourceRefs: ['docs/cli-feature.md'],
      targetRefs: ['src/runtime/feature.ts']
    }]
  }, null, 2) + '\n');
  await fs.writeFile(planFixture.manifest, JSON.stringify({
    ...manifestInput,
    compute: [
      { id: 'codex.deep', kind: 'codex', model: 'gpt-test-deep', reasoningEffort: 'high' },
      { id: 'codex.fast', kind: 'codex', model: 'gpt-test-fast', reasoningEffort: 'low' }
    ]
  }, null, 2) + '\n');
  const cliPlan = await execFileP(process.execPath, [
    cli,
    'plan',
    '--manifest',
    planFixture.manifest,
    '--backlog',
    planFixture.backlog,
    '--outDir',
    planFixture.outDir,
    '--recursive-backlog',
    'true',
    '--max-backlog-depth',
    '1',
    '--decompose-lane',
    'runtime',
    '--decompose-compute',
    'codex.fast',
    '--decompose-work-kind',
    'recursive-breakdown',
    '--child-artifact-path',
    'agent-runs/backlog-children.json'
  ], { cwd: tmp });
  const parsedPlan = JSON.parse(cliPlan.stdout);
  assert.strictEqual(parsedPlan.ok, true);
  assert.strictEqual(parsedPlan.plan.metadata.backlogTaskPlan.backlogPath, planFixture.backlog);
  assert.strictEqual(parsedPlan.plan.metadata.backlogTaskPlan.childArtifactPath, 'agent-runs/backlog-children.json');
  assert.strictEqual(parsedPlan.plan.metadata.backlogTaskPlan.summary.decompositionTaskCount, 1);
  assert.ok(parsedPlan.plan.metadata.backlogTaskPlan.summary.totalTaskCount >= 1);
  const decomposeJob = parsedPlan.plan.jobs.find((job) => job.taskId === 'cli-feature:decompose');
  assert.ok(decomposeJob);
  assert.strictEqual(decomposeJob.lane, 'runtime');
  assert.strictEqual(decomposeJob.compute.id, 'codex.fast');
  assert.strictEqual(decomposeJob.task.workKind, 'recursive-breakdown');
  assert.ok(decomposeJob.allowedWrites.includes('agent-runs/backlog-children.json'));
  assert.ok(await exists(path.join(planFixture.outDir, 'swarm-plan.json')));
  return continuation;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
