import {
  createSwarmBacklogTaskPlan,
  createSwarmPlan,
  type FrontierSwarmBacklogInput,
  type FrontierSwarmBacklogTaskPlan,
  type FrontierSwarmManifestInput,
  type FrontierSwarmPlan,
  type FrontierSwarmPlanInput,
  type FrontierSwarmTaskInput
} from '@shapeshift-labs/frontier-swarm';
import { arrayOfObjects, isObject, readStringArray, uniqueStrings } from './common.js';
import { FRONTIER_SWARM_CODEX_DEFAULT_MODEL, FRONTIER_SWARM_CODEX_DEFAULT_REASONING_EFFORT } from './constants.js';
import type { FrontierCodexSwarmCliInput } from './types.js';

export function createCodexSwarmPlan(input: FrontierCodexSwarmCliInput): FrontierSwarmPlan {
  const baseTasks = coerceCodexSwarmTasksInput(input.tasks);
  const backlogTaskPlan = input.backlog
    ? createSwarmBacklogTaskPlan({
      ...(input.backlogPlan ?? {}),
      backlog: input.backlog as FrontierSwarmBacklogInput,
      tasks: baseTasks
    })
    : undefined;
  const tasks = backlogTaskPlan?.tasks ?? baseTasks;
  const manifest = declareTaskLanesAndCompute(coerceCodexSwarmManifestInput(input.manifest), tasks);
  const planOptions: FrontierSwarmPlanInput = {
    ...(input.plan ?? {}),
    ...(input.routingPolicy ? { routingPolicy: input.routingPolicy as FrontierSwarmPlanInput['routingPolicy'] } : {}),
    ...(input.routingSignals ? { routingSignals: input.routingSignals } : {}),
    ...(input.routingFeedback ? { routingFeedback: input.routingFeedback } : {}),
    ...(input.routingMode ? { routingMode: input.routingMode } : {}),
    ...(input.routingContext ? { routingContext: input.routingContext } : {}),
    ...(backlogTaskPlan ? { metadata: mergePlanMetadata(input.plan?.metadata, { backlogTaskPlan: summarizeBacklogTaskPlan(backlogTaskPlan) }) } : {})
  };
  return createSwarmPlan(manifest, tasks, planOptions);
}

export function coerceCodexSwarmManifestInput(value: unknown): FrontierSwarmManifestInput {
  const input = isObject(value) ? value as Record<string, unknown> : {};
  const lanes = arrayOfObjects(input.lanes).map((lane) => ({
    ...lane,
    allowedWrites: readStringArray(lane.allowedWrites).concat(readStringArray(lane.allowedGlobs)),
    evidencePrefix: typeof lane.evidencePrefix === 'string'
      ? lane.evidencePrefix
      : typeof lane.evidenceOutDirPrefix === 'string'
        ? lane.evidenceOutDirPrefix
        : undefined
  }));
  return {
    id: typeof input.id === 'string' ? input.id : 'codex-swarm',
    title: typeof input.title === 'string' ? input.title : undefined,
    description: typeof input.description === 'string' ? input.description : undefined,
    compute: readCompute(input.compute),
    layers: arrayOfObjects(input.layers) as unknown as FrontierSwarmManifestInput['layers'],
    lanes: lanes as unknown as FrontierSwarmManifestInput['lanes'],
    policy: isObject(input.policy) ? input.policy : {
      defaultCompute: 'codex.deep',
      defaultConcurrency: 1
    },
    resources: readStringArray(input.resources),
    tags: readStringArray(input.tags),
    metadata: isObject(input.metadata) ? input.metadata : undefined
  };
}

export function coerceCodexSwarmTasksInput(value: unknown): FrontierSwarmTaskInput[] {
  const raw = Array.isArray(value)
    ? value
    : isObject(value) && Array.isArray((value as Record<string, unknown>).tasks)
      ? (value as { tasks: unknown[] }).tasks
      : isObject(value) && Array.isArray((value as Record<string, unknown>).items)
        ? (value as { items: unknown[] }).items
        : [];
  return raw.filter(isObject).map((entry) => {
    const task = entry as Record<string, unknown>;
    return {
      id: String(task.id ?? task.taskId ?? ''),
      title: typeof task.title === 'string' ? task.title : undefined,
      objective: typeof task.objective === 'string'
        ? task.objective
        : typeof task.description === 'string'
          ? task.description
          : typeof task.title === 'string'
            ? task.title
            : undefined,
      kind: typeof task.kind === 'string' ? task.kind : typeof task.surfaceKind === 'string' ? task.surfaceKind : undefined,
      workKind: typeof task.workKind === 'string' ? task.workKind : typeof task.kind === 'string' ? task.kind : undefined,
      status: typeof task.status === 'string' ? task.status : undefined,
      lane: typeof task.lane === 'string' ? task.lane : undefined,
      layer: typeof task.layer === 'string' ? task.layer : undefined,
      compute: typeof task.compute === 'string' ? task.compute : undefined,
      epicId: typeof task.epicId === 'string' ? task.epicId : undefined,
      groupId: typeof task.groupId === 'string' ? task.groupId : undefined,
      cycleId: typeof task.cycleId === 'string' ? task.cycleId : undefined,
      parentTaskId: typeof task.parentTaskId === 'string' ? task.parentTaskId : typeof task.parentEntryId === 'string' ? task.parentEntryId : undefined,
      dependsOn: readStringArray(task.dependsOn),
      concurrencyKey: typeof task.concurrencyKey === 'string' ? task.concurrencyKey : undefined,
      budget: isObject(task.budget) ? task.budget : undefined,
      review: isObject(task.review) ? task.review : undefined,
      priority: typeof task.priority === 'number' ? task.priority : undefined,
      sourceRefs: readStringArray(task.sourceRefs).concat(readStringArray(task.legacySourcePaths)),
      targetRefs: readStringArray(task.targetRefs).concat(readStringArray(task.ownedFiles), readStringArray(task.files)),
      allowedWrites: readStringArray(task.allowedWrites).concat(readStringArray(task.ownedFiles), readStringArray(task.files)),
      ownershipRegions: Array.isArray(task.ownershipRegions) ? task.ownershipRegions as FrontierSwarmTaskInput['ownershipRegions'] : [],
      ownedRegions: readStringArray(task.ownedRegions),
      changedRegions: readStringArray(task.changedRegions),
      acceptance: readStringArray(task.acceptance),
      acceptanceChecks: Array.isArray(task.acceptanceChecks) ? task.acceptanceChecks as FrontierSwarmTaskInput['acceptanceChecks'] : undefined,
      verification: Array.isArray(task.verification) ? task.verification as FrontierSwarmTaskInput['verification'] : undefined,
      evidenceCommand: typeof task.evidenceCommand === 'string' ? task.evidenceCommand : undefined,
      shardCommand: typeof task.shardCommand === 'string' ? task.shardCommand : undefined,
      capabilities: readStringArray(task.capabilities),
      resourceRequirements: isObject(task.resourceRequirements) ? task.resourceRequirements as FrontierSwarmTaskInput['resourceRequirements'] : undefined,
      tags: readStringArray(task.tags),
      metadata: { source: task }
    };
  }).filter((task) => task.id.length > 0);
}

