import {
  applySwarmGitPreExecWriteFence,
  collectSwarmGitChangedPaths,
  createIgnoredSwarmGitWorkspaceChangedPathReasons,
  emptySwarmGitChangedPathCollection,
  filterSwarmGitChangedPaths,
  getIgnoredSwarmGitWorkspaceChangedPathReason,
  mergeSwarmGitChangedPathCollections,
  noIndexSwarmGitWorkspacePatch,
  normalizeSwarmGitChangedPath,
  quarantineSwarmGitPatchCandidatePaths,
  restoreSwarmGitChangedPaths,
  restoreSwarmGitPreExecWriteFence,
  runSwarmGitVerification,
  shouldSnapshotSwarmGitWorkspaceChanges,
  snapshotSwarmGitWorkspaceFiles,
  uniqueSwarmGitChangedPaths,
  writeSwarmGitPatchFile
} from '@shapeshift-labs/frontier-swarm-git';
import type { FrontierCodexJobPaths, FrontierCodexWorkspacePlan } from './index.js';

export {
  collectSwarmGitChangedPaths as collectChangedPaths,
  createIgnoredSwarmGitWorkspaceChangedPathReasons as createIgnoredWorkspaceChangedPathReasons,
  emptySwarmGitChangedPathCollection as emptyChangedPathCollection,
  filterSwarmGitChangedPaths as filterWorkspaceChangedPaths,
  getIgnoredSwarmGitWorkspaceChangedPathReason as getIgnoredWorkspaceChangedPathReason,
  mergeSwarmGitChangedPathCollections as mergeWorkspaceChangedPathCollections,
  normalizeSwarmGitChangedPath as normalizeWorkspaceChangedPath,
  shouldSnapshotSwarmGitWorkspaceChanges as shouldSnapshotWorkspaceChanges,
  snapshotSwarmGitWorkspaceFiles as snapshotWorkspaceFiles,
  uniqueSwarmGitChangedPaths as uniqueWorkspaceChangedPaths
};
export type {
  FrontierSwarmGitChangedPathCollection as FrontierCodexChangedPathCollection,
  FrontierSwarmGitWorkspaceFileSnapshot as FrontierCodexWorkspaceFileSnapshot,
  FrontierSwarmGitWorkspaceRestoreRecord as FrontierCodexWorkspaceRestoreRecord,
  FrontierSwarmGitWorkspaceWriteFenceRecord as FrontierCodexWorkspaceWriteFenceRecord,
  FrontierSwarmGitWorkspaceWriteFenceState as FrontierCodexWorkspaceWriteFenceState
} from '@shapeshift-labs/frontier-swarm-git';
export {
  applySwarmGitPreExecWriteFence as applyWorkspacePreExecWriteFence,
  restoreSwarmGitChangedPaths as restoreWorkspaceChangedPaths,
  restoreSwarmGitPreExecWriteFence as restoreWorkspacePreExecWriteFence
};

export function quarantineWorkspacePatchCandidatePaths(
  changedPaths: readonly string[],
  ownershipViolations: readonly string[]
): { patchCandidateChangedPaths: string[]; quarantinedChangedPaths: string[] } {
  return quarantineSwarmGitPatchCandidatePaths(changedPaths, ownershipViolations);
}

export async function writeCodexPatchFile(input: {
  workspace: string;
  sourceRoot: string;
  paths: FrontierCodexJobPaths;
  workspacePlan: FrontierCodexWorkspacePlan;
  changedPaths: readonly string[];
}): Promise<string | undefined> {
  return writeSwarmGitPatchFile({
    workspace: input.workspace,
    sourceRoot: input.sourceRoot,
    patchPath: input.paths.patchPath,
    workspacePlan: input.workspacePlan,
    changedPaths: input.changedPaths
  });
}

export const runVerification = runSwarmGitVerification;
export const noIndexWorkspacePatch = noIndexSwarmGitWorkspacePatch;
