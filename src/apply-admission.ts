import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FrontierSwarmMergeBundle,
  FrontierSwarmQueueOutcomeDecision,
  FrontierSwarmQueueOutcomeModel
} from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_GIT_APPLY_LEDGER_KIND,
  FRONTIER_SWARM_GIT_APPLY_LEDGER_VERSION
} from '@shapeshift-labs/frontier-swarm-git';
import { findFilesByName, isObject, pathExists, uniqueStrings } from './common.js';
import type { FrontierCodexApplyInput, FrontierCodexApplyResult } from './types-collection.js';

export interface FrontierCodexApplyAdmissionResult {
  mode: NonNullable<FrontierCodexApplyInput['admission']>;
  acceptedJobIds: string[];
  entries: NonNullable<FrontierCodexApplyResult['admission']>['entries'];
  rejected: NonNullable<FrontierCodexApplyResult['admission']>['entries'];
}

export async function createCodexApplyAdmission(input: {
  cwd: string;
  collectionDir: string;
  bucket?: FrontierCodexApplyInput['bucket'];
  jobIds?: readonly string[];
  limit?: number;
  mode: NonNullable<FrontierCodexApplyInput['admission']>;
}): Promise<FrontierCodexApplyAdmissionResult> {
  const bundles = await readCodexApplyCandidateBundles(input);
  if (input.mode === 'off') {
    return {
      mode: input.mode,
      acceptedJobIds: input.jobIds ? [...input.jobIds] : bundles.map((entry) => entry.bundle.jobId),
      entries: bundles.map(({ bundle, bundlePath }) => ({
        jobId: bundle.jobId,
        bundlePath,
        status: 'accepted',
        reasons: ['admission disabled'],
        queueOutcomeDecisionIds: [],
        gateEvidence: gateEvidenceForBundle(bundle)
      })),
      rejected: []
    };
  }
  const queueOutcomeModel = await readCodexApplyQueueOutcomeModel(input.collectionDir);
  const entries = bundles.map(({ bundle, bundlePath }) => {
    const queueDecisions = queueOutcomeDecisionsForBundle(queueOutcomeModel, bundle);
    const gateEvidence = gateEvidenceForBundle(bundle);
    const reasons: string[] = [];
    if (!queueOutcomeModel) reasons.push('missing queue outcome model');
    if (bundle.queueItemIds.length === 0) reasons.push('missing queue item ids');
    if (queueOutcomeModel && queueDecisions.length === 0) reasons.push('missing ready queue outcome');
    if (!bundleHasGateEvidence(bundle, gateEvidence)) reasons.push('missing worker gate evidence');
    return {
      jobId: bundle.jobId,
      bundlePath,
      status: reasons.length === 0 ? 'accepted' as const : input.mode === 'warn' ? 'warn' as const : 'rejected' as const,
      reasons: reasons.length ? reasons : ['admission passed'],
      queueOutcomeDecisionIds: queueDecisions.map((decision) => decision.id),
      gateEvidence
    };
  });
  return {
    mode: input.mode,
    acceptedJobIds: input.mode === 'strict'
      ? entries.filter((entry) => entry.status === 'accepted').map((entry) => entry.jobId)
      : input.jobIds ? [...input.jobIds] : bundles.map((entry) => entry.bundle.jobId),
    entries,
    rejected: entries.filter((entry) => entry.status === 'rejected')
  };
}

export function attachCodexApplyAdmission(
  result: FrontierCodexApplyResult,
  admission: FrontierCodexApplyAdmissionResult
): FrontierCodexApplyResult {
  const admissionByJob = new Map(admission.entries.map((entry) => [entry.jobId, entry]));
  const existingEntries = result.entries.map((entry) => ({
    ...entry,
    ...(admissionByJob.has(entry.jobId) ? { admission: admissionByJob.get(entry.jobId) } : {})
  }));
  const existingJobIds = new Set(existingEntries.map((entry) => entry.jobId));
  const rejectedEntries: FrontierCodexApplyResult['entries'] = admission.rejected
    .filter((entry) => !existingJobIds.has(entry.jobId))
    .map((entry) => ({
      jobId: entry.jobId,
      status: 'failed',
      bundlePath: entry.bundlePath,
      dryRun: result.dryRun,
      commands: [],
      admission: entry,
      error: `apply admission rejected: ${entry.reasons.join(', ')}`
    }));
  const entries = [...existingEntries, ...rejectedEntries];
  const summary = {
    total: entries.length,
    checked: entries.filter((entry) => entry.status === 'checked').length,
    applied: entries.filter((entry) => entry.status === 'applied').length,
    committed: entries.filter((entry) => entry.status === 'committed').length,
    skipped: entries.filter((entry) => entry.status === 'skipped').length,
    failed: entries.filter((entry) => entry.status === 'failed').length
  };
  return {
    ...result,
    ok: summary.failed === 0 && result.ok,
    entries,
    admission: {
      mode: admission.mode,
      total: admission.entries.length,
      accepted: admission.entries.filter((entry) => entry.status === 'accepted').length,
      rejected: admission.entries.filter((entry) => entry.status === 'rejected').length,
      warned: admission.entries.filter((entry) => entry.status === 'warn').length,
      entries: admission.entries
    },
    summary
  };
}

