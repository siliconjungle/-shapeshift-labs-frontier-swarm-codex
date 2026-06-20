export type QueryHealthStatus = 'healthy' | 'warning' | 'failed' | 'blocked' | 'running' | 'unknown';
export type QuerySemanticReadinessStatus = 'clean' | 'candidate' | 'review-required' | 'needs-port' | 'stale' | 'blocked' | 'unknown';
export type QueryCleanupStatus = 'clean' | 'ignored' | 'generated' | 'quarantined';
export type QueryOwnershipStatus = 'clean' | 'ignored' | 'violation';

export interface QueryContextBudget {
  status?: string;
  warnings: string[];
  errors: string[];
  promptBytes: number;
  estimatedInputTokens: number;
  actualInputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  hasBudget: boolean;
}

export interface QueryCleanupSignal {
  status: QueryCleanupStatus;
  ignoredChangedPathCount: number;
  generatedChangedPathCount: number;
  quarantinedChangedPathCount: number;
  observedChangedPathCount: number;
  reportedChangedPathCount: number;
  ignoredChangedPathReasonCounts: Record<string, number>;
}

export interface QueryOwnershipSignal {
  status: QueryOwnershipStatus;
  violationCount: number;
  sourceViolationCount: number;
  ignoredViolationCount: number;
}
