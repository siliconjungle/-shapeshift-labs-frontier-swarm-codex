import path from 'node:path';
import type {
  FrontierSwarmJob,
  FrontierSwarmJobResultInput,
  FrontierSwarmModelTelemetryRecordInput,
  FrontierSwarmPlan
} from '@shapeshift-labs/frontier-swarm';
import {
  createCodexLiveRoutingController,
  createCodexLiveRoutingTelemetryRecord,
  normalizeCodexLiveRoutingOptions,
  writeCodexLiveRoutingArtifacts
} from './live-routing.js';
import { resolveCodexRuntimeProjectionPaths } from './runtime-projection-common.js';
import {
  appendCodexRuntimeProjectionResult,
  finalizeCodexRuntimeProjectionStores,
  summarizeCodexModelTelemetry
} from './runtime-projections.js';
import {
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
  type PilotGateArtifacts,
  type PilotRepo,
  type PilotTelemetryArtifacts
} from './distributed-pilot-types.js';

export async function writePilotTelemetryArtifacts(
  repo: PilotRepo,
  plan: FrontierSwarmPlan,
  gateArtifacts: PilotGateArtifacts,
  generatedAt: string
): Promise<PilotTelemetryArtifacts> {
  const paths = resolveCodexRuntimeProjectionPaths({ outDir: repo.runDir, cwd: repo.repoRoot }, repo.runDir);
  const generatedAtMs = Date.parse(generatedAt);
  const job = plan.jobs[0] as FrontierSwarmJob | undefined;
  if (!job) throw new Error('distributed pilot plan did not create a job');
  const result: FrontierSwarmJobResultInput = createTelemetryResult(job, gateArtifacts, generatedAtMs);
  await appendCodexRuntimeProjectionResult({ paths, plan, job, result, generatedAt: generatedAtMs });
  const finalized = await finalizeCodexRuntimeProjectionStores({ paths, plan, generatedAt: generatedAtMs });
  const record = createCodexLiveRoutingTelemetryRecord({ plan, job, result, generatedAt: generatedAtMs });
  const routingOptions = normalizeCodexLiveRoutingOptions({ enabled: true, routingMode: 'fill', minSamples: 1 });
  const controller = createCodexLiveRoutingController({
    plan,
    records: [record as FrontierSwarmModelTelemetryRecordInput],
    options: routingOptions,
    completedJobIds: [job.id],
    generatedAt: generatedAtMs
  });
  const liveRoutingPolicyPath = path.join(repo.runDir, 'model-routing-policy.live.json');
  const liveRoutingControllerPath = path.join(repo.runDir, 'routing-controller.json');
  const liveRoutingHistoryPath = path.join(repo.runDir, 'routing-controller-history.json');
  await writeCodexLiveRoutingArtifacts({
    paths: { liveRoutingPolicyPath, liveRoutingControllerPath, liveRoutingHistoryPath },
    options: routingOptions,
    controller,
    history: [controller]
  });
  const telemetrySummary = finalized.modelTelemetrySummary ?? summarizeCodexModelTelemetry([record] as any, {
    generatedAt: generatedAtMs,
    runId: plan.runId,
    planId: plan.id,
    telemetryPath: paths.modelTelemetryPath
  });
  return {
    modelTelemetryPath: paths.modelTelemetryPath ?? path.join(repo.runDir, 'model-telemetry.jsonl'),
    modelTelemetrySummaryPath: paths.modelTelemetrySummaryPath ?? path.join(repo.runDir, 'model-telemetry-summary.json'),
    liveRoutingPolicyPath,
    liveRoutingControllerPath,
    liveRoutingHistoryPath,
    telemetrySummary: telemetrySummary as unknown as Record<string, unknown>,
    routingSummary: {
      kind: controller.kind,
      id: controller.id,
      policySignalCount: controller.policy.signals.length,
      decisionCount: controller.decisions.length,
      generatedAt: controller.generatedAt
    }
  };
}

function createTelemetryResult(
  job: FrontierSwarmJob,
  gateArtifacts: PilotGateArtifacts,
  generatedAtMs: number
): FrontierSwarmJobResultInput {
  return {
    jobId: job.id,
    status: 'completed',
    mergeReadiness: 'verified-patch',
    mergeDisposition: 'ready',
    startedAt: generatedAtMs,
    finishedAt: generatedAtMs + 10,
    changedPaths: ['packages/frontier-swarm-codex/src/distributed-pilot.ts'],
    evidencePaths: [gateArtifacts.gateExecutionsPath, gateArtifacts.gateSummaryPath],
    verification: [{ command: ['node', 'test/smoke/distributed-pilot.mjs'], status: 0, required: true }],
    metadata: {
      source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
      verificationGateEvidence: {
        gateExecutionsPath: gateArtifacts.gateExecutionsPath,
        gateSummaryPath: gateArtifacts.gateSummaryPath
      },
      contextBudget: {
        measured: { promptBytes: 1024, estimatedInputTokens: 256 },
        usage: { inputTokens: 320, cachedInputTokens: 80, uncachedInputTokens: 240, outputTokens: 96 }
      }
    }
  };
}
