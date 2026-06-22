import fs from 'node:fs/promises';
import path from 'node:path';
import { createRunEvent } from '@shapeshift-labs/frontier-run';
import { writeJsonAtomic } from './common.js';
import { appendCodexRunEvents, readCodexRunEvents } from './run-events.js';
import { syncCodexRunEventPeers } from './run-sync.js';
import { writePilotQueueArtifacts } from './distributed-pilot-queue.js';
import { writePilotLeaseArtifacts } from './distributed-pilot-lease.js';
import { writePilotGateArtifacts } from './distributed-pilot-gates.js';
import { writePilotTelemetryArtifacts } from './distributed-pilot-telemetry.js';
import {
  createPilotPeerRunEvents,
  createPilotRunEvents,
  latestEventIdByActor,
  readPilotRepoResult,
  refreshRepoDashboard
} from './distributed-pilot-events.js';
import { createPilotPlan, createPilotRepos, slugTime } from './distributed-pilot-plan.js';
import { createPilotProof } from './distributed-pilot-proof.js';
import {
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_PROOF_FILE,
  type FrontierCodexDistributedPilotOptions,
  type FrontierCodexDistributedPilotProof
} from './distributed-pilot-types.js';

export type {
  FrontierCodexDistributedPilotOptions,
  FrontierCodexDistributedPilotProof,
  FrontierCodexDistributedPilotRepoResult
} from './distributed-pilot-types.js';
export {
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_GATE_EXECUTIONS_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_GATE_SUMMARY_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_LEASE_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_PROOF_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_EVENTS_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_STATE_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_QUEUE_SUMMARY_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_VERSION
} from './distributed-pilot-types.js';

export async function runCodexDistributedPilot(
  options: FrontierCodexDistributedPilotOptions = {}
): Promise<FrontierCodexDistributedPilotProof> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const runId = options.runId ?? `frontier-distributed-pilot:${Date.now().toString(36)}`;
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const outDir = path.resolve(cwd, options.outDir ?? path.join('agent-runs', 'distributed-pilot', slugTime(generatedAt)));
  await fs.mkdir(outDir, { recursive: true });

  const plan = createPilotPlan(runId);
  const repos = await createPilotRepos({ cwd, outDir, runId, options });
  const queueArtifacts = await writePilotQueueArtifacts(repos[0], plan, generatedAt);
  const leaseArtifacts = await writePilotLeaseArtifacts(repos[0], plan, generatedAt);
  const gateArtifacts = await writePilotGateArtifacts(repos[0], generatedAt);
  const telemetryArtifacts = await writePilotTelemetryArtifacts(repos[0], plan, gateArtifacts, generatedAt);
  await writeInitialRunEvents({ runId, repos, plan, queueArtifacts, leaseArtifacts, gateArtifacts, telemetryArtifacts, generatedAt });

  const firstSync = await syncCodexRunEventPeers({
    cwd,
    run: repos[0].runDir,
    peers: [repos[1].runDir],
    direction: 'bidirectional',
    runId,
    runSyncEvidencePath: path.join(repos[0].runDir, 'run-sync-evidence.json'),
    runSyncHistoryPath: path.join(repos[0].runDir, 'run-sync-history.jsonl'),
    generatedAt
  });
  if (!firstSync) throw new Error('distributed pilot sync did not produce first exchange evidence');

  const repoAEvents = await readCodexRunEvents(repos[0].runEventsPath);
  const parentFromRepoA = latestEventIdByActor(repoAEvents, repos[0].actorId);
  const ackEvent = createRunEvent({
    runId,
    actorId: repos[1].actorId,
    actorSeq: 3,
    parents: parentFromRepoA ? [parentFromRepoA] : [],
    time: generatedAt,
    type: 'note.recorded',
    payload: { note: { id: `ack:${repos[1].id}->${repos[0].id}`, text: `${repos[1].id} received ${repos[0].id} frontier-run events` } }
  });
  await appendCodexRunEvents(repos[1].runEventsPath, [ackEvent]);

  const secondSync = await syncCodexRunEventPeers({
    cwd,
    run: repos[1].runDir,
    peers: [repos[0].runDir],
    direction: 'bidirectional',
    runId,
    runSyncEvidencePath: path.join(repos[1].runDir, 'run-sync-evidence.json'),
    runSyncHistoryPath: path.join(repos[1].runDir, 'run-sync-history.jsonl'),
    generatedAt
  });
  if (!secondSync) throw new Error('distributed pilot sync did not produce second exchange evidence');

  await Promise.all(repos.map((repo) => refreshRepoDashboard(repo, runId, generatedAt)));
  const proofPath = path.join(outDir, FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_PROOF_FILE);
  const proof = createPilotProof({
    generatedAt,
    runId,
    outDir,
    proofPath,
    repos: await Promise.all(repos.map((repo) => readPilotRepoResult(repo))),
    firstSync,
    secondSync,
    ackEvent,
    queueArtifacts,
    leaseArtifacts,
    gateArtifacts,
    telemetryArtifacts
  });
  await writeJsonAtomic(proofPath, proof);
  return proof;
}

async function writeInitialRunEvents(input: {
  runId: string;
  repos: Awaited<ReturnType<typeof createPilotRepos>>;
  plan: ReturnType<typeof createPilotPlan>;
  queueArtifacts: Awaited<ReturnType<typeof writePilotQueueArtifacts>>;
  leaseArtifacts: Awaited<ReturnType<typeof writePilotLeaseArtifacts>>;
  gateArtifacts: Awaited<ReturnType<typeof writePilotGateArtifacts>>;
  telemetryArtifacts: Awaited<ReturnType<typeof writePilotTelemetryArtifacts>>;
  generatedAt: string;
}): Promise<void> {
  const [primary, peer] = input.repos;
  await appendCodexRunEvents(primary.runEventsPath, createPilotRunEvents({
    runId: input.runId,
    repo: primary,
    plan: input.plan,
    queueSummaryPath: input.queueArtifacts.queueSummaryPath,
    leasePath: input.leaseArtifacts.semanticLeasePath,
    gateSummaryPath: input.gateArtifacts.gateSummaryPath,
    telemetrySummaryPath: input.telemetryArtifacts.modelTelemetrySummaryPath,
    generatedAt: input.generatedAt
  }));
  await appendCodexRunEvents(peer.runEventsPath, createPilotPeerRunEvents({
    runId: input.runId,
    repo: peer,
    generatedAt: input.generatedAt
  }));
  await Promise.all(input.repos.map((repo) => refreshRepoDashboard(repo, input.runId, input.generatedAt)));
}
