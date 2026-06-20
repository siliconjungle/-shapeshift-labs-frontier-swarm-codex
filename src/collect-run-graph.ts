import fs from 'node:fs';
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
import { classifyCodexSemanticCollectAdmission } from './collect-semantic-admission.js';
import {
  countCodexRunGraphValues,
  createCodexRunGraphIndexes,
  hashCodexRunGraphString,
  mergeCodexRunGraphNode,
  stableCodexRunGraphPart,
  stringFromUnknown
} from './run-graph-utils.js';

type AddRunGraphNode = (node: FrontierCodexRunGraphNode) => string;
type AddRunGraphEdge = (
  kind: FrontierCodexRunGraphEdgeKind,
  from?: string,
  to?: string,
  label?: string,
  data?: Record<string, unknown>
) => void;

interface GraphProjectionRefs {
  jobId?: string;
  taskId?: string;
  lane?: string;
  model?: string;
  computeId?: string;
  modelTier?: string;
  taskKind?: string;
  workKind?: string;
}

interface RunGraphReferenceIndex {
  jobIds: Set<string>;
  taskIds: Set<string>;
  jobIdsByLane: Map<string, string[]>;
  taskIdsByLane: Map<string, string[]>;
}

type SemanticSidecarAdmissionStatus = 'safe' | 'review' | 'conflict';

interface SemanticSidecarCandidateProjection {
  key: string;
  label: string;
  status: SemanticSidecarAdmissionStatus;
  action?: string;
  path?: string;
  readiness?: string;
  risk?: string;
  reasonCodes: string[];
  reasons: string[];
  conflictKeys: string[];
  ownershipRegionIds: string[];
  data: Record<string, unknown>;
}

interface SemanticSidecarOwnershipRegionProjection {
  key: string;
  id?: string;
  label: string;
  path?: string;
  status?: string;
  data: Record<string, unknown>;
}

interface SemanticSidecarGraphProjection {
  candidates: SemanticSidecarCandidateProjection[];
  ownershipRegions: SemanticSidecarOwnershipRegionProjection[];
  summary?: {
    candidateCount: number;
    safeCount: number;
    reviewCount: number;
    conflictCount: number;
    reasonCodes: string[];
    ownershipRegionIds: string[];
  };
}

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

  const graphRefs = createRunGraphReferenceIndex(result);
  for (const bucket of Object.keys(result.buckets) as FrontierCodexCollectBucket[]) {
    const bucketNodeId = `bucket:${bucket}`;
    addNode({ id: bucketNodeId, kind: 'bucket', label: bucket, bucket, generatedAt });
    addEdge('contains', runNodeId, bucketNodeId);
    for (const entry of result.buckets[bucket]) {
      addCollectedBundleNodes(bucket, entry, result.semanticImport?.expected === true, runNodeId, bucketNodeId, addNode, addEdge);
    }
  }

  addQueueOutcomeNodes(result, runNodeId, addNode, addEdge);
  addTerminalStateNodes(result, runNodeId, addNode, addEdge);
  addTournamentNodes(result, runNodeId, graphRefs, addNode, addEdge);
  addAdaptiveFeedbackNodes(result, runNodeId, graphRefs, addNode, addEdge);

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
      gateCount: nodeKinds.gate ?? 0,
      semanticAdmissionCount: nodeKinds['semantic-admission'] ?? 0,
      semanticCandidateCount: nodeKinds['semantic-candidate'] ?? 0,
      semanticOwnershipRegionCount: nodeKinds['semantic-ownership-region'] ?? 0
    }
  };
}

function addCollectedBundleNodes(
  bucket: FrontierCodexCollectBucket,
  entry: FrontierCodexCollectedBundle,
  semanticImportExpected: boolean,
  runNodeId: string,
  bucketNodeId: string,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): void {
  const bundle = entry.bundle;
  const semanticAdmission = classifyCodexSemanticCollectAdmission(bundle, {
    hasActionablePatch: Boolean(entry.patchPath ?? bundle.patchPath),
    semanticImportExpected
  });
  const jobNodeId = `job:${bundle.jobId}`;
  const candidateNodeId = `candidate:${bundle.jobId}`;
  const mergeNodeId = `merge:${bundle.id || bundle.jobId}`;
  const taskNodeId = bundle.taskId ? `task:${bundle.taskId}` : undefined;
  const bundleRefs = graphRefsFromUnknown(bundle);
  const semanticSidecarProjection = createSemanticSidecarGraphProjection(entry);

  if (taskNodeId) {
    addNode({
      id: taskNodeId,
      kind: 'task',
      label: bundle.taskId,
      taskId: bundle.taskId,
      lane: bundle.lane,
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
    lane: bundle.lane,
    model: bundleRefs.model,
    computeId: bundleRefs.computeId,
    modelTier: bundleRefs.modelTier,
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
    lane: bundle.lane,
    model: bundleRefs.model,
    computeId: bundleRefs.computeId,
    modelTier: bundleRefs.modelTier,
    bucket,
    status: bundle.status,
    outcome: bundle.disposition,
    generatedAt: bundle.generatedAt,
    refs: graphNodeRefs(bundleRefs, { merge: mergeNodeId, bucket: bucketNodeId }),
    data: {
      mergeReadiness: bundle.mergeReadiness,
      riskLevel: bundle.riskLevel,
      autoMergeable: bundle.autoMergeable,
      staleAgainstHead: bundle.staleAgainstHead,
      semanticAdmission,
      semanticSidecarAdmission: semanticSidecarProjection.summary,
      reasons: bundle.reasons,
      changedPaths: bundle.changedPaths,
      patchPath: entry.patchPath ?? bundle.patchPath,
      outputDir: entry.outputDir
    }
  });
  addEdge('produces', jobNodeId, candidateNodeId);
  addEdge('classifiedAs', bucketNodeId, candidateNodeId);
  addSemanticSidecarAdmissionNodes(semanticSidecarProjection, bundle, candidateNodeId, addNode, addEdge);

  addNode({
    id: mergeNodeId,
    kind: 'merge',
    label: bundle.id || bundle.jobId,
    jobId: bundle.jobId,
    taskId: bundle.taskId,
    lane: bundle.lane,
    model: bundleRefs.model,
    computeId: bundleRefs.computeId,
    modelTier: bundleRefs.modelTier,
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
      lane: bundle.lane,
      bucket,
      path: evidencePath,
      generatedAt: bundle.generatedAt
    });
    addEdge('produces', candidateNodeId, evidenceNodeId);
  }

  for (const command of bundle.commandsPassed ?? []) addGateNode(command, 'passed', candidateNodeId, bundle.jobId, bundle.taskId, bucket, addNode, addEdge);
  for (const command of bundle.commandsFailed ?? []) addGateNode(command, 'failed', candidateNodeId, bundle.jobId, bundle.taskId, bucket, addNode, addEdge);
  addBundleRoutingDecisionNodes(bundle, jobNodeId, candidateNodeId, addNode, addEdge);
}

