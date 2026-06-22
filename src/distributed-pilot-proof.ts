import {
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_VERSION,
  type FrontierCodexDistributedPilotProof,
  type PilotProofInput
} from './distributed-pilot-types.js';

export function createPilotProof(input: PilotProofInput): FrontierCodexDistributedPilotProof {
  const syncEvidencePaths = [
    input.firstSync.runSyncEvidencePath,
    input.secondSync.runSyncEvidencePath
  ].filter((value): value is string => Boolean(value));
  const syncHistoryPaths = [
    input.firstSync.runSyncHistoryPath,
    input.secondSync.runSyncHistoryPath
  ].filter((value): value is string => Boolean(value));
  const gitRepoCount = input.repos.filter((repo) => repo.gitDirExists).length;
  const actorCount = new Set(input.repos.map((repo) => repo.actorId)).size;
  const sync = {
    exchangeCount: input.firstSync.summary.exchangeCount + input.secondSync.summary.exchangeCount,
    pulledEventCount: input.firstSync.summary.pulledEventCount + input.secondSync.summary.pulledEventCount,
    pushedEventCount: input.firstSync.summary.pushedEventCount + input.secondSync.summary.pushedEventCount,
    acceptedEventCount: input.firstSync.summary.acceptedEventCount + input.secondSync.summary.acceptedEventCount,
    conflictCount: input.firstSync.summary.conflictCount + input.secondSync.summary.conflictCount,
    evidencePaths: syncEvidencePaths,
    historyPaths: syncHistoryPaths
  };
  const gatePackageScope = input.gateArtifacts.gateSummary.packageScope;
  const packageMaintenance = Array.isArray(gatePackageScope)
    && gatePackageScope.includes('@shapeshift-labs/frontier-swarm-codex');
  const sharedRunId = input.repos.every((repo) => repo.runIds.length === 1 && repo.runIds[0] === input.runId);
  const coverage = {
    packageMaintenance,
    distributedRunPilot: input.repos.length >= 2 && input.repos.every((repo) => repo.eventCount >= 3),
    durableQueue: Number(input.queueArtifacts.summary.terminalOutcomeCount ?? 0) >= 1,
    semanticLeases: input.leaseArtifacts.summary.granted === true && input.leaseArtifacts.summary.fenceValid === true,
    coordinatorApplyEngine: input.leaseArtifacts.summary.fenceValid === true && Boolean(input.leaseArtifacts.summary.leaseClaim),
    gateContract: input.gateArtifacts.gateSummary.failed === 0
      && input.gateArtifacts.gateSummary.blocked === 0
      && input.gateArtifacts.gateSummary.passed >= 1,
    dashboardProjection: input.repos.every((repo) => Number(repo.dashboardCounts.decision ?? 0) >= 1),
    telemetryRouting: Number(input.telemetryArtifacts.telemetrySummary.recordCount ?? 0) >= 1
      && Number(input.telemetryArtifacts.routingSummary.policySignalCount ?? 0) >= 0
  };
  const ok = Object.values(coverage).every(Boolean)
    && input.repos.length >= 2
    && gitRepoCount >= 2
    && actorCount >= 2
    && sharedRunId
    && sync.acceptedEventCount > 0
    && sync.conflictCount === 0
    && input.ackEvent.parents.length > 0;
  return {
    kind: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
    version: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_VERSION,
    ok,
    generatedAt: input.generatedAt,
    runId: input.runId,
    outDir: input.outDir,
    proofPath: input.proofPath,
    repoCount: input.repos.length,
    gitRepoCount,
    actorCount,
    sharedRunId,
    ...(input.ackEvent.parents[0] ? { causalAckParentId: input.ackEvent.parents[0] } : {}),
    sync,
    artifacts: {
      queueStatePath: input.queueArtifacts.queueStatePath,
      queueEventsPath: input.queueArtifacts.queueEventsPath,
      queueSummaryPath: input.queueArtifacts.queueSummaryPath,
      semanticLeasePath: input.leaseArtifacts.semanticLeasePath,
      gateExecutionsPath: input.gateArtifacts.gateExecutionsPath,
      gateSummaryPath: input.gateArtifacts.gateSummaryPath,
      modelTelemetryPath: input.telemetryArtifacts.modelTelemetryPath,
      modelTelemetrySummaryPath: input.telemetryArtifacts.modelTelemetrySummaryPath,
      liveRoutingPolicyPath: input.telemetryArtifacts.liveRoutingPolicyPath,
      liveRoutingControllerPath: input.telemetryArtifacts.liveRoutingControllerPath,
      liveRoutingHistoryPath: input.telemetryArtifacts.liveRoutingHistoryPath
    },
    coverage,
    repos: input.repos,
    summaries: {
      queue: input.queueArtifacts.summary,
      lease: input.leaseArtifacts.summary,
      gate: input.gateArtifacts.gateSummary as unknown as Record<string, unknown>,
      telemetry: input.telemetryArtifacts.telemetrySummary,
      routing: input.telemetryArtifacts.routingSummary
    }
  };
}
