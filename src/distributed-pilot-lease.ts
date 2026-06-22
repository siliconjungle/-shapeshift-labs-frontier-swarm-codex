import path from 'node:path';
import {
  acquireSwarmCoordinatorSemanticLease,
  createSwarmHierarchicalMergeQueue,
  createSwarmMergeBundle,
  createSwarmMergeIndex,
  createSwarmSemanticLeaseStateForMergeQueue,
  validateSwarmCoordinatorSemanticLeaseFence,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmPlan
} from '@shapeshift-labs/frontier-swarm';
import { writeJsonAtomic } from './common.js';
import {
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_LEASE_FILE,
  type PilotLeaseArtifacts,
  type PilotRepo
} from './distributed-pilot-types.js';

export async function writePilotLeaseArtifacts(
  repo: PilotRepo,
  plan: FrontierSwarmPlan,
  generatedAt: string
): Promise<PilotLeaseArtifacts> {
  const bundle = createPilotMergeBundle(plan);
  const index = createSwarmMergeIndex({
    id: 'distributed-pilot-merge-index',
    runId: plan.runId,
    planId: plan.id,
    bundles: [bundle],
    metadata: {
      source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
      runId: plan.runId,
      repository: repo.repoRoot
    }
  });
  const mergeQueue = createSwarmHierarchicalMergeQueue({
    id: 'distributed-pilot-merge-queue',
    index,
    metadata: {
      source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
      runId: plan.runId,
      repository: repo.repoRoot
    }
  });
  const assignment = mergeQueue.assignments[0];
  if (!assignment) throw new Error('distributed pilot merge queue did not create an assignment');
  let state = createSwarmSemanticLeaseStateForMergeQueue(mergeQueue, {
    repository: repo.repoRoot,
    packageId: '@shapeshift-labs/frontier-swarm-codex',
    metadata: { runId: plan.runId }
  });
  const leaseClaim = acquireSwarmCoordinatorSemanticLease({
    queue: mergeQueue,
    assignment,
    state,
    ownerId: repo.actorId,
    holderId: repo.actorId,
    ttlMs: 30_000,
    purpose: 'distributed pilot coordinator apply',
    reason: 'same-machine multi-repo proof',
    repository: repo.repoRoot,
    packageId: '@shapeshift-labs/frontier-swarm-codex',
    metadata: { runId: plan.runId }
  });
  state = leaseClaim.state;
  if (!leaseClaim.lease) throw new Error('distributed pilot semantic lease was not granted');
  const fence = {
    leaseId: leaseClaim.lease.id,
    token: leaseClaim.lease.token,
    fencingToken: leaseClaim.lease.fencingToken,
    ownerId: leaseClaim.lease.ownerId,
    ...(leaseClaim.lease.holderId ? { holderId: leaseClaim.lease.holderId } : {}),
    expiresAt: leaseClaim.lease.expiresAt,
    scopeKeys: [...leaseClaim.lease.scopeKeys]
  };
  const fenceValidation = validateSwarmCoordinatorSemanticLeaseFence({
    assignment,
    state,
    lease: leaseClaim.lease,
    token: fence.token,
    fencingToken: fence.fencingToken,
    requiredSemanticLeaseScopes: leaseClaim.scopes
  });
  const summary = {
    kind: 'frontier.swarm-codex.distributed-pilot.semantic-lease',
    version: 1,
    generatedAt,
    runId: plan.runId,
    queueId: mergeQueue.id,
    state,
    leaseClaim,
    fence,
    fenceValidation,
    requiredLeaseScopeIds: leaseClaim.requiredLeaseScopeIds,
    requiredLeaseKeys: leaseClaim.requiredLeaseKeys,
    granted: Boolean(leaseClaim.lease),
    fenceValid: Boolean(fenceValidation.ok)
  };
  const semanticLeasePath = path.join(repo.runDir, FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_LEASE_FILE);
  await writeJsonAtomic(semanticLeasePath, summary);
  return { semanticLeasePath, summary };
}

function createPilotMergeBundle(plan: FrontierSwarmPlan): FrontierSwarmMergeBundle {
  return createSwarmMergeBundle({
    id: 'distributed-pilot-bundle',
    runId: plan.runId,
    planId: plan.id,
    job: plan.jobs[0],
    result: {
      jobId: plan.jobs[0]?.id ?? 'distributed-pilot-job',
      status: 'completed',
      mergeReadiness: 'verified-patch',
      mergeDisposition: 'ready',
      riskLevel: 'low',
      queueItemIds: ['distributed-pilot-task'],
      changedPaths: ['packages/frontier-swarm-codex/src/distributed-pilot.ts'],
      verification: [{ name: 'distributed-pilot-smoke', command: ['node', 'test/smoke/distributed-pilot.mjs'], status: 0, required: true }],
      evidencePaths: []
    },
    queueItemIds: ['distributed-pilot-task'],
    riskLevel: 'low',
    disposition: 'ready',
    metadata: { source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND }
  });
}
