import type { FrontierRunSyncDirection } from '@shapeshift-labs/frontier-run';
import type { FrontierCodexRunSyncResult } from './run-sync.js';
import type { FrontierCodexQueueRuntimeSummary } from './queue-runtime.js';
import type {
  FrontierCodexHumanActionBrokerState,
  FrontierCodexModelTelemetrySummary
} from './runtime-projections.js';

export type FrontierCodexDistributedRunTransportKind =
  | 'local-fs'
  | 'git-repo'
  | 'object-store'
  | 'sqlite'
  | 'postgres';

export interface FrontierCodexDistributedRunTransportOptions {
  kind?: FrontierCodexDistributedRunTransportKind;
  name?: string;
  root?: string;
  metadata?: Record<string, unknown>;
}

export interface FrontierCodexDistributedRunOptions {
  enabled?: boolean;
  runRoot?: string;
  transport?: FrontierCodexDistributedRunTransportKind | FrontierCodexDistributedRunTransportOptions;
  peers?: readonly string[];
  syncDirection?: FrontierRunSyncDirection;
  proofPath?: string | false;
  requireQueue?: boolean;
  requireWorkerRunEvents?: boolean;
}

export interface FrontierCodexDistributedRunResolvedTransport {
  kind: FrontierCodexDistributedRunTransportKind;
  name?: string;
  root?: string;
  metadata?: Record<string, unknown>;
  supported: boolean;
  reason?: string;
}

export interface FrontierCodexDistributedRunResolvedOptions {
  enabled: boolean;
  runRoot: string;
  transport: FrontierCodexDistributedRunResolvedTransport;
  peers: string[];
  syncDirection: FrontierRunSyncDirection;
  proofPath?: string | false;
  requireQueue: boolean;
  requireWorkerRunEvents: boolean;
}

export interface FrontierCodexDistributedRunArtifactPaths {
  runDir: string;
  runEventsPath: string;
  runDashboardPath: string;
  queueStatePath: string;
  queueEventsPath: string;
  queueSummaryPath: string;
  modelTelemetryPath: string;
  modelTelemetrySummaryPath: string;
  humanActionEventsPath: string;
  humanActionStatePath: string;
  liveRoutingPolicyPath: string;
  liveRoutingControllerPath: string;
  liveRoutingHistoryPath: string;
  runSyncEvidencePath: string;
  runSyncHistoryPath: string;
  proofPath: string;
}

export interface FrontierCodexDistributedWorkerRunRecord {
  enabled: true;
  runId: string;
  jobId: string;
  taskId?: string;
  lane?: string;
  workspacePath: string;
  runRoot: string;
  runDir: string;
  runEventsPath: string;
  runDashboardPath: string;
  transport: FrontierCodexDistributedRunResolvedTransport;
}

export interface FrontierCodexDistributedRunProofWorker extends FrontierCodexDistributedWorkerRunRecord {
  eventCount: number;
  actorIds: string[];
  syncedToCoordinator: boolean;
}

export interface FrontierCodexDistributedRunProof {
  kind: 'frontier.swarm-codex.distributed-run';
  version: 1;
  ok: boolean;
  generatedAt: string;
  runId: string;
  planId: string;
  transport: FrontierCodexDistributedRunResolvedTransport;
  coordinator: {
    runDir: string;
    runEventsPath: string;
    runDashboardPath: string;
    eventCount: number;
    actorIds: string[];
  };
  workers: FrontierCodexDistributedRunProofWorker[];
  peers: string[];
  runSync?: FrontierCodexRunSyncResult;
  queueSummary?: FrontierCodexQueueRuntimeSummary;
  modelTelemetrySummary?: FrontierCodexModelTelemetrySummary;
  humanActionState?: FrontierCodexHumanActionBrokerState;
  paths: FrontierCodexDistributedRunArtifactPaths;
  coverage: {
    realWorkerRunEvents: boolean;
    distributedSync: boolean;
    queueBacked: boolean;
    dashboardProjection: boolean;
    modelTelemetryProjection: boolean;
    humanQuestionProjection: boolean;
    transportResolved: boolean;
  };
}

export interface FrontierCodexDistributedRunResult {
  enabled: true;
  options: FrontierCodexDistributedRunResolvedOptions;
  paths: FrontierCodexDistributedRunArtifactPaths;
  workerRunRecords: FrontierCodexDistributedWorkerRunRecord[];
  proof?: FrontierCodexDistributedRunProof;
  proofPath?: string;
}
