import type { estimateCodexModelCost } from './model-pricing.js';
import type { FrontierCodexDashboardJob } from './types-dashboard.js';
import { isObject } from './common.js';

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function optionalNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function roundDashboardUsd(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

export function booleanValue(value: unknown): boolean {
  return value === true || value === 'true';
}

export function timestampValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function numberRecordValue(value: unknown, fallback: Record<string, number> = {}): Record<string, number> {
  if (!isObject(value)) return fallback;
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
}

export function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export function stringListValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

export function dashboardCostFields(cost: ReturnType<typeof estimateCodexModelCost>): Pick<FrontierCodexDashboardJob,
  | 'billableInputTokens'
  | 'priceKnown'
  | 'pricingModel'
  | 'pricingMatchedModel'
  | 'pricingSource'
  | 'pricingUpdatedAt'
  | 'estimatedCostUsd'
  | 'estimatedInputCostUsd'
  | 'estimatedCachedInputCostUsd'
  | 'estimatedUncachedInputCostUsd'
  | 'estimatedOutputCostUsd'
  | 'estimatedCostMicroUsd'
  | 'costEstimateInputOnly'
  | 'costEstimateEstimatedInput'
  | 'costEstimateMissingOutputTokens'
  | 'unknownPricingReason'
> {
  return {
    billableInputTokens: cost.billableInputTokens,
    priceKnown: cost.priceKnown,
    ...(cost.pricingModel ? { pricingModel: cost.pricingModel } : {}),
    ...(cost.pricingMatchedModel ? { pricingMatchedModel: cost.pricingMatchedModel } : {}),
    ...(cost.pricingSource ? { pricingSource: cost.pricingSource } : {}),
    ...(cost.pricingUpdatedAt ? { pricingUpdatedAt: cost.pricingUpdatedAt } : {}),
    estimatedCostUsd: cost.estimatedCostUsd,
    estimatedInputCostUsd: cost.estimatedInputCostUsd,
    estimatedCachedInputCostUsd: cost.estimatedCachedInputCostUsd,
    estimatedUncachedInputCostUsd: cost.estimatedUncachedInputCostUsd,
    estimatedOutputCostUsd: cost.estimatedOutputCostUsd,
    estimatedCostMicroUsd: cost.estimatedCostMicroUsd,
    costEstimateInputOnly: cost.costEstimateInputOnly,
    costEstimateEstimatedInput: cost.costEstimateEstimatedInput,
    costEstimateMissingOutputTokens: cost.costEstimateMissingOutputTokens,
    ...(cost.unknownPricingReason ? { unknownPricingReason: cost.unknownPricingReason } : {})
  };
}
