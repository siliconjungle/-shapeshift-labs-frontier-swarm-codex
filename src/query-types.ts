export type CliValue = string | boolean | string[];

export type CliArgs = Record<string, CliValue | undefined> & { _: string[] };

export interface FrontierCodexQueryInput {
  collection?: string;
  run?: string;
  continuation?: string;
  q?: string;
  jobId?: string;
  bucket?: string;
  kind?: string;
  proofParentApplyCandidate?: boolean;
  pathIncludes?: string;
  symbol?: string;
  tag?: string;
  stale?: boolean;
  semantic?: boolean;
  lineage?: boolean;
  semanticEditStatus?: string;
  semanticEditAdmission?: string;
  semanticEditProjection?: string;
  semanticMergeAdmission?: string;
  safeMergeApplyDecision?: string;
  semanticMergeDecision?: string;
  semanticEditReplay?: string;
  semanticEditReplayStatus?: string;
  semanticEditReplayAdmission?: string;
  semanticEditKey?: string;
  semanticBundleOverlap?: string;
  semanticIdentityHash?: string;
  sourceIdentityHash?: string;
  operationContentHash?: string;
  editContentHash?: string;
  semanticTransformKey?: string;
  semanticTransformIdentityHash?: string;
  semanticTransformContentHash?: string;
  projectionIdentityHash?: string;
  readiness?: string;
  health?: string;
  pressure?: string;
  cleanup?: string;
  ownership?: string;
  semanticReadiness?: string;
  landed?: boolean;
  passedTests?: boolean;
  limit?: number;
  cwd?: string;
}
