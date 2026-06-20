import path from 'node:path';
import type {
  FrontierCodexCollectBucket,
  FrontierCodexCollectedBundle,
  FrontierCodexCollectResult
} from './types-collection.js';
import type {
  FrontierCodexRunGraph,
  FrontierCodexRunGraphEdge,
  FrontierCodexRunGraphEdgeKind,
  FrontierCodexRunGraphNode
} from './types-run-graph.js';
import {
  countCodexRunGraphValues,
  createCodexRunGraphIndexes,
  hashCodexRunGraphString,
  mergeCodexRunGraphNode,
  stableCodexRunGraphPart,
  stringFromUnknown
} from './run-graph-utils.js';

export function createCodexCollectRunGraph(input: {
  result: FrontierCodexCollectResult;
  generatedAt?: number;
}): FrontierCodexRunGraph {
  const result = input.result;
  const generatedAt = input.generatedAt ?? result.generatedAt ?? Date.now();
  const nodes = new Map<string, FrontierCodexRunGraphNode>();
  const edges = new Map<string, FrontierCodexRunGraphEdge>();
  const runNodeId = `run:${path.basename(result.runDir) || 'run'}`;

  const addNode = (node: FrontierCodexRunGraphNode) => {
    const existing = nodes.get(node.id);
    nodes.set(node.id, existing ? mergeCodexRunGraphNode(existing, node) : node);
    return node.id;
  };
  const addEdge = (
    kind: FrontierCodexRunGraphEdgeKind,
    from: string | undefined,
    to: string | undefined,
    label?: string,
    data?: Record<string, unknown>
  ) => {
    if (!from || !to || from === to) return;
    const id = `${kind}:${from}->${to}`;
    if (!edges.has(id)) edges.set(id, { id, kind, from, to, ...(label ? { label } : {}), ...(data ? { data } : {}) });
  };

  addNode({
    id: runNodeId,
    kind: 'run',
    label: path.basename(result.runDir) || result.runDir,
    path: result.runDir,
    generatedAt,
    data: { outDir: result.outDir, ok: result.ok, summary: result.summary }
  });

  for (const bucket of Object.keys(result.buckets) as FrontierCodexCollectBucket[]) {
    const bucketNodeId = `bucket:${bucket}`;
    addNode({ id: bucketNodeId, kind: 'bucket', label: bucket, bucket, generatedAt });
    addEdge('contains', runNodeId, bucketNodeId);
    for (const entry of result.buckets[bucket]) addCollectedBundleNodes(bucket, entry, runNodeId, bucketNodeId, addNode, addEdge);
  }

  addQueueOutcomeNodes(result, runNodeId, addNode, addEdge);
  addTerminalStateNodes(result, runNodeId, addNode, addEdge);
  addTournamentNodes(result, runNodeId, addNode, addEdge);
  addAdaptiveFeedbackNodes(result, runNodeId, addNode, addEdge);

  const nodeList = Array.from(nodes.values()).sort((left, right) => left.id.localeCompare(right.id));
  const edgeList = Array.from(edges.values()).sort((left, right) => left.id.localeCompare(right.id));
  const indexes = createCodexRunGraphIndexes(nodeList);
  const nodeKinds = countCodexRunGraphValues(nodeList.map((node) => node.kind));
  const edgeKinds = countCodexRunGraphValues(edgeList.map((edge) => edge.kind));

  return {
    kind: 'frontier.swarm-codex.run-graph',
    version: 1,
    id: `frontier-swarm-codex.run-graph:${path.basename(result.runDir) || 'run'}`,
    generatedAt,
    runDir: result.runDir,
    outDir: result.outDir,
    nodes: nodeList,
    edges: edgeList,
    indexes,
    summary: {
      nodeCount: nodeList.length,
      edgeCount: edgeList.length,
      nodeKinds,
      edgeKinds,
      taskCount: nodeKinds.task ?? 0,
      jobCount: nodeKinds.job ?? 0,
      candidateCount: nodeKinds.candidate ?? 0,
      evidenceCount: nodeKinds.evidence ?? 0,
      decisionCount: (nodeKinds.decision ?? 0) + (nodeKinds['queue-outcome'] ?? 0) + (nodeKinds['terminal-outcome'] ?? 0),
      gateCount: nodeKinds.gate ?? 0
    }
  };
}

