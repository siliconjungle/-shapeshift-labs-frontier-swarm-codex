import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createSwarmCoordinatorDashboard,
  createSwarmEvidenceIndex,
  createSwarmMergeAdmission,
  createSwarmMergeIndex,
  createSwarmMergeTournament,
  createSwarmStrategyTournamentHistory,
  createSwarmTournamentAdaptiveFeedback,
  createSwarmQueueOverlay,
  type FrontierSwarmEvidenceIndexEntryInput,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmPatchStatus
} from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexCollectBucket, FrontierCodexCollectInput, FrontierCodexCollectResult } from './index.js';
import {
  findFilesByName,
  isObject,
  pathExists,
  pathHasIgnoredSegment,
  slug,
  uniqueStrings
} from './common.js';
import { createCodexCompactDashboard } from './dashboard.js';
import {
  bundlePatchStaleness,
  classifyCodexCollectBucket,
  classifyCodexSemanticCollectAdmission,
  collectFailureReasonClasses,
  mergeRecordScore,
  normalizeCollectedDisposition,
  normalizeCollectedMergeBundle,
  normalizeCollectedStaleAgainstHead
} from './collect-bundles.js';
import { copyOrWriteCollectedEvidenceSummary, createCollectedEvidenceEntries } from './collect-evidence.js';
import { semanticImportSummaryFromBundle, summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { collectedQualitySignalsFromDashboard, enrichCollectedCoordinatorDashboard } from './collect-dashboard.js';
import { contextBudgetFromBundle } from './context-budget.js';
import { summarizeSemanticPatchBundleOverlaps } from './semantic-bundle-overlaps.js';
import { resolveOrSynthesizeCollectedPatch, type CodexCollectMergeRecord } from './collect-workspace-recovery.js';
import { collectWorkspaceOnlyMergeRecords } from './collect-workspace-only.js';
import { createCodexCollectionQueueOutcomeModel, createCodexCollectionTerminalState } from './collect-terminal-state.js';
import {
  attachApplyLedgerSummary,
  attachLandedHealthSummary,
  createLandedHealthSummary,
  readApplyLedgerSummary
} from './collect-landed.js';
import {
  attachCollectionNoiseBreakdown,
  createCollectionNoiseBreakdown,
  normalizeCollectedReasons
} from './collect-noise.js';
import { readCodexPidProcesses, resolveRunDirectory } from './collect-pids.js';
import { COLLECTED_OUTPUT_SEGMENTS, createEmptyCollectBuckets } from './collect-setup.js';
import { createCodexCollectResult, createCodexCollectSummary, persistCodexCollectResult } from './collect-finalize.js';
import { attachSemanticPatchBundleOverlaps } from './collect-overlaps.js';
import { attachRuntimeProjectionMetadata } from './collect-runtime-projections.js';
import { readCodexRuntimeProjectionArtifacts } from './runtime-projections.js';

export { readCodexPidProcesses } from './collect-pids.js';

export async function collectCodexSwarmRun(input: FrontierCodexCollectInput): Promise<FrontierCodexCollectResult> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const runDir = await resolveRunDirectory(input.run);
  const outDir = path.resolve(cwd, input.outDir ?? path.join(runDir, 'collected'));
  const buckets = createEmptyCollectBuckets();
  const collectedBundles: FrontierSwarmMergeBundle[] = [];
  const evidenceEntries: FrontierSwarmEvidenceIndexEntryInput[] = [];
  const patchStatuses: Record<string, FrontierSwarmPatchStatus> = {};
  const semanticImportExpected = input.semanticImportExpected ?? false;
  const semanticImportQualities = new Map<string, ReturnType<typeof summarizeCodexSemanticImportQuality>>();
  const contextBudgets = new Map<string, NonNullable<ReturnType<typeof contextBudgetFromBundle>>>();
  const processes = await readCodexPidProcesses(path.join(runDir, 'pids.json')).catch(() => []);
  const runtimeProjections = await readCodexRuntimeProjectionArtifacts(runDir);
  const mergePaths = (await findFilesByName(runDir, 'merge.json'))
    .filter((mergePath) => !pathHasIgnoredSegment(path.relative(runDir, mergePath), COLLECTED_OUTPUT_SEGMENTS));
  const mergeRecordsByJob = new Map<string, CodexCollectMergeRecord>();
  for (const mergePath of mergePaths.sort()) {
    const bundle = normalizeCollectedMergeBundle(JSON.parse(await fs.readFile(mergePath, 'utf8')), mergePath);
    const existing = mergeRecordsByJob.get(bundle.jobId);
    const next = { mergePath, bundle };
    if (!existing || mergeRecordScore(next) > mergeRecordScore(existing)) mergeRecordsByJob.set(bundle.jobId, next);
  }
  const workspaceOnlyRecords = await collectWorkspaceOnlyMergeRecords({
    runDir,
    cwd,
    outDir,
    ignoredCollectionSegments: COLLECTED_OUTPUT_SEGMENTS,
    existingJobIds: new Set(mergeRecordsByJob.keys()),
    generatedAt,
    pidManifestPath: path.join(runDir, 'pids.json')
  });
  for (const record of workspaceOnlyRecords) {
    if (!mergeRecordsByJob.has(record.bundle.jobId)) mergeRecordsByJob.set(record.bundle.jobId, record);
  }
  const mergeRecords = Array.from(mergeRecordsByJob.values()).sort((left, right) => left.bundle.jobId.localeCompare(right.bundle.jobId));
  let collectorGeneratedPatchCount = 0;
  for (const { mergePath, bundle, generatedByCollector: recordGeneratedByCollector } of mergeRecords) {
    const patchResolution = await resolveOrSynthesizeCollectedPatch({
      runDir,
      cwd,
      outDir,
      mergePath,
      bundle,
      generatedAt
    });
    const patchPath = patchResolution.patchPath;
    const patchExists = !!patchPath && await pathExists(patchPath);
    const patchHasContent = patchExists
      && !!patchPath
      && (await fs.readFile(patchPath, 'utf8').catch(() => '')).trim().length > 0;
    const staleness = input.checkStale === false
      ? {
          stale: false,
          patchStatus: patchExists ? 'unknown' : 'missing',
          reasons: ['stale check disabled'],
          reasonClasses: collectFailureReasonClasses(['stale check disabled'], patchExists ? 'unknown' : 'missing'),
          fresh: false
        }
      : await bundlePatchStaleness(patchResolution.bundle, mergePath, cwd);
    const staleAgainstHead = normalizeCollectedStaleAgainstHead(patchResolution.bundle, staleness, input.checkStale !== false);
    const semanticImport = semanticImportSummaryFromBundle(patchResolution.bundle);
    const semanticImportQuality = summarizeCodexSemanticImportQuality(semanticImport, semanticImportExpected);
    semanticImportQualities.set(patchResolution.bundle.jobId, semanticImportQuality);
    const semanticAdmission = classifyCodexSemanticCollectAdmission({
      ...patchResolution.bundle,
      staleAgainstHead,
      ...(patchExists && patchPath ? { patchPath } : {})
    }, {
      staleAgainstHead,
      hasActionablePatch: patchHasContent,
      semanticImportExpected,
      semanticImportQuality
    });
    const disposition = collectDispositionForSemanticAdmission(
      normalizeCollectedDisposition(patchResolution.bundle, staleAgainstHead, patchHasContent),
      semanticAdmission,
      patchHasContent
    );
    const classifiedBucket = classifyCodexCollectBucket({
      ...patchResolution.bundle,
      staleAgainstHead,
      disposition,
      ...(patchExists && patchPath ? { patchPath } : {})
    }, staleAgainstHead, patchHasContent);
    const bucket = collectBucketForSemanticAdmission(classifiedBucket, semanticAdmission, patchHasContent);
    const generatedByCollector = recordGeneratedByCollector || patchResolution.generatedByCollector;
    if (generatedByCollector && patchHasContent) collectorGeneratedPatchCount += 1;
    const branchName = input.branchPrefix ? `${input.branchPrefix}/${slug(patchResolution.bundle.jobId)}` : patchResolution.bundle.branchName;
    const outputDir = path.join(outDir, bucket, slug(patchResolution.bundle.jobId));
    const collectedEvidencePath = path.join(outputDir, 'evidence.json');
    const contextBudget = contextBudgetFromBundle(patchResolution.bundle);
    if (contextBudget) contextBudgets.set(patchResolution.bundle.jobId, contextBudget);
    const collectReasons = uniqueStrings([
      ...normalizeCollectedReasons(patchResolution.bundle.reasons, staleness.reasons, staleness.patchStatus, staleAgainstHead, patchResolution.bundle),
      ...semanticAdmission.reasons,
      ...(semanticAdmissionIsNoChange(semanticAdmission) ? ['no-source-changes', 'non-actionable-worker-output'] : [])
    ]);
    const collectReasonClasses = uniqueStrings([
      ...staleness.reasonClasses,
      ...collectFailureReasonClasses(collectReasons, staleness.patchStatus)
    ]);
    const nextBundle: FrontierSwarmMergeBundle = {
      ...patchResolution.bundle,
      ...(branchName ? { branchName } : {}),
      staleAgainstHead,
      disposition,
      autoMergeable: bucket === 'ready-to-apply' && (patchResolution.bundle.autoMergeable || semanticAdmission.autoMergeCandidate),
      reasons: collectReasons,
      ...(semanticImport ? { semanticImport } : {}),
      metadata: {
        ...(isObject(patchResolution.bundle.metadata) ? patchResolution.bundle.metadata : {}),
        collect: {
          patchStatus: staleness.patchStatus,
          staleReasons: staleness.reasons,
          reasonClasses: collectReasonClasses,
          semanticImportQuality
        }
      } as unknown as FrontierSwarmMergeBundle['metadata'],
      evidencePaths: uniqueStrings([...patchResolution.bundle.evidencePaths, collectedEvidencePath])
    };
    collectedBundles.push(nextBundle);
    patchStatuses[nextBundle.jobId] = staleness.patchStatus;
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'merge.json'), JSON.stringify(nextBundle, null, 2) + '\n');
    if (patchPath && await pathExists(patchPath)) await fs.copyFile(patchPath, path.join(outputDir, 'changes.patch')).catch(() => {});
    await copyOrWriteCollectedEvidenceSummary({
      file: collectedEvidencePath,
      bundle: nextBundle,
      bucket,
      mergePath,
      patchPath,
      patchStatus: patchStatuses[nextBundle.jobId],
      staleReasons: staleness.reasons,
      semanticImportExpected
    });
    evidenceEntries.push(...createCollectedEvidenceEntries(nextBundle, collectedEvidencePath, bucket, semanticImportExpected));
    buckets[bucket].push({
      bucket,
      jobId: patchResolution.bundle.jobId,
      mergePath,
      outputDir,
      ...(generatedByCollector ? { generatedByCollector: true } : {}),
      ...(generatedByCollector && patchPath ? { patchPath } : {}),
      bundle: nextBundle
    });
  }
  const mergeIndex = createSwarmMergeIndex({
    runId: path.basename(runDir),
    bundles: collectedBundles,
    patchStatuses
  });
  const strategyTournament = createSwarmMergeTournament({
    id: `codex-merge-tournament:${path.basename(runDir)}`,
    title: 'Codex Merge Admission Tournament',
    bundles: collectedBundles,
    mergeIndex,
    strategyMode: 'style',
    generatedAt
  });
  const strategyHistory = createSwarmStrategyTournamentHistory({
    id: `codex-strategy-history:${path.basename(runDir)}`,
    tournaments: [strategyTournament],
    generatedAt
  });
  const tournamentAdaptiveFeedback = createSwarmTournamentAdaptiveFeedback({
    tournament: strategyTournament,
    history: strategyHistory,
    generatedAt
  });
  const queueOverlay = createSwarmQueueOverlay({
    runId: path.basename(runDir),
    bundles: collectedBundles
  });
  const evidenceIndex = createSwarmEvidenceIndex({
    id: `codex-evidence-index:${path.basename(runDir)}`,
    entries: evidenceEntries,
    generatedAt
  });
  const admission = createSwarmMergeAdmission({
    index: mergeIndex,
    maxReady: Math.max(mergeIndex.summary.readyToApplyCount, 1),
    allowRisks: ['low', 'medium', 'unknown'],
    generatedAt
  });
  const dashboard = enrichCollectedCoordinatorDashboard(createSwarmCoordinatorDashboard({
    bundles: collectedBundles,
    mergeIndex,
    queueOverlay,
    evidenceIndex,
    admission,
    processes,
    generatedAt,
    metadata: { runDir, outDir }
  }), semanticImportQualities, semanticImportExpected, contextBudgets, collectedBundles);
  attachRuntimeProjectionMetadata(dashboard, runtimeProjections);
  const semanticPatchBundleOverlaps = await summarizeSemanticPatchBundleOverlaps(collectedBundles);
  const compactDashboard = createCodexCompactDashboard({
    runDir,
    dashboard,
    strategyTournament,
    semanticImportExpected,
    generatedAt
  });
  const applyLedgerSummary = await readApplyLedgerSummary(outDir);
  const landedHealth = applyLedgerSummary ? createLandedHealthSummary(applyLedgerSummary, buckets) : undefined;
  if (applyLedgerSummary) attachApplyLedgerSummary(dashboard, compactDashboard, applyLedgerSummary);
  attachSemanticPatchBundleOverlaps(dashboard, compactDashboard, semanticPatchBundleOverlaps);
  const queueOutcomeModel = createCodexCollectionQueueOutcomeModel({
    runId: path.basename(runDir),
    buckets,
    landedHealth,
    generatedAt
  });
  const terminalState = createCodexCollectionTerminalState({
    buckets,
    queueOutcomeModel,
    generatedAt
  });
  const summary = createCodexCollectSummary({
    mergeRecordCount: mergeRecords.length,
    buckets,
    collectorGeneratedPatchCount,
    applyLedgerSummary,
    landedHealth
  });
  const qualitySignals = collectedQualitySignalsFromDashboard(dashboard);
  const noiseBreakdown = createCollectionNoiseBreakdown(collectedBundles);
  attachCollectionNoiseBreakdown(dashboard, compactDashboard, qualitySignals, noiseBreakdown);
  if (landedHealth) attachLandedHealthSummary(dashboard, compactDashboard, qualitySignals, landedHealth);
  const result = createCodexCollectResult({
    runDir,
    outDir,
    generatedAt,
    buckets,
    mergeIndex,
    queueOverlay,
    strategyTournament,
    strategyHistory,
    tournamentAdaptiveFeedback,
    evidenceIndex,
    admission,
    dashboard,
    compactDashboard,
    queueOutcomeModel,
    terminalState,
    semanticImport: compactDashboard.semanticImport,
    semanticEditAdmission: compactDashboard.semanticEditAdmission,
    semanticEditScriptAdmission: compactDashboard.semanticEditScriptAdmission,
    semanticPatchBundleOverlaps,
    qualitySignals,
    noiseBreakdown,
    ...(landedHealth ? { landedHealth } : {}),
    metadata: {
      runtimeProjectionPaths: runtimeProjections.paths,
      ...(runtimeProjections.modelTelemetrySummary ? { modelTelemetrySummary: runtimeProjections.modelTelemetrySummary } : {}),
      ...(runtimeProjections.humanActionState ? { humanActionState: runtimeProjections.humanActionState } : {})
    },
    summary
  });
  return persistCodexCollectResult({
    result,
    artifactStoreMode: input.artifactStoreMode,
    artifactStoreTimeoutMs: input.artifactStoreTimeoutMs
  });
}

