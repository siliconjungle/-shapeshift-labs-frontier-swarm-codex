export const FRONTIER_CODEX_MODEL_PRICING_SOURCE = 'https://openai.com/api/pricing/';
export const FRONTIER_CODEX_MODEL_PRICING_UPDATED_AT = '2026-06-20';

export interface FrontierCodexModelPricing {
  model: string;
  provider: 'openai' | string;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
  source: string;
  updatedAt: string;
}

export interface FrontierCodexModelCostEstimateInput {
  model?: string;
  estimatedInputTokens?: number;
  actualInputTokens?: number;
  cachedInputTokens?: number;
  uncachedInputTokens?: number;
  outputTokens?: number;
}

export interface FrontierCodexModelCostEstimate {
  model?: string;
  pricingModel?: string;
  pricingMatchedModel?: string;
  pricingSource?: string;
  pricingUpdatedAt?: string;
  priceKnown: boolean;
  estimatedCostUsd: number;
  estimatedInputCostUsd: number;
  estimatedCachedInputCostUsd: number;
  estimatedUncachedInputCostUsd: number;
  estimatedOutputCostUsd: number;
  estimatedCostMicroUsd: number;
  billableInputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  costEstimateInputOnly: boolean;
  costEstimateEstimatedInput: boolean;
  costEstimateMissingOutputTokens: boolean;
  unknownPricingReason?: string;
}

const MILLION = 1_000_000;

const OPENAI_PRICING: Record<string, FrontierCodexModelPricing> = {
  'gpt-5.5': openAiPricing('gpt-5.5', 5, 0.5, 30),
  'gpt-5.4': openAiPricing('gpt-5.4', 2.5, 0.25, 15),
  'gpt-5.4-mini': openAiPricing('gpt-5.4-mini', 0.75, 0.075, 4.5)
};

const MODEL_ALIASES: Record<string, string> = {
  'codex-latest': 'gpt-5.4',
  'codex-mini-latest': 'gpt-5.4-mini',
  'gpt-5': 'gpt-5.4',
  'gpt-5-codex': 'gpt-5.4',
  'gpt-5-codex-mini': 'gpt-5.4-mini',
  'gpt-5-mini': 'gpt-5.4-mini',
  'gpt-5.1-codex': 'gpt-5.4',
  'gpt-5.1-codex-mini': 'gpt-5.4-mini'
};

export function lookupCodexModelPricing(model: string | undefined): FrontierCodexModelPricing | undefined {
  const normalized = normalizeModelName(model);
  if (!normalized) return undefined;
  return OPENAI_PRICING[normalized] ?? OPENAI_PRICING[MODEL_ALIASES[normalized] ?? ''];
}

export function estimateCodexModelCost(input: FrontierCodexModelCostEstimateInput): FrontierCodexModelCostEstimate {
  const pricing = lookupCodexModelPricing(input.model);
  const usage = normalizeTokenUsage(input);
  if (!pricing) {
    return {
      model: input.model,
      priceKnown: false,
      estimatedCostUsd: 0,
      estimatedInputCostUsd: 0,
      estimatedCachedInputCostUsd: 0,
      estimatedUncachedInputCostUsd: 0,
      estimatedOutputCostUsd: 0,
      estimatedCostMicroUsd: 0,
      billableInputTokens: usage.billableInputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      uncachedInputTokens: usage.uncachedInputTokens,
      outputTokens: usage.outputTokens,
      costEstimateInputOnly: usage.outputTokens === 0,
      costEstimateEstimatedInput: usage.estimatedInput,
      costEstimateMissingOutputTokens: input.outputTokens === undefined,
      unknownPricingReason: input.model ? 'unknown-model' : 'missing-model'
    };
  }
  const cachedInputCost = (usage.cachedInputTokens / MILLION) * pricing.cachedInputUsdPerMillion;
  const uncachedInputCost = (usage.uncachedInputTokens / MILLION) * pricing.inputUsdPerMillion;
  const outputCost = (usage.outputTokens / MILLION) * pricing.outputUsdPerMillion;
  const inputCost = cachedInputCost + uncachedInputCost;
  const totalCost = inputCost + outputCost;
  return {
    model: input.model,
    pricingModel: pricing.model,
    pricingMatchedModel: pricing.model,
    pricingSource: pricing.source,
    pricingUpdatedAt: pricing.updatedAt,
    priceKnown: true,
    estimatedCostUsd: roundUsd(totalCost),
    estimatedInputCostUsd: roundUsd(inputCost),
    estimatedCachedInputCostUsd: roundUsd(cachedInputCost),
    estimatedUncachedInputCostUsd: roundUsd(uncachedInputCost),
    estimatedOutputCostUsd: roundUsd(outputCost),
    estimatedCostMicroUsd: Math.round(totalCost * MILLION),
    billableInputTokens: usage.billableInputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    uncachedInputTokens: usage.uncachedInputTokens,
    outputTokens: usage.outputTokens,
    costEstimateInputOnly: usage.outputTokens === 0,
    costEstimateEstimatedInput: usage.estimatedInput,
    costEstimateMissingOutputTokens: input.outputTokens === undefined
  };
}

function openAiPricing(model: string, inputUsdPerMillion: number, cachedInputUsdPerMillion: number, outputUsdPerMillion: number): FrontierCodexModelPricing {
  return {
    model,
    provider: 'openai',
    inputUsdPerMillion,
    cachedInputUsdPerMillion,
    outputUsdPerMillion,
    source: FRONTIER_CODEX_MODEL_PRICING_SOURCE,
    updatedAt: FRONTIER_CODEX_MODEL_PRICING_UPDATED_AT
  };
}

function normalizeTokenUsage(input: FrontierCodexModelCostEstimateInput): {
  billableInputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  estimatedInput: boolean;
} {
  const actualInputTokens = nonNegativeNumber(input.actualInputTokens);
  const estimatedInputTokens = nonNegativeNumber(input.estimatedInputTokens);
  const cachedInputTokens = nonNegativeNumber(input.cachedInputTokens);
  const reportedUncachedInputTokens = nonNegativeNumber(input.uncachedInputTokens);
  const outputTokens = nonNegativeNumber(input.outputTokens);
  if (actualInputTokens > 0 || cachedInputTokens > 0 || reportedUncachedInputTokens > 0) {
    const uncachedInputTokens = reportedUncachedInputTokens || Math.max(0, actualInputTokens - cachedInputTokens);
    return {
      billableInputTokens: cachedInputTokens + uncachedInputTokens,
      cachedInputTokens,
      uncachedInputTokens,
      outputTokens,
      estimatedInput: false
    };
  }
  return {
    billableInputTokens: estimatedInputTokens,
    cachedInputTokens: 0,
    uncachedInputTokens: estimatedInputTokens,
    outputTokens,
    estimatedInput: estimatedInputTokens > 0
  };
}

function normalizeModelName(model: string | undefined): string | undefined {
  const trimmed = model?.trim().toLowerCase();
  if (!trimmed) return undefined;
  return trimmed.includes('/') ? trimmed.split('/').filter(Boolean).at(-1) : trimmed;
}

function nonNegativeNumber(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}
