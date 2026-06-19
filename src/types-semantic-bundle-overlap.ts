export interface FrontierCodexSemanticPatchBundleOverlapEntry {
  id: string;
  leftJobId: string;
  rightJobId: string;
  leftBundleId: string;
  rightBundleId: string;
  status: string;
  score: number;
  reviewRequired: boolean;
  overlapKinds: string[];
  reasonCodes: string[];
  shared: {
    semanticEditKeys: string[];
    semanticIdentityHashes: string[];
    sourceIdentityHashes: string[];
    operationContentHashes: string[];
    editContentHashes: string[];
    semanticTransformKeys: string[];
    semanticTransformIdentityHashes: string[];
    semanticTransformContentHashes: string[];
    projectionIdentityHashes: string[];
    regionKeys: string[];
    conflictKeys: string[];
    sourcePaths: string[];
  };
}

export interface FrontierCodexSemanticPatchBundleOverlapSummary {
  available: boolean;
  recordCount: number;
  total: number;
  statusCounts: Record<string, number>;
  duplicateCount: number;
  semanticOverlapCount: number;
  sourceOverlapCount: number;
  reviewRequiredCount: number;
  warnings: string[];
  top: FrontierCodexSemanticPatchBundleOverlapEntry[];
}
