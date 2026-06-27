import fs from 'node:fs/promises';
import type { FrontierSwarmEvidenceIndexEntryInput } from '@shapeshift-labs/frontier-swarm';
import { isObject, stableHash, uniqueStrings } from './common.js';
import type {
  FrontierCodexPlaywrightRuntimeProofArtifactIndex,
  FrontierCodexPlaywrightRuntimeProofArtifactRecord
} from './types-proof-artifacts.js';

export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_READMISSION_FILE = 'playwright-proof-readmission.json';
export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_READMISSION_KIND = 'frontier-swarm-codex.playwright-proof-readmission';

export interface FrontierCodexPlaywrightProofReadmissionRecord {
  readonly id: string;
  readonly artifactRecordId: string;
  readonly artifactPath: string;
  readonly jobId: string;
  readonly sourcePath?: string;
  readonly language: 'html' | 'css' | 'unknown';
  readonly validator?: string;
  readonly status: 'admitted' | 'blocked' | 'skipped' | 'unavailable' | 'error';
  readonly mergeStatus?: string;
  readonly proofStatus?: string;
  readonly proofKind?: string;
  readonly reasonCodes: readonly string[];
  readonly runtimeEvidenceBound: boolean;
  readonly message?: string;
  readonly diagnostics?: readonly string[];
}

export interface FrontierCodexPlaywrightProofReadmission {
  readonly kind: typeof FRONTIER_CODEX_PLAYWRIGHT_PROOF_READMISSION_KIND;
  readonly version: 1;
  readonly id: string;
  readonly generatedAt: number;
  readonly records: readonly FrontierCodexPlaywrightProofReadmissionRecord[];
  readonly summary: {
    readonly total: number;
    readonly admitted: number;
    readonly blocked: number;
    readonly skipped: number;
    readonly unavailable: number;
    readonly error: number;
  };
}

export async function createCodexPlaywrightProofReadmission(input: {
  readonly proofArtifacts: FrontierCodexPlaywrightRuntimeProofArtifactIndex;
  readonly generatedAt?: number;
}): Promise<FrontierCodexPlaywrightProofReadmission | undefined> {
  if (!input.proofArtifacts.records.length) return undefined;
  const lang = await importFrontierLang();
  const records: FrontierCodexPlaywrightProofReadmissionRecord[] = [];
  for (const record of input.proofArtifacts.records) {
    records.push(await readmitProofArtifact(record, lang));
  }
  return {
    kind: FRONTIER_CODEX_PLAYWRIGHT_PROOF_READMISSION_KIND,
    version: 1,
    id: `codex-playwright-proof-readmission:${stableHash(records.map((record) => record.id))}`,
    generatedAt: input.generatedAt ?? Date.now(),
    records,
    summary: summarizeReadmission(records)
  };
}

export function createCodexPlaywrightProofReadmissionEvidenceEntries(
  records: readonly FrontierCodexPlaywrightProofReadmissionRecord[]
): FrontierSwarmEvidenceIndexEntryInput[] {
  return records.map((record) => ({
    jobId: record.jobId,
    topic: 'playwright-proof-readmission',
    path: record.artifactPath,
    kind: 'playwright-proof-readmission',
    status: record.status,
    confidence: record.status === 'admitted' ? 0.9 : record.status === 'blocked' ? 0.45 : 0.25,
    tags: uniqueStrings([
      'playwright-proof-readmission',
      `playwright-proof-readmission-${record.status}`,
      record.language,
      record.runtimeEvidenceBound ? 'runtime-evidence-bound' : ''
    ]),
    facets: {
      language: record.language,
      validator: record.validator ?? '',
      mergeStatus: record.mergeStatus ?? '',
      proofStatus: record.proofStatus ?? '',
      proofKind: record.proofKind ?? '',
      runtimeEvidenceBound: record.runtimeEvidenceBound,
      reasonCodes: record.reasonCodes.join(','),
      sourcePath: record.sourcePath ?? ''
    }
  }));
}

