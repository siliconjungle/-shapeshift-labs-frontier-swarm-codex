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
import { semanticImportSummaryFromBundle, summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { codexBundleTraceSummary } from './trace-summary.js';
import { contextBudgetFromBundle } from './context-budget.js';


export async function copyOrWriteCollectedEvidenceSummary(input: {
  file: string;
  bundle: FrontierSwarmMergeBundle;
  bucket: FrontierCodexCollectBucket;
  mergePath: string;
  patchPath?: string;
  patchStatus: string;
  staleReasons?: readonly string[];
  semanticImportExpected?: boolean;
}): Promise<void> {
  const existing = input.bundle.evidencePaths.find((entry) => path.basename(entry) === 'evidence.json' && entry !== input.file);
  const traceSummary = codexBundleTraceSummary(input.bundle);
  const semanticImport = semanticImportSummaryFromBundle(input.bundle);
  const semanticImportQuality = summarizeCodexSemanticImportQuality(semanticImport, input.semanticImportExpected ?? false);
  const contextBudget = contextBudgetFromBundle(input.bundle);
  await fs.mkdir(path.dirname(input.file), { recursive: true });
  if (existing && await pathExists(existing)) {
    await fs.copyFile(existing, input.file).catch(() => {});
    if (await pathExists(input.file)) {
      await augmentCollectedEvidenceSummary(input.file, {
        semanticImport,
        semanticImportQuality,
        contextBudget,
        traceSummary: traceSummary.shardCount ? traceSummary : undefined
      });
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
    ...(semanticImport ? { semanticImport: semanticImport as FrontierCodexSemanticImportSidecar['summary'] } : {}),
    semanticImportQuality,
    ...(contextBudget ? { contextBudget } : {}),
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


async function augmentCollectedEvidenceSummary(
  file: string,
  input: {
    semanticImport?: unknown;
    semanticImportQuality: ReturnType<typeof summarizeCodexSemanticImportQuality>;
    contextBudget?: FrontierCodexJobEvidenceSummary['contextBudget'];
    traceSummary?: FrontierCodexTraceSummary;
  }
): Promise<void> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!isObject(parsed)) return;
    if (input.semanticImport) parsed.semanticImport = input.semanticImport;
    parsed.semanticImportQuality = input.semanticImportQuality;
    if (input.contextBudget) parsed.contextBudget = input.contextBudget;
    if (input.traceSummary) parsed.traceSummary = input.traceSummary;
    parsed.metadata = {
      ...(isObject(parsed.metadata) ? parsed.metadata : {}),
      semanticImportQuality: input.semanticImportQuality,
      ...(input.contextBudget ? { contextBudget: input.contextBudget } : {})
    };
    await fs.writeFile(file, JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    // Keep collection best-effort when a worker evidence file is not JSON.
  }
}


export function createCollectedEvidenceEntries(
  bundle: FrontierSwarmMergeBundle,
  collectedEvidencePath: string,
  bucket: FrontierCodexCollectBucket,
  semanticImportExpected = false
): FrontierSwarmEvidenceIndexEntryInput[] {
  const confidence = bucket === 'ready-to-apply' ? 0.95 : bucket === 'needs-human-port' ? 0.7 : bucket === 'failed-evidence' ? 0.25 : 0.2;
  const semanticImport = semanticImportSummaryFromBundle(bundle);
  const semanticImportQuality = summarizeCodexSemanticImportQuality(semanticImport, semanticImportExpected);
  const universalAstLayers = semanticImportUniversalAstLayerSummary(semanticImport);
  const traceSummary = codexBundleTraceSummary(bundle);
  const contextBudget = contextBudgetFromBundle(bundle);
  const entries: FrontierSwarmEvidenceIndexEntryInput[] = [{
    jobId: bundle.jobId,
    queueItemId: bundle.queueItemIds[0],
    lane: bundle.lane,
    topic: 'merge-admission',
    path: collectedEvidencePath,
    kind: 'evidence',
    status: bucket,
    confidence,
    tags: uniqueStrings([
      'coordinator-query',
      bucket,
      ...(semanticImportQuality.expected && !semanticImportQuality.expectedSatisfied ? ['semantic-expected-unsatisfied'] : []),
      ...(semanticImportQuality.empty ? ['semantic-empty'] : []),
      ...(semanticImportQuality.warnings.length ? ['semantic-warning'] : []),
      ...(contextBudget?.warnings.length ? ['context-budget-warning'] : []),
      ...(contextBudget?.errors.length ? ['context-budget-failed'] : [])
    ]),
    facets: {
      bucket,
      disposition: bundle.disposition,
      riskLevel: bundle.riskLevel,
      autoMergeable: bundle.autoMergeable,
      staleAgainstHead: bundle.staleAgainstHead,
      semanticExpected: semanticImportQuality.expected,
      semanticExpectedSatisfied: semanticImportQuality.expectedSatisfied,
      semanticExpectedMissingReasonCodes: semanticImportQuality.expectedMissingReasonCodes.join(','),
      semanticPresent: semanticImportQuality.present,
      semanticEmpty: semanticImportQuality.empty,
      semanticTotal: semanticImportQuality.total,
      semanticCandidates: semanticImportQuality.candidates,
      semanticSelected: semanticImportQuality.selected,
      semanticEligible: semanticImportQuality.eligible,
      semanticImported: semanticImportQuality.imported,
      semanticErrors: semanticImportQuality.errors,
      semanticSymbols: semanticImportQuality.symbols,
      semanticRegions: semanticImportQuality.ownershipRegions,
      semanticPatchHints: semanticImportQuality.patchHints,
      semanticFacts: semanticImportQuality.semanticFacts,
      semanticFactPredicates: semanticImportQuality.semanticFactPredicates.join(','),
      semanticWarnings: semanticImportQuality.warnings.join(','),
      semanticWarningCount: semanticImportQuality.warnings.length,
      semanticDependencyRelations: semanticImportQuality.dependencyRelations,
      semanticDependencyPredicates: semanticImportQuality.dependencyPredicates.join(','),
      universalAstLayers: universalAstLayers.total,
      universalAstLayerNames: universalAstLayers.names.join(','),
      proofSpecObligations: semanticImportProofSpecSummary(semanticImport).obligations,
      proofSpecFailedObligations: semanticImportProofSpecSummary(semanticImport).failed,
      paradigmSemanticsRecords: semanticImportParadigmSemanticsSummary(semanticImport).total,
      paradigmSemanticsGroups: semanticImportParadigmSemanticsSummary(semanticImport).groups.length,
      paradigmSemanticsLoweringRecords: semanticImportParadigmSemanticsSummary(semanticImport).loweringRecords,
      semanticLineageEvents: semanticImportQuality.semanticLineageEvents,
      semanticLineageMoved: semanticImportQuality.semanticLineageMoved,
      semanticLineageRenamed: semanticImportQuality.semanticLineageRenamed,
      semanticLineageDeleted: semanticImportQuality.semanticLineageDeleted,
      semanticLineageAmbiguous: semanticImportQuality.semanticLineageAmbiguous,
      semanticLineageBlocked: semanticImportQuality.semanticLineageBlocked,
      semanticLineageNeedsReview: semanticImportQuality.semanticLineageNeedsReview,
      semanticLineageEventKinds: semanticImportQuality.semanticLineageEventKinds.join(','),
      semanticLineageReasonCodes: semanticImportQuality.semanticLineageReasonCodes.join(','),
      traceShards: traceSummary.shardCount,
      traceDivergences: traceSummary.divergenceCount,
      traceOpenDivergences: traceSummary.openDivergenceCount,
      traceRowWindows: traceSummary.rowWindowCount,
      traceHypotheses: traceSummary.hypothesisCount,
      traceExecutableOwnershipRegions: traceSummary.executableOwnershipRegionCount,
      traceFocusedTests: traceSummary.focusedTestCount,
      traceReferenceEvidence: traceSummary.referenceEvidenceCount,
      contextBudgetStatus: contextBudget?.status ?? 'unknown',
      contextBudgetWarnings: contextBudget?.warnings.join(',') ?? '',
      contextBudgetErrors: contextBudget?.errors.join(',') ?? '',
      contextBudgetPromptBytes: contextBudget?.measured.promptBytes ?? 0,
      contextBudgetEstimatedInputTokens: contextBudget?.measured.estimatedInputTokens ?? 0,
      contextBudgetActualInputTokens: contextBudget?.usage?.inputTokens ?? 0
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
