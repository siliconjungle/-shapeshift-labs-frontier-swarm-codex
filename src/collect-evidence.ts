import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmEvidenceIndexEntryInput, FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_JOB_EVIDENCE_KIND, FRONTIER_SWARM_CODEX_JOB_EVIDENCE_VERSION } from './constants.js';
import type { FrontierCodexCollectBucket, FrontierCodexJobEvidenceSummary, FrontierCodexSemanticImportSidecar, FrontierCodexTraceSummary } from './index.js';
import { isObject, pathExists, uniqueStrings } from './common.js';
import { readPatchHunks, createCodexEvidenceSourceCitations } from './codex-evidence.js';
import { classifyCodexHandoffArtifact } from './handoff-artifacts.js';
import { semanticImportParadigmSemanticsSummary } from './semantic-import-paradigm.js';
import { semanticImportUniversalAstLayerSummary } from './semantic-import-layers.js';
import { semanticImportProofSpecSummary } from './semantic-import-proof.js';
import { codexBundleTraceSummary } from './trace-summary.js';


export async function copyOrWriteCollectedEvidenceSummary(input: {
  file: string;
  bundle: FrontierSwarmMergeBundle;
  bucket: FrontierCodexCollectBucket;
  mergePath: string;
  patchPath?: string;
  patchStatus: string;
  staleReasons?: readonly string[];
}): Promise<void> {
  const existing = input.bundle.evidencePaths.find((entry) => path.basename(entry) === 'evidence.json' && entry !== input.file);
  const traceSummary = codexBundleTraceSummary(input.bundle);
  await fs.mkdir(path.dirname(input.file), { recursive: true });
  if (existing && await pathExists(existing)) {
    await fs.copyFile(existing, input.file).catch(() => {});
    if (await pathExists(input.file)) {
      if (traceSummary.shardCount) await augmentCollectedEvidenceTraceSummary(input.file, traceSummary);
      return;
    }
  }
  const patchHunks = input.patchPath ? await readPatchHunks(input.patchPath) : [];
  const evidence: FrontierCodexJobEvidenceSummary = {
    kind: FRONTIER_SWARM_CODEX_JOB_EVIDENCE_KIND,
    version: FRONTIER_SWARM_CODEX_JOB_EVIDENCE_VERSION,
    generatedAt: Date.now(),
    jobId: input.bundle.jobId,
    taskId: input.bundle.taskId ?? input.bundle.jobId,
    lane: input.bundle.lane ?? 'unknown',
    status: input.bundle.status,
    mergeReadiness: input.bundle.mergeReadiness,
    disposition: input.bundle.disposition,
    riskLevel: input.bundle.riskLevel,
    changedPaths: [...input.bundle.changedPaths],
    changedRegions: [...input.bundle.changedRegions],
    ownershipViolations: [...input.bundle.ownershipViolations],
    ...(input.patchPath ? { patchPath: input.patchPath } : {}),
    mergeBundlePath: input.mergePath,
    evidencePaths: uniqueStrings(input.bundle.evidencePaths),
    handoffArtifacts: input.bundle.evidencePaths.map((entry) => ({ path: entry, kind: classifyCodexHandoffArtifact(entry) ?? 'evidence' })),
    commands: {
      passed: input.bundle.commandsPassed.map((command) => ({ name: command.name, command: [...command.command], ...(command.status !== undefined ? { status: command.status } : {}) })),
      failed: input.bundle.commandsFailed.map((command) => ({ name: command.name, command: [...command.command], ...(command.status !== undefined ? { status: command.status } : {}) }))
    },
    patchHunks,
    readyToPortHunkCount: input.bucket === 'needs-human-port' || input.bucket === 'ready-to-apply' ? patchHunks.length : 0,
    ...(input.bundle.semanticImport ? { semanticImport: input.bundle.semanticImport as FrontierCodexSemanticImportSidecar['summary'] } : {}),
    ...(traceSummary.shardCount ? { traceSummary } : {}),
    sourceCitations: createCodexEvidenceSourceCitations(input.bundle),
    metadata: {
      bucket: input.bucket,
      patchStatus: input.patchStatus,
      staleReasons: input.staleReasons ?? [],
      autoMergeable: input.bundle.autoMergeable,
      staleAgainstHead: input.bundle.staleAgainstHead,
      reasons: input.bundle.reasons
    }
  };
  await fs.writeFile(input.file, JSON.stringify(evidence, null, 2) + '\n');
}


