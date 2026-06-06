import type {
  FRONTIER_SWARM_CODEX_LINK_REPAIR_KIND,
  FRONTIER_SWARM_CODEX_LINK_REPAIR_VERSION,
  FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_KIND,
  FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_VERSION,
  FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_KIND,
  FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_VERSION,
  FRONTIER_SWARM_CODEX_PID_MANIFEST_KIND,
  FRONTIER_SWARM_CODEX_PID_MANIFEST_VERSION
} from './constants.js';
import type { FrontierCodexSwarmWorkspaceMode } from './types-run.js';

export interface FrontierCodexWorkspacePlan {
  mode: FrontierCodexSwarmWorkspaceMode;
  root: string;
  path: string;
  includes: string[];
  excludes: string[];
  artifactIncludes: string[];
  linkPaths: string[];
  requiredIncludes: string[];
  optionalIncludes: string[];
  strategy: string;
  guardRoot?: string;
  linkNodeModules: boolean;
  replace: boolean;
  skipGitRepoCheck: boolean;
}

export interface FrontierCodexWorkspaceManifest {
  kind: typeof FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_KIND;
  version: typeof FRONTIER_SWARM_CODEX_WORKSPACE_MANIFEST_VERSION;
  id: string;
  mode: FrontierCodexSwarmWorkspaceMode;
  root: string;
  path: string;
  includes: string[];
  excludes: string[];
  artifactIncludes: string[];
  linkPaths: string[];
  requiredIncludes: string[];
  optionalIncludes: string[];
  strategy: string;
  guardRoot?: string;
  linkNodeModules: boolean;
  skipGitRepoCheck: boolean;
}

export interface FrontierCodexWorkspaceProof {
  kind: typeof FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_KIND;
  version: typeof FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_VERSION;
  id: string;
  generatedAt: number;
  manifest: FrontierCodexWorkspaceManifest;
  copiedPaths: string[];
  linkedPaths: string[];
  missingRequired: string[];
  missingOptional: string[];
  ignoredChangedPaths: string[];
  summary: {
    copiedCount: number;
    linkedCount: number;
    missingRequiredCount: number;
    missingOptionalCount: number;
    ignoredChangedPathCount: number;
  };
}

export type FrontierCodexWorkspacePackageLinkStatus =
  | 'already-linked'
  | 'planned'
  | 'linked'
  | 'replaced'
  | 'excluded'
  | 'missing-local-package'
  | 'conflict';

export interface FrontierCodexWorkspacePackageLinkRepairInput {
  root?: string;
  packageRoots?: readonly string[];
  scope?: string;
  packages?: readonly string[];
  excludePackages?: readonly string[];
  write?: boolean;
  replace?: boolean;
  outFile?: string;
}

export interface FrontierCodexWorkspacePackageLinkEntry {
  packageName: string;
  dependencyRange?: string;
  linkPath: string;
  targetPath?: string;
  status: FrontierCodexWorkspacePackageLinkStatus;
  reason?: string;
}

export interface FrontierCodexWorkspacePackageLinkRepairResult {
  kind: typeof FRONTIER_SWARM_CODEX_LINK_REPAIR_KIND;
  version: typeof FRONTIER_SWARM_CODEX_LINK_REPAIR_VERSION;
  generatedAt: number;
  root: string;
  scope: string;
  packageRoots: string[];
  write: boolean;
  replace: boolean;
  entries: FrontierCodexWorkspacePackageLinkEntry[];
  summary: {
    total: number;
    planned: number;
    linked: number;
    replaced: number;
    alreadyLinked: number;
    excluded: number;
    missingLocalPackage: number;
    conflicts: number;
  };
  outFile?: string;
}

export interface FrontierCodexPidEntry {
  pid: number;
  role: 'parent' | 'codex' | string;
  runId?: string;
  jobId?: string;
  startedAt: number;
  command?: string[];
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
