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
import type { FrontierCodexDashboardArtifactPaths, FrontierCodexDashboardRunSourceMetadata } from './types-dashboard.js';
import { stableCodexRunGraphPart } from './run-graph-utils.js';

export const FRONTIER_SWARM_CODEX_LIVE_RUN_GRAPH_EVENTS_FILE = 'live-run-graph-events.jsonl';

const liveRunGraphWriteQueues = new Map<string, Promise<void>>();

type LiveSemanticAdmissionStatus = 'safe' | 'no-op' | 'stale' | 'review' | 'block';

interface LiveSemanticAdmissionDecision {
  key: string;
  source: string;
  label: string;
  status: LiveSemanticAdmissionStatus;
  action?: string;
  reasonCodes: string[];
  reasons: string[];
  data: Record<string, unknown>;
}

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
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await writeTextFileAtomic(absolute, '');
}

export function createCodexLiveRunGraphDashboardMetadata(input: {
  liveRunGraphEventsPath?: string;
}): {
  artifactPaths: FrontierCodexDashboardArtifactPaths;
  runSource: FrontierCodexDashboardRunSourceMetadata;
} {
  if (!input.liveRunGraphEventsPath) {
    return {
      artifactPaths: {},
      runSource: { mode: 'disabled' }
    };
  }
  return {
    artifactPaths: { liveRunGraphEvents: input.liveRunGraphEventsPath },
    runSource: {
      mode: 'live-run-graph-events',
      format: 'jsonl',
      liveRunGraphEventsPath: input.liveRunGraphEventsPath
    }
  };
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
  const candidateNodeId = `candidate:${input.job.id}`;

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
  const semanticAdmission = createLiveSemanticAdmissionGraph(input, {
    generatedAt,
    jobNodeId,
    candidateNodeId
  });
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
      ownershipViolations: input.mergeBundle.ownershipViolations,
      semanticAdmission: semanticAdmission?.summary
    }
  });
  frame.edges.push({
    id: `produces:${jobNodeId}->${candidateNodeId}`,
    kind: 'produces',
    from: jobNodeId,
    to: candidateNodeId
  });
  if (semanticAdmission) {
    events.push(liveEvent(input, {
      type: 'semantic-admission.result',
      generatedAt,
      nodes: semanticAdmission.nodes,
      edges: semanticAdmission.edges,
      data: semanticAdmission.summary
    }));
  }
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

function createLiveSemanticAdmissionGraph(
  input: {
    job: FrontierSwarmJob;
    result: FrontierSwarmJobResultInput;
    mergeBundle: FrontierSwarmMergeBundle;
  },
  graph: {
    generatedAt: number;
    jobNodeId: string;
    candidateNodeId: string;
  }
): {
  nodes: FrontierCodexRunGraphNode[];
  edges: FrontierCodexRunGraphEdge[];
  summary: Record<string, unknown>;
} | undefined {
  const decisions = createLiveSemanticAdmissionDecisions(input.result, input.mergeBundle);
  if (decisions.length === 0) return undefined;
  const nodes = decisions.map((decision) => ({
    id: `semantic-admission:${input.job.id}:${stableCodexRunGraphPart(decision.key)}`,
    kind: 'semantic-admission',
    label: decision.label,
    jobId: input.job.id,
    taskId: input.job.taskId,
    lane: input.job.lane,
    status: decision.status,
    outcome: decision.action,
    generatedAt: graph.generatedAt,
    refs: { job: graph.jobNodeId, candidate: graph.candidateNodeId },
    data: decision.data
  } satisfies FrontierCodexRunGraphNode));
  const edges = nodes.flatMap((node, index) => {
    const decision = decisions[index]!;
    return [
      {
        id: `produces:${graph.jobNodeId}->${node.id}`,
        kind: 'produces',
        from: graph.jobNodeId,
        to: node.id,
        label: decision.source
      },
      {
        id: `decides:${node.id}->${graph.candidateNodeId}`,
        kind: 'decides',
        from: node.id,
        to: graph.candidateNodeId,
        label: decision.status
      }
    ] satisfies FrontierCodexRunGraphEdge[];
  });
  return {
    nodes,
    edges,
    summary: {
      decisionCount: decisions.length,
      statuses: countStrings(decisions.map((decision) => decision.status)),
      sources: countStrings(decisions.map((decision) => decision.source)),
      reasonCodes: uniqueStrings(decisions.flatMap((decision) => decision.reasonCodes)),
      reasons: uniqueStrings(decisions.flatMap((decision) => decision.reasons))
    }
  };
}

