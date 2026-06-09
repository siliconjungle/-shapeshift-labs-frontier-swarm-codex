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
  type FrontierSwarmCoordinatorProcessInput,
  type FrontierSwarmEvidenceIndexEntryInput,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmPatchStatus
} from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_COLLECTION_KIND, FRONTIER_SWARM_CODEX_COLLECTION_VERSION } from './constants.js';
import type { FrontierCodexCollectBucket, FrontierCodexCollectInput, FrontierCodexCollectedBundle, FrontierCodexCollectResult } from './index.js';
import { findFilesByName, isObject, pathExists, pathHasIgnoredSegment, resolveBundlePatchPath, slug, uniqueStrings } from './common.js';
import { createCodexCompactDashboard } from './dashboard.js';
import {
  bundlePatchStaleness,
  classifyCodexCollectBucket,
  mergeRecordScore,
  normalizeCollectedDisposition,
  normalizeCollectedMergeBundle,
  normalizeCollectedStaleAgainstHead
} from './collect-bundles.js';
import { copyOrWriteCollectedEvidenceSummary, createCollectedEvidenceEntries } from './collect-evidence.js';
import { semanticImportSummaryFromBundle, summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import { createCodexArtifactStore } from './artifact-store.js';
import { enrichCollectedCoordinatorDashboard } from './collect-dashboard.js';
import { contextBudgetFromBundle } from './context-budget.js';


export async function collectCodexSwarmRun(input: FrontierCodexCollectInput): Promise<FrontierCodexCollectResult> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const runDir = await resolveRunDirectory(input.run);
  const outDir = path.resolve(cwd, input.outDir ?? path.join(runDir, 'collected'));
  const buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]> = {
    'ready-to-apply': [],
    'needs-human-port': [],
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
      ? { stale: false, patchStatus: patchExists ? 'unknown' : 'missing', reasons: ['stale check disabled'], fresh: false }
      : await bundlePatchStaleness(bundle, mergePath, cwd);
    const staleAgainstHead = normalizeCollectedStaleAgainstHead(bundle, staleness, input.checkStale !== false);
    const disposition = normalizeCollectedDisposition(bundle, staleAgainstHead);
    const bucket = classifyCodexCollectBucket({ ...bundle, staleAgainstHead, disposition }, staleAgainstHead);
    const branchName = input.branchPrefix ? `${input.branchPrefix}/${slug(bundle.jobId)}` : bundle.branchName;
    const outputDir = path.join(outDir, bucket, slug(bundle.jobId));
    const collectedEvidencePath = path.join(outputDir, 'evidence.json');
    const semanticImport = semanticImportSummaryFromBundle(bundle);
    const semanticImportQuality = summarizeCodexSemanticImportQuality(semanticImport, semanticImportExpected);
    semanticImportQualities.set(bundle.jobId, semanticImportQuality);
    const contextBudget = contextBudgetFromBundle(bundle);
    if (contextBudget) contextBudgets.set(bundle.jobId, contextBudget);
    const collectReasons = normalizeCollectedReasons(bundle.reasons, staleness.reasons, staleness.patchStatus, staleAgainstHead, bundle);
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
  }), semanticImportQualities, semanticImportExpected, contextBudgets);
  const compactDashboard = createCodexCompactDashboard({
    runDir,
    dashboard,
    strategyTournament,
    semanticImportExpected,
    generatedAt
  });
  const summary = {
    total: mergeRecords.length,
    'ready-to-apply': buckets['ready-to-apply'].length,
    'needs-human-port': buckets['needs-human-port'].length,
    'failed-evidence': buckets['failed-evidence'].length,
    'stale-against-head': buckets['stale-against-head'].length
  };
  const result: FrontierCodexCollectResult = {
    kind: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
    version: FRONTIER_SWARM_CODEX_COLLECTION_VERSION,
    ok: summary['failed-evidence'] === 0 && summary['stale-against-head'] === 0,
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
    summary
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'collection.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'merge-index.json'), JSON.stringify(mergeIndex, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'queue-overlay.json'), JSON.stringify(queueOverlay, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'strategy-tournament.json'), JSON.stringify(strategyTournament, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'strategy-history.json'), JSON.stringify(strategyHistory, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'tournament-adaptive-feedback.json'), JSON.stringify(tournamentAdaptiveFeedback, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'evidence-index.json'), JSON.stringify(evidenceIndex, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'merge-admission.json'), JSON.stringify(admission, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'coordinator-query.json'), JSON.stringify(dashboard, null, 2) + '\n');
  await fs.writeFile(path.join(outDir, 'compact-dashboard.json'), JSON.stringify(compactDashboard, null, 2) + '\n');
  result.artifactStore = await createCodexArtifactStore({ collection: result });
  await fs.writeFile(path.join(outDir, 'collection.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
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
