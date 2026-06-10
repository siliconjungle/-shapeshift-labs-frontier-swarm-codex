export interface FrontierCodexSemanticEditProjectionSummary {
  total: number;
  projected: number;
  blocked: number;
  autoMergeCandidates: number;
  appliedOperations: number;
  skippedOperations: number;
  projectedSourceMatchesWorker: number;
  projectedSourceMismatchesWorker: number;
  projectedSourceMatchUnknown: number;
  statusCounts: Record<string, number>;
  admission: Record<string, number>;
  reasonCodes: string[];
  empty: boolean;
}
