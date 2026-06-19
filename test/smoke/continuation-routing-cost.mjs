import assert from 'node:assert';
import {
  continueCodexSwarmLoop,
  fs,
  manifestInput,
  path
} from './context.mjs';

export async function testContinuationRoutingCost({ tmp }, collectionDir) {
  const costCollectionDir = path.join(tmp, 'routing-cost-collection');
  await fs.mkdir(costCollectionDir, { recursive: true });
  const collection = await readJson(path.join(collectionDir, 'collection.json'));
  collection.outDir = costCollectionDir;
  const bundle = collection.buckets['needs-human-port'][0].bundle;
  bundle.metadata = {
    ...bundle.metadata,
    contextBudget: {
      status: 'warning',
      measured: { promptBytes: 12000, estimatedInputTokens: 3000 },
      usage: { inputTokens: 28000, cachedInputTokens: 20000, uncachedInputTokens: 8000 },
      warnings: ['fixture routing cost signal'],
      errors: []
    }
  };
  await fs.writeFile(path.join(costCollectionDir, 'collection.json'), JSON.stringify(collection, null, 2) + '\n');
  const continuation = await continueCodexSwarmLoop({
    collection: costCollectionDir,
    outDir: path.join(tmp, 'routing-cost-continuation'),
    routingPolicy: {
      id: 'routing-cost-policy',
      defaultMode: 'fill',
      signals: [{
        mode: 'prefer',
        lane: 'runtime',
        workKind: 'runtime action',
        computeId: 'codex.fast',
        confidence: 'high',
        reason: 'prefer cheaper compute for matching runtime action follow-ups'
      }]
    },
    routingMode: 'fill',
    manifest: {
      ...manifestInput,
      compute: [
        { id: 'codex.deep', kind: 'codex', model: 'gpt-5.5', reasoningEffort: 'xhigh' },
        { id: 'codex.fast', kind: 'codex', model: 'gpt-5.4-mini', reasoningEffort: 'medium' }
      ],
      policy: { defaultCompute: 'codex.deep' }
    },
    tasks: {
      items: [{
        id: 'runtime-next-action',
        kind: 'runtime action',
        lane: 'runtime',
        targetRefs: ['src/runtime/next-action.ts']
      }]
    },
    repository: 'frontier-swarm-codex-smoke',
    package: '@shapeshift-labs/frontier-swarm-codex'
  });
  const feedback = continuation.nextRoutingPolicy.feedback[0];
  assert.strictEqual(continuation.summary.routingCost.costSignalCount, 1);
  assert.strictEqual(continuation.summary.routingCost.pricedFeedbackCount, 1);
  assert.strictEqual(continuation.summary.routingCost.inputOnlyFeedbackCount, 1);
  assert.strictEqual(continuation.summary.routingCost.estimatedCostUsd, 0.05);
  assert.strictEqual(continuation.summary.routingCost.estimatedCostMicroUsd, 50000);
  assert.strictEqual(feedback.metadata.costEstimate.priceKnown, true);
  assert.strictEqual(feedback.metadata.costEstimate.pricingModel, 'gpt-5.5');
  assert.strictEqual(feedback.metadata.costEstimate.estimatedCostUsd, 0.05);
  assert.ok(feedback.tags.includes('cost-known'));
  assert.strictEqual(feedback.evidenceQuality.metadata.costEstimate.estimatedCostMicroUsd, 50000);
  assert.strictEqual(continuation.nextRoutingPolicy.metadata.routingCostSummary.estimatedCostMicroUsd, 50000);
  assert.strictEqual(continuation.summary.nextJobCount, 1);
  assert.strictEqual(continuation.summary.nextJobRouting.routedJobCount, 1);
  assert.strictEqual(continuation.summary.nextJobRouting.changedComputeCount, 1);
  assert.strictEqual(continuation.summary.nextJobRouting.policyFeedbackMatchCount, 1);
  assert.strictEqual(continuation.summary.nextJobRouting.policyCostSignalCount, 1);
  assert.strictEqual(continuation.summary.nextJobRouting.policyPreferenceMatchCount, 1);
  assert.strictEqual(continuation.summary.nextJobRouting.selectedComputeCounts['codex.fast'], 1);
  assert.strictEqual(continuation.summary.nextJobRouting.fallbackComputeCounts['codex.deep'], 1);
  const routedJob = continuation.nextPlan.jobs.find((job) => job.taskId === 'runtime-next-action');
  assert.strictEqual(routedJob.compute.id, 'codex.fast');
  assert.strictEqual(routedJob.metadata.modelRoute.fallbackComputeId, 'codex.deep');
  assert.strictEqual(routedJob.metadata.modelRoute.summary.routingPolicyFeedbackCount, 1);
  assert.strictEqual(routedJob.metadata.modelRoute.summary.routingPolicyCostSignalCount, 1);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