function addCollectedBundleNodes(
  bucket: FrontierCodexCollectBucket,
  entry: FrontierCodexCollectedBundle,
  runNodeId: string,
  bucketNodeId: string,
  addNode: (node: FrontierCodexRunGraphNode) => string,
  addEdge: (kind: FrontierCodexRunGraphEdgeKind, from?: string, to?: string, label?: string, data?: Record<string, unknown>) => void
): void {
  const bundle = entry.bundle;
  const jobNodeId = `job:${bundle.jobId}`;
  const candidateNodeId = `candidate:${bundle.jobId}`;
  const mergeNodeId = `merge:${bundle.id || bundle.jobId}`;
  const taskNodeId = bundle.taskId ? `task:${bundle.taskId}` : undefined;

  if (taskNodeId) {
    addNode({
      id: taskNodeId,
      kind: 'task',
      label: bundle.taskId,
      taskId: bundle.taskId,
      generatedAt: bundle.generatedAt,
      data: { lane: bundle.lane, queueItemIds: bundle.queueItemIds, title: bundle.title }
    });
    addEdge('contains', runNodeId, taskNodeId);
    addEdge('produces', taskNodeId, jobNodeId);
  }

  addNode({
    id: jobNodeId,
    kind: 'job',
    label: bundle.jobId,
    jobId: bundle.jobId,
    taskId: bundle.taskId,
    bucket,
    status: bundle.status,
    generatedAt: bundle.generatedAt,
    data: { lane: bundle.lane, changedPaths: bundle.changedPaths, ownershipViolations: bundle.ownershipViolations }
  });
  addEdge('contains', runNodeId, jobNodeId);

  addNode({
    id: candidateNodeId,
    kind: 'candidate',
    label: bundle.title ?? bundle.jobId,
    jobId: bundle.jobId,
    taskId: bundle.taskId,
    bucket,
    status: bundle.status,
    outcome: bundle.disposition,
    generatedAt: bundle.generatedAt,
    refs: { merge: mergeNodeId, bucket: bucketNodeId },
    data: {
      mergeReadiness: bundle.mergeReadiness,
      riskLevel: bundle.riskLevel,
      autoMergeable: bundle.autoMergeable,
      staleAgainstHead: bundle.staleAgainstHead,
      reasons: bundle.reasons,
      changedPaths: bundle.changedPaths,
      patchPath: entry.patchPath ?? bundle.patchPath,
      outputDir: entry.outputDir
    }
  });
  addEdge('produces', jobNodeId, candidateNodeId);
  addEdge('classifiedAs', bucketNodeId, candidateNodeId);

  addNode({
    id: mergeNodeId,
    kind: 'merge',
    label: bundle.id || bundle.jobId,
    jobId: bundle.jobId,
    taskId: bundle.taskId,
    bucket,
    status: bundle.status,
    path: entry.mergePath,
    generatedAt: bundle.generatedAt,
    data: { patchHash: bundle.patchHash, branchName: bundle.branchName, commit: bundle.commit }
  });
  addEdge('produces', candidateNodeId, mergeNodeId);

  for (const evidencePath of bundle.evidencePaths ?? []) {
    const evidenceNodeId = `evidence:${stableCodexRunGraphPart(evidencePath)}`;
    addNode({
      id: evidenceNodeId,
      kind: 'evidence',
      label: path.basename(evidencePath),
      jobId: bundle.jobId,
      taskId: bundle.taskId,
      bucket,
      path: evidencePath,
      generatedAt: bundle.generatedAt
    });
    addEdge('produces', candidateNodeId, evidenceNodeId);
  }

  for (const command of bundle.commandsPassed ?? []) addGateNode(command, 'passed', candidateNodeId, bundle.jobId, bundle.taskId, bucket, addNode, addEdge);
  for (const command of bundle.commandsFailed ?? []) addGateNode(command, 'failed', candidateNodeId, bundle.jobId, bundle.taskId, bucket, addNode, addEdge);
}

