import type {
  FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_INDEX_KIND,
  FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_RECORD_KIND
} from './proof-artifacts.js';
import type { FrontierCodexCollectBucket } from './types-collection.js';

export interface FrontierCodexPlaywrightRuntimeProofArtifactRecord {
  readonly kind: typeof FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_RECORD_KIND;
  readonly version: 1;
  readonly id: string;
  readonly jobId: string;
  readonly taskId?: string;
  readonly queueItemId?: string;
  readonly lane?: string;
  readonly bucket: FrontierCodexCollectBucket;
  readonly path: string;
  readonly artifactId?: string;
  readonly artifactStatus: 'passed' | 'failed' | 'unknown';
  readonly validatorReadiness: 'candidate' | 'failed' | 'incomplete';
  readonly runKind?: string;
  readonly runId?: string;
  readonly proofRunId?: string;
  readonly sourcePath?: string;
  readonly reasonCodes: readonly string[];
  readonly sides: readonly string[];
  readonly recordKeys: readonly string[];
  readonly boundaries: readonly string[];
  readonly attributeNames: readonly string[];
  readonly shapeKeys: readonly string[];
  readonly runtimeEvidenceBound: boolean;
  readonly runtimeCommand?: string;
  readonly runtimeProbeId?: string;
  readonly runtimeEvidenceHash?: string;
  readonly runtimeSignals: readonly string[];
  readonly assertionCount: number;
  readonly failedAssertionCount: number;
  readonly sourceTextHashCount: number;
  readonly sourceTextHashes?: Readonly<Record<string, string>>;
  readonly broadClaimCount: number;
  readonly claims: {
    readonly browserRuntimeEquivalenceClaim: boolean;
    readonly browserCascadeEquivalenceClaim: boolean;
    readonly browserRenderEquivalenceClaim: boolean;
    readonly semanticEquivalenceClaim: boolean;
    readonly autoMergeClaim: boolean;
  };
  readonly proofBuilderInputAvailable: boolean;
  readonly languageValidators: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly sourceBundle?: FrontierCodexPlaywrightRuntimeProofSourceBundle;
}

export interface FrontierCodexPlaywrightRuntimeProofSourceBundle {
  readonly jobId?: string;
  readonly taskId?: string;
  readonly bucket?: string;
  readonly mergePath?: string;
  readonly outputDir?: string;
}

export interface FrontierCodexPlaywrightRuntimeProofArtifactIndex {
  readonly kind: typeof FRONTIER_CODEX_PLAYWRIGHT_RUNTIME_PROOF_ARTIFACT_INDEX_KIND;
  readonly version: 1;
  readonly id: string;
  readonly generatedAt: number;
  readonly runDir: string;
  readonly collectionDir: string;
  readonly records: readonly FrontierCodexPlaywrightRuntimeProofArtifactRecord[];
  readonly summary: {
    readonly artifactCount: number;
    readonly passedCount: number;
    readonly failedCount: number;
    readonly incompleteCount: number;
    readonly runtimeEvidenceBoundCount: number;
    readonly validatorCandidateCount: number;
    readonly failedAssertionCount: number;
    readonly broadClaimCount: number;
  };
}