function addSemanticSidecarAdmissionNodes(
  projection: SemanticSidecarGraphProjection,
  bundle: FrontierCodexCollectedBundle['bundle'],
  candidateNodeId: string,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): void {
  if (projection.candidates.length === 0) return;
  const refs = graphRefsFromUnknown(bundle);
  const regionNodeIds = new Map<string, string>();
  for (const region of projection.ownershipRegions) {
    const regionNodeId = `semantic-region:${bundle.jobId}:${stableCodexRunGraphPart(region.key)}`;
    regionNodeIds.set(region.id ?? region.key, regionNodeId);
    addNode({
      id: regionNodeId,
      kind: 'semantic-ownership-region',
      label: region.label,
      jobId: bundle.jobId,
      taskId: bundle.taskId,
      lane: bundle.lane,
      status: region.status,
      path: region.path,
      generatedAt: bundle.generatedAt,
      refs: graphNodeRefs(refs),
      data: region.data
    });
    addEdge('produces', candidateNodeId, regionNodeId, 'semantic-ownership-region');
  }

  for (const candidate of projection.candidates) {
    const semanticCandidateNodeId = `semantic-candidate:${bundle.jobId}:${stableCodexRunGraphPart(candidate.key)}`;
    const admissionNodeId = `semantic-admission:${bundle.jobId}:${stableCodexRunGraphPart(candidate.key)}`;
    addNode({
      id: semanticCandidateNodeId,
      kind: 'semantic-candidate',
      label: candidate.label,
      jobId: bundle.jobId,
      taskId: bundle.taskId,
      lane: bundle.lane,
      status: candidate.status,
      outcome: candidate.action,
      path: candidate.path,
      generatedAt: bundle.generatedAt,
      refs: graphNodeRefs(refs, { candidate: candidateNodeId, admission: admissionNodeId }),
      data: candidate.data
    });
    addEdge('produces', candidateNodeId, semanticCandidateNodeId, candidate.status);

    addNode({
      id: admissionNodeId,
      kind: 'semantic-admission',
      label: candidate.status,
      jobId: bundle.jobId,
      taskId: bundle.taskId,
      lane: bundle.lane,
      status: candidate.status,
      outcome: candidate.action,
      generatedAt: bundle.generatedAt,
      refs: graphNodeRefs(refs, { candidate: semanticCandidateNodeId, bundleCandidate: candidateNodeId }),
      data: compactRecord({
        status: candidate.status,
        action: candidate.action,
        readiness: candidate.readiness,
        risk: candidate.risk,
        reasonCodes: candidate.reasonCodes,
        reasons: candidate.reasons,
        conflictKeys: candidate.conflictKeys,
        ownershipRegionIds: candidate.ownershipRegionIds
      })
    });
    addEdge('decides', admissionNodeId, semanticCandidateNodeId, candidate.status);
    addEdge('decides', admissionNodeId, candidateNodeId, candidate.status);

    for (const regionId of candidate.ownershipRegionIds) {
      const regionNodeId = regionNodeIds.get(regionId);
      if (regionNodeId) addEdge('touches', semanticCandidateNodeId, regionNodeId, candidate.status);
    }
  }
}

function createSemanticSidecarGraphProjection(entry: FrontierCodexCollectedBundle): SemanticSidecarGraphProjection {
  const candidates = new Map<string, SemanticSidecarCandidateProjection>();
  const ownershipRegions = new Map<string, SemanticSidecarOwnershipRegionProjection>();

  const addRegion = (region: SemanticSidecarOwnershipRegionProjection) => {
    const existing = ownershipRegions.get(region.key);
    ownershipRegions.set(region.key, existing ? {
      ...existing,
      ...region,
      data: compactRecord({ ...(existing.data ?? {}), ...(region.data ?? {}) })
    } : region);
  };
  const addCandidate = (candidate: SemanticSidecarCandidateProjection) => {
    const existing = candidates.get(candidate.key);
    candidates.set(candidate.key, existing ? {
      ...existing,
      ...candidate,
      reasonCodes: uniqueRunGraphStrings([...existing.reasonCodes, ...candidate.reasonCodes]),
      reasons: uniqueRunGraphStrings([...existing.reasons, ...candidate.reasons]),
      conflictKeys: uniqueRunGraphStrings([...existing.conflictKeys, ...candidate.conflictKeys]),
      ownershipRegionIds: uniqueRunGraphStrings([...existing.ownershipRegionIds, ...candidate.ownershipRegionIds]),
      data: compactRecord({ ...(existing.data ?? {}), ...(candidate.data ?? {}) })
    } : candidate);
  };

  for (const source of semanticSidecarProjectionSources(entry)) {
    addSemanticSidecarSourceProjection(source, addCandidate, addRegion);
  }

  const candidateList = Array.from(candidates.values()).sort((left, right) => left.key.localeCompare(right.key));
  const regionList = Array.from(ownershipRegions.values()).sort((left, right) => left.key.localeCompare(right.key));
  if (candidateList.length === 0) return { candidates: candidateList, ownershipRegions: regionList };
  const reasonCodes = uniqueRunGraphStrings(candidateList.flatMap((candidate) => candidate.reasonCodes));
  const ownershipRegionIds = uniqueRunGraphStrings(candidateList.flatMap((candidate) => candidate.ownershipRegionIds));
  return {
    candidates: candidateList,
    ownershipRegions: regionList,
    summary: {
      candidateCount: candidateList.length,
      safeCount: candidateList.filter((candidate) => candidate.status === 'safe').length,
      reviewCount: candidateList.filter((candidate) => candidate.status === 'review').length,
      conflictCount: candidateList.filter((candidate) => candidate.status === 'conflict').length,
      reasonCodes,
      ownershipRegionIds
    }
  };
}

function semanticSidecarProjectionSources(entry: FrontierCodexCollectedBundle): Record<string, unknown>[] {
  const bundle = entry.bundle;
  const metadata = recordValue(bundle.metadata);
  const sources: Record<string, unknown>[] = [];
  pushSemanticSidecarSources(sources, bundle.semanticImport);
  pushSemanticSidecarSources(sources, metadata?.semanticImport);
  pushSemanticSidecarSources(sources, metadata?.semanticImports);
  pushSemanticSidecarSources(sources, metadata?.semanticImportSidecar);
  pushSemanticSidecarSources(sources, metadata?.semanticSidecar);
  pushSemanticSidecarSources(sources, metadata?.semanticSidecars);
  for (const sidecar of readSemanticSidecarEvidenceFiles(entry)) pushSemanticSidecarSources(sources, sidecar);
  return uniqueRecords(sources);
}

function pushSemanticSidecarSources(out: Record<string, unknown>[], value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value) pushSemanticSidecarSources(out, entry);
    return;
  }
  const record = recordValue(value);
  if (record) out.push(record);
}

