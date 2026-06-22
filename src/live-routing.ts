import path from 'node:path';
import {
  createSwarmRoutingController,
  type FrontierSwarmJob,
  type FrontierSwarmJobResultInput,
  type FrontierSwarmModelTelemetryRecordInput,
  type FrontierSwarmPlan,
  type FrontierSwarmRoutingController
} from '@shapeshift-labs/frontier-swarm';
import { writeJsonAtomic } from './common.js';
import { createCodexModelTelemetryRecord } from './runtime-model-telemetry.js';
import type { FrontierCodexSwarmRunOptions } from './types-run.js';
import type { FrontierCodexLiveRoutingOptions } from './types-live-routing.js';

export const FRONTIER_SWARM_CODEX_LIVE_ROUTING_POLICY_FILE = 'model-routing-policy.live.json';
export const FRONTIER_SWARM_CODEX_LIVE_ROUTING_CONTROLLER_FILE = 'routing-controller.json';
export const FRONTIER_SWARM_CODEX_LIVE_ROUTING_HISTORY_FILE = 'routing-controller-history.json';

export interface FrontierCodexLiveRoutingResolvedOptions {
  enabled: boolean;
  routingMode?: FrontierCodexLiveRoutingOptions['routingMode'];
  minSamples?: number;
  preferSuccessRate?: number;
  avoidSuccessRate?: number;
  highCostUsd?: number;
  writeArtifacts: boolean;
}

export interface FrontierCodexLiveRoutingPaths {
  liveRoutingPolicyPath?: string;
  liveRoutingControllerPath?: string;
  liveRoutingHistoryPath?: string;
}

export function normalizeCodexLiveRoutingOptions(input: FrontierCodexSwarmRunOptions['liveRouting']): FrontierCodexLiveRoutingResolvedOptions {
  if (input === false) return { enabled: false, writeArtifacts: true };
  if (input === true || input === undefined) return { enabled: true, writeArtifacts: true };
  return {
    enabled: input.enabled ?? true,
    ...(input.routingMode ? { routingMode: input.routingMode } : {}),
    ...(positiveNumber(input.minSamples) !== undefined ? { minSamples: positiveNumber(input.minSamples) } : {}),
    ...(ratio(input.preferSuccessRate) !== undefined ? { preferSuccessRate: ratio(input.preferSuccessRate) } : {}),
    ...(ratio(input.avoidSuccessRate) !== undefined ? { avoidSuccessRate: ratio(input.avoidSuccessRate) } : {}),
    ...(positiveNumber(input.highCostUsd) !== undefined ? { highCostUsd: positiveNumber(input.highCostUsd) } : {}),
    writeArtifacts: input.writeArtifacts ?? true
  };
}

export function resolveCodexLiveRoutingPaths(options: FrontierCodexSwarmRunOptions, outDir: string): FrontierCodexLiveRoutingPaths {
  const cwd = options.cwd ?? process.cwd();
  return {
    liveRoutingPolicyPath: resolveLiveRoutingPath(cwd, outDir, options.liveRoutingPolicyPath, FRONTIER_SWARM_CODEX_LIVE_ROUTING_POLICY_FILE),
    liveRoutingControllerPath: resolveLiveRoutingPath(cwd, outDir, options.liveRoutingControllerPath, FRONTIER_SWARM_CODEX_LIVE_ROUTING_CONTROLLER_FILE),
    liveRoutingHistoryPath: resolveLiveRoutingPath(cwd, outDir, options.liveRoutingHistoryPath, FRONTIER_SWARM_CODEX_LIVE_ROUTING_HISTORY_FILE)
  };
}

export function createCodexLiveRoutingTelemetryRecord(input: {
  plan: FrontierSwarmPlan;
  job?: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
  generatedAt: number;
}): FrontierSwarmModelTelemetryRecordInput {
  return createCodexModelTelemetryRecord(input) as unknown as FrontierSwarmModelTelemetryRecordInput;
}

export function createCodexLiveRoutingController(input: {
  plan: FrontierSwarmPlan;
  records: readonly FrontierSwarmModelTelemetryRecordInput[];
  options: FrontierCodexLiveRoutingResolvedOptions;
  activeJobIds?: readonly string[];
  completedJobIds?: readonly string[];
  generatedAt: number;
}): FrontierSwarmRoutingController {
  return createSwarmRoutingController({
    plan: input.plan,
    records: input.records,
    basePolicy: input.plan.routingPolicy,
    routingMode: input.options.routingMode ?? input.plan.routingMode ?? input.plan.routingPolicy?.defaultMode ?? 'fill',
    runningJobIds: input.activeJobIds,
    completedJobIds: input.completedJobIds,
    minSamples: input.options.minSamples,
    preferSuccessRate: input.options.preferSuccessRate,
    avoidSuccessRate: input.options.avoidSuccessRate,
    highCostUsd: input.options.highCostUsd,
    generatedAt: input.generatedAt,
    metadata: {
      source: 'frontier-swarm-codex-live-routing',
      planId: input.plan.id,
      runId: input.plan.runId
    }
  });
}

export async function writeCodexLiveRoutingArtifacts(input: {
  paths: FrontierCodexLiveRoutingPaths;
  options: FrontierCodexLiveRoutingResolvedOptions;
  controller: FrontierSwarmRoutingController;
  history: readonly FrontierSwarmRoutingController[];
}): Promise<void> {
  if (!input.options.writeArtifacts) return;
  await Promise.all([
    input.paths.liveRoutingPolicyPath ? writeJsonAtomic(input.paths.liveRoutingPolicyPath, input.controller.policy) : undefined,
    input.paths.liveRoutingControllerPath ? writeJsonAtomic(input.paths.liveRoutingControllerPath, input.controller) : undefined,
    input.paths.liveRoutingHistoryPath ? writeJsonAtomic(input.paths.liveRoutingHistoryPath, {
      kind: 'frontier.swarm-codex.live-routing-history',
      version: 1,
      generatedAt: input.controller.generatedAt,
      controllerCount: input.history.length,
      controllers: input.history.slice(-50)
    }) : undefined
  ]);
}

function resolveLiveRoutingPath(cwd: string, outDir: string, value: string | false | undefined, fallback: string): string | undefined {
  if (value === false) return undefined;
  if (typeof value === 'string' && value.length > 0) return path.resolve(cwd, value);
  return path.join(outDir, fallback);
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function ratio(value: unknown): number | undefined {
  const number = positiveNumber(value);
  if (number === undefined) return undefined;
  return Math.min(1, Math.max(0, number));
}
