import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createSwarmModelRoutingFeedback,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmModelRoutingFeedback,
  type FrontierSwarmPlan
} from '@shapeshift-labs/frontier-swarm';
import { isObject, uniqueStrings } from './common.js';
import type { FrontierCodexCollectResult } from './types-collection.js';

export function createContinuationFeedback(input: {
  collection?: FrontierCodexCollectResult;
  repository: string;
  packageName?: string;
}): FrontierSwarmModelRoutingFeedback[] {
  const collection = input.collection;
  if (!collection) return [];
  const plan = readContinuationPlanSync(collection.runDir);
  const jobsById = new Map((plan?.jobs ?? []).map((job) => [job.id, job]));
  const entries = Object.values(collection.buckets).flat();
  const tournamentSummary = createContinuationTournamentSummary(collection);
  return entries.map((entry) => {
    const { bundle } = entry;
    const job = jobsById.get(bundle.jobId);
    const compute = job?.compute;
    const task = job?.task;
    const computeId = compute?.id
      ?? task?.compute
      ?? readNestedString(bundle.metadata, ['compute', 'id'])
      ?? readNestedString(bundle.metadata, ['job', 'compute', 'id'])
      ?? readNestedString(bundle.metadata, ['resourceAllocation', 'env', 'FRONTIER_SWARM_COMPUTE_ID'])
      ?? readNestedString(bundle.metadata, ['env', 'FRONTIER_SWARM_COMPUTE_ID']);
    const computeKind = compute?.kind
      ?? readNestedString(bundle.metadata, ['compute', 'kind'])
      ?? readNestedString(bundle.metadata, ['job', 'compute', 'kind'])
      ?? computeKindFromComputeId(computeId);
    const model = compute?.model
      ?? readNestedString(bundle.metadata, ['compute', 'model'])
      ?? readNestedString(bundle.metadata, ['job', 'compute', 'model'])
      ?? readNestedString(bundle.metadata, ['tournamentStrategy', 'model']);
    const modelTier = readNestedString(compute?.metadata, ['modelTier'])
      ?? readNestedString(compute?.metadata, ['tier'])
      ?? readNestedString(bundle.metadata, ['modelTier'])
      ?? readNestedString(bundle.metadata, ['compute', 'modelTier'])
      ?? readNestedString(bundle.metadata, ['job', 'compute', 'modelTier'])
      ?? readNestedString(bundle.metadata, ['tournamentStrategy', 'modelTier'])
      ?? modelTierFromComputeId(computeId);
    const workKind = task?.workKind ?? firstNestedString(bundle.metadata, [
      ['routingKey', 'workKind'],
      ['routing', 'workKind'],
      ['task', 'workKind'],
      ['source', 'workKind'],
      ['workKind']
    ]);
    const taskKind = workKind ?? firstNestedString(bundle.metadata, [
      ['routingKey', 'taskKind'],
      ['routing', 'taskKind'],
      ['task', 'taskKind'],
      ['taskKind']
    ]) ?? 'agent-task';
    const lane = bundle.lane ?? job?.lane ?? task?.lane ?? firstNestedString(bundle.metadata, [
      ['routingKey', 'lane'],
      ['routing', 'lane'],
      ['task', 'lane'],
      ['resourceAllocation', 'env', 'FRONTIER_SWARM_LANE'],
      ['env', 'FRONTIER_SWARM_LANE'],
      ['lane']
    ]);
    return createSwarmModelRoutingFeedback({
      id: `swarm-model-routing-feedback:${bundle.jobId}:${bundle.generatedAt}`,
      scope: input.packageName ? 'package' : 'repository',
      repository: input.repository,
      package: input.packageName,
      runId: bundle.runId,
      planId: bundle.planId,
      jobId: bundle.jobId,
      taskId: bundle.taskId ?? job?.taskId,
      taskKind,
      workKind,
      lane,
      layer: job?.layer,
      computeId,
      computeKind,
      model,
      modelTier,
      reasoningEffort: compute?.reasoningEffort,
      serviceTier: compute?.serviceTier,
      resultStatus: bundle.status,
      mergeReadiness: bundle.mergeReadiness,
      mergeDisposition: bundle.disposition,
      riskLevel: bundle.riskLevel,
      evidenceQuality: evidenceQualityFromBundle(bundle, entry.bucket),
      selected: bundle.autoMergeable,
      tags: ['continuation-feedback'],
      generatedAt: bundle.generatedAt,
      metadata: {
        bundleId: bundle.id,
        autoMergeable: bundle.autoMergeable,
        staleAgainstHead: bundle.staleAgainstHead,
        reasons: bundle.reasons,
        collection: {
          bucket: entry.bucket,
          mergePath: entry.mergePath,
          outputDir: entry.outputDir,
          outDir: collection.outDir,
          runDir: collection.runDir,
          generatedAt: collection.generatedAt,
          summary: collection.summary
        },
        routingDimensions: {
          taskKind,
          ...(workKind ? { workKind } : {}),
          ...(lane ? { lane } : {}),
          ...(computeId ? { computeId } : {}),
          ...(computeKind ? { computeKind } : {}),
          ...(modelTier ? { modelTier } : {})
        },
        ...(tournamentSummary ? { tournamentSummary } : {}),
        adaptiveRecommendations: laneRelevantAdaptiveRecommendations(collection.tournamentAdaptiveFeedback?.recommendations, lane)
      }
    });
  });
}