function readSemanticSidecarEvidenceFiles(entry: FrontierCodexCollectedBundle): Record<string, unknown>[] {
  const files = semanticSidecarEvidenceFileCandidates(entry);
  const records: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file)) continue;
    seen.add(file);
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const record = recordValue(parsed);
      if (record) records.push(record);
    } catch {
      // Sidecar evidence is advisory for graph projection; collection should not fail on a malformed optional sidecar.
    }
  }
  return records;
}

function semanticSidecarEvidenceFileCandidates(entry: FrontierCodexCollectedBundle): string[] {
  const dirs = uniqueRunGraphStrings([entry.outputDir, path.dirname(entry.mergePath)]);
  const files: string[] = [];
  for (const evidencePath of entry.bundle.evidencePaths ?? []) {
    if (path.basename(evidencePath) !== 'semantic-imports.json') continue;
    if (path.isAbsolute(evidencePath)) files.push(evidencePath);
    else {
      for (const dir of dirs) files.push(path.resolve(dir, evidencePath));
      for (const dir of dirs) files.push(path.resolve(dir, path.basename(evidencePath)));
    }
  }
  return uniqueRunGraphStrings(files);
}

function addSemanticSidecarSourceProjection(
  source: Record<string, unknown>,
  addCandidate: (candidate: SemanticSidecarCandidateProjection) => void,
  addRegion: (region: SemanticSidecarOwnershipRegionProjection) => void
): void {
  const sourceRegions = semanticOwnershipRegionProjections(source);
  for (const region of sourceRegions) addRegion(region);

  const records = recordsFromUnknown(source.records);
  if (records.length > 0) {
    records.forEach((record, index) => {
      const recordRegions = uniqueSemanticRegionProjections([
        ...sourceRegions,
        ...semanticOwnershipRegionProjections(record)
      ]);
      for (const region of recordRegions) addRegion(region);
      const candidate = semanticCandidateProjectionFromRecord(record, recordRegions, index);
      if (candidate) addCandidate(candidate);
    });
    return;
  }

  const mergeCandidates = recordsFromUnknown(source.mergeCandidates);
  mergeCandidates.forEach((candidate, index) => {
    const projection = semanticCandidateProjectionFromCandidate(source, candidate, sourceRegions, index);
    if (projection) addCandidate(projection);
  });

  if (mergeCandidates.length === 0) {
    const candidate = semanticCandidateProjectionFromRecord(source, sourceRegions, 0);
    if (candidate) addCandidate(candidate);
  }
}

function semanticCandidateProjectionFromRecord(
  record: Record<string, unknown>,
  regions: readonly SemanticSidecarOwnershipRegionProjection[],
  index: number
): SemanticSidecarCandidateProjection | undefined {
  const mergeCandidate = recordValue(record.mergeCandidate) ?? firstRecordAtPaths(record, [['semanticSidecar', 'mergeCandidate']]);
  const semanticSliceAdmission = recordValue(record.semanticSliceAdmission);
  const semanticSidecar = recordValue(record.semanticSidecar);
  const semanticSlice = recordValue(record.semanticSlice);
  const hasCandidate = Boolean(mergeCandidate || semanticSliceAdmission || semanticSidecar || semanticSlice);
  if (!hasCandidate) return undefined;
  return semanticCandidateProjectionFromParts({
    record,
    candidate: mergeCandidate ?? {},
    semanticSliceAdmission,
    semanticSidecar,
    semanticSlice,
    regions,
    index
  });
}

function semanticCandidateProjectionFromCandidate(
  source: Record<string, unknown>,
  candidate: Record<string, unknown>,
  regions: readonly SemanticSidecarOwnershipRegionProjection[],
  index: number
): SemanticSidecarCandidateProjection | undefined {
  return semanticCandidateProjectionFromParts({
    record: source,
    candidate,
    semanticSidecar: source,
    regions,
    index
  });
}

function semanticCandidateProjectionFromParts(input: {
  record: Record<string, unknown>;
  candidate: Record<string, unknown>;
  semanticSliceAdmission?: Record<string, unknown>;
  semanticSidecar?: Record<string, unknown>;
  semanticSlice?: Record<string, unknown>;
  regions: readonly SemanticSidecarOwnershipRegionProjection[];
  index: number;
}): SemanticSidecarCandidateProjection {
  const candidate = input.candidate;
  const admission = input.semanticSliceAdmission;
  const sidecar = input.semanticSidecar;
  const semanticSlice = input.semanticSlice;
  const sourcePath = firstString([input.record.path, candidate.path, sidecar?.sourcePath, recordValue(sidecar?.summary)?.sourcePath]);
  const readiness = firstString([
    candidate.readiness,
    admission?.readiness,
    semanticSlice?.readiness,
    sidecar?.readiness,
    recordValue(sidecar?.summary)?.readiness,
    recordValue(input.record.nativeDiff)?.readiness
  ]);
  const action = firstString([
    admission?.action,
    candidate.action,
    recordValue(sidecar?.admission)?.action,
    sidecar?.semanticImportRecordAction,
    recordValue(sidecar?.summary)?.semanticImportRecordAction
  ]);
  const risk = firstString([candidate.risk, admission?.risk, recordValue(admission?.mergeScore)?.risk]);
  const reasonCodes = uniqueRunGraphStrings([
    ...stringValues(candidate.reasonCodes),
    ...stringValues(candidate.reasons),
    ...stringValues(admission?.reasonCodes),
    ...stringValues(admission?.reasons),
    ...stringValues(recordValue(sidecar?.admission)?.reasonCodes),
    ...stringValues(recordValue(sidecar?.quality)?.reasonCodes),
    ...stringValues(sidecar?.semanticImportExpectedMissingReasonCodes),
    ...stringValues(recordValue(sidecar?.summary)?.semanticImportExpectedMissingReasonCodes),
    ...stringValues(recordValue(sidecar?.summary)?.semanticImportRecordReasonCode),
    ...stringValues(input.record.reasonCodes),
    ...stringValues(input.record.reasons)
  ]);
  const reasons = uniqueRunGraphStrings([
    ...stringValues(candidate.reasons),
    ...stringValues(admission?.reasons),
    ...stringValues(recordValue(sidecar?.admission)?.reasons),
    ...stringValues(input.record.reasons)
  ]);
  const conflictKeys = uniqueRunGraphStrings([
    ...stringValues(candidate.conflictKeys),
    ...stringValues(admission?.conflictKeys),
    ...stringValues(semanticSlice?.conflictKeys),
    ...stringValues(recordValue(candidate.conflictSummary)?.conflictKeys)
  ]);
  const ownershipRegionIds = uniqueRunGraphStrings([
    ...input.regions.map((region) => region.id ?? region.key),
    ...stringValues(candidate.ownershipRegionIds),
    ...stringValues(admission?.ownershipRegionIds)
  ]);
  const status = semanticSidecarAdmissionStatus({
    candidate,
    admission,
    sidecar,
    semanticSlice,
    readiness,
    risk,
    action,
    reasonCodes,
    reasons,
    conflictKeys
  });
  const key = firstString([
    candidate.id,
    admission?.id,
    input.record.importId,
    sidecar?.id,
    semanticSlice?.id,
    sourcePath ? `${sourcePath}:${input.index}` : undefined
  ]) ?? `semantic-candidate:${input.index}`;
  return {
    key,
    label: sourcePath ? `${path.basename(sourcePath)}:${status}` : `${key}:${status}`,
    status,
    action,
    path: sourcePath,
    readiness,
    risk,
    reasonCodes,
    reasons,
    conflictKeys,
    ownershipRegionIds,
    data: compactRecord({
      path: sourcePath,
      readiness,
      risk,
      action,
      reasonCodes,
      reasons,
      conflictKeys,
      ownershipRegionIds,
      mergeCandidate: Object.keys(candidate).length ? candidate : undefined,
      semanticSliceAdmission: admission,
      semanticSlice,
      semanticSidecar: sidecar ? compactRecord({
        kind: sidecar.kind,
        id: sidecar.id,
        readiness: sidecar.readiness,
        symbols: sidecar.symbols,
        ownershipRegions: sidecar.ownershipRegions,
        patchHints: sidecar.patchHints,
        semanticImportExpectedSatisfied: sidecar.semanticImportExpectedSatisfied,
        semanticImportExpectedMissingReasonCodes: sidecar.semanticImportExpectedMissingReasonCodes,
        sampleOwnershipRegions: sidecar.sampleOwnershipRegions
      }) : undefined
    })
  };
}

