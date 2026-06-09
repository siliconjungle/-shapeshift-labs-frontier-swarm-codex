import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmAdaptiveObservationInput } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSwarmRunOptions } from './index.js';

export async function readAdaptiveFeedbackObservations(
  options: FrontierCodexSwarmRunOptions
): Promise<FrontierSwarmAdaptiveObservationInput[]> {
  const observations = [...(options.adaptiveObservations ?? [])];
  if (!options.adaptiveFeedbackPath) return observations;
  const absolute = path.resolve(options.cwd ?? process.cwd(), options.adaptiveFeedbackPath);
  const parsed = JSON.parse(await fs.readFile(absolute, 'utf8')) as { observations?: unknown[] };
  return observations.concat(Array.isArray(parsed.observations)
    ? parsed.observations as FrontierSwarmAdaptiveObservationInput[]
    : []);
}
