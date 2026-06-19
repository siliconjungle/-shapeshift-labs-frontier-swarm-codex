import { spawn, type ChildProcess } from 'node:child_process';
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
  type FrontierSwarmCoordinatorDashboard,
  type FrontierSwarmCoordinatorProcessInput,
  type FrontierSwarmEvidenceIndexEntryInput,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmPatchStatus
} from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_COLLECTION_KIND, FRONTIER_SWARM_CODEX_COLLECTION_VERSION } from './constants.js';
import type {
  FrontierCodexArtifactStoreResult,
  FrontierCodexArtifactStoreStatus,
  FrontierCodexApplyLedgerSummary,
  FrontierCodexApplyResult,
  FrontierCodexCollectBucket,
  FrontierCodexCollectInput,
  FrontierCodexCollectionNoiseBreakdown,
  FrontierCodexCollectQualitySignals,
  FrontierCodexCollectedBundle,
  FrontierCodexCollectResult,
  FrontierCodexLandedHealthSummary
} from './index.js';
import { findFilesByName, isObject, pathExists, pathHasIgnoredSegment, resolveBundlePatchPath, slug, uniqueStrings } from './common.js';
import { createCodexCompactDashboard } from './dashboard.js';
import {
  bundlePatchStaleness,
  classifyCodexCollectBucket,
  collectFailureReasonClasses,
  ignoredWorkspaceNoisePath,
  mergeRecordScore,
  normalizeCollectedDisposition,
  normalizeCollectedMergeBundle,
  normalizeCollectedStaleAgainstHead,
  sourceOwnershipViolationsForReasons
} from './collect-bundles.js';
import { copyOrWriteCollectedEvidenceSummary, createCollectedEvidenceEntries } from './collect-evidence.js';
import { semanticImportSummaryFromBundle, summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { collectedQualitySignalsFromDashboard, enrichCollectedCoordinatorDashboard } from './collect-dashboard.js';
import { contextBudgetFromBundle } from './context-budget.js';
import { summarizeSemanticPatchBundleOverlaps } from './semantic-bundle-overlaps.js';

const DEFAULT_ARTIFACT_STORE_TIMEOUT_MS = 30_000;
const COMPACT_ARTIFACT_STORE_MAX_BYTES = 1024 * 1024;
const ARTIFACT_STORE_STDERR_TAIL_CHARS = 8192;
const ARTIFACT_STORE_KILL_GRACE_MS = 2000;
const COLLECTION_NOISE_SAMPLE_LIMIT = 12;
const COLLECT_BUCKETS: readonly FrontierCodexCollectBucket[] = [
  'ready-to-apply',
  'needs-human-port',
  'rerun-work',
  'failed-evidence',
  'stale-against-head'
];

export async function collectCodexSwarmRun(input: FrontierCodexCollectInput): Promise<FrontierCodexCollectResult> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const runDir = await resolveRunDirectory(input.run);
  const outDir = path.resolve(cwd, input.outDir ?? path.join(runDir, 'collected'));
  const buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]> = {
    'ready-to-apply': [],
    'needs-human-port': [],
    'rerun-work': [],
    'failed-evidence': [],
    'stale-against-head': []
  };
  const collectedBundles: FrontierSwarmMergeBundle[] = [];
  const evidenceEntries: FrontierSwarmEvidenceIndexEntryInput[] = [];
  const patchStatuses: Record<string, FrontierSwarmPatchStatus> = {};
  const semanticImportExpected = input.semanticImportExpected ?? false;
  const semanticImportQualities = new Map<string, ReturnType<typeof summarizeCodexSemanticImportQuality>>();
  const contextBudgets = new Map<string, NonNullable<ReturnType<typeof contextBudgetFromBundle>>>();
  const processes = await readCodexPidProcesses(path.join(runDir, 'pids.json')).catch(() => []);
  const mergePaths = (await findFilesByName(runDir, 'merge.json'))
    .filter((mergePath) => !pathHasIgnoredSegment(path.relative(runDir, mergePath), [
      'collected',
      'patch-scores',
      'ready-to-apply',
      'needs-human-port',
      'rerun-work',
      'failed-evidence',
      'stale-against-head'
    ]));
  const mergeRecordsByJob = new Map<string, { mergePath: string; bundle: FrontierSwarmMergeBundle }>();
  for (const mergePath of mergePaths.sort()) {
    const bundle = normalizeCollectedMergeBundle(JSON.parse(await fs.readFile(mergePath, 'utf8')), mergePath);
    const existing = mergeRecordsByJob.get(bundle.jobId);
    const next = { mergePath, bundle };
    if (!existing || mergeRecordScore(next) > mergeRecordScore(existing)) mergeRecordsByJob.set(bundle.jobId, next);
  }
  const mergeRecords = Array.from(mergeRecordsByJob.values()).sort((left, right) => left.bundle.jobId.localeCompare(right.bundle.jobId));
  for (const { mergePath, bundle } of mergeRecords) {
    const patchPath = resolveBundlePatchPath(bundle, mergePath);
    const patchExists = !!patchPath && await pathExists(patchPath);
    const staleness = input.checkStale === false
      ? {
          stale: false,
          patchStatus: patchExists ? 'unknown' : 'missing',
          reasons: ['stale check disabled'],
          reasonClasses: collectFailureReasonClasses(['stale check disabled'], patchExists ? 'unknown' : 'missing'),
          fresh: false
        }
      : await bundlePatchStaleness(bundle, mergePath, cwd);
    const staleAgainstHead = normalizeCollectedStaleAgainstHead(bundle, staleness, input.checkStale !== false);
    const disposition = normalizeCollectedDisposition(bundle, staleAgainstHead);
    const bucket = classifyCodexCollectBucket({
      ...bundle,
      staleAgainstHead,
      disposition,
      ...(patchExists && patchPath ? { patchPath } : {})
    }, staleAgainstHead);
    const branchName = input.branchPrefix ? `${input.branchPrefix}/${slug(bundle.jobId)}` : bundle.branchName;
    const outputDir = path.join(outDir, bucket, slug(bundle.jobId));
    const collectedEvidencePath = path.join(outputDir, 'evidence.json');
    const semanticImport = semanticImportSummaryFromBundle(bundle);
    const semanticImportQuality = summarizeCodexSemanticImportQuality(semanticImport, semanticImportExpected);
    semanticImportQualities.set(bundle.jobId, semanticImportQuality);
    const contextBudget = contextBudgetFromBundle(bundle);
    if (contextBudget) contextBudgets.set(bundle.jobId, contextBudget);
    const collectReasons = normalizeCollectedReasons(bundle.reasons, staleness.reasons, staleness.patchStatus, staleAgainstHead, bundle);
    const collectReasonClasses = uniqueStrings([
      ...staleness.reasonClasses,
      ...collectFailureReasonClasses(collectReasons, staleness.patchStatus)
    ]);
    const nextBundle: FrontierSwarmMergeBundle = {
      ...bundle,
      ...(branchName ? { branchName } : {}),
      staleAgainstHead,
      disposition,
      autoMergeable: bucket === 'ready-to-apply' && bundle.autoMergeable,
      reasons: collectReasons,
      ...(semanticImport ? { semanticImport } : {}),
      metadata: {
        ...(isObject(bundle.metadata) ? bundle.metadata : {}),
        collect: {
          patchStatus: staleness.patchStatus,
          staleReasons: staleness.reasons,
          reasonClasses: collectReasonClasses,
          semanticImportQuality
        }
      } as unknown as FrontierSwarmMergeBundle['metadata'],
      evidencePaths: uniqueStrings([...bundle.evidencePaths, collectedEvidencePath])
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
    buckets[bucket].push({ bucket, jobId: bundle.jobId, mergePath, outputDir, bundle: nextBundle });
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
  const summary: FrontierCodexCollectResult['summary'] = {
    total: mergeRecords.length,
    'ready-to-apply': buckets['ready-to-apply'].length,
    'needs-human-port': buckets['needs-human-port'].length,
    'rerun-work': buckets['rerun-work'].length,
    'failed-evidence': buckets['failed-evidence'].length,
    'stale-against-head': buckets['stale-against-head'].length
  };
  if (applyLedgerSummary) {
    summary.landed = applyLedgerSummary.landed;
    summary.landedJobIds = applyLedgerSummary.landedJobIds;
    summary.applyLedger = applyLedgerSummary;
    if (landedHealth) summary.landedHealth = landedHealth;
  }
  const qualitySignals = collectedQualitySignalsFromDashboard(dashboard);
  const noiseBreakdown = createCollectionNoiseBreakdown(collectedBundles);
  attachCollectionNoiseBreakdown(dashboard, compactDashboard, qualitySignals, noiseBreakdown);
  if (landedHealth) attachLandedHealthSummary(dashboard, compactDashboard, qualitySignals, landedHealth);
  const result: FrontierCodexCollectResult = {
    kind: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
    version: FRONTIER_SWARM_CODEX_COLLECTION_VERSION,
    ok: landedHealth
      ? landedHealth.remainingFailedEvidenceCount === 0 && landedHealth.remainingStaleCount === 0
      : summary['failed-evidence'] === 0 && summary['stale-against-head'] === 0 && summary['rerun-work'] === 0,
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
    semanticImport: compactDashboard.semanticImport,
    semanticEditAdmission: compactDashboard.semanticEditAdmission,
    semanticEditScriptAdmission: compactDashboard.semanticEditScriptAdmission,
    semanticPatchBundleOverlaps,
    qualitySignals,
    noiseBreakdown,
    ...(landedHealth ? { landedHealth } : {}),
    summary
  };
  await fs.mkdir(outDir, { recursive: true });
  const collectionPath = path.join(outDir, 'collection.json');
  await fs.writeFile(collectionPath, JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'merge-index.json'), JSON.stringify(mergeIndex, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'queue-overlay.json'), JSON.stringify(queueOverlay, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'strategy-tournament.json'), JSON.stringify(strategyTournament, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'strategy-history.json'), JSON.stringify(strategyHistory, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'tournament-adaptive-feedback.json'), JSON.stringify(tournamentAdaptiveFeedback, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'evidence-index.json'), JSON.stringify(evidenceIndex, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'merge-admission.json'), JSON.stringify(admission, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'coordinator-query.json'), JSON.stringify(dashboard, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'compact-dashboard.json'), JSON.stringify(compactDashboard, null, 2) + '\n');
  const artifactStorePostProcessing = await createBoundedCodexArtifactStore({
    collection: result,
    collectionPath,
    mode: input.artifactStoreMode ?? 'full',
    timeoutMs: input.artifactStoreTimeoutMs
  });
  if (artifactStorePostProcessing.artifactStore) result.artifactStore = artifactStorePostProcessing.artifactStore;
  result.artifactStoreStatus = artifactStorePostProcessing.status;
  result.metadata = {
    ...(isObject(result.metadata) ? result.metadata : {}),
    collectExitGuard: artifactStorePostProcessing.status.guard
  };
  await fs.writeFile(collectionPath, JSON.stringify(result, null, 2) + '\n');
  return result;
}