function collectBucketForSemanticAdmission(bucket: FrontierCodexCollectBucket, admission: ReturnType<typeof classifyCodexSemanticCollectAdmission>, hasActionablePatch: boolean): FrontierCodexCollectBucket {
  if (bucket === 'research-complete') return bucket;
  if (admission.status === 'fail' || semanticAdmissionIsNoChange(admission)) return 'failed-evidence';
  if (bucket === 'rerun-work' || bucket === 'failed-evidence' || bucket === 'stale-against-head') return bucket;
  if (admission.status === 'ready' && hasActionablePatch) return 'ready-to-apply';
  if (admission.status === 'rerun') return 'rerun-work';
  if (admission.status === 'review') return 'needs-human-port';
  return bucket;
}

function collectDispositionForSemanticAdmission(
  disposition: FrontierSwarmMergeBundle['disposition'],
  admission: ReturnType<typeof classifyCodexSemanticCollectAdmission>,
  hasActionablePatch: boolean
): FrontierSwarmMergeBundle['disposition'] {
  if (disposition === 'rerun-work' || disposition === 'stale-against-head' || disposition === 'rejected') return disposition;
  if (admission.status === 'ready' && hasActionablePatch) return 'auto-mergeable';
  if (admission.status === 'review') return 'needs-port';
  if (admission.status === 'fail' || semanticAdmissionIsNoChange(admission)) return 'rejected';
  if (admission.status === 'rerun') return disposition === 'stale-against-head' ? disposition : 'rerun-work';
  return disposition;
}

function semanticAdmissionIsNoChange(admission: ReturnType<typeof classifyCodexSemanticCollectAdmission>): boolean {
  return admission.status === 'rejected-no-change' || admission.reasonCodes.includes('kernel-no-op');
}
