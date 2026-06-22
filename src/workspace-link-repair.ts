import { repairSwarmGitWorkspacePackageLinks } from '@shapeshift-labs/frontier-swarm-git';
import type {
  FrontierCodexWorkspacePackageLinkRepairInput,
  FrontierCodexWorkspacePackageLinkRepairResult
} from './types.js';

export async function repairCodexWorkspacePackageLinks(
  input: FrontierCodexWorkspacePackageLinkRepairInput = {}
): Promise<FrontierCodexWorkspacePackageLinkRepairResult> {
  return repairSwarmGitWorkspacePackageLinks(input) as Promise<FrontierCodexWorkspacePackageLinkRepairResult>;
}
