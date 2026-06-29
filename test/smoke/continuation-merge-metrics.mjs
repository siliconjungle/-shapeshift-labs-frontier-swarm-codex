import assert from 'node:assert';
import {
  continueCodexSwarmLoop,
  fs,
  manifestInput,
  path
} from './context.mjs';

export async function testContinuationMergeMetricsFeedback({ tmp }, collectionDir) {
  const metricsCollectionDir = path.join(tmp, 'merge-metrics-continuation-collection');
  await fs.mkdir(metricsCollectionDir, { recursive: true });
  const collection = await readJson(path.join(collectionDir, 'collection.json'));
  collection.outDir = metricsCollectionDir;
  collection.runDir = metricsCollectionDir;
  collection.mergeMetricsFeedback = mergeMetricsFeedbackFixture();
  await fs.writeFile(path.join(metricsCollectionDir, 'collection.json'), JSON.stringify(collection, null, 2) + '\n');
  const continuation = await continueCodexSwarmLoop({
    collection: metricsCollectionDir,
    outDir: path.join(tmp, 'merge-metrics-continuation'),
    routingPolicy: { id: 'merge-metrics-policy', defaultMode: 'fill' },
    routingMode: 'fill',
    manifest: manifestInput,
    tasks: { items: [{ id: 'runtime-hotspot-followup', lane: 'runtime', targetRefs: ['src/runtime/action.ts'] }] },
    repository: 'frontier-swarm-codex-smoke',
    package: '@shapeshift-labs/frontier-swarm-codex'
  });
  assert.strictEqual(continuation.summary.mergeMetrics.eventCount, 2);
  assert.strictEqual(continuation.summary.mergeMetrics.routingFeedbackCount, 1);
  assert.strictEqual(continuation.summary.mergeMetrics.backlogEntryCount, 2);
  assert.strictEqual(continuation.nextRoutingPolicy.metadata.mergeMetrics.preferredLeaseKeyCount, 1);
  assert.ok(continuation.nextRoutingPolicy.feedback.some((entry) => entry.tags.includes('merge-metrics')));
  assert.ok(continuation.nextBacklog.entries.some((entry) => entry.id.startsWith('merge-metrics-lease-')));
  assert.ok(continuation.nextBacklog.entries.some((entry) => entry.id.startsWith('merge-metrics-split-')));
  assert.ok(continuation.nextPlan.jobs.some((job) => job.taskId.startsWith('merge-metrics-lease-')));
  assert.ok(continuation.nextPlan.jobs.some((job) => job.metadata.modelRoute.summary.routingPolicyFeedbackCount >= 1));
}

function mergeMetricsFeedbackFixture() {
  const regionKey = 'src/runtime/action.ts#semanticOwnershipRegion:function:runAction';
  return {
    kind: 'frontier.swarm-codex.merge-metrics-feedback',
    version: 1,
    generatedAt: Date.now(),
    runId: 'merge-metrics-run',
    eventCount: 2,
    events: [],
    report: {
      kind: 'frontier.mergeMetrics.correlatedWorkReport',
      version: 1,
      generatedAt: new Date().toISOString(),
      events: [],
      regions: [{ key: regionKey, kind: 'function', file: 'src/runtime/action.ts', symbol: 'runAction', label: 'src/runtime/action.ts#runAction', touches: 3, taskCount: 2, agentCount: 2, runCount: 1, lanes: ['runtime'], paths: ['src/runtime/action.ts'], outcomeCounts: { conflict: 1, stale: 1 }, pressureScore: 9, failureRate: 1, conflictRate: 0.5, staleRate: 0.5, gateFailureRate: 0, humanNeededRate: 0 }],
      pairs: [],
      suggestions: [{ id: 'lease-runtime-action', title: 'Lease runtime action', action: 'lease', severity: 'high', regionKeys: [regionKey], reason: 'runtime action is a correlated conflict hotspot', leaseKeys: [`merge:semantic:${regionKey}`] }],
      feedback: { avoidConcurrentRegionKeys: [regionKey], preferredLeaseKeys: [`merge:semantic:${regionKey}`], splitTaskRegionKeys: [regionKey], refactorCandidateRegionKeys: [] },
      summary: { eventCount: 2, runCount: 1, taskCount: 2, agentCount: 2, regionTouchCount: 3, correlatedRegionCount: 1, correlatedPairCount: 0, suggestionCount: 1, highSeveritySuggestionCount: 1, outcomeCounts: { conflict: 1, stale: 1 } }
    },
    semanticLeaseHints: [{ leaseKey: `merge:semantic:${regionKey}`, regionKeys: [regionKey], severity: 'high', reason: 'runtime action is a correlated conflict hotspot' }],
    taskSplitHints: [{ regionKeys: [regionKey], severity: 'medium', reason: 'split runtime action changes before running more workers', taskHint: 'Separate behavior edits from tests and fixtures.' }],
    routingHints: [{ action: 'lease', severity: 'high', regionKeys: [regionKey], reason: 'prefer serialized work around the runtime action hotspot' }],
    feedback: { avoidConcurrentRegionKeys: [regionKey], preferredLeaseKeys: [`merge:semantic:${regionKey}`], splitTaskRegionKeys: [regionKey], refactorCandidateRegionKeys: [] },
    summary: { eventCount: 2, correlatedRegionCount: 1, correlatedPairCount: 0, suggestionCount: 1, highSeveritySuggestionCount: 1, preferredLeaseKeyCount: 1, avoidConcurrentRegionKeyCount: 1, splitTaskRegionKeyCount: 1, refactorCandidateRegionKeyCount: 0 }
  };
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