function semanticSidecarAdmissionStatus(input: {
  candidate: Record<string, unknown>;
  admission?: Record<string, unknown>;
  sidecar?: Record<string, unknown>;
  semanticSlice?: Record<string, unknown>;
  readiness?: string;
  risk?: string;
  action?: string;
  reasonCodes: readonly string[];
  reasons: readonly string[];
  conflictKeys: readonly string[];
}): SemanticSidecarAdmissionStatus {
  const statusSignals = uniqueRunGraphStrings([
    input.readiness,
    input.action,
    input.risk,
    stringFromUnknown(input.candidate.status),
    stringFromUnknown(input.admission?.status),
    stringFromUnknown(input.sidecar?.status),
    stringFromUnknown(input.semanticSlice?.status),
    ...input.reasonCodes,
    ...input.reasons
  ].filter((entry): entry is string => typeof entry === 'string')).map(normalizedSemanticSidecarSignal);
  if (
    input.conflictKeys.length > 0 ||
    statusSignals.some((signal) => signal.includes('conflict') || signal === 'blocked' || signal === 'block' || signal === 'reject' || signal === 'rejected')
  ) {
    return 'conflict';
  }
  if (
    booleanFromUnknown(input.admission?.reviewRequired) === true ||
    statusSignals.some((signal) =>
      signal === 'needs-review' ||
      signal === 'ready-with-losses' ||
      signal === 'manual-review' ||
      signal === 'human-review' ||
      signal === 'review' ||
      signal === 'prioritize' ||
      signal === 'medium' ||
      signal === 'high'
    )
  ) {
    return 'review';
  }
  if (
    booleanFromUnknown(input.candidate.mergeable) === true ||
    booleanFromUnknown(input.admission?.autoMergeClaim) === true ||
    statusSignals.some((signal) => signal === 'ready' || signal === 'admit' || signal === 'apply' || signal === 'auto-merge')
  ) {
    return 'safe';
  }
  return 'review';
}

function normalizedSemanticSidecarSignal(value: string): string {
  return value.trim().replace(/_/g, '-').toLowerCase();
}

function semanticOwnershipRegionProjections(record: Record<string, unknown>): SemanticSidecarOwnershipRegionProjection[] {
  const sidecar = recordValue(record.semanticSidecar);
  return uniqueSemanticRegionProjections([
    ...recordsFromUnknown(record.ownershipRegions).map(semanticOwnershipRegionProjection),
    ...recordsFromUnknown(record.sampleOwnershipRegions).map(semanticOwnershipRegionProjection),
    ...recordsFromUnknown(sidecar?.ownershipRegions).map(semanticOwnershipRegionProjection),
    ...recordsFromUnknown(sidecar?.sampleOwnershipRegions).map(semanticOwnershipRegionProjection),
    ...recordsFromUnknown(recordValue(record.semanticSlice)?.ownershipRegions).map(semanticOwnershipRegionProjection)
  ].filter((entry): entry is SemanticSidecarOwnershipRegionProjection => Boolean(entry)));
}

function semanticOwnershipRegionProjection(region: Record<string, unknown>): SemanticSidecarOwnershipRegionProjection | undefined {
  const id = firstString([region.id, region.key, region.conflictKey]);
  const sourcePath = firstString([region.sourcePath, region.path]);
  const symbolName = stringFromUnknown(region.symbolName);
  const key = id ?? firstString([sourcePath && symbolName ? `${sourcePath}:${symbolName}` : undefined, sourcePath]);
  if (!key) return undefined;
  return {
    key,
    id,
    label: symbolName ?? id ?? sourcePath ?? key,
    path: sourcePath,
    status: firstString([region.readiness, region.mergePolicy, region.precision]),
    data: compactRecord({
      id: region.id,
      key: region.key,
      conflictKey: region.conflictKey,
      sourcePath,
      symbolName,
      symbolKind: region.symbolKind,
      regionKind: region.regionKind,
      granularity: region.granularity,
      precision: region.precision,
      mergePolicy: region.mergePolicy,
      sourceSpan: region.sourceSpan
    })
  };
}

function uniqueSemanticRegionProjections(
  regions: readonly (SemanticSidecarOwnershipRegionProjection | undefined)[]
): SemanticSidecarOwnershipRegionProjection[] {
  const out = new Map<string, SemanticSidecarOwnershipRegionProjection>();
  for (const region of regions) {
    if (!region) continue;
    const existing = out.get(region.key);
    out.set(region.key, existing ? {
      ...existing,
      ...region,
      data: compactRecord({ ...(existing.data ?? {}), ...(region.data ?? {}) })
    } : region);
  }
  return Array.from(out.values());
}

function addGateNode(
  command: { name?: string; command?: readonly string[]; commandLine?: string },
  status: string,
  candidateNodeId: string,
  jobId: string,
  taskId: string | undefined,
  bucket: FrontierCodexCollectBucket,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): void {
  const label = command.name ?? command.commandLine ?? command.command?.join(' ') ?? 'command';
  const id = `gate:${jobId}:${stableCodexRunGraphPart(label)}`;
  addNode({ id, kind: 'gate', label, jobId, taskId, bucket, status, data: { command } });
  addEdge('verifies', id, candidateNodeId, status);
}

