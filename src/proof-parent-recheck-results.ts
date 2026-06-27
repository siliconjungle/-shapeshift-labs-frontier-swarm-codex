import fs from 'node:fs/promises';
import path from 'node:path';
import {
  type FrontierSwarmBacklog,
  type FrontierSwarmBacklogEntry,
  type FrontierSwarmMergeBundle
} from '@shapeshift-labs/frontier-swarm';
import { isObject, pathExists, resolveBundlePatchPath, runProcess, stableHash, tail, uniqueStrings } from './common.js';
import { FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_ROUTE } from './proof-parent-recheck-tasks.js';
import type { FrontierCodexCollectResult } from './types-collection.js';

export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_RESULT_FILE = 'proof-parent-recheck-results.json';
export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_RESULT_KIND = 'frontier-swarm-codex.playwright-proof-parent-recheck-results';

export type FrontierCodexProofParentRecheckStatus =
  | 'ready-for-apply-admission'
  | 'needs-gates'
  | 'stale-or-conflict'
  | 'blocked-parent-state'
  | 'missing-parent-bundle'
  | 'missing-parent-patch'
  | 'invalid-recheck-task';

export interface FrontierCodexProofParentRecheckRecord {
  readonly id: string;
  readonly taskId: string;
  readonly entryId: string;
  readonly status: FrontierCodexProofParentRecheckStatus;
  readonly sourceJobId?: string;
  readonly sourceTaskId?: string;
  readonly parentMergePath?: string;
  readonly parentPatchPath?: string;
  readonly changedPaths: string[];
  readonly gateEvidencePassed: boolean;
  readonly applyCheckPassed: boolean;
  readonly applyCheckStatus?: number;
  readonly reasons: string[];
  readonly command?: { command: string[]; stderrTail: string[]; stdoutTail: string[] };
  readonly metadata: Record<string, unknown>;
}

export interface FrontierCodexProofParentRecheckResult {
  readonly kind: typeof FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_RESULT_KIND;
  readonly version: 1;
  readonly id: string;
  readonly generatedAt: number;
  readonly cwd: string;
  readonly collectionDir?: string;
  readonly continuationDir: string;
  readonly records: FrontierCodexProofParentRecheckRecord[];
  readonly summary: Record<FrontierCodexProofParentRecheckStatus, number> & { total: number };
}

export async function writeCodexProofParentRecheckResults(input: {
  cwd: string;
  outDir: string;
  collection?: FrontierCodexCollectResult;
  backlog: FrontierSwarmBacklog;
  generatedAt: number;
}): Promise<{ path: string; result: FrontierCodexProofParentRecheckResult } | undefined> {
  const records: FrontierCodexProofParentRecheckRecord[] = [];
  for (const entry of input.backlog.entries) {
    if (!isParentRecheckEntry(entry)) continue;
    records.push(await classifyParentRecheckEntry(entry, input));
  }
  if (records.length === 0) return undefined;
  const result: FrontierCodexProofParentRecheckResult = {
    kind: FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_RESULT_KIND,
    version: 1,
    id: `codex-proof-parent-recheck-results:${stableHash(records.map((record) => record.id))}`,
    generatedAt: input.generatedAt,
    cwd: input.cwd,
    ...(input.collection?.outDir ? { collectionDir: input.collection.outDir } : {}),
    continuationDir: input.outDir,
    records,
    summary: summarize(records)
  };
  const outPath = path.join(input.outDir, FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_RESULT_FILE);
  await fs.writeFile(outPath, JSON.stringify(result, null, 2) + '\n');
  return { path: outPath, result };
}

async function classifyParentRecheckEntry(
  entry: FrontierSwarmBacklogEntry,
  input: { cwd: string; collection?: FrontierCodexCollectResult }
): Promise<FrontierCodexProofParentRecheckRecord> {
  const proof = proofParentAdmission(entry);
  const taskId = entry.taskId ?? entry.id;
  const parentMergePath = resolveParentMergePath(input.cwd, input.collection, proof, entry);
  const base = {
    taskId,
    entryId: entry.id,
    ...(stringValue(proof.sourceJobId) ? { sourceJobId: stringValue(proof.sourceJobId) } : {}),
    ...(stringValue(proof.sourceTaskId) ? { sourceTaskId: stringValue(proof.sourceTaskId) } : {}),
    ...(parentMergePath ? { parentMergePath } : {}),
    metadata: { proofParentAdmission: proof, entryStatus: entry.status }
  };
  if (!parentMergePath || !await pathExists(parentMergePath)) {
    return record(base, 'missing-parent-bundle', [], false, false, ['parent merge bundle is missing']);
  }
  const bundle = JSON.parse(await fs.readFile(parentMergePath, 'utf8')) as FrontierSwarmMergeBundle;
  const patchPath = await resolveParentPatchPath(bundle, parentMergePath);
  if (!patchPath) return record(base, 'missing-parent-patch', bundle.changedPaths ?? [], gateEvidencePassed(bundle), false, ['parent patch is missing']);
  const applyCheck = await runProcess('git', ['apply', '--check', patchPath], { cwd: input.cwd, allowFailure: true });
  const gatesPassed = gateEvidencePassed(bundle);
  const hardBlocked = parentBundleHardBlocked(bundle);
  const reasons = parentRecheckReasons(bundle, gatesPassed, hardBlocked, applyCheck.status);
  const status: FrontierCodexProofParentRecheckStatus = hardBlocked
    ? 'blocked-parent-state'
    : applyCheck.status !== 0
      ? 'stale-or-conflict'
      : gatesPassed
        ? 'ready-for-apply-admission'
        : 'needs-gates';
  return {
    ...record(base, status, bundle.changedPaths ?? [], gatesPassed, applyCheck.status === 0, reasons),
    parentPatchPath: patchPath,
    applyCheckStatus: applyCheck.status,
    command: {
      command: ['git', 'apply', '--check', patchPath],
      stderrTail: tail(applyCheck.stderr, 8),
      stdoutTail: tail(applyCheck.stdout, 8)
    }
  };
}

