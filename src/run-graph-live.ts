import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FrontierSwarmJob,
  FrontierSwarmJobResultInput,
  FrontierSwarmMergeBundle,
  FrontierSwarmRun
} from '@shapeshift-labs/frontier-swarm';
import type {
  FrontierCodexLiveRunGraphEvent,
  FrontierCodexRunGraphEdge,
  FrontierCodexRunGraphNode
} from './types-run-graph.js';
import { stableCodexRunGraphPart } from './run-graph-utils.js';

export const FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENTS_FILE = 'live-run-graph-events.jsonl';

const liveRunGraphWriteQueues = new Map<string, Promise<void>>();

export function resolveCodexLiveRunGraphEventsPath(input: {
  cwd?: string;
  outDir: string;
  liveRunGraphEventsPath?: string | false;
}): string | undefined {
  if (input.liveRunGraphEventsPath === false) return undefined;
  const base = input.cwd ?? process.cwd();
  return path.resolve(base, input.liveRunGraphEventsPath ?? path.join(input.outDir, FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENTS_FILE));
}

export async function initCodexLiveRunGraphEvents(file: string | undefined): Promise<void> {
  if (!file) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '');
}

export async function appendCodexLiveRunGraphEvent(
  file: string | undefined,
  event: FrontierCodexLiveRunGraphEvent
): Promise<void> {
  if (!file) return;
  const absolute = path.resolve(file);
  const previous = liveRunGraphWriteQueues.get(absolute) ?? Promise.resolve();
  let next: Promise<void>;
  next = previous
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.appendFile(absolute, JSON.stringify(event) + '\n');
    })
    .finally(() => {
      if (liveRunGraphWriteQueues.get(absolute) === next) liveRunGraphWriteQueues.delete(absolute);
    });
  liveRunGraphWriteQueues.set(absolute, next);
  return next;
}

export function createCodexLiveRunStartedEvent(input: {
  runId: string;
  outDir: string;
  jobCount: number;
  generatedAt?: number;
}): FrontierCodexLiveRunGraphEvent {
  const generatedAt = input.generatedAt ?? Date.now();
  const runId = runGraphRunNodeId(input.runId, input.outDir);
  return {
    kind: 'frontier.swarm-codex.live-run-graph-event',
    version: 1,
    type: 'run.started',
    runId: input.runId,
    generatedAt,
    nodes: [{
      id: runId,
      kind: 'run',
      label: input.runId,
      path: input.outDir,
      status: 'running',
      generatedAt,
      data: { jobCount: input.jobCount }
    }],
    data: { outDir: input.outDir, jobCount: input.jobCount }
  };
}

export function createCodexLiveRunFinishedEvent(input: {
  runId: string;
  outDir: string;
  ok: boolean;
  summary: FrontierSwarmRun['summary'];
  generatedAt?: number;
}): FrontierCodexLiveRunGraphEvent {
  const generatedAt = input.generatedAt ?? Date.now();
  const runId = runGraphRunNodeId(input.runId, input.outDir);
  return {
    kind: 'frontier.swarm-codex.live-run-graph-event',
    version: 1,
    type: 'run.finished',
    runId: input.runId,
    generatedAt,
    nodes: [{
      id: runId,
      kind: 'run',
      label: input.runId,
      path: input.outDir,
      status: input.ok ? 'completed' : 'failed',
      outcome: input.ok ? 'ok' : 'failed',
      generatedAt,
      data: { ok: input.ok, summary: input.summary }
    }],
    data: { ok: input.ok, summary: input.summary }
  };
}

export function createCodexLiveJobStartedEvent(input: {
  runId?: string;
  outDir: string;
  job: FrontierSwarmJob;
  generatedAt?: number;
  data?: Record<string, unknown>;
}): FrontierCodexLiveRunGraphEvent {
  const generatedAt = input.generatedAt ?? Date.now();
  const { nodes, edges } = jobGraphFrame(input.job, {
    runId: input.runId,
    outDir: input.outDir,
    status: 'running',
    generatedAt
  });
  return {
    kind: 'frontier.swarm-codex.live-run-graph-event',
    version: 1,
    type: 'job.started',
    runId: input.runId,
    jobId: input.job.id,
    taskId: input.job.taskId,
    lane: input.job.lane,
    generatedAt,
    nodes,
    edges,
    data: input.data
  };
}

