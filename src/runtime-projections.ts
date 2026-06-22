import path from 'node:path';
import type { FrontierSwarmJob, FrontierSwarmJobResultInput, FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';
import { writeJsonAtomic } from './common.js';
import {
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENTS_FILE,
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_FILE,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_EVENTS_FILE,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_FILE,
  appendJsonlQueued,
  type FrontierCodexRuntimeProjectionPaths
} from './runtime-projection-common.js';
import {
  createCodexHumanActionEvents,
  readCodexHumanActionBrokerState,
  readCodexHumanActionEvents,
  summarizeCodexHumanActionBrokerState
} from './runtime-human-actions.js';
import {
  createCodexModelTelemetryRecord,
  readCodexModelTelemetryRecords,
  readCodexModelTelemetrySummary,
  summarizeCodexModelTelemetry
} from './runtime-model-telemetry.js';
import type {
  FrontierCodexHumanActionBrokerState,
  FrontierCodexModelTelemetrySummary
} from './types-runtime-projections.js';

export * from './runtime-projection-common.js';
export * from './runtime-human-actions.js';
export * from './runtime-model-telemetry.js';
export type * from './types-runtime-projections.js';

export async function appendCodexRuntimeProjectionResult(input: {
  paths: FrontierCodexRuntimeProjectionPaths;
  plan: FrontierSwarmPlan;
  job?: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
  generatedAt?: number;
}): Promise<void> {
  const generatedAt = input.generatedAt ?? Date.now();
  const writes: Promise<void>[] = [];
  if (input.paths.modelTelemetryPath) {
    writes.push(appendJsonlQueued(input.paths.modelTelemetryPath, createCodexModelTelemetryRecord({
      plan: input.plan,
      job: input.job,
      result: input.result,
      generatedAt
    })));
  }
  if (input.paths.humanActionEventsPath) {
    for (const event of createCodexHumanActionEvents({ plan: input.plan, job: input.job, result: input.result, generatedAt })) {
      writes.push(appendJsonlQueued(input.paths.humanActionEventsPath, event));
    }
  }
  await Promise.all(writes);
}

export async function finalizeCodexRuntimeProjectionStores(input: {
  paths: FrontierCodexRuntimeProjectionPaths;
  plan: FrontierSwarmPlan;
  generatedAt?: number;
}): Promise<{ modelTelemetrySummary?: FrontierCodexModelTelemetrySummary; humanActionState?: FrontierCodexHumanActionBrokerState }> {
  const generatedAt = input.generatedAt ?? Date.now();
  const modelRecords = input.paths.modelTelemetryPath ? await readCodexModelTelemetryRecords(input.paths.modelTelemetryPath) : [];
  const modelTelemetrySummary = input.paths.modelTelemetrySummaryPath
    ? summarizeCodexModelTelemetry(modelRecords, {
      generatedAt,
      runId: input.plan.runId,
      planId: input.plan.id,
      telemetryPath: input.paths.modelTelemetryPath
    })
    : undefined;
  if (input.paths.modelTelemetrySummaryPath && modelTelemetrySummary) {
    await writeJsonAtomic(input.paths.modelTelemetrySummaryPath, modelTelemetrySummary);
  }
  const humanActionEvents = input.paths.humanActionEventsPath ? await readCodexHumanActionEvents(input.paths.humanActionEventsPath) : [];
  const humanActionState = input.paths.humanActionStatePath
    ? summarizeCodexHumanActionBrokerState(humanActionEvents, {
      generatedAt,
      runId: input.plan.runId,
      planId: input.plan.id,
      eventPath: input.paths.humanActionEventsPath
    })
    : undefined;
  if (input.paths.humanActionStatePath && humanActionState) {
    await writeJsonAtomic(input.paths.humanActionStatePath, humanActionState);
  }
  return {
    ...(modelTelemetrySummary ? { modelTelemetrySummary } : {}),
    ...(humanActionState ? { humanActionState } : {})
  };
}

export async function readCodexRuntimeProjectionArtifacts(runDir: string | undefined): Promise<{
  modelTelemetrySummary?: FrontierCodexModelTelemetrySummary;
  humanActionState?: FrontierCodexHumanActionBrokerState;
  paths: FrontierCodexRuntimeProjectionPaths;
}> {
  if (!runDir) return { paths: {} };
  const paths = {
    modelTelemetryPath: path.join(runDir, FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_EVENTS_FILE),
    modelTelemetrySummaryPath: path.join(runDir, FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_FILE),
    humanActionEventsPath: path.join(runDir, FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENTS_FILE),
    humanActionStatePath: path.join(runDir, FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_FILE)
  };
  return {
    paths,
    modelTelemetrySummary: await readCodexModelTelemetrySummary(paths.modelTelemetrySummaryPath),
    humanActionState: await readCodexHumanActionBrokerState(paths.humanActionStatePath)
  };
}