function addQueueOutcomeNodes(
  result: FrontierCodexCollectResult,
  runNodeId: string,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): void {
  for (const decision of result.queueOutcomeModel?.latestDecisions ?? []) {
    const id = `decision:queue:${decision.id}`;
    addNode({
      id,
      kind: 'decision',
      label: decision.subjectId || decision.outcome,
      jobId: decision.jobId,
      taskId: decision.taskId,
      lane: stringFromUnknown((decision as unknown as Record<string, unknown>).lane),
      status: decision.category,
      outcome: decision.outcome,
      generatedAt: decision.generatedAt,
      refs: graphNodeRefs(graphRefsFromUnknown(decision)),
      data: { reasons: decision.reasons, queueItemIds: decision.queueItemIds }
    });
    addEdge('contains', runNodeId, id);
    if (decision.jobId) addEdge('decides', id, `candidate:${decision.jobId}`);
  }
}

function addTerminalStateNodes(
  result: FrontierCodexCollectResult,
  runNodeId: string,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): void {
  for (const item of result.terminalState?.items ?? []) {
    const id = `decision:terminal:${item.id}`;
    addNode({
      id,
      kind: 'decision',
      label: item.subjectId,
      jobId: item.jobId,
      taskId: stringFromUnknown((item as unknown as Record<string, unknown>).taskId),
      lane: stringFromUnknown((item as unknown as Record<string, unknown>).lane),
      status: item.bucket,
      outcome: item.status,
      generatedAt: item.generatedAt,
      refs: graphNodeRefs(graphRefsFromUnknown(item)),
      data: { queueItemIds: item.queueItemIds, subjectAliases: item.subjectAliases }
    });
    addEdge('contains', runNodeId, id);
    if (item.jobId) addEdge('decides', id, `candidate:${item.jobId}`);
  }
}

function addTournamentNodes(
  result: FrontierCodexCollectResult,
  runNodeId: string,
  graphRefs: RunGraphReferenceIndex,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): void {
  const tournament = result.strategyTournament;
  if (!tournament) return;
  const tournamentRecord = tournament as unknown as Record<string, unknown>;
  const tournamentSummary = recordValue(tournamentRecord.summary) ?? {};
  const tournamentWinnerId = stringFromUnknown(tournamentRecord.winnerId);
  const tournamentNodeId = `rsi:tournament:${tournament.id}`;
  addNode({
    id: tournamentNodeId,
    kind: 'rsi',
    label: tournament.title ?? tournament.id,
    generatedAt: tournament.generatedAt,
    data: { summary: tournament.summary, winnerId: tournamentWinnerId }
  });
  addEdge('contains', runNodeId, tournamentNodeId);

  const projectedCandidates: Array<{ id: string; refs: GraphProjectionRefs; selected: boolean; rejected: boolean; label?: string }> = [];
  const candidates = Array.isArray(tournamentRecord.candidates) ? tournamentRecord.candidates : [];
  for (const candidate of candidates) {
    const record = recordValue(candidate) ?? {};
    const refs = graphRefsFromUnknown(record);
    const candidateId = tournamentCandidateGraphId(record, refs);
    const outcome = tournamentCandidateOutcome(record);
    const selected = isSelectedTournamentCandidate(record, tournamentWinnerId ?? stringFromUnknown(tournamentSummary.topStrategyId), refs);
    const rejected = isRejectedTournamentCandidate(record);
    const status = stringFromUnknown(record.status) ?? (selected ? 'selected' : outcome);
    const id = `candidate:strategy:${candidateId}`;
    const label = stringFromUnknown(record.title) ?? stringFromUnknown(record.strategyId) ?? refs.jobId ?? candidateId;
    addNode({
      id,
      kind: 'candidate',
      label,
      jobId: refs.jobId,
      taskId: refs.taskId,
      lane: refs.lane,
      model: refs.model,
      computeId: refs.computeId,
      modelTier: refs.modelTier,
      status,
      outcome,
      generatedAt: tournament.generatedAt,
      refs: graphNodeRefs(refs, { tournament: tournamentNodeId }),
      data: compactRecord({
        score: record.score,
        reasons: record.reasons,
        strategyId: record.strategyId,
        disposition: record.disposition,
        selected,
        rejected,
        taskKind: refs.taskKind,
        workKind: refs.workKind
      })
    });
    addEdge('contains', tournamentNodeId, id);
    addEdge('decides', tournamentNodeId, id, status ?? outcome);
    if (refs.jobId) {
      addEdge('produces', `job:${refs.jobId}`, id, refs.lane);
      addEdge(selected ? 'mergesInto' : 'supersedes', id, `candidate:${refs.jobId}`, status ?? outcome);
    }
    if (refs.taskId) addEdge('produces', `task:${refs.taskId}`, id, refs.lane);
    linkGraphNodeToAffectedRefs('decides', id, refs, graphRefs, addEdge, status ?? outcome);
    projectedCandidates.push({ id, refs, selected, rejected, label });
  }

  const selectedCandidates = projectedCandidates.filter((candidate) => candidate.selected);
  if (selectedCandidates.length > 0) {
    for (const rejected of projectedCandidates.filter((candidate) => candidate.rejected || !candidate.selected)) {
      for (const selected of selectedCandidates) {
        if (selected.id !== rejected.id) addEdge('supersedes', selected.id, rejected.id, 'selected-over-rejected');
      }
    }
  }
}

