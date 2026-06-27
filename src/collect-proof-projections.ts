import path from 'node:path';
import type { FrontierSwarmEvidenceIndexEntryInput } from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE,
  createCodexPlaywrightRuntimeProofArtifactIndex
} from './proof-artifacts.js';
import {
  FRONTIER_CODEX_PLAYWRIGHT_PROOF_READMISSION_FILE,
  createCodexPlaywrightProofReadmission,
  createCodexPlaywrightProofReadmissionEvidenceEntries
} from './proof-readmission.js';
import {
  FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_ADMISSION_FILE,
  createCodexPlaywrightProofParentAdmission,
  createCodexPlaywrightProofParentAdmissionEvidenceEntries
} from './proof-parent-admission.js';
import type { FrontierCodexCollectSummary } from './types-collection.js';
import type { FrontierCodexPlaywrightRuntimeProofArtifactRecord } from './types-proof-artifacts.js';

export async function createCodexCollectProofProjections(input: {
  readonly runDir: string;
  readonly outDir: string;
  readonly cwd: string;
  readonly generatedAt: number;
  readonly proofArtifactRecords: readonly FrontierCodexPlaywrightRuntimeProofArtifactRecord[];
}) {
  const proofArtifacts = input.proofArtifactRecords.length > 0
    ? createCodexPlaywrightRuntimeProofArtifactIndex({
      runDir: input.runDir,
      collectionDir: input.outDir,
      generatedAt: input.generatedAt,
      records: input.proofArtifactRecords
    })
    : undefined;
  const proofArtifactsPath = proofArtifacts ? path.join(input.outDir, FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_FILE) : undefined;
  const proofReadmission = proofArtifacts ? await createCodexPlaywrightProofReadmission({ proofArtifacts, generatedAt: input.generatedAt }) : undefined;
  const proofReadmissionPath = proofReadmission ? path.join(input.outDir, FRONTIER_CODEX_PLAYWRIGHT_PROOF_READMISSION_FILE) : undefined;
  const proofParentAdmission = proofReadmission
    ? await createCodexPlaywrightProofParentAdmission({
      proofReadmission,
      cwd: input.cwd,
      collectionDir: input.outDir,
      generatedAt: input.generatedAt
    })
    : undefined;
  const proofParentAdmissionPath = proofParentAdmission ? path.join(input.outDir, FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_ADMISSION_FILE) : undefined;
  const evidenceEntries: FrontierSwarmEvidenceIndexEntryInput[] = [
    ...(proofReadmission ? createCodexPlaywrightProofReadmissionEvidenceEntries(proofReadmission.records) : []),
    ...(proofParentAdmission ? createCodexPlaywrightProofParentAdmissionEvidenceEntries(proofParentAdmission.records) : [])
  ];
  const summary: Partial<FrontierCodexCollectSummary> = {
    ...(proofArtifacts ? {
      proofArtifactCount: proofArtifacts.summary.artifactCount,
      proofArtifactPassedCount: proofArtifacts.summary.passedCount,
      proofArtifactFailedCount: proofArtifacts.summary.failedCount,
      proofArtifactValidatorCandidateCount: proofArtifacts.summary.validatorCandidateCount
    } : {}),
    proofArtifactsPath,
    ...(proofReadmission ? {
      proofReadmissionCount: proofReadmission.summary.total,
      proofReadmissionAdmittedCount: proofReadmission.summary.admitted,
      proofReadmissionBlockedCount: proofReadmission.summary.blocked,
      proofReadmissionSourceLinkedCount: proofReadmission.summary.sourceLinked,
      proofReadmissionPath
    } : {}),
    ...(proofParentAdmission ? {
      proofParentAdmissionCount: proofParentAdmission.summary.total,
      proofParentAdmissionReadyCount: proofParentAdmission.summary.readyForParentRecheck,
      proofParentAdmissionBlockedCount: proofParentAdmission.summary.blocked + proofParentAdmission.summary.unlinked + proofParentAdmission.summary.missingParentBundle,
      proofParentAdmissionPath
    } : {})
  };
  return {
    proofArtifacts,
    proofArtifactsPath,
    proofReadmission,
    proofReadmissionPath,
    proofParentAdmission,
    proofParentAdmissionPath,
    evidenceEntries,
    summary,
    metadata: {
      ...(proofArtifacts ? { proofArtifacts: proofArtifacts.summary } : {}),
      ...(proofReadmission ? { proofReadmission: proofReadmission.summary } : {}),
      ...(proofParentAdmission ? { proofParentAdmission: proofParentAdmission.summary } : {})
    }
  };
}