interface ArtifactStorePostProcessingInput {
  collection: FrontierCodexCollectResult;
  collectionPath: string;
  mode: NonNullable<FrontierCodexCollectInput['artifactStoreMode']>;
  timeoutMs?: number;
}

interface ArtifactStorePostProcessingResult {
  artifactStore?: FrontierCodexArtifactStoreResult;
  status: FrontierCodexArtifactStoreStatus;
}

type ArtifactStoreGuardModes = NonNullable<FrontierCodexArtifactStoreStatus['guard']['incompleteModes']>;

async function createBoundedCodexArtifactStore(input: ArtifactStorePostProcessingInput): Promise<ArtifactStorePostProcessingResult> {
  const timeoutMs = normalizeArtifactStoreTimeoutMs(input.timeoutMs);
  const startedAt = Date.now();
  if (input.mode === 'compact') {
    return runCompactArtifactStoreWorker(input.collection, input.collectionPath, {
      startedAt,
      timeoutMs,
      timedOut: false,
      reason: 'compact-artifact-store-requested'
    });
  }
  const fullResult = await runArtifactStoreWorker({
    collection: input.collection,
    collectionPath: input.collectionPath,
    mode: 'full',
    timeoutMs,
    options: { compress: true, sqlite: true }
  });
  if (fullResult.artifactStore) return fullResult;
  const compactResult = await runCompactArtifactStoreWorker(input.collection, input.collectionPath, {
    startedAt,
    timeoutMs,
    timedOut: fullResult.status.timedOut,
    reason: fullResult.status.reason ?? 'artifact-store-worker-failed',
    error: fullResult.status.error
  });
  const incompleteModes = uniqueArtifactStoreModes([
    ...artifactStoreIncompleteModes(fullResult.status),
    ...artifactStoreIncompleteModes(compactResult.status)
  ]);
  return {
    ...compactResult,
    status: withArtifactStoreGuard(compactResult.status, {
      attemptedModes: ['full', 'compact'],
      fallbackUsed: true,
      outcome: compactResult.status.ok ? 'fallback-completed' : 'incomplete',
      timedOut: fullResult.status.timedOut || compactResult.status.timedOut,
      incompleteModes,
      fallbackReason: fullResult.status.reason ?? fullResult.status.guard.reason,
      startedAt
    })
  };
}

