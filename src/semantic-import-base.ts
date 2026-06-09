import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeWorkspacePath, pathExists, runProcess } from './common.js';
import { semanticImportPathVariants } from './semantic-import-select.js';

export interface SemanticImportBaseSource {
  path: string;
  sourceText: string;
  bytes: number;
  source: 'coordinator-workspace' | 'git-head';
  foundBy: string;
}

export interface NativeSourceChangeSetSummary {
  kind?: string;
  id?: string;
  beforeHash?: string;
  afterHash?: string;
  changedSymbols: number;
  changedRegions: number;
  readiness?: string;
  reasons: string[];
}

export async function readSemanticImportBaseSource(input: {
  baseCwd?: string;
  workspace: string;
  file: string;
  maxBytes: number;
}): Promise<SemanticImportBaseSource | undefined> {
  if (!input.baseCwd) return undefined;
  const baseCwd = path.resolve(input.baseCwd);
  const workspace = path.resolve(input.workspace);
  const variants = semanticImportPathVariants(input.file);
  if (!variants.length) return undefined;
  if (baseCwd !== workspace) {
    const fromWorkspace = await readBaseSourceFromWorkspace(baseCwd, variants, input.maxBytes);
    if (fromWorkspace) return fromWorkspace;
  }
  return readBaseSourceFromGit(baseCwd, variants, input.maxBytes);
}

export function summarizeNativeSourceChangeSet(value: any): NativeSourceChangeSetSummary | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    id: value.id,
    beforeHash: value.beforeHash,
    afterHash: value.afterHash,
    changedSymbols: Array.isArray(value.changedSymbols) ? value.changedSymbols.length : 0,
    changedRegions: Array.isArray(value.changedRegions) ? value.changedRegions.length : 0,
    readiness: value.readiness,
    reasons: Array.isArray(value.reasons) ? value.reasons.slice(0, 24).map(String) : []
  };
}

async function readBaseSourceFromWorkspace(
  baseCwd: string,
  variants: readonly string[],
  maxBytes: number
): Promise<SemanticImportBaseSource | undefined> {
  for (const candidate of variants) {
    const normalized = normalizeWorkspacePath(candidate);
    if (!normalized) continue;
    const absolute = path.join(baseCwd, normalized);
    const stat = await fs.stat(absolute).catch(() => undefined);
    if (!stat?.isFile() || stat.size > maxBytes) continue;
    return {
      path: normalized,
      sourceText: await fs.readFile(absolute, 'utf8'),
      bytes: stat.size,
      source: 'coordinator-workspace',
      foundBy: 'filesystem'
    };
  }
  return undefined;
}

async function readBaseSourceFromGit(
  baseCwd: string,
  variants: readonly string[],
  maxBytes: number
): Promise<SemanticImportBaseSource | undefined> {
  if (!await pathExists(path.join(baseCwd, '.git'))) return undefined;
  for (const candidate of variants) {
    const normalized = normalizeWorkspacePath(candidate);
    if (!normalized) continue;
    const result = await runProcess('git', ['show', `HEAD:${normalized}`], { cwd: baseCwd, allowFailure: true });
    if (result.status !== 0 || Buffer.byteLength(result.stdout, 'utf8') > maxBytes) continue;
    return {
      path: normalized,
      sourceText: result.stdout,
      bytes: Buffer.byteLength(result.stdout, 'utf8'),
      source: 'git-head',
      foundBy: 'git-show-head'
    };
  }
  return undefined;
}
