import type {
  FRONTIER_SWARM_CODEX_PID_MANIFEST_KIND,
  FRONTIER_SWARM_CODEX_PID_MANIFEST_VERSION
} from './constants.js';
import type {
  FrontierSwarmGitWorkspaceIgnoredChangedPathReason,
  FrontierSwarmGitWorkspaceIgnoredChangedPathReasonCode,
  FrontierSwarmGitWorkspaceManifest,
  FrontierSwarmGitWorkspacePackageLinkEntry,
  FrontierSwarmGitWorkspacePackageLinkRepairInput,
  FrontierSwarmGitWorkspacePackageLinkRepairResult,
  FrontierSwarmGitWorkspacePackageLinkStatus,
  FrontierSwarmGitWorkspacePlan,
  FrontierSwarmGitWorkspaceProof,
  FrontierSwarmGitWorkspaceWriteFenceSummary
} from '@shapeshift-labs/frontier-swarm-git';

export type FrontierCodexWorkspacePlan = FrontierSwarmGitWorkspacePlan;
export type FrontierCodexWorkspaceManifest = FrontierSwarmGitWorkspaceManifest;
export type FrontierCodexWorkspaceIgnoredChangedPathReasonCode = FrontierSwarmGitWorkspaceIgnoredChangedPathReasonCode;
export type FrontierCodexWorkspaceIgnoredChangedPathReason = FrontierSwarmGitWorkspaceIgnoredChangedPathReason;
export type FrontierCodexWorkspaceWriteFenceSummary = FrontierSwarmGitWorkspaceWriteFenceSummary;
export type FrontierCodexWorkspaceProof = FrontierSwarmGitWorkspaceProof;
export type FrontierCodexWorkspacePackageLinkStatus = FrontierSwarmGitWorkspacePackageLinkStatus;
export type FrontierCodexWorkspacePackageLinkRepairInput = FrontierSwarmGitWorkspacePackageLinkRepairInput;
export type FrontierCodexWorkspacePackageLinkEntry = FrontierSwarmGitWorkspacePackageLinkEntry;
export type FrontierCodexWorkspacePackageLinkRepairResult = FrontierSwarmGitWorkspacePackageLinkRepairResult;

export interface FrontierCodexPidEntry {
  pid: number;
  role: 'parent' | 'codex' | string;
  runId?: string;
  jobId?: string;
  startedAt: number;
  command?: string[];
  stoppedAt?: number;
  stopSignal?: NodeJS.Signals | string;
  stopReason?: string;
}

export interface FrontierCodexPidManifest {
  kind: typeof FRONTIER_SWARM_CODEX_PID_MANIFEST_KIND;
  version: typeof FRONTIER_SWARM_CODEX_PID_MANIFEST_VERSION;
  runId?: string;
  entries: FrontierCodexPidEntry[];
}

export interface FrontierCodexStopResult {
  ok: boolean;
  pidManifestPath: string;
  signal: NodeJS.Signals;
  stopped: number[];
  missing: number[];
  errors: Array<{ pid: number; error: string }>;
}