async function runArtifactStoreWorker(input: {
  collection: FrontierCodexCollectResult;
  collectionPath: string;
  mode: NonNullable<FrontierCodexCollectInput['artifactStoreMode']>;
  timeoutMs: number;
  options: { compress: boolean; sqlite: boolean; maxArtifactBytes?: number };
}): Promise<ArtifactStorePostProcessingResult> {
  const startedAt = Date.now();
  const artifactStoreModuleUrl = new URL('./artifact-store.js', import.meta.url).href;
  const script = [
    "import fs from 'node:fs/promises';",
    `import { createCodexArtifactStore } from ${JSON.stringify(artifactStoreModuleUrl)};`,
    'const collectionPath = process.argv[1];',
    'const options = JSON.parse(process.argv[2]);',
    "const collection = JSON.parse(await fs.readFile(collectionPath, 'utf8'));",
    'await createCodexArtifactStore({ collection, ...options });'
  ].join('\n');
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let stderrTail = '';
    const child = spawn(process.execPath, [
      '--input-type=module',
      '--eval',
      script,
      input.collectionPath,
      JSON.stringify(input.options)
    ], {
      cwd: input.collection.outDir,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'ignore', 'pipe']
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      killArtifactStoreWorker(child);
      const incompleteGuard = setTimeout(() => {
        detachArtifactStoreWorker(child);
        settle({
          status: artifactStoreStatus({
            ok: false,
            mode: input.mode,
            startedAt,
            timeoutMs: input.timeoutMs,
            timedOut: true,
            guardIncomplete: true,
            reason: 'artifact-store-guard-incomplete',
            error: stderrTail || undefined
          })
        });
      }, ARTIFACT_STORE_KILL_GRACE_MS + 500);
      incompleteGuard.unref?.();
      child.once('close', () => clearTimeout(incompleteGuard));
    }, input.timeoutMs);
    timeout.unref?.();
    child.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = appendTail(stderrTail, chunk.toString('utf8'), ARTIFACT_STORE_STDERR_TAIL_CHARS);
    });
    child.on('error', (error) => {
      settle({
        status: artifactStoreStatus({
          ok: false,
          mode: input.mode,
          startedAt,
          timeoutMs: input.timeoutMs,
          timedOut,
          reason: 'artifact-store-worker-error',
          error: formatUnknownError(error)
        })
      });
    });
    child.on('close', (status, signal) => {
      void (async () => {
        if (status === 0 && !timedOut) {
          try {
            const artifactStore = await readArtifactStoreResult(input.collection);
            settle({
              artifactStore,
              status: artifactStoreStatus({
                ok: true,
                mode: input.mode,
                startedAt,
                timeoutMs: input.timeoutMs,
                timedOut: false
              })
            });
            return;
          } catch (error) {
            settle({
              status: artifactStoreStatus({
                ok: false,
                mode: input.mode,
                startedAt,
                timeoutMs: input.timeoutMs,
                timedOut: false,
                reason: 'artifact-store-missing-output',
                error: formatUnknownError(error)
              })
            });
            return;
          }
        }
        settle({
          status: artifactStoreStatus({
            ok: false,
            mode: input.mode,
            startedAt,
            timeoutMs: input.timeoutMs,
            timedOut,
            reason: timedOut ? `${input.mode}-artifact-store-timeout` : `${input.mode}-artifact-store-worker-exited:${status ?? signal ?? 'unknown'}`,
            error: stderrTail || undefined
          })
        });
      })();
    });

    function settle(result: ArtifactStorePostProcessingResult): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    }
  });
}

async function runCompactArtifactStoreWorker(
  collection: FrontierCodexCollectResult,
  collectionPath: string,
  input: { startedAt: number; timeoutMs: number; timedOut: boolean; reason: string; error?: string }
): Promise<ArtifactStorePostProcessingResult> {
  try {
    await fs.rm(path.join(collection.outDir, 'artifact-store', 'artifact-index.sqlite'), { force: true }).catch(() => {});
    const result = await runArtifactStoreWorker({
      collection,
      collectionPath,
      mode: 'compact',
      timeoutMs: input.timeoutMs,
      options: {
        compress: false,
        sqlite: false,
        maxArtifactBytes: COMPACT_ARTIFACT_STORE_MAX_BYTES
      }
    });
    await fs.rm(path.join(collection.outDir, 'artifact-store', 'artifact-index.sqlite'), { force: true }).catch(() => {});
    return {
      ...result,
      status: withArtifactStoreGuard(result.status, {
        attemptedModes: ['compact'],
        fallbackUsed: input.reason !== 'compact-artifact-store-requested',
        outcome: result.status.ok ? 'completed' : 'incomplete',
        timedOut: input.timedOut || result.status.timedOut,
        reason: result.status.reason ?? input.reason,
        error: result.status.error ?? input.error,
        startedAt: input.startedAt
      })
    };
  } catch (error) {
    const status = artifactStoreStatus({
      ok: false,
      mode: 'compact',
      startedAt: input.startedAt,
      timeoutMs: input.timeoutMs,
      timedOut: input.timedOut,
      reason: 'compact-artifact-store-failed',
      error: [input.error, formatUnknownError(error)].filter(Boolean).join('\n')
    });
    return {
      status: withArtifactStoreGuard(status, {
        attemptedModes: ['compact'],
        fallbackUsed: input.reason !== 'compact-artifact-store-requested',
        outcome: 'incomplete',
        timedOut: input.timedOut,
        fallbackReason: input.reason,
        startedAt: input.startedAt
      })
    };
  }
}

