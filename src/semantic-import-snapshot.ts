import fs from 'node:fs/promises';
import type { FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSemanticImportOptions } from './index.js';
import type { SemanticImportBaseSourceSnapshot } from './semantic-import-base.js';
import { discoverSemanticImportFallbackPaths, withSemanticImportFallback } from './semantic-import-fallback.js';
import { resolveSemanticImportWorkspacePath } from './semantic-import-path.js';
import {
  normalizeSemanticImportOptions,
  selectSemanticImportPaths,
  semanticImportCandidatePaths,
  semanticImportPathVariants
} from './semantic-import-select.js';

export async function snapshotCodexSemanticImportBaseSources(input: {
  job: FrontierSwarmJob;
  workspace: string;
  changedPaths?: readonly string[];
  options?: boolean | FrontierCodexSemanticImportOptions;
  semanticImportExpected?: boolean;
}): Promise<SemanticImportBaseSourceSnapshot | undefined> {
  const options = normalizeSemanticImportOptions(input.options);
  if (!options) return undefined;
  const candidatePaths = semanticImportCandidatePaths(input.job, input.changedPaths ?? [], input.workspace);
  let selection = selectSemanticImportPaths(candidatePaths, options);
  if (!selection.selected.length && input.semanticImportExpected === true) {
    const fallbackPaths = await discoverSemanticImportFallbackPaths(input.job, input.workspace, options);
    if (fallbackPaths.length) {
      selection = withSemanticImportFallback(
        selectSemanticImportPaths([...candidatePaths, ...fallbackPaths], options),
        fallbackPaths.length,
        'expected-semantic-import-empty-selection'
      );
    }
  }
  if (!selection.selected.length) return undefined;
  const snapshot: SemanticImportBaseSourceSnapshot = new Map();
  for (const file of selection.selected) await snapshotSelectedSource(snapshot, input.workspace, file.path, options.maxBytes);
  return snapshot.size ? snapshot : undefined;
}

async function snapshotSelectedSource(
  snapshot: SemanticImportBaseSourceSnapshot,
  workspace: string,
  file: string,
  maxBytes: number
): Promise<void> {
  const resolved = await resolveSemanticImportWorkspacePath(workspace, file);
  const stat = await fs.stat(resolved.absolute).catch(() => undefined);
  if (!stat?.isFile() || stat.size > maxBytes) return;
  const entry = {
    path: resolved.path,
    sourceText: await fs.readFile(resolved.absolute, 'utf8'),
    bytes: stat.size,
    source: 'workspace-snapshot' as const,
    foundBy: 'pre-execution-semantic-snapshot'
  };
  for (const variant of semanticImportPathVariants(resolved.path)) snapshot.set(variant, entry);
  if (resolved.path !== file) {
    for (const variant of semanticImportPathVariants(file)) snapshot.set(variant, entry);
  }
}
