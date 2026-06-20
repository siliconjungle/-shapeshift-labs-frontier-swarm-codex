import fs from 'node:fs/promises';
import path from 'node:path';
import { pathExists, uniqueWorkspacePaths } from './common.js';
import { snapshotContainsWorkspacePath, type FrontierCodexWorkspaceFileSnapshot } from './codex-workspace-change-paths.js';
import type { FrontierCodexWorkspacePlan } from './index.js';

export interface FrontierCodexWorkspaceRestoreRecord {
  path: string;
  action: 'restored' | 'deleted' | 'missing' | 'skipped';
  reason: string;
}

export async function restoreWorkspaceChangedPaths(input: {
  workspace: string;
  sourceRoot: string;
  workspacePlan: FrontierCodexWorkspacePlan;
  baseline?: FrontierCodexWorkspaceFileSnapshot;
  changedPaths: readonly string[];
}): Promise<FrontierCodexWorkspaceRestoreRecord[]> {
  const paths = uniqueWorkspacePaths(input.changedPaths);
  if (!paths.length) return [];
  if (input.workspacePlan.mode !== 'copy' && input.workspacePlan.mode !== 'snapshot') {
    return paths.map((file) => ({
      path: file,
      action: 'skipped',
      reason: `workspace mode ${input.workspacePlan.mode} is not isolated`
    }));
  }

  const records: FrontierCodexWorkspaceRestoreRecord[] = [];
  for (const file of paths) {
    const source = path.join(input.sourceRoot, file);
    const target = path.join(input.workspace, file);
    const sourceExists = await pathExists(source);
    const targetExists = await pathExists(target);
    const existedAtBaseline = input.baseline ? snapshotContainsWorkspacePath(input.baseline, file) : undefined;
    if (input.baseline && !existedAtBaseline) {
      if (targetExists) {
        await fs.rm(target, { recursive: true, force: true });
        await pruneUnauthorizedEmptyParents(input.workspace, file, input.baseline);
        records.push({ path: file, action: 'deleted', reason: 'removed unauthorized new path' });
      } else {
        records.push({ path: file, action: 'missing', reason: 'path absent in workspace baseline and workspace' });
      }
    } else if (sourceExists) {
      await fs.rm(target, { recursive: true, force: true });
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.cp(source, target, { recursive: true, force: true, verbatimSymlinks: true });
      records.push({ path: file, action: 'restored', reason: 'restored from source root' });
    } else if (targetExists) {
      await fs.rm(target, { recursive: true, force: true });
      if (input.baseline) await pruneUnauthorizedEmptyParents(input.workspace, file, input.baseline);
      records.push({ path: file, action: 'deleted', reason: 'removed unauthorized path missing from source root' });
    } else {
      records.push({ path: file, action: 'missing', reason: 'path absent in source and workspace' });
    }
  }
  return records;
}

async function pruneUnauthorizedEmptyParents(
  workspace: string,
  file: string,
  baseline: FrontierCodexWorkspaceFileSnapshot
): Promise<void> {
  let current = path.dirname(file);
  while (current && current !== '.' && !path.isAbsolute(current)) {
    if (snapshotContainsWorkspacePath(baseline, current)) return;
    const absolute = path.join(workspace, current);
    try {
      await fs.rmdir(absolute);
    } catch {
      return;
    }
    current = path.dirname(current);
  }
}