async function readArtifactStoreResult(collection: FrontierCodexCollectResult): Promise<FrontierCodexArtifactStoreResult> {
  const file = path.join(collection.outDir, 'artifact-store', 'artifact-store.json');
  return JSON.parse(await fs.readFile(file, 'utf8')) as FrontierCodexArtifactStoreResult;
}

function artifactStoreStatus(input: {
  ok: boolean;
  mode: FrontierCodexArtifactStoreStatus['mode'];
  startedAt: number;
  timeoutMs: number;
  timedOut: boolean;
  guardIncomplete?: boolean;
  reason?: string;
  error?: string;
}): FrontierCodexArtifactStoreStatus {
  const durationMs = Date.now() - input.startedAt;
  const reason = input.reason ?? (input.guardIncomplete ? 'artifact-store-guard-incomplete' : undefined);
  const incompleteModes = input.guardIncomplete ? [input.mode] : [];
  const guard = {
    ok: input.ok && !input.guardIncomplete,
    complete: input.ok && !input.guardIncomplete,
    outcome: input.ok && !input.guardIncomplete ? 'completed' : 'incomplete',
    attemptedModes: [input.mode],
    ...(incompleteModes.length ? { incompleteModes } : {}),
    fallbackUsed: false,
    timedOut: input.timedOut,
    timeoutMs: input.timeoutMs,
    durationMs,
    ...(reason ? { reason } : {})
  } satisfies FrontierCodexArtifactStoreStatus['guard'];
  return {
    ok: input.ok,
    mode: input.mode,
    timedOut: input.timedOut,
    timeoutMs: input.timeoutMs,
    durationMs,
    guard,
    ...(reason ? { reason } : {}),
    ...(input.error ? { error: input.error } : {})
  };
}

function withArtifactStoreGuard(
  status: FrontierCodexArtifactStoreStatus,
  input: {
    attemptedModes: FrontierCodexArtifactStoreStatus['guard']['attemptedModes'];
    fallbackUsed: boolean;
    outcome: FrontierCodexArtifactStoreStatus['guard']['outcome'];
    timedOut: boolean;
    startedAt: number;
    incompleteModes?: ArtifactStoreGuardModes;
    fallbackReason?: string;
    reason?: string;
    error?: string;
  }
): FrontierCodexArtifactStoreStatus {
  const durationMs = Date.now() - input.startedAt;
  const reason = input.reason ?? status.reason;
  const incompleteModes = uniqueArtifactStoreModes([
    ...(status.guard.incompleteModes ?? []),
    ...(input.incompleteModes ?? [])
  ]);
  const guardComplete = input.outcome !== 'incomplete' && incompleteModes.length === 0;
  return {
    ...status,
    timedOut: input.timedOut,
    durationMs,
    ...(reason ? { reason } : {}),
    ...(input.error && !status.error ? { error: input.error } : {}),
    guard: {
      ok: status.ok && guardComplete,
      complete: guardComplete,
      outcome: input.outcome,
      attemptedModes: input.attemptedModes,
      ...(incompleteModes.length ? { incompleteModes } : {}),
      fallbackUsed: input.fallbackUsed,
      ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}),
      timedOut: input.timedOut,
      timeoutMs: status.timeoutMs,
      durationMs,
      ...(reason ? { reason } : {})
    }
  };
}

function artifactStoreIncompleteModes(status: FrontierCodexArtifactStoreStatus): ArtifactStoreGuardModes {
  return status.guard.incompleteModes ?? [];
}

function uniqueArtifactStoreModes(
  modes: readonly ArtifactStoreGuardModes[number][]
): ArtifactStoreGuardModes {
  const out: ArtifactStoreGuardModes = [];
  for (const mode of modes) {
    if (!out.includes(mode)) out.push(mode);
  }
  return out;
}

function normalizeArtifactStoreTimeoutMs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ARTIFACT_STORE_TIMEOUT_MS;
  return Math.max(1000, Math.floor(value));
}

function killArtifactStoreWorker(child: ChildProcess): void {
  const pid = child.pid;
  const send = (signal: 'SIGTERM' | 'SIGKILL') => {
    try {
      if (pid && process.platform !== 'win32') process.kill(-pid, signal);
      else child.kill(signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        // Best-effort cleanup; close/error handlers keep the collector bounded.
      }
    }
  };
  send('SIGTERM');
  const forceKill = setTimeout(() => send('SIGKILL'), ARTIFACT_STORE_KILL_GRACE_MS);
  forceKill.unref?.();
  child.once('close', () => clearTimeout(forceKill));
}

function detachArtifactStoreWorker(child: ChildProcess): void {
  child.stderr?.destroy();
  child.unref();
}