function addAdaptiveFeedbackNodes(
  result: FrontierCodexCollectResult,
  runNodeId: string,
  graphRefs: RunGraphReferenceIndex,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): void {
  const feedback = result.tournamentAdaptiveFeedback;
  if (!feedback) return;
  const id = `rsi:adaptive:${feedback.id}`;
  addNode({
    id,
    kind: 'rsi',
    label: feedback.id,
    generatedAt: feedback.generatedAt,
    refs: graphNodeRefs({}, {
      ...(feedback.tournamentId ? { tournament: `rsi:tournament:${feedback.tournamentId}` } : {}),
      ...(feedback.historyId ? { history: `rsi:history:${feedback.historyId}` } : {})
    }),
    data: { summary: feedback.summary, tournamentId: feedback.tournamentId, historyId: feedback.historyId }
  });
  addEdge('contains', runNodeId, id);
  if (feedback.tournamentId) addEdge('mergesInto', id, `rsi:tournament:${feedback.tournamentId}`);

  feedback.observations.forEach((observation, index) => {
    const refs = graphRefsFromUnknown(observation);
    const observationRecord = recordValue(observation as unknown) ?? {};
    const observationId = `feedback:adaptive-observation:${stableCodexRunGraphPart(`${feedback.id}:${stringFromUnknown(observationRecord.id) ?? index}:${JSON.stringify(observation)}`)}`;
    addNode({
      id: observationId,
      kind: 'feedback',
      label: stringFromUnknown(observation.reason) ?? stringFromUnknown(observation.kind) ?? `observation-${index + 1}`,
      jobId: refs.jobId,
      taskId: refs.taskId,
      lane: refs.lane,
      model: refs.model,
      computeId: refs.computeId,
      modelTier: refs.modelTier,
      status: stringFromUnknown(observation.severity),
      outcome: stringFromUnknown(observation.kind),
      generatedAt: observation.at ?? feedback.generatedAt,
      refs: graphNodeRefs(refs, { adaptive: id }),
      data: compactRecord({ observation, taskKind: refs.taskKind, workKind: refs.workKind })
    });
    addEdge('produces', id, observationId, stringFromUnknown(observation.kind));
    linkGraphNodeToAffectedRefs('verifies', observationId, refs, graphRefs, addEdge, stringFromUnknown(observation.kind));
  });

  feedback.recommendations.forEach((recommendation, index) => {
    const recommendationRecord = recordValue(recommendation as unknown) ?? {};
    const refs = graphRefsFromAdaptiveRecommendation(recommendationRecord);
    const recommendationKey = stringFromUnknown(recommendationRecord.id) ?? `${recommendation.action ?? 'recommendation'}:${recommendation.target ?? ''}:${recommendation.key ?? ''}:${index}`;
    const recommendationId = `decision:adaptive-recommendation:${stableCodexRunGraphPart(`${feedback.id}:${recommendationKey}`)}`;
    addNode({
      id: recommendationId,
      kind: 'decision',
      label: recommendation.reason ?? stringFromUnknown(recommendationRecord.id) ?? `recommendation-${index + 1}`,
      jobId: refs.jobId,
      taskId: refs.taskId,
      lane: refs.lane,
      model: refs.model,
      computeId: refs.computeId,
      modelTier: refs.modelTier,
      status: recommendation.action,
      outcome: recommendation.target,
      generatedAt: feedback.generatedAt,
      refs: graphNodeRefs(refs, { adaptive: id }),
      data: compactRecord({
        recommendation,
        key: recommendation.key,
        score: recommendation.score,
        taskKind: refs.taskKind,
        workKind: refs.workKind
      })
    });
    addEdge('produces', id, recommendationId, recommendation.action);
    linkGraphNodeToAffectedRefs('decides', recommendationId, refs, graphRefs, addEdge, recommendation.action);
  });
}

function addBundleRoutingDecisionNodes(
  bundle: FrontierCodexCollectedBundle['bundle'],
  jobNodeId: string,
  candidateNodeId: string,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): void {
  const metadata = recordValue(bundle.metadata);
  if (!metadata) return;
  const bundleRefs = graphRefsFromUnknown(bundle);
  const modelRoute = firstRecordAtPaths(metadata, [
    ['modelRoute'],
    ['routing', 'modelRoute'],
    ['modelRouting', 'route'],
    ['route']
  ]);
  const routeNodeId = modelRoute
    ? addModelRouteDecisionNode(modelRoute, bundleRefs, jobNodeId, candidateNodeId, bundle.generatedAt, addNode, addEdge)
    : undefined;
  const panel = firstRecord([
    modelRoute ? recordValue(modelRoute.panel) : undefined,
    firstRecordAtPaths(metadata, [['panel'], ['panelEvaluation'], ['modelRouting', 'panel'], ['routing', 'panel']])
  ]);
  const panelNodeId = panel
    ? addPanelDecisionNode(panel, bundleRefs, routeNodeId ?? jobNodeId, candidateNodeId, bundle.generatedAt, addNode, addEdge)
    : undefined;
  const fuserComputeId = stringValueAtPaths(modelRoute ?? {}, [['fuserComputeId'], ['fuser', 'computeId']])
    ?? stringValueAtPaths(panel ?? {}, [['fuserComputeId'], ['fuser', 'computeId']])
    ?? stringValueAtPaths(metadata, [['fusionDecision', 'fuserComputeId'], ['fusion', 'fuserComputeId']]);
  if (fuserComputeId) {
    addFusionDecisionNode(
      { fuserComputeId, route: stringFromUnknown(modelRoute?.route), panelId: stringFromUnknown(panel?.id) },
      bundleRefs,
      panelNodeId ?? routeNodeId ?? jobNodeId,
      routeNodeId ?? panelNodeId,
      candidateNodeId,
      bundle.generatedAt,
      addNode,
      addEdge
    );
  }

  for (const feedback of modelRoutingFeedbackRecords(metadata)) {
    const refs = { ...bundleRefs, ...graphRefsFromUnknown(feedback) };
    const feedbackId = `feedback:model-routing:${stableCodexRunGraphPart(stringFromUnknown(feedback.id) ?? `${bundle.jobId}:${JSON.stringify(feedback)}`)}`;
    addNode({
      id: feedbackId,
      kind: 'feedback',
      label: stringFromUnknown(feedback.resultStatus) ?? stringFromUnknown(feedback.id) ?? 'model-routing-feedback',
      jobId: refs.jobId,
      taskId: refs.taskId,
      lane: refs.lane,
      model: refs.model,
      computeId: refs.computeId,
      modelTier: refs.modelTier,
      status: stringFromUnknown(feedback.resultStatus),
      outcome: stringFromUnknown(feedback.mergeDisposition),
      generatedAt: numberFromUnknown(feedback.generatedAt) ?? bundle.generatedAt,
      refs: graphNodeRefs(refs, { ...(routeNodeId ? { route: routeNodeId } : {}) }),
      data: compactRecord({ feedback, taskKind: refs.taskKind, workKind: refs.workKind })
    });
    addEdge('produces', jobNodeId, feedbackId);
    addEdge('verifies', feedbackId, candidateNodeId, stringFromUnknown(feedback.resultStatus));
    if (routeNodeId) addEdge('mergesInto', feedbackId, routeNodeId);
  }
}

function addModelRouteDecisionNode(
  route: Record<string, unknown>,
  fallbackRefs: GraphProjectionRefs,
  jobNodeId: string,
  candidateNodeId: string,
  generatedAt: number,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): string {
  const refs = {
    ...fallbackRefs,
    computeId: stringFromUnknown(route.selectedComputeId)
      ?? stringFromUnknown(route.recommendedComputeId)
      ?? stringArray(route.recommendedComputeIds)[0]
      ?? fallbackRefs.computeId
  };
  const routeId = `decision:model-route:${fallbackRefs.jobId ?? 'job'}:${stableCodexRunGraphPart(stringFromUnknown(route.id) ?? JSON.stringify(route))}`;
  addNode({
    id: routeId,
    kind: 'decision',
    label: stringFromUnknown(route.route) ?? stringFromUnknown(route.id) ?? 'model-route',
    jobId: refs.jobId,
    taskId: refs.taskId,
    lane: refs.lane,
    model: refs.model,
    computeId: refs.computeId,
    modelTier: refs.modelTier,
    status: stringFromUnknown(route.mode),
    outcome: stringFromUnknown(route.route),
    generatedAt,
    refs: graphNodeRefs(refs),
    data: compactRecord({
      route: route.route,
      mode: route.mode,
      fallbackComputeId: route.fallbackComputeId,
      selectedComputeId: route.selectedComputeId,
      recommendedComputeIds: route.recommendedComputeIds,
      summary: route.summary,
      reasons: route.reasons
    })
  });
  addEdge('produces', jobNodeId, routeId, stringFromUnknown(route.route));
  addEdge('decides', routeId, candidateNodeId, stringFromUnknown(route.route));
  return routeId;
}

