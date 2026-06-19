import fs from 'node:fs/promises';
import { FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_KIND } from './constants.js';
import { isObject } from './common.js';
import type { FrontierCodexWorkspaceProof } from './types-workspace.js';

export async function readFrontierCodexWorkspaceProof(file: string): Promise<FrontierCodexWorkspaceProof | undefined> {
  const value = await readJsonObjectFile(file);
  if (value.kind !== FRONTIER_SWARM_CODEX_WORKSPACE_PROOF_KIND || !isObject(value.manifest)) return undefined;
  const manifest = value.manifest;
  if (typeof manifest.path !== 'string' || typeof manifest.mode !== 'string') return undefined;
  if (!['current', 'git-worktree', 'copy', 'snapshot'].includes(manifest.mode)) return undefined;
  return value as unknown as FrontierCodexWorkspaceProof;
}

async function readJsonObjectFile(file: string): Promise<Record<string, unknown>> {
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}
