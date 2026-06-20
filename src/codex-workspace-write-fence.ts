import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeWorkspacePath, shouldPruneWorkspaceWriteFenceTraversal } from './common.js';
import type { FrontierCodexWorkspacePlan, FrontierCodexWorkspaceWriteFenceSummary } from './index.js';

export interface FrontierCodexWorkspaceWriteFenceRecord {
  path: string;
  absolutePath: string;
  kind: 'file' | 'directory';
  originalMode: number;
  fencedMode: number;
}

export interface FrontierCodexWorkspaceWriteFenceState {
  summary: FrontierCodexWorkspaceWriteFenceSummary;
  records: FrontierCodexWorkspaceWriteFenceRecord[];
}

const WRITE_FENCE_LIMITATIONS = [
  'chmod-readonly is a best-effort pre-exec fence, not a security sandbox',
  'a worker running as the same OS user can chmod owned paths back to writable',
  'workspace root and allowed-write ancestors may remain writable so allowed new files can be created',
  'symlinks and heavyweight dependency/run artifact trees are not traversed; strict post-exec restore is the durable enforcement'
];

export async function applyWorkspacePreExecWriteFence(input: {
  workspace: string;
  workspacePlan: FrontierCodexWorkspacePlan;
  allowedWrites: readonly string[];
  writableRoots?: readonly string[];
  enabled?: boolean;
}): Promise<FrontierCodexWorkspaceWriteFenceState> {
  const writableRoots = uniqueWriteFenceRoots(input.writableRoots ?? input.allowedWrites);
  const skipped = skippedWriteFenceReason(input.enabled !== false, input.workspacePlan);
  if (skipped) return { records: [], summary: createWriteFenceSummary({ mode: 'none', skippedReason: skipped, writableRoots }) };
  const records: FrontierCodexWorkspaceWriteFenceRecord[] = [];
  await walkWorkspaceWriteFence(input.workspace, input.workspace, writableRoots, records);
  return {
    records,
    summary: createWriteFenceSummary({
      mode: 'chmod-readonly',
      applied: records.length > 0,
      lockedPathCount: records.length,
      sampleLockedPaths: records.slice(0, 20).map((entry) => entry.path),
      writableRoots
    })
  };
}

export async function restoreWorkspacePreExecWriteFence(
  state: FrontierCodexWorkspaceWriteFenceState
): Promise<FrontierCodexWorkspaceWriteFenceSummary> {
  let restoredPathCount = 0;
  let failedRestoreCount = 0;
  for (const record of [...state.records].reverse()) {
    try {
      await fs.chmod(record.absolutePath, record.originalMode);
      restoredPathCount += 1;
    } catch {
      failedRestoreCount += 1;
    }
  }
  return { ...state.summary, restoredPathCount, failedRestoreCount };
}

async function walkWorkspaceWriteFence(
  root: string,
  current: string,
  allowedWrites: readonly string[],
  records: FrontierCodexWorkspaceWriteFenceRecord[]
): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replace(/\\/g, '/');
    if (!relative || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (shouldPruneWorkspaceWriteFenceTraversal(relative)) {
        await fenceWorkspacePath(absolute, relative, 'directory', allowedWrites, records);
        continue;
      }
      await walkWorkspaceWriteFence(root, absolute, allowedWrites, records);
      await fenceWorkspacePath(absolute, relative, 'directory', allowedWrites, records);
    } else if (entry.isFile()) {
      await fenceWorkspacePath(absolute, relative, 'file', allowedWrites, records);
    }
  }
}

async function fenceWorkspacePath(
  absolutePath: string,
  relativePath: string,
  kind: 'file' | 'directory',
  allowedWrites: readonly string[],
  records: FrontierCodexWorkspaceWriteFenceRecord[]
): Promise<void> {
  const keepWritable = kind === 'directory'
    ? allowedWrites.some((entry) => writeEntryCoversDirectory(relativePath, entry))
    : allowedWrites.some((entry) => writeEntryCoversFile(relativePath, entry));
  if (keepWritable) return;
  const stat = await fs.lstat(absolutePath).catch(() => undefined);
  if (!stat) return;
  const originalMode = stat.mode & 0o7777;
  const fencedMode = originalMode & ~0o222;
  if (fencedMode === originalMode) return;
  await fs.chmod(absolutePath, fencedMode).catch(() => {});
  const after = await fs.lstat(absolutePath).catch(() => undefined);
  if (!after || (after.mode & 0o222) !== 0) return;
  records.push({ path: relativePath, absolutePath, kind, originalMode, fencedMode });
}

function writeEntryCoversFile(file: string, entry: string): boolean {
  const parsed = parseWriteFenceEntry(entry);
  if (!parsed) return false;
  if (parsed.all) return true;
  return file === parsed.prefix || file.startsWith(parsed.prefix + '/');
}

function writeEntryCoversDirectory(directory: string, entry: string): boolean {
  const parsed = parseWriteFenceEntry(entry);
  if (!parsed) return false;
  if (parsed.all) return true;
  return directory === parsed.prefix
    || directory.startsWith(parsed.prefix + '/')
    || parsed.prefix.startsWith(directory + '/');
}

function parseWriteFenceEntry(entry: string): { all: true } | { all: false; prefix: string } | undefined {
  const raw = String(entry ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!raw || raw.includes('\0') || path.isAbsolute(raw) || path.win32.isAbsolute(raw)) return undefined;
  if (raw === '*' || raw === '**' || raw === '**/*') return { all: true };
  const starIndex = raw.indexOf('*');
  const staticPart = writeFenceStaticRoot(raw, starIndex);
  const prefix = normalizeWorkspacePath(staticPart);
  return prefix ? { all: false, prefix } : undefined;
}

function writeFenceStaticRoot(raw: string, starIndex: number): string {
  if (starIndex < 0) return raw.replace(/\/+$/, '');
  const staticPart = raw.slice(0, starIndex);
  if (staticPart.endsWith('/')) return staticPart.replace(/\/+$/, '');
  const segmentEnd = staticPart.lastIndexOf('/');
  if (segmentEnd < 0) return '';
  return staticPart.slice(0, segmentEnd).replace(/\/+$/, '');
}

function skippedWriteFenceReason(enabled: boolean, plan: FrontierCodexWorkspacePlan): string | undefined {
  if (!enabled) return 'worker execution skipped';
  if (plan.allowedWritePolicy.mode !== 'strict') return 'allowed write policy is audit';
  if (plan.mode !== 'copy' && plan.mode !== 'snapshot') return `workspace mode ${plan.mode} is not isolated`;
  return undefined;
}

function createWriteFenceSummary(input: {
  mode: FrontierCodexWorkspaceWriteFenceSummary['mode'];
  applied?: boolean;
  skippedReason?: string;
  lockedPathCount?: number;
  sampleLockedPaths?: string[];
  writableRoots: readonly string[];
}): FrontierCodexWorkspaceWriteFenceSummary {
  return {
    mode: input.mode,
    applied: input.applied ?? false,
    ...(input.skippedReason ? { skippedReason: input.skippedReason } : {}),
    lockedPathCount: input.lockedPathCount ?? 0,
    restoredPathCount: 0,
    failedRestoreCount: 0,
    sampleLockedPaths: input.sampleLockedPaths ?? [],
    writableRoots: uniqueWriteFenceRoots(input.writableRoots),
    limitations: WRITE_FENCE_LIMITATIONS
  };
}

function uniqueWriteFenceRoots(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const root = String(value ?? '').trim();
    if (!root || seen.has(root)) continue;
    seen.add(root);
    out.push(root);
  }
  return out;
}