export function createContinuationTournamentSummary(collection: FrontierCodexCollectResult | undefined) {
  if (!collection) return undefined;
  const tournament = collection.strategyTournament;
  const feedback = collection.tournamentAdaptiveFeedback;
  return {
    tournamentId: tournament.id,
    historyId: collection.strategyHistory.id,
    feedbackId: feedback.id,
    sampleConfidence: tournament.summary.sampleConfidence,
    decisionGrade: tournament.summary.decisionGrade,
    topStrategyId: tournament.summary.topStrategyId,
    topScore: tournament.summary.topScore,
    outcomeCounts: tournament.summary.outcomeCounts,
    adaptiveFeedback: {
      observationCount: feedback.summary.observationCount,
      recommendationCount: feedback.summary.recommendationCount,
      reduceSignals: feedback.summary.reduceSignals,
      increaseSignals: feedback.summary.increaseSignals,
      holdSignals: feedback.summary.holdSignals
    }
  };
}

function laneRelevantAdaptiveRecommendations(
  recommendations: FrontierCodexCollectResult['tournamentAdaptiveFeedback']['recommendations'] | undefined,
  lane: string | undefined
) {
  return (recommendations ?? [])
    .filter((entry) => !entry.key || !lane || entry.key === lane || entry.target === 'max-ready-jobs')
    .slice(0, 8)
    .map((entry) => ({
      action: entry.action,
      target: entry.target,
      ...(entry.key ? { key: entry.key } : {}),
      reason: entry.reason,
      ...(entry.score !== undefined ? { score: entry.score } : {})
    }));
}

function readContinuationPlanSync(runDir: string | undefined): FrontierSwarmPlan | undefined {
  if (!runDir) return undefined;
  try {
    return JSON.parse(readFileSync(path.join(runDir, 'swarm-plan.json'), 'utf8')) as FrontierSwarmPlan;
  } catch {
    return undefined;
  }
}

function readNestedString(value: unknown, keys: readonly string[]): string | undefined {
  let cursor = value;
  for (const key of keys) {
    if (!isObject(cursor)) return undefined;
    cursor = cursor[key];
  }
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : undefined;
}

function firstNestedString(value: unknown, paths: readonly (readonly string[])[]): string | undefined {
  for (const entry of paths) {
    const found = readNestedString(value, entry);
    if (found) return found;
  }
  return undefined;
}

function computeKindFromComputeId(computeId: string | undefined): string | undefined {
  if (!computeId) return undefined;
  const [kind] = computeId.split('.');
  return kind && kind !== computeId ? kind : undefined;
}

function modelTierFromComputeId(computeId: string | undefined): string | undefined {
  if (!computeId) return undefined;
  const [, ...tierParts] = computeId.split('.');
  return tierParts.length ? tierParts.join('.') : undefined;
}

function evidenceQualityFromBundle(
  bundle: FrontierSwarmMergeBundle,
  collectionBucket?: string
): FrontierSwarmModelRoutingFeedback['evidenceQuality'] {
  const passed = bundle.commandsFailed.length === 0;
  const verified = bundle.autoMergeable && passed && bundle.evidencePaths.length > 0;
  const failed = bundle.status === 'failed' || bundle.disposition === 'rejected' || bundle.disposition === 'stale-against-head';
  const verifierKinds = uniqueStrings([
    ...bundle.commandsPassed.map((entry) => entry.name),
    ...bundle.commandsFailed.map((entry) => entry.name)
  ]);
  return {
    band: verified ? 'verified' : bundle.evidencePaths.length ? failed ? 'weak' : 'adequate' : 'none',
    score: verified ? 0.9 : failed ? 0.1 : bundle.evidencePaths.length ? 0.6 : 0.2,
    confidence: verified ? 'high' : failed ? 'medium' : 'low',
    evidencePaths: bundle.evidencePaths,
    verifierKinds,
    missingEvidence: uniqueStrings([
      ...(bundle.evidencePaths.length ? [] : ['evidence-paths']),
      ...(bundle.commandsFailed.length ? ['passing-verification'] : [])
    ]),
    deterministic: bundle.commandsPassed.length > 0 && passed,
    humanReviewed: false,
    metadata: {
      ...(collectionBucket ? { collectionBucket } : {}),
      evidencePathCount: bundle.evidencePaths.length,
      commandsPassed: bundle.commandsPassed.length,
      commandsFailed: bundle.commandsFailed.length
    }
  };
}
