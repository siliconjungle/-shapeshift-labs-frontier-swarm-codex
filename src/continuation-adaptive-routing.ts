import type { FrontierSwarmModelRoutingPolicySignalInput } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexContinuationResult } from './types-continuation.js';

export function createAdaptiveRoutingSignalsFromTournamentFeedback(collection: FrontierCodexCollectResult | undefined): FrontierSwarmModelRoutingPolicySignalInput[] {
  const feedback = collection?.tournamentAdaptiveFeedback;
  if (!feedback) return [];
  const signals: FrontierSwarmModelRoutingPolicySignalInput[] = [];
  for (const recommendation of feedback.recommendations) {
    const mode = adaptiveRecommendationRoutingMode(recommendation.action);
    if (!mode) continue;
    const metadata = objectValue(recommendation.metadata);
    const computeId = stringValue(recommendation.computeId) ?? stringValue(metadata.computeId);
    const model = stringValue(recommendation.model) ?? stringValue(metadata.model);
    const modelTier = stringValue(metadata.modelTier) ?? stringValue(metadata.tier);
    if (!computeId && !model && !modelTier) continue;
    const target = stringValue(recommendation.target);
    const key = stringValue(recommendation.key);
    const reason = stringValue(recommendation.reason) ?? 'adaptive tournament recommendation';
    const lane = adaptiveRecommendationLane(recommendation.target, recommendation.key, metadata);
    const workKind = stringValue(metadata.workKind);
    const taskKind = stringValue(metadata.taskKind);
    signals.push({
      mode,
      ...(lane ? { lane } : {}),
      ...(workKind ? { workKind } : {}),
      ...(taskKind ? { taskKind } : {}),
      ...(computeId ? { computeId } : {}),
      ...(model ? { model } : {}),
      ...(modelTier ? { modelTier } : {}),
      confidence: adaptiveRecommendationConfidence(recommendation.score),
      reason: `adaptive ${mode}: ${reason}`,
      metadata: {
        source: 'tournament-adaptive-feedback',
        feedbackId: feedback.id,
        ...(feedback.tournamentId ? { tournamentId: feedback.tournamentId } : {}),
        ...(feedback.historyId ? { historyId: feedback.historyId } : {}),
        ...(recommendation.id ? { recommendationId: recommendation.id } : {}),
        ...(recommendation.action ? { action: recommendation.action } : {}),
        ...(target ? { target } : {}),
        ...(key ? { key } : {}),
        ...(recommendation.score !== undefined ? { score: recommendation.score } : {}),
        reason
      }
    });
  }
  return signals;
}

export function summarizeAdaptiveRoutingSignals(
  collection: FrontierCodexCollectResult | undefined,
  signals: readonly FrontierSwarmModelRoutingPolicySignalInput[]
): FrontierCodexContinuationResult['summary']['adaptiveRouting'] {
  const recommendations = collection?.tournamentAdaptiveFeedback?.recommendations ?? [];
  return {
    recommendationCount: recommendations.length,
    signalCount: signals.length,
    skippedRecommendationCount: Math.max(0, recommendations.length - signals.length),
    preferCount: signals.filter((entry) => entry.mode === 'prefer' || entry.mode === 'override').length,
    avoidCount: signals.filter((entry) => entry.mode === 'avoid').length,
    computeSignalCount: signals.filter((entry) => !!entry.computeId).length,
    modelSignalCount: signals.filter((entry) => !!entry.model).length,
    modelTierSignalCount: signals.filter((entry) => !!entry.modelTier).length,
    targetCounts: countByString(recommendations.map((entry) => stringValue(entry.target) ?? 'unspecified'))
  };
}

export function dedupeRoutingSignals(signals: readonly FrontierSwarmModelRoutingPolicySignalInput[]): FrontierSwarmModelRoutingPolicySignalInput[] {
  const seen = new Set<string>();
  const out: FrontierSwarmModelRoutingPolicySignalInput[] = [];
  for (const signal of signals) {
    const key = routingSignalKey(signal);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

function adaptiveRecommendationRoutingMode(action: unknown): 'prefer' | 'avoid' | undefined {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : '';
  if (['increase', 'prefer', 'promote', 'use'].includes(normalized)) return 'prefer';
  if (['decrease', 'avoid', 'demote', 'reduce'].includes(normalized)) return 'avoid';
  return undefined;
}

function adaptiveRecommendationLane(target: unknown, key: unknown, metadata: Record<string, unknown>): string | undefined {
  const lane = stringValue(metadata.lane);
  if (lane) return lane;
  const normalizedTarget = typeof target === 'string' ? target.trim().toLowerCase() : '';
  if (['lane', 'max-ready-jobs', 'concurrency'].includes(normalizedTarget)) return stringValue(key);
  return undefined;
}

function adaptiveRecommendationConfidence(score: unknown): 'high' | 'medium' | 'low' {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'medium';
  const normalized = score > 1 ? score / 100 : score;
  if (normalized >= 0.75) return 'high';
  if (normalized >= 0.35) return 'medium';
  return 'low';
}

function routingSignalKey(signal: FrontierSwarmModelRoutingPolicySignalInput): string {
  const metadata = objectValue(signal.metadata);
  return [
    stringValue(metadata.source) ?? '',
    stringValue(metadata.feedbackId) ?? '',
    stringValue(metadata.recommendationId) ?? '',
    signal.mode ?? '',
    signal.lane ?? '',
    signal.layer ?? '',
    signal.workKind ?? signal.taskKind ?? '',
    signal.computeId ?? '',
    signal.model ?? '',
    signal.modelTier ?? '',
    signal.reason ?? ''
  ].join('\u0000');
}

function countByString(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