function createLiveSemanticAdmissionDecisions(
  result: FrontierSwarmJobResultInput,
  mergeBundle: FrontierSwarmMergeBundle
): LiveSemanticAdmissionDecision[] {
  const metadata = recordValue(mergeBundle.metadata);
  const resultMetadata = recordValue(result.metadata);
  const semanticImport = semanticImportSummaryForLiveEvent(result, mergeBundle);
  const decisions: LiveSemanticAdmissionDecision[] = [];
  const aggregateReasonCodes = uniqueStrings([
    ...semanticImportReasonCodes(semanticImport),
    ...semanticAdmissionReasonCodesFromMetadata(metadata),
    ...semanticAdmissionReasonCodesFromMetadata(resultMetadata)
  ]);
  const aggregateReasons = uniqueStrings([
    ...mergeBundle.reasons,
    ...stringValues(recordValue(metadata?.semanticEditAdmission)?.reasons),
    ...stringValues(recordValue(resultMetadata?.semanticEditAdmission)?.reasons)
  ]);

  if (semanticImport || aggregateReasonCodes.length > 0 || aggregateReasons.some(isSemanticAdmissionReason)) {
    const status = classifyLiveSemanticAdmissionStatus({
      staleAgainstHead: mergeBundle.staleAgainstHead || mergeBundle.disposition === 'stale-against-head' || result.mergeDisposition === 'stale-against-head',
      autoMergeable: mergeBundle.autoMergeable || mergeBundle.disposition === 'auto-mergeable' || result.mergeDisposition === 'auto-mergeable',
      signals: [
        mergeBundle.status,
        mergeBundle.mergeReadiness,
        mergeBundle.disposition,
        result.status,
        result.mergeReadiness,
        result.mergeDisposition,
        ...aggregateReasonCodes,
        ...aggregateReasons,
        ...semanticImportStatusSignals(semanticImport)
      ]
    });
    decisions.push({
      key: 'merge-admission',
      source: 'merge-admission',
      label: `semantic admission: ${status}`,
      status,
      action: status === 'safe' ? 'apply' : status === 'no-op' ? 'record' : status === 'stale' ? 'rerun' : status === 'block' ? 'block' : 'review',
      reasonCodes: aggregateReasonCodes,
      reasons: aggregateReasons,
      data: {
        source: 'merge-admission',
        status,
        mergeReadiness: result.mergeReadiness ?? mergeBundle.mergeReadiness,
        disposition: result.mergeDisposition ?? mergeBundle.disposition,
        autoMergeable: mergeBundle.autoMergeable,
        staleAgainstHead: mergeBundle.staleAgainstHead,
        semanticImportPresent: Boolean(semanticImport),
        reasonCodes: aggregateReasonCodes,
        reasons: aggregateReasons
      }
    });
  }

  for (const decision of semanticMetadataDecisions(metadata, 'metadata')) decisions.push(decision);
  for (const decision of semanticMetadataDecisions(resultMetadata, 'result-metadata')) decisions.push(decision);
  for (const decision of semanticEditSummaryDecisions(semanticImport)) decisions.push(decision);

  const seen = new Set<string>();
  return decisions.filter((decision) => {
    const dedupeKey = `${decision.source}:${decision.key}`;
    if (seen.has(dedupeKey)) return false;
    seen.add(dedupeKey);
    return true;
  });
}

