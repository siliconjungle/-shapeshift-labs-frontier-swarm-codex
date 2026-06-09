export interface FrontierCodexSemanticEditScriptSummary {
  total: number;
  operations: number;
  autoMergeCandidates: number;
  portable: number;
  alreadyApplied: number;
  needsPort: number;
  conflicts: number;
  stale: number;
  blocked: number;
  candidates: number;
  reviewRequired: number;
  autoApplyCandidates: number;
  byStatus: Record<string, number>;
  byKind: Record<string, number>;
  admission: Record<string, number>;
  actions: string[];
  reasonCodes: string[];
  conflictKeys: string[];
  evidenceIds: string[];
  empty: boolean;
}
