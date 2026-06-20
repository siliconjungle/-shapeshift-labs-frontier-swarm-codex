import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FRONTIER_SWARM_CODEX_STEERING_INTENT_KIND,
  FRONTIER_SWARM_CODEX_STEERING_INTENT_VERSION
} from './constants.js';
import { isObject, stableHash, uniqueStrings } from './common.js';
import type {
  FrontierCodexDashboardSteeringIntent,
  FrontierCodexDashboardSteeringIntentInput,
  FrontierCodexDashboardSteeringWriteInput,
  FrontierCodexDashboardSteeringWriteResult
} from './types-dashboard.js';

export function createCodexDashboardSteeringIntent(input: FrontierCodexDashboardSteeringIntentInput): FrontierCodexDashboardSteeringIntent {
  const generatedAt = Date.now();
  const laneFocus = uniqueStrings([...(input.laneFocus ?? [])]);
  const tags = uniqueStrings(['loom-ui', ...(input.tags ?? [])]);
  const maxConcurrency = input.maxConcurrency === undefined ? undefined : Math.max(1, Math.floor(input.maxConcurrency));
  return {
    kind: FRONTIER_SWARM_CODEX_STEERING_INTENT_KIND,
    version: FRONTIER_SWARM_CODEX_STEERING_INTENT_VERSION,
    id: 'codex-dashboard-steering:' + stableHash([input.run, input.collection, input.continuation, input.routingMode, maxConcurrency, laneFocus, input.modelTierPreference, input.nextWaveNote, generatedAt]),
    generatedAt,
    target: {
      ...(input.run ? { run: input.run } : {}),
      ...(input.collection ? { collection: input.collection } : {}),
      ...(input.continuation ? { continuation: input.continuation } : {})
    },
    ...(input.routingMode ? { routingMode: input.routingMode } : {}),
    ...(maxConcurrency ? { maxConcurrency } : {}),
    laneFocus,
    ...(input.modelTierPreference ? { modelTierPreference: input.modelTierPreference } : {}),
    ...(input.nextWaveNote ? { nextWaveNote: input.nextWaveNote } : {}),
    tags,
    metadata: { ...(input.metadata ?? {}) }
  };
}

export async function writeCodexDashboardSteeringIntent(input: FrontierCodexDashboardSteeringWriteInput): Promise<FrontierCodexDashboardSteeringWriteResult> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const intent = isSteeringIntent(input.intent) ? input.intent : createCodexDashboardSteeringIntent(input.intent);
  const baseDir = path.resolve(cwd, input.outDir ?? 'agent-runs/loom-ui-steering');
  const file = input.file ? path.resolve(cwd, input.file) : path.join(baseDir, `steering-intent-${intent.generatedAt}.json`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(intent, null, 2) + '\n');
  return { ok: true, file, intent };
}

function isSteeringIntent(value: unknown): value is FrontierCodexDashboardSteeringIntent {
  return isObject(value) && value.kind === FRONTIER_SWARM_CODEX_STEERING_INTENT_KIND;
}