function semanticMetadataDecisions(
  metadata: Record<string, unknown> | undefined,
  sourcePrefix: string
): LiveSemanticAdmissionDecision[] {
  if (!metadata) return [];
  const out: LiveSemanticAdmissionDecision[] = [];
  for (const [key, label] of [
    ['semanticAdmission', 'semantic admission'],
    ['semanticMergeAdmission', 'semantic merge admission'],
    ['semanticEditAdmission', 'semantic edit admission'],
    ['safeMerge', 'safe merge'],
    ['safeMergeDecision', 'safe merge decision'],
    ['semanticSafeMerge', 'semantic safe merge']
  ] as const) {
    const record = recordValue(metadata[key]);
    if (!record) continue;
    const reasonCodes = semanticReasonCodesFromRecord(record);
    const reasons = stringValues(record.reasons);
    const status = classifyLiveSemanticAdmissionStatus({
      signals: [
        stringValue(record.status),
        stringValue(record.decision),
        stringValue(record.outcome),
        stringValue(record.action),
        ...reasonCodes,
        ...reasons
      ],
      autoMergeable: record.autoMergeCandidate === true || record.cleanEligible === true || record.safe === true
    });
    out.push({
      key,
      source: `${sourcePrefix}:${key}`,
      label: `${label}: ${status}`,
      status,
      action: stringValue(record.action) ?? stringValue(record.decision),
      reasonCodes,
      reasons,
      data: {
        source: `${sourcePrefix}:${key}`,
        status,
        action: stringValue(record.action),
        decision: stringValue(record.decision),
        outcome: stringValue(record.outcome),
        reasonCodes,
        reasons,
        record
      }
    });
  }
  return out;
}

function semanticEditSummaryDecisions(
  semanticImport: Record<string, unknown> | undefined
): LiveSemanticAdmissionDecision[] {
  if (!semanticImport) return [];
  const sections: Array<[string, string, Record<string, unknown> | undefined]> = [
    ['semantic-edit-script', 'semantic edit script', recordValue(semanticImport.semanticEditScripts)],
    ['semantic-edit-projection', 'semantic edit projection', recordValue(semanticImport.semanticEditProjections) ?? recordValue(semanticImport.semanticEditProjection)],
    ['semantic-edit-replay', 'semantic edit replay', recordValue(semanticImport.semanticEditReplays) ?? recordValue(semanticImport.semanticEditReplay)]
  ];
  return sections.flatMap(([key, label, section]) => {
    if (!section || !semanticEditSectionHasAdmissionData(section)) return [];
    const reasonCodes = semanticReasonCodesFromRecord(section);
    const reasons = stringValues(section.reasons);
    const admissionStatuses = semanticAdmissionStatuses(section);
    const status = classifyLiveSemanticAdmissionStatus({
      signals: [
        stringValue(section.status),
        ...stringValues(section.actions),
        ...admissionStatuses,
        ...reasonCodes,
        ...reasons
      ]
    });
    return [{
      key,
      source: key,
      label: `${label}: ${status}`,
      status,
      action: firstString(stringValues(section.actions)) ?? actionForSemanticAdmissionStatus(status),
      reasonCodes,
      reasons,
      data: {
        source: key,
        status,
        action: firstString(stringValues(section.actions)) ?? actionForSemanticAdmissionStatus(status),
        admissionStatuses,
        reasonCodes,
        reasons,
        summary: section
      }
    }];
  });
}

function semanticImportSummaryForLiveEvent(
  result: FrontierSwarmJobResultInput,
  mergeBundle: FrontierSwarmMergeBundle
): Record<string, unknown> | undefined {
  const metadata = recordValue(mergeBundle.metadata);
  const resultMetadata = recordValue(result.metadata);
  const candidates = [
    recordValue(result.semanticImport),
    recordValue(mergeBundle.semanticImport),
    recordValue(resultMetadata?.semanticImport),
    recordValue(resultMetadata?.semanticImportSummary),
    recordValue(metadata?.semanticImport),
    recordValue(metadata?.semanticImportSummary)
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry));
  return candidates.sort((left, right) => semanticImportRichness(right) - semanticImportRichness(left))[0];
}