export function createCodexLiveJobResultEvents(input: {
  runId?: string;
  outDir: string;
  job: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
  mergeBundle: FrontierSwarmMergeBundle;
  generatedAt?: number;
}): FrontierCodexLiveRunGraphEvent[] {
  const generatedAt = input.generatedAt ?? input.result.finishedAt ?? Date.now();
  const events: FrontierCodexLiveRunGraphEvent[] = [];
  const jobNodeId = runGraphJobNodeId(input.job.id);

  const evidencePaths = uniqueStrings([
    ...(input.result.evidencePaths ?? []),
    ...(input.mergeBundle.evidencePaths ?? [])
  ]);
  if (evidencePaths.length > 0) {
    const nodes = evidencePaths.map((evidencePath) => ({
      id: runGraphEvidenceNodeId(input.job.id, evidencePath),
      kind: 'evidence',
      label: path.basename(evidencePath),
      jobId: input.job.id,
      taskId: input.job.taskId,
      lane: input.job.lane,
      path: evidencePath,
      generatedAt
    } satisfies FrontierCodexRunGraphNode));
    events.push(liveEvent(input, {
      type: 'evidence.discovered',
      generatedAt,
      nodes,
      edges: nodes.map((node) => ({
        id: `produces:${jobNodeId}->${node.id}`,
        kind: 'produces',
        from: jobNodeId,
        to: node.id
      })),
      data: { evidenceCount: evidencePaths.length, evidencePaths }
    }));
  }

  const gates = [
    ...input.mergeBundle.commandsPassed.map((command) => ({ command, status: 'passed' })),
    ...input.mergeBundle.commandsFailed.map((command) => ({ command, status: 'failed' }))
  ];
  for (const gate of gates) {
    const label = gate.command.name ?? gate.command.commandLine ?? gate.command.command.join(' ') ?? 'command';
    const gateNodeId = `gate:${input.job.id}:${stableCodexRunGraphPart(label)}`;
    events.push(liveEvent(input, {
      type: 'gate.result',
      generatedAt,
      nodes: [{
        id: gateNodeId,
        kind: 'gate',
        label,
        jobId: input.job.id,
        taskId: input.job.taskId,
        lane: input.job.lane,
        status: gate.status,
        generatedAt,
        data: { command: gate.command }
      }],
      edges: [{
        id: `verifies:${gateNodeId}->${jobNodeId}`,
        kind: 'verifies',
        from: gateNodeId,
        to: jobNodeId,
        label: gate.status
      }],
      data: { status: gate.status, command: gate.command }
    }));
  }

  const terminalNodeId = `decision:terminal:${input.job.id}`;
  events.push(liveEvent(input, {
    type: 'terminal.outcome',
    generatedAt,
    nodes: [{
      id: terminalNodeId,
      kind: 'decision',
      label: input.result.status ?? input.mergeBundle.status,
      jobId: input.job.id,
      taskId: input.job.taskId,
      lane: input.job.lane,
      status: input.result.status ?? input.mergeBundle.status,
      outcome: input.result.mergeDisposition ?? input.mergeBundle.disposition,
      generatedAt,
      data: {
        exitCode: input.result.exitCode,
        signal: input.result.signal,
        mergeReadiness: input.result.mergeReadiness ?? input.mergeBundle.mergeReadiness,
        changedPathCount: input.result.changedPaths?.length ?? input.mergeBundle.changedPaths.length,
        ownershipViolationCount: input.result.ownershipViolations?.length ?? input.mergeBundle.ownershipViolations.length,
        error: errorString(input.result.error)
      }
    }],
    edges: [{
      id: `decides:${terminalNodeId}->${jobNodeId}`,
      kind: 'decides',
      from: terminalNodeId,
      to: jobNodeId,
      label: input.result.status ?? input.mergeBundle.status
    }]
  }));

  const frame = jobGraphFrame(input.job, {
    runId: input.runId,
    outDir: input.outDir,
    status: input.result.status ?? input.mergeBundle.status,
    outcome: input.result.mergeDisposition ?? input.mergeBundle.disposition,
    generatedAt
  });
  const candidateNodeId = `candidate:${input.job.id}`;
  frame.nodes.push({
    id: candidateNodeId,
    kind: 'candidate',
    label: input.job.title ?? input.job.id,
    jobId: input.job.id,
    taskId: input.job.taskId,
    lane: input.job.lane,
    status: input.mergeBundle.status,
    outcome: input.mergeBundle.disposition,
    generatedAt,
    data: {
      mergeReadiness: input.mergeBundle.mergeReadiness,
      riskLevel: input.mergeBundle.riskLevel,
      autoMergeable: input.mergeBundle.autoMergeable,
      changedPaths: input.mergeBundle.changedPaths,
      ownershipViolations: input.mergeBundle.ownershipViolations
    }
  });
  frame.edges.push({
    id: `produces:${jobNodeId}->${candidateNodeId}`,
    kind: 'produces',
    from: jobNodeId,
    to: candidateNodeId
  });
  events.push(liveEvent(input, {
    type: 'job.finished',
    generatedAt,
    nodes: frame.nodes,
    edges: frame.edges,
    data: {
      status: input.result.status ?? input.mergeBundle.status,
      mergeReadiness: input.result.mergeReadiness ?? input.mergeBundle.mergeReadiness,
      mergeDisposition: input.result.mergeDisposition ?? input.mergeBundle.disposition,
      changedPathCount: input.result.changedPaths?.length ?? input.mergeBundle.changedPaths.length,
      evidenceCount: evidencePaths.length,
      gateCount: gates.length
    }
  }));

  return events;
}