export function createEmptyApplyResult(input: {
  cwd: string;
  collectionDir: string;
  outDir?: string;
  dryRun: boolean;
}): FrontierCodexApplyResult {
  return {
    kind: FRONTIER_SWARM_GIT_APPLY_LEDGER_KIND,
    version: FRONTIER_SWARM_GIT_APPLY_LEDGER_VERSION,
    ok: true,
    cwd: input.cwd,
    collectionDir: input.collectionDir,
    outDir: path.resolve(input.cwd, input.outDir ?? path.join(input.collectionDir, 'apply-ledger')),
    generatedAt: Date.now(),
    dryRun: input.dryRun,
    entries: [],
    summary: {
      total: 0,
      checked: 0,
      applied: 0,
      committed: 0,
      skipped: 0,
      failed: 0
    }
  };
}

async function readCodexApplyCandidateBundles(input: {
  collectionDir: string;
  bucket?: FrontierCodexApplyInput['bucket'];
  jobIds?: readonly string[];
  limit?: number;
}): Promise<Array<{ bundlePath: string; bundle: FrontierSwarmMergeBundle }>> {
  const bucket = input.bucket ?? 'ready-to-apply';
  const bucketNames = ['ready-to-apply', 'research-complete', 'needs-human-port', 'rerun-work', 'failed-evidence', 'stale-against-head'];
  const roots = bucket === 'all' ? bucketNames.map((entry) => path.join(input.collectionDir, entry)) : [path.join(input.collectionDir, bucket)];
  const wanted = new Set(input.jobIds ?? []);
  const mergePaths = (await Promise.all(roots.map((root) => findFilesByName(root, 'merge.json')))).flat().sort();
  const selected = input.limit ? mergePaths.slice(0, Math.max(0, Math.floor(input.limit))) : mergePaths;
  const bundles: Array<{ bundlePath: string; bundle: FrontierSwarmMergeBundle }> = [];
  for (const bundlePath of selected) {
    const bundle = JSON.parse(await fs.readFile(bundlePath, 'utf8')) as FrontierSwarmMergeBundle;
    if (wanted.size && !wanted.has(bundle.jobId)) continue;
    bundles.push({ bundlePath, bundle });
  }
  return bundles;
}

async function readCodexApplyQueueOutcomeModel(collectionDir: string): Promise<FrontierSwarmQueueOutcomeModel | undefined> {
  const collectionPath = path.join(collectionDir, 'collection.json');
  if (await pathExists(collectionPath)) {
    const parsed = JSON.parse(await fs.readFile(collectionPath, 'utf8')) as { queueOutcomeModel?: FrontierSwarmQueueOutcomeModel };
    if (isObject(parsed.queueOutcomeModel) && Array.isArray(parsed.queueOutcomeModel.decisions)) return parsed.queueOutcomeModel;
  }
  const modelPath = path.join(collectionDir, 'queue-outcome-model.json');
  if (!await pathExists(modelPath)) return undefined;
  const parsed = JSON.parse(await fs.readFile(modelPath, 'utf8')) as FrontierSwarmQueueOutcomeModel;
  return isObject(parsed) && Array.isArray(parsed.decisions) ? parsed : undefined;
}

function queueOutcomeDecisionsForBundle(
  model: FrontierSwarmQueueOutcomeModel | undefined,
  bundle: FrontierSwarmMergeBundle
): FrontierSwarmQueueOutcomeDecision[] {
  if (!model) return [];
  const aliases = new Set(uniqueStrings([
    bundle.jobId,
    `job:${bundle.jobId}`,
    bundle.taskId,
    bundle.taskId ? `task:${bundle.taskId}` : undefined,
    ...bundle.queueItemIds,
    ...bundle.queueItemIds.map((id) => `queue:${id}`)
  ].filter((entry): entry is string => !!entry)));
  return model.decisions.filter((decision) => {
    if (decision.outcome !== 'ready' && decision.decision !== 'ready') return false;
    if (decision.jobId && aliases.has(decision.jobId)) return true;
    if (decision.taskId && aliases.has(decision.taskId)) return true;
    if (decision.subjectId && aliases.has(decision.subjectId)) return true;
    return decision.subjectAliases.some((alias) => aliases.has(alias))
      || decision.queueItemIds.some((id) => aliases.has(id) || aliases.has(`queue:${id}`));
  });
}

function gateEvidenceForBundle(bundle: FrontierSwarmMergeBundle): NonNullable<FrontierCodexApplyResult['admission']>['entries'][number]['gateEvidence'] {
  return {
    passedCommandCount: bundle.commandsPassed.length,
    failedCommandCount: bundle.commandsFailed.length,
    status: bundle.status,
    mergeReadiness: bundle.mergeReadiness
  };
}

function bundleHasGateEvidence(
  bundle: FrontierSwarmMergeBundle,
  evidence: ReturnType<typeof gateEvidenceForBundle>
): boolean {
  if (evidence.passedCommandCount > 0 && evidence.failedCommandCount === 0) return true;
  if (bundle.status === 'verified') return true;
  if (bundle.mergeReadiness === 'verified-patch') return true;
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  return isObject(metadata.verificationGateEvidence);
}