function appendTail(left: string, right: string, maxChars: number): string {
  const combined = left + right;
  return combined.length > maxChars ? combined.slice(-maxChars) : combined;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function attachSemanticPatchBundleOverlaps(
  dashboard: FrontierSwarmCoordinatorDashboard,
  compactDashboard: ReturnType<typeof createCodexCompactDashboard>,
  semanticPatchBundleOverlaps: Awaited<ReturnType<typeof summarizeSemanticPatchBundleOverlaps>>
): void {
  const mutableDashboard = dashboard as FrontierSwarmCoordinatorDashboard & { metadata?: Record<string, unknown> };
  const dashboardMetadata = mutableDashboard as unknown as { metadata?: Record<string, unknown> };
  (mutableDashboard.summary as Record<string, unknown>).semanticPatchBundleOverlaps = semanticPatchBundleOverlaps;
  dashboardMetadata.metadata = { ...(dashboardMetadata.metadata ?? {}), semanticPatchBundleOverlaps };
  (compactDashboard as typeof compactDashboard & { semanticPatchBundleOverlaps?: typeof semanticPatchBundleOverlaps }).semanticPatchBundleOverlaps = semanticPatchBundleOverlaps;
}

async function readApplyLedgerSummary(collectionDir: string): Promise<FrontierCodexApplyLedgerSummary | undefined> {
  const candidates = [
    path.join(collectionDir, 'apply-ledger', 'apply-ledger.json'),
    path.join(collectionDir, 'apply-ledger.json')
  ];
  for (const candidate of candidates) {
    if (!await pathExists(candidate)) continue;
    const ledger = JSON.parse(await fs.readFile(candidate, 'utf8')) as FrontierCodexApplyResult;
    return summarizeApplyLedger(ledger, candidate);
  }
  return undefined;
}

function summarizeApplyLedger(
  ledger: FrontierCodexApplyResult,
  ledgerPath: string
): FrontierCodexApplyLedgerSummary {
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const summary = isObject(ledger.summary) ? ledger.summary : {};
  const statusCounts = {
    checked: entries.filter((entry) => entry.status === 'checked').length,
    applied: entries.filter((entry) => entry.status === 'applied').length,
    committed: entries.filter((entry) => entry.status === 'committed').length,
    skipped: entries.filter((entry) => entry.status === 'skipped').length,
    failed: entries.filter((entry) => entry.status === 'failed').length
  };
  const landedEntries: FrontierCodexApplyLedgerSummary['landedEntries'] = [];
  for (const entry of entries) {
    if (entry.status !== 'applied' && entry.status !== 'committed') continue;
    landedEntries.push({
      jobId: entry.jobId,
      status: entry.status,
      bundlePath: entry.bundlePath,
      ...(entry.patchPath ? { patchPath: entry.patchPath } : {}),
      ...(entry.branchName ? { branchName: entry.branchName } : {}),
      ...(entry.commit ? { commit: entry.commit } : {})
    });
  }
  const appliedJobIds = uniqueStrings(entries.filter((entry) => entry.status === 'applied').map((entry) => entry.jobId));
  const committedJobIds = uniqueStrings(entries.filter((entry) => entry.status === 'committed').map((entry) => entry.jobId));
  const landedJobIds = uniqueStrings([...appliedJobIds, ...committedJobIds]);
  const failedJobIds = uniqueStrings(entries.filter((entry) => entry.status === 'failed').map((entry) => entry.jobId));
  return {
    path: ledgerPath,
    ...(typeof ledger.generatedAt === 'number' ? { generatedAt: ledger.generatedAt } : {}),
    ...(typeof ledger.dryRun === 'boolean' ? { dryRun: ledger.dryRun } : {}),
    total: ledgerSummaryCount(summary, 'total', entries.length),
    checked: ledgerSummaryCount(summary, 'checked', statusCounts.checked),
    applied: ledgerSummaryCount(summary, 'applied', statusCounts.applied),
    committed: ledgerSummaryCount(summary, 'committed', statusCounts.committed),
    skipped: ledgerSummaryCount(summary, 'skipped', statusCounts.skipped),
    failed: ledgerSummaryCount(summary, 'failed', statusCounts.failed),
    landed: landedJobIds.length,
    appliedJobIds,
    committedJobIds,
    landedJobIds,
    failedJobIds,
    landedEntries
  };
}

function ledgerSummaryCount(summary: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(summary[key]);
  if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  return fallback;
}

function attachApplyLedgerSummary(
  dashboard: FrontierSwarmCoordinatorDashboard,
  compactDashboard: ReturnType<typeof createCodexCompactDashboard>,
  applyLedger: FrontierCodexApplyLedgerSummary
): void {
  const mutableDashboard = dashboard as FrontierSwarmCoordinatorDashboard & { metadata?: Record<string, unknown> };
  const dashboardMetadata = mutableDashboard as unknown as { metadata?: Record<string, unknown> };
  (mutableDashboard.summary as Record<string, unknown>).applyLedger = applyLedger;
  (mutableDashboard.summary as Record<string, unknown>).applyLedgerLandedCount = applyLedger.landed;
  (mutableDashboard.summary as Record<string, unknown>).landedJobIds = applyLedger.landedJobIds;
  dashboardMetadata.metadata = { ...(dashboardMetadata.metadata ?? {}), applyLedger };
  (compactDashboard as typeof compactDashboard & {
    applyLedger?: FrontierCodexApplyLedgerSummary;
    landedJobIds?: string[];
    landedCount?: number;
  }).applyLedger = applyLedger;
  (compactDashboard as typeof compactDashboard & { landedJobIds?: string[] }).landedJobIds = applyLedger.landedJobIds;
  (compactDashboard as typeof compactDashboard & { landedCount?: number }).landedCount = applyLedger.landed;
}

function createLandedHealthSummary(
  applyLedger: FrontierCodexApplyLedgerSummary,
  buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>
): FrontierCodexLandedHealthSummary {
  const landedJobSet = new Set(applyLedger.landedJobIds);
  const bucketJobIds = collectBucketJobIds(buckets);
  const landedBucketJobIds = mapBucketJobIds(bucketJobIds, (jobId) => landedJobSet.has(jobId));
  const remainingBucketJobIds = mapBucketJobIds(bucketJobIds, (jobId) => !landedJobSet.has(jobId));
  const reviewPressureJobIds = uniqueStrings([
    ...remainingBucketJobIds['needs-human-port'],
    ...remainingBucketJobIds['rerun-work'],
    ...remainingBucketJobIds['failed-evidence'],
    ...remainingBucketJobIds['stale-against-head']
  ]);
  return {
    successfulOutputCount: applyLedger.landed,
    appliedJobCount: applyLedger.appliedJobIds.length,
    committedJobCount: applyLedger.committedJobIds.length,
    failedApplyJobCount: applyLedger.failedJobIds.length,
    landedJobIds: applyLedger.landedJobIds,
    appliedJobIds: applyLedger.appliedJobIds,
    committedJobIds: applyLedger.committedJobIds,
    failedApplyJobIds: applyLedger.failedJobIds,
    bucketCounts: countBucketJobIds(bucketJobIds),
    landedBucketCounts: countBucketJobIds(landedBucketJobIds),
    landedBucketJobIds,
    remainingBucketCounts: countBucketJobIds(remainingBucketJobIds),
    remainingBucketJobIds,
    landedNeedsHumanReviewCount: landedBucketJobIds['needs-human-port'].length,
    landedNeedsHumanReviewJobIds: landedBucketJobIds['needs-human-port'],
    remainingNeedsHumanReviewCount: remainingBucketJobIds['needs-human-port'].length,
    remainingNeedsHumanReviewJobIds: remainingBucketJobIds['needs-human-port'],
    remainingFailedEvidenceCount: remainingBucketJobIds['failed-evidence'].length,
    remainingFailedEvidenceJobIds: remainingBucketJobIds['failed-evidence'],
    remainingStaleCount: remainingBucketJobIds['stale-against-head'].length,
    remainingStaleJobIds: remainingBucketJobIds['stale-against-head'],
    remainingReadyToApplyCount: remainingBucketJobIds['ready-to-apply'].length,
    remainingReadyToApplyJobIds: remainingBucketJobIds['ready-to-apply'],
    reviewPressureCount: reviewPressureJobIds.length,
    reviewPressureJobIds
  };
}

function collectBucketJobIds(
  buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>
): Record<FrontierCodexCollectBucket, string[]> {
  return {
    'ready-to-apply': buckets['ready-to-apply'].map((entry) => entry.jobId),
    'needs-human-port': buckets['needs-human-port'].map((entry) => entry.jobId),
    'rerun-work': buckets['rerun-work'].map((entry) => entry.jobId),
    'failed-evidence': buckets['failed-evidence'].map((entry) => entry.jobId),
    'stale-against-head': buckets['stale-against-head'].map((entry) => entry.jobId)
  };
}

function mapBucketJobIds(
  jobIds: Record<FrontierCodexCollectBucket, string[]>,
  include: (jobId: string, bucket: FrontierCodexCollectBucket) => boolean
): Record<FrontierCodexCollectBucket, string[]> {
  const out = {
    'ready-to-apply': [],
    'needs-human-port': [],
    'rerun-work': [],
    'failed-evidence': [],
    'stale-against-head': []
  } as Record<FrontierCodexCollectBucket, string[]>;
  for (const bucket of COLLECT_BUCKETS) {
    out[bucket] = jobIds[bucket].filter((jobId) => include(jobId, bucket));
  }
  return out;
}

function countBucketJobIds(
  jobIds: Record<FrontierCodexCollectBucket, string[]>
): Record<FrontierCodexCollectBucket, number> {
  return {
    'ready-to-apply': jobIds['ready-to-apply'].length,
    'needs-human-port': jobIds['needs-human-port'].length,
    'rerun-work': jobIds['rerun-work'].length,
    'failed-evidence': jobIds['failed-evidence'].length,
    'stale-against-head': jobIds['stale-against-head'].length
  };
}

function attachLandedHealthSummary(
  dashboard: FrontierSwarmCoordinatorDashboard,
  compactDashboard: ReturnType<typeof createCodexCompactDashboard>,
  qualitySignals: FrontierCodexCollectQualitySignals,
  landedHealth: FrontierCodexLandedHealthSummary
): void {
  const mutableDashboard = dashboard as FrontierSwarmCoordinatorDashboard & { metadata?: Record<string, unknown> };
  const dashboardMetadata = mutableDashboard as unknown as { metadata?: Record<string, unknown> };
  qualitySignals.landed = landedHealth;
  qualitySignals.needsPort = {
    ...qualitySignals.needsPort,
    landedJobCount: landedHealth.landedNeedsHumanReviewCount,
    landedJobIds: landedHealth.landedNeedsHumanReviewJobIds,
    remainingJobCount: landedHealth.remainingNeedsHumanReviewCount,
    remainingJobIds: landedHealth.remainingNeedsHumanReviewJobIds
  };
  qualitySignals.failure = {
    ...qualitySignals.failure,
    landedJobCount: landedHealth.landedBucketCounts['failed-evidence'],
    landedJobIds: landedHealth.landedBucketJobIds['failed-evidence'],
    remainingJobCount: landedHealth.remainingFailedEvidenceCount,
    remainingJobIds: landedHealth.remainingFailedEvidenceJobIds
  };
  qualitySignals.stale = {
    ...qualitySignals.stale,
    landedJobCount: landedHealth.landedBucketCounts['stale-against-head'],
    landedJobIds: landedHealth.landedBucketJobIds['stale-against-head'],
    remainingJobCount: landedHealth.remainingStaleCount,
    remainingJobIds: landedHealth.remainingStaleJobIds
  };
  (mutableDashboard.summary as Record<string, unknown>).collectionQualitySignals = qualitySignals;
  (mutableDashboard.summary as Record<string, unknown>).collectionLandedSuccessCount = landedHealth.successfulOutputCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionLandedAppliedCount = landedHealth.appliedJobCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionLandedCommittedCount = landedHealth.committedJobCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionFailedApplyCount = landedHealth.failedApplyJobCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionLandedNeedsHumanReviewCount = landedHealth.landedNeedsHumanReviewCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionRemainingNeedsHumanReviewCount = landedHealth.remainingNeedsHumanReviewCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionRemainingFailedEvidenceCount = landedHealth.remainingFailedEvidenceCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionRemainingStaleCount = landedHealth.remainingStaleCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionRemainingReadyToApplyCount = landedHealth.remainingReadyToApplyCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionReviewPressureCount = landedHealth.reviewPressureCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionReviewPressureJobIds = landedHealth.reviewPressureJobIds;
  dashboardMetadata.metadata = { ...(dashboardMetadata.metadata ?? {}), landedHealth };
  const compact = compactDashboard as typeof compactDashboard & {
    landedHealth?: FrontierCodexLandedHealthSummary;
    successfulOutputCount?: number;
    landedNeedsHumanReviewCount?: number;
    remainingNeedsHumanReviewCount?: number;
    remainingFailedEvidenceCount?: number;
    remainingStaleCount?: number;
    remainingReadyToApplyCount?: number;
    reviewPressureCount?: number;
    reviewPressureJobIds?: string[];
  };
  compact.landedHealth = landedHealth;
  compact.successfulOutputCount = landedHealth.successfulOutputCount;
  compact.landedNeedsHumanReviewCount = landedHealth.landedNeedsHumanReviewCount;
  compact.remainingNeedsHumanReviewCount = landedHealth.remainingNeedsHumanReviewCount;
  compact.remainingFailedEvidenceCount = landedHealth.remainingFailedEvidenceCount;
  compact.remainingStaleCount = landedHealth.remainingStaleCount;
  compact.remainingReadyToApplyCount = landedHealth.remainingReadyToApplyCount;
  compact.reviewPressureCount = landedHealth.reviewPressureCount;
  compact.reviewPressureJobIds = landedHealth.reviewPressureJobIds;
}

function attachCollectionNoiseBreakdown(
  dashboard: FrontierSwarmCoordinatorDashboard,
  compactDashboard: ReturnType<typeof createCodexCompactDashboard>,
  qualitySignals: FrontierCodexCollectQualitySignals,
  noiseBreakdown: FrontierCodexCollectionNoiseBreakdown
): void {
  const mutableDashboard = dashboard as FrontierSwarmCoordinatorDashboard & { metadata?: Record<string, unknown> };
  const dashboardMetadata = mutableDashboard as unknown as { metadata?: Record<string, unknown> };
  qualitySignals.noiseBreakdown = noiseBreakdown;
  (mutableDashboard.summary as Record<string, unknown>).collectionNoiseBreakdown = noiseBreakdown;
  (mutableDashboard.summary as Record<string, unknown>).collectionQualitySignals = qualitySignals;
  (mutableDashboard.summary as Record<string, unknown>).collectionRestoredChangedPathSignalCount = noiseBreakdown.restored.pathCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionRestoredChangedPathJobCount = noiseBreakdown.restored.jobCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionGeneratedNoiseSignalCount = noiseBreakdown.generatedNoise.pathCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionGeneratedNoiseJobCount = noiseBreakdown.generatedNoise.jobCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionIgnoredWorkspaceNoiseSignalCount = noiseBreakdown.ignoredWorkspaceNoise.pathCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionIgnoredWorkspaceNoiseJobCount = noiseBreakdown.ignoredWorkspaceNoise.jobCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionSourceOwnershipViolationCount = noiseBreakdown.sourceOwnershipViolations.pathCount;
  (mutableDashboard.summary as Record<string, unknown>).collectionSourceOwnershipViolationJobCount = noiseBreakdown.sourceOwnershipViolations.jobCount;
  dashboardMetadata.metadata = { ...(dashboardMetadata.metadata ?? {}), collectionNoiseBreakdown: noiseBreakdown };
  const compact = compactDashboard as typeof compactDashboard & {
    collectionNoiseBreakdown?: FrontierCodexCollectionNoiseBreakdown;
    restoredChangedPathCount?: number;
    restoredChangedPathJobCount?: number;
    generatedNoisePathCount?: number;
    generatedNoiseJobCount?: number;
    ignoredWorkspaceNoisePathCount?: number;
    ignoredWorkspaceNoiseJobCount?: number;
    sourceOwnershipViolationCount?: number;
    sourceOwnershipViolationJobCount?: number;
  };
  compact.collectionNoiseBreakdown = noiseBreakdown;
  compact.restoredChangedPathCount = noiseBreakdown.restored.pathCount;
  compact.restoredChangedPathJobCount = noiseBreakdown.restored.jobCount;
  compact.generatedNoisePathCount = noiseBreakdown.generatedNoise.pathCount;
  compact.generatedNoiseJobCount = noiseBreakdown.generatedNoise.jobCount;
  compact.ignoredWorkspaceNoisePathCount = noiseBreakdown.ignoredWorkspaceNoise.pathCount;
  compact.ignoredWorkspaceNoiseJobCount = noiseBreakdown.ignoredWorkspaceNoise.jobCount;
  compact.sourceOwnershipViolationCount = noiseBreakdown.sourceOwnershipViolations.pathCount;
  compact.sourceOwnershipViolationJobCount = noiseBreakdown.sourceOwnershipViolations.jobCount;
}

function createCollectionNoiseBreakdown(
  bundles: readonly FrontierSwarmMergeBundle[]
): FrontierCodexCollectionNoiseBreakdown {
  const restored: CollectionNoiseSignalInput[] = [];
  const quarantined: CollectionNoiseSignalInput[] = [];
  const generatedNoise: CollectionNoiseSignalInput[] = [];
  const ignoredWorkspaceNoise: CollectionNoiseSignalInput[] = [];
  const sourceOwnershipViolations: CollectionNoiseSignalInput[] = [];
  for (const bundle of bundles) {
    const reasonClasses = bundleCollectReasonClasses(bundle);
    const restoredPaths = bundleRestoredSourcePaths(bundle);
    const quarantinedPaths = bundleQuarantinedChangedPaths(bundle);
    const ownershipPaths = uniqueStrings(bundle.ownershipViolations);
    const reasonGeneratedPaths = bundle.reasons
      .map((reason) => missingHeadBlobReasonPath(reason))
      .filter((entry): entry is string => Boolean(entry));
    const candidatePaths = uniqueStrings([...restoredPaths, ...quarantinedPaths, ...ownershipPaths, ...reasonGeneratedPaths]);
    const generatedPaths = candidatePaths.filter((entry) => generatedNoisePath(entry, bundle.reasons));
    const ignoredPaths = candidatePaths.filter((entry) => ignoredWorkspaceNoisePath(entry) && !generatedNoisePath(entry, bundle.reasons));
    const sourceOwnershipPaths = sourceOwnershipViolationsForReasons(ownershipPaths, bundle.reasons);
    const generatedReasonClasses = reasonClasses.filter(generatedNoiseReasonClass);
    const ignoredReasonClasses = reasonClasses.filter(ignoredWorkspaceNoiseReasonClass);
    restored.push({
      jobId: bundle.jobId,
      paths: restoredPaths,
      reasonClasses: reasonClasses.filter((entry) => entry === 'workspace.restore-disallowed-changes')
    });
    quarantined.push({
      jobId: bundle.jobId,
      paths: quarantinedPaths,
      reasonClasses: reasonClasses.filter((entry) => entry === 'workspace.quarantine')
    });
    generatedNoise.push({
      jobId: bundle.jobId,
      paths: generatedPaths,
      reasonClasses: generatedReasonClasses
    });
    ignoredWorkspaceNoise.push({
      jobId: bundle.jobId,
      paths: ignoredPaths,
      reasonClasses: ignoredPaths.length > 0 || generatedPaths.length === 0 && generatedReasonClasses.length === 0
        ? ignoredReasonClasses
        : []
    });
    sourceOwnershipViolations.push({
      jobId: bundle.jobId,
      paths: sourceOwnershipPaths,
      reasonClasses: reasonClasses.filter((entry) => entry === 'ownership.source-violation')
    });
  }
  return {
    restored: collectionNoiseSignal(restored),
    quarantined: collectionNoiseSignal(quarantined),
    generatedNoise: collectionNoiseSignal(generatedNoise),
    ignoredWorkspaceNoise: collectionNoiseSignal(ignoredWorkspaceNoise),
    sourceOwnershipViolations: collectionNoiseSignal(sourceOwnershipViolations)
  };
}

function collectionNoiseSignal(
  entries: readonly CollectionNoiseSignalInput[]
): FrontierCodexCollectionNoiseBreakdown['restored'] {
  const activeEntries = entries.filter((entry) => entry.paths.length > 0 || entry.reasonClasses.length > 0);
  const paths = uniqueStrings(activeEntries.flatMap((entry) => [...entry.paths]));
  const reasonClasses = activeEntries.flatMap((entry) => [...entry.reasonClasses]);
  const jobIds = uniqueStrings(activeEntries.map((entry) => entry.jobId));
  return {
    jobCount: jobIds.length,
    pathCount: paths.length,
    paths: paths.slice(0, COLLECTION_NOISE_SAMPLE_LIMIT),
    jobIds: jobIds.slice(0, COLLECTION_NOISE_SAMPLE_LIMIT),
    reasonClasses: uniqueStrings(reasonClasses).slice(0, COLLECTION_NOISE_SAMPLE_LIMIT),
    reasonClassCounts: countCollectionNoiseStrings(reasonClasses)
  };
}

interface CollectionNoiseSignalInput {
  jobId: string;
  paths: readonly string[];
  reasonClasses: readonly string[];
}

function countCollectionNoiseStrings(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function bundleCollectReasonClasses(bundle: FrontierSwarmMergeBundle): string[] {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const collect = isObject(metadata.collect) ? metadata.collect : {};
  const collectReasonClasses = stringArray(collect.reasonClasses);
  return uniqueStrings([...collectReasonClasses, ...collectFailureReasonClasses(bundle.reasons)]);
}

function bundleRestoredSourcePaths(bundle: FrontierSwarmMergeBundle): string[] {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  return uniqueStrings(pathRecordArray(metadata.ownershipRestore));
}

function bundleQuarantinedChangedPaths(bundle: FrontierSwarmMergeBundle): string[] {
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const quarantine = isObject(metadata.workspacePatchQuarantine) ? metadata.workspacePatchQuarantine : {};
  const paths = stringArray(quarantine.quarantinedChangedPaths);
  if (paths.length > 0) return uniqueStrings(paths);
  return bundle.reasons.includes('quarantined-disallowed-changes') ? uniqueStrings(bundle.ownershipViolations) : [];
}

function pathRecordArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (isObject(entry) && typeof entry.path === 'string') return [entry.path];
    return [];
  });
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function generatedNoiseReasonClass(reasonClass: string): boolean {
  return reasonClass.startsWith('generated.') || reasonClass.endsWith('.generated');
}

