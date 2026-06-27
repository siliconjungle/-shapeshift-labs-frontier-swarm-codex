import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FrontierSwarmEvidenceIndexEntryInput,
  FrontierSwarmMergeBundle
} from '@shapeshift-labs/frontier-swarm';
import { isObject, pathExists, readStringArray, stableHash, uniqueStrings } from './common.js';
import { normalizeCollectedMergeBundle } from './collect-bundles.js';
import type {
  FrontierCodexPlaywrightProofReadmission,
  FrontierCodexPlaywrightProofReadmissionRecord
} from './proof-readmission.js';

export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_ADMISSION_FILE = 'playwright-proof-parent-admission.json';
export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_ADMISSION_KIND = 'frontier-swarm-codex.playwright-proof-parent-admission';

export type FrontierCodexPlaywrightProofParentAdmissionStatus =
  | 'ready-for-parent-recheck'
  | 'blocked'
  | 'unlinked'
  | 'missing-parent-bundle';

export interface FrontierCodexPlaywrightProofParentAdmissionRecord {
  readonly id: string;
  readonly proofReadmissionRecordId: string;
  readonly artifactRecordId: string;
  readonly artifactPath: string;
  readonly proofJobId: string;
  readonly proofReadmissionStatus: FrontierCodexPlaywrightProofReadmissionRecord['status'];
  readonly sourceJobId?: string;
  readonly sourceTaskId?: string;
  readonly sourceBucket?: string;
  readonly sourceMergePath?: string;
  readonly resolvedSourceMergePath?: string;
  readonly sourceOutputDir?: string;
  readonly sourceBundleLoaded: boolean;
  readonly sourceBundlePatchPath?: string;
  readonly sourceBundleChangedPaths: readonly string[];
  readonly sourceBundleDisposition?: string;
  readonly sourceBundleMergeReadiness?: string;
  readonly language: FrontierCodexPlaywrightProofReadmissionRecord['language'];
  readonly validator?: string;
  readonly status: FrontierCodexPlaywrightProofParentAdmissionStatus;
  readonly action: 'recheck-parent-bundle' | 'keep-parent-blocked';
  readonly reasonCodes: readonly string[];
  readonly reasons: readonly string[];
  readonly runtimeEvidenceBound: boolean;
  readonly mergeStatus?: string;
  readonly proofStatus?: string;
}

export interface FrontierCodexPlaywrightProofParentAdmission {
  readonly kind: typeof FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_ADMISSION_KIND;
  readonly version: 1;
  readonly id: string;
  readonly generatedAt: number;
  readonly records: readonly FrontierCodexPlaywrightProofParentAdmissionRecord[];
  readonly summary: {
    readonly total: number;
    readonly readyForParentRecheck: number;
    readonly blocked: number;
    readonly unlinked: number;
    readonly missingParentBundle: number;
    readonly sourceBundleLoaded: number;
    readonly admittedProofs: number;
  };
}

export async function createCodexPlaywrightProofParentAdmission(input: {
  readonly proofReadmission: FrontierCodexPlaywrightProofReadmission;
  readonly cwd?: string;
  readonly collectionDir?: string;
  readonly generatedAt?: number;
}): Promise<FrontierCodexPlaywrightProofParentAdmission | undefined> {
  if (!input.proofReadmission.records.length) return undefined;
  const records: FrontierCodexPlaywrightProofParentAdmissionRecord[] = [];
  for (const record of input.proofReadmission.records) {
    records.push(await createParentAdmissionRecord(record, input));
  }
  return {
    kind: FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_ADMISSION_KIND,
    version: 1,
    id: `codex-playwright-proof-parent-admission:${stableHash(records.map((record) => record.id))}`,
    generatedAt: input.generatedAt ?? Date.now(),
    records,
    summary: summarizeParentAdmission(records)
  };
}

