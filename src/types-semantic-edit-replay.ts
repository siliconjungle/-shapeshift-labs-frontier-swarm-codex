export interface FrontierCodexSemanticEditReplaySummary {
  total: number;
  acceptedClean: number;
  alreadyApplied: number;
  conflicts: number;
  stale: number;
  blocked: number;
  needsPort: number;
  evidenceOnly: number;
  appliedOperations: number;
  skippedOperations: number;
  editCount: number;
  appliedEditCount: number;
  alreadyAppliedEditCount: number;
  statusCounts: Record<string, number>;
  admission: Record<string, number>;
  actions: string[];
  operationIds: string[];
  semanticKeys: string[];
  semanticIdentityHashes: string[];
  sourceIdentityHashes: string[];
  editContentHashes: string[];
  sourcePaths: string[];
  symbolNames: string[];
  currentHashes: string[];
  outputHashes: string[];
  reasonCodes: string[];
  empty: boolean;
}
