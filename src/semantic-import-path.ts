import fs from 'node:fs/promises';
import path from 'node:path';
import { semanticImportPathVariants } from './semantic-import-select.js';

export async function resolveSemanticImportWorkspacePath(workspace: string, file: string): Promise<{ path: string; absolute: string }> {
  for (const candidate of semanticImportPathVariants(file)) {
    const absolute = path.join(workspace, candidate);
    const stat = await fs.stat(absolute).catch(() => undefined);
    if (stat?.isFile()) return { path: candidate, absolute };
  }
  return { path: file, absolute: path.join(workspace, file) };
}
