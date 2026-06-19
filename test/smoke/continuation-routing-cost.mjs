import assert from 'node:assert';
import {
  continueCodexSwarmLoop,
  fs,
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
    routingPolicy: { id: 'routing-cost-policy', defaultMode: 'fill' },
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
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