function addPanelDecisionNode(
  panel: Record<string, unknown>,
  fallbackRefs: GraphProjectionRefs,
  parentNodeId: string,
  candidateNodeId: string,
  generatedAt: number,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): string {
  const panelId = `decision:panel:${fallbackRefs.jobId ?? 'job'}:${stableCodexRunGraphPart(stringFromUnknown(panel.id) ?? JSON.stringify(panel))}`;
  const refs = {
    ...fallbackRefs,
    computeId: stringFromUnknown(panel.fuserComputeId) ?? fallbackRefs.computeId
  };
  addNode({
    id: panelId,
    kind: 'decision',
    label: stringFromUnknown(panel.strategy) ?? stringFromUnknown(panel.id) ?? 'panel',
    jobId: refs.jobId,
    taskId: refs.taskId,
    lane: refs.lane,
    model: refs.model,
    computeId: refs.computeId,
    modelTier: refs.modelTier,
    status: booleanFromUnknown(panel.recommended) === false ? 'observed' : 'recommended',
    outcome: stringFromUnknown(panel.strategy),
    generatedAt,
    refs: graphNodeRefs(refs),
    data: compactRecord({
      strategy: panel.strategy,
      memberComputeIds: panel.memberComputeIds,
      fuserComputeId: panel.fuserComputeId,
      summary: panel.summary,
      reasons: panel.reasons
    })
  });
  addEdge('produces', parentNodeId, panelId, stringFromUnknown(panel.strategy));
  addEdge('decides', panelId, candidateNodeId, stringFromUnknown(panel.strategy));
  addEdge('mergesInto', panelId, parentNodeId);
  return panelId;
}

function addFusionDecisionNode(
  fusion: { fuserComputeId: string; route?: string; panelId?: string },
  fallbackRefs: GraphProjectionRefs,
  parentNodeId: string,
  routeNodeId: string | undefined,
  candidateNodeId: string,
  generatedAt: number,
  addNode: AddRunGraphNode,
  addEdge: AddRunGraphEdge
): string {
  const fusionNodeId = `decision:fusion:${fallbackRefs.jobId ?? 'job'}:${stableCodexRunGraphPart(fusion.fuserComputeId)}`;
  const refs = { ...fallbackRefs, computeId: fusion.fuserComputeId };
  addNode({
    id: fusionNodeId,
    kind: 'decision',
    label: fusion.fuserComputeId,
    jobId: refs.jobId,
    taskId: refs.taskId,
    lane: refs.lane,
    model: refs.model,
    computeId: refs.computeId,
    modelTier: refs.modelTier,
    status: 'fusion',
    outcome: fusion.route,
    generatedAt,
    refs: graphNodeRefs(refs, { ...(fusion.panelId ? { panel: fusion.panelId } : {}) }),
    data: compactRecord({ fuserComputeId: fusion.fuserComputeId, route: fusion.route })
  });
  addEdge('produces', parentNodeId, fusionNodeId, 'fusion');
  addEdge('decides', fusionNodeId, candidateNodeId, 'fusion');
  if (routeNodeId) addEdge('mergesInto', fusionNodeId, routeNodeId);
  return fusionNodeId;
}

function createRunGraphReferenceIndex(result: FrontierCodexCollectResult): RunGraphReferenceIndex {
  const jobIds = new Set<string>();
  const taskIds = new Set<string>();
  const jobIdsByLane = new Map<string, string[]>();
  const taskIdsByLane = new Map<string, string[]>();
  for (const entries of Object.values(result.buckets)) {
    for (const entry of entries) {
      const { bundle } = entry;
      jobIds.add(bundle.jobId);
      if (bundle.taskId) taskIds.add(bundle.taskId);
      if (bundle.lane) {
        pushUniqueMapValue(jobIdsByLane, bundle.lane, bundle.jobId);
        if (bundle.taskId) pushUniqueMapValue(taskIdsByLane, bundle.lane, bundle.taskId);
      }
    }
  }
  return { jobIds, taskIds, jobIdsByLane, taskIdsByLane };
}

function pushUniqueMapValue(map: Map<string, string[]>, key: string, value: string): void {
  const next = map.get(key) ?? [];
  if (!next.includes(value)) next.push(value);
  map.set(key, next);
}

function linkGraphNodeToAffectedRefs(
  kind: FrontierCodexRunGraphEdgeKind,
  from: string,
  refs: GraphProjectionRefs,
  graphRefs: RunGraphReferenceIndex,
  addEdge: AddRunGraphEdge,
  label?: string
): void {
  const targets = new Set<string>();
  if (refs.jobId && graphRefs.jobIds.has(refs.jobId)) {
    targets.add(`job:${refs.jobId}`);
    targets.add(`candidate:${refs.jobId}`);
  }
  if (refs.taskId && graphRefs.taskIds.has(refs.taskId)) targets.add(`task:${refs.taskId}`);
  if (targets.size === 0 && refs.lane) {
    for (const jobId of graphRefs.jobIdsByLane.get(refs.lane) ?? []) {
      targets.add(`job:${jobId}`);
      targets.add(`candidate:${jobId}`);
    }
    for (const taskId of graphRefs.taskIdsByLane.get(refs.lane) ?? []) targets.add(`task:${taskId}`);
  }
  for (const target of targets) addEdge(kind, from, target, label);
}

function graphRefsFromAdaptiveRecommendation(recommendation: { target?: string; key?: string; model?: string; computeId?: string; metadata?: unknown }): GraphProjectionRefs {
  const metadata = recordValue(recommendation.metadata);
  const refs = graphRefsFromUnknown({ ...recommendation, ...(metadata ? { metadata } : {}) });
  const target = recommendation.target?.trim().toLowerCase();
  return {
    ...refs,
    lane: refs.lane ?? (target && ['lane', 'max-ready-jobs', 'concurrency'].includes(target) ? recommendation.key : undefined),
    model: refs.model ?? recommendation.model,
    computeId: refs.computeId ?? recommendation.computeId
  };
}

