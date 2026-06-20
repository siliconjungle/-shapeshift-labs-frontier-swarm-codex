import type { FrontierCodexDashboardIgnoredChangedPathReason } from './types-dashboard.js';

export interface DashboardWorkspaceOwnershipEvidence {
  ignoredChangedPaths: string[];
  ignoredChangedPathCount: number;
  ignoredChangedPathReasonCounts: Record<string, number>;
  ignoredChangedPathSamples: string[];
  ignoredChangedPathReasonSamples: FrontierCodexDashboardIgnoredChangedPathReason[];
  observedChangedPathCount: number;
  reportedChangedPathCount: number;
}

export interface DashboardArtifactContext {
  cwd: string;
  artifactRoots: string[];
  artifactBases: string[];
}

export interface CollectedDashboardSource {
  file: string;
  dir: string;
  dashboard: Record<string, unknown>;
}