function ignoredWorkspaceNoiseReasonClass(reasonClass: string): boolean {
  return reasonClass === 'workspace.ignored-noise' || reasonClass.startsWith('workspace.ignored-noise.');
}

function generatedNoisePath(file: string, reasons: readonly string[]): boolean {
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  return normalized.endsWith('.tsbuildinfo')
    || generatedWorkspaceSetupOwnershipPath(normalized, reasons)
    || pathHasIgnoredSegment(normalized, [
      '.next',
      '.nuxt',
      '.svelte-kit',
      '.turbo',
      '.vite',
      '.parcel-cache',
      'coverage',
      'dist',
      'build',
      'generated',
      'target'
    ]);
}

function generatedWorkspaceSetupOwnershipPath(file: string, reasons: readonly string[]): boolean {
  if (!reasons.some((reason) => generatedWorkspaceSetupReason(reason.toLowerCase()))) return false;
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  return normalized === '.gitignore' || normalized === '.loomignore' || normalized === 'loom.json';
}

function generatedWorkspaceSetupReason(reason: string): boolean {
  return reason === 'generated_setup'
    || reason.includes('generated setup')
    || reason.includes('generated workspace setup');
}

function missingHeadBlobReasonPath(reason: string): string | undefined {
  const match = /^missing HEAD blob for (.+)$/i.exec(reason.trim());
  return match?.[1]?.trim();
}

