export interface FrontierCodexSemanticEditProjectionSummary {
  total: number;
  projected: number;
  blocked: number;
  autoMergeCandidates: number;
  appliedOperations: number;
  skippedOperations: number;
  editCount: number;
  appliedEditCount: number;
  alreadyAppliedEditCount: number;
  deletedBytes: number;
  replacementBytes: number;
  anchorKeys: string[];
  conflictKeys: string[];
  symbolNames: string[];
  sourcePaths: string[];
  projectedSourceMatchesWorker: number;
  projectedSourceMismatchesWorker: number;
  projectedSourceMatchUnknown: number;
  statusCounts: Record<string, number>;
  admission: Record<string, number>;
  reasonCodes: string[];
  empty: boolean;
}
