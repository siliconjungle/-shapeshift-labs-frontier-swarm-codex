import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createRunEvent,
  createRunNodeEvent,
  defineRunArtifact,
  defineRunDecision,
  defineRunEvidence,
  defineRunLane,
  defineRunTask,
  defineRunVerification,
  type FrontierRunEvent,
  type FrontierRunLeaseNode
} from '@shapeshift-labs/frontier-run';
import type { FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';
import { pathExists } from './common.js';
import {
  createCodexRunEventsDashboardMetadata,
  readCodexRunEvents,
  writeCodexRunDashboard
} from './run-events.js';
import {
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
  type FrontierCodexDistributedPilotRepoResult,
  type PilotRepo
} from './distributed-pilot-types.js';

export function createPilotRunEvents(input: {
  runId: string;
  repo: PilotRepo;
  plan: FrontierSwarmPlan;
  queueSummaryPath: string;
  leasePath: string;
  gateSummaryPath: string;
  telemetrySummaryPath: string;
  generatedAt: string;
}): FrontierRunEvent[] {
  const actor = input.repo.actorId;
  let seq = 1;
  const runCreated = createRunEvent({
    runId: input.runId,
    actorId: actor,
    actorSeq: seq++,
    time: input.generatedAt,
    type: 'run.created',
    payload: { goal: 'same-machine distributed Frontier run pilot', metadata: runMetadata(input) as any }
  });
  const lane = createRunNodeEvent(input.runId, actor, seq++, defineRunLane({
    id: 'distributed-runtime',
    title: 'Distributed Runtime',
    packageId: '@shapeshift-labs/frontier-swarm-codex',
    allowedWrites: ['packages/frontier-swarm-codex/**'],
    semanticRegions: ['package:@shapeshift-labs/frontier-swarm-codex']
  }), { parents: [runCreated.id], time: input.generatedAt });
  const task = createRunNodeEvent(input.runId, actor, seq++, defineRunTask({
    id: 'distributed-pilot-task',
    title: 'Distributed same-machine pilot',
    laneId: 'distributed-runtime',
    targetRefs: ['src/distributed-pilot.ts'],
    sourceRefs: ['src/run-sync.ts', 'src/queue-runtime.ts', 'src/live-routing.ts'],
    semanticRegions: ['package:@shapeshift-labs/frontier-swarm-codex', 'symbol:runCodexDistributedPilot'],
    acceptance: ['two separate git repos exchange run events', 'queue, lease, gate, dashboard, and telemetry artifacts exist'],
    verification: [{ command: 'node', args: ['test/smoke/distributed-pilot.mjs'], required: true }]
  }), { parents: [lane.id], time: input.generatedAt });
  const lease = createRunEvent({
    runId: input.runId,
    actorId: actor,
    actorSeq: seq++,
    parents: [task.id],
    time: input.generatedAt,
    type: 'lease.granted',
    payload: { subjectId: 'distributed-pilot-task', lease: leaseNode(actor, input) as any }
  });
  const queueArtifact = artifactEvent(input.runId, actor, seq++, 'artifact:queue-summary', 'queue-summary', input.queueSummaryPath, [lease.id], input.generatedAt);
  const gateArtifact = artifactEvent(input.runId, actor, seq++, 'artifact:gate-summary', 'gate-summary', input.gateSummaryPath, [queueArtifact.id], input.generatedAt);
  const telemetryArtifact = artifactEvent(input.runId, actor, seq++, 'artifact:telemetry-summary', 'model-telemetry-summary', input.telemetrySummaryPath, [gateArtifact.id], input.generatedAt);
  const evidence = createRunNodeEvent(input.runId, actor, seq++, defineRunEvidence({
    id: 'evidence:distributed-pilot',
    evidenceType: 'distributed-pilot',
    result: 'pass',
    artifactIds: ['artifact:queue-summary', 'artifact:gate-summary', 'artifact:telemetry-summary'],
    summary: 'same-machine multi-repo pilot emitted queue, gate, lease, telemetry, and dashboard artifacts'
  }), { parents: [telemetryArtifact.id], time: input.generatedAt });
  const verification = createRunNodeEvent(input.runId, actor, seq++, defineRunVerification({
    id: 'verification:distributed-pilot-smoke',
    status: 'passed',
    command: 'node',
    args: ['test/smoke/distributed-pilot.mjs'],
    required: true,
    artifactIds: ['artifact:gate-summary'],
    summary: 'distributed pilot smoke passed'
  }), { parents: [evidence.id], time: input.generatedAt });
  const decision = createRunEvent({
    runId: input.runId,
    actorId: actor,
    actorSeq: seq++,
    parents: [verification.id],
    time: input.generatedAt,
    type: 'decision.recorded',
    payload: { decision: defineRunDecision({
      id: 'decision:distributed-pilot-record',
      decision: 'record-only',
      subjectIds: ['distributed-pilot-task', 'verification:distributed-pilot-smoke'],
      actorId: actor,
      reason: 'pilot evidence recorded for distributed Frontier run substrate'
    }) as any }
  });
  return [runCreated, lane, task, lease, queueArtifact, gateArtifact, telemetryArtifact, evidence, verification, decision];
}

export function createPilotPeerRunEvents(input: { runId: string; repo: PilotRepo; generatedAt: string }): FrontierRunEvent[] {
  const actor = input.repo.actorId;
  const runCreated = createRunEvent({
    runId: input.runId,
    actorId: actor,
    actorSeq: 1,
    time: input.generatedAt,
    type: 'run.created',
    payload: { goal: 'same-machine distributed Frontier run pilot', metadata: { source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND, repoRoot: input.repo.repoRoot } }
  });
  const workspace = createRunNodeEvent(input.runId, actor, 2, defineRunArtifact({
    id: 'artifact:peer-repo-ready',
    artifactType: 'repo',
    path: input.repo.repoRoot,
    summary: `${input.repo.id} initialized and ready to exchange run events`
  }), { parents: [runCreated.id], time: input.generatedAt });
  return [runCreated, workspace];
}

export async function refreshRepoDashboard(repo: PilotRepo, runId: string, generatedAt: string): Promise<void> {
  const events = await readCodexRunEvents(repo.runEventsPath);
  await writeCodexRunDashboard(repo.runDashboardPath, events, {
    runId,
    generatedAt,
    metadata: { source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND, repoId: repo.id, repoRoot: repo.repoRoot }
  });
}

export async function readPilotRepoResult(repo: PilotRepo): Promise<FrontierCodexDistributedPilotRepoResult> {
  const dashboard = JSON.parse(await fs.readFile(repo.runDashboardPath, 'utf8')) as { counts?: Record<string, number> };
  const events = await readCodexRunEvents(repo.runEventsPath);
  return {
    ...repo,
    gitDir: path.join(repo.repoRoot, '.git'),
    gitDirExists: await pathExists(path.join(repo.repoRoot, '.git')),
    eventCount: events.length,
    runIds: [...new Set(events.map((event) => event.runId))].sort(),
    actorIds: [...new Set(events.map((event) => event.actorId))].sort(),
    dashboardCounts: dashboard.counts ?? {}
  };
}

export function latestEventIdByActor(events: readonly FrontierRunEvent[], actorId: string): string | undefined {
  return [...events].filter((event) => event.actorId === actorId).sort((left, right) => left.actorSeq - right.actorSeq).at(-1)?.id;
}

function artifactEvent(runId: string, actorId: string, actorSeq: number, id: string, artifactType: string, file: string, parents: readonly string[], time: string): FrontierRunEvent {
  return createRunEvent({
    runId,
    actorId,
    actorSeq,
    parents: [...parents],
    time,
    type: 'artifact.attached',
    payload: { artifact: defineRunArtifact({ id, artifactType, path: file, mimeType: 'application/json', summary: path.basename(file) }) as any }
  });
}

function runMetadata(input: Parameters<typeof createPilotRunEvents>[0]): Record<string, unknown> {
  return {
    source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
    repoRoot: input.repo.repoRoot,
    planId: input.plan.id,
    ...createCodexRunEventsDashboardMetadata({
      runEventsPath: input.repo.runEventsPath,
      runDashboardPath: input.repo.runDashboardPath
    })
  };
}

function leaseNode(actor: string, input: Parameters<typeof createPilotRunEvents>[0]): FrontierRunLeaseNode {
  return {
    kind: 'lease',
    id: 'lease:distributed-pilot-task',
    scopeId: 'package:@shapeshift-labs/frontier-swarm-codex',
    leaseKey: 'semantic:package:@shapeshift-labs/frontier-swarm-codex',
    holderId: actor,
    status: 'granted',
    requestedAt: input.generatedAt,
    grantedAt: input.generatedAt,
    metadata: { artifactPath: input.leasePath }
  };
}