function semanticImportRichness(summary: Record<string, unknown>): number {
  const semanticIndex = recordValue(summary.semanticIndex);
  const semanticSidecars = recordValue(summary.semanticSidecars);
  const values: unknown[] = [
    summary.total,
    summary.selected,
    summary.eligible,
    summary.imported,
    summary.sourceMapMappingCount,
    semanticIndex?.symbols,
    semanticSidecars?.ownershipRegions,
    semanticSidecars?.patchHints
  ];
  return values.reduce<number>((sum, value) => sum + nonNegativeNumber(value), 0);
}

function semanticImportReasonCodes(summary: Record<string, unknown> | undefined): string[] {
  if (!summary) return [];
  return uniqueStrings([
    ...semanticReasonCodesFromRecord(summary),
    ...semanticReasonCodesFromRecord(recordValue(summary.semanticEditScripts)),
    ...semanticReasonCodesFromRecord(recordValue(summary.semanticEditProjections)),
    ...semanticReasonCodesFromRecord(recordValue(summary.semanticEditProjection)),
    ...semanticReasonCodesFromRecord(recordValue(summary.semanticEditReplays)),
    ...semanticReasonCodesFromRecord(recordValue(summary.semanticEditReplay)),
    ...semanticReasonCodesFromRecord(recordValue(summary.semanticLineage)),
    ...semanticReasonCodesFromRecord(recordValue(summary.semanticSliceAdmissions))
  ]);
}

function semanticAdmissionReasonCodesFromMetadata(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) return [];
  return uniqueStrings([
    ...semanticReasonCodesFromRecord(recordValue(metadata.semanticAdmission)),
    ...semanticReasonCodesFromRecord(recordValue(metadata.semanticMergeAdmission)),
    ...semanticReasonCodesFromRecord(recordValue(metadata.semanticEditAdmission)),
    ...semanticReasonCodesFromRecord(recordValue(metadata.safeMerge)),
    ...semanticReasonCodesFromRecord(recordValue(metadata.safeMergeDecision)),
    ...semanticReasonCodesFromRecord(recordValue(metadata.semanticSafeMerge))
  ]);
}

function semanticImportStatusSignals(summary: Record<string, unknown> | undefined): string[] {
  if (!summary) return [];
  return uniqueStrings([
    ...semanticAdmissionStatuses(recordValue(summary.semanticEditScripts)),
    ...semanticAdmissionStatuses(recordValue(summary.semanticEditProjections)),
    ...semanticAdmissionStatuses(recordValue(summary.semanticEditProjection)),
    ...semanticAdmissionStatuses(recordValue(summary.semanticEditReplays)),
    ...semanticAdmissionStatuses(recordValue(summary.semanticEditReplay)),
    ...Object.keys(countRecord(summary.readiness)).filter((key) => countRecord(summary.readiness)[key]! > 0)
  ]);
}

function semanticEditSectionHasAdmissionData(section: Record<string, unknown>): boolean {
  return nonNegativeNumber(section.total) > 0 ||
    nonNegativeNumber(section.operations) > 0 ||
    nonNegativeNumber(section.acceptedClean) > 0 ||
    semanticAdmissionStatuses(section).length > 0 ||
    semanticReasonCodesFromRecord(section).length > 0;
}

function semanticAdmissionStatuses(section: Record<string, unknown> | undefined): string[] {
  if (!section) return [];
  const counters = [
    countRecord(section.admission),
    countRecord(section.statusCounts),
    countRecord(section.byStatus)
  ];
  return uniqueStrings([
    ...counters.flatMap((record) => Object.entries(record).filter(([, count]) => count > 0).map(([key]) => key)),
    ...[
      ['accepted-clean', section.acceptedClean],
      ['already-applied', section.alreadyApplied],
      ['auto-merge-candidate', section.autoMergeCandidates],
      ['auto-apply-candidate', section.autoApplyCandidates],
      ['portable', section.portable],
      ['projected', section.projected],
      ['conflict', section.conflicts],
      ['stale', section.stale],
      ['blocked', section.blocked],
      ['needs-port', section.needsPort],
      ['needs-review', section.reviewRequired],
      ['evidence-only', section.evidenceOnly]
    ].filter(([, value]) => nonNegativeNumber(value) > 0).map(([status]) => String(status))
  ]);
}