async function augmentCollectedEvidenceTraceSummary(file: string, traceSummary: FrontierCodexTraceSummary): Promise<void> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!isObject(parsed)) return;
    parsed.traceSummary = traceSummary;
    await fs.writeFile(file, JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    // Keep collection best-effort when a worker evidence file is not JSON.
  }
}


export function createCollectedEvidenceEntries(
  bundle: FrontierSwarmMergeBundle,
  collectedEvidencePath: string,
  bucket: FrontierCodexCollectBucket
): FrontierSwarmEvidenceIndexEntryInput[] {
  const confidence = bucket === 'ready-to-apply' ? 0.95 : bucket === 'needs-human-port' ? 0.7 : bucket === 'failed-evidence' ? 0.25 : 0.2;
  const universalAstLayers = semanticImportUniversalAstLayerSummary(bundle.semanticImport);
  const traceSummary = codexBundleTraceSummary(bundle);
  const entries: FrontierSwarmEvidenceIndexEntryInput[] = [{
    jobId: bundle.jobId,
    queueItemId: bundle.queueItemIds[0],
    lane: bundle.lane,
    topic: 'merge-admission',
    path: collectedEvidencePath,
    kind: 'evidence',
    status: bucket,
    confidence,
    tags: ['coordinator-query', bucket],
    facets: {
      bucket,
      disposition: bundle.disposition,
      riskLevel: bundle.riskLevel,
      autoMergeable: bundle.autoMergeable,
      staleAgainstHead: bundle.staleAgainstHead,
      semanticSymbols: bundle.semanticImport?.semanticIndex.symbols ?? 0,
      semanticRegions: bundle.semanticImport?.semanticSidecars.ownershipRegions ?? 0,
      universalAstLayers: universalAstLayers.total,
      universalAstLayerNames: universalAstLayers.names.join(','),
      proofSpecObligations: semanticImportProofSpecSummary(bundle.semanticImport).obligations,
      proofSpecFailedObligations: semanticImportProofSpecSummary(bundle.semanticImport).failed,
      paradigmSemanticsRecords: semanticImportParadigmSemanticsSummary(bundle.semanticImport).total,
      paradigmSemanticsGroups: semanticImportParadigmSemanticsSummary(bundle.semanticImport).groups.length,
      paradigmSemanticsLoweringRecords: semanticImportParadigmSemanticsSummary(bundle.semanticImport).loweringRecords,
      traceShards: traceSummary.shardCount,
      traceDivergences: traceSummary.divergenceCount,
      traceOpenDivergences: traceSummary.openDivergenceCount,
      traceRowWindows: traceSummary.rowWindowCount,
      traceHypotheses: traceSummary.hypothesisCount,
      traceExecutableOwnershipRegions: traceSummary.executableOwnershipRegionCount,
      traceFocusedTests: traceSummary.focusedTestCount,
      traceReferenceEvidence: traceSummary.referenceEvidenceCount
    }
  }];
  for (const file of bundle.evidencePaths) {
    if (file === collectedEvidencePath) continue;
    entries.push({
      jobId: bundle.jobId,
      queueItemId: bundle.queueItemIds[0],
      lane: bundle.lane,
      topic: path.basename(file),
      path: file,
      kind: classifyCodexHandoffArtifact(file) ?? 'evidence',
      status: bucket,
      confidence,
      tags: [bucket],
      facets: { bucket, disposition: bundle.disposition }
    });
  }
  return entries;
}
