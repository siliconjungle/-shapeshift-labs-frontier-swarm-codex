import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmAdaptiveObservationInput } from '@shapeshift-labs/frontier-swarm';
import type {
  FrontierCodexAdaptiveFeedbackObservationMetadata,
  FrontierCodexAdaptiveFeedbackRoutingKey
} from './index.js';
import type { FrontierCodexSwarmRunOptions } from './index.js';

type AdaptiveFeedbackRoutingKey = FrontierCodexAdaptiveFeedbackRoutingKey & { workKind?: string };

export async function readAdaptiveFeedbackObservations(
  options: FrontierCodexSwarmRunOptions
): Promise<FrontierSwarmAdaptiveObservationInput[]> {
  const observations = normalizeAdaptiveFeedbackObservations(options.adaptiveObservations ?? []);
  if (!options.adaptiveFeedbackPath) return observations;
  const absolute = path.resolve(options.cwd ?? process.cwd(), options.adaptiveFeedbackPath);
  const parsed = JSON.parse(await fs.readFile(absolute, 'utf8')) as { observations?: unknown[] };
  return observations.concat(normalizeAdaptiveFeedbackObservations(Array.isArray(parsed.observations)
    ? parsed.observations as FrontierSwarmAdaptiveObservationInput[]
    : []));
}

function normalizeAdaptiveFeedbackObservations(
  observations: readonly FrontierSwarmAdaptiveObservationInput[]
): FrontierSwarmAdaptiveObservationInput[] {
  return observations.map(normalizeAdaptiveFeedbackObservation);
}

function normalizeAdaptiveFeedbackObservation(
  observation: FrontierSwarmAdaptiveObservationInput
): FrontierSwarmAdaptiveObservationInput {
  const raw = observation as unknown as Record<string, unknown>;
  const metadata = isRecord(observation.metadata)
    ? { ...observation.metadata } as FrontierCodexAdaptiveFeedbackObservationMetadata
    : {};
  const routingKey = isRecord(metadata.routingKey)
    ? { ...metadata.routingKey } as AdaptiveFeedbackRoutingKey
    : {};
  const routing = nestedRecord(metadata, 'routing') ?? {};
  const tournamentStrategy = nestedRecord(metadata, 'tournamentStrategy') ?? {};
  const tournamentRoutingKey = nestedRecord(tournamentStrategy, 'routingKey') ?? {};
  const workKind = stringValue(routingKey.workKind)
    ?? stringValue(routing.workKind)
    ?? stringValue(raw.workKind)
    ?? stringValue(metadata.workKind)
    ?? stringValue(nestedRecord(metadata, 'task')?.workKind)
    ?? stringValue(tournamentStrategy.workKind)
    ?? stringValue(tournamentRoutingKey.workKind);
  const taskKind = stringValue(routingKey.taskKind)
    ?? stringValue(routing.taskKind)
    ?? stringValue(raw.taskKind)
    ?? stringValue(metadata.taskKind)
    ?? stringValue(nestedRecord(metadata, 'task')?.kind)
    ?? stringValue(tournamentStrategy.taskKind)
    ?? stringValue(tournamentRoutingKey.taskKind)
    ?? workKind;
  const lane = observation.lane
    ?? stringValue(routingKey.lane)
    ?? stringValue(routing.lane)
    ?? stringValue(raw.lane)
    ?? stringValue(metadata.lane)
    ?? stringValue(metadata.adaptiveLane)
    ?? stringValue(nestedRecord(metadata, 'task')?.lane)
    ?? stringValue(tournamentStrategy.lane)
    ?? stringValue(tournamentRoutingKey.lane);
  const modelTier = stringValue(routingKey.modelTier)
    ?? stringValue(routing.modelTier)
    ?? stringValue(raw.modelTier)
    ?? stringValue(metadata.modelTier)
    ?? stringValue(metadata.tier)
    ?? stringValue(nestedRecord(metadata, 'compute')?.modelTier)
    ?? stringValue(nestedRecord(metadata, 'compute')?.tier)
    ?? stringValue(tournamentStrategy.modelTier)
    ?? stringValue(tournamentRoutingKey.modelTier);
  const nextRoutingKey: AdaptiveFeedbackRoutingKey = {
    ...routingKey,
    ...(taskKind ? { taskKind } : {}),
    ...(workKind ? { workKind } : {}),
    ...(lane ? { lane } : {}),
    ...(modelTier ? { modelTier } : {})
  };
  const nextMetadata: FrontierCodexAdaptiveFeedbackObservationMetadata = {
    ...metadata,
    ...(taskKind && !metadata.taskKind ? { taskKind } : {}),
    ...(workKind && !metadata.workKind ? { workKind } : {}),
    ...(lane && !metadata.lane ? { lane } : {}),
    ...(modelTier && !metadata.modelTier ? { modelTier } : {}),
    ...(Object.keys(nextRoutingKey).length > 0 ? { routingKey: nextRoutingKey } : {})
  };
  const reasons = uniqueReasonList(raw.reasons, raw.reason);
  return {
    ...observation,
    ...(reasons.length > 0 ? { reasons } : {}),
    ...(lane ? { lane } : {}),
    ...(Object.keys(nextMetadata).length > 0 ? { metadata: nextMetadata } : {})
  };
}

function nestedRecord(input: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = input[key];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function uniqueReasonList(...values: readonly unknown[]): string[] {
  const reasons: string[] = [];
  for (const value of values) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      const reason = stringValue(entry);
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    }
  }
  return reasons;
}