async function readmitProofArtifact(
  record: FrontierCodexPlaywrightRuntimeProofArtifactRecord,
  lang: Record<string, unknown> | undefined
): Promise<FrontierCodexPlaywrightProofReadmissionRecord> {
  const language = languageForSource(record.sourcePath);
  if (record.validatorReadiness !== 'candidate') return readmissionRecord(record, language, 'skipped', { message: 'proof artifact is not a validator candidate' });
  if (!lang) return readmissionRecord(record, language, 'unavailable', { message: '@shapeshift-labs/frontier-lang is unavailable' });
  const artifact = await readJson(record.path);
  const proofBuilderInput = isObject(artifact?.proofBuilderInput) ? artifact.proofBuilderInput : undefined;
  if (!proofBuilderInput) return readmissionRecord(record, language, 'skipped', { message: 'proofBuilderInput missing from proof artifact' });
  try {
    if (language === 'html') return readmitHtml(record, proofBuilderInput, lang);
    if (language === 'css') return readmitCss(record, proofBuilderInput, lang);
    return readmissionRecord(record, language, 'skipped', { message: 'unsupported proof artifact source language' });
  } catch (error) {
    return readmissionRecord(record, language, 'error', { message: error instanceof Error ? error.message : String(error) });
  }
}

function readmitHtml(
  record: FrontierCodexPlaywrightRuntimeProofArtifactRecord,
  proofBuilderInput: Record<string, unknown>,
  lang: Record<string, unknown>
): FrontierCodexPlaywrightProofReadmissionRecord {
  const createProof = hasBoundaryProofShape(proofBuilderInput) ? lang.createHtmlRuntimeBoundaryProof : lang.createHtmlRuntimeProof;
  const safeMerge = lang.safeMergeHtmlSource;
  if (typeof createProof !== 'function' || typeof safeMerge !== 'function') return readmissionRecord(record, 'html', 'unavailable', { message: 'HTML proof validators unavailable' });
  const proof = createProof(proofBuilderInput);
  const merge = safeMerge({
    id: `readmit:${record.id}`,
    sourcePath: record.sourcePath,
    baseSourceText: firstString(proofBuilderInput.baseSourceText, proofBuilderInput.base),
    workerSourceText: firstString(proofBuilderInput.workerSourceText, proofBuilderInput.worker),
    headSourceText: firstString(proofBuilderInput.headSourceText, proofBuilderInput.head),
    ...(hasBoundaryProofShape(proofBuilderInput) ? { htmlRuntimeBoundaryProofs: [proof] } : { htmlBrowserRuntimeProofs: [proof] })
  });
  return readmissionRecord(record, 'html', merge?.status === 'merged' ? 'admitted' : 'blocked', {
    validator: hasBoundaryProofShape(proofBuilderInput) ? 'createHtmlRuntimeBoundaryProof/safeMergeHtmlSource' : 'createHtmlRuntimeProof/safeMergeHtmlSource',
    merge,
    proof
  });
}

function readmitCss(
  record: FrontierCodexPlaywrightRuntimeProofArtifactRecord,
  proofBuilderInput: Record<string, unknown>,
  lang: Record<string, unknown>
): FrontierCodexPlaywrightProofReadmissionRecord {
  const createProof = lang.createCssCascadeRuntimeProof;
  const safeMerge = lang.safeMergeCssSource;
  if (typeof createProof !== 'function' || typeof safeMerge !== 'function') return readmissionRecord(record, 'css', 'unavailable', { message: 'CSS proof validators unavailable' });
  const proof = createProof(proofBuilderInput);
  const merge = safeMerge({
    id: `readmit:${record.id}`,
    sourcePath: record.sourcePath,
    baseSourceText: firstString(proofBuilderInput.baseSourceText, proofBuilderInput.base),
    workerSourceText: firstString(proofBuilderInput.workerSourceText, proofBuilderInput.worker),
    headSourceText: firstString(proofBuilderInput.headSourceText, proofBuilderInput.head),
    ...cssGraphProofInputs(proofBuilderInput),
    cssCascadeRuntimeProofs: [proof]
  });
  return readmissionRecord(record, 'css', merge?.status === 'merged' ? 'admitted' : 'blocked', {
    validator: 'createCssCascadeRuntimeProof/safeMergeCssSource',
    merge,
    proof
  });
}