function classifyLiveSemanticAdmissionStatus(input: {
  signals: readonly (string | undefined)[];
  staleAgainstHead?: boolean;
  autoMergeable?: boolean;
}): LiveSemanticAdmissionStatus {
  const signals = uniqueStrings(input.signals.filter((signal): signal is string => Boolean(signal))).map(normalizedAdmissionSignal);
  if (input.staleAgainstHead || signals.some((signal) => signal === 'stale' || signal === 'stale-against-head')) return 'stale';
  if (signals.some((signal) =>
    signal.includes('conflict') ||
    signal === 'block' ||
    signal === 'blocked' ||
    signal === 'reject' ||
    signal === 'rejected' ||
    signal === 'failed' ||
    signal === 'fail'
  )) return 'block';
  if (signals.some((signal) =>
    signal === 'already-applied' ||
    signal === 'alreadyapplied' ||
    signal === 'no-op' ||
    signal === 'noop' ||
    signal === 'no-source-changes' ||
    signal === 'discovery-only' ||
    signal === 'record-only' ||
    signal === 'record'
  )) return 'no-op';
  if (signals.some((signal) =>
    signal === 'review' ||
    signal === 'needs-review' ||
    signal === 'needsreview' ||
    signal === 'review-required' ||
    signal === 'reviewrequired' ||
    signal === 'needs-port' ||
    signal === 'needsport' ||
    signal === 'manual-review' ||
    signal === 'human-review' ||
    signal === 'prioritize' ||
    signal === 'ambiguous' ||
    signal === 'evidence-only'
  )) return 'review';
  if (input.autoMergeable || signals.some((signal) =>
    signal === 'safe' ||
    signal === 'ready' ||
    signal === 'admit' ||
    signal === 'apply' ||
    signal === 'accepted-clean' ||
    signal === 'auto-merge-candidate' ||
    signal === 'auto-apply-candidate' ||
    signal === 'portable' ||
    signal === 'projected' ||
    signal === 'verified-patch' ||
    signal === 'auto-mergeable'
  )) return 'safe';
  return 'review';
}

function actionForSemanticAdmissionStatus(status: LiveSemanticAdmissionStatus): string {
  if (status === 'safe') return 'apply';
  if (status === 'no-op') return 'record';
  if (status === 'stale') return 'rerun';
  if (status === 'block') return 'block';
  return 'review';
}

function semanticReasonCodesFromRecord(record: Record<string, unknown> | undefined): string[] {
  if (!record) return [];
  return uniqueStrings([
    ...stringValues(record.reasonCodes),
    ...stringValues(record.reasonCode),
    ...stringValues(record.semanticImportExpectedMissingReasonCodes),
    ...stringValues(record.expectedMissingReasonCodes)
  ]);
}

function isSemanticAdmissionReason(reason: string): boolean {
  return normalizedAdmissionSignal(reason).startsWith('semantic-') ||
    normalizedAdmissionSignal(reason).startsWith('auto-merge-candidate-');
}

function normalizedAdmissionSignal(value: string): string {
  return value.trim().replace(/_/g, '-').toLowerCase();
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

function countStrings(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function countRecord(value: unknown): Record<string, number> {
  const record = recordValue(value);
  if (!record) return {};
  const out: Record<string, number> = {};
  for (const [key, entry] of Object.entries(record)) {
    const count = nonNegativeNumber(entry);
    if (count > 0) out[key] = count;
  }
  return out;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string' && value.length > 0) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function firstString(values: readonly string[]): string | undefined {
  return values.find((value) => value.length > 0);
}

function nonNegativeNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
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

async function writeTextFileAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.writeFile(tmp, text);
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}
