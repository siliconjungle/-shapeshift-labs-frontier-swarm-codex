import fs from 'node:fs/promises';
import path from 'node:path';
import { type FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSemanticImportOptions } from './index.js';
import { normalizeWorkspacePath, pathHasIgnoredSegment, uniqueWorkspacePaths } from './common.js';
import {
  inferSemanticImportLanguage,
  matchesSemanticImportGlob,
  type SemanticImportSelection
} from './semantic-import-select.js';

type NormalizedSemanticImportOptions =
  Required<Pick<FrontierCodexSemanticImportOptions, 'maxFiles' | 'maxBytes'>> &
  FrontierCodexSemanticImportOptions;

export async function discoverSemanticImportFallbackPaths(
  job: FrontierSwarmJob,
  workspace: string,
  options: NormalizedSemanticImportOptions
): Promise<string[]> {
  const patterns = semanticImportFallbackPatterns(job, options);
  if (!patterns.length) return [];
  const limit = Math.max(options.maxFiles * 8, 24);
  const out: string[] = [];
  await walkSemanticImportFallback(workspace, workspace, patterns, options, out, limit);
  return uniqueWorkspacePaths(out);
}

export function withSemanticImportFallback(
  selection: SemanticImportSelection,
  fallbackCount: number,
  fallbackReason: string
): SemanticImportSelection {
  return {
    ...selection,
    fallbackCount,
    fallbackReason
  };
}

function semanticImportFallbackPatterns(
  job: FrontierSwarmJob,
  options: NormalizedSemanticImportOptions
): string[] {
  return [
    ...(options.include ?? []),
    ...job.task.sourceRefs,
    ...job.task.targetRefs,
    ...job.task.allowedWrites,
    ...job.allowedWrites
  ].map(normalizeSemanticImportGlob).filter((entry): entry is string => !!entry);
}

async function walkSemanticImportFallback(
  root: string,
  current: string,
  patterns: readonly string[],
  options: NormalizedSemanticImportOptions,
  out: string[],
  limit: number
): Promise<void> {
  if (out.length >= limit) return;
  const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (out.length >= limit) return;
    const absolute = path.join(current, entry.name);
    const relative = normalizeWorkspacePath(path.relative(root, absolute).replace(/\\/g, '/'));
    if (!relative || pathHasIgnoredSegment(relative, ['node_modules', 'dist', 'coverage', 'agent-runs', '.frontier-framework'])) continue;
    if (entry.isDirectory()) {
      await walkSemanticImportFallback(root, absolute, patterns, options, out, limit);
      continue;
    }
    if (!entry.isFile() || !inferSemanticImportLanguage(relative, options.languages)) continue;
    if (patterns.some((pattern) => matchesSemanticImportGlob(relative, pattern))) out.push(relative);
  }
}

function normalizeSemanticImportGlob(glob: string): string | undefined {
  const clean = String(glob ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!clean || clean.includes('\0') || path.isAbsolute(clean) || clean.startsWith('..')) return undefined;
  return path.normalize(clean).replace(/\\/g, '/');
}
