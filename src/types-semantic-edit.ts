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

export interface FrontierCodexSemanticEditScriptAdmissionSummary {
  statusCounts: Record<string, number>;
  statuses: string[];
  autoMergeCandidateCount: number;
  portableCount: number;
  cleanEligibleCandidateCount: number;
}

export type FrontierCodexSemanticEditAdmissionStatus =
  | 'auto-merge-candidate'
  | 'needs-port'
  | 'conflict'
  | 'stale'
  | 'blocked'
  | 'review-required'
  | 'no-semantic-edit-script';

export interface FrontierCodexSemanticEditAdmissionDecision {
  status: FrontierCodexSemanticEditAdmissionStatus;
  autoMergeCandidate: boolean;
  cleanEligible: boolean;
  reasons: string[];
}