function normalizeCollectedReasons(
  bundleReasons: readonly string[],
  staleReasons: readonly string[],
  patchStatus: FrontierSwarmPatchStatus,
  staleAgainstHead: boolean,
  bundle: FrontierSwarmMergeBundle
): string[] {
  const reasons = patchStatus === 'applies'
    ? [...bundleReasons]
    : uniqueStrings([...bundleReasons, ...staleReasons]);
  const filtered = staleAgainstHead
    ? reasons
    : reasons.filter((reason) => reason !== 'stale-against-head');
  if (
    !staleAgainstHead
    && (bundle.staleAgainstHead || bundle.disposition === 'stale-against-head')
    && patchStatus !== 'missing'
  ) {
    filtered.push('stale-against-head cleared by patch freshness check');
  }
  return uniqueStrings(filtered);
}

export async function readCodexPidProcesses(file: string): Promise<FrontierSwarmCoordinatorProcessInput[]> {
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as { entries?: Array<{ pid: number; role: string; jobId?: string; runId?: string; startedAt: number; command?: string[] }> };
  return Promise.all((parsed.entries ?? []).map(async (entry) => ({
    pid: entry.pid,
    role: entry.role,
    ...(entry.jobId ? { jobId: entry.jobId } : {}),
    ...(entry.runId ? { runId: entry.runId } : {}),
    status: await pidIsAlive(entry.pid) ? 'running' : 'missing',
    startedAt: entry.startedAt,
    ...(entry.command ? { command: entry.command } : {})
  })));
}


async function pidIsAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function resolveRunDirectory(runPath: string): Promise<string> {
  const absolute = path.resolve(runPath);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (stat?.isDirectory()) return absolute;
  if (path.basename(absolute) === 'swarm-results.json' || path.basename(absolute) === 'pids.json') return path.dirname(absolute);
  return path.dirname(absolute);
}
