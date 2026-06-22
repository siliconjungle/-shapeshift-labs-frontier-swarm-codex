import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FRONTIER_SWARM_CODEX_COLLECTION_KIND,
  FRONTIER_SWARM_CODEX_COLLECTION_VERSION
} from './constants.js';
import { isObject } from './common.js';
import { createBoundedCodexArtifactStore } from './collect-artifact-store.js';
import type {
  FrontierCodexApplyLedgerSummary,
  FrontierCodexCollectBucket,
  FrontierCodexCollectInput,
  FrontierCodexCollectedBundle,
  FrontierCodexCollectResult,
  FrontierCodexLandedHealthSummary
} from './index.js';

export function createCodexCollectSummary(input: {
  mergeRecordCount: number;
  buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>;
  collectorGeneratedPatchCount: number;
  applyLedgerSummary?: FrontierCodexApplyLedgerSummary;
  landedHealth?: FrontierCodexLandedHealthSummary;
}): FrontierCodexCollectResult['summary'] {
  const summary: FrontierCodexCollectResult['summary'] = {
    total: input.mergeRecordCount,
    'ready-to-apply': input.buckets['ready-to-apply'].length,
    'research-complete': input.buckets['research-complete'].length,
    'needs-human-port': input.buckets['needs-human-port'].length,
    'rerun-work': input.buckets['rerun-work'].length,
    'failed-evidence': input.buckets['failed-evidence'].length,
    'stale-against-head': input.buckets['stale-against-head'].length,
    collectorGeneratedPatchCount: input.collectorGeneratedPatchCount
  };
  if (input.applyLedgerSummary) {
    summary.landed = input.applyLedgerSummary.landed;
    summary.landedJobIds = input.applyLedgerSummary.landedJobIds;
    summary.applyLedger = input.applyLedgerSummary;
    if (input.landedHealth) summary.landedHealth = input.landedHealth;
  }
  return summary;
}

export function createCodexCollectResult(input: Omit<FrontierCodexCollectResult, 'kind' | 'version' | 'ok'>): FrontierCodexCollectResult {
  const landedHealth = input.landedHealth;
  const summary = input.summary;
  return {
    kind: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
    version: FRONTIER_SWARM_CODEX_COLLECTION_VERSION,
    ok: landedHealth
      ? landedHealth.remainingFailedEvidenceCount === 0 && landedHealth.remainingStaleCount === 0
      : summary['failed-evidence'] === 0 && summary['stale-against-head'] === 0 && summary['rerun-work'] === 0,
    ...input
  };
}

export async function persistCodexCollectResult(input: {
  result: FrontierCodexCollectResult;
  artifactStoreMode?: FrontierCodexCollectInput['artifactStoreMode'];
  artifactStoreTimeoutMs?: number;
}): Promise<FrontierCodexCollectResult> {
  const { result } = input;
  await fs.mkdir(result.outDir, { recursive: true });
  const collectionPath = path.join(result.outDir, 'collection.json');
  await fs.writeFile(collectionPath, JSON.stringify(result, null, 2) + '\n');
  await writeResultArtifactFiles(result);
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

async function writeResultArtifactFiles(result: FrontierCodexCollectResult): Promise<void> {
  const writes: Array<[string, unknown]> = [
    ['merge-index.json', result.mergeIndex],
    ['queue-overlay.json', result.queueOverlay],
    ['strategy-tournament.json', result.strategyTournament],
    ['strategy-history.json', result.strategyHistory],
    ['tournament-adaptive-feedback.json', result.tournamentAdaptiveFeedback],
    ['evidence-index.json', result.evidenceIndex],
    ['merge-admission.json', result.admission],
    ['coordinator-query.json', result.dashboard],
    ['compact-dashboard.json', result.compactDashboard],
    ['queue-outcome-model.json', result.queueOutcomeModel],
    ['terminal-state.json', result.terminalState]
  ];
  await Promise.all(writes.map(([file, value]) => fs.writeFile(path.join(result.outDir, file), JSON.stringify(value, null, 2) + '\n')));
}
