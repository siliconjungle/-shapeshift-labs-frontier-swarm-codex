import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmEvidenceIndexEntryInput, FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { isObject, readStringArray, stableHash, uniqueStrings } from './common.js';
import type { FrontierCodexCollectBucket } from './types-collection.js';
import type {
  FrontierCodexPlaywrightRuntimeProofArtifactIndex,
  FrontierCodexPlaywrightRuntimeProofArtifactRecord
} from './types-proof-artifacts.js';

export const FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE = 'playwright-runtime-proof-artifacts.json';
export const FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_KIND = 'frontier.playwright.runtime-proof-artifact';
export const FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_INDEX_KIND = 'frontier-swarm-codex.playwright-runtime-proof-artifact-index';
export const FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_RECORD_KIND = 'frontier-swarm-codex.playwright-runtime-proof-artifact-record';

export async function collectCodexPlaywrightRuntimeProofArtifacts(input: {
  readonly bundle: FrontierSwarmMergeBundle;
  readonly bucket: FrontierCodexCollectBucket;
  readonly mergePath?: string;
}): Promise<FrontierCodexPlaywrightRuntimeProofArtifactRecord[]> {
  const records: FrontierCodexPlaywrightRuntimeProofArtifactRecord[] = [];
  for (const evidencePath of input.bundle.evidencePaths ?? []) {
    const file = resolveEvidencePath(evidencePath, input.mergePath);
    const record = await readCodexPlaywrightRuntimeProofArtifactRecord(file, input.bundle, input.bucket);
    if (record) records.push(record);
  }
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

export function createCodexPlaywrightRuntimeProofArtifactIndex(input: {
  readonly runDir: string;
  readonly collectionDir: string;
  readonly generatedAt: number;
  readonly records: readonly FrontierCodexPlaywrightRuntimeProofArtifactRecord[];
}): FrontierCodexPlaywrightRuntimeProofArtifactIndex {
  const records = [...input.records].sort((left, right) => left.id.localeCompare(right.id));
  return {
    kind: FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_INDEX_KIND,
    version: 1,
    id: `codex-playwright-runtime-proof-artifacts:${stableHash(records.map((record) => record.id))}`,
    generatedAt: input.generatedAt,
    runDir: input.runDir,
    collectionDir: input.collectionDir,
    records,
    summary: summarizeCodexPlaywrightRuntimeProofArtifacts(records)
  };
}

export function createCodexPlaywrightRuntimeProofEvidenceEntries(
  records: readonly FrontierCodexPlaywrightRuntimeProofArtifactRecord[]
): FrontierSwarmEvidenceIndexEntryInput[] {
  return records.map((record) => ({
    jobId: record.jobId,
    ...(record.queueItemId ? { queueItemId: record.queueItemId } : {}),
    ...(record.lane ? { lane: record.lane } : {}),
    topic: 'playwright-runtime-proof',
    path: record.path,
    kind: 'playwright-runtime-proof-artifact',
    status: record.validatorReadiness,
    confidence: record.validatorReadiness === 'candidate' ? 0.85 : record.validatorReadiness === 'failed' ? 0.25 : 0.45,
    tags: uniqueStrings([
      'playwright-runtime-proof-artifact',
      `playwright-runtime-proof-${record.validatorReadiness}`,
      `playwright-runtime-proof-status-${record.artifactStatus}`,
      record.bucket,
      record.runtimeEvidenceBound ? 'runtime-evidence-bound' : 'runtime-evidence-unbound',
      record.failedAssertionCount > 0 ? 'runtime-assertion-failed' : '',
      record.broadClaimCount > 0 ? 'runtime-proof-broad-claim' : ''
    ]),
    facets: {
      bucket: record.bucket,
      artifactStatus: record.artifactStatus,
      validatorReadiness: record.validatorReadiness,
      runtimeEvidenceBound: record.runtimeEvidenceBound,
      runtimeSignals: record.runtimeSignals.join(','),
      runtimeCommand: record.runtimeCommand ?? '',
      runtimeProbeId: record.runtimeProbeId ?? '',
      runtimeEvidenceHash: record.runtimeEvidenceHash ?? '',
      assertionCount: record.assertionCount,
      failedAssertionCount: record.failedAssertionCount,
      sourceTextHashCount: record.sourceTextHashCount,
      broadClaimCount: record.broadClaimCount,
      sourcePath: record.sourcePath ?? '',
      reasonCodes: record.reasonCodes.join(','),
      sides: record.sides.join(','),
      shapeKeys: record.shapeKeys.join(',')
    }
  }));
}

export function codexPlaywrightRuntimeProofArtifactMetadata(parsed: Record<string, unknown>): Record<string, unknown> {
  return parsed.kind === FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_KIND ? {
    proofArtifactStatus: parsed.status,
    proofArtifactRuntimeEvidenceBound: parsed.runtimeEvidenceBound,
    proofArtifactAssertionCount: Array.isArray(parsed.assertions) ? parsed.assertions.length : undefined,
    proofArtifactSourceTextHashCount: isObject(parsed.sourceTextHashes) ? Object.keys(parsed.sourceTextHashes).length : undefined
  } : {};
}

export function codexPlaywrightRuntimeProofArtifactTags(metadata: Record<string, unknown>): string[] {
  return [
    metadata.artifactKind === FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_KIND ? 'playwright-runtime-proof-artifact' : '',
    metadata.proofArtifactRuntimeEvidenceBound ? 'runtime-evidence-bound' : '',
    metadata.proofArtifactStatus === 'passed' ? 'playwright-runtime-proof-passed' : '',
    metadata.proofArtifactStatus === 'failed' ? 'playwright-runtime-proof-failed' : ''
  ];
}

export function codexPlaywrightRuntimeProofArtifactKindForFile(name: string): string | undefined {
  if (name === FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE) return 'playwright-runtime-proof-artifact-index';
  if (name === 'playwright-runtime-proof.json' || name === 'runtime-proof-artifact.json' || name === 'playwright-runtime-proof-artifact.json') return 'playwright-runtime-proof-artifact';
  return undefined;
}

function summarizeCodexPlaywrightRuntimeProofArtifacts(
  records: readonly FrontierCodexPlaywrightRuntimeProofArtifactRecord[]
): FrontierCodexPlaywrightRuntimeProofArtifactIndex['summary'] {
  return {
    artifactCount: records.length,
    passedCount: records.filter((record) => record.artifactStatus === 'passed').length,
    failedCount: records.filter((record) => record.artifactStatus === 'failed').length,
    incompleteCount: records.filter((record) => record.validatorReadiness === 'incomplete').length,
    runtimeEvidenceBoundCount: records.filter((record) => record.runtimeEvidenceBound).length,
    validatorCandidateCount: records.filter((record) => record.validatorReadiness === 'candidate').length,
    failedAssertionCount: records.reduce((sum, record) => sum + record.failedAssertionCount, 0),
    broadClaimCount: records.reduce((sum, record) => sum + record.broadClaimCount, 0)
  };
}

async function readCodexPlaywrightRuntimeProofArtifactRecord(
  file: string,
  bundle: FrontierSwarmMergeBundle,
  bucket: FrontierCodexCollectBucket
): Promise<FrontierCodexPlaywrightRuntimeProofArtifactRecord | undefined> {
  const parsed = await readJsonIfExists(file);
  if (!isObject(parsed) || parsed.kind !== FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_KIND) return undefined;
  const runtimeEvidence = readObject(parsed.runtimeEvidence);
  const builderFields = readObject(parsed.builderFields);
  const proofBuilderInput = readObject(parsed.proofBuilderInput);
  const sourceTextHashes = stringRecord(parsed.sourceTextHashes);
  const assertions = Array.isArray(parsed.assertions) ? parsed.assertions.filter(isObject) as Record<string, unknown>[] : [];
  const failedAssertionCount = assertions.filter((assertion) => assertion.status === 'failed').length;
  const runtimeSignals = uniqueStrings([
    ...readStringArray(runtimeEvidence?.runtimeSignals),
    ...readStringArray(builderFields?.runtimeSignals),
    ...readStringArray(readObject(runtimeEvidence?.evidence)?.signals),
    ...readStringArray(readObject(builderFields?.runtimeEvidence)?.signals),
    ...readStringArray(readObject(proofBuilderInput?.runtimeEvidence)?.signals)
  ]).sort();
  const claims = {
    browserRuntimeEquivalenceClaim: hasTrueClaim(parsed, runtimeEvidence, builderFields, proofBuilderInput, 'browserRuntimeEquivalenceClaim'),
    browserCascadeEquivalenceClaim: hasTrueClaim(parsed, runtimeEvidence, builderFields, proofBuilderInput, 'browserCascadeEquivalenceClaim'),
    browserRenderEquivalenceClaim: hasTrueClaim(parsed, runtimeEvidence, builderFields, proofBuilderInput, 'browserRenderEquivalenceClaim'),
    semanticEquivalenceClaim: hasTrueClaim(parsed, runtimeEvidence, builderFields, proofBuilderInput, 'semanticEquivalenceClaim'),
    autoMergeClaim: hasTrueClaim(parsed, runtimeEvidence, builderFields, proofBuilderInput, 'autoMergeClaim')
  };
  const broadClaimCount = Object.values(claims).filter(Boolean).length;
  const artifactStatus = parsed.status === 'passed' || parsed.status === 'failed' ? parsed.status : 'unknown';
  const runtimeEvidenceBound = parsed.runtimeEvidenceBound === true ||
    runtimeEvidence?.runtimeEvidenceBound === true ||
    builderFields?.runtimeEvidenceBound === true ||
    proofBuilderInput?.runtimeEvidenceBound === true;
  const sourceTextHashCount = Object.keys(sourceTextHashes).length;
  const proofBuilderInputAvailable = Boolean(proofBuilderInput);
  const validatorReadiness = artifactStatus === 'passed' &&
    runtimeEvidenceBound &&
    proofBuilderInputAvailable &&
    sourceTextHashCount > 0 &&
    failedAssertionCount === 0 &&
    broadClaimCount === 0
    ? 'candidate'
    : artifactStatus === 'failed' || failedAssertionCount > 0 || broadClaimCount > 0
      ? 'failed'
      : 'incomplete';
  const artifactId = firstString(parsed.artifactId, parsed.id);
  const proofRunId = firstString(parsed.proofRunId);
  const runtimeCommand = firstString(
    runtimeEvidence?.runtimeCommand,
    builderFields?.runtimeCommand,
    readObject(runtimeEvidence?.evidence)?.command,
    readObject(builderFields?.runtimeEvidence)?.command,
    readObject(proofBuilderInput?.runtimeEvidence)?.command
  );
  const runtimeProbeId = firstString(
    runtimeEvidence?.runtimeProbeId,
    builderFields?.runtimeProbeId,
    readObject(runtimeEvidence?.evidence)?.probeId,
    readObject(builderFields?.runtimeEvidence)?.probeId,
    readObject(proofBuilderInput?.runtimeEvidence)?.probeId
  );
  const runtimeEvidenceHash = firstString(
    runtimeEvidence?.runtimeEvidenceHash,
    builderFields?.runtimeEvidenceHash,
    readObject(runtimeEvidence?.evidence)?.evidenceHash,
    readObject(builderFields?.runtimeEvidence)?.evidenceHash,
    readObject(proofBuilderInput?.runtimeEvidence)?.evidenceHash
  );
  const record: FrontierCodexPlaywrightRuntimeProofArtifactRecord = {
    kind: FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_RECORD_KIND,
    version: 1,
    id: `codex-playwright-runtime-proof-artifact:${stableHash([bundle.jobId, file, artifactId, proofRunId])}`,
    jobId: bundle.jobId,
    ...(bundle.taskId ? { taskId: bundle.taskId } : {}),
    ...(bundle.queueItemIds[0] ? { queueItemId: bundle.queueItemIds[0] } : {}),
    ...(bundle.lane ? { lane: bundle.lane } : {}),
    bucket,
    path: file,
    ...(artifactId ? { artifactId } : {}),
    artifactStatus,
    validatorReadiness,
    ...(firstString(parsed.runKind) ? { runKind: firstString(parsed.runKind) } : {}),
    ...(firstString(parsed.runId) ? { runId: firstString(parsed.runId) } : {}),
    ...(proofRunId ? { proofRunId } : {}),
    ...(firstString(proofBuilderInput?.sourcePath) ? { sourcePath: firstString(proofBuilderInput?.sourcePath) } : {}),
    reasonCodes: uniqueStrings([
      ...readStringArray(proofBuilderInput?.reasonCodes),
      ...scalarString(proofBuilderInput?.reasonCode)
    ]),
    sides: uniqueStrings([
      ...readStringArray(proofBuilderInput?.sides),
      ...scalarString(proofBuilderInput?.side)
    ]),
    recordKeys: uniqueStrings([
      ...readStringArray(proofBuilderInput?.recordKeys),
      ...scalarString(proofBuilderInput?.recordKey)
    ]),
    boundaries: uniqueStrings([
      ...readStringArray(proofBuilderInput?.boundaries),
      ...scalarString(proofBuilderInput?.boundary)
    ]),
    attributeNames: uniqueStrings([
      ...readStringArray(proofBuilderInput?.attributeNames),
      ...scalarString(proofBuilderInput?.attributeName)
    ]),
    shapeKeys: uniqueStrings([
      ...readStringArray(proofBuilderInput?.shapeKeys),
      ...scalarString(proofBuilderInput?.shapeKey)
    ]),
    runtimeEvidenceBound,
    ...(runtimeCommand ? { runtimeCommand } : {}),
    ...(runtimeProbeId ? { runtimeProbeId } : {}),
    ...(runtimeEvidenceHash ? { runtimeEvidenceHash } : {}),
    runtimeSignals,
    assertionCount: assertions.length,
    failedAssertionCount,
    sourceTextHashCount,
    ...(sourceTextHashCount ? { sourceTextHashes } : {}),
    broadClaimCount,
    claims,
    proofBuilderInputAvailable,
    languageValidators: languageValidatorsForProof(proofBuilderInput),
    ...(isObject(parsed.metadata) ? { metadata: parsed.metadata } : {})
  };
  return record;
}

function languageValidatorsForProof(proofBuilderInput: Record<string, unknown> | undefined): string[] {
  const sourcePath = firstString(proofBuilderInput?.sourcePath);
  if (sourcePath?.toLowerCase().endsWith('.css')) return ['createCssCascadeRuntimeProof'];
  if (sourcePath?.toLowerCase().endsWith('.html')) return ['createHtmlRuntimeProof', 'createHtmlRuntimeBoundaryProof'];
  return [];
}

function resolveEvidencePath(file: string, mergePath: string | undefined): string {
  if (path.isAbsolute(file)) return file;
  return path.resolve(mergePath ? path.dirname(mergePath) : process.cwd(), file);
}

async function readJsonIfExists(file: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0));
}

function firstString(...values: readonly unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function scalarString(value: unknown): string[] {
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function hasTrueClaim(
  artifact: Record<string, unknown>,
  runtimeEvidence: Record<string, unknown> | undefined,
  builderFields: Record<string, unknown> | undefined,
  proofBuilderInput: Record<string, unknown> | undefined,
  key: string
): boolean {
  return artifact[key] === true ||
    runtimeEvidence?.[key] === true ||
    builderFields?.[key] === true ||
    proofBuilderInput?.[key] === true;
}
