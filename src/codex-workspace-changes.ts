import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmCommand } from '@shapeshift-labs/frontier-swarm';
import { pathExists, runProcess, tail, uniqueWorkspacePaths } from './common.js';
import type { FrontierCodexJobPaths, FrontierCodexWorkspacePlan } from './index.js';

export {
  collectChangedPaths,
  createIgnoredWorkspaceChangedPathReasons,
  emptyChangedPathCollection,
  filterWorkspaceChangedPaths,
  getIgnoredWorkspaceChangedPathReason,
  mergeWorkspaceChangedPathCollections,
  normalizeWorkspaceChangedPath,
  shouldSnapshotWorkspaceChanges,
  snapshotWorkspaceFiles,
  uniqueWorkspaceChangedPaths
} from './codex-workspace-change-paths.js';
export type {
  FrontierCodexChangedPathCollection,
  FrontierCodexWorkspaceFileSnapshot
} from './codex-workspace-change-paths.js';
export { restoreWorkspaceChangedPaths } from './codex-workspace-restore.js';
export type { FrontierCodexWorkspaceRestoreRecord } from './codex-workspace-restore.js';
export {
  applyWorkspacePreExecWriteFence,
  restoreWorkspacePreExecWriteFence
} from './codex-workspace-write-fence.js';
export type {
  FrontierCodexWorkspaceWriteFenceRecord,
  FrontierCodexWorkspaceWriteFenceState
} from './codex-workspace-write-fence.js';

export function quarantineWorkspacePatchCandidatePaths(
  changedPaths: readonly string[],
  ownershipViolations: readonly string[]
): { patchCandidateChangedPaths: string[]; quarantinedChangedPaths: string[] } {
  const violations = new Set(ownershipViolations);
  const patchCandidateChangedPaths: string[] = [];
  const quarantinedChangedPaths: string[] = [];
  for (const file of uniqueWorkspacePaths(changedPaths)) {
    if (violations.has(file)) quarantinedChangedPaths.push(file);
    else patchCandidateChangedPaths.push(file);
  }
  return { patchCandidateChangedPaths, quarantinedChangedPaths };
}

export async function writeCodexPatchFile(input: {
  workspace: string;
  sourceRoot: string;
  paths: FrontierCodexJobPaths;
  workspacePlan: FrontierCodexWorkspacePlan;
  changedPaths: readonly string[];
}): Promise<string | undefined> {
  await fs.mkdir(path.dirname(input.paths.patchPath), { recursive: true });
  const changedPaths = uniqueWorkspacePaths(input.changedPaths);
  if (changedPaths.length === 0) {
    await fs.writeFile(input.paths.patchPath, '');
    return undefined;
  }
  const diff = input.workspacePlan.mode === 'copy' || input.workspacePlan.mode === 'snapshot'
    ? await noIndexWorkspacePatch(input.sourceRoot, input.workspace, changedPaths)
    : input.workspacePlan.mode === 'git-worktree'
      ? await noIndexWorkspacePatch(input.sourceRoot, input.workspace, changedPaths)
      : await gitDiffPatch(input.workspace, changedPaths);
  await fs.writeFile(input.paths.patchPath, diff);
  return diff.trim().length ? input.paths.patchPath : undefined;
}

export async function runVerification(
  commands: readonly FrontierSwarmCommand[],
  cwd: string
): Promise<Array<{ name: string; command: string[]; status: number; durationMs: number; stdoutTail: string[]; stderrTail: string[]; required: boolean }>> {
  const results = [];
  for (const command of commands) {
    const startedAt = Date.now();
    const run = await runProcess(command.command, command.args, { cwd, allowFailure: true });
    results.push({
      name: command.name,
      command: [command.command, ...command.args],
      status: run.status,
      durationMs: Date.now() - startedAt,
      stdoutTail: tail(run.stdout),
      stderrTail: tail(run.stderr),
      required: command.required
    });
    if (run.status !== 0 && command.required) break;
  }
  return results;
}

async function gitDiffPatch(workspace: string, changedPaths: readonly string[]): Promise<string> {
  const result = await runProcess('git', ['diff', '--', ...changedPaths], { cwd: workspace, allowFailure: true });
  return result.stdout;
}

export async function noIndexWorkspacePatch(sourceRoot: string, workspace: string, changedPaths: readonly string[]): Promise<string> {
  const chunks: string[] = [];
  for (const file of changedPaths) {
    const source = path.join(sourceRoot, file);
    const target = path.join(workspace, file);
    const sourceExists = await pathExists(source);
    const targetExists = await pathExists(target);
    if (!sourceExists && !targetExists) continue;
    const left = sourceExists ? source : '/dev/null';
    const right = targetExists ? target : '/dev/null';
    const result = await runProcess('git', ['diff', '--no-index', '--', left, right], { cwd: sourceRoot, allowFailure: true });
    if (result.stdout.trim()) chunks.push(rewriteNoIndexPatchPaths(result.stdout, file, { sourceExists, targetExists }));
  }
  return chunks.join('\n');
}

function rewriteNoIndexPatchPaths(
  patch: string,
  file: string,
  input: { sourceExists: boolean; targetExists: boolean }
): string {
  const oldPath = input.sourceExists ? `a/${file}` : '/dev/null';
  const newPath = input.targetExists ? `b/${file}` : '/dev/null';
  return patch.split(/\r?\n/).map((line) => {
    if (line.startsWith('diff --git ')) return `diff --git a/${file} b/${file}`;
    if (line.startsWith('--- ')) return `--- ${oldPath}`;
    if (line.startsWith('+++ ')) return `+++ ${newPath}`;
    return line;
  }).join('\n');
}
