import assert from 'node:assert';
import { estimateCodexModelCost, lookupCodexModelPricing } from '../../dist/index.js';

export function testModelPricing() {
  const nano = estimateCodexModelCost({
    model: 'openai/gpt-5.4-nano',
    actualInputTokens: 1_000_000,
    cachedInputTokens: 500_000,
    uncachedInputTokens: 500_000,
    outputTokens: 1_000_000
  });
  assert.strictEqual(nano.priceKnown, true);
  assert.strictEqual(nano.pricingModel, 'gpt-5.4-nano');
  assert.strictEqual(nano.estimatedCostUsd, 1.36);
  assert.strictEqual(nano.costEstimateLongContext, false);

  const codex = estimateCodexModelCost({
    model: 'gpt-5.3-codex-spark',
    actualInputTokens: 1_000_000
  });
  assert.strictEqual(codex.priceKnown, true);
  assert.strictEqual(codex.pricingModel, 'gpt-5.3-codex');
  assert.strictEqual(codex.estimatedCostUsd, 1.75);
  assert.strictEqual(codex.costEstimateInputOnly, true);

  const longContext = estimateCodexModelCost({
    model: 'gpt-5.5',
    actualInputTokens: 300_000,
    uncachedInputTokens: 300_000,
    outputTokens: 100_000
  });
  assert.strictEqual(longContext.priceKnown, true);
  assert.strictEqual(longContext.pricingModel, 'gpt-5.5');
  assert.strictEqual(longContext.costEstimateLongContext, true);
  assert.strictEqual(longContext.estimatedInputCostUsd, 3);
  assert.strictEqual(longContext.estimatedOutputCostUsd, 4.5);
  assert.strictEqual(longContext.estimatedCostUsd, 7.5);

  assert.strictEqual(lookupCodexModelPricing('codex-mini-latest')?.model, 'gpt-5.4-mini');
  assert.strictEqual(lookupCodexModelPricing('gpt-5-chat-latest')?.model, 'chat-latest');
}