function declareTaskLanesAndCompute(
  manifest: FrontierSwarmManifestInput,
  tasks: readonly FrontierSwarmTaskInput[]
): FrontierSwarmManifestInput {
  const compute = [...((manifest.compute ?? []) as unknown as readonly Record<string, unknown>[])];
  const layers = [...((manifest.layers ?? []) as unknown as readonly Record<string, unknown>[])];
  const lanes = [...((manifest.lanes ?? []) as unknown as readonly Record<string, unknown>[])];
  const computeIds = new Set(compute.map((entry) => typeof entry.id === 'string' ? entry.id : '').filter(Boolean));
  const layerIds = new Set(layers.map((entry) => typeof entry.id === 'string' ? entry.id : '').filter(Boolean));
  const laneIds = new Set(lanes.map((entry) => typeof entry.id === 'string' ? entry.id : '').filter(Boolean));

  for (const task of tasks) {
    const laneId = typeof task.lane === 'string' && task.lane.length > 0 ? task.lane : undefined;
    if (!laneId || laneIds.has(laneId)) continue;
    const layerId = typeof task.layer === 'string' && task.layer.length > 0 ? task.layer : 'implementation';
    const computeId = typeof task.compute === 'string' && task.compute.length > 0
      ? task.compute
      : readManifestDefaultCompute(manifest);
    if (!layerIds.has(layerId)) {
      layers.push({ id: layerId, title: titleFromId(layerId) });
      layerIds.add(layerId);
    }
    if (!computeIds.has(computeId)) {
      compute.push(createTaskComputeProfile(computeId));
      computeIds.add(computeId);
    }
    lanes.push({
      id: laneId,
      title: titleFromId(laneId),
      layer: layerId,
      compute: computeId,
      allowedWrites: uniqueStrings([...(task.allowedWrites ?? []), ...(task.targetRefs ?? [])])
    });
    laneIds.add(laneId);
  }

  return {
    ...manifest,
    compute: compute as unknown as FrontierSwarmManifestInput['compute'],
    layers: layers as unknown as FrontierSwarmManifestInput['layers'],
    lanes: lanes as unknown as FrontierSwarmManifestInput['lanes']
  };
}

function readCompute(value: unknown) {
  if (Array.isArray(value) && value.length > 0) return value as FrontierSwarmManifestInput['compute'];
  return [{
    id: 'codex.deep',
    kind: 'codex',
    model: FRONTIER_SWARM_CODEX_DEFAULT_MODEL,
    reasoningEffort: FRONTIER_SWARM_CODEX_DEFAULT_REASONING_EFFORT
  }];
}

function readManifestDefaultCompute(manifest: FrontierSwarmManifestInput): string {
  const policy = isObject(manifest.policy) ? manifest.policy as Record<string, unknown> : {};
  return typeof policy.defaultCompute === 'string' && policy.defaultCompute.length > 0 ? policy.defaultCompute : 'codex.deep';
}

function createTaskComputeProfile(id: string): Record<string, unknown> {
  return {
    id,
    kind: 'codex',
    model: id.toLowerCase().includes('mini') ? 'gpt-5.4-mini' : FRONTIER_SWARM_CODEX_DEFAULT_MODEL,
    reasoningEffort: id === 'codex.deep' ? FRONTIER_SWARM_CODEX_DEFAULT_REASONING_EFFORT : 'high'
  };
}

function titleFromId(id: string): string {
  return id
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function mergePlanMetadata(existing: unknown, addition: Record<string, unknown>): Record<string, unknown> {
  return { ...(isObject(existing) ? existing : {}), ...addition };
}

function summarizeBacklogTaskPlan(plan: FrontierSwarmBacklogTaskPlan): Record<string, unknown> {
  return {
    id: plan.id,
    backlogId: plan.backlogId,
    backlogPath: plan.backlogPath,
    childArtifactPath: plan.childArtifactPath,
    summary: {
      ...plan.summary,
      totalTaskCount: plan.summary.taskCount,
      runnableTaskCount: plan.summary.runnableCount,
      decompositionTaskCount: plan.summary.decompositionCount
    }
  };
}
