import type { FrontierRunEvent } from '@shapeshift-labs/frontier-run';
import type { FrontierCodexRunSyncResult } from './run-sync.js';

export const FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND = 'frontier.swarm-codex.distributed-pilot';
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_VERSION = 1;
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_PROOF_FILE = 'distributed-pilot-proof.json';
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_STATE_FILE = 'queue-state.json';
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_EVENTS_FILE = 'queue-events.jsonl';
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_SUMMARY_FILE = 'queue-summary.json';
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_LEASE_FILE = 'semantic-lease.json';
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_GATE_EXECUTIONS_FILE = 'gate-executions.json';
export const FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_GATE_SUMMARY_FILE = 'gate-summary.json';

export interface FrontierCodexDistributedPilotOptions {
  outDir?: string;
  cwd?: string;
  runId?: string;
  repos?: readonly string[];
  repoCount?: number;
  initializeGit?: boolean;
  generatedAt?: string;
}

export interface PilotRepo {
  id: string;
  actorId: string;
  repoRoot: string;
  runDir: string;
  runEventsPath: string;
  runDashboardPath: string;
}

export interface FrontierCodexDistributedPilotRepoResult extends PilotRepo {
  gitDir: string;
  gitDirExists: boolean;
  eventCount: number;
  runIds: string[];
  actorIds: string[];
  dashboardCounts: Record<string, number>;
}

export interface PilotQueueArtifacts {
  queueStatePath: string;
  queueEventsPath: string;
  queueSummaryPath: string;
  summary: Record<string, unknown>;
}

export interface PilotLeaseArtifacts {
  semanticLeasePath: string;
  summary: Record<string, unknown>;
}

export interface PilotGateArtifacts {
  gateExecutionsPath: string;
  gateSummaryPath: string;
  gateExecution: unknown;
  gateSummary: {
    failed: number;
    blocked: number;
    passed: number;
    [key: string]: unknown;
  };
}

export interface PilotTelemetryArtifacts {
  modelTelemetryPath: string;
  modelTelemetrySummaryPath: string;
  liveRoutingPolicyPath: string;
  liveRoutingControllerPath: string;
  liveRoutingHistoryPath: string;
  telemetrySummary: Record<string, unknown>;
  routingSummary: Record<string, unknown>;
}

export interface FrontierCodexDistributedPilotProof {
  kind: typeof FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND;
  version: typeof FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_VERSION;
  ok: boolean;
  generatedAt: string;
  runId: string;
  outDir: string;
  proofPath: string;
  repoCount: number;
  gitRepoCount: number;
  actorCount: number;
  sharedRunId: boolean;
  causalAckParentId?: string;
  sync: {
    exchangeCount: number;
    pulledEventCount: number;
    pushedEventCount: number;
    acceptedEventCount: number;
    conflictCount: number;
    evidencePaths: string[];
    historyPaths: string[];
  };
  artifacts: {
    queueStatePath: string;
    queueEventsPath: string;
    queueSummaryPath: string;
    semanticLeasePath: string;
    gateExecutionsPath: string;
    gateSummaryPath: string;
    modelTelemetryPath: string;
    modelTelemetrySummaryPath: string;
    liveRoutingPolicyPath: string;
    liveRoutingControllerPath: string;
    liveRoutingHistoryPath: string;
  };
  coverage: Record<string, boolean>;
  repos: FrontierCodexDistributedPilotRepoResult[];
  summaries: {
    queue: Record<string, unknown>;
    lease: Record<string, unknown>;
    gate: Record<string, unknown>;
    telemetry: Record<string, unknown>;
    routing: Record<string, unknown>;
  };
}

export interface PilotProofInput {
  generatedAt: string;
  runId: string;
  outDir: string;
  proofPath: string;
  repos: FrontierCodexDistributedPilotRepoResult[];
  firstSync: FrontierCodexRunSyncResult;
  secondSync: FrontierCodexRunSyncResult;
  ackEvent: FrontierRunEvent;
  queueArtifacts: PilotQueueArtifacts;
  leaseArtifacts: PilotLeaseArtifacts;
  gateArtifacts: PilotGateArtifacts;
  telemetryArtifacts: PilotTelemetryArtifacts;
}