function readmissionRecord(
  record: FrontierCodexPlaywrightRuntimeProofArtifactRecord,
  language: FrontierCodexPlaywrightProofReadmissionRecord['language'],
  status: FrontierCodexPlaywrightProofReadmissionRecord['status'],
  input: { validator?: string; merge?: unknown; proof?: unknown; message?: string } = {}
): FrontierCodexPlaywrightProofReadmissionRecord {
  const merge = isObject(input.merge) ? input.merge : undefined;
  const proof = isObject(input.proof) ? input.proof : undefined;
  return {
    id: `codex-playwright-proof-readmission-record:${stableHash([record.id, status, merge?.status])}`,
    artifactRecordId: record.id,
    artifactPath: record.path,
    jobId: record.jobId,
    ...(record.sourcePath ? { sourcePath: record.sourcePath } : {}),
    language,
    ...(input.validator ? { validator: input.validator } : {}),
    status,
    ...(typeof merge?.status === 'string' ? { mergeStatus: merge.status } : {}),
    ...(typeof proof?.status === 'string' ? { proofStatus: proof.status } : {}),
    ...(typeof proof?.kind === 'string' ? { proofKind: proof.kind } : {}),
    reasonCodes: uniqueStrings([...record.reasonCodes, ...mergeReasonCodes(merge), ...proofReasonCodes(proof)]),
    runtimeEvidenceBound: record.runtimeEvidenceBound,
    ...(input.message ? { message: input.message } : {}),
    diagnostics: diagnosticsFromMerge(merge)
  };
}

function summarizeReadmission(records: readonly FrontierCodexPlaywrightProofReadmissionRecord[]): FrontierCodexPlaywrightProofReadmission['summary'] {
  return {
    total: records.length,
    admitted: records.filter((record) => record.status === 'admitted').length,
    blocked: records.filter((record) => record.status === 'blocked').length,
    skipped: records.filter((record) => record.status === 'skipped').length,
    unavailable: records.filter((record) => record.status === 'unavailable').length,
    error: records.filter((record) => record.status === 'error').length
  };
}

async function importFrontierLang(): Promise<Record<string, unknown> | undefined> {
  try {
    return await import('@shapeshift-labs/frontier-lang') as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function readJson(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function languageForSource(sourcePath: string | undefined): FrontierCodexPlaywrightProofReadmissionRecord['language'] {
  if (sourcePath?.toLowerCase().endsWith('.html')) return 'html';
  if (sourcePath?.toLowerCase().endsWith('.css')) return 'css';
  return 'unknown';
}

function hasBoundaryProofShape(input: Record<string, unknown>): boolean {
  return typeof input.boundary === 'string' || Array.isArray(input.boundaryAttributes) || typeof input.attributeName === 'string';
}

function cssGraphProofInputs(input: Record<string, unknown>): Record<string, unknown> {
  return compact({
    scopedCascadeGraphHash: input.scopedCascadeGraphHash,
    baseScopedCascadeGraphHash: input.baseScopedCascadeGraphHash,
    workerScopedCascadeGraphHash: input.workerScopedCascadeGraphHash,
    headScopedCascadeGraphHash: input.headScopedCascadeGraphHash
  });
}

function mergeReasonCodes(merge: Record<string, unknown> | undefined): string[] {
  const conflicts = Array.isArray(merge?.conflicts) ? merge.conflicts.filter(isObject) as Record<string, unknown>[] : [];
  return conflicts.flatMap((conflict) => isObject(conflict.details) && typeof conflict.details.reasonCode === 'string' ? [conflict.details.reasonCode] : []);
}

function proofReasonCodes(proof: Record<string, unknown> | undefined): string[] {
  return [
    ...stringArray(proof?.reasonCodes),
    ...(typeof proof?.reasonCode === 'string' ? [proof.reasonCode] : [])
  ];
}

function diagnosticsFromMerge(merge: Record<string, unknown> | undefined): string[] | undefined {
  const conflicts = Array.isArray(merge?.conflicts) ? merge.conflicts.filter(isObject) as Record<string, unknown>[] : [];
  const diagnostics = conflicts.map((conflict) => isObject(conflict.details) && typeof conflict.details.reasonCode === 'string' ? conflict.details.reasonCode : undefined).filter((entry): entry is string => Boolean(entry));
  return diagnostics.length ? uniqueStrings(diagnostics) : undefined;
}

function firstString(...values: readonly unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
