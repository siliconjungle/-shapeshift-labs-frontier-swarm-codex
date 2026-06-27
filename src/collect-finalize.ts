import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FRONTIER_SWARM_CODEX_COLLECTION_KIND,
  FRONTIER_SWARM_CODEX_COLLECTION_VERSION
} from './constants.js';
import { isObject } from './common.js';
import { createBoundedCodexArtifactStore } from './collect-artifact-store.js';
import {
  FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE,
  createCodexProofRouteBacklog
} from './proof-route-tasks.js';
import { FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE } from './proof-artifacts.js';
import { FRONTIER_CODEX_PLAYWRIGHT_PROOF_READMISSION_FILE } from './proof-readmission.js';
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
  proofRouteTaskCount?: number;
  proofRouteBacklogPath?: string;
  proofArtifactCount?: number;
  proofArtifactPassedCount?: number;
  proofArtifactFailedCount?: number;
  proofArtifactValidatorCandidateCount?: number;
  proofArtifactsPath?: string;
  proofReadmissionCount?: number;
  proofReadmissionAdmittedCount?: number;
  proofReadmissionBlockedCount?: number;
  proofReadmissionSourceLinkedCount?: number;
  proofReadmissionPath?: string;
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
  if (input.proofRouteTaskCount) {
    summary.proofRouteTaskCount = input.proofRouteTaskCount;
    if (input.proofRouteBacklogPath) summary.proofRouteBacklogPath = input.proofRouteBacklogPath;
  }
  if (input.proofArtifactCount) {
    summary.proofArtifactCount = input.proofArtifactCount;
    summary.proofArtifactPassedCount = input.proofArtifactPassedCount ?? 0;
    summary.proofArtifactFailedCount = input.proofArtifactFailedCount ?? 0;
    summary.proofArtifactValidatorCandidateCount = input.proofArtifactValidatorCandidateCount ?? 0;
    if (input.proofArtifactsPath) summary.proofArtifactsPath = input.proofArtifactsPath;
  }
  if (input.proofReadmissionCount) {
    summary.proofReadmissionCount = input.proofReadmissionCount;
    summary.proofReadmissionAdmittedCount = input.proofReadmissionAdmittedCount ?? 0;
    summary.proofReadmissionBlockedCount = input.proofReadmissionBlockedCount ?? 0;
    summary.proofReadmissionSourceLinkedCount = input.proofReadmissionSourceLinkedCount ?? 0;
    if (input.proofReadmissionPath) summary.proofReadmissionPath = input.proofReadmissionPath;
  }
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
  const proofRouteBacklog = createCodexProofRouteBacklog({ collection: result });
  if (proofRouteBacklog.entries.length > 0) {
    const proofRouteBacklogPath = path.join(result.outDir, 'proof-route-backlog.json');
    result.proofRouteBacklog = proofRouteBacklog;
    result.proofRouteBacklogPath = proofRouteBacklogPath;
    result.summary.proofRouteTaskCount = proofRouteBacklog.entries.length;
    result.summary.proofRouteBacklogPath = proofRouteBacklogPath;
    result.metadata = {
      ...(isObject(result.metadata) ? result.metadata : {}),
      proofRouteBacklog: {
        path: proofRouteBacklogPath,
        entryCount: proofRouteBacklog.entries.length,
        routeNext: FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE
      }
    };
    await fs.writeFile(proofRouteBacklogPath, JSON.stringify(proofRouteBacklogChildArtifact(proofRouteBacklog), null, 2) + '\n');
  }
  if (result.proofArtifacts?.records.length && result.proofArtifactsPath) {
    result.metadata = {
      ...(isObject(result.metadata) ? result.metadata : {}),
      proofArtifacts: {
        path: result.proofArtifactsPath,
        artifactCount: result.proofArtifacts.summary.artifactCount,
        validatorCandidateCount: result.proofArtifacts.summary.validatorCandidateCount
      }
    };
  }
  if (result.proofReadmission?.records.length && result.proofReadmissionPath) {
    result.metadata = {
      ...(isObject(result.metadata) ? result.metadata : {}),
      proofReadmission: {
        path: result.proofReadmissionPath,
        admitted: result.proofReadmission.summary.admitted,
        blocked: result.proofReadmission.summary.blocked
      }
    };
  }
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
    ['terminal-state.json', result.terminalState],
    ...(result.proofArtifacts ? [[FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE, result.proofArtifacts] as [string, unknown]] : []),
    ...(result.proofReadmission ? [[FRONTIER_CODEX_PLAYWRIGHT_PROOF_READMISSION_FILE, result.proofReadmission] as [string, unknown]] : []),
    ...(result.proofRouteBacklog ? [['proof-route-backlog.json', proofRouteBacklogChildArtifact(result.proofRouteBacklog)] as [string, unknown]] : [])
  ];
  await Promise.all(writes.map(([file, value]) => fs.writeFile(path.join(result.outDir, file), JSON.stringify(value, null, 2) + '\n')));
}

function proofRouteBacklogChildArtifact(backlog: NonNullable<FrontierCodexCollectResult['proofRouteBacklog']>): Record<string, unknown> {
  const metadata = (backlog as { metadata?: unknown }).metadata;
  return {
    id: backlog.id,
    title: backlog.title,
    entries: backlog.entries,
    ...(isObject(metadata) ? { metadata } : {})
  };
}