function isParentRecheckEntry(entry: FrontierSwarmBacklogEntry): boolean {
  const proof = proofParentAdmission(entry);
  return entry.tags.includes(FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_ROUTE) || Object.keys(proof).length > 0;
}

function proofParentAdmission(entry: FrontierSwarmBacklogEntry): Record<string, unknown> {
  const metadata = isObject(entry.metadata) ? entry.metadata : {};
  return isObject(metadata.proofParentAdmission) ? metadata.proofParentAdmission : {};
}

function resolveParentMergePath(
  cwd: string,
  collection: FrontierCodexCollectResult | undefined,
  proof: Record<string, unknown>,
  entry: FrontierSwarmBacklogEntry
): string | undefined {
  const candidate = stringValue(proof.resolvedSourceMergePath) ?? stringValue(proof.sourceMergePath)
    ?? entry.targetRefs.find((ref) => ref.endsWith('merge.json'));
  if (!candidate) return undefined;
  if (path.isAbsolute(candidate)) return candidate;
  return path.resolve(collection?.outDir ?? cwd, candidate);
}

async function resolveParentPatchPath(bundle: FrontierSwarmMergeBundle, mergePath: string): Promise<string | undefined> {
  const explicit = resolveBundlePatchPath(bundle, mergePath);
  if (explicit && await pathExists(explicit)) return explicit;
  const sibling = path.join(path.dirname(mergePath), 'changes.patch');
  return await pathExists(sibling) ? sibling : undefined;
}

function gateEvidencePassed(bundle: FrontierSwarmMergeBundle): boolean {
  if ((bundle.commandsPassed?.length ?? 0) > 0 && (bundle.commandsFailed?.length ?? 0) === 0) return true;
  if (bundle.status === 'verified' || bundle.mergeReadiness === 'verified-patch') return true;
  return isObject(bundle.metadata) && isObject(bundle.metadata.verificationGateEvidence);
}

function parentBundleHardBlocked(bundle: FrontierSwarmMergeBundle): boolean {
  return bundle.status === 'failed' || bundle.disposition === 'rejected' || bundle.disposition === 'blocked' || (bundle.commandsFailed?.length ?? 0) > 0;
}

function parentRecheckReasons(bundle: FrontierSwarmMergeBundle, gatesPassed: boolean, hardBlocked: boolean, applyStatus: number): string[] {
  return uniqueStrings([
    hardBlocked ? 'parent bundle is failed, rejected, blocked, or has failed commands' : undefined,
    applyStatus === 0 ? 'parent patch applies cleanly to current head' : 'parent patch failed git apply --check against current head',
    gatesPassed ? 'parent bundle has gate evidence' : 'parent bundle still needs gate evidence',
    'admitted Playwright proof only satisfies the missing proof route; strict apply admission is still required'
  ].filter((entry): entry is string => !!entry));
}

function record(
  base: Omit<FrontierCodexProofParentRecheckRecord, 'id' | 'status' | 'changedPaths' | 'gateEvidencePassed' | 'applyCheckPassed' | 'reasons'>,
  status: FrontierCodexProofParentRecheckStatus,
  changedPaths: readonly string[],
  gateEvidencePassed: boolean,
  applyCheckPassed: boolean,
  reasons: readonly string[]
): FrontierCodexProofParentRecheckRecord {
  return {
    id: `codex-proof-parent-recheck:${stableHash([base.taskId, base.parentMergePath, status, reasons])}`,
    ...base,
    status,
    changedPaths: uniqueStrings(changedPaths),
    gateEvidencePassed,
    applyCheckPassed,
    reasons: [...reasons]
  };
}

function summarize(records: readonly FrontierCodexProofParentRecheckRecord[]): FrontierCodexProofParentRecheckResult['summary'] {
  const summary = {
    total: records.length,
    'ready-for-apply-admission': 0,
    'needs-gates': 0,
    'stale-or-conflict': 0,
    'blocked-parent-state': 0,
    'missing-parent-bundle': 0,
    'missing-parent-patch': 0,
    'invalid-recheck-task': 0
  };
  for (const entry of records) summary[entry.status] += 1;
  return summary;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
