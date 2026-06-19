import type { FrontierCodexSwarmRunOptions, FrontierCodexSwarmRunResult } from './types-run.js';

export type FrontierCodexResumeJobStatus = 'completed' | 'failed' | 'blocked' | 'evidence-only' | 'rerun-needed';

export interface FrontierCodexResumeJob {
  jobId: string;
  taskId: string;
  lane: string;
  status: FrontierCodexResumeJobStatus;
  shouldResume: boolean;
  reason: string;
  evidencePaths: string[];
  lastMessagePath?: string;
  previousResultPath?: string;
}

export interface FrontierCodexResumeOverlay {
  kind: 'frontier.swarm-codex.resume-overlay';
  version: 1;
  generatedAt: number;
  sourceRunDir: string;
  sourcePlanPath: string;
  sourceResultsPath?: string;
  resumeJobIds: string[];
  jobs: FrontierCodexResumeJob[];
  summary: {
    total: number;
    completed: number;
    failed: number;
    blocked: number;
    evidenceOnly: number;
    rerunNeeded: number;
    resume: number;
  };
}

export interface FrontierCodexResumeOptions {
  run: string;
  includeCompleted?: boolean;
  includeFailed?: boolean;
  includeBlocked?: boolean;
  includeEvidenceOnly?: boolean;
  outFile?: string;
}

export type FrontierCodexResumeRunOptions = FrontierCodexResumeOptions & FrontierCodexSwarmRunOptions;

export interface FrontierCodexResumeRunResult extends FrontierCodexSwarmRunResult {
  resumeOverlay: FrontierCodexResumeOverlay;
  resumeOverlayPath: string;
}