function liveEvent(
  input: { runId?: string; job: FrontierSwarmJob },
  event: Omit<FrontierCodexLiveRunGraphEvent, 'kind' | 'version' | 'runId' | 'jobId' | 'taskId' | 'lane'>
): FrontierCodexLiveRunGraphEvent {
  return {
    kind: 'frontier.swarm-codex.live-run-graph-event',
    version: 1,
    type: event.type,
    runId: input.runId,
    jobId: input.job.id,
    taskId: input.job.taskId,
    lane: input.job.lane,
    generatedAt: event.generatedAt,
    ...(event.nodes ? { nodes: event.nodes } : {}),
    ...(event.edges ? { edges: event.edges } : {}),
    ...(event.data ? { data: event.data } : {})
  };
}

function jobGraphFrame(
  job: FrontierSwarmJob,
  input: {
    runId?: string;
    outDir: string;
    status: string;
    outcome?: string;
    generatedAt: number;
  }
): { nodes: FrontierCodexRunGraphNode[]; edges: FrontierCodexRunGraphEdge[] } {
  const runNodeId = runGraphRunNodeId(input.runId, input.outDir);
  const taskNodeId = runGraphTaskNodeId(job.taskId);
  const jobNodeId = runGraphJobNodeId(job.id);
  return {
    nodes: [
      {
        id: runNodeId,
        kind: 'run',
        label: input.runId ?? path.basename(input.outDir),
        path: input.outDir,
        status: 'running',
        generatedAt: input.generatedAt
      },
      {
        id: taskNodeId,
        kind: 'task',
        label: job.taskId,
        taskId: job.taskId,
        lane: job.lane,
        generatedAt: input.generatedAt,
        data: { title: job.task.title, workKind: job.task.workKind }
      },
      {
        id: jobNodeId,
        kind: 'job',
        label: job.id,
        jobId: job.id,
        taskId: job.taskId,
        lane: job.lane,
        model: job.compute.model ?? stringRecordValue(job.compute.metadata, 'model'),
        computeId: job.compute.id,
        modelTier: job.compute.serviceTier,
        status: input.status,
        outcome: input.outcome,
        generatedAt: input.generatedAt,
        data: { title: job.title, capabilities: job.capabilities, allowedWrites: job.allowedWrites }
      }
    ],
    edges: [
      { id: `contains:${runNodeId}->${taskNodeId}`, kind: 'contains', from: runNodeId, to: taskNodeId },
      { id: `contains:${runNodeId}->${jobNodeId}`, kind: 'contains', from: runNodeId, to: jobNodeId },
      { id: `produces:${taskNodeId}->${jobNodeId}`, kind: 'produces', from: taskNodeId, to: jobNodeId }
    ]
  };
}

function runGraphRunNodeId(runId: string | undefined, outDir: string): string {
  return `run:${stableCodexRunGraphPart(runId ?? (path.basename(outDir) || 'run'))}`;
}

function runGraphTaskNodeId(taskId: string): string {
  return `task:${stableCodexRunGraphPart(taskId)}`;
}

function runGraphJobNodeId(jobId: string): string {
  return `job:${stableCodexRunGraphPart(jobId)}`;
}

function runGraphEvidenceNodeId(jobId: string, evidencePath: string): string {
  return `evidence:${stableCodexRunGraphPart(`${jobId}:${evidencePath}`)}`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function stringRecordValue(record: unknown, key: string): string | undefined {
  if (!record || typeof record !== 'object') return undefined;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'string' && value ? value : undefined;
}

function errorString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Error) return value.message;
  return typeof value === 'string' ? value : JSON.stringify(value);
}
