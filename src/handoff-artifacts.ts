import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierCodexHandoffArtifact, FrontierCodexHandoffArtifactKind, FrontierCodexHandoffDiscoveryInput } from './index.js';


export function classifyCodexHandoffArtifact(file: string): FrontierCodexHandoffArtifactKind | undefined {
  const normalized = file.replace(/\\/g, '/').toLowerCase();
  const name = path.basename(normalized);
  if (name === 'last-message.md' || name === 'last.md') return 'last-message';
  if (name.endsWith('.patch') || name.endsWith('.diff')) return 'patch';
  if (normalized.includes('debug-handoff') || normalized.includes('/debug/') || name.includes('handoff')) return 'debug-handoff';
  if (name.includes('replay')) return 'replay';
  if (name.includes('watchpoint')) return 'watchpoint';
  if (name.includes('trace') || normalized.endsWith('.trace.jsonl')) return 'trace';
  if (name.includes('diagnostic') || name.includes('health') || name.includes('probe')) return 'diagnostic';
  if (name.endsWith('.log') || name.includes('codex-events') || name.includes('events.jsonl')) return 'log';
  if (name === 'evidence.json' || name === 'merge.json' || name === 'resource-allocation.json' || name === 'workspace-proof.json') return 'evidence';
  return undefined;
}

export async function discoverCodexHandoffArtifacts(input: FrontierCodexHandoffDiscoveryInput): Promise<FrontierCodexHandoffArtifact[]> {
  const root = path.resolve(input.root);
  const maxDepth = Math.max(0, Math.floor(input.maxDepth ?? 3));
  const maxArtifacts = Math.max(1, Math.floor(input.maxArtifacts ?? 64));
  const artifacts: FrontierCodexHandoffArtifact[] = [];
  const visit = async (dir: string, depth: number): Promise<void> => {
    if (artifacts.length >= maxArtifacts || depth > maxDepth) return;
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (artifacts.length >= maxArtifacts) return;
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = classifyCodexHandoffArtifact(full);
      if (!kind) continue;
      const stat = await fs.stat(full).catch(() => undefined);
      artifacts.push({
        path: full,
        kind,
        ...(stat ? { bytes: stat.size } : {})
      });
    }
  };
  await visit(root, 0);
  return artifacts.sort((left, right) => left.path.localeCompare(right.path));
}
