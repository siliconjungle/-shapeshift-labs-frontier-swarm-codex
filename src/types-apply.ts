import type {
  FRONTIER_SWARM_GIT_APPLY_LEDGER_KIND,
  FRONTIER_SWARM_GIT_APPLY_LEDGER_VERSION
} from '@shapeshift-labs/frontier-swarm-git';
import type { FrontierCodexApplySemanticLeaseEvidence } from './types-apply-lease.js';
import type { FrontierCodexCollectBucket } from './types-collection.js';

export type FrontierCodexApplyStatus = 'checked' | 'applied' | 'committed' | 'skipped' | 'failed';
export type FrontierCodexApplyAdmissionMode = 'strict' | 'warn' | 'off';

export interface FrontierCodexApplyLedgerLandedEntry {
  jobId: string;
  status: Extract<FrontierCodexApplyStatus, 'applied' | 'committed'>;
  bundlePath: string;
  patchPath?: string;
  branchName?: string;
  commit?: string;
}

export interface FrontierCodexApplyLedgerSummary {
  path: string;
  generatedAt?: number;
  dryRun?: boolean;
  total: number;
  checked: number;
  applied: number;
  committed: number;
  skipped: number;
  failed: number;
  landed: number;
  appliedJobIds: string[];
  committedJobIds: string[];
  landedJobIds: string[];
  failedJobIds: string[];
  landedEntries: FrontierCodexApplyLedgerLandedEntry[];
}

export interface FrontierCodexApplyAdmissionEntry {
  jobId: string;
  bundlePath: string;
  status: 'accepted' | 'rejected' | 'warn';
  reasons: string[];
  queueOutcomeDecisionIds: string[];
  gateEvidence: {
    passedCommandCount: number;
    failedCommandCount: number;
    status?: string;
    mergeReadiness?: string;
  };
}

export interface FrontierCodexApplyAdmissionSummary {
  mode: FrontierCodexApplyAdmissionMode;
  total: number;
  accepted: number;
  rejected: number;
  warned: number;
  entries: FrontierCodexApplyAdmissionEntry[];
}

export interface FrontierCodexApplyInput {
  collection?: string;
  run?: string;
  continuation?: string;
  outDir?: string;
  cwd?: string;
  bucket?: FrontierCodexCollectBucket | 'all';
  jobIds?: readonly string[];
  dryRun?: boolean;
  allowDirty?: boolean;
  commit?: boolean;
  branchPrefix?: string;
  limit?: number;
  admission?: FrontierCodexApplyAdmissionMode;
  leaseStatePath?: string | false;
  leaseTtlMs?: number;
}

export interface FrontierCodexApplyEntry {
  jobId: string;
  status: FrontierCodexApplyStatus;
  bundlePath: string;
  patchPath?: string;
  branchName?: string;
  commit?: string;
  dryRun: boolean;
  commands: Array<{ command: string[]; status: number; stdoutTail: string[]; stderrTail: string[] }>;
  semanticLease?: FrontierCodexApplySemanticLeaseEvidence;
  admission?: FrontierCodexApplyAdmissionEntry;
  error?: string;
}

export interface FrontierCodexApplyResult {
  kind: typeof FRONTIER_SWARM_GIT_APPLY_LEDGER_KIND;
  version: typeof FRONTIER_SWARM_GIT_APPLY_LEDGER_VERSION;
  ok: boolean;
  cwd: string;
  collectionDir: string;
  outDir: string;
  generatedAt: number;
  dryRun: boolean;
  entries: FrontierCodexApplyEntry[];
  gateExecutionsPath?: string;
  gateSummaryPath?: string;
  runEventsPath?: string;
  runDashboardPath?: string;
  admission?: FrontierCodexApplyAdmissionSummary;
  evidence?: {
    gateExecutionCount: number;
    runEventCount: number;
  };
  summary: {
    total: number;
    checked: number;
    applied: number;
    committed: number;
    skipped: number;
    failed: number;
  };
}
