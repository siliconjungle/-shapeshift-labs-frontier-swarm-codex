import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createSwarmQueueOutcomeModel,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmQueueOutcomeModel
} from '@shapeshift-labs/frontier-swarm';
import { isObject, pathExists, stableHash, uniqueStrings } from './common.js';
import type {
  FrontierCodexProofParentRecheckRecord,
  FrontierCodexProofParentRecheckResult
} from './proof-parent-recheck-results.js';

export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_FILE = 'proof-parent-apply-candidates.json';
export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_DIR = 'proof-parent-apply-candidates';
export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_KIND = 'frontier-swarm-codex.playwright-proof-parent-apply-candidates';

export interface FrontierCodexProofParentApplyCandidateRecord {
  readonly id: string;
  readonly jobId: string;
  readonly taskId?: string;
  readonly sourceMergePath: string;
  readonly sourcePatchPath: string;
  readonly candidateMergePath: string;
  readonly candidatePatchPath: string;
  readonly recheckRecordId: string;
  readonly changedPaths: string[];
  readonly status: 'ready-for-strict-apply-admission';
  readonly reasons: string[];
}

export interface FrontierCodexProofParentApplyCandidates {
  readonly kind: typeof FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_KIND;
  readonly version: 1;
  readonly id: string;
  readonly generatedAt: number;
  readonly cwd: string;
  readonly collectionDir: string;
  readonly records: FrontierCodexProofParentApplyCandidateRecord[];
  readonly queueOutcomeModel: FrontierSwarmQueueOutcomeModel;
  readonly summary: { total: number; readyForStrictApplyAdmission: number };
}

export async function writeCodexProofParentApplyCandidates(input: {
  cwd: string;
  outDir: string;
  recheck?: FrontierCodexProofParentRecheckResult;
  generatedAt: number;
}): Promise<{ path: string; collectionDir: string; result: FrontierCodexProofParentApplyCandidates } | undefined> {
  const readyRecords = (input.recheck?.records ?? []).filter((record) => record.status === 'ready-for-apply-admission');
  if (readyRecords.length === 0) return undefined;
  const collectionDir = path.join(input.outDir, FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_DIR);
  const records: FrontierCodexProofParentApplyCandidateRecord[] = [];
  for (const record of readyRecords) {
    const candidate = await materializeCandidate(input.cwd, collectionDir, record);
    if (candidate) records.push(candidate);
  }
  if (records.length === 0) return undefined;
  const queueOutcomeModel = createSwarmQueueOutcomeModel({
    decisions: records.map((record) => queueReadyDecision(record, input.generatedAt)),
    generatedAt: input.generatedAt,
    metadata: { source: FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_KIND }
  });
  await fs.writeFile(path.join(collectionDir, 'queue-outcome-model.json'), JSON.stringify(queueOutcomeModel, null, 2) + '\n');
  const result: FrontierCodexProofParentApplyCandidates = {
    kind: FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_KIND,
    version: 1,
    id: `codex-proof-parent-apply-candidates:${stableHash(records.map((record) => record.id))}`,
    generatedAt: input.generatedAt,
    cwd: input.cwd,
    collectionDir,
    records,
    queueOutcomeModel,
    summary: { total: records.length, readyForStrictApplyAdmission: records.length }
  };
  const indexPath = path.join(collectionDir, FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_FILE);
  await fs.writeFile(indexPath, JSON.stringify(result, null, 2) + '\n');
  return { path: indexPath, collectionDir, result };
}

async function materializeCandidate(
  cwd: string,
  collectionDir: string,
  record: FrontierCodexProofParentRecheckRecord
): Promise<FrontierCodexProofParentApplyCandidateRecord | undefined> {
  if (!record.parentMergePath || !record.parentPatchPath) return undefined;
  if (!await pathExists(record.parentMergePath) || !await pathExists(record.parentPatchPath)) return undefined;
  const bundle = JSON.parse(await fs.readFile(record.parentMergePath, 'utf8')) as FrontierSwarmMergeBundle;
  const jobId = bundle.jobId || record.sourceJobId || stableHash(record.id).replace(/[^a-z0-9]/giu, '').slice(0, 12);
  const candidateDir = path.join(collectionDir, 'ready-to-apply', jobId);
  await fs.mkdir(candidateDir, { recursive: true });
  const candidatePatchPath = path.join(candidateDir, 'changes.patch');
  const candidateMergePath = path.join(candidateDir, 'merge.json');
  await fs.copyFile(record.parentPatchPath, candidatePatchPath);
  const candidateBundle = candidateBundleForParent(bundle, record);
  await fs.writeFile(candidateMergePath, JSON.stringify(candidateBundle, null, 2) + '\n');
  return {
    id: `codex-proof-parent-apply-candidate:${stableHash([record.id, jobId, record.parentMergePath])}`,
    jobId,
    ...(bundle.taskId ? { taskId: bundle.taskId } : {}),
    sourceMergePath: record.parentMergePath,
    sourcePatchPath: record.parentPatchPath,
    candidateMergePath,
    candidatePatchPath,
    recheckRecordId: record.id,
    changedPaths: uniqueStrings(bundle.changedPaths ?? record.changedPaths),
    status: 'ready-for-strict-apply-admission',
    reasons: [
      'parent proof recheck passed git apply --check and gate evidence',
      'candidate still requires strict apply admission before mutation'
    ]
  };
}

function candidateBundleForParent(
  bundle: FrontierSwarmMergeBundle,
  record: FrontierCodexProofParentRecheckRecord
): FrontierSwarmMergeBundle {
  return {
    ...bundle,
    patchPath: 'changes.patch',
    staleAgainstHead: false,
    disposition: 'auto-mergeable',
    autoMergeable: true,
    reasons: uniqueStrings([
      ...(bundle.reasons ?? []),
      'proof-parent-recheck-ready-for-apply-admission'
    ]),
    metadata: {
      ...(isObject(bundle.metadata) ? bundle.metadata : {}),
      proofParentRecheckResult: {
        id: record.id,
        status: record.status,
        applyCheckPassed: record.applyCheckPassed,
        gateEvidencePassed: record.gateEvidencePassed,
        ...(record.parentMergePath ? { sourceMergePath: record.parentMergePath } : {}),
        ...(record.parentPatchPath ? { sourcePatchPath: record.parentPatchPath } : {})
      }
    }
  };
}

function queueReadyDecision(record: FrontierCodexProofParentApplyCandidateRecord, generatedAt: number): Record<string, unknown> {
  const aliases = uniqueStrings([
    record.jobId,
    `job:${record.jobId}`,
    record.taskId,
    record.taskId ? `task:${record.taskId}` : undefined,
    record.taskId ? `queue:${record.taskId}` : undefined
  ].filter((entry): entry is string => !!entry));
  return {
    subjectId: record.taskId ?? record.jobId,
    subjectAliases: aliases,
    jobId: record.jobId,
    ...(record.taskId ? { taskId: record.taskId, queueItemIds: [record.taskId] } : { queueItemIds: [] }),
    decision: 'ready',
    category: 'continuation',
    outcome: 'ready',
    terminal: false,
    generatedAt,
    reasons: record.reasons,
    metadata: {
      source: FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_KIND,
      candidateMergePath: record.candidateMergePath,
      candidatePatchPath: record.candidatePatchPath,
      sourceMergePath: record.sourceMergePath,
      recheckRecordId: record.recheckRecordId
    }
  };
}