function graphRefsFromUnknown(value: unknown): GraphProjectionRefs {
  const record = recordValue(value) ?? {};
  const metadata = recordValue(record.metadata) ?? {};
  const bundle = recordValue(record.bundle) ?? {};
  const routing = firstRecord([recordValue(record.routing), recordValue(metadata.routing)]);
  const routingKey = firstRecord([recordValue(record.routingKey), recordValue(metadata.routingKey)]);
  const task = firstRecord([recordValue(record.task), recordValue(metadata.task), recordValue(bundle.task)]);
  const compute = firstRecord([recordValue(record.compute), recordValue(metadata.compute), recordValue(recordValue(record.job)?.compute), recordValue(recordValue(metadata.job)?.compute)]);
  const tournamentStrategy = firstRecord([recordValue(record.tournamentStrategy), recordValue(metadata.tournamentStrategy), recordValue(recordValue(bundle.metadata)?.tournamentStrategy)]);
  const tournamentRoutingKey = recordValue(tournamentStrategy?.routingKey);
  return {
    jobId: firstString([
      record.jobId,
      bundle.jobId,
      metadata.jobId,
      recordValue(metadata.job)?.id,
      recordValue(metadata.source)?.jobId
    ]),
    taskId: firstString([
      record.taskId,
      bundle.taskId,
      metadata.taskId,
      task?.id,
      recordValue(metadata.source)?.taskId
    ]),
    lane: firstString([
      record.lane,
      bundle.lane,
      metadata.lane,
      routingKey?.lane,
      routing?.lane,
      task?.lane,
      tournamentStrategy?.lane,
      tournamentRoutingKey?.lane
    ]),
    model: firstString([
      record.model,
      metadata.model,
      compute?.model,
      tournamentStrategy?.model
    ]),
    computeId: firstString([
      record.computeId,
      metadata.computeId,
      compute?.id,
      recordValue(metadata.resourceAllocation)?.env && recordValue(recordValue(metadata.resourceAllocation)?.env)?.FRONTIER_SWARM_COMPUTE_ID
    ]),
    modelTier: firstString([
      record.modelTier,
      metadata.modelTier,
      metadata.tier,
      routingKey?.modelTier,
      routing?.modelTier,
      compute?.modelTier,
      compute?.tier,
      tournamentStrategy?.modelTier,
      tournamentRoutingKey?.modelTier
    ]),
    taskKind: firstString([
      record.taskKind,
      metadata.taskKind,
      routingKey?.taskKind,
      routing?.taskKind,
      task?.kind,
      tournamentStrategy?.taskKind,
      tournamentRoutingKey?.taskKind
    ]),
    workKind: firstString([
      record.workKind,
      metadata.workKind,
      routingKey?.workKind,
      routing?.workKind,
      task?.workKind,
      tournamentStrategy?.workKind,
      tournamentRoutingKey?.workKind
    ])
  };
}

function graphNodeRefs(refs: GraphProjectionRefs, extra: Record<string, string | undefined> = {}): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  if (refs.jobId) {
    out.job = `job:${refs.jobId}`;
    out.candidate = `candidate:${refs.jobId}`;
  }
  if (refs.taskId) out.task = `task:${refs.taskId}`;
  if (refs.lane) out.lane = refs.lane;
  if (refs.model) out.model = refs.model;
  if (refs.computeId) out.compute = refs.computeId;
  if (refs.modelTier) out.modelTier = refs.modelTier;
  for (const [key, value] of Object.entries(extra)) {
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function tournamentCandidateGraphId(record: Record<string, unknown>, refs: GraphProjectionRefs): string {
  return stringFromUnknown(record.id)
    ?? stringFromUnknown(record.candidateId)
    ?? stringFromUnknown(record.strategyId)
    ?? refs.jobId
    ?? String(hashCodexRunGraphString(JSON.stringify(record)));
}

function tournamentCandidateOutcome(record: Record<string, unknown>): string | undefined {
  return firstString([record.outcome, record.disposition, record.status]);
}

function isSelectedTournamentCandidate(
  record: Record<string, unknown>,
  winnerId: string | undefined,
  refs: GraphProjectionRefs
): boolean {
  const status = tournamentCandidateOutcome(record)?.toLowerCase();
  if (booleanFromUnknown(record.selected) === true || status === 'selected' || status === 'winner') return true;
  if (!winnerId) return false;
  return [
    stringFromUnknown(record.id),
    stringFromUnknown(record.strategyId),
    stringFromUnknown(record.candidateId),
    refs.jobId,
    refs.lane
  ].includes(winnerId);
}

function isRejectedTournamentCandidate(record: Record<string, unknown>): boolean {
  const outcome = tournamentCandidateOutcome(record)?.toLowerCase();
  return ['rejected', 'blocked', 'failed', 'declined', 'superseded'].includes(outcome ?? '');
}

function modelRoutingFeedbackRecords(metadata: Record<string, unknown>): Record<string, unknown>[] {
  return uniqueRecords([
    ...recordsFromUnknown(metadata.modelRoutingFeedback),
    ...recordsFromUnknown(metadata.routingFeedback),
    ...recordsFromUnknown(recordValue(metadata.routingPolicy)?.feedback),
    ...recordsFromUnknown(recordValue(metadata.modelRoutingPolicy)?.feedback)
  ]);
}

function uniqueRecords(records: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const record of records) {
    const key = stringFromUnknown(record.id) ?? JSON.stringify(record);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}

function recordsFromUnknown(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(recordValue).filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const record = recordValue(value);
  return record ? [record] : [];
}

function firstRecordAtPaths(record: Record<string, unknown>, paths: readonly (readonly string[])[]): Record<string, unknown> | undefined {
  for (const pathParts of paths) {
    let cursor: unknown = record;
    for (const part of pathParts) cursor = recordValue(cursor)?.[part];
    const found = recordValue(cursor);
    if (found) return found;
  }
  return undefined;
}

function stringValueAtPaths(record: Record<string, unknown>, paths: readonly (readonly string[])[]): string | undefined {
  for (const pathParts of paths) {
    let cursor: unknown = record;
    for (const part of pathParts) cursor = recordValue(cursor)?.[part];
    const found = stringFromUnknown(cursor);
    if (found) return found;
  }
  return undefined;
}

function firstRecord(records: readonly (Record<string, unknown> | undefined)[]): Record<string, unknown> | undefined {
  return records.find((entry): entry is Record<string, unknown> => Boolean(entry));
}

function firstString(values: readonly unknown[]): string | undefined {
  for (const value of values) {
    const found = stringFromUnknown(value);
    if (found) return found;
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : [];
}

function stringValues(value: unknown): string[] {
  const single = stringFromUnknown(value);
  if (single) return [single];
  return stringArray(value);
}

function uniqueRunGraphStrings(values: readonly (string | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = stringFromUnknown(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberFromUnknown(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanFromUnknown(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}
