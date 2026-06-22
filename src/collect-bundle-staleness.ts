import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmMergeBundle, FrontierSwarmPatchStatus } from '@shapeshift-labs/frontier-swarm';
import {
  checkSwarmGitPatch,
  hashSwarmGitWorkspaceFile,
  readSwarmGitHeadBlobHash,
  type FrontierSwarmGitLoggedCommandResult
} from '@shapeshift-labs/frontier-swarm-git';
import { pathExists, resolveBundlePatchPath, uniqueStrings } from './common.js';
import { collectFailureReasonClasses } from './collect-bundle-reasons.js';

export interface FrontierCodexPatchStaleness {
  stale: boolean;
  patchStatus: FrontierSwarmPatchStatus;
  reasons: string[];
  reasonClasses: string[];
  fresh: boolean;
}

export async function bundlePatchStaleness(
  bundle: FrontierSwarmMergeBundle,
  mergePath: string,
  cwd: string
): Promise<FrontierCodexPatchStaleness> {
  const patchPath = resolveBundlePatchPath(bundle, mergePath);
  if (!patchPath || !await pathExists(patchPath)) return patchStalenessResult(false, 'missing', ['missing patch'], false);
  const patch = await fs.readFile(patchPath, 'utf8').catch(() => '');
  if (!patch.trim()) return patchStalenessResult(false, 'missing', ['empty patch'], false);
  const result = await checkSwarmGitPatch({ cwd, patchPath });
  if (result.ok) return patchStalenessResult(false, 'applies', ['patch applies to working tree'], true);
  const cached = await checkSwarmGitPatch({ cwd, patchPath, cached: true });
  if (cached.ok) {
    return patchStalenessResult(false, 'dirty-workspace-conflict', ['patch applies to index but not dirty working tree'], true);
  }
  const baseStatus = await patchBaseHashStatus(patch, cwd);
  if (!baseStatus.known) {
    return patchStalenessResult(
      false,
      'needs-port',
      ['patch does not expose comparable base hashes; coordinator review must port it', ...baseStatus.reasons, ...loggedCommandTail(result.command, 3)],
      false
    );
  }
  if (baseStatus.known && baseStatus.mismatched === 0) {
    return patchStalenessResult(
      false,
      'needs-port',
      ['patch base hashes match HEAD or working tree content but textual apply failed', ...baseStatus.reasons, ...loggedCommandTail(result.command, 3)],
      true
    );
  }
  return patchStalenessResult(
    false,
    'needs-port',
    ['patch base hashes differ from HEAD and working tree content; manual port required', ...baseStatus.reasons, ...loggedCommandTail(result.command, 3)],
    false
  );
}

function patchStalenessResult(
  stale: boolean,
  patchStatus: FrontierSwarmPatchStatus,
  reasons: readonly string[],
  fresh: boolean
): FrontierCodexPatchStaleness {
  const normalizedReasons = uniqueStrings([...reasons]);
  return {
    stale,
    patchStatus,
    reasons: normalizedReasons,
    reasonClasses: collectFailureReasonClasses(normalizedReasons, patchStatus),
    fresh
  };
}

async function patchBaseHashStatus(patch: string, cwd: string): Promise<{ known: boolean; mismatched: number; reasons: string[] }> {
  const entries = parsePatchBaseHashes(patch, cwd);
  if (entries.length === 0) return { known: false, mismatched: 0, reasons: ['no patch base hashes available'] };
  let mismatched = 0;
  const reasons: string[] = [];
  for (const entry of entries) {
    const head = await readSwarmGitHeadBlobHash({ cwd, file: entry.path });
    if (head.ok && head.hash?.startsWith(entry.oldHash)) continue;
    const worktree = await hashSwarmGitWorkspaceFile({ cwd, file: entry.path });
    if (worktree.ok && worktree.hash?.startsWith(entry.oldHash)) {
      reasons.push(`base hash matches working tree content for ${entry.path}`);
      continue;
    }
    mismatched += 1;
    reasons.push(!head.ok ? `missing HEAD blob for ${entry.path}` : `base hash mismatch for ${entry.path}`);
  }
  return { known: true, mismatched, reasons };
}

function loggedCommandTail(command: FrontierSwarmGitLoggedCommandResult, maxLines: number): string[] {
  const preferred = command.stderrTail.length ? command.stderrTail : command.stdoutTail;
  return preferred.slice(-maxLines);
}

function parsePatchBaseHashes(patch: string, cwd: string): Array<{ path: string; oldHash: string }> {
  const lines = patch.split(/\r?\n/);
  const entries: Array<{ path: string; oldHash: string }> = [];
  let currentPath: string | undefined;
  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const parts = line.split(/\s+/);
      currentPath = normalizePatchBasePath(parts[2], cwd) ?? normalizePatchBasePath(parts[3], cwd);
      continue;
    }
    if (!currentPath || !line.startsWith('index ')) continue;
    const match = /^index\s+([0-9a-f]+)\.\.([0-9a-f]+)/i.exec(line);
    if (match?.[1] && match[1] !== '0000000') entries.push({ path: currentPath, oldHash: match[1] });
  }
  return entries;
}

function normalizePatchBasePath(token: string | undefined, cwd: string): string | undefined {
  if (!token || token === '/dev/null') return undefined;
  let value = token;
  if (value.startsWith('a/') || value.startsWith('b/')) value = value.slice(2);
  if (value === '/dev/null') return undefined;
  if (path.isAbsolute(value)) {
    const relative = path.relative(cwd, value);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return relative.replace(/\\/g, '/');
    return undefined;
  }
  const rootedValue = path.join(path.parse(cwd).root, value);
  const rootedRelative = path.relative(cwd, rootedValue);
  if (rootedRelative && !rootedRelative.startsWith('..') && !path.isAbsolute(rootedRelative)) return rootedRelative.replace(/\\/g, '/');
  return value.replace(/\\/g, '/');
}