export function createCodexPlaywrightProofParentAdmissionEvidenceEntries(
  records: readonly FrontierCodexPlaywrightProofParentAdmissionRecord[]
): FrontierSwarmEvidenceIndexEntryInput[] {
  return records.map((record) => ({
    jobId: record.sourceJobId ?? record.proofJobId,
    ...(record.sourceTaskId ? { taskId: record.sourceTaskId } : {}),
    topic: 'playwright-proof-parent-admission',
    path: record.resolvedSourceMergePath ?? record.sourceMergePath ?? record.artifactPath,
    kind: 'playwright-proof-parent-admission',
    status: record.status,
    confidence: record.status === 'ready-for-parent-recheck' ? 0.88 : record.status === 'blocked' ? 0.45 : 0.25,
    tags: uniqueStrings([
      'playwright-proof-parent-admission',
      `playwright-proof-parent-admission-${record.status}`,
      record.language,
      record.runtimeEvidenceBound ? 'runtime-evidence-bound' : '',
      record.sourceBundleLoaded ? 'source-bundle-loaded' : ''
    ]),
    facets: {
      proofJobId: record.proofJobId,
      proofReadmissionStatus: record.proofReadmissionStatus,
      sourceJobId: record.sourceJobId ?? '',
      sourceTaskId: record.sourceTaskId ?? '',
      sourceBucket: record.sourceBucket ?? '',
      sourceMergePath: record.sourceMergePath ?? '',
      resolvedSourceMergePath: record.resolvedSourceMergePath ?? '',
      language: record.language,
      validator: record.validator ?? '',
      mergeStatus: record.mergeStatus ?? '',
      proofStatus: record.proofStatus ?? '',
      action: record.action,
      reasonCodes: record.reasonCodes.join(',')
    }
  }));
}

async function createParentAdmissionRecord(
  record: FrontierCodexPlaywrightProofReadmissionRecord,
  input: {
    readonly cwd?: string;
    readonly collectionDir?: string;
  }
): Promise<FrontierCodexPlaywrightProofParentAdmissionRecord> {
  const sourceBundle = record.sourceBundle;
  const sourceJobId = sourceBundle?.jobId;
  const sourceMerge = sourceBundle?.mergePath
    ? await readSourceMergeBundle(sourceBundle.mergePath, input)
    : undefined;
  const sourceBundleLoaded = Boolean(sourceMerge?.bundle);
  const admitted = record.status === 'admitted';
  const status: FrontierCodexPlaywrightProofParentAdmissionStatus = !sourceJobId
    ? 'unlinked'
    : !admitted
      ? 'blocked'
      : !sourceBundleLoaded
        ? 'missing-parent-bundle'
        : 'ready-for-parent-recheck';
  const action = status === 'ready-for-parent-recheck' ? 'recheck-parent-bundle' : 'keep-parent-blocked';
  const reasons = parentAdmissionReasons(record, status, sourceBundleLoaded);
  const reasonCodes = uniqueStrings([
    ...record.reasonCodes,
    status,
    action,
    record.status === 'admitted' ? 'proof-readmission-admitted' : `proof-readmission-${record.status}`
  ]);
  const bundle = sourceMerge?.bundle;
  return {
    id: `codex-playwright-proof-parent-admission-record:${stableHash([record.id, sourceJobId, status, sourceMerge?.resolvedPath])}`,
    proofReadmissionRecordId: record.id,
    artifactRecordId: record.artifactRecordId,
    artifactPath: record.artifactPath,
    proofJobId: record.jobId,
    proofReadmissionStatus: record.status,
    ...(sourceJobId ? { sourceJobId } : {}),
    ...(sourceBundle?.taskId ? { sourceTaskId: sourceBundle.taskId } : {}),
    ...(sourceBundle?.bucket ? { sourceBucket: sourceBundle.bucket } : {}),
    ...(sourceBundle?.mergePath ? { sourceMergePath: sourceBundle.mergePath } : {}),
    ...(sourceMerge?.resolvedPath ? { resolvedSourceMergePath: sourceMerge.resolvedPath } : {}),
    ...(sourceBundle?.outputDir ? { sourceOutputDir: sourceBundle.outputDir } : {}),
    sourceBundleLoaded,
    ...(bundle?.patchPath ? { sourceBundlePatchPath: bundle.patchPath } : {}),
    sourceBundleChangedPaths: bundle?.changedPaths ?? [],
    ...(bundle?.disposition ? { sourceBundleDisposition: bundle.disposition } : {}),
    ...(bundle?.mergeReadiness ? { sourceBundleMergeReadiness: bundle.mergeReadiness } : {}),
    language: record.language,
    ...(record.validator ? { validator: record.validator } : {}),
    status,
    action,
    reasonCodes,
    reasons,
    runtimeEvidenceBound: record.runtimeEvidenceBound,
    ...(record.mergeStatus ? { mergeStatus: record.mergeStatus } : {}),
    ...(record.proofStatus ? { proofStatus: record.proofStatus } : {})
  };
}