function addGateNode(
  command: { name?: string; command?: readonly string[]; commandLine?: string },
  status: string,
  candidateNodeId: string,
  jobId: string,
  taskId: string | undefined,
  bucket: FrontierCodexCollectBucket,
  addNode: (node: FrontierCodexRunGraphNode) => string,
  addEdge: (kind: FrontierCodexRunGraphEdgeKind, from?: string, to?: string, label?: string) => void
): void {
  const label = command.name ?? command.commandLine ?? command.command?.join(' ') ?? 'command';
  const id = `gate:${jobId}:${stableCodexRunGraphPart(label)}`;
  addNode({ id, kind: 'gate', label, jobId, taskId, bucket, status, data: { command } });
  addEdge('verifies', id, candidateNodeId, status);
}

function addQueueOutcomeNodes(
  result: FrontierCodexCollectResult,
  runNodeId: string,
  addNode: (node: FrontierCodexRunGraphNode) => string,
  addEdge: (kind: FrontierCodexRunGraphEdgeKind, from?: string, to?: string, label?: string) => void
): void {
  for (const decision of result.queueOutcomeModel?.latestDecisions ?? []) {
    const id = `decision:queue:${decision.id}`;
    addNode({
      id,
      kind: 'decision',
      label: decision.subjectId || decision.outcome,
      jobId: decision.jobId,
      taskId: decision.taskId,
      status: decision.category,
      outcome: decision.outcome,
      generatedAt: decision.generatedAt,
      data: { reasons: decision.reasons, queueItemIds: decision.queueItemIds }
    });
    addEdge('contains', runNodeId, id);
    if (decision.jobId) addEdge('decides', id, `candidate:${decision.jobId}`);
  }
}

function addTerminalStateNodes(
  result: FrontierCodexCollectResult,
  runNodeId: string,
  addNode: (node: FrontierCodexRunGraphNode) => string,
  addEdge: (kind: FrontierCodexRunGraphEdgeKind, from?: string, to?: string, label?: string) => void
): void {
  for (const item of result.terminalState?.items ?? []) {
    const id = `decision:terminal:${item.id}`;
    addNode({
      id,
      kind: 'decision',
      label: item.subjectId,
      status: item.bucket,
      outcome: item.status,
      generatedAt: item.generatedAt,
      data: { queueItemIds: item.queueItemIds, subjectAliases: item.subjectAliases }
    });
    addEdge('contains', runNodeId, id);
    if (item.jobId) addEdge('decides', id, `candidate:${item.jobId}`);
  }
}

function addTournamentNodes(
  result: FrontierCodexCollectResult,
  runNodeId: string,
  addNode: (node: FrontierCodexRunGraphNode) => string,
  addEdge: (kind: FrontierCodexRunGraphEdgeKind, from?: string, to?: string, label?: string, data?: Record<string, unknown>) => void
): void {
  const tournament = result.strategyTournament;
  if (!tournament) return;
  const tournamentNodeId = `rsi:tournament:${tournament.id}`;
  addNode({ id: tournamentNodeId, kind: 'rsi', label: tournament.id, generatedAt: tournament.generatedAt, data: { summary: tournament.summary } });
  addEdge('contains', runNodeId, tournamentNodeId);
  for (const candidate of tournament.candidates ?? []) {
    const candidateId = stringFromUnknown(candidate.id) ?? stringFromUnknown(candidate.strategyId) ?? String(hashCodexRunGraphString(JSON.stringify(candidate)));
    const status = stringFromUnknown(candidate.status);
    const id = `candidate:strategy:${candidateId}`;
    addNode({
      id,
      kind: 'candidate',
      label: stringFromUnknown(candidate.title) ?? candidateId,
      status,
      data: { score: candidate.score, reasons: candidate.reasons }
    });
    addEdge(status === 'selected' ? 'mergesInto' : 'supersedes', id, tournamentNodeId, status);
  }
}

function addAdaptiveFeedbackNodes(
  result: FrontierCodexCollectResult,
  runNodeId: string,
  addNode: (node: FrontierCodexRunGraphNode) => string,
  addEdge: (kind: FrontierCodexRunGraphEdgeKind, from?: string, to?: string, label?: string) => void
): void {
  const feedback = result.tournamentAdaptiveFeedback;
  if (!feedback) return;
  const id = `rsi:adaptive:${feedback.id}`;
  addNode({ id, kind: 'rsi', label: feedback.id, generatedAt: feedback.generatedAt, data: { summary: feedback.summary } });
  addEdge('contains', runNodeId, id);
}
