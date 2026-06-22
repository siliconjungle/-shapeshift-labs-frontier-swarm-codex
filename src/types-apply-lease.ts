export interface FrontierCodexApplySemanticLeaseEvidence {
  source: 'derived-from-merge-bundle' | string;
  queueId: string;
  assignmentId?: string;
  stateId: string;
  granted: boolean;
  leaseId?: string;
  token?: string;
  fencingToken?: number;
  requiredLeaseScopeIds: string[];
  requiredLeaseKeys: string[];
  scopes: Array<{
    key: string;
    scopeKind: string;
    path?: string;
    regionId?: string;
    lane?: string;
    parentKeys: string[];
  }>;
  fence: {
    ok: boolean;
    reasons: string[];
  };
  evidence?: Record<string, unknown>;
}
