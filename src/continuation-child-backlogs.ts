import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createSwarmBacklog,
  type FrontierSwarmBacklog,
  type FrontierSwarmBacklogInput
} from '@shapeshift-labs/frontier-swarm';
import { findFilesByName, pathExists, uniqueStrings } from './common.js';
import type { FrontierCodexContinuationInput } from './types-continuation.js';

const DEFAULT_CHILD_BACKLOG_NAMES = ['proof-route-backlog.json', 'proof-parent-recheck-backlog.json', 'backlog-children.json', 'child-backlog.json', 'children-backlog.json'];

export async function readContinuationChildBacklogs(input: {
  roots: readonly string[];
  names?: readonly string[];
}): Promise<Array<{ path: string; backlog: FrontierSwarmBacklog }>> {
  const names = input.names?.length ? [...input.names] : DEFAULT_CHILD_BACKLOG_NAMES;
  const paths = new Set<string>();
  for (const root of input.roots) {
    if (!await pathExists(root)) continue;
    for (const name of names) {
      for (const file of await findFilesByName(root, name)) paths.add(file);
    }
  }
  const out: Array<{ path: string; backlog: FrontierSwarmBacklog }> = [];
  for (const file of Array.from(paths).sort()) {
    try {
      const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
      out.push({ path: file, backlog: createSwarmBacklog(parsed as FrontierSwarmBacklogInput) });
    } catch {
      // Ignore unrelated JSON files with the same conventional name.
    }
  }
  return out;
}

export function resolveContinuationChildBacklogNames(input: FrontierCodexContinuationInput): string[] {
  const explicitNames = normalizeChildBacklogNames(input.childBacklogNames);
  if (explicitNames.length) return explicitNames;
  const plannedNames = normalizeChildBacklogNames(input.backlogPlan?.childArtifactPath ? [input.backlogPlan.childArtifactPath] : []);
  return uniqueStrings([...plannedNames, ...DEFAULT_CHILD_BACKLOG_NAMES]);
}

function normalizeChildBacklogNames(values: readonly string[] | undefined): string[] {
  return uniqueStrings((values ?? []).map(childBacklogFileName).filter((entry): entry is string => !!entry));
}

function childBacklogFileName(value: string): string | undefined {
  const normalized = value.trim().replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0')) return undefined;
  const basename = path.posix.basename(normalized);
  if (!basename || basename === '.' || basename === '..') return undefined;
  return basename;
}
