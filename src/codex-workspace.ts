import path from 'node:path';
import type { FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import {
  createSwarmGitWorkspaceManifest,
  createSwarmGitWorkspacePlan,
  createSwarmGitWorkspaceProof,
  prepareSwarmGitWorkspace,
  type FrontierSwarmGitWorkspaceRunOptions
} from '@shapeshift-labs/frontier-swarm-git';
import type {
  FrontierCodexSwarmRunOptions,
  FrontierCodexWorkspaceManifest,
  FrontierCodexWorkspacePlan,
  FrontierCodexWorkspaceProof
} from './index.js';

export async function prepareCodexWorkspace(job: FrontierSwarmJob, options: FrontierCodexSwarmRunOptions): Promise<string> {
  return prepareSwarmGitWorkspace(job, codexWorkspaceOptions(options));
}

export function createCodexWorkspacePlan(job: FrontierSwarmJob, options: FrontierCodexSwarmRunOptions): FrontierCodexWorkspacePlan {
  return createSwarmGitWorkspacePlan(job, codexWorkspaceOptions(options));
}

export function createSwarmWorkspaceManifest(plan: FrontierCodexWorkspacePlan): FrontierCodexWorkspaceManifest {
  return createSwarmGitWorkspaceManifest(plan);
}

export async function createSwarmWorkspaceProof(
  plan: FrontierCodexWorkspacePlan,
  input: {
    ignoredChangedPaths?: readonly string[];
    ignoredChangedPathReasons?: FrontierCodexWorkspaceProof['ignoredChangedPathReasons'];
    observedChangedPaths?: readonly string[];
    reportedChangedPaths?: readonly string[];
    preExecWriteFence?: FrontierCodexWorkspaceProof['preExecWriteFence'];
    generatedAt?: number;
  } = {}
): Promise<FrontierCodexWorkspaceProof> {
  return createSwarmGitWorkspaceProof(plan, input);
}

function codexWorkspaceOptions(options: FrontierCodexSwarmRunOptions): FrontierSwarmGitWorkspaceRunOptions {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const workspace = options.workspace ?? {};
  const root = workspace.root ?? path.join('agent-worktrees', 'frontier-swarm-codex');
  return {
    ...options,
    cwd,
    workspace: {
      ...workspace,
      root,
      guardRoot: workspace.guardRoot ?? root
    }
  };
}