async function readSourceMergeBundle(
  mergePath: string,
  input: { readonly cwd?: string; readonly collectionDir?: string }
): Promise<{ readonly resolvedPath: string; readonly bundle: FrontierSwarmMergeBundle } | undefined> {
  for (const candidate of sourceMergePathCandidates(mergePath, input)) {
    if (!await pathExists(candidate)) continue;
    const parsed = JSON.parse(await fs.readFile(candidate, 'utf8'));
    if (!isObject(parsed)) continue;
    return {
      resolvedPath: candidate,
      bundle: normalizeCollectedMergeBundle(parsed, candidate)
    };
  }
  return undefined;
}

function sourceMergePathCandidates(
  mergePath: string,
  input: { readonly cwd?: string; readonly collectionDir?: string }
): string[] {
  if (path.isAbsolute(mergePath)) return [mergePath];
  return uniqueStrings([
    input.collectionDir ? path.resolve(input.collectionDir, mergePath) : '',
    input.cwd ? path.resolve(input.cwd, mergePath) : '',
    path.resolve(process.cwd(), mergePath)
  ]);
}

function parentAdmissionReasons(
  record: FrontierCodexPlaywrightProofReadmissionRecord,
  status: FrontierCodexPlaywrightProofParentAdmissionStatus,
  sourceBundleLoaded: boolean
): string[] {
  if (status === 'ready-for-parent-recheck') {
    return [
      'playwright proof readmission admitted',
      'source parent bundle loaded',
      'parent bundle requires stale, gate, and apply checks before landing'
    ];
  }
  if (status === 'unlinked') return ['playwright proof readmission has no source parent bundle link'];
  if (status === 'missing-parent-bundle') return ['playwright proof readmission admitted but source parent bundle could not be loaded'];
  return uniqueStrings([
    `playwright proof readmission ${record.status}`,
    ...(sourceBundleLoaded ? ['source parent bundle loaded'] : []),
    ...readStringArray(record.reasonCodes).map((reason) => `proof readmission reason: ${reason}`)
  ]);
}

function summarizeParentAdmission(
  records: readonly FrontierCodexPlaywrightProofParentAdmissionRecord[]
): FrontierCodexPlaywrightProofParentAdmission['summary'] {
  return {
    total: records.length,
    readyForParentRecheck: records.filter((record) => record.status === 'ready-for-parent-recheck').length,
    blocked: records.filter((record) => record.status === 'blocked').length,
    unlinked: records.filter((record) => record.status === 'unlinked').length,
    missingParentBundle: records.filter((record) => record.status === 'missing-parent-bundle').length,
    sourceBundleLoaded: records.filter((record) => record.sourceBundleLoaded).length,
    admittedProofs: records.filter((record) => record.proofReadmissionStatus === 'admitted').length
  };
}
